// The placeholder steps as the screens read them (Studios Phase 7, Task 7.5): for one step, "Draft with AI" or the draft already made for it (its status
// from My contributions); for the plan, "Draft all N with AI" and its progress. View as and people who may not change the trajectory get nothing.
import type { Logic } from './model';
import { editDraft } from './createSave';
import { studioOfFormat } from './logic/studios';
import { fromModule } from './logic/planApply';
import type { Trajectory, TrjStep } from './logic/trajectory';
import { draftPlaceholders, openStudioFor } from './trajectoryAiDraft';
import { refusal } from './trajectoryAdminVals';
import { isTaken, ownDraft } from './trajectoryMade';

const STATUS: Record<string, string> = { draft: 'Draft', review: 'In review', changes: 'Changes requested' };
const NOTE: Record<string, string> = { draft: 'Draft saved · not sent for review yet', review: 'Draft in review', changes: 'Changes requested on the draft' };
const canDraft = (L: Logic, t: Trajectory) => !L.subject.readOnly && refusal(L, t) === null;
// The admin's own contribution a placeholder points to (its cid), while it is still a draft, in review or waiting for changes.
const draftOf = (L: Logic, st: TrjStep) => { const c = ownDraft(L, st.cid); return c && STATUS[c.status] ? c : undefined; };
const NOT_YOURS = 'A draft is already linked to this placeholder · not one of yours';

export function madeVals(L: Logic, t: Trajectory, st: TrjStep) {
  const own = canDraft(L, t) ? draftOf(L, st) : undefined, studio = !!studioOfFormat(st.fmt ?? '');
  return {
    status: own ? NOTE[own.status] : isTaken(st) && canDraft(L, t) && !ownDraft(L, st.cid) ? NOT_YOURS : '',
    openLabel: own ? 'Open the draft · ' + STATUS[own.status] : '', open: own ? () => editDraft(L, own) : null,
    draftLabel: 'Draft with AI', draft: !isTaken(st) && studio && canDraft(L, t) ? () => { openStudioFor(L, t.id, st.id); } : null,
  };
}
export const madeOfModule = (L: Logic, t: Trajectory, moduleId: string) =>
  t.steps.filter((st) => st.k === 'make' && st.from === fromModule(moduleId)).map((st) => ({ key: st.id, text: (st.title ?? '') + ' · ' + (st.fmt ?? ''), ...madeVals(L, t, st) }));

// "Draft all N with AI": the placeholders no draft of the admin's is waiting on; while it runs, how far it is.
export function draftAllVals(L: Logic, t: Trajectory) {
  const todo = t.steps.filter((st) => st.k === 'make' && studioOfFormat(st.fmt ?? '') && !isTaken(st)), on = L.state.trjAi.drafting;
  if (!canDraft(L, t) || (todo.length < 2 && !on)) return null;
  return { label: 'Draft all ' + todo.length + ' with AI', progress: on ? 'Drafting ' + Math.min(on.done + 1, on.total) + ' of ' + on.total : '',
    off: L.state.trjAi.busy ? 'Wait for the AI to finish' : null, run: () => { draftPlaceholders(L, t.id, todo.map((st) => st.id)); },
    note: 'One AI call for each, one after the other, stopping at the daily limit. Each lands in My contributions as a draft: check it, then send it for review.' };
}
