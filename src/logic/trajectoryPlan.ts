// The plan the Trajectory AI helps an admin build for a certification trajectory (Phase 7): modules in order, each with its
// goals, hours, material and cited sources, then a final exam. Pure: types, caps, the problems a plan can have and the edits
// of curating it. The database keeps the shallow caps (private.trajectory_plan_ok, trajectory_plans checks); the deep rules are
// planProblems here. trajectoryPlan.sync.test.ts pins the numbers both sides share.
import { DOMAINS, STAGES } from '../data';
import { STUDIOS } from '../studioData';
import { studioFormats } from './studios';

export const DEPTHS = ['foundation', 'applied', 'expert'] as const;
export type Depth = (typeof DEPTHS)[number];
// The contribution level each depth stands for.
export const DEPTH_LEVEL: Record<Depth, number> = { foundation: 2, applied: 3, expert: 4 };
// Formats no studio makes: the plan proposes them as manual steps (evidence the learner brings), never as a draft.
export const MANUAL_FORMATS = ['External course', 'Classroom', 'Book', 'Mentoring'] as const;
export type ManualFormat = (typeof MANUAL_FORMATS)[number];
export const CHECK_POINTS = ['evidence', 'signoff'] as const;
export type CheckPoint = (typeof CHECK_POINTS)[number];
// Derived from the studios, never listed by hand.
export const PLAN_FORMATS: string[] = STUDIOS.flatMap(studioFormats);

// The codes the database accepts for a draft's domain (contributions.domain check) and stage (the career_stage enum): the AI's free text is kept only
// when it is one of them (DOMAINS and STAGES are the one source; trajectoryPlan.sync.test.ts compares the check list).
export const DOMAIN_CODES: string[] = DOMAINS.map((d) => d[0]);
export const domainCode = (v: unknown): string => (typeof v === 'string' && DOMAIN_CODES.includes(v) ? v : '');
export const stageName = (v: unknown): string | null => (typeof v === 'string' && STAGES.includes(v) ? v : null);

export const PLAN_CAPS = {
  modules: 12, goals: 5, goalChars: 200, titleChars: 120, reasonChars: 240, material: 3, sources: 6, quoteChars: 160, hoursMin: 0.25, hoursMax: 80,
  replyChars: 1200, questions: 3, questionChars: 300, briefChars: 400, removed: 30, messages: 60, messageChars: 4000, bundles: 12, sourcesPerTrajectory: 10,
} as const;

export type SourceRef = { kind: 'kb'; bundleId: string; chunk: number } | { kind: 'file'; sourceId: string; page: number; passage: number } | { kind: 'learning'; learningId: string };
// kb:<bundle>#<chunk>, file:<source>#p<page>.<passage> (passage: its index among the source's passages) or learning:<id>
export function refKey(r: SourceRef): string {
  return r.kind === 'kb' ? `kb:${r.bundleId}#${r.chunk}` : r.kind === 'file' ? `file:${r.sourceId}#p${r.page}.${r.passage}` : `learning:${r.learningId}`;
}
export type CitedSource = { ref: SourceRef; label: string; quote: string };

export type PlanMaterial =
  | { kind: 'existing'; learningId: string; reason: string }
  | { kind: 'studio'; format: string; reason: string }
  | { kind: 'manual'; format: ManualFormat; reason: string };
// id: 'm' + random, made by the app, never by the AI. hours: a multiple of 0.25. Order is the array order.
// suggestion: what the AI would change in an ACCEPTED module (the AI never overwrites one); the admin applies or dismisses it.
export type PlanModule = { id: string; title: string; depth: Depth; goals: string[]; hours: number; material: PlanMaterial[]; sources: CitedSource[]; checks: CheckPoint[]; accepted: boolean; suggestion?: ModuleSuggestion };
export type ModuleSuggestion = { title: string; depth: Depth; goals: string[]; hours: number; material: PlanMaterial[]; sources: CitedSource[]; checks: CheckPoint[] };
// domain: a DOMAINS code, used for the drafts.
export type PlanBrief = {
  goal: string; credential: string; issuer: string; audience: string; stage: string | null; line: string | null; level: string;
  hoursBudget: number | null; deadline: string | null; bodyRules: string; constraints: string; domain: string;
};
export type FinalExam = { title: string; hours: number; reason: string };
// removed: the titles the admin removed; the AI is told not to propose them again.
export type TrajectoryPlan = { version: 1; brief: PlanBrief | null; modules: PlanModule[]; finalExam: FinalExam | null; removed: string[] };
// What a reply cited or proposed that was not given or not allowed, removed and counted (never repaired).
export type Dropped = { sources: number; learnings: number; formats: number };
// merged: what the merge left alone for the admin (accepted modules the reply left out, accepted modules it suggests changing).
export type PlanMessage = { role: 'admin' | 'ai'; text: string; at: string; focus?: string; dropped?: Dropped; merged?: { kept: number; suggested: number } };
export type PlanRecord = { trajectoryId: string; plan: TrajectoryPlan; messages: PlanMessage[]; bundleIds: string[]; updatedAt: string | null };
// An admin's uploaded document, read into numbered passages [page, text] the AI may cite; the original file is path (null: removed).
export type PlanSource = { id: string; trajectoryId: string; name: string; path: string | null; pages: number; passages: [number, string][]; chars: number; flags: string[]; addedBy: string; addedAt: string };

