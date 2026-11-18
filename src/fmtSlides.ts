// The Slides panel as view-model (studios plan, Task 3.4): the slides, how the deck is told (every slide's stored AI voice, or
// captions at a reading pace), the template and transitions chosen, and completion: playing it to the end completes it (media).
// With ?motion=off or reduced motion the panel fades between slides. The Slides Studio's preview and the review views run the
// same view with nothing saved (studioPreviews.tsx).
import { completedToast, detailOf, saveDetail } from './fmtShared';
import { stillMotion } from './fmtMotion';
import { slidesLine } from './logic/slidesContent';
import { PACE } from './logic/narration';
import type { Item, Logic } from './model';
import type { SlidesContent } from './types';

// ro: View as (nothing is saved); done: already played to the end; onEnd: the last slide finished.
export type SlidesOpts = { ro: boolean; still: boolean; done: boolean; onEnd: () => void };

export function slidesView(c: SlidesContent, o: SlidesOpts) {
  const voiced = c.slides.every((s) => s.audio);
  return {
    slides: c.slides, voiced, template: c.template, transitions: c.transitions, still: o.still,
    paths: voiced ? c.slides.map((s) => s.audio!.path) : [],
    sub: slidesLine(c) + ' · ' + (voiced ? 'AI voice · Made with AI' : 'Captions only'),
    way: voiced ? 'Narrated with an AI voice · Made with AI' : 'Captions only · no voice: each slide is read at ' + PACE + ' words a minute',
    note: o.ro ? 'Viewing someone else: playing it completes nothing.' : '',
    onEnd: () => { if (!o.ro && !o.done) o.onEnd(); },
  };
}
export type SlidesView = ReturnType<typeof slidesView>;

export function slidesVals(L: Logic, it: Item, c: SlidesContent) {
  const saved = detailOf<'slides'>(L, it.id);
  return slidesView(c, { ro: L.subject.readOnly, still: stillMotion(L), done: !!saved.last || it.state === 'accepted',
    onEnd: () => saveDetail(L, it, { ...saved, last: true }, { complete: true, done: completedToast(it, 'Played to the end') }) });
}
