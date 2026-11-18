// What a placeholder step ("being made") gives the person who edits its trajectory (Studios Phase 7, Task 7.5): the creation grant for its material
// (mirror of private.may_create's placeholder branch) and the link from the step to the draft made for it. Both go through the trajectory editor's rules.
import type { Logic } from './model';
import type { RuleParts } from './logic/contribution';
import { placeholderRules } from './logic/planDraft';
import type { DraftBrief } from './types';
import { plural } from './logic/values';
import type { NewDraft } from './types';
import { patch, refusal } from './trajectoryAdminVals';

export type PlaceholderRef = Pick<DraftBrief, 'trajectoryId' | 'stepId'>;

// The one rule the placeholder gives, for someone who may change its trajectory and is not viewing as someone else; none otherwise.
// A placeholder that already has a draft of the admin's (other than `thisId`, the draft being saved) gives none: one draft per placeholder.
export function grantRules(L: Logic, ref: PlaceholderRef | undefined, format: string, thisId?: string | null): RuleParts[] {
  const t = ref && L.state.trjs.find((x) => x.id === ref.trajectoryId), cid = t?.steps.find((s) => s.id === ref?.stepId)?.cid;
  if (cid && cid !== thisId && ownIds(L).has(cid)) return [];
  return t && !L.subject.readOnly && refusal(L, t) === null ? placeholderRules(t, ref.stepId, format) : [];
}
const ownIds = (L: Logic) => new Set((L.state.create?.contributions ?? []).filter((c) => c.author_id === L.access.userId).map((c) => c.id));

// Sets the placeholder's cid to its draft when it has none, or when its cid is not one of the admin's own contributions (the draft was deleted).
// Returns why it was not linked, or null (linked, or nothing to do).
export function linkMadeStep(L: Logic, trajectoryId: string, stepId: string, contributionId: string): string | null {
  const now = L.latest(), t = now.state.trjs.find((x) => x.id === trajectoryId), step = t?.steps.find((s) => s.id === stepId && s.k === 'make');
  if (!t || !step) return 'the placeholder is no longer in the trajectory';
  if (step.cid && step.cid !== contributionId && ownIds(now).has(step.cid)) return 'it already has a draft of yours';
  if (step.cid === contributionId) return null;
  const why = refusal(now, t);
  if (why) return why;
  patch(now, trajectoryId, (x) => ({ ...x, steps: x.steps.map((s) => (s.id === stepId && s.k === 'make' ? { ...s, cid: contributionId } : s)) }));
  return null;
}

// The studio's line about where a placeholder's draft comes from (honest UI: what was filled in, and that the creator checks it); '' for any other draft.
export function planBanner(L: Logic, nw: NewDraft): string {
  const b = nw.brief, t = b && L.state.trjs.find((x) => x.id === b.trajectoryId);
  if (!b || !t) return '';
  return 'From the trajectory ' + t.name + ' · ' + (b.goals.length || b.passages.length
    ? 'module ' + nw.title + ' · goals, depth and ' + plural(b.sources.length, 'cited source', 'cited sources') + ' are filled in · check every item' : 'the material for the placeholder ' + nw.title);
}
