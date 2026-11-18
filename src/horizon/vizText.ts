// Labels that never overlap, and the small SVG helpers the typed charts share (studios plan, Task 3.3), copied from
// Horizon's viz.tsx. Text width is measured with an OffscreenCanvas where the browser has one (no element is added to
// the page), and estimated otherwise.
import { createElement as h } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/** Slide-theme-aware colours (the --s-* variables slideTheme.ts sets), each with Horizon's Nocturne fallback. */
export const C = {
  acc: 'var(--s-acc, var(--color-accent))', a3: 'var(--s-light, var(--color-accent-300))', a7: 'var(--s-acc2, var(--color-accent-700))',
  a8: 'var(--s-tint, var(--color-accent-800))', a9: 'var(--s-tint2, var(--color-accent-900))', n4: 'var(--s-label, var(--color-neutral-400))',
  n5: 'var(--s-label, var(--color-neutral-500))', n7: 'var(--s-line, var(--color-neutral-700))', n8: 'var(--s-line2, var(--color-neutral-800))',
  bg: 'var(--s-hole, var(--color-bg))', surf: 'var(--s-fill, var(--color-surface))', text: 'var(--s-text, var(--color-text))',
};
export const T = (x: CSSProperties): CSSProperties => Object.assign({ fontFamily: 'var(--font-body)', fill: C.text }, x);
const EASE = { calcMode: 'spline', keyTimes: '0;1', keySplines: '0.22 1 0.36 1' };
export const A = (attr: string, from: number | string, to: number | string, dur: string, begin: string) =>
  h('animate', Object.assign({ attributeName: attr, from, to, dur, begin, fill: 'freeze' }, EASE));
export const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString();

type Ctx = { font: string; measureText: (t: string) => { width: number } };
let measureCtx: Ctx | null | undefined;
/** Width of a text in px at a size and weight. */
export function textWidth(t: string, size: number, weight = 400) {
  if (measureCtx === undefined) measureCtx = typeof OffscreenCanvas === 'function' ? (new OffscreenCanvas(1, 1).getContext('2d') as Ctx | null) : null;
  if (!measureCtx) return t.length * size * 0.56;
  measureCtx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
  return measureCtx.measureText(t).width;
}

/** A label fitted into maxW: one line, else wrapped (maxLines), then a little smaller (to 72%), and last shortened with an ellipsis. */
export function fitText(text: string, maxW: number, size: number, weight = 400, maxLines = 2): { lines: string[]; size: number } {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const wrap = (fs: number) => {
    const lines: string[] = [];
    for (const w of words) { const cur = lines[lines.length - 1]; if (cur !== undefined && textWidth(cur + ' ' + w, fs, weight) <= maxW) lines[lines.length - 1] = cur + ' ' + w; else lines.push(w); }
    return lines;
  };
  for (let k = 1; k >= 0.72; k -= 0.07) {
    const fs = size * k, lines = wrap(fs);
    if (lines.length <= maxLines && lines.every((l) => textWidth(l, fs, weight) <= maxW)) return { lines, size: fs };
  }
  const fs = size * 0.72, lines = wrap(fs).slice(0, maxLines), rest = wrap(fs).length > maxLines;
  const clip = (l: string, force: boolean) => { if (!force && textWidth(l, fs, weight) <= maxW) return l; let t = l; while (t.length > 1 && textWidth(t + '…', fs, weight) > maxW) t = t.slice(0, -1); return t.trimEnd() + '…'; };
  return { lines: lines.map((l, i) => clip(l, rest && i === lines.length - 1)), size: fs };
}

/** A halo in the slide's own background colour, so labels stay readable over lines and moving dots. */
const HALO: CSSProperties = { paintOrder: 'stroke', stroke: C.bg, strokeWidth: 4, strokeLinejoin: 'round' };

type LabelProps = { x: number; y: number; text: string; maxW: number; size: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; grow?: 'down' | 'up' | 'middle';
  maxLines?: number; style?: CSSProperties; halo?: boolean; children?: ReactNode } & Record<string, unknown>;
/** A fitted label; `grow` says where extra lines go from the anchor line. Extra props (keys, opacity, animations) pass through. */
export function Label({ x, y, text, maxW, size, weight = 400, anchor = 'middle', grow = 'down', maxLines = 2, style, halo, children, ...rest }: LabelProps) {
  const f = fitText(text, Math.max(24, maxW), size, weight, maxLines), lh = f.size * 1.18;
  const first = grow === 'up' ? -(f.lines.length - 1) * lh : grow === 'middle' ? -(f.lines.length - 1) * lh / 2 : 0;
  return h('text', { x, y, textAnchor: anchor, ...rest, style: T({ fontSize: f.size, fontWeight: weight, ...(halo ? HALO : {}), ...style }) },
    ...f.lines.map((l, i) => h('tspan', { key: i, x, dy: i === 0 ? first : lh }, l)), children);
}
const widthOf = (text: string, maxW: number, size: number, weight = 400, maxLines = 2) => {
  const f = fitText(text, Math.max(24, maxW), size, weight, maxLines);
  return Math.max(0, ...f.lines.map((l) => textWidth(l, f.size, weight)));
};
/** A row of labels under points xs: each owns the space halfway to its neighbours, moved inwards only as needed. */
export function slots(xs: number[], texts: string[], size: number, cap = 240) {
  return xs.map((x, i) => {
    const lo = i > 0 ? (xs[i - 1] + x) / 2 + 4 : 2, hi = i < xs.length - 1 ? (x + xs[i + 1]) / 2 - 4 : 638;
    const maxW = Math.min(cap, hi - lo), w = Math.min(maxW, widthOf(texts[i], maxW, size));
    return { x: Math.max(lo + w / 2, Math.min(hi - w / 2, x)), maxW };
  });
}
/** How many lines a label will take. */
export const linesOf = (text: string, maxW: number, size: number, weight = 400, maxLines = 2) => fitText(text, Math.max(24, maxW), size, weight, maxLines).lines.length;
