// What the Trajectory AI's sources (trajectoryAiSources.ts), conversation (trajectoryAiSend.ts) and curating (trajectoryAiCurate.ts) share:
// the plan state per trajectory id, and the one way an edit of a plan record is shown and saved. State goes through the functional setState
// on trjPlans[id] (a screen may have moved on while a call or a PDF was in flight).
import type { Logic } from './model';
import { emptyPlan } from './logic/trajectoryPlan';
import type { PlanRecord, TrjPlanState } from './logic/trajectoryPlan';
import { savePlanSoon } from './lib/planStore';

export const emptyPlanState = (): TrjPlanState => ({ record: null, sources: [] });
export const blankRecord = (trajectoryId: string): PlanRecord => ({ trajectoryId, plan: emptyPlan(), messages: [], bundleIds: [], updatedAt: null });
export const failed = (L: Logic, error: string | null) => L.setState((s) => ({ trjAi: { ...s.trjAi, busy: null, error } }));
export const change = (L: Logic, id: string, f: (p: TrjPlanState) => TrjPlanState) => L.setState((s) => ({ trjPlans: { ...s.trjPlans, [id]: f(s.trjPlans[id] ?? emptyPlanState()) } }));

// An edit of the plan record of one trajectory (made on the first edit): shown now, saved soon (the last edit wins). `f` is pure: it runs on the
// latest record for the save and again inside the state update.
export function editRecord(L: Logic, trajectoryId: string, f: (r: PlanRecord) => PlanRecord): void {
  const next = f(L.latest().state.trjPlans[trajectoryId]?.record ?? blankRecord(trajectoryId));
  change(L, trajectoryId, (p) => ({ ...p, record: f(p.record ?? blankRecord(trajectoryId)) }));
  savePlanSoon(next, (message) => L.say(message));
}
