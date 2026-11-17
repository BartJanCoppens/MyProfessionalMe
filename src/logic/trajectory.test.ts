import { describe, expect, it } from 'vitest';
import {
  autoEnrolled, credentialExpiry, monthLabel, relevantMap, startMonth, stepCpd, stepHours, totals, trajectoryProgress,
  type Enrolment, type LearningRef, type Trajectory,
} from './trajectory';

const L = (hours: number, cpd: number, state: LearningRef['state'] = 'not-started', pct = 0): LearningRef => ({ hours, cpd, state, pct });
const byId: Record<string, LearningRef> = { a: L(10, 4), b: L(6, 2), c: L(2, 1), d: L(8, 3) };

const base: Trajectory = {
  id: 'T1', name: 'Tax certificate', issuer: 'Institute', credential: 'Certified', enrol: 'auto', months: 24, valid_months: 36,
  renewal: '', cost: '', status: 'live', business_line: 'Tax & Legal', published_at: '2026-03-15T10:00:00Z',
  steps: [
    { id: 's1', k: 'learn', lid: 'a', win: 3, req: true, pre: null },
    { id: 's2', k: 'elect', opts: ['b', 'c', 'd'], pick: 2, win: 14, req: false, pre: 's1' },
    { id: 's3', k: 'evidence', title: 'Logged hours', hours: 5, win: 30, req: true, pre: null },
    { id: 's4', k: 'exam', title: 'Exam', hours: 3, win: 24, req: true, pre: 's3' },
  ],
  maps: [['Tax & Legal', 'senior', 'mandatory']],
};
const enrol = (steps: Enrolment['steps'] = {}): Enrolment => ({ status: 'enrolled', start_month: 2026 * 12 + 2, steps });

describe('totals', () => {
  it('sums hours (elect: the cheapest picks), cpd, required steps and hours per year', () => {
    expect(stepHours(base.steps[1], byId)).toBe(8);
    expect(stepCpd(base.steps[1], byId)).toBe(3);
    expect(totals(base, byId)).toEqual({ tot: 26, cpd: 7, req: 3, perYear: [10, 11, 5] });
  });
});

describe('trajectoryProgress', () => {
  it('counts a learn step done only when accepted; submitted shows as submitted', () => {
    expect(trajectoryProgress(base, enrol(), { ...byId, a: L(10, 4, 'submitted', 100) }).steps[0].state).toBe('submitted');
    expect(trajectoryProgress(base, enrol(), { ...byId, a: L(10, 4, 'accepted', 100) }).steps[0].state).toBe('done');
    expect(trajectoryProgress(base, enrol(), { ...byId, a: L(10, 4, 'in-progress', 40) }).steps[0]).toMatchObject({ state: 'progress', pct: 40 });
  });
  it('an elect step is done when pick options are accepted', () => {
    const one = trajectoryProgress(base, enrol(), { ...byId, b: L(6, 2, 'accepted') }).steps[1].state;
    const two = trajectoryProgress(base, enrol(), { ...byId, b: L(6, 2, 'accepted'), c: L(2, 1, 'accepted') }).steps[1].state;
    expect([one, two]).toEqual(['progress', 'done']);
  });
  it('reads evidence, check and exam from the enrolment entry', () => {
    const p = trajectoryProgress(base, enrol({ s3: { state: 'submitted' }, s4: { state: 'booked' } }), byId);
    expect([p.steps[2].state, p.steps[3].state]).toEqual(['submitted', 'booked']);
  });
  it('pre locks a step until its prerequisite is done', () => {
    expect(trajectoryProgress(base, enrol(), byId).steps.map((s) => s.locked)).toEqual([false, true, false, true]);
    const p = trajectoryProgress(base, enrol({ s3: { state: 'done' } }), { ...byId, a: L(10, 4, 'accepted') });
    expect(p.steps.map((s) => s.locked)).toEqual([false, false, false, false]);
    expect(p.next).toBe(1);
  });
  it('keeps state by step id when steps move, and drops a removed step', () => {
    const e = enrol({ s3: { state: 'done' } });
    const moved = { ...base, steps: [base.steps[2], base.steps[0], base.steps[1], base.steps[3]] };
    expect(trajectoryProgress(moved, e, byId).steps[0]).toMatchObject({ id: 's3', state: 'done' });
    const dropped = { ...base, steps: base.steps.filter((s) => s.id !== 's2') };
    expect(trajectoryProgress(dropped, e, byId).steps.map((s) => s.id)).toEqual(['s1', 's3', 's4']);
  });
  it('a missing learning is flagged and, when optional, blocks nothing', () => {
    const t: Trajectory = { ...base, steps: [{ id: 'x', k: 'learn', lid: 'gone', win: 1, req: false, pre: null }, { id: 'y', k: 'check', title: 'Check', win: 2, req: true, pre: 'x' }] };
    const p = trajectoryProgress(t, enrol(), byId);
    expect(p.steps[0].missing).toBe(true);
    expect(p.steps[1].locked).toBe(false);
    expect(p.next).toBe(1);
    expect(p.reqN).toBe(1);
  });
  it('is complete when every required step is done', () => {
    const e = enrol({ s3: { state: 'done' }, s4: { state: 'done' } });
    expect(trajectoryProgress(base, e, byId).complete).toBe(false);
    const p = trajectoryProgress(base, e, { ...byId, a: L(10, 4, 'accepted') });
    expect(p).toMatchObject({ reqN: 3, reqDone: 3, complete: true });
  });
  it('works without an enrolment', () => {
    expect(trajectoryProgress(base, null, byId).steps[2].state).toBe('open');
  });
});

