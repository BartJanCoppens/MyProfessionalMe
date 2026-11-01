// The client module: password rule, temporary passwords and the manage-users call (FT-AUTH-*). The Supabase client is a fake.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../test/fakeSupabase';
import { manageUsers, PASSWORD_RULE, temporaryPassword } from './supabase';

beforeEach(() => db.reset());

describe('the password rule', () => {
  it('needs 12 characters with lower case, upper case and a digit', () => {
    expect(['Abcdefghijk1', 'ZZZZzzzz1234'].map((p) => PASSWORD_RULE.test(p))).toEqual([true, true]);
    expect(['Abcdefghij1', 'abcdefghijk1', 'ABCDEFGHIJK1', 'Abcdefghijkl'].map((p) => PASSWORD_RULE.test(p))).toEqual([false, false, false, false]);
  });
  it('is met by every temporary password, which differ each time and avoid look-alike characters', () => {
    const many = Array.from({ length: 50 }, () => temporaryPassword());
    expect(many.every((p) => PASSWORD_RULE.test(p) && p.length === 14)).toBe(true);
    expect(new Set(many).size).toBe(50);
    expect(many.join('')).not.toMatch(/[01ilIoO]/);
  });
});

describe('manageUsers', () => {
  it('invokes the manage-users function and returns its data', async () => {
    db.client.functions.invoke.mockResolvedValueOnce({ data: { ok: true, user_id: 'n1' }, error: null });
    await expect(manageUsers({ action: 'create', email: 'a@b.c', business_line: 'Audit', password: 'x' })).resolves.toEqual({ ok: true, user_id: 'n1' });
    expect(db.client.functions.invoke).toHaveBeenCalledWith('manage-users', { body: { action: 'create', email: 'a@b.c', business_line: 'Audit', password: 'x' } });
  });
  it('reports the function\'s own error message', async () => {
    db.client.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'You cannot manage a System Admin' }) } } });
    await expect(manageUsers({ action: 'remove', user_id: 'x' })).rejects.toThrow('You cannot manage a System Admin');
  });
  it('keeps the generic message when the response has no readable body', async () => {
    db.client.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Failed to send a request', context: { json: async () => { throw new Error('not json'); } } } });
    await expect(manageUsers({ action: 'change_password', password: 'x' })).rejects.toThrow('Failed to send a request');
    db.client.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(manageUsers({ action: 'reset_password', user_id: 'x', password: 'y' })).rejects.toThrow('offline');
  });
});
