import { describe, expect, it } from 'vitest';
import {
  autoEnrolled, canBeMandatory, credentialExpiry, inMandatoryAudience, mapAtStage, monthLabel, relevantMap, startMonth, stepCpd, stepHours, totals, trajectoryProgress,
  isRequired, type Enrolment, type LearningRef, type Trajectory,
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
    expect(mapAtStage(base, ['Tax & Legal'], 'junior')).toBeUndefined();
    expect(relevantMap(base, ['Tax & Legal'], 'junior')).toEqual(['Tax & Legal', 'senior', 'mandatory']);
  });
  it('relevantMap prefers a mandatory map at the person\'s stage, then any at their stage, then any match', () => {
    const t: Trajectory = { ...base, maps: [['Audit', 'senior', 'advised'], ['tec:data', 'senior', 'mandatory'], ['ind:energy', 'junior', 'advised']] };
    expect(relevantMap(t, ['Audit', 'tec:data'], 'senior')).toEqual(['tec:data', 'senior', 'mandatory']);
    expect(relevantMap(t, ['Audit', 'ind:energy'], 'senior')).toEqual(['Audit', 'senior', 'advised']);
    expect(relevantMap(t, ['ind:energy'], 'senior')).toEqual(['ind:energy', 'junior', 'advised']);
    expect(mapAtStage(t, ['ind:energy'], 'senior')).toBeUndefined();
    expect(relevantMap(t, ['pro:blue'], 'senior')).toBeUndefined();
  });
  it('autoEnrolled mirrors private.in_mandatory_audience', () => {
    const me = { line: 'Tax & Legal', stage: 'senior', audiences: [] };
    expect(autoEnrolled(base, me)).toBe(true);
    expect(autoEnrolled(base, { line: 'Audit', stage: 'senior', audiences: [] })).toBe(false);
    expect(autoEnrolled(base, { line: 'Tax & Legal', stage: 'junior', audiences: [] })).toBe(false);
    expect(autoEnrolled(base, { line: null, stage: null, audiences: [] })).toBe(false);
    expect(autoEnrolled({ ...base, enrol: 'open' }, me)).toBe(false);
    expect(autoEnrolled({ ...base, status: 'draft' }, me)).toBe(false);
    expect(autoEnrolled({ ...base, maps: [['Tax & Legal', 'senior', 'advised']] }, me)).toBe(false);
  });
  it('a mandatory ind:/tec: map binds the members of that audience at its stage', () => {
    const data: Trajectory = { ...base, maps: [['tec:data', 'senior', 'mandatory']] };
    expect(inMandatoryAudience(data, { line: 'Audit', stage: 'senior', audiences: ['tec:data'] })).toBe(true);
    expect(inMandatoryAudience(data, { line: null, stage: 'senior', audiences: ['ind:energy', 'tec:data'] })).toBe(true);
    expect(inMandatoryAudience(data, { line: 'Audit', stage: 'senior', audiences: ['tec:sap'] })).toBe(false);
    expect(inMandatoryAudience(data, { line: 'Audit', stage: 'junior', audiences: ['tec:data'] })).toBe(false);
    expect(inMandatoryAudience({ ...data, maps: [['tec:data', 'senior', 'advised']] }, { line: 'Audit', stage: 'senior', audiences: ['tec:data'] })).toBe(false);
    expect(autoEnrolled({ ...data, status: 'draft' }, { line: 'Audit', stage: 'senior', audiences: ['tec:data'] })).toBe(false);
  });
  it('canBeMandatory: business lines, industries and technologies; never ambitions or profiles', () => {
    expect(['Audit', 'Tax & Legal', 'ind:energy', 'tec:data'].map(canBeMandatory)).toEqual([true, true, true, true]);
    expect(['amb:sust', 'pro:blue', 'Marketing', 'tec:Data'].map(canBeMandatory)).toEqual([false, false, false, false]);
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

describe('make steps (a placeholder for material that is being made)', () => {
  const make = { id: 'm1', k: 'make' as const, title: 'Flash cards', fmt: 'Flash cards', hours: 6, win: 6, req: true, pre: null, from: 'p:x' };
  const t = { ...base, steps: [{ ...base.steps[0] }, make, base.steps[3]].map((st) => (st.id === 's4' ? { ...st, pre: null } : st)) };
  it('is never required, is missing and open, and is never next', () => {
    const pg = trajectoryProgress(t, enrol(), byId);
    expect(pg.reqN).toBe(2);
    expect(pg.steps[1]).toMatchObject({ state: 'open', missing: true, locked: false });
    expect(pg.next).toBe(0);
    expect(trajectoryProgress(t, enrol(), { ...byId, a: L(10, 4, 'accepted', 100) }).next).not.toBe(1);
  });
  it('is complete with only it undone, and totals counts its hours but not as required', () => {
    const pg = trajectoryProgress({ ...t, steps: [{ ...t.steps[0], id: 's1' }, make] }, enrol({ s1: { state: 'done' } }), { ...byId, a: L(10, 4, 'accepted', 100) });
    expect(pg.complete).toBe(true);
    expect(pg.next).toBe(-1);
    expect(totals(t, byId)).toMatchObject({ tot: 10 + 6 + 3, req: 2 });
  });
});

describe('a linked placeholder is required for new enrolments only', () => {
  const linked = { id: 's9', k: 'learn' as const, lid: 'b', win: 6, req: true, pre: null, from: 'p:x', linked_at: '2026-06-10T12:00:00+00:00' };
  const t = { ...base, steps: [linked] };
  const row = (created_at: string | null | undefined): Enrolment => ({ ...enrol(), created_at });
  it('counts as optional for someone whose enrolment began before it was linked', () => {
    const pg = trajectoryProgress(t, row('2026-06-10T11:59:59.999+00:00'), byId);
    expect(pg.reqN).toBe(0);
    expect(trajectoryProgress(t, row('2026-06-10T12:00:00Z'), byId).reqN).toBe(1);
    expect(trajectoryProgress(t, row('2026-07-01T00:00:00+00:00'), byId).reqN).toBe(1);
  });
  it('is required when the enrolment has no start time, or there is no enrolment, or it was never linked later', () => {
    expect(trajectoryProgress(t, row(undefined), byId).reqN).toBe(1);
    expect(trajectoryProgress(t, null, byId).reqN).toBe(1);
    expect(trajectoryProgress({ ...base, steps: [{ ...linked, linked_at: undefined }] }, row('2020-01-01T00:00:00Z'), byId).reqN).toBe(1);
  });
  it('lets an optional step be done without holding up completion, and an undone one does not block', () => {
    const early = row('2026-01-01T00:00:00Z');
    const two = { ...base, steps: [linked, { id: 's1', k: 'evidence' as const, title: 'E', win: 3, req: true, pre: null }] };
    const pg = trajectoryProgress(two, { ...early, steps: { s1: { state: 'done' } } }, byId);
    expect(pg.complete).toBe(true);
    expect(isRequired(linked, early)).toBe(false);
    expect(isRequired({ ...linked, k: 'exam' }, early)).toBe(true);
  });
});

describe('what waits for a placeholder', () => {
  const make = { id: 'm1', k: 'make' as const, title: 'Flash cards', fmt: 'Flash cards', hours: 6, win: 6, req: true, pre: null };
  const chain = (req: boolean): Trajectory => ({ ...base, steps: [{ ...make, req }, { id: 'c1', k: 'check', title: 'Sign-off', win: 6, req: true, pre: 'm1' }, { id: 'x1', k: 'exam', title: 'Exam', hours: 2, win: 12, req: true, pre: 'c1' }] });
  it('a required placeholder locks the sign-off and the exam behind it, so the credential cannot be earned before the material exists', () => {
    const pg = trajectoryProgress(chain(true), enrol(), byId);
    expect(pg.steps.map((x) => x.locked)).toEqual([false, true, true]);
    expect(pg.next).toBe(-1);
    expect(pg.complete).toBe(false);
  });
  it('marking the placeholder optional unblocks them', () => {
    const pg = trajectoryProgress(chain(false), enrol(), byId);
    expect(pg.steps.map((x) => x.locked)).toEqual([false, false, true]);
    expect(pg.next).toBe(1);
  });
});
