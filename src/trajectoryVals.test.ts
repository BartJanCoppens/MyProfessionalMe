import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN_META } from './data';
import { parseFormatContent } from './lib/contentStore';
import * as store from './lib/trajectoryStore';
import type { Credential, Enrolment, Trajectory, TrjStep } from './logic/trajectory';
import { blankTrajectory } from './logic/trajectoryEdit';
import { flush, harness, person, stubWindow } from './test/harness';
import type { AppState } from './types';

vi.mock('./lib/trajectoryStore', async (orig) => ({
  ...(await orig<object>()),
  requestTrajectory: vi.fn(), withdrawTrajectory: vi.fn(), submitTrajectoryStep: vi.fn(), addExternalCredential: vi.fn(), loadEnrolments: vi.fn(), loadCredentials: vi.fn(),
}));
const m = vi.mocked(store);
const boss = { id: 'c1', name: 'Casey Boss' };
const step = (over: Partial<TrjStep> & Pick<TrjStep, 'id' | 'k'>): TrjStep => ({ win: 6, req: true, pre: null, ...over });
const trj = (id: string, over: Partial<Trajectory> = {}): Trajectory => ({ ...blankTrajectory('Audit'), id, name: 'Trajectory ' + id, status: 'live', enrol: 'open', published_at: '2026-09-10T08:00:00Z', ...over });
const START = 2026 * 12 + 9;
const enrolled = (steps: Enrolment['steps'] = {}): Enrolment => ({ status: 'enrolled', start_month: START, steps });
const mine = (enrols: Record<string, Enrolment>, creds: Credential[] = []): Partial<AppState> => ({ trjMine: { userId: 'u1', enrols, creds } });
const cred = (over: Partial<Credential> = {}): Credential => ({ id: 'c1', user_id: 'u1', name: 'Certified adviser', issuer: 'ITAA', earned_on: '2026-01-05', expires_on: null, link: '', ref: '', trajectory_id: null, status: 'confirmed', ...over });
const ok = { error: null };

beforeEach(() => {
  vi.clearAllMocks(); stubWindow();
  m.requestTrajectory.mockResolvedValue({ status: 'enrolled', error: null });
  m.withdrawTrajectory.mockResolvedValue(ok);
  m.submitTrajectoryStep.mockResolvedValue({ state: 'submitted', error: null });
  m.addExternalCredential.mockResolvedValue(ok);
  m.loadEnrolments.mockResolvedValue({});
  m.loadCredentials.mockResolvedValue([]);
});
const page = (t: Trajectory, state: Partial<AppState> = {}, subject = person({ counsellor: boss })) =>
  harness({ subject, state: { screen: 'trajectory', trjView: t.id, trjOrigin: 'library', trjs: [t], ...state } });

describe('library cards', () => {
  it('list enrolled first, then those for you, then the rest, live ones only', () => {
    const rest = trj('T1'), foryou = trj('T2', { maps: [['Audit', 'Consultant', 'advised']] }), yours = trj('T3'), draft = trj('T4', { status: 'draft' });
    const h = harness({ state: { trjs: [rest, foryou, yours, draft], ...mine({ T3: enrolled() }) }, subject: person({ businessLine: 'Audit' }) });
    const v = h.vm();
    expect(v.libTrj.map((c) => c.name)).toEqual(['Trajectory T3', 'Trajectory T2', 'Trajectory T1']);
    expect(v.libTrj.map((c) => c.status)).toEqual(['Enrolled · 0 of 1 required steps', 'For you · via Audit', 'For nobody yet']);
    expect(v.libTrjSub).toContain('1 yours');
  });
  it('show a trajectory the person is enrolled in even when it is retired', () => {
    const h = harness({ state: { trjs: [trj('T1', { status: 'retired' })], ...mine({ T1: enrolled() }) } });
    expect(h.vm().libTrj).toHaveLength(1);
  });
  it('name the real counsellor while a request waits, else "your counsellor"', () => {
    const t = trj('T1', { enrol: 'approval' }), st = { trjs: [t], ...mine({ T1: { ...enrolled(), status: 'requested' as const } }) };
    expect(harness({ state: st, subject: person({ counsellor: boss }) }).vm().libTrj[0].status).toBe('Waiting for Casey Boss to approve');
    expect(harness({ state: st }).vm().libTrj[0].status).toBe('Waiting for your counsellor to approve');
  });
  it('count a mandatory auto-enrolment as yours without a row', () => {
    const t = trj('T1', { enrol: 'auto', maps: [['Audit', 'Consultant', 'mandatory']] });
    const v = harness({ state: { trjs: [t], ...mine({}) }, subject: person({ businessLine: 'Audit' }) }).vm();
    expect(v.libTrj[0].status).toMatch(/^Enrolled/);
  });
});

