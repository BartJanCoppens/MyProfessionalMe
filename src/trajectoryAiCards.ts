// The module cards of the "Build with AI" panel as the screen reads them (split out of trajectoryAiVals.ts): labelled proposals, the citations as
// they resolve NOW (one lookup, planPool's liveIndex), the AI's suggestion for an accepted module, and the admin's actions on each card.
import type { ChangeEvent } from 'react';
import type { Logic } from './model';
import { LEARN_BY, LEARN_META } from './data';
import { isApplied } from './logic/planApply';
import { liveIndex } from './logic/planPool';
import type { Trajectory } from './logic/trajectory';
import { fmtHours } from './logic/trajectoryView';
import { DEPTHS, refKey } from './logic/trajectoryPlan';
import type { CitedSource, ModuleSuggestion, PlanMaterial, PlanModule, PlanSource, TrajectoryPlan } from './logic/trajectoryPlan';
import { acceptCard, applyCard, askAbout, depthFrom, dismissCard, editCard, editing, goalsOf, moveCard, openSource, removeCard } from './trajectoryAiCurate';

const CHECK_WORDS = { evidence: 'evidence', signoff: 'counsellor sign-off' } as const;
export const depthName = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);
const materialText = (x: PlanMaterial) => (x.kind === 'existing' ? 'In the library · ' + (LEARN_BY[x.learningId]?.[1] ?? x.learningId) : x.kind === 'studio' ? 'To create · ' + x.format : 'Manual · ' + x.format);
const hoursLabel = (h: number) => 'about ' + fmtHours(h) + ' · a proposal';
const suggestionView = (s: ModuleSuggestion) => ({ title: s.title, depthLabel: depthName(s.depth) + ' · a proposal', hoursLabel: hoursLabel(s.hours), goals: s.goals });

// What a citation resolves to now: a learning that is published, a passage still in a known bundle (usable) or a plan document. Else it is gone.
export function citationViews(L: Logic, sources: PlanSource[], cited: CitedSource[]) {
  const live = liveIndex(L.state.bundles, sources);
  return cited.map((c) => {
    const here = c.ref.kind === 'learning' ? !!LEARN_BY[c.ref.learningId] && (LEARN_META[c.ref.learningId]?.status ?? 'published') === 'published' : live.has(refKey(c.ref));
    const path = c.ref.kind === 'file' && here ? sources.find((x) => x.id === (c.ref as { sourceId: string }).sourceId)?.path ?? null : null;
    const label = c.ref.kind === 'learning' ? 'Learning · ' + c.label : c.label;
    return { key: refKey(c.ref), label: here ? label : label + ' · no longer available', quote: here ? c.quote : '', gone: !here, open: path ? () => { openSource(L, path); } : null };
  });
}

export function moduleCards(L: Logic, t: Trajectory, plan: TrajectoryPlan, sources: PlanSource[], canEdit: boolean) {
  const open = L.state.trjPanel.editing, id = t.id;
  return plan.modules.map((m: PlanModule, i) => {
    const cites = citationViews(L, sources, m.sources);
    return {
      id: m.id, n: i + 1, applied: isApplied(t, m.id), title: m.title, goals: m.goals, accepted: m.accepted, depth: m.depth, hours: m.hours, depthLabel: depthName(m.depth) + ' · a proposal', hoursLabel: hoursLabel(m.hours),
      material: m.material.map((x) => ({ text: materialText(x), reason: x.reason })), sources: cites, noSource: cites.every((c) => c.gone),
      suggestion: m.suggestion ? suggestionView(m.suggestion) : null, applySuggestion: () => applyCard(L, id, m.id), dismissSuggestion: () => dismissCard(L, id, m.id),
      checks: m.checks.map((k) => CHECK_WORDS[k]).join(' · '), noUp: i === 0, noDown: i === plan.modules.length - 1, editing: open === m.id, canEdit,
      accept: () => acceptCard(L, id, m.id, !m.accepted), up: () => moveCard(L, id, m.id, -1), down: () => moveCard(L, id, m.id, 1), remove: () => removeCard(L, id, m.id),
      ask: () => askAbout(L, m.id), toggleEdit: () => editing(L, open === m.id ? null : m.id),
      setTitle: (e: ChangeEvent<HTMLInputElement>) => editCard(L, id, m.id, { title: e.target.value }),
      setGoals: (e: ChangeEvent<HTMLTextAreaElement>) => editCard(L, id, m.id, { goals: goalsOf(e.target.value) }),
      setHours: (e: ChangeEvent<HTMLInputElement>) => { const n = Number(e.target.value); if (e.target.value.trim() && Number.isFinite(n) && n !== m.hours) editCard(L, id, m.id, { hours: n }); },
      setDepth: (e: ChangeEvent<HTMLSelectElement>) => editCard(L, id, m.id, { depth: depthFrom(e) }),
      depthOptions: DEPTHS.map((d) => ({ value: d, label: depthName(d) })),
    };
  });
}
