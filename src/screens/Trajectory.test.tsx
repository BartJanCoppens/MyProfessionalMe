// @vitest-environment jsdom
// The learner's trajectories as seen on screen: library cards, the trajectory page, the wallet, and what View as hides.
// The store is a small in-memory stand-in, so a click goes through the real view-model, write and reload.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import * as store from '../lib/trajectoryStore';
import type { Subject } from '../lib/useSubject';
import type { Credential, Enrolment, Trajectory, TrjDecision } from '../logic/trajectory';
import { blankTrajectory } from '../logic/trajectoryEdit';
import { cfg, person } from '../test/harness';
import type { AppState } from '../types';
import TrajectoryScreen, { LibraryTrajectories } from './Trajectory';
import Wallet from './Wallet';

vi.mock('../lib/trajectoryStore', async (orig) => ({
  ...(await orig<object>()),
  requestTrajectory: vi.fn(), withdrawTrajectory: vi.fn(), submitTrajectoryStep: vi.fn(), addExternalCredential: vi.fn(), submitRenewal: vi.fn(), loadEnrolments: vi.fn(), loadCredentials: vi.fn(), loadDecisions: vi.fn(),
}));
const m = vi.mocked(store);
const boss = { id: 'c1', name: 'Casey Boss' };
let enrols: Record<string, Enrolment> = {}, creds: Credential[] = [], decisions: TrjDecision[] = [];
const START = 2026 * 12 + 9;

