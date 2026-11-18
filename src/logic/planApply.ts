// Apply (Studios Phase 7): the accepted modules of a trajectory plan as trajectory steps. Pure and deterministic: the step ids (and the stamp) are made by
// the caller (planStepIds, outside the editor's `patch`, whose change may run twice) and the change is computed from the trajectory as it is when it runs.
// Idempotent: every step made here carries from 'p:<module id>', so a module already there is skipped; a learning already used and a step title already
// there are skipped too (they catch a module the AI proposed again after Start over). Apply only adds: new steps go before an exam the trajectory
// already has, and that exam then waits for them; nothing is removed and no other step changes.
import { LEARN_BY } from '../data';
import type { PlanMaterial, PlanModule, TrajectoryPlan } from './trajectoryPlan';
import type { Trajectory, TrjStep } from './trajectory';
import { nextStepId } from './trajectoryEdit';
import { stepTitle } from './trajectoryView';

export type Skipped = { module: string; why: string };
export type Used = { learnings: Set<string>; titles: Set<string> };
export type Applied = { steps: TrjStep[]; added: number; skipped: Skipped[] };

const norm = (text: string) => text.trim().toLowerCase();
const learningTitle = (id: string) => LEARN_BY[id]?.[1] ?? id;
const TITLE_TAKEN = 'A step with this title is already in the trajectory';
export const EXAM_FROM = 'p:exam';
export const fromModule = (id: string) => 'p:' + id;
export const isApplied = (t: Trajectory, moduleId: string) => t.steps.some((s) => s.from === fromModule(moduleId));

// What the trajectory already holds: the learnings its steps use and the titles of its steps.
export const usedOf = (t: Trajectory): Used => ({
  learnings: new Set(t.steps.flatMap((s) => [...(s.lid ? [s.lid] : []), ...(s.opts ?? [])])),
  titles: new Set(t.steps.map((s) => norm(stepTitle(s, learningTitle)))),
});

// Enough fresh ids for every step Apply could make: a step per piece of material, an evidence and a sign-off step per accepted module, and the exam.
export function planStepIds(t: Trajectory, p: TrajectoryPlan): string[] {
  const count = p.modules.filter((m) => m.accepted).reduce((n, m) => n + m.material.length + 2, 1), pool = t.steps.slice(), ids: string[] = [];
  for (let i = 0; i < count; i++) { const id = nextStepId(pool); ids.push(id); pool.push({ id } as TrjStep); }
  return ids;
}

type Draft = Omit<TrjStep, 'id'>;
// A piece of material as a step. Studio and manual pieces share the module's hours (a quarter-hour each at least).
function pieceOf(x: PlanMaterial, m: PlanModule, made: number, dom?: string): Draft {
  const hours = Math.max(0.25, Math.round((m.hours / made) * 4) / 4), title = made > 1 ? m.title + ' · ' + (x.kind === 'existing' ? '' : x.format) : m.title;
  const base = { win: 0, req: true, pre: null };
  if (x.kind === 'existing') return { ...base, k: 'learn', lid: x.learningId };
  if (x.kind === 'studio') return { ...base, k: 'make', title, fmt: x.format, hours, ...(dom ? { dom } : {}) };
  return { ...base, k: 'evidence', title: x.format + ' · ' + title, hours };
}

// What one Apply run shares: the steps made so far (add), what is skipped (skip) and what is already taken.
type Run = { dom?: string; add: (d: Draft) => TrjStep; skip: (module: string, why: string) => void; taken: (title: string | undefined) => boolean; learnings: Set<string> };