describe('starting and asking', () => {
  it('an open trajectory starts at once', async () => {
    const t = trj('T1'), h = page(t, mine({}));
    expect(h.vm().tv!.primary!.label).toBe('Start this trajectory');
    m.loadEnrolments.mockResolvedValue({ T1: enrolled() });
    await h.vm().tv!.primary!.run(); await flush();
    expect(m.requestTrajectory).toHaveBeenCalledWith('T1');
    expect(h.state.trjMine?.enrols.T1.status).toBe('enrolled');
    expect(h.vm().tv!.primary).toBeNull();
  });
  it('an approval trajectory asks the counsellor and writes requested', async () => {
    const t = trj('T1', { enrol: 'approval' }), h = page(t, mine({}));
    expect(h.vm().tv!.primary!.label).toBe('Ask Casey to approve');
    m.requestTrajectory.mockResolvedValue({ status: 'requested', error: null });
    m.loadEnrolments.mockResolvedValue({ T1: { ...enrolled(), status: 'requested' } });
    await h.vm().tv!.primary!.run(); await flush();
    expect(h.state.trjMine?.enrols.T1.status).toBe('requested');
    expect(h.lastToast()).toContain('Casey');
    expect(h.vm().tv!.secondary!.label).toBe('Withdraw request');
  });
  it('without a counsellor the button says "your counsellor"', () => {
    expect(page(trj('T1', { enrol: 'approval' }), mine({}), person()).vm().tv!.primary!.label).toBe('Ask your counsellor to approve');
  });
  it('an auto trajectory behaves like open for someone outside its mandatory audiences', () => {
    const t = trj('T1', { enrol: 'auto', maps: [['Tax & Legal', 'Consultant', 'mandatory']] });
    expect(page(t, mine({})).vm().tv!.primary!.label).toBe('Start this trajectory');
  });
  it('a refusal comes back as a toast and nothing is reloaded', async () => {
    m.requestTrajectory.mockResolvedValue({ status: null, error: 'This trajectory is not open' });
    const h = page(trj('T1'), mine({}));
    await h.vm().tv!.primary!.run(); await flush();
    expect(h.lastToast()).toBe('This trajectory is not open');
    expect(m.loadEnrolments).not.toHaveBeenCalled();
  });
});

describe('leaving', () => {
  it('withdraws a request and reloads', async () => {
    const h = page(trj('T1', { enrol: 'approval' }), mine({ T1: { ...enrolled(), status: 'requested' } }));
    await h.vm().tv!.secondary!.run(); await flush();
    expect(m.withdrawTrajectory).toHaveBeenCalledWith('T1');
    expect(h.state.trjMine?.enrols).toEqual({});
  });
  it('is offered only while no step is done and never to a mandatory auto person', () => {
    expect(page(trj('T1'), mine({ T1: enrolled() })).vm().tv!.secondary!.label).toBe('Leave this trajectory');
    expect(page(trj('T1'), mine({ T1: enrolled({ s1: { state: 'done' } }) })).vm().tv!.secondary).toBeNull();
    const auto = trj('T1', { enrol: 'auto', maps: [['Audit', 'Consultant', 'mandatory']] });
    expect(page(auto, mine({ T1: enrolled() }), person({ businessLine: 'Audit', counsellor: boss })).vm().tv!.secondary).toBeNull();
  });
});

