// AI connections in Supabase. Connection metadata and uses are System Admin only (RLS); a key goes in through
// ai_set_key() into Vault and never comes back, only its last four characters. Answers come from the `ai` edge function.
import { supabase } from './supabase';
import type { AiAdmin, AiConnection, AiForm, AiUsage, AiUse } from '../logic/ai';

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
// The function's own error message (e.g. "This AI use is not live …") rather than "non-2xx status code".
async function invokeAi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai', { body });
  if (error) {
    let message = (error as { message: string }).message;
    try { const ctx = (error as { context?: Response }).context; if (ctx) message = (await ctx.json()).error || message; } catch { /* keep message */ }
    throw new Error(message);
  }
  return data as T;
}

export async function loadAiAdmin(): Promise<AiAdmin> {
  const [c, u, n] = await Promise.all([
    supabase.from('ai_connections').select('id, name, provider, base_url, default_model, region, key_hint, updated_at').order('name'),
    supabase.from('ai_uses').select('key, label, description, place, kind, waiting_for, admins_only, connection_id, model, enabled, preamble, daily_limit').order('sort'),
    supabase.rpc('ai_usage_summary'),
  ]);
  fail(c.error || u.error || n.error);
  const usage = (n.data || {}) as Partial<AiUsage>;
  return { connections: (c.data || []) as AiConnection[], uses: (u.data || []) as AiUse[], usage: { uses: usage.uses || {}, top: usage.top || [] } };
}

// The use keys the app may send to the `ai` function now (no secrets). Everyone signed in may read them.
export async function loadLiveUses(): Promise<string[]> {
  const { data, error } = await supabase.rpc('ai_live_uses');
  fail(error);
  return (data as string[] | null) || [];
}

// Adds or edits a connection (not its key). Returns the connection id.
export async function saveConnection(f: AiForm): Promise<string> {
  const row = { name: f.name.trim(), provider: f.provider, base_url: f.base_url.trim() || null, default_model: f.default_model.trim() || null, region: f.region.trim() || null };
  const q = f.id ? supabase.from('ai_connections').update(row).eq('id', f.id).select('id') : supabase.from('ai_connections').insert(row).select('id');
  const { data, error } = await q;
  fail(error);
  const id = (data as { id: string }[] | null)?.[0]?.id;
  if (!id) throw new Error('Only a System Admin can change AI connections');
  return id;
}

// Stores or replaces the key in Vault. Nothing comes back but the hint, on the next load.
export async function setKey(id: string, key: string) {
  const { error } = await supabase.rpc('ai_set_key', { p_connection: id, p_key: key.trim() });
  fail(error);
}

export async function deleteConnection(id: string) {
  const { data, error } = await supabase.from('ai_connections').delete().eq('id', id).select('id');
  fail(error);
  if (!(data as unknown[] | null)?.length) throw new Error('Only a System Admin can remove AI connections');
}

export async function updateUse(key: string, patch: Partial<Pick<AiUse, 'connection_id' | 'model' | 'enabled' | 'preamble' | 'daily_limit'>>) {
  const { data, error } = await supabase.from('ai_uses').update(patch).eq('key', key).select('key');
  fail(error);
  if (!(data as unknown[] | null)?.length) throw new Error('Only a System Admin can change AI uses');
}

export const testConnection = (id: string) => invokeAi<{ ok: boolean; model?: string; error?: string }>({ action: 'test', connection_id: id });

export type AiRequest = { system?: string; messages: { role: 'user' | 'assistant'; content: string }[]; max_tokens?: number };
export async function askAi(use: string, req: AiRequest): Promise<string> {
  const data = await invokeAi<{ text?: string }>({ use, ...req });
  if (!data || typeof data.text !== 'string') throw new Error('The AI function returned no text');
  return data.text;
}
