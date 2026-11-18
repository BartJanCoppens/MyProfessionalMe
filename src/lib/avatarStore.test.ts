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
  const reply = { text: 'Go on.', meta: { turn: 2, held: false } };
  const live = { enabled: true, live: ['avatar_conversation'] };
  it('says one line to the character through the one AI path: the run and the line, no system text, no conversation', async () => {
    const ask = vi.fn(async () => reply);
    expect(await sayToCharacter('run-1', 'Good morning', { ...live, ask })).toEqual({ say: 'Go on.', turn: 2, held: false });
    expect(ask).toHaveBeenCalledWith('avatar_conversation', { messages: [], run: { run_id: 'run-1', say: 'Good morning' } });
  });
  it('is not asked with ?live=off or while the use is not live, and says so', async () => {
    const ask = vi.fn(async () => reply);
    await expect(sayToCharacter('run-1', 'Hi', { enabled: false, live: ['avatar_conversation'], ask })).rejects.toThrow('The character is not available right now');
    await expect(sayToCharacter('run-1', 'Hi', { enabled: true, live: [], ask })).rejects.toThrow('The character is not available right now');
    expect(ask).not.toHaveBeenCalled();
  });
  it('throws the function\'s own words, and never a scripted line, when the call fails or does not answer', async () => {
    await expect(sayToCharacter('run-1', 'Hi', { ...live, ask: async () => { throw new Error("This run's time is up · end it to see your score"); } })).rejects.toThrow('time is up');
    await expect(sayToCharacter('run-1', 'Hi', { ...live, ask: async () => ({ text: 'x' }) })).rejects.toThrow('The character did not answer · try again');
  });
  it('sends one line at a time per run: a second line while the first is on its way is refused', async () => {
    let release: (v: typeof reply) => void = () => {};
    const ask = vi.fn(() => new Promise<typeof reply>((res) => { release = res; }));
    const first = sayToCharacter('run-1', 'One', { ...live, ask });
    await expect(sayToCharacter('run-1', 'Two', { ...live, ask })).rejects.toThrow('Wait for the character to answer');
    release(reply);
    await first;
    expect(await sayToCharacter('run-1', 'Three', { ...live, ask: async () => reply })).toMatchObject({ turn: 2 });
  });
  it('ends a run through finish_avatar_run', async () => {
    await endAvatarRun('run-1');
    expect(db.calls[0]).toEqual({ table: 'rpc:finish_avatar_run', steps: [['args', [{ p_run: 'run-1' }]]] });
    db.answer(() => ({ error: { message: 'This run has ended' } }));
    await expect(endAvatarRun('run-1')).rejects.toThrow('This run has ended');
  });
  it('reads my runs of a learning, newest first, whoever else\'s shared runs I may see', async () => {
    db.client.auth.getSession.mockImplementation(async () => ({ data: { session: { user: { id: 'me' } } } }));
    db.answer(() => ({ data: [{ id: 'r2', learning_id: 'L70', test: false, started_at: 'b', finished_at: null, turns: [] }] }));
    expect((await myAvatarRuns('L70')).map((r) => r.id)).toEqual(['r2']);
    const c = db.calls[0];
    expect(op(c)).toBe('select');
    expect(has(c, 'eq', 'learning_id', 'L70') && has(c, 'eq', 'user_id', 'me') && has(c, 'order', 'started_at', { ascending: false })).toBe(true);
  });
});
