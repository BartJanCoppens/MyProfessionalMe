// The "Build with AI" panel's view-model (vm.tai; null while closed or with no trajectory): the stage, the conversation, the brief, the module
// cards with their citations, the sources and bundle picker, and the actions. The panel (screens/TrajectoryAi.tsx) only reads this. It shows the
// trajectory selected in the editor; View as shows the plan with nothing to change.
import type { ChangeEvent } from 'react';
import type { Logic } from './model';
import { bundlePicker, usableBundles } from './createGrounding';
import { fmtHours } from './logic/trajectoryView';
import { emptyPlan, planProblems } from './logic/trajectoryPlan';
import type { Dropped, PlanBrief, PlanMessage } from './logic/trajectoryPlan';
import { plural } from './logic/values';
import { moduleCards } from './trajectoryAiCards';
import { applyVals } from './trajectoryApply';
import { draftAllVals } from './trajectoryMadeVals';
import { askAbout, startOver } from './trajectoryAiCurate';
import { pickBundle, sourcesPanel } from './trajectoryAiSources';
import { sendToPlan, OFF_TEXT, TRAJECTORY_AI } from './trajectoryAiSend';
import { refusal, selectedTrajectory } from './trajectoryAdminVals';

export const STAGE_NAMES = ['Brief', 'Plan', 'Curate'];
const BRIEF_LABELS: [keyof PlanBrief, string][] = [['goal', 'Goal'], ['credential', 'Credential'], ['issuer', 'Issuer'], ['audience', 'Audience'], ['stage', 'Career stage'], ['line', 'Business line'],
  ['level', 'Level'], ['hoursBudget', 'Hours budget'], ['deadline', 'Deadline'], ['bodyRules', 'Body rules'], ['constraints', 'Constraints'], ['domain', 'Domain']];

// What the AI left out of a reply, in words (the reply is shown as text; these are the app's own words).
export const droppedNotes = (d: Dropped | undefined): string[] => d ? [
  d.sources ? `The AI cited ${plural(d.sources, 'source', 'sources')} it was not given · removed` : '',
  d.learnings ? `The AI proposed ${plural(d.learnings, 'learning', 'learnings')} that ${d.learnings === 1 ? 'is' : 'are'} not in the library · removed` : '',
  d.formats ? `The AI proposed ${plural(d.formats, 'format', 'formats')} that ${d.formats === 1 ? 'does' : 'do'} not exist · removed` : '',
].filter(Boolean) : [];

// What the merge left alone for the admin, in words.
export const mergedNotes = (m: PlanMessage['merged']): string[] => m ? [
  m.kept ? `The AI left out ${plural(m.kept, 'accepted module', 'accepted modules')} · kept` : '',
  m.suggested ? `The AI suggests changes to ${plural(m.suggested, 'accepted module', 'accepted modules')} · yours until you apply them` : '',
].filter(Boolean) : [];

export function trajectoryAiVals(L: Logic) {
  const s = L.state, t = selectedTrajectory(L);
  if (!s.trjPanel.open || !t) return { tai: null };
  const id = t.id, state = s.trjPlans[id], record = state?.record ?? null, plan = record?.plan ?? emptyPlan(), canEdit = !L.subject.readOnly && refusal(L, t) === null;
  const titleOf = (moduleId: string | null | undefined) => plan.modules.find((m) => m.id === moduleId)?.title ?? null;
  const message = (m: PlanMessage, key: number) => ({ key, mine: m.role === 'admin', who: m.role === 'admin' ? 'You' : 'AI', text: m.text, about: titleOf(m.focus), notes: [...droppedNotes(m.dropped), ...mergedNotes(m.merged)] });
  const bundles = usableBundles(s.bundles, t.business_line);
  const picker = bundlePicker({
    usable: bundles, picked: record?.bundleIds ?? [], query: s.trjPanel.kbq, piece: { title: t.name, dom: plan.brief?.domain ?? '', line: t.business_line ?? '' },
    setQuery: (e) => L.setState((st) => ({ trjPanel: { ...st.trjPanel, kbq: e.target.value } })),
    add: (b) => { pickBundle(L, id, b, true); L.setState((st) => ({ trjPanel: { ...st.trjPanel, kbq: '' } })); }, remove: (b) => pickBundle(L, id, b, false),
    none: 'No knowledge bundles are available for this line yet.', popular: 'Most used',
  });
  const stage = !plan.brief ? 0 : plan.modules.length ? 2 : 1;
  const fe = plan.finalExam;
  return {
    tai: {
      id, name: t.name, canEdit, loading: !state, busy: s.trjAi.busy === 'send', working: !!s.trjAi.busy, error: s.trjAi.error, off: L.aiCan(TRAJECTORY_AI) ? null : OFF_TEXT,
      stages: STAGE_NAMES, stage, messages: (record?.messages ?? []).map(message), say: s.trjPanel.say, setSay: (e: ChangeEvent<HTMLTextAreaElement>) => L.setState((st) => ({ trjPanel: { ...st.trjPanel, say: e.target.value } })),
      send: () => { sendToPlan(L, id, s.trjPanel.say, 'talk', s.trjPanel.focus); }, propose: () => { sendToPlan(L, id, s.trjPanel.say, 'propose', null); }, canPropose: !!plan.brief,
      focusTitle: titleOf(s.trjPanel.focus), clearFocus: () => askAbout(L, null),
      brief: plan.brief ? BRIEF_LABELS.flatMap(([k, label]) => (plan.brief![k] === null || plan.brief![k] === '' ? [] : [{ label, value: String(plan.brief![k]) }])) : null,
      modules: moduleCards(L, t, plan, state?.sources ?? [], canEdit), problems: planProblems(plan), apply: applyVals(L, t, plan), draftAll: draftAllVals(L, t),
      finalExam: fe ? { title: fe.title, hoursLabel: 'about ' + fmtHours(fe.hours) + ' · a proposal', reason: fe.reason } : null,
      sources: { ...sourcesPanel(L, id), error: null }, picker, // one error line for the whole panel (trjAi.error), shown by the panel
      startOver: { confirm: s.trjPanel.confirm, run: () => { startOver(L, id); }, cancel: () => L.setState((st) => ({ trjPanel: { ...st.trjPanel, confirm: false } })) },
      close: () => L.setState((st) => ({ trjPanel: { ...st.trjPanel, open: false, focus: null, editing: null, confirm: false, applying: false } })),
    },
  };
}
export type Tai = NonNullable<ReturnType<typeof trajectoryAiVals>['tai']>;
