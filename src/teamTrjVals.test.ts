import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/trajectoryStore';
import type { Credential, Enrolment, Trajectory, TrjStep } from './logic/trajectory';
import type { Member } from './logic/team';
import { blankTrajectory } from './logic/trajectoryEdit';
import { dayLabel, renewedExpiry } from './logic/trajectoryLearner';
import { personTrajectories, teamTrjVals } from './teamTrjVals';
import { emptyData, flush, harness, person, stubWindow, withProgress } from './test/harness';

vi.mock('./lib/trajectoryStore', async (orig) => ({ ...(await orig<object>()), decideTrajectory: vi.fn(), confirmCredential: vi.fn() }));
const m = vi.mocked(store);
const step = (over: Partial<TrjStep> & Pick<TrjStep, 'id' | 'k'>): TrjStep => ({ win: 6, req: true, pre: null, ...over });
const trj = (id: string, over: Partial<Trajectory> = {}): Trajectory => ({ ...blankTrajectory('Audit'), id, name: 'Trajectory ' + id, issuer: 'ITAA', status: 'live', enrol: 'open', ...over });
const enrolled = (steps: Enrolment['steps'] = {}, status: Enrolment['status'] = 'enrolled'): Enrolment => ({ status, start_month: 2026 * 12 + 9, steps });
const kim = (enrols: Record<string, Enrolment>, creds: Credential[] = [], data = emptyData()): Member =>
  ({ id: 'm1', name: 'Kim Learner', stage: 'Consultant', businessLine: 'Audit', data, trj: { enrols, creds }, audiences: [] });
const cred = (over: Partial<Credential> = {}): Credential => ({ id: 'c1', user_id: 'm1', name: 'Certified', issuer: 'ITAA', earned_on: '2026-01-05', expires_on: null, link: '', ref: '', trajectory_id: 'T1', status: 'confirmed', ...over });
const reload = vi.fn(async () => {});
const setup = (members: Member[], trjs: Trajectory[], subject = person()) => {
  const h = harness({ subject, state: { trjs } });
  return { h, v: teamTrjVals(h.L(), members, reload) };
};

