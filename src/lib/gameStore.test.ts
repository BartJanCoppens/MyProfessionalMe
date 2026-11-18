// Game runs against the in-memory Supabase fake (studios plan, Task 4.3): start a run, finish it, the leaderboard and the best.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, has, op } from '../test/fakeSupabase';
import { finishRun, leaderboard, myBest, startRun } from './gameStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

beforeEach(() => db.reset());

describe('game runs', () => {
  it('starts a run on a learning with test false, and returns its id', async () => {
    db.answer(() => ({ data: { id: 'run-1' } }));
    expect(await startRun({ learningId: 'L60' })).toBe('run-1');
    const call = db.calls[0];
    expect(call.table).toBe('game_runs');
    expect(call.steps[0]).toEqual(['insert', [{ learning_id: 'L60', test: false }]]);
  });
  it('starts a play-test on a contribution with test true', async () => {
    db.answer(() => ({ data: { id: 'run-2' } }));
    expect(await startRun({ contributionId: 'c-1' })).toBe('run-2');
    expect(db.calls[0].steps[0]).toEqual(['insert', [{ contribution_id: 'c-1', test: true }]]);
  });
  it('passes the database refusal on', async () => {
    db.answer(() => ({ error: { message: 'new row violates row-level security policy' } }));
    await expect(startRun({ learningId: 'L60' })).rejects.toThrow('row-level security');
  });
  it('finishes through finish_game_run', async () => {
    await finishRun('run-1', 90);
    expect(db.calls[0]).toEqual({ table: 'rpc:finish_game_run', steps: [['args', [{ p_run: 'run-1', p_score: 90 }]]] });
    db.answer(() => ({ error: { message: 'This run has finished' } }));
    await expect(finishRun('run-1', 91)).rejects.toThrow('This run has finished');
  });
  it('reads the leaderboard through game_leaderboard', async () => {
    db.answer(() => ({ data: [{ rank: 1, name: 'Jan P.', score: 90, seconds: 90 }] }));
    expect(await leaderboard('L60')).toEqual([{ rank: 1, name: 'Jan P.', score: 90, seconds: 90 }]);
    expect(db.calls[0]).toEqual({ table: 'rpc:game_leaderboard', steps: [['args', [{ p_learning: 'L60' }]]] });
  });
  it('reads the best of my finished, non-test runs: highest score, then fewest seconds', async () => {
    db.answer(() => ({ data: { score: 90, seconds: 75 } }));
    expect(await myBest('L60')).toEqual({ score: 90, seconds: 75 });
    const c = db.calls[0];
    expect(op(c)).toBe('select');
    expect(has(c, 'eq', 'learning_id', 'L60') && has(c, 'eq', 'test', false) && has(c, 'not', 'finished_at', 'is', null)).toBe(true);
    expect(has(c, 'order', 'score', { ascending: false }) && has(c, 'order', 'seconds', { ascending: true })).toBe(true);
    db.answer(() => ({ data: null }));
    expect(await myBest('L60')).toBeNull();
  });
});
