// The typed charts that compare and follow numbers (studios plan, Task 3.3), copied from Horizon's viz.tsx: bar and
// line charts (one series, or two to four with a legend) and steps. Drawn with SMIL entry animations on a 640 × 320
// view box; the structure maps are in vizMaps.ts.
import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import type { Viz, VizItem } from './types';
import { A, C, Label, T, fitText, fmt, slots, textWidth } from './vizText';

export type Draw = (items: VizItem[], v: Viz, o: { still?: boolean }) => ReactNode[];
/** A key that changes whenever a visual's drawing would: an original by its drawing, the rest by their data. */
export const vizKey = (v: Viz | null | undefined): string => (!v ? '' : v.type === 'custom' ? 'c' + (v.svg || '').length + (v.svg || '').slice(-48) : JSON.stringify(v));

const SERIES = [C.acc, C.a3, C.a7, C.a8];
// Bar and line charts draw up to four series; the rest one.
const seriesNames = (v: Viz) => (v.series && v.series.length > 1 && (v.type === 'bars' || v.type === 'trend') ? v.series.slice(0, 4) : null);
const valuesOf = (it: VizItem, n: number): (number | null)[] =>
  [typeof it.value === 'number' ? it.value : null, ...Array.from({ length: n - 1 }, (_, k) => { const x = it.more?.[k]; return typeof x === 'number' ? x : null; })];

function legend(names: string[]): ReactNode[] {
  const size = 13, share = 560 / names.length - 18;
  const fits = names.map((n) => fitText(n, Math.max(24, share - 16), size, 400, 1));
  const widths = fits.map((f) => 16 + textWidth(f.lines[0] ?? '', f.size));
  let x = 320 - (widths.reduce((a, b) => a + b, 0) + 18 * (names.length - 1)) / 2;
  return names.map((_, s) => {
    const at = x;
    x += widths[s] + 18;
    return h('g', { key: 'lg' + s }, h('rect', { x: at, y: 12, width: 10, height: 10, rx: 2, style: { fill: SERIES[s] } }),
      h('text', { x: at + 16, y: 21.5, style: T({ fontSize: fits[s].size, fill: C.n4 }) }, fits[s].lines[0] ?? ''));
  });
}

function groupedBars(items: VizItem[], v: Viz, names: string[]): ReactNode[] {
  const S = names.length, n = items.length || 1, rows = items.map((it) => valuesOf(it, S));
  const max = Math.max(1, ...rows.flat().map((x) => x ?? 0)), gap = 20, cw = (560 - gap * (n - 1)) / n, inner = 3, bw = (cw - inner * (S - 1)) / S, base = 260;
  const out: ReactNode[] = [...legend(names), h('line', { key: 'b', x1: 40, x2: 600, y1: base, y2: base, style: { stroke: C.n7 } })];
  items.forEach((it, i) => {
    const x0 = 40 + i * (cw + gap);
    rows[i].forEach((val, s) => {
      if (val == null) return;
      const bh = Math.max(4, Math.max(0, val) / max * 170), x = x0 + s * (bw + inner), b = (0.2 + i * 0.14 + s * 0.05).toFixed(2) + 's', text = fmt(val) + (v.suffix || '');
      out.push(h('g', { key: `${i}-${s}` },
        h('rect', { x, y: base, width: bw, height: 0, rx: Math.min(6, bw / 3), style: { fill: SERIES[s] } }, A('height', 0, bh, '1s', b), A('y', base, base - bh, '1s', b)),
        textWidth(text, 13, 500) <= bw + inner - 1
          ? h('text', { x: x + bw / 2, y: base - bh - 8, textAnchor: 'middle', opacity: 0, style: T({ fontSize: 13, fontWeight: 500 }) }, text, A('opacity', 0, 1, '0.4s', (0.9 + i * 0.14).toFixed(2) + 's'))
          : null));
    });
    out.push(h(Label, { key: 'l' + i, x: x0 + cw / 2, y: base + 26, text: it.label, maxW: cw + gap - 6, size: 16, style: { fill: C.n4 } }));
  });
  return out;
}

