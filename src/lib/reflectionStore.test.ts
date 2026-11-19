// @vitest-environment jsdom
// Reflections against the in-memory Supabase fake (Task 1.5): loaded per course, saved in bursts through saveSoon, a blank text deletes the row.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../test/fakeSupabase';
import { REFLECTION_MAX, cancelReflections, loadReflections, saveReflectionSoon } from './reflectionStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

beforeEach(() => { db.reset(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('reflections', () => {
  it('has a cap of 2,000 characters', () => { expect(REFLECTION_MAX).toBe(2000); });
  it('loads one course\'s reflections keyed by block id', async () => {
    db.answer(() => ({ data: [{ block_id: 'b0006', text: 'My client.' }, { block_id: 'b0009', text: 'Another.' }] }));
    expect(await loadReflections('L997')).toEqual({ b0006: 'My client.', b0009: 'Another.' });
    expect(db.calls[0]).toEqual({ table: 'course_reflections', steps: [['select', ['block_id, text']], ['eq', ['learning_id', 'L997']]] });
  });
  it('passes a refusal on', async () => {
    db.answer(() => ({ error: { message: 'permission denied' } }));
    await expect(loadReflections('L997')).rejects.toThrow('permission denied');
  });
  it('writes once for two saves within 800 ms, the last text, sending only the three columns', async () => {
    const onError = vi.fn(), onSaved = vi.fn();
    saveReflectionSoon('L997', 'b0006', 'First', onError);
    await vi.advanceTimersByTimeAsync(500);
    saveReflectionSoon('L997', 'b0006', 'Second thought', onError, 800, onSaved);
    await vi.advanceTimersByTimeAsync(799);
    expect(db.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]).toEqual({ table: 'course_reflections', steps: [['upsert', [{ learning_id: 'L997', block_id: 'b0006', text: 'Second thought' }, { onConflict: 'user_id,learning_id,block_id' }]]] });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
  it('deletes the row when the text is blank', async () => {
    saveReflectionSoon('L997', 'b0006', '   ', vi.fn());
    await vi.advanceTimersByTimeAsync(801);
    expect(db.calls[0]).toEqual({ table: 'course_reflections', steps: [['delete', []], ['eq', ['learning_id', 'L997']], ['eq', ['block_id', 'b0006']]] });
  });
  it('reports a failed write and does not say it saved', async () => {
    db.answer(() => ({ error: { message: 'row-level security' } }));
    const onError = vi.fn(), onSaved = vi.fn();
    saveReflectionSoon('L997', 'b0007', 'Text', onError, 800, onSaved);
    await vi.advanceTimersByTimeAsync(801);
    expect(onError).toHaveBeenCalledWith('row-level security');
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('writes nothing when another person is signed in by the time it saves', async () => {
    db.client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u2' } } } });
    const onSaved = vi.fn();
    saveReflectionSoon('L997', 'b0006', 'A\'s text', vi.fn(), 800, onSaved, 'u1');
    await vi.advanceTimersByTimeAsync(801);
    expect(db.calls).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('writes when the same person is still signed in', async () => {
    db.client.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    saveReflectionSoon('L997', 'b0006', 'Mine', vi.fn(), 800, undefined, 'u1');
    await vi.advanceTimersByTimeAsync(801);
    expect(db.calls).toHaveLength(1);
  });
  it('cancelReflections drops every pending save (the shell unmounts on sign-out)', async () => {
    saveReflectionSoon('L997', 'b0006', 'One', vi.fn());
    saveReflectionSoon('L998', 'b0007', 'Two', vi.fn());
    cancelReflections();
    await vi.advanceTimersByTimeAsync(2000);
    expect(db.calls).toHaveLength(0);
  });
});