// One module's steps: its material, then its evidence and sign-off steps.
function applyModule(r: Run, m: PlanModule, win: number, from: string): void {
  const common = { win, req: true, from }, made = m.material.filter((x) => x.kind !== 'existing').length;
  let last: TrjStep | null = null, placed = 0, manual = false;
  for (const x of m.material) {
    const piece = pieceOf(x, m, made, r.dom);
    if (x.kind === 'existing' && r.learnings.has(x.learningId)) { r.skip(m.title, learningTitle(x.learningId) + ' is already in the trajectory'); continue; }
    if (r.taken(piece.title)) { r.skip(m.title, TITLE_TAKEN); continue; }
    if (x.kind === 'existing') r.learnings.add(x.learningId);
    last = r.add({ ...piece, ...common }); placed++; manual = manual || x.kind === 'manual';
  }
  if (m.material.length && !placed) return; // nothing of its material went in: no evidence or sign-off for it alone
  let evidence: TrjStep | null = null;
  if (m.checks.includes('evidence') && !manual) {
    if (r.taken('Evidence · ' + m.title)) r.skip(m.title, TITLE_TAKEN);
    else evidence = r.add({ k: 'evidence', title: 'Evidence · ' + m.title, hours: 0, ...common, pre: last?.id ?? null });
  }
  if (m.checks.includes('signoff')) {
    if (r.taken('Sign-off · ' + m.title)) r.skip(m.title, TITLE_TAKEN);
    else r.add({ k: 'check', title: 'Sign-off · ' + m.title, hours: 0, ...common, pre: (evidence ?? last)?.id ?? null });
  }
}

// stamp: on a live trajectory, the moment of Apply. Every step but the exam carries it as linked_at, so people already enrolled see them as optional
// (isRequired), as for a placeholder once linked. A make step is stamped too (it never blocks people already enrolled; it blocks new enrollees until its
// material is published, and the database restamps it when it links, later than this); the exam is always required.
export function applyPlan(t: Trajectory, p: TrajectoryPlan, ids: string[], used: Used, stamp?: string): Applied {
  const queue = ids.slice(), titles = new Set([...used.titles].map(norm)), fresh: TrjStep[] = [], skipped: Skipped[] = [];
  const run: Run = {
    dom: p.brief?.domain || undefined,
    learnings: new Set(used.learnings),
    skip: (module, why) => { if (!skipped.some((s) => s.module === module && s.why === why)) skipped.push({ module, why }); },
    taken: (title) => !!title && titles.has(norm(title)),
    add: (draft) => {
      const id = queue.shift();
      if (!id) throw new Error('Apply was given too few step ids');
      const step = { ...draft, id, ...(stamp && draft.k !== 'exam' ? { linked_at: stamp } : {}) } as TrjStep;
      fresh.push(step);
      if (step.title) titles.add(norm(step.title));
      return step;
    },
  };
  p.modules.forEach((m, i) => {
    if (!m.accepted) return;
    if (isApplied(t, m.id)) return run.skip(m.title, 'Already applied');
    applyModule(run, m, Math.ceil(((i + 1) * t.months) / p.modules.length), fromModule(m.id));
  });

  const at = t.steps.findIndex((s) => s.k === 'exam'), has = at >= 0 ? t.steps[at] : null, exam = p.finalExam;
  if (exam && has) run.skip('Final exam', has.from === EXAM_FROM ? 'Already applied' : "Already has a final exam; the plan's exam was not added");
  else if (exam && run.taken(exam.title)) run.skip('Final exam', TITLE_TAKEN);
  else if (exam) run.add({ k: 'exam', title: exam.title, hours: exam.hours, win: t.months, req: true, pre: (fresh[fresh.length - 1] ?? t.steps[t.steps.length - 1])?.id ?? null, from: EXAM_FROM });
  // New steps go before an exam that was already there, which then waits for the last of them.
  // The exam's own prerequisite is kept: the first new step waits for it, so the exam still waits for it through the chain.
  if (has && fresh.length && has.pre && !fresh[0].pre) fresh[0] = { ...fresh[0], pre: has.pre };
  const steps = has && fresh.length
    ? [...t.steps.slice(0, at), ...fresh, { ...has, pre: fresh[fresh.length - 1].id }, ...t.steps.slice(at + 1)]
    : [...t.steps, ...fresh];
  return { steps, added: fresh.length, skipped };
}
