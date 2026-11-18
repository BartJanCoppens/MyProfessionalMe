// The browser compositor with fakes (jsdom has no MediaRecorder, canvas capture or WebAudio): what it asks the recorder for,
// how it schedules the voice clips, and every way a cut stops. The real browsers are checked by hand (see the task report).
import { describe, expect, it, vi } from 'vitest';
import { renderCut } from './compositor';
import type { RecorderEnv } from './compositor';
import { CUT_BITRATE, CutError, VIDEO_MAX_BYTES } from './cutRules';
import type { Cut } from './cutRules';

const MB = 1024 * 1024;
type Opts = { bytes?: number; supported?: string[]; noRecorder?: boolean; missing?: string[]; hiddenAt?: number; undecodable?: boolean; closeThrows?: boolean; recorderError?: boolean };

function fake(o: Opts = {}) {
  const log = { recorders: [] as { opts: Record<string, unknown>; slice?: number; stopped: boolean }[], starts: [] as number[], gains: [] as number[], oscillators: 0, closed: false, fetched: [] as string[], unload: 0, unloadOff: 0, trackStops: 0, contexts: 0, order: [] as string[], lastRaf: null as null | (() => void) };
  let time = 0;
  const listeners: Record<string, (() => void)[]> = {};
  const doc = { hidden: false, addEventListener: (n: string, f: () => void) => { (listeners[n] ||= []).push(f); }, removeEventListener: (n: string, f: () => void) => { listeners[n] = (listeners[n] || []).filter((x) => x !== f); } };
  class Recorder {
    static isTypeSupported = (m: string) => (o.supported ?? ['video/mp4;codecs=avc1,mp4a']).includes(m);
    ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; onerror: (() => void) | null = null; state = 'inactive';
    private rec: (typeof log.recorders)[number];
    constructor(_s: unknown, opts: Record<string, unknown>) { this.rec = { opts, stopped: false }; log.recorders.push(this.rec); }
    start(slice: number) { this.rec.slice = slice; this.state = 'recording'; log.order.push('rec.start'); if (o.recorderError) queueMicrotask(() => this.onerror?.()); }
    stop() { this.rec.stopped = true; this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(o.bytes ?? 1000)]) }); this.onstop?.(); }
  }
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  class Audio {
    constructor() { log.contexts++; }
    get currentTime() { return time / 1000; }
    decodeAudioData = async () => { if (o.undecodable) throw new Error('bad'); return { duration: 2 }; };
    createMediaStreamDestination = () => ({ ...node(), stream: { getAudioTracks: () => [{ stop: vi.fn() }] } });
    createBufferSource = () => ({ ...node(), buffer: null as unknown, start: (at: number) => { log.starts.push(at); log.order.push('src.start'); }, stop: vi.fn() });
    createGain = () => { const g = { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }; return { ...node(), gain: new Proxy(g, { set: (t, k, v) => { if (k === 'value') log.gains.push(v); return Reflect.set(t, k, v); } }) }; };
    createOscillator = () => { log.oscillators++; return { ...node(), type: 'sine', frequency: { value: 0 }, start: vi.fn(), stop: vi.fn() }; };
    close = async () => { log.closed = true; if (o.closeThrows) throw new Error('already closed'); };
  }
  const env: RecorderEnv = {
    MediaRecorder: o.noRecorder ? undefined : (Recorder as unknown as RecorderEnv['MediaRecorder']),
    AudioContext: Audio as unknown as RecorderEnv['AudioContext'],
    createCanvas: () => ({ getContext: () => ({}), captureStream: () => { const tracks = [{ stop: () => { log.trackStops++; } }]; return { getVideoTracks: () => tracks, getTracks: () => tracks, addTrack: (t: { stop: () => void }) => { tracks.push(t as never); } }; } }),
    fetch: async (url: string) => { log.fetched.push(url); return { ok: !(o.missing ?? []).includes(url), arrayBuffer: async () => new ArrayBuffer(8) }; },
    raf: (cb) => { log.lastRaf = cb; time += 100; if (o.hiddenAt !== undefined && time >= o.hiddenAt && !doc.hidden) { doc.hidden = true; (listeners.visibilitychange || []).forEach((f) => f()); } queueMicrotask(cb); return 0; },
    document: doc,
    window: { addEventListener: () => { log.unload++; }, removeEventListener: () => { log.unloadOff++; } },
  };
  return { env, log, doc, listeners };
}

