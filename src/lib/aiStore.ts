// AI connections in Supabase. Connection metadata and uses are System Admin only (RLS); a key goes in through
// ai_set_key() into Vault and never comes back, only its last four characters. Answers come from the `ai` edge function.
// Stock voices: System and General Admins add and (de)activate them; nobody deletes one (RLS).
import { supabase } from './supabase';
import type { AiAdmin, AiConnection, AiForm, AiUsage, AiUse, StockVoice, StockVoiceForm } from '../logic/ai';
import type { StockLook, StockLookForm } from '../logic/stockLooks';

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };
// Calls an AI edge function (`ai`, `voice`, `avatar`). Throws the function's own error message (e.g. "This AI use is not live …")
// rather than "non-2xx status code".
export async function invokeFunction<T>(name: 'ai' | 'voice' | 'avatar', body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = (error as { message: string }).message;
    try { const ctx = (error as { context?: Response }).context; if (ctx) message = (await ctx.json()).error || message; } catch { /* keep message */ }
    throw new Error(message);
  }
  return data as T;
}

// A last report that must still leave when the page is closing (pagehide, unmount): a raw request with keepalive, which supabase.functions.invoke cannot do.
// It is issued in the same tick from the access token cached by warmKeepalive (reading the session can wait on a lock while the page freezes); without a cached
// token it reads the session first. Never throws; an answer is not read.
let cachedToken: string | null = null;
export async function warmKeepalive(): Promise<void> {
  try { cachedToken = (await supabase.auth.getSession()).data.session?.access_token ?? null; } catch { cachedToken = null; }
}
export async function keepaliveFunction(name: 'avatar', body: Record<string, unknown>): Promise<void> {
  const token = cachedToken ?? (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return;
  await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST', keepalive: true,
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).catch((): void => undefined);
}

export async function loadAiAdmin(): Promise<AiAdmin> {
  const [c, u, n] = await Promise.all([
    supabase.from('ai_connections').select('id, name, provider, base_url, default_model, region, key_hint, updated_at').order('name'),
    supabase.from('ai_uses').select('key, label, description, place, kind, waiting_for, admins_only, connection_id, model, enabled, preamble, daily_limit, daily_chars, daily_seconds').order('sort'),
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

export async function updateUse(key: string, patch: Partial<Pick<AiUse, 'connection_id' | 'model' | 'enabled' | 'preamble' | 'daily_limit' | 'daily_chars' | 'daily_seconds'>>) {
  const { data, error } = await supabase.from('ai_uses').update(patch).eq('key', key).select('key');
  fail(error);
  if (!(data as unknown[] | null)?.length) throw new Error('Only a System Admin can change AI uses');
}

// Stock voices and stock looks share one shape of access: admins read every row, anyone else only the active ones (RLS); System
// and General Admins add and switch off; an insert or update that changes no row was refused by RLS.
type StockTable = 'stock_voices' | 'stock_looks';
async function loadStock<T>(table: StockTable, columns: string, order: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(columns).order(order);
  fail(error);
  return (data || []) as T[];
}
async function addStock(table: StockTable, what: string, row: object, duplicate?: [RegExp, string]) {
  const { data, error } = await supabase.from(table).insert(row).select('id');
  if (error && duplicate && duplicate[0].test(error.message)) throw new Error(duplicate[1]);
  fail(error);
  if (!(data as unknown[] | null)?.length) throw new Error('Only System and General Admins can add ' + what);
}
async function updateStock(table: StockTable, what: string, id: string, patch: object) {
  const { data, error } = await supabase.from(table).update(patch).eq('id', id).select('id');
  fail(error);
  if (!(data as unknown[] | null)?.length) throw new Error('Only System and General Admins can change ' + what);
}
const setStockActive = (table: StockTable, what: string, id: string, active: boolean) => updateStock(table, what, id, { active });

export const loadStockVoices = () => loadStock<StockVoice>('stock_voices', 'id, name, voice_id, language, accent, active', 'name');
export const addStockVoice = (f: StockVoiceForm) => addStock('stock_voices', 'stock voices', { ...f, accent: f.accent || null }, [/duplicate key|stock_voices_voice_id_key/i, 'That ElevenLabs voice id is on the list already']);
export const setStockVoiceActive = (id: string, active: boolean) => setStockActive('stock_voices', 'stock voices', id, active);

export const loadStockLooks = () => loadStock<StockLook>('stock_looks', 'id, name, portrait, color, licence, active, heygen_avatar_id, heygen_voice_id', 'created_at');
export const addStockLook = (f: StockLookForm) => addStock('stock_looks', 'stock looks', { ...f, color: f.color.toLowerCase(), heygen_avatar_id: f.heygen_avatar_id || null, heygen_voice_id: f.heygen_voice_id || null }, [/duplicate key|stock_looks_name_key/i, 'A look with that name is on the list already']);
// A look's HeyGen ids (empty clears them: the look is portrait only again).
export const updateStockLook = (id: string, f: Pick<StockLookForm, 'heygen_avatar_id' | 'heygen_voice_id'>) =>
  updateStock('stock_looks', 'stock looks', id, { heygen_avatar_id: f.heygen_avatar_id || null, heygen_voice_id: f.heygen_voice_id || null });
export const setStockLookActive = (id: string, active: boolean) => setStockActive('stock_looks', 'stock looks', id, active);

export const testConnection = (id: string) => invokeFunction<{ ok: boolean; model?: string; error?: string }>('ai', { action: 'test', connection_id: id });

// run: a role's ask (use game_role or avatar_conversation): the run it is on, plus the game's state as text or the learner's one line (say). The function reads
// the role, what it knows and (for the avatar) the earlier lines for that run; there is no system text. meta: what a role answers besides its text (the avatar's turn and held).
export type AiRequest = { system?: string; messages: { role: 'user' | 'assistant'; content: string }[]; max_tokens?: number; run?: { run_id: string; state?: string; say?: string }; trajectoryId?: string };
export type AiAnswer = { text: string; cut: boolean; meta?: Record<string, unknown> };
export async function askAi(use: string, req: AiRequest): Promise<AiAnswer> {
  const { run, trajectoryId, ...rest } = req;
  // trajectoryId: the trajectory a Trajectory AI call is for; the function checks the caller may plan it.
  const body = !run ? { use, ...rest, ...(trajectoryId ? { trajectory_id: trajectoryId } : {}) } : run.say !== undefined ? { use, run_id: run.run_id, say: run.say } : { use, ...rest, run_id: run.run_id, state: run.state ?? '' };
  const data = await invokeFunction<{ text?: string; cut?: boolean; say?: string }>('ai', body);
  if (data && run?.say !== undefined && typeof data.say === 'string') { const { say, ...meta } = data; return { text: say, cut: false, meta }; }
  if (!data || typeof data.text !== 'string') throw new Error('The AI function returned no text');
  return { text: data.text, cut: data.cut === true };
}

// The house-rules review of a Game contribution: the function loads the contribution's own files and records the verdict itself;
// the client only names the contribution and reads the answer.
export type GameVerdict = { passed: boolean; reasons: string[] };
export async function reviewGame(contributionId: string): Promise<GameVerdict> {
  const data = await invokeFunction<Partial<GameVerdict>>('ai', { action: 'review_game', contribution_id: contributionId });
  if (!data || typeof data.passed !== 'boolean' || !Array.isArray(data.reasons)) throw new Error('AI did not return a usable review · retry this step');
  return { passed: data.passed, reasons: data.reasons.map(String) };
}