describe('steps of an enrolled learner', () => {
  const steps = [step({ id: 'a', k: 'evidence', title: 'Evidence' }), step({ id: 'b', k: 'check', title: 'Sign-off', pre: 'a' }), step({ id: 'c', k: 'exam', title: 'Exam', pre: 'b' })];
  const t = trj('T1', { steps });
  const act = (h: ReturnType<typeof page>, n: number) => h.vm().tv!.steps[n].act;

  it('only the unlocked step has an action, and it is the primary one', () => {
    const h = page(t, mine({ T1: enrolled() }));
    expect(act(h, 0)).toMatchObject({ label: 'Send for review', variant: 'primary' });
    expect(act(h, 1)).toBeNull(); expect(act(h, 2)).toBeNull();
    expect(h.vm().tv!.steps[1].lockText).toMatch(/step 1/);
  });
  it('evidence needs a link or a note, then submits', async () => {
    const h = page(t, mine({ T1: enrolled() }));
    await act(h, 0)!.run(); await flush();
    expect(m.submitTrajectoryStep).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Add a link to the evidence or a note');
    act(h, 0)!.form!.set('note', 'Workpaper summary');
    await act(h, 0)!.run(); await flush();
    expect(m.submitTrajectoryStep).toHaveBeenCalledWith('T1', 'a', 'submitted', { link: '', ref: '', note: 'Workpaper summary' });
  });
  it('a sign-off is requested with no proof', async () => {
    const h = page(t, mine({ T1: enrolled({ a: { state: 'done' } }) }));
    expect(act(h, 1)!.label).toBe('Request sign-off');
    await act(h, 1)!.run(); await flush();
    expect(m.submitTrajectoryStep).toHaveBeenCalledWith('T1', 'b', 'submitted', {});
  });
  it('a submitted step is frozen and shows who has it', () => {
    const h = page(t, mine({ T1: enrolled({ a: { state: 'submitted', note: 'x' } }) }));
    expect(act(h, 0)).toBeNull();
    expect(h.vm().tv!.steps[0].stLabel).toBe('With Casey Boss');
  });
  it('"Book the exam" marks it booked without proof and without an external call', async () => {
    const h = page(t, mine({ T1: enrolled({ a: { state: 'done' }, b: { state: 'done' } }) }));
    expect(act(h, 2)!.label).toBe('Book the exam');
    await act(h, 2)!.run(); await flush();
    expect(m.submitTrajectoryStep).toHaveBeenCalledWith('T1', 'c', 'booked', {});
    expect(h.toasts().join()).not.toMatch(/Prototype|booking page/);
  });
  it('once booked, "Submit the result" needs a certificate link or number', async () => {
    const h = page(t, mine({ T1: enrolled({ a: { state: 'done' }, b: { state: 'done' }, c: { state: 'booked' } }) }));
    expect(h.vm().tv!.steps[2].stLabel).toBe('Booked');
    expect(act(h, 2)!.label).toBe('Submit the result');
    await act(h, 2)!.run(); await flush();
    expect(m.submitTrajectoryStep).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Add the certificate link or number');
    act(h, 2)!.form!.set('link', 'not a link');
    await act(h, 2)!.run(); await flush();
    expect(h.lastToast()).toBe('The link must start with http:// or https://');
    act(h, 2)!.form!.set('link', 'https://example.com/cert/1');
    await act(h, 2)!.run(); await flush();
    expect(m.submitTrajectoryStep).toHaveBeenCalledWith('T1', 'c', 'submitted', { link: 'https://example.com/cert/1', ref: '', note: '' });
  });
  it('a learning step opens the learning, and a missing one says so', () => {
    const lt = trj('T1', { steps: [step({ id: 'a', k: 'learn', lid: 'L10' }), step({ id: 'b', k: 'learn', lid: 'L-gone' })] });
    const h = page(lt, mine({ T1: enrolled() }));
    const s = h.vm().tv!.steps;
    expect(s[0].act!.label).toBe('Open learning');
    s[0].act!.run();
    expect(h.state).toMatchObject({ screen: 'detail', detailId: 'L10', origin: 'trajectory' });
    expect(s[1].stLabel).toBe('No longer in the library'); expect(s[1].act).toBeNull();
  });
  it('a mandatory auto person acts without a row', () => {
    const auto = trj('T1', { enrol: 'auto', maps: [['Audit', 'Consultant', 'mandatory']], steps });
    const h = page(auto, mine({}), person({ businessLine: 'Audit', counsellor: boss }));
    expect(h.vm().tv!.steps[0].act!.label).toBe('Send for review');
  });
});

describe('View as is read-only', () => {
  const t = trj('T1', { enrol: 'approval', steps: [step({ id: 'a', k: 'evidence', title: 'Evidence' }), step({ id: 'b', k: 'exam', title: 'Exam' })] });
  const viewing = person({ readOnly: true, counsellor: boss });
  it('shows the viewed person\'s enrolment and no action', () => {
    const h = page(t, mine({ T1: enrolled() }), viewing);
    const tv = h.vm().tv!;
    expect(tv.primary).toBeNull(); expect(tv.secondary).toBeNull();
    expect(tv.steps.every((s) => s.act === null)).toBe(true);
    expect(tv.stLabel).toMatch(/^Enrolled/);
  });
  it('offers no start or ask', () => {
    const tv = page(t, mine({}), viewing).vm().tv!;
    expect(tv.primary).toBeNull();
  });
  it('shows no way to add a credential, and the form cannot be opened', () => {
    const v = harness({ subject: viewing, state: mine({}) }).vm();
    expect(v.canAddCred).toBe(false);
    v.addCred();
  });
  it('ignores data loaded for someone else', () => {
    const h = page(t, { trjMine: { userId: 'someone-else', enrols: { T1: enrolled() }, creds: [cred()] } });
    expect(h.vm().wallet).toEqual([]);
    expect(h.vm().tv!.stLabel).toBe('Not started');
  });
});

