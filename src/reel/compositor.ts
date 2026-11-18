// The browser compositor (studios plan, Task 5.4), ported from Socials Reel Studio's FinalCut: a canvas drawn once a frame, the
// voice clips and the music through WebAudio, both recorded by MediaRecorder at about real time. One renderCut serves the
// Reel Studio and the Slides video; what it draws is the caller's `cut.draw`. The decisions are in cutRules.ts, recorderMime.ts
// and music.ts (pure, tested); this file is the thin shell over the browser APIs. The browser is injected (RecorderEnv) so tests
// run with fakes; real Chrome, Safari and Firefox are checked by hand.
import { extOf, pickRecorderMime } from '../logic/recorderMime';
import { AUDIO_BITRATE, CUT_FPS, CutError, TIMESLICE_MS, audioSchedule, bitrateOf, cutStep, estimateProblem, sizeProblem } from './cutRules';
import type { Cut } from './cutRules';

// The parts of the browser APIs that are used (not the DOM types, so a fake can stand in).
type Track = { stop: () => void };
type Stream = { getVideoTracks: () => Track[]; getTracks: () => Track[]; addTrack: (t: Track) => void };
type Node = { connect: (n: unknown) => void };
type Param = { value: number; setValueAtTime: (v: number, t: number) => void; linearRampToValueAtTime: (v: number, t: number) => void };
type Gain = Node & { gain: Param };
type Source = Node & { buffer: unknown; start: (at: number) => void };
type Oscillator = Node & { type: string; frequency: { value: number }; start: (at: number) => void; stop: (at: number) => void };
export type AudioLike = {
  currentTime: number; decodeAudioData: (b: ArrayBuffer) => Promise<unknown>; close: () => Promise<void>; resume?: () => Promise<void>;
  createMediaStreamDestination: () => Node & { stream: { getAudioTracks: () => Track[] } };
  createBufferSource: () => Source; createGain: () => Gain; createOscillator: () => Oscillator;
};
type Recorder = { ondataavailable: ((e: { data: Blob }) => void) | null; onstop: (() => void) | null; onerror: (() => void) | null; state: string; start: (slice: number) => void; stop: () => void };
type Target = { addEventListener: (n: string, f: () => void) => void; removeEventListener: (n: string, f: () => void) => void };
export type RecorderEnv = {
  MediaRecorder?: { new (s: Stream, o: Record<string, unknown>): Recorder; isTypeSupported: (m: string) => boolean };
  AudioContext?: new () => AudioLike;
  createCanvas: (w: number, h: number) => { getContext: (k: '2d') => unknown; captureStream: (fps: number) => Stream };
  fetch: (url: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>;
  raf: (cb: () => void) => unknown;
  document: Target & { hidden: boolean }; window: Target;
};
export type CutResult = { blob: Blob; mime: string; ext: 'mp4' | 'webm'; seconds: number };
// context: the audio context opened in the click (prepareAudio); renderCut closes it, given or not.
export type RenderOptions = { onProgress: (pct: number) => void; signal: AbortSignal; env?: RecorderEnv; context?: AudioLike };

// The real browser (not run by the tests).
const browserEnv = (): RecorderEnv => ({
  MediaRecorder: (globalThis as unknown as { MediaRecorder?: RecorderEnv['MediaRecorder'] }).MediaRecorder,
  AudioContext: (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as unknown as RecorderEnv['AudioContext'],
  createCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) as never,
  fetch: (url) => fetch(url), raf: (cb) => requestAnimationFrame(cb), document, window,
});

async function loadClips(cut: Cut, ac: AudioLike, env: RecorderEnv): Promise<unknown[]> {
  try {
    return await Promise.all(cut.audio.map(async (c) => {
      const res = await env.fetch(c.url);
      if (!res.ok) throw new Error('missing');
      return ac.decodeAudioData(await res.arrayBuffer());
    }));
  } catch { throw new CutError('CUT_AUDIO'); }
}

// The voice clips and the music into `dest`, on the schedule of audioSchedule.
function scheduleAudio(ac: AudioLike, dest: Node, cut: Cut, clips: unknown[], base: number) {
  const plan = audioSchedule(cut, base);
  plan.clips.forEach((at, k) => { const src = ac.createBufferSource(); src.buffer = clips[k]; src.connect(dest); src.start(at); });
  const master = ac.createGain();
  master.gain.value = plan.musicGain;
  master.connect(dest);
  for (const n of plan.notes) {
    const osc = ac.createOscillator(), env = ac.createGain();
    osc.type = 'sine'; osc.frequency.value = n.freq;
    env.gain.setValueAtTime(0, n.at); env.gain.linearRampToValueAtTime(1, n.at + Math.min(0.1, n.dur / 2)); env.gain.linearRampToValueAtTime(0, n.at + n.dur);
    osc.connect(env); env.connect(master); osc.start(n.at); osc.stop(n.at + n.dur);
  }
}

// Stops the cut at once on a hidden tab, a cancel or a recorder error (the frame loop cannot: rAF stops in a hidden tab), and asks
// before the tab is closed.
function guard(env: RecorderEnv, signal: AbortSignal) {
  let fail: (e: CutError) => void = () => {};
  const stopped = new Promise<never>((_, reject) => { fail = reject; });
  stopped.catch(() => {});
  const onHidden = () => { if (env.document.hidden) fail(new CutError('CUT_HIDDEN')); };
  const onAbort = () => fail(new CutError('CUT_CANCELLED'));
  const onUnload = ((e: Event) => { e.preventDefault?.(); (e as unknown as { returnValue: string }).returnValue = ''; }) as () => void;
  env.document.addEventListener('visibilitychange', onHidden);
  env.window.addEventListener('beforeunload', onUnload);
  signal.addEventListener('abort', onAbort);
  return { stopped, fail, off: () => { env.document.removeEventListener('visibilitychange', onHidden); env.window.removeEventListener('beforeunload', onUnload); signal.removeEventListener('abort', onAbort); } };
}

// Draws a frame a tick, timed on the audio clock, until the length is reached; resolves then, or rejects on a hidden tab or a
// cancel. `live` is switched off when the run is over, so a tick that comes late (a tab shown again) draws and reports nothing.
function playFrames(cut: Cut, ctx: unknown, env: RecorderEnv, ac: AudioLike, base: number, signal: AbortSignal, live: { on: boolean }, onProgress: (pct: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (!live.on) return;
      const t = Math.max(0, ac.currentTime - base), step = cutStep({ t, seconds: cut.seconds, hidden: env.document.hidden, aborted: signal.aborted });
      if (step === 'hidden' || step === 'cancelled') return reject(new CutError(step === 'hidden' ? 'CUT_HIDDEN' : 'CUT_CANCELLED'));
      cut.draw(ctx as CanvasRenderingContext2D, Math.min(t, cut.seconds));
      onProgress(step === 'done' ? 100 : Math.min(99, Math.floor((t / cut.seconds) * 100)));
      if (step === 'done') return resolve();
      env.raf(tick);
    };
    tick();
  });
}