const cut = (p: Partial<Cut> = {}): Cut => ({ size: { w: 720, h: 1280 }, seconds: 10, audio: [], music: 'None', draw: vi.fn(), ...p });
const go = (c: Cut, env: RecorderEnv, signal = new AbortController().signal, onProgress = vi.fn()) => renderCut(c, { onProgress, signal, env });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: CutError) => e);

describe('renderCut', () => {
  it('records at the bitrate of the size, in slices of 500 ms, and the audio at 128 kbit/s', async () => {
    const a = fake(); await go(cut(), a.env);
    expect(a.log.recorders[0].opts).toMatchObject({ videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000, mimeType: 'video/mp4;codecs=avc1,mp4a' });
    expect(a.log.recorders[0].slice).toBe(500);
    const b = fake(); await go(cut({ size: { w: 1080, h: 1080 } }), b.env);
    expect(b.log.recorders[0].opts.videoBitsPerSecond).toBe(3_000_000);
    expect(CUT_BITRATE['1280x720']).toBe(1_000_000);
  });
  it('starts each voice clip at its time and returns the blob with the format it was recorded in', async () => {
    const a = fake(), r = await go(cut({ audio: [{ url: 'a', at: 0 }, { url: 'b', at: 4.3 }] }), a.env);
    expect(a.log.starts).toEqual([0, 4.3]);
    expect(r).toMatchObject({ mime: 'video/mp4;codecs=avc1,mp4a', ext: 'mp4', seconds: 10 });
    expect(r.blob.type).toBe('video/mp4');
  });
  it('draws the frame at each time and ends the progress at 100', async () => {
    const a = fake(), c = cut(), onProgress = vi.fn();
    await go(c, a.env, undefined, onProgress);
    expect(c.draw).toHaveBeenCalledWith(expect.anything(), 0);
    expect(onProgress).toHaveBeenLastCalledWith(100);
    const seen = onProgress.mock.calls.map((x) => x[0]);
    expect(seen).toEqual([...seen].sort((x, y) => x - y));
    expect(a.log.closed).toBe(true);
  });
  it('plays music under a voice at 0.15 and with text only at 0.35', async () => {
    const v = fake(); await go(cut({ music: 'Calm', audio: [{ url: 'a', at: 0 }] }), v.env);
    expect(v.log.gains).toContain(0.15); expect(v.log.oscillators).toBeGreaterThan(0);
    const t = fake(); await go(cut({ music: 'Calm' }), t.env);
    expect(t.log.gains).toContain(0.35);
    const n = fake(); await go(cut(), n.env);
    expect(n.log.oscillators).toBe(0);
  });
  it('asks before the tab is closed while it renders', async () => {
    const a = fake(); await go(cut(), a.env);
    expect(a.log.unload).toBe(1);
  });
});

describe('what stops a cut', () => {
  it('refuses a browser without MediaRecorder, or with no format, before fetching anything', async () => {
    const a = fake({ noRecorder: true }), e = await refusal(go(cut({ audio: [{ url: 'a', at: 0 }] }), a.env));
    expect(e).toBeInstanceOf(CutError); expect(e?.code).toBe('CUT_UNSUPPORTED');
    expect(e?.message).toBe('This browser cannot record video · use a recent Chrome, Edge, Firefox or Safari');
    expect(a.log.fetched).toEqual([]);
    expect((await refusal(go(cut(), fake({ supported: [] }).env)))?.code).toBe('CUT_UNSUPPORTED');
  });
  it('stops when the tab is hidden at 40 %, stops the recorder, closes the audio and saves nothing', async () => {
    const a = fake({ hiddenAt: 4000 }), e = await refusal(go(cut(), a.env));
    expect(e?.code).toBe('CUT_HIDDEN');
    expect(e?.message).toBe('The tab was hidden, so the cut stopped · keep this tab in front while it renders · nothing was saved');
    expect(a.log.recorders[0].stopped).toBe(true); expect(a.log.closed).toBe(true);
  });
  it('stops on Cancel', async () => {
    const a = fake(), ctl = new AbortController(), c = cut({ draw: vi.fn((_c, t: number) => { if (t >= 3) ctl.abort(); }) });
    const e = await refusal(go(c, a.env, ctl.signal));
    expect(e?.code).toBe('CUT_CANCELLED'); expect(e?.message).toBe('Cancelled · nothing was saved');
    expect(a.log.recorders[0].stopped).toBe(true); expect(a.log.closed).toBe(true);
  });
  it('does not start when it is already cancelled', async () => {
    const ctl = new AbortController(); ctl.abort();
    const a = fake(); expect((await refusal(go(cut(), a.env, ctl.signal)))?.code).toBe('CUT_CANCELLED');
    expect(a.log.recorders).toEqual([]);
  });
  it('says so when a voice clip cannot be loaded or decoded', async () => {
    const e = await refusal(go(cut({ audio: [{ url: 'gone', at: 0 }] }), fake({ missing: ['gone'] }).env));
    expect(e?.code).toBe('CUT_AUDIO'); expect(e?.message).toBe('A voice clip could not be loaded · voice the scene again');
    expect((await refusal(go(cut({ audio: [{ url: 'x', at: 0 }] }), fake({ undecodable: true }).env)))?.code).toBe('CUT_AUDIO');
  });
  it('refuses a stored video over 50 MB as a backstop, with its size', async () => {
    const e = await refusal(go(cut({ maxBytes: VIDEO_MAX_BYTES }), fake({ bytes: 51 * MB }).env));
    expect(e?.code).toBe('CUT_TOO_LARGE'); expect(e?.message).toBe('The video came out at 51.0 MB · at most 50 MB · make it shorter');
  });
});