// What the screen holds per trajectory once loaded: record null means the trajectory has no plan yet.
export type TrjPlanState = { record: PlanRecord | null; sources: PlanSource[] };

export const emptyPlan = (): TrajectoryPlan => ({ version: 1, brief: null, modules: [], finalExam: null, removed: [] });

const hoursProblem = (h: number): string | null => {
  if (!(h >= PLAN_CAPS.hoursMin && h <= PLAN_CAPS.hoursMax)) return `Hours are between ${PLAN_CAPS.hoursMin} and ${PLAN_CAPS.hoursMax}`;
  return Number.isInteger(h * 4) ? null : 'Hours go up in quarters';
};
const longest = (texts: string[]) => texts.reduce((n, t) => Math.max(n, t.length), 0);
const unknownFormat = (m: PlanMaterial): string | null => {
  if (m.kind === 'studio') return PLAN_FORMATS.includes(m.format) ? null : m.format;
  if (m.kind === 'manual') return (MANUAL_FORMATS as readonly string[]).includes(m.format) ? null : m.format;
  return null;
};

function moduleProblems(m: PlanModule): (string | null)[] {
  const C = PLAN_CAPS;
  return [
    m.title.trim() ? null : 'Every module needs a title',
    m.title.length > C.titleChars ? `A title is at most ${C.titleChars} characters` : null,
    m.goals.length > C.goals ? `A module has at most ${C.goals} goals` : null,
    longest(m.goals) > C.goalChars ? `A goal is at most ${C.goalChars} characters` : null,
    hoursProblem(m.hours),
    m.material.length > C.material ? `A module has at most ${C.material} pieces of material` : null,
    longest(m.material.map((x) => x.reason)) > C.reasonChars ? `A reason is at most ${C.reasonChars} characters` : null,
    ...m.material.map((x) => { const bad = unknownFormat(x); return bad === null ? null : `${bad} is not a format the plan can propose`; }),
    m.sources.length > C.sources ? `A module cites at most ${C.sources} sources` : null,
    longest(m.sources.map((s) => s.quote)) > C.quoteChars ? `A quote is at most ${C.quoteChars} characters` : null,
  ];
}

// Every problem of a plan, in words, each once.
export function planProblems(p: TrajectoryPlan): string[] {
  const ids = p.modules.map((m) => m.id);
  const found = [
    p.modules.length > PLAN_CAPS.modules ? `A plan has at most ${PLAN_CAPS.modules} modules` : null,
    new Set(ids).size < ids.length ? 'Module ids are unique' : null,
    p.removed.length > PLAN_CAPS.removed ? `A plan remembers at most ${PLAN_CAPS.removed} removed titles` : null,
    p.finalExam ? hoursProblem(p.finalExam.hours) : null,
    p.finalExam && p.finalExam.title.length > PLAN_CAPS.titleChars ? `The final exam title is at most ${PLAN_CAPS.titleChars} characters` : null,
    p.finalExam && p.finalExam.reason.length > PLAN_CAPS.reasonChars ? `A reason is at most ${PLAN_CAPS.reasonChars} characters` : null,
    ...p.modules.flatMap(moduleProblems),
  ];
  return [...new Set(found.filter((x): x is string => x !== null))];
}

const mapModules = (p: TrajectoryPlan, id: string, f: (m: PlanModule) => PlanModule): TrajectoryPlan => ({ ...p, modules: p.modules.map((m) => (m.id === id ? f(m) : m)) });
export const acceptModule = (p: TrajectoryPlan, id: string, on: boolean) => mapModules(p, id, (m) => ({ ...m, accepted: on }));
// An admin's edit keeps the module accepted (or not) as it was.
export const editModule = (p: TrajectoryPlan, id: string, patch: Partial<Omit<PlanModule, 'id' | 'accepted'>>) => mapModules(p, id, (m) => ({ ...m, ...patch }));
export function moveModule(p: TrajectoryPlan, id: string, by: -1 | 1): TrajectoryPlan {
  const from = p.modules.findIndex((m) => m.id === id), to = from + by;
  if (from < 0 || to < 0 || to >= p.modules.length) return p;
  const modules = p.modules.slice();
  [modules[from], modules[to]] = [modules[to], modules[from]];
  return { ...p, modules };
}
// Drops the module and remembers its title (the last 30), so the AI is not offered it again.
export function removeModule(p: TrajectoryPlan, id: string): TrajectoryPlan {
  const gone = p.modules.find((m) => m.id === id);
  if (!gone) return p;
  return { ...p, modules: p.modules.filter((m) => m.id !== id), removed: [...p.removed, gone.title].slice(-PLAN_CAPS.removed) };
}
// The AI's suggestion for an accepted module, applied (the module stays accepted) or dismissed.
export const applySuggestion = (p: TrajectoryPlan, id: string) => mapModules(p, id, ({ suggestion, ...m }) => ({ ...m, ...suggestion }));
export const dismissSuggestion = (p: TrajectoryPlan, id: string) => mapModules(p, id, ({ suggestion: _gone, ...m }) => m);
