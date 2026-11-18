// The reel viewer (design v3): playback position and what the viewer shows. Podcasts play on the step player (fmtPodcast.ts).
import { MEDIA } from '../data';
import type { MediaState, ReelMedia } from '../types';

export const TICK = 0.25; // seconds per tick

export const fmtTime = (x: number) => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');

// Where playback stands: the session position, else the start. A finished reel restarts.
export function startPos(M: ReelMedia, pos: number | undefined) {
  const p = pos ?? 0;
  return p >= M.dur ? 0 : p;
}
export const currentPos = (pos: number | undefined) => pos ?? 0;

// One tick of playback at 1x. Stops at the end.
export function step(m: MediaState, dt = TICK): MediaState {
  const id = m.playing; if (!id) return m;
  const M = MEDIA[id];
  const p = Math.min(M.dur, (m.pos[id] || 0) + dt);
  return { ...m, pos: { ...m.pos, [id]: p }, playing: p >= M.dur ? null : id };
}

export function reelView(M: ReelMedia, pos: number, on: boolean, answer: number | undefined, title: string) {
  const ci = Math.min(M.caps.length - 1, Math.floor(pos / M.dur * M.caps.length)), right = answer === M.a;
  return {
    sub: M.len + ' · vertical video · plays in the frame', by: M.by, playIcon: on ? '❚❚' : pos >= M.dur ? '↻' : '▶', w: (pos / M.dur * 100).toFixed(1) + '%',
    caption: pos > 0 ? M.caps[ci] : title, takeaway: M.take, q: M.q,
    opts: M.opts.map((o, k) => {
      const picked = answer === k, ok = k === M.a;
      return { label: o, right: ok, bd: picked ? (ok ? '#86BC25' : '#9a2b22') : '#d5dacf', bg: picked ? (ok ? '#fbfdf6' : '#fff6f5') : '#fff' };
    }),
    hasFb: answer != null, fb: right ? 'Right. The reel is complete.' : 'Not quite. Watch the reel again and try once more.', fbColor: right ? '#3f6a0a' : '#9a2b22',
  };
}
