// Podcast player and reel viewer (design v3): playback position, what the player shows, and when progress is saved.
import { MEDIA } from '../data';
import type { MediaState, PodMedia, ReelMedia } from '../types';
import type { LearnState } from './learner';

export const TICK = 0.25; // seconds per tick

export const fmtTime = (x: number) => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');

// Where playback stands: the session position, else a podcast resumes from saved progress. A finished item restarts.
export function startPos(M: PodMedia | ReelMedia, pos: number | undefined, pct: number) {
  const p = pos != null ? pos : M.kind === 'pod' ? (pct || 0) / 100 * M.dur : 0;
  return p >= M.dur ? 0 : p;
}
export function currentPos(M: PodMedia | ReelMedia, pos: number | undefined, pct: number) {
  return pos != null ? pos : M.kind === 'pod' ? (pct || 0) / 100 * M.dur : 0;
}

// One tick of playback: podcasts honour the speed, reels play at 1×. Stops at the end.
export function step(m: MediaState, dt = TICK): MediaState {
  const id = m.playing; if (!id) return m;
  const M = MEDIA[id];
  const p = Math.min(M.dur, (m.pos[id] || 0) + dt * (M.kind === 'pod' ? +m.speed : 1));
  return { ...m, pos: { ...m.pos, [id]: p }, playing: p >= M.dur ? null : id };
}

// Podcast progress to save, if any: once per tenth listened, and accepted with the full hours at 80%.
export function podSave(pos: number, dur: number, saved: { state: LearnState; pct: number } | undefined): { state: LearnState; pct: number } | null {
  if (saved?.state === 'accepted') return null;
  const pct = Math.floor(pos / dur * 100);
  if (pct >= 80) return { state: 'accepted', pct: 100 };
  return Math.floor(pct / 10) > Math.floor((saved?.pct || 0) / 10) ? { state: 'in-progress', pct } : null;
}

export function podView(M: PodMedia, pos: number, on: boolean) {
  const chI = M.ch.reduce((a, c, k) => (pos >= c[0] ? k : a), 0);
  return {
    playIcon: on ? '❚❚' : '▶', playTitle: on ? 'Pause' : 'Play', w: (pos / M.dur * 100).toFixed(1) + '%', time: fmtTime(pos), left: '−' + fmtTime(M.dur - pos),
    chapters: M.ch.map((c, k) => ({ at: c[0], t: fmtTime(c[0]), title: c[1], fw: k === chI ? 600 : 400 })),
    note: 'Listening to 80% completes it and adds the hours to your year. A transcript is available for every episode.',
  };
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
