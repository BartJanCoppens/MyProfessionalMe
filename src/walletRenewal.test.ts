// Renewing a credential from the wallet: who may, the form, what the wallet shows while it waits, and "earned".
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/trajectoryStore';
import type { Credential, Trajectory } from './logic/trajectory';
import { blankTrajectory } from './logic/trajectoryEdit';
import { flush, harness, person, stubWindow } from './test/harness';

vi.mock('./lib/trajectoryStore', async (orig) => ({
  ...(await orig<object>()),
  submitRenewal: vi.fn(), removeCredential: vi.fn(), loadEnrolments: vi.fn(), loadCredentials: vi.fn(), loadDecisions: vi.fn(),
}));
vi.mock('./lib/membershipStore', () => ({ loadAudiences: vi.fn(async () => []) }));
const m = vi.mocked(store);
const boss = { id: 'b1', name: 'Casey Boss' };
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const cred = (over: Partial<Credential> = {}): Credential => ({ id: 'c1', user_id: 'u1', name: 'Certified adviser', issuer: 'ITAA', earned_on: '2024-01-05', expires_on: day(10), link: '', ref: '', trajectory_id: null, status: 'confirmed', ...over });
const trj: Trajectory = { ...blankTrajectory('Audit'), id: 'T1', name: 'Tax adviser', status: 'live', enrol: 'open', valid_months: 24, renewal: 'Every 2 years: 40 CPD hours and the ethics module' };
const wallet = (creds: Credential[], subject = person({ counsellor: boss })) =>
  harness({ subject, state: { trjs: [trj], trjMine: { userId: 'u1', enrols: {}, creds, audiences: [], decisions: [] } } });

beforeEach(() => {
  vi.clearAllMocks(); stubWindow();
  m.submitRenewal.mockResolvedValue({ error: null });
  m.removeCredential.mockResolvedValue({ error: null });
  m.loadEnrolments.mockResolvedValue({});
  m.loadCredentials.mockResolvedValue([]);
  m.loadDecisions.mockResolvedValue([]);
});

describe('the Renew action', () => {
  it('shows on a confirmed credential within 30 days of expiry or expired, not earlier, not without expiry, not while waiting', () => {
    const creds = [cred({ id: 'a', expires_on: day(10) }), cred({ id: 'b', expires_on: day(-5) }), cred({ id: 'c', expires_on: day(60) }), cred({ id: 'd', expires_on: null }), cred({ id: 'e', status: 'waiting' })];
    expect(wallet(creds).vm().wallet.map((w) => w.renew?.label ?? null)).toEqual(['Renew', 'Renew', null, null, null]);
  });
  it('is not offered in View as, and its form cannot be opened there', () => {
    const h = wallet([cred()], person({ readOnly: true, counsellor: boss }));
    expect(h.vm().wallet[0].renew).toBeNull();
    h.L().setState({ renewForm: { id: 'c1', link: '', ref: '', expires: '' } });
    expect(h.vm().renewForm).toBeNull();
  });
});

