import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/trajectoryStore';
import type { Credential, Enrolment, Trajectory, TrjStep } from './logic/trajectory';
import type { Member } from './logic/team';
import { blankTrajectory } from './logic/trajectoryEdit';
import { personTrajectories, teamTrjVals } from './teamTrjVals';
import { emptyData, flush, harness, person, stubWindow, withProgress } from './test/harness';

vi.mock('./lib/trajectoryStore', async (orig) => ({ ...(await orig<object>()), decideTrajectory: vi.fn() }));
const m = vi.mocked(store);
const step = (over: Partial<TrjStep> & Pick<TrjStep, 'id' | 'k'>): TrjStep => ({ win: 6, req: true, pre: null, ...over });
const trj = (id: string, over: Partial<Trajectory> = {}): Trajectory => ({ ...blankTrajectory('Audit'), id, name: 'Trajectory ' + id, issuer: 'ITAA', status: 'live', enrol: 'open', ...over });
const enrolled = (steps: Enrolment['steps'] = {}, status: Enrolment['status'] = 'enrolled'): Enrolment => ({ status, start_month: 2026 * 12 + 9, steps });
const kim = (enrols: Record<string, Enrolment>, creds: Credential[] = [], data = emptyData()): Member =>
  ({ id: 'm1', name: 'Kim Learner', stage: 'Consultant', businessLine: 'Audit', data, trj: { enrols, creds } });
const cred = (over: Partial<Credential> = {}): Credential => ({ id: 'c1', user_id: 'm1', name: 'Certified', issuer: 'ITAA', earned_on: '2026-01-05', expires_on: null, link: '', ref: '', trajectory_id: 'T1', status: 'confirmed', ...over });
const reload = vi.fn(async () => {});
const setup = (members: Member[], trjs: Trajectory[], subject = person()) => {
  const h = harness({ subject, state: { trjs } });
  return { h, v: teamTrjVals(h.L(), members, reload) };
};

beforeEach(() => { vi.clearAllMocks(); stubWindow(); m.decideTrajectory.mockResolvedValue({ result: 'done', error: null }); });

describe('Waiting for you', () => {
  const t = trj('T1', { enrol: 'approval', steps: [step({ id: 's1', k: 'evidence', title: 'Portfolio' }), step({ id: 's2', k: 'check', title: 'Manager sign-off', pre: 's1' })] });
  it('lists a start request and a submitted sign-off with their buttons', () => {
    const t2 = trj('T2', { steps: [step({ id: 's1', k: 'check', title: 'Manager sign-off' })] });
    const { v } = setup([kim({ T1: enrolled({}, 'requested'), T2: enrolled({ s1: { state: 'submitted' } }) })], [t, t2]);
    expect(v.approvalCount).toBe('2');
    expect(v.noApprovals).toBe(false);
    expect(v.approvals.map((a) => [a.name, a.trj, a.approveLabel])).toEqual([['Kim Learner', 'Trajectory T1', 'Approve'], ['Kim Learner', 'Trajectory T2', 'Sign off']]);
  });
  it('shows the proof of a submitted evidence step', () => {
    const { v } = setup([kim({ T1: enrolled({ s1: { state: 'submitted', link: 'https://example.com/p', note: 'Done it' } }) })], [t]);
    expect(v.approvals[0].proof).toEqual({ link: 'https://example.com/p', note: 'Done it', ref: '' });
  });
  it('says nothing waits', () => {
    const { v } = setup([kim({ T1: enrolled() })], [t]);
    expect(v.noApprovals).toBe(true);
  });
  it('approves a start request, then reloads that person', async () => {
    const { h, v } = setup([kim({ T1: enrolled({}, 'requested') })], [t]);
    v.approvals[0].approve!(); await flush();
    expect(m.decideTrajectory).toHaveBeenCalledWith('m1', 'T1', null, 'approve');
    expect(reload).toHaveBeenCalledWith('m1');
    expect(h.toasts().at(-1)).toBe('Approved · Kim Learner is enrolled');
  });
  it('signs off a step', async () => {
    const { v } = setup([kim({ T1: enrolled({ s1: { state: 'submitted', note: 'x' } }) })], [t]);
    v.approvals[0].approve!(); await flush();
    expect(m.decideTrajectory).toHaveBeenCalledWith('m1', 'T1', 's1', 'approve');
  });
  it('talk first words the toast for a start request and for a step', async () => {
    const a = setup([kim({ T1: enrolled({}, 'requested') })], [t]);
    a.v.approvals[0].talk!(); await flush();
    expect(m.decideTrajectory).toHaveBeenCalledWith('m1', 'T1', null, 'talk');
    expect(a.h.toasts().at(-1)).toBe('Kept as a request; talk it through in your next 1:1');
    const b = setup([kim({ T1: enrolled({ s1: { state: 'submitted', note: 'x' } }) })], [t]);
    b.v.approvals[0].talk!(); await flush();
    expect(b.h.toasts().at(-1)).toBe('Sent back to Kim to talk it through');
  });
  it('shows a refusal as a toast and does not reload', async () => {
    m.decideTrajectory.mockResolvedValue({ result: null, error: 'Not allowed · ask an admin' });
    const { h, v } = setup([kim({ T1: enrolled({}, 'requested') })], [t]);
    v.approvals[0].approve!(); await flush();
    expect(h.toasts().at(-1)).toBe('Not allowed · ask an admin');
    expect(reload).not.toHaveBeenCalled();
  });
  it('offers no decision while viewing as someone else', () => {
    const { v } = setup([kim({ T1: enrolled({}, 'requested') })], [t], person({ readOnly: true }));
    expect(v.canDecide).toBe(false);
    expect(v.approvals[0].approve).toBeNull();
    expect(v.approvals[0].talk).toBeNull();
  });
});

