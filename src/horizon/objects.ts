// Drawing objects placed on a slide (studios plan, Task 3.3), copied from Horizon's objects.ts: inks, shape outlines,
// line ends, where a Calc animation's poster sits, and how an object is described to screen readers. The editing
// helpers (snapping, handles, grouping) are not part of the player.
import type { ObjectInk, ShapeKind, SlideObject } from './types';

const INKS: Record<string, string> = { accent: 'var(--s-acc)', accent2: 'var(--s-acc2)', light: 'var(--s-light)', tint: 'var(--s-tint)', text: 'var(--s-text)',
  muted: 'var(--s-muted)', surface: 'var(--s-fill)', none: 'transparent' };
const HEX = /^#[0-9a-f]{6}$/i;
export const inkCss = (k: ObjectInk | undefined, fallback: ObjectInk = 'none') => { const v = k || fallback; return HEX.test(v) ? v : INKS[v] ?? 'transparent'; };

export const isLine = (o: SlideObject) => o.kind === 'shape' && (o.shape === 'line' || o.shape === 'arrow');
/** A line's start and end points (an arrow points at the end). */
export function lineEnds(o: SlideObject): [[number, number], [number, number]] {
  const x1 = o.flipX ? o.x + o.w : o.x, y1 = o.flipY ? o.y + o.h : o.y;
  return [[x1, y1], [o.flipX ? o.x : o.x + o.w, o.flipY ? o.y : o.y + o.h]];
}

/** The outline of a shape as an SVG path in a w × h box (lines and arrows are drawn separately). */
export function shapePath(kind: ShapeKind | undefined, w: number, h: number, r = Math.min(18, w / 4, h / 4)): string {
  switch (kind) {
    case 'rounded': return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
    case 'ellipse': return `M0,${h / 2} A${w / 2},${h / 2} 0 1 0 ${w},${h / 2} A${w / 2},${h / 2} 0 1 0 0,${h / 2} Z`;
    case 'triangle': return `M${w / 2},0 L${w},${h} L0,${h} Z`;
    case 'diamond': return `M${w / 2},0 L${w},${h / 2} L${w / 2},${h} L0,${h / 2} Z`;
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, k) => {
        const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 0.4 : 1;
        return `${(w / 2 + Math.cos(a) * rr * w / 2).toFixed(1)},${(h / 2 + Math.sin(a) * rr * h / 2 + h * 0.05).toFixed(1)}`;
      });
      return 'M' + pts.join(' L') + ' Z';
    }
    default: return `M0,0 H${w} V${h} H0 Z`;
  }
}

/** Where a Calc animation is drawn inside its box: as large as fits at 16:9, centred. */
export function animationBox(o: { w: number; h: number }) {
  const k = Math.min(o.w / 1280, o.h / 720), w = 1280 * k, h = 720 * k;
  return { x: (o.w - w) / 2, y: (o.h - h) / 2, w, h };
}

/** A short description of an object, for screen readers. */
export function describe(o: SlideObject): string {
  if (o.kind === 'text') return 'Text box' + (o.text ? ': ' + o.text.split('\n')[0].slice(0, 40) : '');
  if (o.kind === 'picture') return 'Picture' + (o.alt ? ': ' + o.alt : '');
  if (o.kind === 'chart') return o.viz?.type === 'custom' ? 'Animation' : 'Chart';
  if (o.kind === 'animation') return 'Animation' + (o.animation?.name ? ': ' + o.animation.name : '');
  if (o.kind === 'case') return 'Case' + (o.case?.title ? ': ' + o.case.title : '');
  if (o.kind === 'avatar') return 'Avatar' + (o.avatar?.name ? ': ' + o.avatar.name : '');
  return 'Shape' + (o.text ? ': ' + o.text.split('\n')[0].slice(0, 40) : '');
}
