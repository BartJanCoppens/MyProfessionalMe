// Reading the Trajectory AI's answer (Phase 7) and merging it into the plan. Strict: a wrong type or a value outside the caps makes the whole
// reply unusable (null). What the AI cited or proposed beyond what it was given (a source not numbered in the request, a learning not in the
// catalogue, a studio format that does not exist) is dropped and counted, never repaired, so the screen can say so. The app makes every id and
// every module comes in not accepted; mergeReply gives the admin's accepted flag back to a module whose content did not change. Pure.
import { LEARN_BY } from '../data';
import { jsonObject } from './json';
import type { Numbering } from './planPrompt';
import { isCount, isObject, isText, isTexts } from './values';
import { CHECK_POINTS, DEPTHS, emptyPlan, MANUAL_FORMATS, PLAN_CAPS, planProblems, refKey } from './trajectoryPlan';
import type { CheckPoint, CitedSource, Depth, Dropped, FinalExam, PlanBrief, PlanMaterial, PlanModule, TrajectoryPlan } from './trajectoryPlan';

export type PlanReply = { reply: string; questions: string[]; brief: PlanBrief | null; modules: PlanModule[] | null; finalExam?: FinalExam | null; dropped: Dropped };
type Context = { numbering: Numbering; formats: string[]; known: Set<string>; used: Set<string>; newId: () => string; dropped: Dropped };

// Thrown inside the reader and caught once: the reply is not usable.
class Unusable extends Error {}
const need = <T>(ok: boolean, value: T): T => { if (!ok) throw new Unusable(); return value; };
const rec = (v: unknown) => need(isObject(v), v as Record<string, unknown>);
const texts = (v: unknown, max: number, chars: number): string[] => need(isTexts(v) && v.length <= max && v.every((t) => t.length <= chars), v as string[]);
const textOrNull = (v: unknown, chars: number): string | null => (v === undefined || v === null ? null : need(isText(v) && v.length <= chars, v as string));

function citation(tag: string, c: Context): CitedSource | null {
  const passage = c.numbering.passages[tag];
  if (passage) return passage;
  if (!c.numbering.learnings.includes(tag)) return null;
  const learning = LEARN_BY[tag];
  return { ref: { kind: 'learning', learningId: tag }, label: learning?.[1] ?? tag, quote: (learning?.[9] ?? '').slice(0, PLAN_CAPS.quoteChars) };
}
function sourcesOf(v: unknown, c: Context): CitedSource[] {
  const found = new Map<string, CitedSource>();
  for (const tag of need(isTexts(v), v as string[])) {
    const cited = citation(tag, c);
    if (cited) found.set(refKey(cited.ref), cited); else c.dropped.sources++;
  }
  return [...found.values()];
}

function materialOf(v: unknown, c: Context): PlanMaterial[] {
  const out: PlanMaterial[] = [];
  for (const raw of need(Array.isArray(v), v as unknown[])) {
    const x = rec(raw), reason = need(isText(x.reason), x.reason as string);
    if (x.kind === 'existing') {
      const id = need(isText(x.learning), x.learning as string);
      if (c.numbering.learnings.includes(id)) out.push({ kind: 'existing', learningId: id, reason }); else c.dropped.learnings++;
    } else if (x.kind === 'studio' || x.kind === 'manual') {
      const format = need(isText(x.format), x.format as string);
      if (x.kind === 'studio' && c.formats.includes(format)) out.push({ kind: 'studio', format, reason });
      else if (x.kind === 'manual' && (MANUAL_FORMATS as readonly string[]).includes(format)) out.push({ kind: 'manual', format: format as (typeof MANUAL_FORMATS)[number], reason });
      else c.dropped.formats++;
    } else need(false, 0);
  }
  return out;
}

