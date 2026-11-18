// What a placeholder step ("being made") gives the person who edits its trajectory (Studios Phase 7, Task 7.5): the creation grant for its material
// (mirror of private.may_create's placeholder branch) and the link from the step to the draft made for it. Both go through the trajectory editor's rules.
import type { Logic } from './model';
import type { RuleParts } from './logic/contribution';
import { placeholderRules } from './logic/planDraft';
import type { DraftBrief } from './types';
import { patch, refusal } from './trajectoryAdminVals';

export type PlaceholderRef = Pick<DraftBrief, 'trajectoryId' | 'stepId'>;

// The one rule the placeholder gives, for someone who may change its trajectory and is not viewing as someone else; none otherwise.
export function grantRules(L: Logic, ref: PlaceholderRef | undefined, format: string): RuleParts[] {
  const t = ref && L.state.trjs.find((x) => x.id === ref.trajectoryId);
  return t && !L.subject.readOnly && refusal(L, t) === null ? placeholderRules(t, ref.stepId, format) : [];
}

// Sets the placeholder's cid to its draft when it has none, or when its cid is not one of the admin's own contributions (the draft was deleted).
// Returns why it was not linked, or null (linked, or nothing to do).
export function linkMadeStep(L: Logic, trajectoryId: string, stepId: string, contributionId: string): string | null {
  const now = L.latest(), t = now.state.trjs.find((x) => x.id === trajectoryId), step = t?.steps.find((s) => s.id === stepId && s.k === 'make');
  if (!t || !step) return 'the placeholder is no longer in the trajectory';
  const own = new Set((now.state.create?.contributions ?? []).filter((c) => c.author_id === now.access.userId).map((c) => c.id));
  if (step.cid && own.has(step.cid)) return null;
  const why = refusal(now, t);
  if (why) return why;
  patch(now, trajectoryId, (x) => ({ ...x, steps: x.steps.map((s) => (s.id === stepId && s.k === 'make' ? { ...s, cid: contributionId } : s)) }));
  return null;
}
