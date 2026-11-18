// A slide's drawing as a still image for the Slides video. It goes through the one sanitiser (the same as SafeSvg) and is
// loaded as an <img>: nothing in it runs there, and SMIL animation does not play in an image (the panel says so on screen).
import { instance, sanitizeSvg } from '../logic/sanitizeSvg';

const VIEW_BOX = '0 0 640 320';

// The drawing as a data URL for an image, or null when nothing survives the sanitiser.
export function svgImageSource(svg: string): string | null {
  const clean = svg ? sanitizeSvg(svg) : '';
  if (!clean) return null;
  const doc = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + VIEW_BOX + '" width="640" height="320">' + instance(clean, 'pmv') + '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc);
}

// One image per slide, in order; null where a slide has no drawing or it could not be loaded.
export const loadSlideImages = (svgs: (string | undefined)[]): Promise<(HTMLImageElement | null)[]> =>
  Promise.all(svgs.map((svg) => new Promise<HTMLImageElement | null>((resolve) => {
    const src = svg ? svgImageSource(svg) : null;
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src;
  })));