describe('the renewal form', () => {
  it('for a trajectory credential shows the trajectory\'s renewal rule and asks no expiry', () => {
    const h = wallet([cred({ trajectory_id: 'T1' })]);
    h.vm().wallet[0].renew!.run();
    expect(h.vm().renewForm).toMatchObject({ name: 'Certified adviser', hint: 'Every 2 years: 40 CPD hours and the ethics module', needsExpiry: false, expiryNote: 'The new expiry date is set when Casey Boss confirms.' });
  });
  it('wants a link or a number, and for an external credential a new expiry after today', async () => {
    const h = wallet([cred()]);
    h.vm().wallet[0].renew!.run();
    const f = () => h.vm().renewForm!;
    expect(f()).toMatchObject({ hint: '', needsExpiry: true });
    f().submit(); await flush();
    expect(h.lastToast()).toBe('Add a link or the certificate number');
    f().set('link', 'ftp://x'); f().submit(); await flush();
    expect(h.lastToast()).toBe('The link must start with http:// or https://');
    f().set('link', ''); f().set('ref', 'N-2'); f().submit(); await flush();
    expect(h.lastToast()).toBe('Add the new expiry date');
    f().set('expires', day(0)); f().submit(); await flush();
    expect(h.lastToast()).toBe('The new expiry date must be after today');
    expect(m.submitRenewal).not.toHaveBeenCalled();
  });
  it('sends the proof once on a double click, closes and reloads', async () => {
    const h = wallet([cred()]);
    h.vm().wallet[0].renew!.run();
    const f = () => h.vm().renewForm!;
    f().set('ref', ' N-2 '); f().set('expires', day(400));
    m.loadCredentials.mockResolvedValue([cred(), cred({ id: 'r1', status: 'waiting', renewal_of: 'c1', ref: 'N-2', expires_on: day(400) })]);
    f().submit(); f().submit(); await flush();
    expect(m.submitRenewal).toHaveBeenCalledTimes(1);
    expect(m.submitRenewal).toHaveBeenCalledWith('c1', { link: '', ref: ' N-2 ', expires: day(400) });
    expect(h.lastToast()).toBe('Sent · Casey Boss confirms your renewal');
    expect(h.state.renewForm).toBeNull();
  });
  it('sends no expiry for a trajectory credential and keeps the form on a refusal', async () => {
    m.submitRenewal.mockResolvedValue({ error: 'A renewal of this credential is already waiting.' });
    const h = wallet([cred({ trajectory_id: 'T1' })]);
    h.vm().wallet[0].renew!.run();
    h.vm().renewForm!.set('link', 'https://cert.example/r');
    h.vm().renewForm!.submit(); await flush();
    expect(m.submitRenewal).toHaveBeenCalledWith('c1', { link: 'https://cert.example/r', ref: '', expires: null });
    expect(h.lastToast()).toBe('A renewal of this credential is already waiting.');
    expect(h.vm().renewForm).not.toBeNull();
  });
});

describe('the wallet while a renewal waits, and after it is confirmed', () => {
  const waiting = cred({ id: 'r1', status: 'waiting', renewal_of: 'c1', ref: 'N-2' });
  it('lists the credential once, as "Renewal waiting for", with Remove renewal and no Renew', () => {
    const v = wallet([cred(), waiting]).vm();
    expect(v.wallet).toHaveLength(1);
    expect(v.wallet[0]).toMatchObject({ id: 'c1', stLabel: 'Renewal waiting for Casey Boss', st: 'submitted', renew: null, remove: { label: 'Remove renewal' } });
  });
  it('Remove renewal removes the waiting renewal row, not the credential', async () => {
    const h = wallet([cred(), waiting]);
    m.loadCredentials.mockResolvedValue([cred()]);
    await h.vm().wallet[0].remove!.run(); await flush();
    expect(m.removeCredential).toHaveBeenCalledWith('r1');
    expect(h.lastToast()).toBe('Renewal removed · “Certified adviser” keeps its current dates');
  });
  it('offers no Remove renewal in View as', () => {
    expect(wallet([cred(), waiting], person({ readOnly: true, counsellor: boss })).vm().wallet[0].remove).toBeNull();
  });
  it('hides a superseded credential and shows the renewal that replaced it', () => {
    const v = wallet([cred({ superseded_at: '2026-11-17T10:00:00Z' }), cred({ id: 'r1', renewal_of: 'c1', expires_on: day(700) })]).vm();
    expect(v.wallet.map((w) => [w.id, w.stLabel])).toEqual([['r1', 'Valid']]);
  });
  it('does not count a superseded credential as earned on the library card', () => {
    const t = { ...trj, steps: [{ id: 's1', k: 'evidence' as const, title: 'E', win: 6, req: true, pre: null }] };
    const enrols = { T1: { status: 'enrolled' as const, start_month: 2026 * 12 + 9, steps: { s1: { state: 'done' as const } } } };
    const at = (creds: Credential[]) => harness({ state: { trjs: [t], trjMine: { userId: 'u1', enrols, creds, audiences: [], decisions: [] } } }).vm().libTrj[0].status;
    expect(at([cred({ trajectory_id: 'T1', expires_on: day(100) })])).toBe('Credential earned');
    expect(at([cred({ trajectory_id: 'T1', expires_on: day(100), superseded_at: '2026-11-17T10:00:00Z' })])).not.toBe('Credential earned');
  });
});
