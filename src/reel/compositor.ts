// The browser compositor (studios plan, Task 5.4), ported from Socials Reel Studio's FinalCut: a canvas drawn once a frame, the
// voice clips and the music through WebAudio, both recorded by MediaRecorder at about real time. One renderCut serves the
// Reel Studio and the Slides video; what it draws is the caller's `cut.draw`. The decisions are in cutRules.ts, recorderMime.ts
// and music.ts (pure, tested); this file is the thin shell over the browser APIs. The browser is injected (RecorderEnv) so tests
// run with fakes; real Chrome, Safari and Firefox are checked by hand.
import { extOf, pickRecorderMime } from '../logic/recorderMime';
import { AUDIO_BITRATE, CUT_FPS, CutError, TIMESLICE_MS, bitrateOf, cutStep, sizeProblem } from './cutRules';
import type { Cut } from './cutRules';
import { musicNotes } from './music';

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
type Recorder = { ondataavailable: ((e: { data: Blob }) => void) | null; onstop: (() => void) | null; state: string; start: (slice: number) => void; stop: () => void };
type Target = { addEventListener: (n: string, f: () => void) => void; removeEventListener: (n: string, f: () => void) => void };
export type RecorderEnv = {
  MediaRecorder?: { new (s: Stream, o: Record<string, unknown>): Recorder; isTypeSupported: (m: string) => boolean };
  AudioContext?: new () => AudioLike;
  createCanvas: (w: number, h: number) => { getContext: (k: '2d') => unknown; captureStream: (fps: number) => Stream };
  fetch: (url: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>;
  raf: (cb: () => void) => unknown; now: () => number;
  document: Target & { hidden: boolean }; window: Target;
};
export type CutResult = { blob: Blob; mime: string; ext: 'mp4' | 'webm'; seconds: number };
export type RenderOptions = { onProgress: (pct: number) => void; signal: AbortSignal; env?: RecorderEnv };

// The real browser (not run by the tests).
const browserEnv = (): RecorderEnv => ({
  MediaRecorder: (globalThis as unknown as { MediaRecorder?: RecorderEnv['MediaRecorder'] }).MediaRecorder,
  AudioContext: (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as unknown as RecorderEnv['AudioContext'],
  createCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }) as never,
  fetch: (url) => fetch(url), raf: (cb) => requestAnimationFrame(cb), now: () => performance.now(), document, window,
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

// The voice clips at their times, and the music under them (0.15 under a voice, 0.35 with text only), all into `dest`.
function scheduleAudio(ac: AudioLike, dest: Node, cut: Cut, clips: unknown[], base: number) {
  cut.audio.forEach((c, k) => { const src = ac.createBufferSource(); src.buffer = clips[k]; src.connect(dest); src.start(base + c.at); });
  const master = ac.createGain();
  master.gain.value = cut.audio.length ? 0.15 : 0.35;
  master.connect(dest);
  for (const n of musicNotes(cut.music, cut.seconds)) {
    const osc = ac.createOscillator(), env = ac.createGain(), at = base + n.at;
    osc.type = 'sine'; osc.frequency.value = n.freq;
    env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(1, at + Math.min(0.1, n.dur / 2)); env.gain.linearRampToValueAtTime(0, at + n.dur);
    osc.connect(env); env.connect(master); osc.start(at); osc.stop(at + n.dur);
  }
}

// Stops the cut at once on a hidden tab or a cancel (the frame loop cannot: rAF stops in a hidden tab), and asks before the tab is closed.
function guard(env: RecorderEnv, signal: AbortSignal) {
  let stop: (e: CutError) => void = () => {};
  const stopped = new Promise<never>((_, reject) => { stop = reject; });
  stopped.catch(() => {});
  const onHidden = () => { if (env.document.hidden) stop(new CutError('CUT_HIDDEN')); };
  const onAbort = () => stop(new CutError('CUT_CANCELLED'));
  const onUnload = (e: unknown) => { (e as Event).preventDefault?.(); (e as { returnValue: string }).returnValue = ''; };
  env.document.addEventListener('visibilitychange', onHidden);
  env.window.addEventListener('beforeunload', onUnload as () => void);
  signal.addEventListener('abort', onAbort);
  return { stopped, off: () => { env.document.removeEventListener('visibilitychange', onHidden); env.window.removeEventListener('beforeunload', onUnload as () => void); signal.removeEventListener('abort', onAbort); } };
}

// Draws a frame a tick until the length is reached; resolves then, or rejects on a hidden tab or a cancel.
function playFrames(cut: Cut, ctx: unknown, env: RecorderEnv, signal: AbortSignal, onProgress: (pct: number) => void): Promise<void> {
  const t0 = env.now();
  return new Promise<void>((resolve, reject) => {
    const tick = () => {
      const t = (env.now() - t0) / 1000, step = cutStep({ t, seconds: cut.seconds, hidden: env.document.hidden, aborted: signal.aborted });
      if (step === 'hidden' || step === 'cancelled') return reject(new CutError(step === 'hidden' ? 'CUT_HIDDEN' : 'CUT_CANCELLED'));
      cut.draw(ctx as CanvasRenderingContext2D, Math.min(t, cut.seconds));
      onProgress(step === 'done' ? 100 : Math.min(99, Math.floor((t / cut.seconds) * 100)));
      if (step === 'done') return resolve();
      env.raf(tick);
    };
    tick();
  });
}

export async function renderCut(cut: Cut, o: RenderOptions): Promise<CutResult> {
  const env = o.env ?? browserEnv(), Rec = env.MediaRecorder, mime = pickRecorderMime(Rec && ((m) => Rec.isTypeSupported(m)));
  if (!Rec || !mime || !env.AudioContext) throw new CutError('CUT_UNSUPPORTED');
  if (o.signal.aborted) throw new CutError('CUT_CANCELLED');
  const ac = new env.AudioContext(), g = guard(env, o.signal), chunks: Blob[] = [];
  let rec: Recorder | null = null, stream: Stream | null = null;
  try {
    const clips = await Promise.race([loadClips(cut, ac, env), g.stopped]);
    await ac.resume?.();
    const canvas = env.createCanvas(cut.size.w, cut.size.h), ctx = canvas.getContext('2d'), dest = ac.createMediaStreamDestination();
    stream = canvas.captureStream(CUT_FPS);
    dest.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
    scheduleAudio(ac, dest, cut, clips, ac.currentTime);
    cut.draw(ctx as CanvasRenderingContext2D, 0);
    rec = new Rec(stream, { mimeType: mime, videoBitsPerSecond: bitrateOf(cut.size), audioBitsPerSecond: AUDIO_BITRATE });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise<void>((r) => { rec!.onstop = () => r(); });
    rec.start(TIMESLICE_MS);
    await Promise.race([playFrames(cut, ctx, env, o.signal, o.onProgress), g.stopped]);
    rec.stop(); await finished;
    const blob = new Blob(chunks, { type: mime.split(';')[0] }), problem = sizeProblem(blob.size);
    if (problem) throw new CutError('CUT_TOO_LARGE', problem);
    return { blob, mime, ext: extOf(mime), seconds: cut.seconds };
  } finally {
    g.off();
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); }
    stream?.getTracks().forEach((t) => t.stop());
    await ac.close();
  }
}
