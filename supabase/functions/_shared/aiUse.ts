// What the AI edge functions (`ai`, `voice`) read from the database about a call, with the service role: the caller's
// roles, whether a use is live (the same public.ai_live_uses() the app reads), the use with its connection, the count
// against the use's daily limits (public.ai_count_call), and the connection's key from Vault. The key stays in the
// function's process.
import type { SupabaseContext } from '@supabase/server';
import { fail, isLimitError } from './aiGuard.ts';
import type { Provider } from './aiGuard.ts';

type Admin = SupabaseContext['supabaseAdmin'];
export type Conn = { id: string; provider: Provider; base_url: string | null; default_model: string | null };
export type UseRow = { kind: string; admins_only: boolean; model: string | null; preamble: string; daily_limit: number; connection: Conn | null };

export { fail };

// The caller's roles, or null when they could not be read.
export async function callerRoles(admin: Admin, userId: string): Promise<string[] | null> {
  const { data, error } = await admin.from('user_roles').select('role').eq('user_id', userId);
  return error ? null : (data as { role: string }[]).map((r) => r.role);
}

// Whether the use is live now, or null when the settings could not be read.
export async function isLive(admin: Admin, use: string): Promise<boolean | null> {
  const { data, error } = await admin.rpc('ai_live_uses');
  return error ? null : ((data as string[] | null) || []).includes(use);
}

export async function readUse(admin: Admin, use: string): Promise<UseRow | null> {
  const { data } = await admin.from('ai_uses').select('kind, admins_only, model, preamble, daily_limit, connection:ai_connections(id, provider, base_url, default_model)')
    .eq('key', use).maybeSingle<UseRow>();
  return data || null;
}

// Counts the call before it is made, atomically; beyond a daily limit nothing is counted.
export async function countCall(admin: Admin, userId: string, use: string, chars: number): Promise<'ok' | 'limit' | 'error'> {
  const { error } = await admin.rpc('ai_count_call', { p_user: userId, p_use: use, p_chars: chars });
  return !error ? 'ok' : isLimitError(error.message) ? 'limit' : 'error';
}

export async function connectionKey(admin: Admin, connectionId: string): Promise<string | null> {
  const { data, error } = await admin.rpc('ai_connection_key', { p_connection: connectionId });
  return error ? null : (data as string | null);
}
