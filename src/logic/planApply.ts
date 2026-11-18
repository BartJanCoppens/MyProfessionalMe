// Apply (Studios Phase 7): the accepted modules of a trajectory plan as trajectory steps. Pure and deterministic: the step ids are made by the caller
// (planStepIds, outside the editor's `patch`, whose change may run twice) and the change is computed from the trajectory as it is when it runs.
// Idempotent: every step made here carries from 'p:<module id>', so a module already there is skipped; a learning already used and a step title already
// there are skipped too (they catch a module the AI proposed again after Start over). Apply only appends: it never removes or changes a step.
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

type Piece = { step: Omit<TrjStep, 'id' | 'win' | 'req' | 'pre' | 'from'> };
// A piece of material as a step. Studio and manual pieces share the module's hours (a quarter-hour each at least).
function pieceOf(x: PlanMaterial, m: PlanModule, made: number): Piece {
  const hours = Math.max(0.25, Math.round((m.hours / made) * 4) / 4), title = made > 1 ? m.title + ' · ' + (x.kind === 'existing' ? '' : x.format) : m.title;
  if (x.kind === 'existing') return { step: { k: 'learn', lid: x.learningId } };
  if (x.kind === 'studio') return { step: { k: 'make', title, fmt: x.format, hours } };
  return { step: { k: 'evidence', title: x.format + ' · ' + title, hours } };
}

export function applyPlan(t: Trajectory, p: TrajectoryPlan, ids: string[], used: Used): Applied {
  const queue = ids.slice(), learnings = new Set(used.learnings), titles = new Set([...used.titles].map(norm));
  const steps = t.steps.slice(), skipped: Skipped[] = [];
  const skip = (module: string, why: string) => { if (!skipped.some((s) => s.module === module && s.why === why)) skipped.push({ module, why }); };
  const taken = (title: string | undefined) => !!title && titles.has(norm(title));
  const add = (step: Omit<TrjStep, 'id'>): TrjStep => {
    const id = queue.shift();
    if (!id) throw new Error('Apply was given too few step ids');
    const made = { ...step, id } as TrjStep;
    steps.push(made);
    if (made.title) titles.add(norm(made.title));
    return made;
  };

  p.modules.forEach((m, i) => {
    if (!m.accepted) return;
    const from = fromModule(m.id), win = Math.ceil(((i + 1) * t.months) / p.modules.length);
    if (isApplied(t, m.id)) return skip(m.title, 'Already applied');
    const common = { win, req: true, from }, made = m.material.filter((x) => x.kind !== 'existing').length;
    let last: TrjStep | null = null, placed = 0, manual = false;
    for (const x of m.material) {
      const { step } = pieceOf(x, m, made);
      if (x.kind === 'existing' && learnings.has(x.learningId)) { skip(m.title, learningTitle(x.learningId) + ' is already in the trajectory'); continue; }
      if (taken(step.title)) { skip(m.title, 'A step with this title is already in the trajectory'); continue; }
      if (x.kind === 'existing') learnings.add(x.learningId);
      last = add({ ...step, ...common, pre: null }); placed++; manual = manual || x.kind === 'manual';
    }
    if (m.material.length && !placed) return; // nothing of its material went in: no evidence or sign-off for it alone
    let evidence: TrjStep | null = null;
    if (m.checks.includes('evidence') && !manual) {
      if (taken('Evidence · ' + m.title)) skip(m.title, 'A step with this title is already in the trajectory');
      else evidence = add({ k: 'evidence', title: 'Evidence · ' + m.title, hours: 0, ...common, pre: last?.id ?? null });
    }
    if (m.checks.includes('signoff')) {
      if (taken('Sign-off · ' + m.title)) skip(m.title, 'A step with this title is already in the trajectory');
      else add({ k: 'check', title: 'Sign-off · ' + m.title, hours: 0, ...common, pre: (evidence ?? last)?.id ?? null });
    }
  });

  const exam = p.finalExam, has = steps.find((s) => s.k === 'exam');
  if (exam && has) skip('Final exam', has.from === EXAM_FROM ? 'Already applied' : 'The trajectory already ends in an exam');
  else if (exam && taken(exam.title)) skip('Final exam', 'A step with this title is already in the trajectory');
  else if (exam) add({ k: 'exam', title: exam.title, hours: exam.hours, win: t.months, req: true, pre: steps[steps.length - 1]?.id ?? null, from: EXAM_FROM });
  return { steps, added: steps.length - t.steps.length, skipped };
}
