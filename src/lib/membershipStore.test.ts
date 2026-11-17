// @vitest-environment jsdom
// Industry and technology membership against the in-memory Supabase fake: loading, setting and removing.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, has, op } from '../test/fakeSupabase';
import { loadAudiences, loadAudiencesOf, setAudience } from './membershipStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

beforeEach(() => db.reset());

describe('loading', () => {
  it('loads one person\'s audiences in catalogue order, dropping anything that is not ind: or tec:', async () => {
    db.answer(() => ({ data: [{ audience: 'tec:data' }, { audience: 'ind:energy' }, { audience: 'amb:sust' }, { audience: 7 }] }));
    expect(await loadAudiences('u1')).toEqual(['ind:energy', 'tec:data']);
    expect(db.calls[0].table).toBe('audience_members');
    expect(has(db.calls[0], 'eq', 'user_id', 'u1')).toBe(true);
  });
  it('throws when the load fails', async () => {
    db.answer(() => ({ error: { message: 'denied' } }));
    await expect(loadAudiences('u1')).rejects.toThrow('denied');
  });
  it('loads several people at once, keyed by person', async () => {
    db.answer(() => ({ data: [{ user_id: 'a', audience: 'tec:sap' }, { user_id: 'b', audience: 'ind:health' }, { user_id: 'a', audience: 'ind:public' }] }));
    expect(await loadAudiencesOf(['a', 'b', 'c'])).toEqual({ a: ['ind:public', 'tec:sap'], b: ['ind:health'], c: [] });
    expect(has(db.calls[0], 'in', 'user_id', ['a', 'b', 'c'])).toBe(true);
  });
  it('asks nothing for nobody', async () => {
    expect(await loadAudiencesOf([])).toEqual({});
    expect(db.calls).toHaveLength(0);
  });
});

describe('setAudience', () => {
  it('inserts a membership, and an existing one counts as set', async () => {
    expect(await setAudience('u1', 'tec:data', true)).toEqual({ error: null });
    expect(op(db.calls[0])).toBe('insert');
    expect(has(db.calls[0], 'insert', { user_id: 'u1', audience: 'tec:data' })).toBe(true);
    db.answer(() => ({ error: { message: 'duplicate key', code: '23505' } as { message: string } }));
    expect(await setAudience('u1', 'tec:data', true)).toEqual({ error: null });
  });
  it('turns a refusal into the app\'s wording', async () => {
    db.answer(() => ({ error: { message: 'new row violates row-level security policy', code: '42501' } as { message: string } }));
    expect(await setAudience('u1', 'tec:data', true)).toEqual({ error: 'Not allowed · ask an admin' });
  });
  it('removes a membership and says so when nothing was removed', async () => {
    db.answer(() => ({ data: [{ user_id: 'u1' }] }));
    expect(await setAudience('u1', 'ind:energy', false)).toEqual({ error: null });
    expect(op(db.calls[0])).toBe('delete');
    expect(has(db.calls[0], 'eq', 'audience', 'ind:energy')).toBe(true);
    db.answer(() => ({ data: [] }));
    expect((await setAudience('u1', 'ind:energy', false)).error).toMatch(/^Not removed/);
  });
  it('refuses an audience that is not an industry or technology, without asking the database', async () => {
    expect((await setAudience('u1', 'amb:sust', true)).error).toMatch(/industry or technology/);
    expect(db.calls).toHaveLength(0);
  });
});
