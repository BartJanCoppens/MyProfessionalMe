// The Animated flow's panel as view-model (studios plan, Task 2.3): the drawing, its stages and the caption of the stage in
// focus at a moment (stageAt, the same cues the drawing was made with), who made it, and completion. The clock itself is
// the drawing's own SMIL timeline, run by the panel (AnimatedFlowPanel.tsx); only completion goes through Logic. The
// learner completes it by playing it to the end or by reading the text version; with ?motion=off or reduced motion the
// panel shows the last frame and the text version. The Motion Studio's preview runs the same view and saves nothing.
import { completedToast, detailOf, saveDetail } from './fmtShared';
import { MADE_LABEL, stageAt } from './logic/motionSvg';
import type { Item, Logic } from './model';
import type { MotionContent } from './types';

// Motion is off with ?motion=off, or when the device asks for reduced motion.
const reducedMotion = () => typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)')?.matches;
export const stillMotion = (L: Logic) => L.props.motion === false || reducedMotion();

// ro: View as (nothing is saved); done: already completed; onEnd: played to the end; onRead: the text version read.
export type FlowOpts = { ro: boolean; still: boolean; done: boolean; onEnd: () => void; onRead: () => void };

export function flowView(c: MotionContent, o: FlowOpts) {
  const n = c.stages.length, open = !o.ro && !o.done;
  return {
    svg: c.svg, alt: c.alt, seconds: c.seconds, still: o.still,
    sub: n + ' stages · ' + c.seconds + ' s · ' + MADE_LABEL[c.made],
    caption: (t: number) => { const k = stageAt(n, c.seconds, t), s = c.stages[k]; return { pos: 'Stage ' + (k + 1) + ' of ' + n + ' · ' + s.label, text: s.text }; },
    stillNote: o.still ? 'Motion is off, so this shows the last frame. The text version tells the whole flow.' : '',
    onEnd: () => { if (open) o.onEnd(); },
    read: open ? { label: 'Done reading', run: o.onRead } : null,
  };
}
export type FlowView = ReturnType<typeof flowView>;

export function flowVals(L: Logic, it: Item, c: MotionContent) {
  const saved = detailOf<'motion'>(L, it.id);
  return flowView(c, { ro: L.subject.readOnly, still: stillMotion(L), done: !!(saved.played || saved.read),
    onEnd: () => saveDetail(L, it, { ...saved, played: true }, { complete: true, done: completedToast(it, 'Played to the end') }),
    onRead: () => saveDetail(L, it, { ...saved, read: true }, { complete: true, done: completedToast(it, 'Text version read') }) });
}
