// One slide frame on a canvas (studios plan, Task 5.4): the title, the bullets building in at the talk-over's cues, the still of
// the slide's drawing, the firm template's bar and, for a voiced deck, the burned-in "Made with AI · voice" tag (EU AI Act
// Art. 50). Text wraps with the reel frame's one `lines`. The compositor calls it through `cut.draw`.
import { AI_MADE } from '../logic/provenance';
import { FONT, lines } from './drawReel';

export type SlidePlan = {
  size: { w: number; h: number }; firm: boolean; voiced: boolean;
  slides: { index: number; title: string; bullets: string[]; start: number; seconds: number; cues: number[]; drawing: boolean }[];
};
export const VOICE_TAG = AI_MADE + ' · voice';

const PAD = 64, DRAWING_W = 520;
const ready = (img: HTMLImageElement | null | undefined): img is HTMLImageElement => !!img && img.complete && img.naturalWidth > 0;

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: number, color: string) {
  ctx.font = weight + ' ' + size + 'px ' + FONT; ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(s, x, y);
}

// The slide at t: the last whose start has come (the deck stays on its last slide at the end).
const slideAt = (plan: SlidePlan, t: number) => [...plan.slides].reverse().find((s) => t >= s.start) ?? plan.slides[0];

export function drawSlideFrame(ctx: CanvasRenderingContext2D, plan: SlidePlan, t: number, images: (HTMLImageElement | null)[]) {
  const { w, h } = plan.size, s = slideAt(plan, t);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  if (plan.firm) { ctx.fillStyle = '#86BC25'; ctx.fillRect(0, 0, w, 16); }
  if (!s) return;
  text(ctx, s.title, PAD, 56, 48, 600, plan.firm ? '#4c7a10' : '#1a1d18');
  const img = s.drawing ? images[s.index] : null, shown = s.cues.length ? 1 + s.cues.filter((c) => c <= t - s.start).length : s.bullets.length;
  if (ready(img)) ctx.drawImage(img, w - PAD - DRAWING_W, 150, DRAWING_W, DRAWING_W * (img.naturalHeight / img.naturalWidth));
  const width = ready(img) ? w - PAD * 2 - DRAWING_W - 40 : w - PAD * 2;
  ctx.font = '400 32px ' + FONT;
  let y = 150;
  for (const b of s.bullets.slice(0, shown)) {
    lines(ctx, b, width - 40).forEach((l, k) => { text(ctx, (k ? '  ' : '• ') + l, PAD, y, 32, 400, '#1a1d18'); y += 42; });
    y += 12;
  }
  if (plan.voiced) text(ctx, VOICE_TAG, PAD, h - PAD, 22, 500, '#5a6058');
}