describe('the size cap is for stored cuts only', () => {
  it('refuses a stored cut that cannot fit up front, before fetching or recording anything', async () => {
    const a = fake(), e = await refusal(go(cut({ size: { w: 1080, h: 1080 }, seconds: 150, maxBytes: VIDEO_MAX_BYTES, audio: [{ url: 'a', at: 0 }] }), a.env));
    expect(e?.code).toBe('CUT_TOO_LARGE'); expect(e?.message).toMatch(/^This video would come out at about 55\.9 MB · at most 50 MB/);
    expect(a.log.fetched).toEqual([]); expect(a.log.recorders).toEqual([]); expect(a.log.closed).toBe(true);
  });
  it('never refuses a download (no cap) however large it comes out', async () => {
    const r = await go(cut(), fake({ bytes: 51 * MB }).env);
    expect(r.blob.size).toBe(51 * MB);
  });
});

describe('one clock and a failed run', () => {
  it('starts the recorder before it schedules any clip, and times the frames on the audio clock', async () => {
    const a = fake(), c = cut({ audio: [{ url: 'a', at: 0 }] }), times: number[] = [];
    c.draw = vi.fn((_c, t: number) => { times.push(t); });
    await go(c, a.env);
    expect(a.log.order.indexOf('rec.start')).toBeLessThan(a.log.order.indexOf('src.start'));
    expect(times[0]).toBe(0); expect(times[times.length - 1]).toBe(10);
  });
  it('ignores a frame that runs after the cut failed, so a late tick never reports progress', async () => {
    const a = fake({ hiddenAt: 4000 }), onProgress = vi.fn();
    const e = await refusal(go(cut(), a.env, undefined, onProgress));
    expect(e?.code).toBe('CUT_HIDDEN');
    const calls = onProgress.mock.calls.length;
    a.doc.hidden = false; a.log.lastRaf?.();
    expect(onProgress.mock.calls.length).toBe(calls);
    expect(onProgress).not.toHaveBeenCalledWith(100);
  });
  it('fails the run when the recorder errors, instead of waiting for ever', async () => {
    const e = await refusal(go(cut(), fake({ recorderError: true }).env));
    expect(e?.code).toBe('CUT_RECORDER'); expect(e?.message).toBe('The browser stopped recording · try again');
  });
  it('is not masked by a clean-up that throws', async () => {
    expect((await refusal(go(cut(), fake({ hiddenAt: 4000, closeThrows: true }).env)))?.code).toBe('CUT_HIDDEN');
  });
  it('uses the audio context opened in the click when it is given one, and closes it', async () => {
    const a = fake(), ctx = new a.env.AudioContext!(), before = a.log.contexts;
    await renderCut(cut(), { onProgress: vi.fn(), signal: new AbortController().signal, env: a.env, context: ctx });
    expect(a.log.contexts).toBe(before); expect(a.log.closed).toBe(true);
  });
});

describe('clean-up on every way out', () => {
  it('stops the tracks and removes both listeners after a success and after a stop', async () => {
    const ok = fake(); await go(cut(), ok.env);
    expect(ok.log.trackStops).toBeGreaterThan(0); expect(ok.log.unloadOff).toBe(1); expect(ok.listeners.visibilitychange).toEqual([]);
    const hid = fake({ hiddenAt: 4000 }); await refusal(go(cut(), hid.env));
    expect(hid.log.trackStops).toBeGreaterThan(0); expect(hid.log.unloadOff).toBe(1); expect(hid.listeners.visibilitychange).toEqual([]);
  });
});
