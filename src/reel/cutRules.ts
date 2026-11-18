// What a cut is and the decisions the browser compositor (compositor.ts) takes, as pure data and functions so they are tested
// without a browser: the sizes and bitrates (90 s is about 28 MB at 720x1280 and 34 MB at 1080x1080, a third under the cap), the
// refusals in words, what each frame tick does (keep going, finish, a hidden tab, a cancel), the 50 MB cap (for a cut that is
// stored, checked before rendering from the bitrates and again on the finished file), the one audio clock the clips and the
// music are scheduled on, and the time left shown while it renders.
import { fmtTime } from '../logic/media';
import { musicNotes } from './music';
import type { MusicKind, Note } from './music';

export const SLIDES_SIZE = { w: 1280, h: 720 }; // the reel sizes are in logic/videoItem.ts (SIZE_OF, dimensions)
export const CUT_BITRATE: Record<string, number> = { '720x1280': 2_500_000, '1080x1080': 3_000_000, '1280x720': 1_000_000 };
export const AUDIO_BITRATE = 128_000;
export const CUT_FPS = 30;
export const TIMESLICE_MS = 500;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // the media bucket's limit

export type CutSize = { w: number; h: number };
// audio: each voice clip's signed link and its start in seconds; draw: one frame at t (reel frames and slide frames both come
// through here, so there is one compositor); maxBytes: set for a cut that will be stored (the media bucket's limit), never for a download.
export type Cut = { size: CutSize; seconds: number; audio: { url: string; at: number }[]; music: MusicKind; draw: (ctx: CanvasRenderingContext2D, t: number) => void; maxBytes?: number };

export const bitrateOf = (s: CutSize): number => CUT_BITRATE[s.w + 'x' + s.h] ?? 2_500_000;

const REFUSALS = {
  CUT_UNSUPPORTED: 'This browser cannot record video · use a recent Chrome, Edge, Firefox or Safari',
  CUT_HIDDEN: 'The tab was hidden, so the cut stopped · keep this tab in front while it renders · nothing was saved',
  CUT_CANCELLED: 'Cancelled · nothing was saved',
  CUT_AUDIO: 'A voice clip could not be loaded · voice the scene again',
  CUT_BLOCKED: 'The browser blocked audio · press the button again',
  CUT_RECORDER: 'The browser stopped recording · try again',
};
export type CutCode = keyof typeof REFUSALS | 'CUT_TOO_LARGE';

export class CutError extends Error {
  code: CutCode;
  constructor(code: CutCode, message?: string) { super(message ?? REFUSALS[code as keyof typeof REFUSALS]); this.code = code; }
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const over = (lead: string, bytes: number, max: number) => lead + mb(bytes) + ' MB · at most ' + mb(max).replace(/\.0$/, '') + ' MB · make it shorter';
// Why a finished video cannot be kept, in words; null when it fits the bucket.
export const sizeProblem = (bytes: number, max = VIDEO_MAX_BYTES): string | null => (bytes > max ? over('The video came out at ', bytes, max) : null);

// What a cut will weigh at its target bitrates (video plus audio), in bytes.
export const estimateBytes = (size: CutSize, seconds: number): number => (seconds * (bitrateOf(size) + AUDIO_BITRATE)) / 8;
// Why a stored cut will not fit, before anything renders; null for one that fits and for a download (no cap).
export const estimateProblem = (cut: Cut): string | null => {
  const bytes = estimateBytes(cut.size, cut.seconds);
  return cut.maxBytes && bytes > cut.maxBytes ? over('This video would come out at about ', bytes, cut.maxBytes) : null;
};

// Every clip and note at an absolute time on the audio context's clock (`base` is its time when the cut starts), and the music's
// level: 0.15 under a voice, 0.35 with text only. The frames are timed on the same clock, so picture and sound cannot drift apart.
export function audioSchedule(cut: Cut, base: number): { clips: number[]; notes: Note[]; musicGain: number } {
  return { clips: cut.audio.map((c) => base + c.at), notes: musicNotes(cut.music, cut.seconds).map((n) => ({ ...n, at: base + n.at })), musicGain: cut.audio.length ? 0.15 : 0.35 };
}

// What a frame tick does: a cancel and a hidden tab stop it before anything else (a hidden tab's frames would freeze).
export function cutStep(s: { t: number; seconds: number; hidden: boolean; aborted: boolean }): 'go' | 'done' | 'hidden' | 'cancelled' {
  if (s.aborted) return 'cancelled';
  if (s.hidden) return 'hidden';
  return s.t >= s.seconds ? 'done' : 'go';
}

// The length still to run at `pct` percent, as m:ss (it renders at about real time).
export const timeLeft = (seconds: number, pct: number): string => fmtTime(Math.max(0, Math.round(seconds * (1 - pct / 100))));