beforeEach(() => { vi.clearAllMocks(); m.confirmCredential.mockResolvedValue({ error: null }); stubWindow(); m.decideTrajectory.mockResolvedValue({ result: 'done', error: null }); });

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
    expect(m.decideTrajectory).toHaveBeenCalledWith('m1', 'T1', null, 'approve', null, 'Kim');
    expect(reload).toHaveBeenCalledWith('m1');
    expect(h.toasts().at(-1)).toBe('Approved · Kim Learner is enrolled');
  });
  it('signs off a step', async () => {
    const { v } = setup([kim({ T1: enrolled({ s1: { state: 'submitted', note: 'x' } }) })], [t]);
    v.approvals[0].approve!(); await flush();
    expect(m.decideTrajectory).toHaveBeenCalledWith('m1', 'T1', 's1', 'approve', null, 'Kim');
  });
  it('talk first opens a comment field and sends nothing yet', () => {
    const { h, v } = setup([kim({ T1: enrolled({ s1: { state: 'submitted', note: 'x' } }) })], [t]);
    expect(v.approvals[0].talkForm).toBeNull();
    v.approvals[0].talk!();
    const f = teamTrjVals(h.L(), [kim({ T1: enrolled({ s1: { state: 'submitted', note: 'x' } }) })], reload).approvals[0].talkForm!;
    expect(f).toMatchObject({ text: '', count: '0 / 500', ok: false, sendLabel: 'Send back', max: 500 });
    expect(m.decideTrajectory).not.toHaveBeenCalled();
  });
  it('stays disabled under 10 characters (trimmed) and counts like the Approvals comment', async () => {
    const members = [kim({ T1: enrolled({ s1: { state: 'submitted', note: 'x' } }) })];
    const { h, v } = setup(members, [t]);
    v.approvals[0].talk!();
    const form = () => teamTrjVals(h.L(), members, reload).approvals[0].talkForm!;
    form().set('   123456789   ');
    expect(form()).toMatchObject({ count: '9 / 500', ok: false });
    await form().send(); await flush();
    expect(m.decideTrajectory).not.toHaveBeenCalled();
    form().set('1234567890');
    expect(form()).toMatchObject({ count: '10 / 500', ok: true });
  });
  it('sends a step back with the comment, words the toast truthfully and closes the field', async () => {
    const members = [kim({ T1: enrolled({ s1: { state: 'submitted', note: 'x' } }) })];
    const { h, v } = setup(members, [t]);
    v.approvals[0].talk!();
    teamTrjVals(h.L(), members, reload).approvals[0].talkForm!.set('  Add the client file, please.  ');
    await teamTrjVals(h.L(), members, reload).approvals[0].talkForm!.send(); await flush();
    expect(m.decideTrajectory).toHaveBeenCalledWith('m1', 'T1', 's1', 'talk', 'Add the client file, please.', 'Kim');
    expect(reload).toHaveBeenCalledWith('m1');
    expect(h.toasts().at(-1)).toBe('Sent back to Kim with your comment');
    expect(teamTrjVals(h.L(), members, reload).approvals[0].talkForm).toBeNull();
  });
  it('keeps a start request with the comment, and Cancel closes the field without sending', async () => {
    const members = [kim({ T1: enrolled({}, 'requested') })];
    const { h, v } = setup(members, [t]);
    v.approvals[0].talk!();
    const form = () => teamTrjVals(h.L(), members, reload).approvals[0].talkForm;
    expect(form()!.sendLabel).toBe('Keep as request');
    form()!.set('Let us plan the study leave.');
    await form()!.send(); await flush();
    expect(m.decideTrajectory).toHaveBeenCalledWith('m1', 'T1', null, 'talk', 'Let us plan the study leave.', 'Kim');
    expect(h.toasts().at(-1)).toBe('Kept as a request · Kim sees your comment');
    v.approvals[0].talk!();
    form()!.cancel();
    expect(form()).toBeNull();
  });
  it('keeps the field and the text when the database refuses', async () => {
    m.decideTrajectory.mockResolvedValue({ result: null, error: 'This step is not waiting for a decision' });
    const members = [kim({ T1: enrolled({ s1: { state: 'submitted', note: 'x' } }) })];
    const { h, v } = setup(members, [t]);
    v.approvals[0].talk!();
    teamTrjVals(h.L(), members, reload).approvals[0].talkForm!.set('Add the client file, please.');
    await teamTrjVals(h.L(), members, reload).approvals[0].talkForm!.send(); await flush();
    expect(h.toasts().at(-1)).toBe('This step is not waiting for a decision');
    expect(teamTrjVals(h.L(), members, reload).approvals[0].talkForm!.text).toBe('Add the client file, please.');
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
    expect(v.approvals[0].talkForm).toBeNull();
  });
});

describe('waiting credentials', () => {
  const t = trj('T1');
  const waiting = cred({ id: 'c7', status: 'waiting', trajectory_id: null, name: 'Cloud practitioner', issuer: 'Microsoft', link: 'https://example.com/c', ref: 'AB-12' });
  it('lists a waiting credential with Confirm only, and confirms it', async () => {
    const { h, v } = setup([kim({}, [waiting, cred({ id: 'c8' })])], [t]);
    expect(v.approvals).toHaveLength(1);
    expect(v.approvals[0]).toMatchObject({ kind: 'Credential', text: 'Cloud practitioner · Microsoft', approveLabel: 'Confirm', talk: null, proof: { link: 'https://example.com/c', note: '', ref: 'AB-12' } });
    v.approvals[0].approve!(); await flush();
    expect(m.confirmCredential).toHaveBeenCalledWith('c7');
    expect(reload).toHaveBeenCalledWith('m1');
    expect(h.toasts().at(-1)).toBe('Confirmed · Kim\'s credential is in their wallet');
  });
  it('sends one decision on a double click', async () => {
    const { v } = setup([kim({}, [waiting])], [t]);
    v.approvals[0].approve!(); v.approvals[0].approve!(); await flush();
    expect(m.confirmCredential).toHaveBeenCalledTimes(1);
  });
  it('keeps the success truthful when the reload fails', async () => {
    reload.mockRejectedValueOnce(new Error('offline'));
    const { h, v } = setup([kim({}, [waiting])], [t]);
    v.approvals[0].approve!(); await flush();
    expect(h.toasts().at(-1)).toBe('Saved; refresh to see the latest');
  });
  it('lists people whose certifications did not load', () => {
    const { v } = setup([{ ...kim({}), trj: undefined }], [t]);
    expect(v.notLoaded).toEqual(['Kim Learner']);
  });
  it('counts an expired credential as not earned', () => {
    const tt = trj('T1', { steps: [step({ id: 's1', k: 'evidence', title: 'P' })] });
    const { v } = setup([kim({ T1: enrolled() }, [cred({ expires_on: '2020-01-01' })])], [tt]);
    expect(v.teamTrj[0].stLabel).toBe('On track');
  });
});

