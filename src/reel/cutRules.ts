// What a cut is and the decisions the browser compositor (compositor.ts) takes, as pure data and functions so they are tested
// without a browser: the sizes and bitrates (sized so 90 s stays near 30 MB), the refusals in words, what each frame tick does
// (keep going, finish, a hidden tab, a cancel), the 50 MB cap and the time left shown while it renders.
import type { MusicKind } from './music';

export const CUT_SIZES = { '9:16 vertical': { w: 720, h: 1280 }, '1:1 square': { w: 1080, h: 1080 }, slides: { w: 1280, h: 720 } };
export const CUT_BITRATE: Record<string, number> = { '720x1280': 2_500_000, '1080x1080': 3_000_000, '1280x720': 1_000_000 };
export const AUDIO_BITRATE = 128_000;
export const CUT_FPS = 30;
export const TIMESLICE_MS = 500;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // the media bucket's limit

export type CutSize = { w: number; h: number };
// audio: each voice clip's signed link and its start in seconds; draw: one frame at t (reel frames and slide frames both come
// through here, so there is one compositor).
export type Cut = { size: CutSize; seconds: number; audio: { url: string; at: number }[]; music: MusicKind; draw: (ctx: CanvasRenderingContext2D, t: number) => void };

export const bitrateOf = (s: CutSize): number => CUT_BITRATE[s.w + 'x' + s.h] ?? 2_500_000;

const REFUSALS = {
  CUT_UNSUPPORTED: 'This browser cannot record video · use a recent Chrome, Edge, Firefox or Safari',
  CUT_HIDDEN: 'The tab was hidden, so the cut stopped · keep this tab in front while it renders · nothing was saved',
  CUT_CANCELLED: 'Cancelled · nothing was saved',
  CUT_AUDIO: 'A voice clip could not be loaded · voice the scene again',
};
export type CutCode = keyof typeof REFUSALS | 'CUT_TOO_LARGE';

export class CutError extends Error {
  code: CutCode;
  constructor(code: CutCode, message?: string) { super(message ?? REFUSALS[code as keyof typeof REFUSALS]); this.code = code; }
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
// Why a finished video cannot be kept, in words; null when it fits the bucket.
export const sizeProblem = (bytes: number): string | null =>
  bytes > VIDEO_MAX_BYTES ? 'The video came out at ' + mb(bytes) + ' MB · at most ' + mb(VIDEO_MAX_BYTES).replace(/\.0$/, '') + ' MB · make it shorter' : null;

// What a frame tick does: a cancel and a hidden tab stop it before anything else (a hidden tab's frames would freeze).
export function cutStep(s: { t: number; seconds: number; hidden: boolean; aborted: boolean }): 'go' | 'done' | 'hidden' | 'cancelled' {
  if (s.aborted) return 'cancelled';
  if (s.hidden) return 'hidden';
  return s.t >= s.seconds ? 'done' : 'go';
}

// The length still to run at `pct` percent, as m:ss (it renders at about real time).
export function timeLeft(seconds: number, pct: number): string {
  const left = Math.max(0, Math.round(seconds * (1 - pct / 100)));
  return Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
}
