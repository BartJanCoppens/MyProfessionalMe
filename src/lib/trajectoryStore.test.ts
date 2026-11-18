// @vitest-environment jsdom
// The trajectory store against the in-memory Supabase fake: parsing at the boundary, saving, and the RPC wrappers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, has, op } from '../test/fakeSupabase';
import {
  addExternalCredential, confirmCredential, createTrajectory, decideTrajectory, deleteTrajectory, loadTrajectoriesInUse, loadCredentials, loadDecisions, loadEnrolments, loadTrajectories,
  removeCredential, requestTrajectory, saveTrajectoryNow, saveTrajectorySoon, submitTrajectoryStep, withdrawTrajectory,
} from './trajectoryStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

const step = { id: 's1', k: 'learn', lid: 'L1', win: 3, req: true, pre: null };
const row = (over: Record<string, unknown> = {}) => ({
  id: 'T1', name: 'ITAA', issuer: 'ITAA', credential: 'Adviser', enrol: 'auto', months: 36, valid_months: 12, renewal: '', cost: '', status: 'live',
  business_line: 'Tax & Legal', steps: [step], maps: [['Tax & Legal', 'Consultant', 'mandatory']], published_at: '2026-09-01T00:00:00Z', ...over,
});
const failWith = (message: string, code?: string) => db.answer(() => ({ error: { message, code } as { message: string } }));
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { db.reset(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); warn.mockRestore(); });

describe('loadTrajectories', () => {
  it('returns parsed trajectories in id order', async () => {
    db.answer(() => ({ data: [row({ id: 'T100' }), row({ id: 'T2' }), row()] }));
    expect((await loadTrajectories()).map((t) => t.id)).toEqual(['T1', 'T2', 'T100']);
    expect(db.calls[0].table).toBe('trajectories');
  });
  it('drops a row whose steps or maps are malformed, warning once with the id, and never throws', async () => {
    db.answer(() => ({ data: [
      row({ id: 'T1', steps: 'nope' }),
      row({ id: 'T2', steps: [{ id: 's1', k: 'quiz' }] }),
      row({ id: 'T3', steps: [{ k: 'learn' }] }),
      row({ id: 'T4', maps: [['Audit', 'Analyst']] }),
      row({ id: 'T5', maps: [['Audit', 'Analyst', 'required']] }),
      row({ id: 'T6', maps: null }),
      row({ id: 'T7' }),
    ] }));
    expect((await loadTrajectories()).map((t) => t.id)).toEqual(['T7']);
    expect(warn).toHaveBeenCalledTimes(6);
    expect(String(warn.mock.calls[0][0])).toContain('T1');
  });
  it('throws the database error', async () => {
    failWith('boom');
    await expect(loadTrajectories()).rejects.toThrow('boom');
  });
});