function manyLines(items: VizItem[], v: Viz, names: string[]): ReactNode[] {
  const S = names.length, n = Math.max(items.length, 2), rows = items.map((it) => valuesOf(it, S));
  const known = rows.flat().filter((x): x is number => x != null), max = Math.max(...known, 1), min = Math.min(...known, 0);
  const X = (i: number) => 50 + i * (540 / (n - 1)), Y = (val: number) => 236 - (val - min) / ((max - min) || 1) * 156;
  const out: ReactNode[] = [...legend(names), h('line', { key: 'b', x1: 40, x2: 600, y1: 246, y2: 246, style: { stroke: C.n7 } })];
  const ends: { s: number; x: number; y: number; text: string }[] = [];
  for (let s = 0; s < S; s++) {
    const runs: [number, number][][] = [[]];
    rows.forEach((r, i) => { const val = r[s]; if (val == null) { if (runs[runs.length - 1].length) runs.push([]); } else runs[runs.length - 1].push([X(i), Y(val)]); });
    runs.filter((run) => run.length).forEach((run, k) => {
      const d = 'M' + run.map((p) => p.join(',')).join(' L');
      if (s === 0) out.push(h('path', { key: `a${k}`, d: d + ` L${run[run.length - 1][0]},246 L${run[0][0]},246 Z`, opacity: 0, style: { fill: C.a9 } }, A('opacity', 0, 1, '0.8s', '1.2s')));
      out.push(h('path', { key: `l${s}-${k}`, d, strokeDasharray: 1600, strokeDashoffset: 1600, style: { fill: 'none', stroke: SERIES[s], strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } },
        A('stroke-dashoffset', 1600, 0, '1.6s', (0.2 + s * 0.15).toFixed(2) + 's')));
      run.forEach((p, j) => out.push(h('circle', { key: `c${s}-${k}-${j}`, cx: p[0], cy: p[1], r: 0, style: { fill: C.bg, stroke: SERIES[s], strokeWidth: 2.5 } },
        A('r', 0, 4, '0.3s', (0.4 + s * 0.15 + j * 0.08).toFixed(2) + 's'))));
    });
    let last = -1;
    rows.forEach((r, i) => { if (r[s] != null) last = i; });
    if (last >= 0) ends.push({ s, x: X(last), y: Y(rows[last][s]!), text: fmt(rows[last][s]!) + (v.suffix || '') });
  }
  ends.sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  const ys = ends.map((e) => (prev = Math.max(e.y + 5, prev + 20))), lift = Math.max(0, (ys[ys.length - 1] ?? 0) - 240);
  ends.forEach((e, k) => {
    const left = e.x > 200;
    out.push(h(Label, { key: 'v' + e.s, x: left ? e.x - 10 : e.x + 10, y: ys[k] - lift, text: e.text, maxW: 120, size: 15, weight: 500, maxLines: 1, anchor: left ? 'end' : 'start', halo: true,
      style: { fill: SERIES[e.s] }, opacity: 0 }, A('opacity', 0, 1, '0.4s', '1.8s')));
  });
  const at = slots(items.map((_, i) => X(i)), items.map((it) => String(it.label ?? '')), 15);
  items.forEach((it, i) => out.push(h(Label, { key: 't' + i, x: at[i].x, y: 272, text: it.label, maxW: Math.min(540 / (n - 1) - 8, at[i].maxW), size: 15, style: { fill: C.n4 } })));
  return out;
}

export const bars: Draw = (items, v) => {
  const names = seriesNames(v);
  if (names) return groupedBars(items, v, names);
  const n = items.length || 1, max = Math.max(1, ...items.map((i) => +(i.value ?? 0) || 0)), gap = 20, bw = (560 - gap * (n - 1)) / n, base = 260, col = bw + gap - 6;
  const out: ReactNode[] = [h('line', { key: 'b', x1: 40, x2: 600, y1: base, y2: base, style: { stroke: C.n7 } })];
  items.forEach((it, i) => {
    const val = +(it.value ?? 0) || 0, bh = Math.max(4, val / max * 190), x = 40 + i * (bw + gap), b = (0.2 + i * 0.14).toFixed(2) + 's';
    out.push(h('g', { key: i },
      h('rect', { x, y: base, width: bw, height: 0, rx: 6, style: { fill: i === 0 ? C.acc : C.a7 } }, A('height', 0, bh, '1s', b), A('y', base, base - bh, '1s', b)),
      h(Label, { x: x + bw / 2, y: base - bh - 12, text: fmt(val) + (v.suffix || ''), maxW: col, size: 22, weight: 500, maxLines: 1, opacity: 0 }, A('opacity', 0, 1, '0.4s', (0.9 + i * 0.14).toFixed(2) + 's')),
      h(Label, { x: x + bw / 2, y: base + 26, text: it.label, maxW: col, size: 16, style: { fill: C.n4 } })));
  });
  return out;
};

