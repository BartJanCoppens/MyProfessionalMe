// Motion Studio (studios plan, Task 2.3): its build runner and what its Produce step shows. The three build steps:
// "Drawing the flow" lays the stages out as scripted boxes and arrows; "Animating each stage" is the one AI call
// (its own use studio_motion through Logic.viaAi, read strictly by readMotionSvg), or without AI the scripted build-in of the same
// boxes; "Writing the text alternative" writes it from the stages, for the creator to edit. Each step's output is the
// drawing after the stage rows in the items (motionBuilt counts how far it got), so a failed step is retried alone and
// a reloaded draft shows its build. A drawing is built for its stages and its length: editing the stages drops it (the
// Draft step keeps rows and questions only), and another "Length?" asks for a new build. After a failed AI step the
// creator may choose the scripted flow instead; it is never chosen for them.
import type { Logic } from './model';
import type { NewDraft } from './types';
import type { BuildCtx, SetNw } from './studioDraft';
import { noItems } from './logic/items';
import type { Item } from './logic/items';
import { motionRequest } from './logic/motionPrompt';
import { drawingOf, motionLayout, readMotionSvg, textAlternative } from './logic/motionSvg';
import { madeLabel } from './logic/provenance';
import type { MotionDrawing } from './logic/motionSvg';
import type { BuildRunner } from './logic/studioBuild';
import { motionProblems, motionSeconds } from './logic/studioContent';
import { labelledRows, stepsOf } from './logic/studios';
import type { StudioEntry } from './logic/studios';

// The Motion Studio's AI use: its preamble asks for one SVG, where studio_draft's asks for JSON items.
const MOTION_USE = 'studio_motion';
export type { BuildCtx };
export const NO_AI = 'AI is not switched on, so the build animates a scripted flow of boxes and arrows from your stages.';
export const UNUSABLE = 'AI did not return a usable animation · retry this step';
export const SCRIPTED_INSTEAD = 'Use the scripted flow instead';

const listOf = (nw: NewDraft) => (nw.items?.list ?? []) as StudioEntry[];
// What a drawing is built from: the stage rows and the length.
const builtFrom = (nw: NewDraft) => JSON.stringify([stepsOf(listOf(nw)), motionSeconds(nw.shape ?? {})]);

// How many build steps the drawing shows done: none (or built for another length), the layout, the animation, the text
// alternative.
export function motionBuilt(list: StudioEntry[], shape: Record<string, string>): number {
  const d = drawingOf(list);
  return !d || d.seconds !== motionSeconds(shape) ? 0 : d.made === 'layout' ? 1 : d.alt.trim() ? 3 : 2;
}

// The one writer of the drawing: next() gets the current one and returns the new one after the stages (null: nothing
// changes). With `from`, nothing changes either when the stages or the length are no longer the ones it was built from.
function putDrawing(setNw: SetNw, next: (d: MotionDrawing | null) => MotionDrawing | null, from?: string) {
  setNw((cur) => {
    const list = listOf(cur), rows = stepsOf(list), d = rows.length && (from === undefined || builtFrom(cur) === from) ? next(drawingOf(list)) : null;
    return d ? { items: { ...(cur.items ?? noItems()), list: [...rows, d] as Item[] } } : {};
  });
}
const scriptedFlow = (nw: NewDraft): MotionDrawing => {
  const stages = labelledRows(listOf(nw)), seconds = motionSeconds(nw.shape ?? {});
  return { svg: motionLayout(stages, seconds, true), alt: textAlternative(stages), made: 'scripted', seconds };
};

export function motionRunner({ L, nw, setNw }: BuildCtx): BuildRunner {
  const stages = labelledRows(listOf(nw)), seconds = motionSeconds(nw.shape ?? {}), from = builtFrom(nw);
  const put = (next: (d: MotionDrawing | null) => MotionDrawing | null) => putDrawing(setNw, next, from);
  const steps = [
    async () => put(() => ({ svg: motionLayout(stages, seconds, false), alt: '', made: 'layout', seconds })),
    async () => {
      const ai = L.aiCan(MOTION_USE);
      const svg = !ai ? motionLayout(stages, seconds, true)
        : await L.viaAi(MOTION_USE, motionRequest({ title: nw.title, take: nw.take, stages, seconds, choices: { ...nw.shape, ...nw.produce }, layout: motionLayout(stages, seconds, false) }), readMotionSvg);
      if (!svg) throw new Error(UNUSABLE);
      put((d) => (d ? { svg, alt: '', made: ai ? 'ai' : 'scripted', seconds } : null));
    },
    async () => put((d) => (d && d.made !== 'layout' ? { ...d, alt: textAlternative(stages) } : null)),
  ];
  return async (_name, index) => {
    if (L.readOnly()) throw new Error('Only the creator can build it');
    await steps[index]();
  };
}

// The Produce step's part for the drawing: who made it, why it is scripted, the scripted flow as a choice after a failed
// AI step, the text alternative once it is animated (with what is wrong), and building it again from the start.
export function motionProduce(L: Logic, nw: NewDraft, setNw: SetNw) {
  const list = listOf(nw), d = drawingOf(list), animated = !!d && d.made !== 'layout', from = builtFrom(nw);
  const failed = d?.made === 'layout' && nw.build?.[1]?.status === 'failed';
  return {
    made: d ? madeLabel(d.made) : '', note: L.aiCan(MOTION_USE) ? '' : NO_AI, problems: animated ? motionProblems(list, nw.shape ?? {}) : [],
    scripted: failed ? { label: SCRIPTED_INSTEAD, run: () => putDrawing(setNw, (x) => (x ? scriptedFlow(nw) : null), from) } : null,
    alt: animated ? { value: d.alt, set: (v: string) => putDrawing(setNw, (x) => (x ? { ...x, alt: v } : null)) } : null,
    restart: () => setNw((cur) => ({ items: { ...(cur.items ?? noItems()), list: stepsOf(listOf(cur)) as Item[] }, build: undefined })),
  };
}
