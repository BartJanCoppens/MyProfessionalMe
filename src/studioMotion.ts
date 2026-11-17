// Motion Studio (studios plan, Task 2.3): its build runner and what its Produce step shows. The three build steps:
// "Drawing the flow" lays the stages out as scripted boxes and arrows; "Animating each stage" is the one AI call
// (studio_draft through Logic.viaAi, read strictly by readMotionSvg), or without AI the scripted build-in of the same
// boxes; "Writing the text alternative" writes it from the stages, for the creator to edit. Each step's output is the
// drawing after the stage rows in the items (motionBuilt counts how far it got), so a failed step is retried alone and
// a reloaded draft shows its build. Editing the stages drops the drawing (the Draft step keeps rows and questions only).
import type { Logic } from './model';
import type { NewDraft } from './types';
import type { SetNw } from './studioDraft';
import { noItems } from './logic/items';
import type { Item } from './logic/items';
import { motionRequest } from './logic/motionPrompt';
import { MADE_LABEL, drawingOf, motionLayout, readMotionSvg, textAlternative } from './logic/motionSvg';
import type { MotionDrawing } from './logic/motionSvg';
import type { BuildRunner } from './logic/studioBuild';
import { motionProblems, motionSeconds } from './logic/studioContent';
import { stepsOf } from './logic/studios';
import type { StudioEntry } from './logic/studios';

export type BuildCtx = { L: Logic; nw: NewDraft; setNw: SetNw };
export const NO_AI = 'AI is not switched on, so the build animates a scripted flow of boxes and arrows from your stages.';
export const UNUSABLE = 'AI did not return a usable animation · retry this step';

const listOf = (nw: NewDraft) => (nw.items?.list ?? []) as StudioEntry[];
const stagesOf = (nw: NewDraft) => stepsOf(listOf(nw)).map(([label, text]) => ({ label, text }));

// How many build steps the drawing shows done: none, the layout, the animation, the text alternative.
export function motionBuilt(list: StudioEntry[]): number {
  const d = drawingOf(list);
  return !d ? 0 : d.made === 'layout' ? 1 : d.alt.trim() ? 3 : 2;
}

// Puts the drawing after the stages; nothing changes when the stages are no longer the ones it was built from, or when
// next() has nothing to build on.
function putDrawing(setNw: SetNw, built: string, next: (d: MotionDrawing | null) => MotionDrawing | null) {
  setNw((cur) => {
    const list = listOf(cur), rows = stepsOf(list), d = rows.length && JSON.stringify(rows) === built ? next(drawingOf(list)) : null;
    return d ? { items: { ...(cur.items ?? noItems()), list: [...rows, d] as Item[] } } : {};
  });
}

export function motionRunner({ L, nw, setNw }: BuildCtx): BuildRunner {
  const stages = stagesOf(nw), seconds = motionSeconds(nw.shape ?? {}), built = JSON.stringify(stepsOf(listOf(nw)));
  const put = (next: (d: MotionDrawing | null) => MotionDrawing | null) => putDrawing(setNw, built, next);
  const steps = [
    async () => put(() => ({ svg: motionLayout(stages, seconds, false), alt: '', made: 'layout' })),
    async () => {
      const ai = L.aiCan('studio_draft');
      const svg = !ai ? motionLayout(stages, seconds, true)
        : await L.viaAi('studio_draft', motionRequest({ title: nw.title, take: nw.take, stages, seconds, choices: { ...nw.shape, ...nw.produce }, layout: motionLayout(stages, seconds, false) }), readMotionSvg);
      if (!svg) throw new Error(UNUSABLE);
      put((d) => (d ? { svg, alt: '', made: ai ? 'ai' : 'scripted' } : null));
    },
    async () => put((d) => (d && d.made !== 'layout' ? { ...d, alt: textAlternative(stages) } : null)),
  ];
  return async (_name, index) => {
    if (L.readOnly()) throw new Error('Only the creator can build it');
    await steps[index]();
  };
}

// The Produce step's part for the drawing: who made it, why it is scripted, the text alternative once it is animated
// (with what is wrong with it), and building it again from the start.
export function motionProduce(L: Logic, nw: NewDraft, setNw: SetNw) {
  const d = drawingOf(listOf(nw)), animated = !!d && d.made !== 'layout';
  const keep = (cur: NewDraft) => ({ ...(cur.items ?? noItems()), list: stepsOf(listOf(cur)) as Item[] });
  return {
    made: d ? MADE_LABEL[d.made] : '', note: L.aiCan('studio_draft') ? '' : NO_AI, problems: animated ? motionProblems(listOf(nw)) : [],
    alt: animated ? { value: d.alt, set: (v: string) => setNw((cur) => { const x = drawingOf(listOf(cur)), k = keep(cur); return x ? { items: { ...k, list: [...k.list, { ...x, alt: v }] } } : {}; }) } : null,
    restart: () => setNw((cur) => ({ items: keep(cur), build: undefined })),
  };
}