describe('the progress table', () => {
  const t = trj('T1', { steps: [step({ id: 's1', k: 'learn', lid: 'L1' }), step({ id: 's2', k: 'evidence', title: 'Portfolio', pre: 's1' }), step({ id: 's3', k: 'check', title: 'Sign-off', req: false })] });
  it('shows required-step progress, the next step and an on-track status', () => {
    const { v } = setup([kim({ T1: enrolled() }, [], withProgress({ L1: 'accepted' }))], [t]);
    expect(v.teamTrj).toHaveLength(1);
    expect(v.teamTrj[0]).toMatchObject({ name: 'Kim Learner', trj: 'Trajectory T1', issuer: 'ITAA', prog: '1 of 2 required steps', barW: '50%', next: 'Portfolio', stLabel: 'On track' });
  });
  it('flags waiting rows and credentials earned', () => {
    const waiting = setup([kim({ T1: enrolled({ s2: { state: 'submitted', note: 'x' } }) }, [], withProgress({ L1: 'accepted' }))], [t]).v;
    expect(waiting.teamTrj[0].stLabel).toBe('Needs approval');
    const check = setup([kim({ T1: enrolled({ s3: { state: 'submitted' } }) })], [t]).v;
    expect(check.teamTrj[0].stLabel).toBe('Needs sign-off');
    const earned = setup([kim({ T1: enrolled() }, [cred()])], [t]).v;
    expect(earned.teamTrj[0].stLabel).toBe('Credential earned');
  });
  it('skips people who are not on a trajectory, and drafts nobody is enrolled in', () => {
    const { v } = setup([kim({}), kim({ T9: enrolled() })], [t, trj('T9', { status: 'draft' })]);
    expect(v.teamTrj.map((r) => r.trj)).toEqual(['Trajectory T9']);
  });
  it('counts a mandatory auto-enrolment without a row', () => {
    const auto = trj('T1', { enrol: 'auto', maps: [['Audit', 'Consultant', 'mandatory']], steps: [step({ id: 's1', k: 'evidence', title: 'Portfolio' })] });
    expect(setup([kim({})], [auto]).v.teamTrj).toHaveLength(1);
  });
});

describe('the person zoom line', () => {
  const steps = [step({ id: 's1', k: 'learn', lid: 'L1', win: 3 }), step({ id: 's2', k: 'exam', hours: 10, win: 20 })];
  it('names the audience, obligation and this year\'s share of the hours', () => {
    const t = trj('T1', { name: 'Tax adviser', months: 9, steps, maps: [['Audit', 'Consultant', 'mandatory']] });
    const rows = personTrajectories([t], ['Audit'], 'Consultant');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^Tax adviser via Audit · mandatory · \d+(\.\d)? h this year of \d+(\.\d)? h over 9 months$/);
  });
  it('says suggested for a non-business-line audience, draft for a draft, and ignores other stages', () => {
    const t = trj('T1', { name: 'Tax adviser', status: 'draft', steps, maps: [['amb:expert', 'Consultant', 'advised'], ['Audit', 'Manager', 'mandatory']] });
    expect(personTrajectories([t], ['Audit', 'amb:expert'], 'Consultant')[0]).toMatch(/^Tax adviser via .+ · suggested · draft · /);
    expect(personTrajectories([t], ['Audit'], 'Consultant')).toEqual([]);
  });
});
