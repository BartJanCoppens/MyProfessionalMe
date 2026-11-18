// Drafting a placeholder's material in a studio (Studios Phase 7, Task 7.5). Pure: which studio makes a format, the draft the module's brief gives it, the
// lines the AI is told about goals and depth, and the creation grant a placeholder gives the editors of its trajectory (placeholderRules mirrors
// private.plan_draft_matches, which private.may_create reads; planDraft.sync.test.ts compares them).
import type { Bundle, DraftBrief, NewDraft } from '../types';
import { STUDIOS } from '../studioData';
import { noItems, marked } from './items';
import type { RuleParts } from './contribution';
import { citedPassage, liveIndex } from './planPool';
import type { PlanModule, PlanSource, TrajectoryPlan } from './trajectoryPlan';
import { DEPTH_LEVEL } from './trajectoryPlan';
import type { Trajectory, TrjStep } from './trajectory';
import { studioFormats } from './studios';

export const BRIEF_PASSAGES = 8;
// The domain a placeholder's draft has: the step's own (Apply stores the plan brief's), else this (private.plan_draft_matches).
export const PLACEHOLDER_DOMAIN = 'prof';
export const studioFor = (format: string): string | null => STUDIOS.find((d) => studioFormats(d).includes(format))?.id ?? null;

type Args = { t: Trajectory; step: TrjStep; module: PlanModule; plan: TrajectoryPlan; line: string; bundles: Bundle[]; sources: PlanSource[]; key: string };
// The draft a placeholder opens its studio with. `line` is the admin's line, used when the trajectory is firm-wide; `bundles` are all known bundles and
// `sources` the plan's documents, so a cited passage is read as it is now (one that is client or licensed, or gone, is left out).
export function briefDraft({ t, step, module, plan, line, bundles, sources, key }: Args): NewDraft {
  const format = step.fmt ?? '', live = liveIndex(bundles, sources);
  const found = module.sources.flatMap((c) => { const p = citedPassage(c, live); return p ? [p] : []; });
  const brief: DraftBrief = { trajectoryId: t.id, stepId: step.id, goals: module.goals.slice(), depth: module.depth, passages: found.map((p) => p.text).slice(0, BRIEF_PASSAGES), sources: module.sources.map((c) => c.label) };
  return { line: t.business_line ?? line, aud: '', type: format, title: module.title.slice(0, 120), dom: step.dom ?? PLACEHOLDER_DOMAIN, lvl: String(DEPTH_LEVEL[module.depth]),
    stage: plan.brief?.stage || 'Consultant', take: (module.goals[0] ?? '').slice(0, 400), outline: module.goals.slice(), sources: brief.sources, ai: false, aiNote: '', items: noItems(),
    shape: {}, produce: {}, cast: {}, key, brief };
}

// What the AI is told beside the title and takeaway: the goals (each between data markers) and the depth. Nothing without a brief or goals.
export const briefLines = (nw: NewDraft): string => (nw.brief?.goals.length
  ? 'Learning goals:\n' + nw.brief.goals.map((g) => marked(g, 200)).join('\n') + '\nDepth: ' + nw.brief.depth : '');

// The one creation rule a placeholder gives its trajectory's editors: its line (any line for a firm-wide trajectory), the placeholder's format and domain (no audience). None
// when the step is not a placeholder of that format. Whether the person may edit the trajectory is the caller's to check (refusal).
export function placeholderRules(t: Trajectory, stepId: string, format: string): RuleParts[] {
  const step = t.steps.find((s) => s.id === stepId && s.k === 'make' && s.fmt === format);
  return step ? [{ lines: t.business_line ? [t.business_line] : [], formats: [format], domains: [step.dom ?? PLACEHOLDER_DOMAIN], audiences: [] }] : [];
}
