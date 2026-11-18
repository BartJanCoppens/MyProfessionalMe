// Curating the plan by hand in the "Build with AI" panel (Phase 7): accept, edit, move and remove a module, ask the AI about one, and Start over
// (two clicks; the sources and bundles stay). Edits go through editRecord (shown now, saved soon); nothing here changes the trajectory itself.
import type { ChangeEvent } from 'react';
import type { Logic } from './model';
import { acceptModule, applySuggestion, dismissSuggestion, editModule, moveModule, removeModule } from './logic/trajectoryPlan';
import type { PlanModule, TrajectoryPlan } from './logic/trajectoryPlan';
import { emptyPlan } from './logic/trajectoryPlan';
import { startOver as clearStored } from './lib/planStore';
import { mediaUrl } from './lib/mediaStore';
import { change, editRecord, failed } from './trajectoryAiState';

type Patch = Parameters<typeof editModule>[2];
const planEdit = (L: Logic, id: string, f: (p: TrajectoryPlan) => TrajectoryPlan) => { if (!L.readOnly()) editRecord(L, id, (r) => ({ ...r, plan: f(r.plan) })); };
const panel = (L: Logic, p: Partial<Logic['state']['trjPanel']>) => L.setState((s) => ({ trjPanel: { ...s.trjPanel, ...p } }));

export const acceptCard = (L: Logic, id: string, moduleId: string, on: boolean) => planEdit(L, id, (p) => acceptModule(p, moduleId, on));
export const editCard = (L: Logic, id: string, moduleId: string, patch: Patch) => planEdit(L, id, (p) => editModule(p, moduleId, patch));
export const moveCard = (L: Logic, id: string, moduleId: string, by: -1 | 1) => planEdit(L, id, (p) => moveModule(p, moduleId, by));
export const applyCard = (L: Logic, id: string, moduleId: string) => planEdit(L, id, (p) => applySuggestion(p, moduleId));
export const dismissCard = (L: Logic, id: string, moduleId: string) => planEdit(L, id, (p) => dismissSuggestion(p, moduleId));
export function removeCard(L: Logic, id: string, moduleId: string) {
  planEdit(L, id, (p) => removeModule(p, moduleId));
  panel(L, { focus: null, editing: null });
}
// "Ask the AI about this module": the next message is about it.
export const askAbout = (L: Logic, moduleId: string | null) => panel(L, { focus: moduleId });
export const editing = (L: Logic, moduleId: string | null) => panel(L, { editing: moduleId });

// Start over: the first click asks, the second clears the plan and the conversation (the stored copy first, then the screen).
export async function startOver(L: Logic, id: string): Promise<void> {
  if (L.state.trjAi.busy || L.readOnly()) return;
  if (!L.state.trjPanel.confirm) return panel(L, { confirm: true });
  panel(L, { confirm: false, focus: null, editing: null });
  L.setState((s) => ({ trjAi: { ...s.trjAi, busy: 'reset', error: null } }));
  try {
    const record = L.latest().state.trjPlans[id]?.record;
    if (record) await clearStored(id, record.bundleIds);
  } catch (err) { return failed(L, (err as Error).message); }
  change(L, id, (p) => ({ ...p, record: p.record ? { ...p.record, plan: emptyPlan(), messages: [] } : p.record }));
  failed(L, null);
}

// A file citation opens the original PDF through a signed link; a failure is said in words.
export async function openSource(L: Logic, path: string): Promise<void> {
  try { window.open(await mediaUrl(path), '_blank', 'noopener'); } catch (err) { L.say('Could not open the file · ' + (err as Error).message); }
}

// The edit fields of a module card: what the admin typed, as the patch.
export const goalsOf = (text: string): string[] => text.split('\n').map((g) => g.trim()).filter(Boolean);
export const depthFrom = (e: ChangeEvent<HTMLSelectElement>): PlanModule['depth'] => e.target.value as PlanModule['depth'];
