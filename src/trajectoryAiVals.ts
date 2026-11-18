// The "Build with AI" panel's view-model (vm.tai; null while closed or with no trajectory): the stage, the conversation, the brief, the module
// cards with their citations, the sources and bundle picker, and the actions. The panel (screens/TrajectoryAi.tsx) only reads this. It shows the
// trajectory selected in the editor; View as shows the plan with nothing to change.
import type { ChangeEvent } from 'react';
import type { Logic } from './model';
import { LEARN_BY } from './data';
import { bundlePicker, usableBundles } from './createGrounding';
import { fmtHours } from './logic/trajectoryView';
import { DEPTHS, emptyPlan, planProblems } from './logic/trajectoryPlan';
import type { Dropped, PlanBrief, PlanMaterial, PlanMessage, PlanModule } from './logic/trajectoryPlan';
import { acceptCard, askAbout, depthFrom, editCard, editing, goalsOf, moveCard, openSource, removeCard, startOver } from './trajectoryAiCurate';
import { pickBundle, sourcesPanel } from './trajectoryAiSources';
import { sendToPlan, OFF_TEXT, TRAJECTORY_AI } from './trajectoryAiSend';
import { refusal, selectedTrajectory } from './trajectoryAdminVals';

export const STAGE_NAMES = ['Brief', 'Plan', 'Curate'];
const CHECK_WORDS = { evidence: 'evidence', signoff: 'counsellor sign-off' } as const;
const BRIEF_LABELS: [keyof PlanBrief, string][] = [['goal', 'Goal'], ['credential', 'Credential'], ['issuer', 'Issuer'], ['audience', 'Audience'], ['stage', 'Career stage'], ['line', 'Business line'],
  ['level', 'Level'], ['hoursBudget', 'Hours budget'], ['deadline', 'Deadline'], ['bodyRules', 'Body rules'], ['constraints', 'Constraints'], ['domain', 'Domain']];
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
const depthName = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

// What the AI left out of a reply, in words (the reply is shown as text; these are the app's own words).
export const droppedNotes = (d: Dropped | undefined): string[] => d ? [
  d.sources ? `The AI cited ${plural(d.sources, 'source', 'sources')} it was not given · removed` : '',
  d.learnings ? `The AI proposed ${plural(d.learnings, 'learning', 'learnings')} that ${d.learnings === 1 ? 'is' : 'are'} not in the library · removed` : '',
  d.formats ? `The AI proposed ${plural(d.formats, 'format', 'formats')} that ${d.formats === 1 ? 'does' : 'do'} not exist · removed` : '',
].filter(Boolean) : [];

const materialText = (x: PlanMaterial) => (x.kind === 'existing' ? 'In the library · ' + (LEARN_BY[x.learningId]?.[1] ?? x.learningId) : x.kind === 'studio' ? 'To create · ' + x.format : 'Manual · ' + x.format);

export function trajectoryAiVals(L: Logic) {
  const s = L.state, t = selectedTrajectory(L);
  if (!s.trjPanel.open || !t) return { tai: null };
  const id = t.id, state = s.trjPlans[id], record = state?.record ?? null, plan = record?.plan ?? emptyPlan(), canEdit = !L.subject.readOnly && refusal(L, t) === null;
  const titleOf = (moduleId: string | null | undefined) => plan.modules.find((m) => m.id === moduleId)?.title ?? null;
  const pathOf = (sourceId: string) => state?.sources.find((x) => x.id === sourceId)?.path ?? null;
  const card = (m: PlanModule, i: number) => {
    const isEditing = s.trjPanel.editing === m.id;
    return {
      id: m.id, n: i + 1, title: m.title, goals: m.goals, accepted: m.accepted, depth: m.depth, hours: m.hours, depthLabel: depthName(m.depth) + ' · a proposal', hoursLabel: 'about ' + fmtHours(m.hours) + ' · a proposal',
      material: m.material.map((x) => ({ text: materialText(x), reason: x.reason })),
      sources: m.sources.map((c) => { const path = c.ref.kind === 'file' ? pathOf(c.ref.sourceId) : null;
        return { key: JSON.stringify(c.ref), label: c.ref.kind === 'learning' ? 'Learning · ' + c.label : c.label, quote: c.quote, open: path ? () => { openSource(L, path); } : null }; }),
      checks: m.checks.map((k) => CHECK_WORDS[k]).join(' · '), noUp: i === 0, noDown: i === plan.modules.length - 1, editing: isEditing, canEdit,
      accept: () => acceptCard(L, id, m.id, !m.accepted), up: () => moveCard(L, id, m.id, -1), down: () => moveCard(L, id, m.id, 1), remove: () => removeCard(L, id, m.id),
      ask: () => askAbout(L, m.id), toggleEdit: () => editing(L, isEditing ? null : m.id),
      setTitle: (e: ChangeEvent<HTMLInputElement>) => editCard(L, id, m.id, { title: e.target.value }),
      setGoals: (e: ChangeEvent<HTMLTextAreaElement>) => editCard(L, id, m.id, { goals: goalsOf(e.target.value) }),
      setHours: (e: ChangeEvent<HTMLInputElement>) => { const n = Number(e.target.value); if (e.target.value.trim() && Number.isFinite(n) && n !== m.hours) editCard(L, id, m.id, { hours: n }); },
      setDepth: (e: ChangeEvent<HTMLSelectElement>) => editCard(L, id, m.id, { depth: depthFrom(e) }),
      depthOptions: DEPTHS.map((d) => ({ value: d, label: depthName(d) })),
    };
  };
  const message = (m: PlanMessage, key: number) => ({ key, mine: m.role === 'admin', who: m.role === 'admin' ? 'You' : 'AI', text: m.text, about: titleOf(m.focus), notes: droppedNotes(m.dropped) });
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
      modules: plan.modules.map(card), problems: planProblems(plan),
      finalExam: fe ? { title: fe.title, hoursLabel: 'about ' + fmtHours(fe.hours) + ' · a proposal', reason: fe.reason } : null,
      sources: { ...sourcesPanel(L, id), error: null }, picker, // one error line for the whole panel (trjAi.error), shown by the panel
      startOver: { confirm: s.trjPanel.confirm, run: () => { startOver(L, id); }, cancel: () => L.setState((st) => ({ trjPanel: { ...st.trjPanel, confirm: false } })) },
      close: () => L.setState((st) => ({ trjPanel: { ...st.trjPanel, open: false, focus: null, editing: null, confirm: false } })),
    },
  };
}
export type Tai = NonNullable<ReturnType<typeof trajectoryAiVals>['tai']>;
