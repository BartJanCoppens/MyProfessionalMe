// One reel frame on a canvas (studios plan, Task 5.3), drawn by the same drawReelFrame the browser compositor uses. It scales to
// its box (210 px wide for 9:16, 260 px for 1:1, as the design) and is labelled with the on-screen text and the caption at t, so
// a screen reader gets what the frame shows.
import { useEffect, useRef, useState } from 'react';
import { reelFrameAt } from '../logic/reelFrame';
import type { CutPlan } from '../logic/reelFrame';
import { drawReelFrame } from '../reel/drawReel';
import { portraitImage } from '../reel/portraits';

export default function ReelCanvas({ plan, t }: { plan: CutPlan; t: number }) {
  const canvas = useRef<HTMLCanvasElement>(null), [img, setImg] = useState<HTMLImageElement | null>(null), portrait = plan.look?.portrait;
  useEffect(() => {
    if (!portrait) return;
    const i = portraitImage(portrait), ready = () => setImg(i);
    i.addEventListener('load', ready);
    return () => i.removeEventListener('load', ready);
  }, [portrait]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawReelFrame(ctx, plan, t, portrait ? img : null);
  }, [plan, t, img, portrait]);
  const f = reelFrameAt(plan, t);
  return (
    <canvas ref={canvas} role="img" aria-label={f.onScreen + (f.caption ? ' · ' + f.caption : '')} width={plan.size.w} height={plan.size.h}
      style={{ width: plan.size.w === plan.size.h ? 260 : 210, maxWidth: '100%', aspectRatio: plan.size.w + '/' + plan.size.h, borderRadius: 6, background: '#171a16', display: 'block' }} />
  );
}