describe('the credentials wallet', () => {
  const now = new Date(), in10 = new Date(now.getTime() + 10 * 864e5).toISOString().slice(0, 10), in90 = new Date(now.getTime() + 90 * 864e5).toISOString().slice(0, 10);
  it('shows Valid, Renew by within 30 days, and external credentials waiting for the counsellor', () => {
    const creds = [cred({ id: 'a', expires_on: in90 }), cred({ id: 'b', name: 'Soon', expires_on: in10 }), cred({ id: 'c', name: 'External', status: 'waiting' })];
    const v = harness({ subject: person({ counsellor: boss }), state: mine({}, creds) }).vm();
    expect(v.wallet.map((w) => w.stLabel)).toEqual(['Valid', expect.stringMatching(/^Renew by /), 'Waiting for Casey Boss']);
    expect(v.wallet[1].st).toBe('clarification');
  });
  it('lists the subject\'s enrolments under Working toward', () => {
    const t = trj('T1', { credential: 'Certified adviser' });
    const v = harness({ state: { trjs: [t], ...mine({ T1: enrolled() }) } }).vm();
    expect(v.hasWork).toBe(true);
    expect(v.walletWork[0]).toMatchObject({ name: 'Trajectory T1', prog: '0 of 1 required steps' });
  });
  it('adds an external credential through a form, validated first', async () => {
    const h = harness({ subject: person({ counsellor: boss }), state: mine({}) });
    h.vm().addCred();
    const f = () => h.vm().credForm!;
    expect(f()).not.toBeNull();
    f().submit(); await flush();
    expect(m.addExternalCredential).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Add the credential name');
    f().set('name', 'CFA'); f().set('issuer', 'CFA Institute'); f().set('earned', '2026-05-01'); f().set('ref', 'A-123');
    m.loadCredentials.mockResolvedValue([cred({ status: 'waiting' })]);
    f().submit(); await flush();
    expect(m.addExternalCredential).toHaveBeenCalledWith({ name: 'CFA', issuer: 'CFA Institute', earned_on: '2026-05-01', expires_on: null, link: '', ref: 'A-123' });
    expect(h.state.credForm).toBeNull();
    expect(h.state.trjMine?.creds).toHaveLength(1);
  });
  it('wants a link or a certificate number', async () => {
    const h = harness({ state: mine({}) });
    h.vm().addCred();
    const f = () => h.vm().credForm!;
    f().set('name', 'CFA'); f().set('issuer', 'CFA Institute'); f().set('earned', '2026-05-01');
    f().submit(); await flush();
    expect(h.lastToast()).toBe('Add a link or the certificate number');
  });
});

describe('the practice exam', () => {
  const exam = () => parseFormatContent({ kind: 'exam', bank: 40, real: 'The real exam has 50 questions', qs: [{ t: 'Rates', q: 'First?', o: ['a', 'b'], a: 1, why: 'Because b' }] });
  let saved: (typeof LEARN_META)[string];
  beforeEach(() => { saved = LEARN_META.L61; LEARN_META.L61 = { line: null, status: 'published', content: exam() }; });
  afterEach(() => { LEARN_META.L61 = saved; });
  const at = (trjs: Trajectory[], state: Partial<AppState> = {}) => harness({ state: { screen: 'detail', detailId: 'L61', trjs, ...state } });
  const withL61 = (id: string, over: Partial<Trajectory> = {}) => trj(id, { steps: [step({ id: 'a', k: 'learn', lid: 'L61' })], ...over });

  it('has no link when no live or enrolled trajectory includes it', () => {
    expect(at([trj('T1'), withL61('T2', { status: 'draft' })]).vm().det.ex!.hasTrj).toBe(false);
  });
  it('links to the first live trajectory that includes it, also through an elective', () => {
    const elective = trj('T1', { steps: [step({ id: 'a', k: 'elect', opts: ['L10', 'L61'], pick: 1 })] });
    const h = at([withL61('T0', { status: 'draft' }), elective, withL61('T2')]);
    const ex = h.vm().det.ex!;
    expect(ex.hasTrj).toBe(true); expect(ex.trjText).toBe('Part of Trajectory T1.');
    ex.openTrj!();
    expect(h.state).toMatchObject({ screen: 'trajectory', trjView: 'T1', trjOrigin: 'library' });
  });
  it('also links to a retired trajectory the person is enrolled in', () => {
    expect(at([withL61('T1', { status: 'retired' })], mine({ T1: enrolled() })).vm().det.ex!.hasTrj).toBe(true);
  });
});
