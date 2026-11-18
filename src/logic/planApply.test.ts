// Apply: the accepted modules of a plan as trajectory steps. Pure; idempotent through the from markers.
import { afterEach, describe, expect, it } from 'vitest';
import { setCatalogue } from '../data';
import type { Learn } from '../types';
import { applyPlan, planStepIds, usedOf } from './planApply';
import { emptyPlan } from './trajectoryPlan';
import type { PlanModule, PlanMaterial, TrajectoryPlan } from './trajectoryPlan';
import type { Trajectory, TrjStep } from './trajectory';
import { blankTrajectory } from './trajectoryEdit';

const learn = (id: string, title: string): Learn => [id, title, 'D', 3, 'Micro-guide', 'Firm', 1.5, 0, '', 'why'];
afterEach(() => setCatalogue([]));
const mod = (id: string, title: string, material: PlanMaterial[], over: Partial<PlanModule> = {}): PlanModule => ({ id, title, depth: 'foundation', goals: [], hours: 6, material, sources: [], checks: [], accepted: true, ...over });
const plan = (modules: PlanModule[], finalExam: TrajectoryPlan['finalExam'] = { title: 'Final assessment', hours: 3, reason: 'r' }): TrajectoryPlan => ({ ...emptyPlan(), modules, finalExam });
const trajectory = (steps: TrjStep[] = []): Trajectory => ({ ...blankTrajectory('Audit'), id: 'T1', months: 12, steps });
const idsFor = (n = 20) => Array.from({ length: n }, (_, i) => 'n' + i);
const apply = (t: Trajectory, p: TrajectoryPlan, ids = idsFor(), stamp?: string) => applyPlan(t, p, ids, usedOf(t), stamp);

const m1 = mod('m1', 'VAT basics', [{ kind: 'existing', learningId: 'L1', reason: 'r' }]);
const m2 = mod('m2', 'Reverse charge', [{ kind: 'studio', format: 'Flash cards', reason: 'r' }], { hours: 5, checks: ['signoff'] });
const m3 = mod('m3', 'Practice of VAT', [{ kind: 'manual', format: 'Book', reason: 'r' }]);
const m4 = mod('m4', 'Not yet chosen', [{ kind: 'existing', learningId: 'L1', reason: 'r' }], { accepted: false });
const full = plan([m1, m2, m3, m4]);
const noExam = () => trajectory([]);

describe('applyPlan', () => {
  it('stores the plan brief\'s domain on a make step, and on no other step', () => {
    const p = { ...plan([m2]), brief: { goal: '', credential: '', issuer: '', audience: '', stage: null, line: null, level: '', hoursBudget: null, deadline: null, bodyRules: '', constraints: '', domain: 'reg' } };
    const steps = apply(noExam(), p).steps;
    expect(steps.filter((x) => x.k === 'make').map((x) => x.dom)).toEqual(['reg']);
    expect(steps.filter((x) => x.k !== 'make').every((x) => !('dom' in x))).toBe(true);
    expect(apply(noExam(), plan([m2])).steps.find((x) => x.k === 'make')).not.toHaveProperty('dom');
  });
  it('stores a brief domain on a make step only when it is a domain code', () => {
    const brief = (domain: string) => ({ ...plan([m2]), brief: { goal: '', credential: '', issuer: '', audience: '', stage: null, line: null, level: '', hoursBudget: null, deadline: null, bodyRules: '', constraints: '', domain } });
    expect(apply(noExam(), brief('Indirect tax')).steps.find((x) => x.k === 'make')).not.toHaveProperty('dom');
    expect(apply(noExam(), brief('lead')).steps.find((x) => x.k === 'make')).toMatchObject({ dom: 'lead' });
  });
  it('appends, in plan order, a learn step, a make step with its sign-off, an evidence step and the final exam', () => {
    setCatalogue([[learn('L1', 'VAT in practice'), { line: null, status: 'published' }]]);
    const r = apply(noExam(), full);
    expect(r.added).toBe(5);
    expect(r.steps.map((s) => [s.k, s.win])).toEqual([['learn', 3], ['make', 6], ['check', 6], ['evidence', 9], ['exam', 12]]);
    const [learnStep, make, check, evidence, exam] = r.steps;
    expect(learnStep).toMatchObject({ lid: 'L1', from: 'p:m1', req: true });
    expect(make).toMatchObject({ title: 'Reverse charge', fmt: 'Flash cards', hours: 5, from: 'p:m2', req: true });
    expect(check).toMatchObject({ title: 'Sign-off · Reverse charge', pre: make.id, from: 'p:m2' });
    expect(evidence).toMatchObject({ title: 'Book · Practice of VAT', from: 'p:m3' });
    expect(exam).toMatchObject({ title: 'Final assessment', hours: 3, win: 12, pre: evidence.id, req: true });
    expect(r.steps.some((s) => s.from === 'p:m4')).toBe(false);
  });
  it('uses the given ids, none of which is an existing one', () => {
    const t = trajectory([{ id: 's1', k: 'evidence', title: 'Log', hours: 0, win: 1, req: true, pre: null }]);
    const ids = planStepIds(t, full);
    const r = apply(t, full, ids);
    expect(r.steps.slice(1).map((s) => s.id)).toEqual(ids.slice(0, r.added));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('s1');
  });
  it('gives each module its own evidence and sign-off steps, the sign-off waiting for the evidence', () => {
    const m = mod('m5', 'Case work', [{ kind: 'studio', format: 'Case exercise', reason: 'r' }], { checks: ['evidence', 'signoff'] });
    const [make, evidence, check] = apply(noExam(), plan([m], null)).steps;
    expect([make.k, evidence.k, check.k]).toEqual(['make', 'evidence', 'check']);
    expect(evidence).toMatchObject({ title: 'Evidence · Case work', pre: make.id });
    expect(check).toMatchObject({ title: 'Sign-off · Case work', pre: evidence.id });
  });
  it('is idempotent: applying again changes nothing and says Already applied', () => {
    const once = apply(noExam(), full);
    const t2 = trajectory(once.steps);
    const twice = apply(t2, full);
    expect(twice.steps).toEqual(once.steps);
    expect(twice.added).toBe(0);
    expect(twice.skipped.filter((s) => s.why === 'Already applied').map((s) => s.module)).toEqual(['VAT basics', 'Reverse charge', 'Practice of VAT', 'Final exam']);
    expect(twice.skipped.map((s) => s.module)).not.toContain('Not yet chosen');
  });
  it('skips a learning already in the trajectory, naming it', () => {
    setCatalogue([[learn('L1', 'VAT in practice'), { line: null, status: 'published' }]]);
    const t = trajectory([{ id: 's1', k: 'learn', lid: 'L1', win: 1, req: true, pre: null }]);
    const r = apply(t, plan([m1], null));
    expect(r.added).toBe(0);
    expect(r.skipped).toEqual([{ module: 'VAT basics', why: 'VAT in practice is already in the trajectory' }]);
  });
  it('skips the final exam when the trajectory already has an exam, and says Already applied when it came from here', () => {
    const exam: TrjStep = { id: 's1', k: 'exam', title: 'Own exam', hours: 2, win: 12, req: true, pre: null };
    expect(apply(trajectory([exam]), full).skipped).toContainEqual({ module: 'Final exam', why: "Already has a final exam; the plan's exam was not added" });
    const first = apply(noExam(), full);
    expect(apply(trajectory(first.steps), full).skipped).toContainEqual({ module: 'Final exam', why: 'Already applied' });
  });
  it('skips a regenerated module (new id) whose title is already a step, as a whole', () => {
    const first = apply(noExam(), plan([m2], null));
    const again = mod('m9', 'Reverse charge', [{ kind: 'studio', format: 'Flash cards', reason: 'r' }], { checks: ['signoff'] });
    const r = apply(trajectory(first.steps), plan([again], null));
    expect(r.added).toBe(0);
    expect(r.skipped).toEqual([{ module: 'Reverse charge', why: 'A step with this title is already in the trajectory' }]);
  });
  it('adds nothing for an empty plan, and nothing is touched in the trajectory it was given', () => {
    const t = trajectory([{ id: 's1', k: 'exam', title: 'E', hours: 2, win: 12, req: true, pre: null }]);
    const before = JSON.stringify(t);
    expect(apply(t, plan([], null))).toEqual({ steps: t.steps, added: 0, skipped: [] });
    apply(t, full);
    expect(JSON.stringify(t)).toBe(before);
  });
});