describe('renewals', () => {
  const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const label = (iso: string) => dayLabel(iso);
  const old = cred({ id: 'c1', expires_on: day(10) });
  const renewal = (over: Partial<Credential> = {}) => cred({ id: 'r1', status: 'waiting', renewal_of: 'c1', ref: 'N-2', expires_on: null, ...over });
  it('lists a renewal as "Renewal" with the proof, the current expiry and the new one from the trajectory', async () => {
    const { h, v } = setup([kim({}, [old, renewal()])], [trj('T1', { valid_months: 24 })]);
    const next = renewedExpiry(new Date(), 24)!;
    expect(v.approvals).toHaveLength(1);
    expect(v.approvals[0]).toMatchObject({ kind: 'Renewal', approveLabel: 'Confirm', talk: null, proof: { link: '', note: '', ref: 'N-2' },
      text: 'Certified · ITAA · expires ' + label(day(10)) + ' → new expiry on confirm: ' + label(next) });
    v.approvals[0].approve!(); await flush();
    expect(m.confirmCredential).toHaveBeenCalledWith('r1');
    expect(h.toasts().at(-1)).toBe('Renewed · Kim\'s credential now runs to ' + label(next));
  });
  it('an external renewal takes the date the learner gave', () => {
    const { v } = setup([kim({}, [{ ...old, trajectory_id: null }, renewal({ trajectory_id: null, expires_on: day(400) })])], [trj('T1')]);
    expect(v.approvals[0].text).toBe('Certified · ITAA · expires ' + label(day(10)) + ' → new expiry on confirm: ' + label(day(400)));
  });
  it('an external renewal whose date has passed cannot be confirmed: the row says why', () => {
    const { v } = setup([kim({}, [{ ...old, trajectory_id: null }, renewal({ trajectory_id: null, expires_on: day(0) })])], [trj('T1')]);
    expect(v.approvals[0].approve).toBeNull();
    expect(v.approvals[0].text).toMatch(/expiry date has passed; ask for a new one$/);
  });
  it('says "from the trajectory" when the trajectory is not loaded, and the toast claims no date', async () => {
    const { h, v } = setup([kim({}, [old, renewal()])], []);
    expect(v.approvals[0].text).toMatch(/→ new expiry on confirm: from the trajectory$/);
    v.approvals[0].approve!(); await flush();
    expect(h.toasts().at(-1)).toBe('Renewed');
  });
  it('offers no Confirm in View as', () => {
    expect(setup([kim({}, [old, renewal()])], [trj('T1')], person({ readOnly: true })).v.approvals[0].approve).toBeNull();
  });
  it('a superseded credential is not "earned" in the table', () => {
    const tt = trj('T1', { steps: [step({ id: 's1', k: 'evidence', title: 'P' })] });
    const { v } = setup([kim({ T1: enrolled() }, [cred({ superseded_at: '2026-11-17T10:00:00Z' })])], [tt]);
    expect(v.teamTrj[0].stLabel).toBe('On track');
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
  it('says retired for a retired trajectory', () => {
    const t = trj('T1', { status: 'retired', steps, maps: [['Audit', 'Consultant', 'mandatory']] });
    expect(personTrajectories([t], ['Audit'], 'Consultant')[0]).toContain(' · mandatory · retired · ');
  });
  it('says suggested for a non-business-line audience, draft for a draft, and ignores other stages', () => {
    const t = trj('T1', { name: 'Tax adviser', status: 'draft', steps, maps: [['amb:expert', 'Consultant', 'advised'], ['Audit', 'Manager', 'mandatory']] });
    expect(personTrajectories([t], ['Audit', 'amb:expert'], 'Consultant')[0]).toMatch(/^Tax adviser via .+ · suggested · draft · /);
    expect(personTrajectories([t], ['Audit'], 'Consultant')).toEqual([]);
  });
});