function moduleOf(raw: unknown, c: Context): PlanModule {
  const o = rec(raw);
  need(o.id === undefined || isText(o.id), 0);
  const id = isText(o.id) && c.known.has(o.id) && !c.used.has(o.id) ? o.id : c.newId();
  c.used.add(id);
  return {
    id, title: need(isText(o.title), o.title as string), depth: need(DEPTHS.includes(o.depth as Depth), o.depth as Depth), goals: need(isTexts(o.goals), o.goals as string[]),
    hours: need(isCount(o.hours), o.hours as number), material: materialOf(o.material, c), sources: sourcesOf(o.sources, c),
    checks: need(isTexts(o.checks) && o.checks.every((k) => CHECK_POINTS.includes(k as CheckPoint)), o.checks as CheckPoint[]), accepted: false,
  };
}

const BRIEF_TEXTS = ['goal', 'credential', 'issuer', 'audience', 'level', 'bodyRules', 'constraints', 'domain'] as const;
function briefOf(v: unknown): PlanBrief | null {
  if (v === null || v === undefined) return null;
  const o = rec(v), chars = PLAN_CAPS.briefChars;
  const text = (k: string) => { const t = o[k] ?? ''; return need(isText(t) && t.length <= chars, t as string); };
  const budget = o.hoursBudget ?? null;
  return {
    ...(Object.fromEntries(BRIEF_TEXTS.map((k) => [k, text(k)])) as Pick<PlanBrief, (typeof BRIEF_TEXTS)[number]>),
    stage: textOrNull(o.stage, chars), line: textOrNull(o.line, chars), deadline: textOrNull(o.deadline, chars), hoursBudget: budget === null ? null : need(isCount(budget), budget as number),
  };
}
function finalExamOf(v: unknown): FinalExam {
  const o = rec(v);
  return { title: need(isText(o.title), o.title as string), hours: need(isCount(o.hours), o.hours as number), reason: need(isText(o.reason), o.reason as string) };
}

export function readPlanReply(raw: string, a: { numbering: Numbering; formats: string[]; prev: PlanModule[]; newId: () => string }): PlanReply | null {
  const o = jsonObject(raw);
  if (!isObject(o)) return null;
  const c: Context = { numbering: a.numbering, formats: a.formats, known: new Set(a.prev.map((m) => m.id)), used: new Set(), newId: a.newId, dropped: { sources: 0, learnings: 0, formats: 0 } };
  try {
    const reply = need(isText(o.reply) && !!o.reply.trim() && o.reply.length <= PLAN_CAPS.replyChars, o.reply as string);
    const questions = texts(o.questions ?? [], PLAN_CAPS.questions, PLAN_CAPS.questionChars);
    const modules = o.modules === null || o.modules === undefined ? null : need(Array.isArray(o.modules) && o.modules.length > 0 && o.modules.length <= PLAN_CAPS.modules, o.modules as unknown[]).map((m) => moduleOf(m, c));
    const finalExam = o.finalExam === undefined ? undefined : o.finalExam === null ? null : finalExamOf(o.finalExam);
    const out: PlanReply = { reply, questions, brief: briefOf(o.brief), modules, ...(finalExam === undefined ? {} : { finalExam }), dropped: c.dropped };
    need(!planProblems({ ...emptyPlan(), modules: modules ?? [], finalExam: finalExam ?? null }).length, 0);
    return out;
  } catch (err) {
    if (err instanceof Unusable) return null;
    throw err;
  }
}

// A stable text of a value whatever the order of its keys (a plan read back from the database has its keys in another order).
const canon = (v: unknown): string => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : isObject(v) ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v));
const content = ({ accepted: _accepted, ...rest }: PlanModule) => canon(rest);

// The reply laid onto the plan as it is now (the admin may have edited it while the AI worked): a module whose content is unchanged keeps
// its accepted flag; a reply with no modules changes none; the removed titles stay; the brief and the final exam change only when the reply says.
export function mergeReply(latest: TrajectoryPlan, r: PlanReply): TrajectoryPlan {
  const before = new Map(latest.modules.map((m) => [m.id, m]));
  const modules = r.modules ? r.modules.map((m) => { const was = before.get(m.id); return was && content(was) === content(m) ? { ...m, accepted: was.accepted } : m; }) : latest.modules;
  return { ...latest, brief: r.brief ?? latest.brief, modules, finalExam: r.finalExam === undefined ? latest.finalExam : r.finalExam };
}