describe('applyPlan on a trajectory that already has an exam', () => {
  const exam: TrjStep = { id: 'x0', k: 'exam', title: 'Final assessment', hours: 2, win: 12, req: true, pre: null };
  const log: TrjStep = { id: 's1', k: 'evidence', title: 'Log', hours: 0, win: 1, req: true, pre: null };
  it('puts the new steps before the exam, which then waits for the last of them', () => {
    const r = apply(trajectory([log, exam]), plan([m2, m3], null));
    expect(r.steps.map((s) => s.id)).toEqual(['s1', 'n0', 'n1', 'n2', 'x0']);
    expect(r.steps[4]).toMatchObject({ id: 'x0', pre: 'n2', title: 'Final assessment' });
    expect(r.added).toBe(3);
  });
  it('keeps the exam\'s own prerequisite: the first new step waits for it, and the exam for the last new step', () => {
    const own = { ...exam, pre: 's1' };
    const r = apply(trajectory([log, own]), plan([m2, m3], null));
    expect(r.steps[1].pre).toBe('s1');
    expect(r.steps[4]).toMatchObject({ id: 'x0', pre: 'n2' });
  });
  it('is idempotent and leaves the exam alone when nothing is added', () => {
    const once = apply(trajectory([log, exam]), plan([m2], null));
    const twice = apply(trajectory(once.steps), plan([m2], null));
    expect(twice.steps).toEqual(once.steps);
    expect(twice.added).toBe(0);
  });
  it('a later Apply adds before the exam it made itself, which moves its wait', () => {
    const first = apply(noExam(), plan([m2], { title: 'Final assessment', hours: 3, reason: 'r' }));
    const second = apply(trajectory(first.steps), plan([m2, m3], { title: 'Final assessment', hours: 3, reason: 'r' }), idsFor().map((i) => 'z' + i));
    expect(second.steps[second.steps.length - 1].k).toBe('exam');
    expect(second.steps[second.steps.length - 1].pre).toBe(second.steps[second.steps.length - 2].id);
  });
});

describe('applyPlan on a live trajectory (a stamp)', () => {
  it('stamps every step but the exam with the moment (a make step too), so people already enrolled see them optional', () => {
    const stamp = '2026-11-18T10:00:00.000Z';
    const r = apply(noExam(), full, idsFor(), stamp);
    expect(r.steps.map((s) => [s.k, s.linked_at])).toEqual([['learn', stamp], ['make', stamp], ['check', stamp], ['evidence', stamp], ['exam', undefined]]);
    expect(apply(noExam(), full).steps.some((s) => s.linked_at)).toBe(false);
  });
});