export const trend: Draw = (items, v) => {
  const names = seriesNames(v);
  if (names) return manyLines(items, v, names);
  const n = Math.max(items.length, 2), vals = items.map((i) => +(i.value ?? 0) || 0), max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const X = (i: number) => 50 + i * (540 / (n - 1)), Y = (val: number) => 236 - (val - min) / ((max - min) || 1) * 176;
  const pts = items.map((it, i) => [X(i), Y(+(it.value ?? 0) || 0)]);
  if (!pts.length) return [];
  const d = 'M' + pts.map((p) => p.join(',')).join(' L'), last = pts[pts.length - 1], len = 1600, step = 540 / (n - 1);
  const out: ReactNode[] = [
    h('line', { key: 'b', x1: 40, x2: 600, y1: 246, y2: 246, style: { stroke: C.n7 } }),
    h('path', { key: 'a', d: d + ` L${last[0]},246 L${pts[0][0]},246 Z`, opacity: 0, style: { fill: C.a9 } }, A('opacity', 0, 1, '0.8s', '1.2s')),
    h('path', { key: 'l', d, strokeDasharray: len, strokeDashoffset: len, style: { fill: 'none', stroke: C.acc, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } }, A('stroke-dashoffset', len, 0, '1.6s', '0.2s')),
    h('circle', { key: 'pu', cx: last[0], cy: last[1], r: 6, opacity: 0, style: { fill: 'none', stroke: C.acc, strokeWidth: 2 } },
      h('animate', { attributeName: 'r', values: '6;20', dur: '1.6s', begin: '1.8s', repeatCount: 'indefinite' }),
      h('animate', { attributeName: 'opacity', values: '1;0', dur: '1.6s', begin: '1.8s', repeatCount: 'indefinite' })),
    h(Label, { key: 'lv', x: Math.min(last[0], 590), y: last[1] - 22, text: fmt(+(items[items.length - 1].value ?? 0) || 0) + (v.suffix || ''), maxW: 120, size: 22, weight: 500, maxLines: 1, anchor: last[0] > 560 ? 'end' : 'middle', halo: true, opacity: 0 }, A('opacity', 0, 1, '0.4s', '1.8s')),
  ];
  const at = slots(pts.map((p) => p[0]), items.map((it) => String(it.label ?? '')), 15);
  pts.forEach((p, i) => {
    out.push(h('circle', { key: 'c' + i, cx: p[0], cy: p[1], r: 0, style: { fill: C.bg, stroke: C.acc, strokeWidth: 2.5 } }, A('r', 0, 5, '0.3s', (0.2 + 1.6 * i / (n - 1)).toFixed(2) + 's')));
    out.push(h(Label, { key: 't' + i, x: at[i].x, y: 272, text: items[i].label, maxW: Math.min(step - 8, at[i].maxW), size: 15, style: { fill: C.n4 } }));
  });
  return out;
};

export const flow: Draw = (items) => {
  const n = items.length || 1, bw = Math.min(110, (560 - (n - 1) * 24) / n), gap = n > 1 ? (560 - n * bw) / (n - 1) : 0, y = 112, bh = 76;
  const xs = items.map((_, i) => 40 + i * (bw + gap) + (n === 1 ? (560 - bw) / 2 : 0));
  if (!xs.length) return [];
  const d = `M${xs[0] + bw / 2},${y + bh / 2} L${xs[n - 1] + bw / 2},${y + bh / 2}`;
  const out: ReactNode[] = [h('path', { key: 'p', d, strokeDasharray: 600, strokeDashoffset: 600, style: { stroke: C.a7, strokeWidth: 2, fill: 'none' } }, A('stroke-dashoffset', 600, 0, '1.2s', '0.1s')),
    h('circle', { key: 'dot', r: 6, opacity: 0, style: { fill: C.acc } }, A('opacity', 0, 1, '0.2s', '1.3s'), h('animateMotion', { path: d, dur: (n * 0.8) + 's', begin: '1.3s', repeatCount: 'indefinite' }))];
  items.forEach((it, i) => {
    const b = (0.15 + i * 0.22).toFixed(2) + 's', cx = xs[i] + bw / 2;
    out.push(h('g', { key: i, opacity: 0 }, A('opacity', 0, 1, '0.5s', b),
      h('text', { x: cx, y: y - 16, textAnchor: 'middle', style: T({ fontSize: 13, fill: C.n5 }) }, String(i + 1).padStart(2, '0')),
      h('rect', { x: xs[i], y, width: bw, height: bh, rx: 8, style: { fill: C.surf, stroke: i === n - 1 ? C.acc : C.n7, strokeWidth: 1.5 } }),
      h(Label, { x: cx, y: y + bh / 2 + 5, text: it.label, maxW: bw - 12, size: 15, weight: 500, grow: 'middle' }),
      it.note ? h(Label, { x: cx, y: y + bh + 24, text: it.note, maxW: bw + gap - 8, size: 13, style: { fill: C.n4 } }) : null));
  });
  return out;
};
