// The final report that must leave while the page closes: its request is issued without waiting for the auth client when a token was cached at connect.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../test/fakeSupabase';
import { keepaliveFunction, warmKeepalive } from './aiStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

beforeEach(() => { db.reset(); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}'))); });

describe('keepaliveFunction', () => {
  it('sends the request in the same tick once a token is cached, with keepalive and the bearer token', async () => {
    db.client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-1' } } });
    await warmKeepalive();
    db.client.auth.getSession.mockClear();
    void keepaliveFunction('avatar', { action: 'report' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect([init.keepalive, (init.headers as Record<string, string>).Authorization]).toEqual([true, 'Bearer tok-1']);
    expect(db.client.auth.getSession).not.toHaveBeenCalled();
  });
});
