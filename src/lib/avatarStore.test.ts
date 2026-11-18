// Avatar practice runs against the in-memory Supabase fake (studios plan, Task 6.2): start, say, end, read. A run on a contribution is a test.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, has, op } from '../test/fakeSupabase';
import { endAvatarRun, myAvatarRuns, sayToCharacter, startAvatarRun } from './avatarStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

beforeEach(() => db.reset());

describe('avatar runs', () => {
  it('starts a run on a learning with test false, and returns its id', async () => {
    db.answer(() => ({ data: { id: 'run-1' } }));
    expect(await startAvatarRun({ learningId: 'L70' })).toBe('run-1');
    expect(db.calls[0].table).toBe('avatar_runs');
    expect(db.calls[0].steps[0]).toEqual(['insert', [{ learning_id: 'L70', test: false }]]);
  });
  it('starts a practice on a contribution with test true: it never counts', async () => {
    db.answer(() => ({ data: { id: 'run-2' } }));
    await startAvatarRun({ contributionId: 'c-1' });
    expect(db.calls[0].steps[0]).toEqual(['insert', [{ contribution_id: 'c-1', test: true }]]);
  });
  it('passes the database refusal on', async () => {
    db.answer(() => ({ error: { message: 'new row violates row-level security policy' } }));
    await expect(startAvatarRun({ learningId: 'L38' })).rejects.toThrow('row-level security');
  });
  it('says one line to the character through the ai function and sends nothing else: no system text, no conversation', async () => {
    db.client.functions.invoke.mockImplementation(async () => ({ data: { say: 'Go on.', turn: 2, held: false }, error: null }));
    expect(await sayToCharacter('run-1', 'Good morning')).toEqual({ say: 'Go on.', turn: 2, held: false });
    expect(db.client.functions.invoke).toHaveBeenCalledWith('ai', { body: { use: 'avatar_conversation', run_id: 'run-1', say: 'Good morning' } });
  });
  it('refuses an answer that is not a reply, never a scripted line', async () => {
    db.client.functions.invoke.mockImplementation(async () => ({ data: { ok: true }, error: null }));
    await expect(sayToCharacter('run-1', 'Hi')).rejects.toThrow('The character did not answer · try again');
    db.client.functions.invoke.mockImplementation(async () => ({ data: null, error: { message: 'The function said no' } }));
    await expect(sayToCharacter('run-1', 'Hi')).rejects.toThrow('The function said no');
  });
  it('ends a run through finish_avatar_run', async () => {
    await endAvatarRun('run-1');
    expect(db.calls[0]).toEqual({ table: 'rpc:finish_avatar_run', steps: [['args', [{ p_run: 'run-1' }]]] });
    db.answer(() => ({ error: { message: 'This run has ended' } }));
    await expect(endAvatarRun('run-1')).rejects.toThrow('This run has ended');
  });
  it('reads my runs of a learning, newest first', async () => {
    db.answer(() => ({ data: [{ id: 'r2', learning_id: 'L70', test: false, started_at: 'b', finished_at: null, turns: [] }] }));
    expect((await myAvatarRuns('L70')).map((r) => r.id)).toEqual(['r2']);
    const c = db.calls[0];
    expect(op(c)).toBe('select');
    expect(has(c, 'eq', 'learning_id', 'L70') && has(c, 'order', 'started_at', { ascending: false })).toBe(true);
  });
});
