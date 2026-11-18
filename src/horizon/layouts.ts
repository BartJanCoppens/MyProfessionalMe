// Slide layouts as exact boxes on the 800 × 450 slide (studios plan, Task 3.3), copied from Horizon's layouts.ts
// (geometry, resolveLayout, fitVisual). Not copied: the layout gallery's thumbnails and the Fall back stage in 3D; a
// Fall back slide is shown flat, as Horizon draws it when editing (visual on top, text along the bottom).
import type { Frame, LayoutId } from './types';

export interface Box { x: number; y: number; w: number; h: number }
export interface TextBox extends Box {
  align: 'left' | 'center';
  valign: 'top' | 'middle' | 'bottom';
  /** Font sizes in px for the part number, title and body; 0 leaves that line out. */
  sizes: [number, number, number];
}
export interface Geometry { text: TextBox; visual?: Box; rule?: Box; caption?: TextBox; columns?: Box; quote?: { mark: Box; text: TextBox; by: TextBox } }

export function resolveLayout(f: Frame): Exclude<LayoutId, 'auto'> {
  if (f.layout && f.layout !== 'auto') return f.layout;
  return f.viz || f.image ? 'visualRight' : 'title';
}

const NONE: TextBox = { x: 0, y: 0, w: 0, h: 0, align: 'left', valign: 'top', sizes: [0, 0, 0] };

export function geometry(f: Frame): Geometry {
  const L = resolveLayout(f), picture = !f.viz && !!f.image;
  switch (L) {
    case 'title':
      return { rule: { x: 56, y: 56, w: 40, h: 2 }, text: { x: 56, y: 120, w: 688, h: 274, align: 'left', valign: 'bottom', sizes: [14, 60, 20] } };
    case 'statement':
      return { rule: { x: 380, y: 92, w: 40, h: 2 }, text: { x: 90, y: 112, w: 620, h: 250, align: 'center', valign: 'middle', sizes: [13, 46, 18] } };
    case 'visualLeft':
      return picture
        ? { visual: { x: 48, y: 48, w: 367, h: 354 }, text: { x: 447, y: 48, w: 305, h: 354, align: 'left', valign: 'top', sizes: [13, 32, 16] } }
        : { visual: { x: 48, y: 48, w: 442, h: 354 }, text: { x: 522, y: 48, w: 230, h: 354, align: 'left', valign: 'top', sizes: [13, 32, 16] } };
    case 'headline':
      return { text: { x: 48, y: 40, w: 704, h: 112, align: 'left', valign: 'top', sizes: [12, 30, 15] }, visual: { x: 48, y: 160, w: 704, h: 254 } };
    case 'focus':
      return { text: { x: 40, y: 28, w: 600, h: 54, align: 'left', valign: 'top', sizes: [11, 20, 0] }, visual: { x: 40, y: 84, w: 720, h: 306 },
        caption: { x: 40, y: 396, w: 720, h: 34, align: 'left', valign: 'top', sizes: [0, 0, 14] } };
    case 'columns':
      return { rule: { x: 48, y: 48, w: 40, h: 2 }, text: { x: 48, y: 64, w: 704, h: 92, align: 'left', valign: 'bottom', sizes: [13, 36, 0] }, columns: { x: 48, y: 176, w: 704, h: 226 } };
    case 'quote':
      return { text: NONE, quote: { mark: { x: 56, y: 34, w: 120, h: 120 }, text: { x: 110, y: 96, w: 600, h: 230, align: 'left', valign: 'middle', sizes: [0, 0, 30] },
        by: { x: 110, y: 338, w: 600, h: 40, align: 'left', valign: 'top', sizes: [0, 17, 0] } } };
    case 'blank':
      return { text: NONE };
    case 'fallback':
      return { rule: { x: 48, y: 312, w: 40, h: 2 }, visual: { x: 150, y: 34, w: 500, h: 262 }, text: { x: 48, y: 322, w: 704, h: 100, align: 'left', valign: 'top', sizes: [12, 30, 15] } };
    default: // visualRight
      return picture
        ? { text: { x: 48, y: 48, w: 305, h: 354, align: 'left', valign: 'top', sizes: [13, 32, 16] }, visual: { x: 385, y: 48, w: 367, h: 354 } }
        : { text: { x: 48, y: 48, w: 230, h: 354, align: 'left', valign: 'top', sizes: [13, 32, 16] }, visual: { x: 310, y: 48, w: 442, h: 354 } };
  }
}

/** The largest 2:1 area that fits a box, centred in it (visuals are drawn on a 640 × 320 view box). */
export function fitVisual(b: Box): Box {
  const w = Math.min(b.w, b.h * 2), h = w / 2;
  return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
}
