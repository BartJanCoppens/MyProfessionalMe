// The typed charts for numbers, relations and structures (studios plan, Task 3.3), copied from Horizon's viz.tsx:
// timeline, big number, orbit, network, pyramid, tree and circles. SMIL entry animations on a 640 × 320 view box.
import { createElement as h, useEffect, useState } from 'react';
import type { ReactNode, SVGProps } from 'react';
import type { VizItem } from './types';
import type { Draw } from './vizCharts';
import { A, C, Label, T, linesOf, textWidth } from './vizText';

function CountUp(p: { to: number; suffix?: string; delay?: number; still?: boolean; attrs: SVGProps<SVGTextElement> }) {
  const [counted, setV] = useState(0), v = p.still ? p.to : counted;
  useEffect(() => {
    if (p.still) return;
    let raf = 0, t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t;
      const k = Math.min(Math.max((t - t0 - (p.delay || 0)) / 1400, 0), 1);
      setV(p.to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [p.to, p.still, p.delay]);
  return h('text', p.attrs, (p.to % 1 ? v.toFixed(1) : Math.round(v)) + (p.suffix || ''));
}

/** Items in up to three levels: by their values when those are levels (0, 1, 2), else the first on top, the next few, the rest. */
function levelsOf(items: VizItem[], keepEmpty = false): VizItem[][] {
  if (!items.length) return [];
  const levelled = items.every((it) => it.value === 0 || it.value === 1 || it.value === 2);
  const split = levelled ? [0, 1, 2].map((l) => items.filter((it) => it.value === l)) : [items.slice(0, 1), items.slice(1, Math.min(items.length, 4)), items.slice(4)];
  return keepEmpty ? split : split.filter((L) => L.length);
}

export const timeline: Draw = (items) => {
  const n = items.length || 1, y = 165, xs = items.map((_, i) => (n === 1 ? 320 : 80 + i * (480 / (n - 1))));
  const span = (i: number) => {
    const lo = i >= 2 ? (xs[i - 2] + xs[i]) / 2 + 6 : 40, hi = i + 2 < n ? (xs[i] + xs[i + 2]) / 2 - 6 : 600, w = Math.min(240, hi - lo);
    return { w, x: Math.max(lo + w / 2, Math.min(hi - w / 2, xs[i])) };
  };
  const out: ReactNode[] = [
    h('line', { key: 'l', x1: 40, x2: 600, y1: y, y2: y, strokeDasharray: 560, strokeDashoffset: 560, style: { stroke: C.n7, strokeWidth: 2 } }, A('stroke-dashoffset', 560, 0, '1s', '0s')),
    h('line', { key: 'p', x1: 40, x2: 600, y1: y, y2: y, strokeDasharray: 560, strokeDashoffset: 560, style: { stroke: C.acc, strokeWidth: 2 } }, A('stroke-dashoffset', 560, 0, (0.4 + n * 0.3) + 's', '0.2s')),
  ];
  items.forEach((it, i) => {
    const b = (0.3 + i * 0.3).toFixed(2) + 's', up = i % 2 === 0, { w: room, x } = span(i), lh = 17 * 1.18;
    const labelY = up ? y - 52 : y + 102, noteY = up ? y - 74 - (linesOf(it.label, room, 17, 500) - 1) * lh : y + 78;
    out.push(h('g', { key: i, opacity: 0 }, A('opacity', 0, 1, '0.4s', b),
      h('line', { x1: xs[i], x2: xs[i], y1: y, y2: up ? y - 40 : y + 40, style: { stroke: C.n7 } }),
      h(Label, { x, y: noteY, text: String(it.note || '').toUpperCase(), maxW: room, size: 13, maxLines: 1, style: { fill: C.a3, letterSpacing: '0.08em' } }),
      h(Label, { x, y: labelY, text: it.label, maxW: room, size: 17, weight: 500, grow: up ? 'up' : 'down' })));
    out.push(h('circle', { key: 'c' + i, cx: xs[i], cy: y, r: 0, style: { fill: C.bg, stroke: C.acc, strokeWidth: 3 } }, A('r', 0, 8, '0.5s', b)));
  });
  return out;
};

export const counter: Draw = (items, v, o) => {
  const it = items[0] || { label: '', value: 0 }, val = +(it.value ?? 0) || 0, cx = 320, cy = 136, r = 100, L = 2 * Math.PI * r;
  const pct = v.suffix === '%' ? Math.min(Math.abs(val) / 100, 1) : 0.78;
  const numText = (val % 1 ? val.toFixed(1) : String(Math.round(val))) + (v.suffix || ''), numSize = Math.min(58, 58 * 150 / Math.max(150, textWidth(numText, 58, 500)));
  return [
    h('circle', { key: 'bg', cx, cy, r, style: { fill: 'none', stroke: C.n8, strokeWidth: 10 } }),
    h('circle', { key: 'arc', cx, cy, r, transform: `rotate(-90 ${cx} ${cy})`, strokeDasharray: L, strokeDashoffset: L, style: { fill: 'none', stroke: C.acc, strokeWidth: 10, strokeLinecap: 'round' } }, A('stroke-dashoffset', L, L * (1 - pct), '1.4s', '0.2s')),
    h(CountUp, { key: 'n', to: val, suffix: v.suffix, delay: 200, still: o.still, attrs: { x: cx, y: cy + numSize * 0.35, textAnchor: 'middle', style: T({ fontSize: numSize, fontWeight: 500, letterSpacing: '-0.02em' }) } }),
    h(Label, { key: 'lb', x: cx, y: cy + r + 38, text: it.label, maxW: 520, size: 17, style: { fill: C.n4 }, opacity: 0 }, A('opacity', 0, 1, '0.5s', '0.8s')),
  ];
};

export const orbit: Draw = (items, v) => {
  const cx = 320, cy = 160, rings = [[240, 120], [150, 72]];
  const out: ReactNode[] = rings.map((r, i) => h('ellipse', { key: 'r' + i, cx, cy, rx: r[0], ry: r[1], strokeDasharray: '3 7', style: { fill: 'none', stroke: C.n7 } }));
  out.push(h('circle', { key: 'c', cx, cy, r: 0, style: { fill: C.a8, stroke: C.acc, strokeWidth: 1.5 } }, A('r', 0, 46, '0.8s', '0.1s')));
  out.push(h(Label, { key: 'ct', x: cx, y: cy + 6, text: v.center || (items[0] && items[0].label) || 'Core', maxW: 84, size: 16, weight: 500, grow: 'middle', opacity: 0 }, A('opacity', 0, 1, '0.4s', '0.5s')));
  items.forEach((it, i) => {
    const ring = i % 2, r = rings[ring], dur = ring ? 16 : 26, cnt = items.filter((_, j) => j % 2 === ring).length, idx = Math.floor(i / 2);
    const path = `M${cx - r[0]},${cy} a${r[0]},${r[1]} 0 1,1 ${2 * r[0]},0 a${r[0]},${r[1]} 0 1,1 ${-2 * r[0]},0`;
    const begin = '-' + (dur * (idx / cnt + 0.1) + ring * 3).toFixed(2) + 's';
    const side = (values: string) => h('animate', { attributeName: 'opacity', values, keyTimes: '0;0.03;0.47;0.53;0.97;1', dur: dur + 's', begin, repeatCount: 'indefinite' });
    out.push(h('g', { key: i, opacity: 0 }, A('opacity', 0, 1, '0.6s', (0.4 + i * 0.12).toFixed(2) + 's'),
      h('animateMotion', { path, dur: dur + 's', begin, repeatCount: 'indefinite' }), h('circle', { r: 7, style: { fill: ring ? C.a3 : C.acc } }),
      h(Label, { x: 0, y: -13, text: it.label, maxW: 140, size: 15, maxLines: 1, halo: true }, side('0.5;1;1;0;0;0.5')),
      h(Label, { x: 0, y: 24, text: it.label, maxW: 140, size: 15, maxLines: 1, halo: true }, side('0.5;0;0;1;1;0.5'))));
  });
  return out;
};

export const network: Draw = (items, v) => {
  const cx = 320, cy = 160, n = items.length || 1;
  const P = items.map((_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n, rr = i % 2 ? 112 : 136; return [cx + Math.cos(a) * rr * 1.7, cy + Math.sin(a) * rr * 0.84]; });
  const labelY = (i: number) => P[i][1] + (P[i][1] < cy ? -20 : 32);
  const linesFit = (i: number) => { const y = labelY(i), lh = 15 * 1.18; return Math.max(1, Math.min(2, 1 + Math.floor((P[i][1] < cy ? y - 14 : 316 - y) / lh))); };
  const room = (i: number) => Math.max(60, Math.min(170, 2 * (Math.min(P[i][0], 640 - P[i][0]) - 6), ...P.map((q, j) => (j !== i && Math.abs(labelY(j) - labelY(i)) < 44 ? Math.abs(q[0] - P[i][0]) - 14 : 170))));
  const out: ReactNode[] = [];
  P.forEach((p, i) => {
    const q = P[(i + 1) % n], b = (0.1 + i * 0.1).toFixed(2) + 's';
    out.push(h('line', { key: 's' + i, x1: cx, y1: cy, x2: p[0], y2: p[1], strokeDasharray: 400, strokeDashoffset: 400, style: { stroke: C.a7, strokeWidth: 1.5 } }, A('stroke-dashoffset', 400, 0, '0.9s', b)));
    if (n > 2) out.push(h('line', { key: 'r' + i, x1: p[0], y1: p[1], x2: q[0], y2: q[1], strokeDasharray: '2 6', opacity: 0, style: { stroke: C.n7 } }, A('opacity', 0, 1, '0.6s', '1s')));
  });
  P.forEach((p, i) => {
    const dur = 1.6 + (i % 3) * 0.4, b = (1 + i * 0.3).toFixed(2) + 's';
    out.push(h('circle', { key: 'pu' + i, r: 3.5, opacity: 0, style: { fill: C.acc } }, h('animateMotion', { path: `M${cx},${cy} L${p[0]},${p[1]}`, dur: dur + 's', begin: b, repeatCount: 'indefinite' }),
      h('animate', { attributeName: 'opacity', values: '0;1;1;0', dur: dur + 's', begin: b, repeatCount: 'indefinite' })));
  });
  P.forEach((p, i) => {
    const b = (0.4 + i * 0.1).toFixed(2) + 's';
    out.push(h('circle', { key: 'n' + i, cx: p[0], cy: p[1], r: 0, style: { fill: C.surf, stroke: C.a3, strokeWidth: 1.5 } }, A('r', 0, 12, '0.5s', b)));
    out.push(h(Label, { key: 't' + i, x: p[0], y: labelY(i), text: items[i].label, maxW: room(i), size: 15, maxLines: linesFit(i), grow: p[1] < cy ? 'up' : 'down', halo: true, opacity: 0 }, A('opacity', 0, 1, '0.4s', b)));
  });
  out.push(h('circle', { key: 'c', cx, cy, r: 0, style: { fill: C.a8, stroke: C.acc, strokeWidth: 1.5 } }, A('r', 0, 30, '0.6s', '0s')));
  out.push(h(Label, { key: 'ct', x: cx, y: cy + 5, text: v.center || 'Hub', maxW: 54, size: 13, weight: 500, grow: 'middle' }));
  return out;
};

export const pyramid: Draw = (items) => {
  const levels = levelsOf(items.slice(0, 10)), n = levels.length || 1, top = 22, bottom = 300, bandH = (bottom - top) / n, cx = 320, half = (y: number) => 40 + (y - top) / (bottom - top) * 250;
  const out: ReactNode[] = [];
  levels.forEach((L, k) => {
    const y0 = top + k * bandH + (k ? 6 : 0), y1 = top + (k + 1) * bandH, w0 = half(y0), w1 = half(y1), b = (0.15 + k * 0.35).toFixed(2) + 's';
    out.push(h('path', { key: 'b' + k, d: `M${cx - w0},${y0} L${cx + w0},${y0} L${cx + w1},${y1} L${cx - w1},${y1} Z`, opacity: 0, style: { fill: k === 0 ? C.acc : k === 1 ? C.a7 : C.a8, stroke: C.bg, strokeWidth: 2 } }, A('opacity', 0, 1, '0.6s', b)));
    const mid = (y0 + y1) / 2, w = (half(mid) * 2 - 16) / L.length;
    L.forEach((it, c) => {
      const x = cx - half(mid) + 8 + w * (c + 0.5);
      if (c > 0) out.push(h('line', { key: 'd' + k + c, x1: x - w / 2, x2: x - w / 2, y1: y0 + 6, y2: y1 - 6, opacity: 0, style: { stroke: C.bg, strokeWidth: 2 } }, A('opacity', 0, 1, '0.4s', b)));
      out.push(h(Label, { key: 't' + k + c, x, y: mid + 5, text: it.label, maxW: Math.max(40, w - 12), size: k === 0 ? 17 : 14, weight: k === 0 ? 600 : 500, grow: 'middle', style: { fill: k === 0 ? C.bg : C.text }, opacity: 0 }, A('opacity', 0, 1, '0.4s', (0.35 + k * 0.35).toFixed(2) + 's')));
    });
  });
  return out;
};

export const tree: Draw = (items, v) => {
  const [top, mid, low] = levelsOf(items, true), root = v.center || top?.[0]?.label || '';
  const branches = (mid || []).slice(0, 4), leaves = (low || []).slice(0, 8), nb = branches.length || 1, bw = 560 / nb, bx = (k: number) => 40 + bw * (k + 0.5);
  const parentOf = (leaf: VizItem, k: number) => { const i = branches.findIndex((b) => b.label === leaf.note); return i >= 0 ? i : k % nb; };
  const kids = branches.map((_, k) => leaves.filter((l, i) => parentOf(l, i) === k));
  const box = (key: string, x: number, y: number, w: number, text: string, strong: boolean, begin: string) => h('g', { key, opacity: 0 },
    h('rect', { x: x - w / 2, y: y - 18, width: w, height: 36, rx: 10, style: { fill: strong ? C.acc : C.surf, stroke: strong ? 'none' : C.a7, strokeWidth: 1.5 } }),
    h(Label, { x, y: y + 5, text, maxW: w - 14, size: strong ? 15 : 13, weight: strong ? 600 : 500, maxLines: 1, style: { fill: strong ? C.bg : C.text } }), A('opacity', 0, 1, '0.4s', begin));
  const link = (key: string, x1: number, y1: number, x2: number, y2: number, begin: string) =>
    h('path', { key, d: `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`, strokeDasharray: 400, strokeDashoffset: 400, style: { fill: 'none', stroke: C.a7, strokeWidth: 2 } }, A('stroke-dashoffset', 400, 0, '0.6s', begin));
  const leafX = (k: number, j: number) => { const n = kids[k].length; return bx(k) + (j - (n - 1) / 2) * Math.min(bw / n, 150); };
  const out: ReactNode[] = [];
  branches.forEach((_, k) => { out.push(link('l' + k, 320, 58, bx(k), 142, (0.3 + k * 0.1).toFixed(2) + 's')); kids[k].forEach((__, j) => out.push(link('m' + k + j, bx(k), 160, leafX(k, j), 236, (0.8 + k * 0.1).toFixed(2) + 's'))); });
  if (root) out.push(box('root', 320, 40, Math.min(300, Math.max(140, 9 * root.length)), root, true, '0.05s'));
  branches.forEach((b, k) => out.push(box('b' + k, bx(k), 160, Math.min(170, bw - 14), b.label, false, (0.5 + k * 0.1).toFixed(2) + 's')));
  branches.forEach((_, k) => kids[k].forEach((leaf, j) => out.push(box('f' + k + j, leafX(k, j), 254, Math.min(bw / kids[k].length, 150) - 10, leaf.label, false, (1 + k * 0.1 + j * 0.05).toFixed(2) + 's'))));
  return out;
};

export const circles: Draw = (items) => {
  const rings = levelsOf(items.slice(0, 9)), cx = 320, cy = 160, R = [56, 102, 148], out: ReactNode[] = [];
  [...rings.keys()].reverse().forEach((k) => out.push(h('circle', { key: 'c' + k, cx, cy, r: 0, style: { fill: k === 0 ? C.acc : k === 1 ? C.a7 : C.a8, stroke: C.bg, strokeWidth: 3 } },
    A('r', 0, R[k], '0.7s', (0.1 + (rings.length - 1 - k) * 0.25).toFixed(2) + 's'))));
  rings.forEach((L, k) => {
    const text = L.map((it) => it.label).join(' · '), y = k === 0 ? cy + 6 : cy - (R[k - 1] + R[k]) / 2 + 6;
    out.push(h(Label, { key: 't' + k, x: cx, y, text, maxW: k === 0 ? 96 : 2 * Math.sqrt(R[k] ** 2 - (cy - y) ** 2) - 30, size: k === 0 ? 16 : 13, weight: k === 0 ? 600 : 500,
      grow: 'middle', maxLines: k === 0 ? 2 : 1, style: { fill: k === 0 ? C.bg : C.text }, opacity: 0 }, A('opacity', 0, 1, '0.4s', (0.9 + k * 0.2).toFixed(2) + 's')));
  });
  return out;
};