describe('relevance, auto-enrolment, start month and expiry', () => {
  it('relevantMap finds the map for the person audiences (and stage when given)', () => {
    expect(relevantMap(base, ['Tax & Legal', 'ind:x'])).toEqual(['Tax & Legal', 'senior', 'mandatory']);
    expect(relevantMap(base, ['Audit'])).toBeUndefined();
    expect(relevantMap(base, ['Tax & Legal'], 'junior')).toBeUndefined();
  });
  it('autoEnrolled mirrors private.in_mandatory_audience', () => {
    const me = { line: 'Tax & Legal', stage: 'senior' };
    expect(autoEnrolled(base, me)).toBe(true);
    expect(autoEnrolled(base, { line: 'Audit', stage: 'senior' })).toBe(false);
    expect(autoEnrolled(base, { line: 'Tax & Legal', stage: 'junior' })).toBe(false);
    expect(autoEnrolled(base, { line: null, stage: null })).toBe(false);
    expect(autoEnrolled({ ...base, enrol: 'open' }, me)).toBe(false);
    expect(autoEnrolled({ ...base, status: 'draft' }, me)).toBe(false);
    expect(autoEnrolled({ ...base, maps: [['Tax & Legal', 'senior', 'advised']] }, me)).toBe(false);
  });
  it('startMonth: publication month for mandatory auto, else now (UTC)', () => {
    const now = new Date('2026-11-17T08:00:00Z');
    expect(startMonth(base, true, now)).toBe(2026 * 12 + 2);
    expect(startMonth({ ...base, published_at: null }, true, now)).toBe(2026 * 12 + 10);
    expect(startMonth(base, false, now)).toBe(2026 * 12 + 10);
    expect(startMonth(base, false, new Date('2026-12-31T23:30:00Z'))).toBe(2026 * 12 + 11);
  });
  it('credentialExpiry and monthLabel', () => {
    expect(credentialExpiry(2026 * 12 + 2, 36)).toBe(2029 * 12 + 2);
    expect(credentialExpiry(2026 * 12 + 2, null)).toBeNull();
    expect(monthLabel(2026 * 12 + 8)).toBe('Sep 2026');
  });
});
