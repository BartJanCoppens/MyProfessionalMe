// One reel frame on a canvas (studios plan, Task 5.3): the stock look's colour and portrait with a slow zoom, the scene's
// on-screen text, the caption when it is burned in and the AI tag (EU AI Act Art. 50). The reel panel's canvas and
// the browser compositor (Task 5.4) both draw with this, so the preview and the rendered video look the same.
import { AI_MADE } from '../logic/provenance';
import { reelFrameAt } from '../logic/reelFrame';
import type { CutPlan } from '../logic/reelFrame';

const FONT = "'IBM Plex Sans', system-ui, sans-serif";

// Words wrapped to lines of at most `width` pixels, as the context measures them.
function lines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > width) { out.push(line); line = word; } else line = next;
  }
  return line ? [...out, line] : out;
}

function block(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, color: string) {
  ctx.font = '600 ' + size + 'px ' + FONT; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  lines(ctx, text, width).forEach((l, k) => ctx.fillText(l, x, y + k * size * 1.3));
}

export function drawReelFrame(ctx: CanvasRenderingContext2D, plan: CutPlan, t: number, img: HTMLImageElement | null) {
  const { w, h } = plan.size, f = reelFrameAt(plan, t), pad = w * 0.08;
  ctx.fillStyle = '#171a16'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.scale(f.zoom, f.zoom); ctx.translate(-w / 2, -h / 2);
  if (plan.look) { ctx.fillStyle = plan.look.color; ctx.fillRect(0, h * 0.5, w, h * 0.5); }
  if (img && img.complete && img.naturalWidth > 0) { const pw = w * 0.5, ph = pw * (img.naturalHeight / img.naturalWidth); ctx.drawImage(img, (w - pw) / 2, h * 0.5 - ph * 0.55, pw, ph); }
  ctx.restore();
  block(ctx, f.onScreen, w / 2, h * 0.08, w - pad * 2, w * 0.06, '#ffffff');
  if (f.caption) block(ctx, f.caption, w / 2, h * 0.8, w - pad * 2, w * 0.045, '#ffffff');
  if (f.aiTag) { ctx.font = '500 ' + w * 0.03 + 'px ' + FONT; ctx.fillStyle = '#a9b0a5'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(AI_MADE, pad, h - pad); }
}