function Live({ state, subject }: { state: Partial<AppState>; subject: Subject }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), ...state }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, { isSystem: false, domains: [], userId: 'u1' }, subject, async () => {}, async () => {}).renderVals();
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  return <>{vm.isTrjPage ? <TrajectoryScreen vm={vm} /> : <LibraryTrajectories vm={vm} />}<Wallet vm={vm} />{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const trj = (over: Partial<Trajectory> = {}): Trajectory => ({
  ...blankTrajectory('Audit'), id: 'T1', name: 'Tax certificate', credential: 'Certified adviser', issuer: 'ITAA', status: 'live', enrol: 'open', months: 12,
  steps: [{ id: 'a', k: 'evidence', title: 'Describe your practice', win: 3, req: true, pre: null }, { id: 'b', k: 'exam', title: 'Final exam', hours: 2, win: 12, req: true, pre: 'a' }], ...over,
});
const show = (trjs: Trajectory[], subject: Subject = person({ counsellor: boss }), state: Partial<AppState> = {}) =>
  render(<Live subject={subject} state={{ trjs, trjMine: { userId: subject.id, enrols, creds, audiences: [], decisions }, ...state }} />);
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const clicked = async (name: string | RegExp) => { await act(async () => { click(name); }); };
const gone = (name: string | RegExp) => expect(screen.queryByRole('button', { name })).toBeNull();

beforeEach(() => {
  vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; enrols = {}; creds = []; decisions = [];
  m.loadEnrolments.mockImplementation(async () => ({ ...enrols }));
  m.loadCredentials.mockImplementation(async () => creds.slice());
  m.loadDecisions.mockImplementation(async () => decisions.slice());
  m.requestTrajectory.mockImplementation(async (id) => { const status = id === 'T1' ? 'requested' as const : 'enrolled' as const; enrols[id] = { status, start_month: START, steps: {} }; return { status, error: null }; });
  m.withdrawTrajectory.mockImplementation(async (id) => { delete enrols[id]; return { error: null }; });
  m.submitTrajectoryStep.mockImplementation(async (id, step, state) => { enrols[id].steps[step] = { state }; return { state, error: null }; });
});
afterEach(cleanup);

describe('the library cards', () => {
  it('open the trajectory page, which has a way back', () => {
    show([trj()]);
    expect(screen.getByText('Certification trajectories')).toBeTruthy();
    click(/Tax certificate/);
    expect(screen.getByRole('heading', { name: 'Tax certificate' })).toBeTruthy();
    click('← Back to library');
    expect(screen.queryByRole('heading', { name: 'Tax certificate' })).toBeNull();
  });
});

describe('asking, starting and withdrawing', () => {
  it('an approval trajectory is asked, shows the request, and can be withdrawn', async () => {
    show([trj({ enrol: 'approval' })], person({ counsellor: boss }), { screen: 'trajectory', trjView: 'T1' });
    await clicked('Ask Casey to approve');
    expect(m.requestTrajectory).toHaveBeenCalledWith('T1');
    expect(screen.getByText('Waiting for approval')).toBeTruthy();
    await clicked('Withdraw request');
    expect(m.withdrawTrajectory).toHaveBeenCalledWith('T1');
    expect(screen.getByRole('button', { name: 'Ask Casey to approve' })).toBeTruthy();
  });
  it('an open trajectory starts at once and then offers its first step', async () => {
    show([trj({ id: 'T2' })], person(), { screen: 'trajectory', trjView: 'T2' });
    await clicked('Start this trajectory');
    expect(screen.getByRole('button', { name: 'Send for review' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave this trajectory' })).toBeTruthy();
  });
});

describe('the steps', () => {
  it('evidence goes to the counsellor and freezes the step', async () => {
    enrols.T1 = { status: 'enrolled', start_month: START, steps: {} };
    show([trj()], person({ counsellor: boss }), { screen: 'trajectory', trjView: 'T1' });
    fireEvent.change(screen.getByLabelText(/or a note/), { target: { value: 'My practice summary' } });
    await clicked('Send for review');
    expect(m.submitTrajectoryStep).toHaveBeenCalledWith('T1', 'a', 'submitted', { link: '', ref: '', note: 'My practice summary' });
    expect(screen.getByText('With Casey Boss')).toBeTruthy();
    gone('Send for review'); gone('Book the exam');
  });
  it('Book the exam marks it booked; the result then needs a certificate', async () => {
    enrols.T1 = { status: 'enrolled', start_month: START, steps: { a: { state: 'done' } } };
    show([trj()], person({ counsellor: boss }), { screen: 'trajectory', trjView: 'T1' });
    await clicked('Book the exam');
    expect(m.submitTrajectoryStep).toHaveBeenCalledWith('T1', 'b', 'booked', {});
    expect(screen.getByText('Booked')).toBeTruthy();
    await clicked('Submit the result');
    expect(screen.getByRole('status').textContent).toBe('Add the certificate link or number');
    fireEvent.change(screen.getByLabelText('or certificate number'), { target: { value: 'ITAA-77' } });
    await clicked('Submit the result');
    expect(m.submitTrajectoryStep).toHaveBeenLastCalledWith('T1', 'b', 'submitted', { link: '', ref: 'ITAA-77', note: '' });
  });
});

describe('the wallet', () => {
  const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  it('shows Renew by, an external credential waiting for the counsellor, and adds one', async () => {
    creds = [
      { id: 'c1', user_id: 'u1', name: 'Certified adviser', issuer: 'ITAA', earned_on: '2025-01-05', expires_on: soon, link: '', ref: 'A1', trajectory_id: 'T1', status: 'confirmed' },
      { id: 'c2', user_id: 'u1', name: 'CFA', issuer: 'CFA Institute', earned_on: '2026-05-01', expires_on: null, link: 'https://example.com/c', ref: '', trajectory_id: null, status: 'waiting' },
    ];
    m.addExternalCredential.mockImplementation(async (c) => { creds.push({ id: 'c3', user_id: 'u1', trajectory_id: null, status: 'waiting', ...c, link: c.link, ref: c.ref }); return { error: null }; });
    show([], person({ counsellor: boss }));
    expect(screen.getByText(/^Renew by /)).toBeTruthy();
    expect(screen.getByText('Waiting for Casey Boss')).toBeTruthy();
    click('+ Add an external credential');
    const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    type('Credential', 'IFRS diploma'); type('Issued by', 'ACCA'); type('Earned on', '2026-06-01'); type('or certificate number', 'D-9');
    await clicked('Add credential');
    expect(m.addExternalCredential).toHaveBeenCalledWith(expect.objectContaining({ name: 'IFRS diploma', issuer: 'ACCA', ref: 'D-9', expires_on: null }));
    expect(screen.getByText('IFRS diploma')).toBeTruthy();
  });
  it('renews a trajectory credential with a certificate number; the card then waits for the counsellor', async () => {
    creds = [{ id: 'c1', user_id: 'u1', name: 'Certified adviser', issuer: 'ITAA', earned_on: '2025-01-05', expires_on: soon, link: '', ref: 'A1', trajectory_id: 'T1', status: 'confirmed' }];
    m.submitRenewal.mockImplementation(async (id, p) => { creds.push({ ...creds[0], id: 'r1', status: 'waiting', renewal_of: id, ref: p.ref, expires_on: null }); return { error: null }; });
    show([trj({ renewal: 'Every 2 years: 40 CPD hours' })], person({ counsellor: boss }));
    click('Renew');
    expect(screen.getByText('Every 2 years: 40 CPD hours')).toBeTruthy();
    expect(screen.queryByLabelText('New expiry date')).toBeNull();
    expect(screen.getByLabelText('Link to the new certificate').getAttribute('maxLength')).toBe('500');
    fireEvent.change(screen.getByLabelText('or certificate number'), { target: { value: 'A2' } });
    await clicked('Send renewal');
    expect(m.submitRenewal).toHaveBeenCalledWith('c1', { link: '', ref: 'A2', expires: null });
    expect(screen.getByText('Renewal waiting for Casey Boss')).toBeTruthy();
    expect(screen.getAllByText('Certified adviser', { selector: 'div' })).toHaveLength(1);
    gone('Renew');
    expect(screen.getByRole('button', { name: 'Remove renewal' })).toBeTruthy();
  });
});

describe('View as', () => {
  const viewing = () => person({ readOnly: true, counsellor: boss });
  it('shows the viewed person\'s trajectory without a single action', () => {
    enrols.T1 = { status: 'enrolled', start_month: START, steps: {} };
    creds = [{ id: 'c1', user_id: 'u1', name: 'Certified adviser', issuer: 'ITAA', earned_on: '2025-01-05', expires_on: null, link: '', ref: 'A1', trajectory_id: 'T1', status: 'confirmed' }];
    show([trj()], viewing(), { screen: 'trajectory', trjView: 'T1' });
    expect(screen.getByText('Certified adviser', { selector: 'div' })).toBeTruthy();
    ['Send for review', 'Book the exam', 'Leave this trajectory', 'Start this trajectory', '+ Add an external credential', /Ask .* to approve/, 'Request sign-off'].forEach(gone);
    expect(screen.getByText(/^Enrolled since/)).toBeTruthy();
  });
  it('shows the counsellor\'s talk-first comment on the step it concerns', () => {
    enrols.T1 = { status: 'enrolled', start_month: START, steps: {} };
    decisions = [{ trajectoryId: 'T1', stepId: 'a', decision: 'talk', comment: 'Add the client file, please.', byName: 'Casey Boss', at: '2026-11-10T09:00:00Z' }];
    show([trj()], viewing(), { screen: 'trajectory', trjView: 'T1' });
    expect(screen.getByText('Casey: Add the client file, please.')).toBeTruthy();
  });
  it('offers no start on a trajectory the viewed person has not begun', () => {
    show([trj()], viewing(), { screen: 'trajectory', trjView: 'T1' });
    gone('Start this trajectory');
    expect(m.requestTrajectory).not.toHaveBeenCalled();
  });
});