// A clean-up step that fails must not hide why the run ended.
const quietly = async (f: () => unknown) => { try { await f(); } catch { /* ignored on purpose */ } };

// Opens the audio context. Call it first thing in the click that starts a cut, before any await: Safari lets a context start
// only from a user gesture. Pass it to renderCut as `context`. Undefined where the browser has none (renderCut then refuses).
export function prepareAudio(env: Pick<RecorderEnv, 'AudioContext'> = browserEnv()): AudioLike | undefined {
  const ac = env.AudioContext && new env.AudioContext();
  void ac?.resume?.();
  return ac;
}

async function record(cut: Cut, o: RenderOptions, env: RecorderEnv, ac: AudioLike | null): Promise<CutResult> {
  const Rec = env.MediaRecorder, mime = pickRecorderMime(Rec && ((m) => Rec.isTypeSupported(m)));
  if (!Rec || !mime || !ac) throw new CutError('CUT_UNSUPPORTED');
  if (o.signal.aborted) throw new CutError('CUT_CANCELLED');
  const tooBig = estimateProblem(cut);
  if (tooBig) throw new CutError('CUT_TOO_LARGE', tooBig);
  const g = guard(env, o.signal), chunks: Blob[] = [], live = { on: true };
  let rec: Recorder | null = null, stream: Stream | null = null;
  try {
    const clips = await Promise.race([loadClips(cut, ac, env), g.stopped]);
    await ac.resume?.();
    const canvas = env.createCanvas(cut.size.w, cut.size.h), ctx = canvas.getContext('2d'), dest = ac.createMediaStreamDestination();
    stream = canvas.captureStream(CUT_FPS);
    dest.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
    cut.draw(ctx as CanvasRenderingContext2D, 0);
    rec = new Rec(stream, { mimeType: mime, videoBitsPerSecond: bitrateOf(cut.size), audioBitsPerSecond: AUDIO_BITRATE });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onerror = () => g.fail(new CutError('CUT_RECORDER'));
    const finished = new Promise<void>((r) => { rec!.onstop = () => r(); });
    rec.start(TIMESLICE_MS);
    const base = ac.currentTime; // the recorder is running before the first clip is scheduled, so none loses its start
    scheduleAudio(ac, dest, cut, clips, base);
    await Promise.race([playFrames(cut, ctx, env, ac, base, o.signal, live, o.onProgress), g.stopped]);
    rec.stop(); await Promise.race([finished, g.stopped]);
    const blob = new Blob(chunks, { type: mime.split(';')[0] }), problem = cut.maxBytes ? sizeProblem(blob.size, cut.maxBytes) : null;
    if (problem) throw new CutError('CUT_TOO_LARGE', problem);
    return { blob, mime, ext: extOf(mime), seconds: cut.seconds };
  } finally {
    live.on = false; g.off();
    const r = rec as Recorder | null;
    if (r && r.state !== 'inactive') { r.onstop = null; await quietly(() => r.stop()); }
    stream?.getTracks().forEach((t) => t.stop());
  }
}

export async function renderCut(cut: Cut, o: RenderOptions): Promise<CutResult> {
  const env = o.env ?? browserEnv(), ac = o.context ?? (env.AudioContext ? new env.AudioContext() : null);
  try { return await record(cut, o, env, ac); } finally { if (ac) await quietly(() => ac.close()); }
}
