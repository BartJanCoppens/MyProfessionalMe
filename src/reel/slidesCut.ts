// The Slides video as a cut (studios plan, Task 5.4): 1280 by 720, the deck's own steps (deckSteps, the panel's timeline) with each
// stored voice clip started where its slide starts, and `drawSlideFrame` for the picture. Nothing is uploaded: the author downloads it.
import { deckSteps } from '../logic/slidesContent';
import type { SlidesContent } from '../types';
import { SLIDES_SIZE } from './cutRules';
import type { Cut } from './cutRules';
import { drawSlideFrame } from './drawSlide';
import type { SlidePlan } from './drawSlide';

// `images`: the slides' still drawings by slide index, filled in (loadSlideImages) before the cut is rendered.
export function slidesCut(c: SlidesContent, urls: string[], images: (HTMLImageElement | null)[] = []): { cut: Cut; plan: SlidePlan } {
  const steps = deckSteps(c.slides, urls, c.slides.every((s) => s.audio)), audio: Cut['audio'] = [];
  let start = 0;
  const slides = steps.map((st) => {
    const index = +st.part, s = c.slides[index], at = start;
    if (st.audio) audio.push({ url: st.audio, at });
    start += st.seconds;
    return { index, title: s.title, bullets: s.bullets, start: at, seconds: st.seconds, cues: st.marks.filter((m) => m.kind === 'cue').map((m) => m.at), drawing: !!s.svg };
  });
  const plan: SlidePlan = { size: SLIDES_SIZE, firm: c.template === 'Firm template', voiced: audio.length > 0, slides };
  return { plan, cut: { size: plan.size, seconds: start, audio, music: 'None', draw: (ctx, t) => drawSlideFrame(ctx, plan, t, images) } };
}
