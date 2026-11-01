// Library card covers and format tiles (design v3). The podcast and reel covers stay for when those formats ship.
import type { Learn } from '../types';
import type { LearnState } from './learner';

export type CoverKind = 'pod' | 'reel' | 'avatar' | 'game' | 'book' | 'class' | 'elearn' | 'mentor' | 'web' | 'cert';
type Bar = { bg: string; anim: string };

const KIND: Record<string, CoverKind> = { Podcast: 'pod', Reel: 'reel', Avatar: 'avatar', Game: 'game', Book: 'book', Classroom: 'class', 'E-learning': 'elearn', Mentoring: 'mentor', Website: 'web', Certification: 'cert' };
const DARK = ['Podcast', 'Reel', 'Avatar', 'Game', 'Certification'];

// Study time: "40 min" under an hour, otherwise hours.
export function lengthLabel(row: Learn) {
  const hours = row[6];
  return hours < 1 ? Math.round(hours * 60) + ' min' : (hours % 1 ? hours.toFixed(1) : hours) + ' h';
}

// The design's cover(r, i): an animated illustration per format, seeded from the id and title so it never jumps.
export function cover(row: Learn, index: number, state: LearnState, pct0: number) {
  const [id, title, , lvl, format, source, hours] = row;
  let h = 0; for (const ch of id + title) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  const rnd = (k: number) => ((h * (k + 7) * 2654435761) % 1000) / 1000;
  const dark = DARK.includes(format), kind = KIND[format] || 'elearn';
  const done = state === 'accepted' || state === 'submitted', pct = done ? 100 : pct0 || 0;
  const mods = Math.max(3, Math.min(8, Math.round(hours))), fill = Math.round(pct / 100 * mods);
  const o = {
    kind, cardDelay: Math.min(index, 12) * 30 + 'ms', cvDelay: (rnd(1) * 4).toFixed(2) + 's',
    cvBg: dark ? '#171a16' : '#f3f5f0', cvFg: dark ? '#fff' : '#1a1d18', cvLine: dark ? '#171a16' : '#eef0ea', cvDone: done,
    cvTag: format + ' · ' + lengthLabel(row), cvMeta: '',
    eq: [] as { h: string; d: string; dur: string; c: string }[], tiles: [] as { bg: string; d: string }[], lvDots: [] as { bg: string }[], seats: [] as Bar[], segs: [] as Bar[],
  };
  if (kind === 'pod') o.eq = Array.from({ length: 18 }, (_, k) => ({ h: Math.round(14 + rnd(k) * 30) + 'px', d: (-rnd(k + 40) * 1.2).toFixed(2) + 's', dur: (0.9 + rnd(k + 80) * 0.7).toFixed(2) + 's', c: k / 18 < pct / 100 ? '#86BC25' : 'rgba(255,255,255,.32)' }));
  if (kind === 'game') {
    const hot = Math.floor(rnd(3) * 10);
    o.tiles = Array.from({ length: 10 }, (_, k) => ({ bg: k === hot ? '#86BC25' : k < Math.round(pct / 10) ? 'rgba(134,188,37,.4)' : 'rgba(255,255,255,.1)', d: (k * 0.45).toFixed(2) + 's' }));
    o.lvDots = [1, 2, 3, 4, 5].map((k) => ({ bg: k <= lvl ? '#86BC25' : 'rgba(255,255,255,.18)' }));
  }
  if (kind === 'book') o.cvMeta = source + ' · ~' + Math.round(hours * 32) + ' pages';
  if (kind === 'class') {
    const taken = 14 + Math.floor(rnd(5) * 12), me = Math.floor(rnd(6) * 30);
    o.seats = Array.from({ length: 30 }, (_, k) => ({ bg: k === me ? '#86BC25' : k < taken ? '#1a1d18' : '#d5dacf', anim: k === me ? 'pmDot 2.4s ease-in-out infinite' : 'none' }));
    o.cvMeta = 'Brussels · ' + (30 - taken) + ' seats left';
  }
  if (kind === 'elearn') {
    o.segs = Array.from({ length: mods }, (_, k) => ({ bg: k < fill ? '#1a1d18' : k === fill && !done ? '#86BC25' : '#d5dacf', anim: k === fill && !done ? 'pmBlink 1.8s ease-in-out infinite' : 'none' }));
    o.cvMeta = done ? mods + ' of ' + mods + ' modules' : 'Module ' + Math.min(mods, fill + 1) + ' of ' + mods;
  }
  if (kind === 'mentor') o.cvMeta = source.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return o;
}
export type Cover = ReturnType<typeof cover>;

// One tile per format plus "All"; the swatch is the format's cover colour. Picking the chosen format again clears it.
export function formatTiles(rows: Learn[], selected: string, pick: (format: string) => void) {
  const formats = Array.from(new Set(rows.map((r) => r[4])));
  const tile = (key: string, label: string, n: number, sw: string) => {
    const on = key === selected;
    return { key, label, on, count: n + (n === 1 ? ' learning' : ' learnings'), sw, swBd: on ? 'rgba(255,255,255,.4)' : '#d5dacf',
      bg: on ? '#1a1d18' : '#fff', fg: on ? '#fff' : '#1a1d18', bd: on ? '#1a1d18' : '#e1e5dc', pick: () => pick(on ? 'all' : key) };
  };
  return [tile('all', 'All formats', rows.length, '#86BC25')].concat(formats.map((f) => tile(f, f, rows.filter((r) => r[4] === f).length, DARK.includes(f) ? '#171a16' : '#f3f5f0')));
}