describe('loadEnrolments', () => {
  it('keys the person\'s enrolments by trajectory', async () => {
    db.answer(() => ({ data: [{ trajectory_id: 'T1', status: 'enrolled', start_month: 24321, steps: { s6: { state: 'submitted', note: 'n' } }, asked_at: '2026-11-01T09:00:00Z', created_at: '2026-10-31T09:00:00Z' }] }));
    expect(await loadEnrolments('u1')).toEqual({ T1: { status: 'enrolled', start_month: 24321, steps: { s6: { state: 'submitted', note: 'n' } }, asked_at: '2026-11-01T09:00:00Z', created_at: '2026-10-31T09:00:00Z' } });
    expect(has(db.calls[0], 'eq', 'user_id', 'u1')).toBe(true);
    expect(has(db.calls[0], 'select', 'trajectory_id, status, start_month, steps, asked_at, created_at')).toBe(true);
  });
  it('keeps the row with no steps when its steps are malformed, and warns', async () => {
    db.answer(() => ({ data: [{ trajectory_id: 'T1', status: 'enrolled', start_month: 1, steps: { s6: { state: 'finished' } } }, { trajectory_id: 'T2', status: 'requested', start_month: 2, steps: [] }] }));
    expect(await loadEnrolments('u1')).toEqual({ T1: { status: 'enrolled', start_month: 1, steps: {}, asked_at: null, created_at: null }, T2: { status: 'requested', start_month: 2, steps: {}, asked_at: null, created_at: null } });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('loadDecisions', () => {
  it('returns the person\'s decisions newest first, with the decider\'s name kept', async () => {
    db.answer(() => ({ data: [{ trajectory_id: 'T1', step_id: null, decision: 'talk', comment: 'Let us plan the study leave.', decided_by_name: 'Casey Boss', decided_at: '2026-11-10T09:00:00Z' },
      { trajectory_id: 'T1', step_id: 's6', decision: 'approve', comment: null, decided_by_name: '', decided_at: '2026-11-09T09:00:00Z' }] }));
    expect(await loadDecisions('u1')).toEqual([
      { trajectoryId: 'T1', stepId: null, decision: 'talk', comment: 'Let us plan the study leave.', byName: 'Casey Boss', at: '2026-11-10T09:00:00Z' },
      { trajectoryId: 'T1', stepId: 's6', decision: 'approve', comment: '', byName: '', at: '2026-11-09T09:00:00Z' },
    ]);
    expect(db.calls[0].table).toBe('trajectory_decisions');
    expect(has(db.calls[0], 'eq', 'user_id', 'u1')).toBe(true);
    expect(has(db.calls[0], 'order', 'decided_at', { ascending: false })).toBe(true);
  });
  it('throws the database error', async () => {
    failWith('boom');
    await expect(loadDecisions('u1')).rejects.toThrow('boom');
  });
});

describe('credentials', () => {
  it('loads the wallet, newest first, with empty text for a missing link or number', async () => {
    db.answer(() => ({ data: [{ id: 'c1', user_id: 'u1', name: 'N', issuer: 'I', earned_on: '2026-01-01', expires_on: null, link: null, ref: 'R1', trajectory_id: null, status: 'waiting' }] }));
    expect(await loadCredentials('u1')).toEqual([{ id: 'c1', user_id: 'u1', name: 'N', issuer: 'I', earned_on: '2026-01-01', expires_on: null, link: '', ref: 'R1', trajectory_id: null, status: 'waiting' }]);
    expect(has(db.calls[0], 'eq', 'user_id', 'u1')).toBe(true);
    expect(has(db.calls[0], 'order', 'earned_on', { ascending: false })).toBe(true);
  });
  it('adds an external credential with the granted columns only; blank link or number is null', async () => {
    expect(await addExternalCredential({ name: ' N ', issuer: 'I', earned_on: '2026-01-01', expires_on: null, link: '', ref: 'R1' })).toEqual({ error: null });
    expect(op(db.calls[0])).toBe('insert');
    expect(db.calls[0].steps[0][1]).toEqual([{ name: 'N', issuer: 'I', earned_on: '2026-01-01', expires_on: null, link: null, ref: 'R1' }]);
  });
  it('says so when the learner already holds it', async () => {
    failWith('duplicate', '23505');
    expect(await addExternalCredential({ name: 'N', issuer: 'I', earned_on: '2026-01-01', expires_on: null, link: 'https://x.y', ref: '' })).toEqual({ error: 'You already hold this credential.' });
  });
});

describe('removing a waiting credential', () => {
  it('deletes the row by id and reads back what was removed', async () => {
    db.answer(() => ({ data: [{ id: 'c1' }] }));
    expect(await removeCredential('c1')).toEqual({ error: null });
    expect(op(db.calls[0])).toBe('delete');
    expect(has(db.calls[0], 'eq', 'id', 'c1')).toBe(true);
    expect(has(db.calls[0], 'select', 'id')).toBe(true);
  });
  it('says so when nothing was removed (confirmed meanwhile, or not the owner\'s)', async () => {
    db.answer(() => ({ data: [] }));
    expect(await removeCredential('c1')).toEqual({ error: 'Not removed · only your own credential still waiting for your counsellor can be removed' });
  });
  it('returns the database error', async () => {
    failWith('boom');
    expect(await removeCredential('c1')).toEqual({ error: 'boom' });
  });
});

describe('saving trajectories', () => {
  const draft = { name: 'N', issuer: '', credential: 'C', enrol: 'open' as const, months: 6, valid_months: null, renewal: '', cost: '', status: 'draft' as const, business_line: null, steps: [], maps: [] };
  it('creates a trajectory and returns it with the server id', async () => {
    db.answer(() => ({ data: row({ id: 'T100', status: 'draft', published_at: null }) }));
    const t = await createTrajectory(draft);
    expect(t.id).toBe('T100');
    expect(op(db.calls[0])).toBe('insert');
    expect(db.calls[0].steps[0][1][0]).not.toHaveProperty('id');
  });
  it('saves an edit by id without the id or publication time in the payload', async () => {
    db.answer(() => ({ data: [{ id: 'T1' }] }));
    const onError = vi.fn();
    saveTrajectoryNow(parsed(), onError);
    await vi.waitFor(() => expect(db.calls).toHaveLength(1));
    expect(has(db.calls[0], 'eq', 'id', 'T1')).toBe(true);
    const payload = db.calls[0].steps[0][1][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('id'); expect(payload).not.toHaveProperty('published_at');
    expect(onError).not.toHaveBeenCalled();
  });
  it('reports a refused write (no row changed) through onError', async () => {
    db.answer(() => ({ data: [] }));
    const onError = vi.fn();
    saveTrajectoryNow(parsed(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/^Not saved/)));
  });
  it('debounces per id and saves the latest', async () => {
    vi.useFakeTimers();
    db.answer(() => ({ data: [{ id: 'T1' }] }));
    let latest = { ...parsed(), name: 'one' };
    saveTrajectorySoon('T1', () => latest, vi.fn(), 600);
    latest = { ...latest, name: 'two' };
    saveTrajectorySoon('T1', () => latest, vi.fn(), 600);
    await vi.advanceTimersByTimeAsync(700);
    expect(db.calls).toHaveLength(1);
    expect((db.calls[0].steps[0][1][0] as { name: string }).name).toBe('two');
  });
});
describe('deleting a trajectory', () => {
  it('deletes by id and reads back what was removed', async () => {
    db.answer(() => ({ data: [{ id: 'T100' }] }));
    expect(await deleteTrajectory('T100')).toEqual({ error: null });
    const [call] = db.on('trajectories');
    expect(op(call)).toBe('delete');
    expect(has(call, 'eq', 'id', 'T100')).toBe(true);
    expect(has(call, 'select', 'id')).toBe(true);
  });
  it('lists the files, deletes the row, and only then removes the files', async () => {
    db.answer((c) => ({ data: c.table === 'trajectory_plan_sources' ? [{ path: 'u/s1/a.pdf' }] : [{ id: 'T100' }] }));
    expect(await deleteTrajectory('T100')).toEqual({ error: null });
    expect(db.calls.map((c) => c.table)).toEqual(['trajectory_plan_sources', 'trajectories', 'storage:media']);
    expect(op(db.calls[1])).toBe('delete');
    expect(op(db.calls[2])).toBe('remove');
  });
  it('keeps the files when the delete is refused', async () => {
    db.answer((c) => ({ data: c.table === 'trajectory_plan_sources' ? [{ path: 'u/s1/a.pdf' }] : [] }));
    expect((await deleteTrajectory('T100')).error).toMatch(/^Not deleted/);
    expect(db.calls.map((c) => c.table)).toEqual(['trajectory_plan_sources', 'trajectories']);
  });
  it('is deleted even when a file cannot be removed afterwards (a leftover file, warned)', async () => {
    db.answer((c) => (c.table === 'storage:media' ? { error: { message: 'boom' } } : { data: c.table === 'trajectory_plan_sources' ? [{ path: 'u/s1/a.pdf' }] : [{ id: 'T100' }] }));
    expect(await deleteTrajectory('T100')).toEqual({ error: null });
    expect(warn).toHaveBeenCalled();
  });
  it('says so when the database refused (used meanwhile, or not the admin\'s)', async () => {
    db.answer(() => ({ data: [] }));
    expect(await deleteTrajectory('T1')).toEqual({ error: 'Not deleted · it is in use or you cannot delete it · retire it instead' });
  });
  it('returns the database error', async () => {
    failWith('boom');
    expect(await deleteTrajectory('T1')).toEqual({ error: 'boom' });
  });
  it('cancels a pending save of that id, so the row is not written again', async () => {
    vi.useFakeTimers();
    db.answer(() => ({ data: [{ id: 'T1' }] }));
    saveTrajectorySoon('T1', () => parsed(), vi.fn(), 600);
    await deleteTrajectory('T1');
    await vi.advanceTimersByTimeAsync(700);
    expect(db.on('trajectories').map(op)).toEqual(['delete']);
  });
  it('schedules the held-back save again when the delete is refused, so the edit is not lost', async () => {
    vi.useFakeTimers();
    db.answer(() => ({ data: [] }));
    const latest = { ...parsed(), name: 'edited' };
    saveTrajectorySoon('T1', () => latest, vi.fn(), 600);
    expect((await deleteTrajectory('T1')).error).toMatch(/^Not deleted/);
    db.answer(() => ({ data: [{ id: 'T1' }] }));
    await vi.advanceTimersByTimeAsync(700);
    expect(db.on('trajectories').map(op)).toEqual(['delete', 'update']);
    expect((db.on('trajectories')[1].steps[0][1][0] as { name: string }).name).toBe('edited');
  });
  it('lists the ids in use through the database function', async () => {
    db.answer(() => ({ data: ['T1', 'T3'] }));
    expect(await loadTrajectoriesInUse()).toEqual(['T1', 'T3']);
    expect(db.calls[0].table).toBe('rpc:trajectories_in_use');
  });
});
function parsed() { return { ...row(), steps: [step], maps: [['Tax & Legal', 'Consultant', 'mandatory']] } as never as Awaited<ReturnType<typeof createTrajectory>>; }

describe('RPC wrappers', () => {
  it('requests a trajectory and returns the status', async () => {
    db.answer(() => ({ data: 'requested' }));
    expect(await requestTrajectory('T2')).toEqual({ status: 'requested', error: null });
    expect(db.calls[0]).toEqual({ table: 'rpc:request_trajectory', steps: [['args', [{ p_trajectory: 'T2' }]]] });
  });
  it('withdraws', async () => {
    expect(await withdrawTrajectory('T2')).toEqual({ error: null });
    expect(db.calls[0].table).toBe('rpc:withdraw_trajectory');
  });
  it('submits a step with its proof, nulls for what is missing', async () => {
    db.answer(() => ({ data: 'submitted' }));
    expect(await submitTrajectoryStep('T1', 's6', 'submitted', { note: 'done it' })).toEqual({ state: 'submitted', error: null });
    expect(db.calls[0].steps[0][1][0]).toEqual({ p_trajectory: 'T1', p_step: 's6', p_state: 'submitted', p_link: null, p_ref: null, p_note: 'done it' });
  });
  it('decides on a start request (no step) and on a step', async () => {
    db.answer(() => ({ data: 'enrolled' }));
    expect(await decideTrajectory('u1', 'T2', null, 'approve')).toEqual({ result: 'enrolled', error: null });
    expect(db.calls[0].steps[0][1][0]).toEqual({ p_user: 'u1', p_trajectory: 'T2', p_step: null, p_decision: 'approve', p_comment: null });
    await decideTrajectory('u1', 'T2', 's7', 'talk', 'Add the client file, please.');
    expect(db.calls[1].steps[0][1][0]).toMatchObject({ p_step: 's7', p_decision: 'talk', p_comment: 'Add the client file, please.' });
  });
  it('confirms a credential', async () => {
    expect(await confirmCredential('c1')).toEqual({ error: null });
    expect(db.calls[0]).toEqual({ table: 'rpc:confirm_credential', steps: [['args', [{ p_id: 'c1' }]]] });
  });
  it('maps errors to user-facing messages and never throws', async () => {
    failWith('This person already holds this credential', '23505');
    expect(await decideTrajectory('u1', 'T1', 's9', 'approve', null, 'Kim')).toEqual({ result: null, error: 'Kim already holds a valid credential from this trajectory.' });
    expect(await decideTrajectory('u1', 'T1', 's9', 'approve')).toEqual({ result: null, error: 'This person already holds a valid credential from this trajectory.' });
    failWith('new row violates row-level security policy', '42501');
    expect(await confirmCredential('c1')).toEqual({ error: 'Not allowed · ask an admin' });
    failWith('A step is already signed off; ask your counsellor', '42501');
    expect(await withdrawTrajectory('T1')).toEqual({ error: 'A step is already signed off; ask your counsellor' });
    failWith('This trajectory cannot be started', 'P0002');
    expect(await requestTrajectory('T9')).toEqual({ status: null, error: 'This trajectory cannot be started' });
  });
});
