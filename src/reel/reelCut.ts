// The Reel's final cut as a cut for the one compositor (studios plan, Task 5.5): the reel content's size and clock, each stored voice clip
// started where its scene starts, the music chosen, and the frames drawn by drawReelFrame (the preview's own draw function). The cut is
// stored, so it carries the media bucket's size limit and an estimate over it is refused before anything renders.
import type { ReelContent } from '../types';
import { cutPlanOf } from '../logic/reelFrame';
import { VIDEO_MAX_BYTES } from './cutRules';
import type { Cut } from './cutRules';
import { drawReelFrame } from './drawReel';
import { portraitImage } from './portraits';
import type { PortraitKey } from './portraits';

// `urls`: the signed links of the scenes' voice clips in scene order (none for a reel told by text); `img`: the stock look's drawn portrait, loaded.
export function reelCut(c: ReelContent, urls: string[], img: HTMLImageElement | null): Cut {
  const plan = cutPlanOf(c);
  return { size: plan.size, seconds: c.seconds, music: c.music, maxBytes: VIDEO_MAX_BYTES, audio: c.scenes.flatMap((s, k) => (urls[k] ? [{ url: urls[k], at: s.start }] : [])),
    draw: (ctx, t) => drawReelFrame(ctx, plan, t, img) };
}

// The portrait as an image that has loaded; null when it could not.
export const loadPortrait = (key: PortraitKey): Promise<HTMLImageElement | null> => new Promise((resolve) => {
  const img = portraitImage(key);
  img.onload = () => resolve(img); img.onerror = () => resolve(null);
  if (img.complete && img.naturalWidth > 0) resolve(img);
});
