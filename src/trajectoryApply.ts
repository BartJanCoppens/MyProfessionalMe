// Apply in the "Build with AI" panel (Studios Phase 7, Task 7.4): the accepted modules of the plan written as trajectory steps through the editor's one
// write path (`patch`, so the refusal rules, the shown state and the debounced save are the same as for any edit). Nothing changes the trajectory
// until the admin confirms; the change is computed from the trajectory as it is when it runs, with ids made once here, so a second click, a stale
// render or a save in flight cannot add a module twice.
import type { Logic } from './model';
import { applyPlan, planStepIds, usedOf } from './logic/planApply';
import type { Applied } from './logic/planApply';
import type { Trajectory } from './logic/trajectory';
import { stepTitle } from './logic/trajectoryView';
import type { TrajectoryPlan } from './logic/trajectoryPlan';
import { plural } from './logic/values';
import { LEARN_BY } from './data';
import { patch } from './trajectoryAdminVals';

const titleOf = (id: string) => LEARN_BY[id]?.[1] ?? id;
const panel = (L: Logic, p: Partial<Logic['state']['trjPanel']>) => L.setState((s) => ({ trjPanel: { ...s.trjPanel, ...p } }));

// "Applied · 5 steps added · 1 skipped: <module> (<why>)"
export const appliedToast = (r: Applied): string => {
  const skipped = r.skipped.length ? ' · ' + r.skipped.length + ' skipped: ' + r.skipped.map((s) => s.module + ' (' + s.why + ')').join('; ') : '';
  return ('Applied · ' + plural(r.added, 'step', 'steps') + ' added' + skipped).slice(0, 220);
};

export function applyToTrajectory(L: Logic, trajectoryId: string): void {
  const now = L.latest();
  if (now.readOnly() || now.state.trjAi.busy) return;
  const t = now.state.trjs.find((x) => x.id === trajectoryId), plan = now.state.trjPlans[trajectoryId]?.record?.plan;
  if (!t || !plan) return;
  const ids = planStepIds(t, plan), run = (x: Trajectory) => applyPlan(x, plan, ids, usedOf(x)), result = run(t);
  panel(now, { applying: false });
  if (!result.added) return now.say(appliedToast(result));
  if (patch(now, trajectoryId, (x) => { const r = run(x); return r.added ? { ...x, steps: r.steps } : x; })) now.say(appliedToast(result));
}

// The panel's Apply block: the button, why it is off, and the confirmation that lists what will be added and skipped.
export function applyVals(L: Logic, t: Trajectory, plan: TrajectoryPlan) {
  const accepted = plan.modules.filter((m) => m.accepted).length, busy = !!L.state.trjAi.busy;
  const preview = applyPlan(t, plan, planStepIds(t, plan), usedOf(t));
  const added = preview.steps.slice(t.steps.length).map((s) => stepTitle(s, titleOf));
  return {
    label: 'Apply ' + plural(accepted, 'accepted module', 'accepted modules'), off: !accepted ? 'Accept a module first' : busy ? 'Wait for the AI to answer' : null,
    open: L.state.trjPanel.applying, ask: () => panel(L, { applying: true }), cancel: () => panel(L, { applying: false }), run: () => applyToTrajectory(L, t.id),
    added, skipped: preview.skipped.map((s) => s.module + ' · ' + s.why),
    note: 'Apply adds steps; it never removes or changes one.',
  };
}
