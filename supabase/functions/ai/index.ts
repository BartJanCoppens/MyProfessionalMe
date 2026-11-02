// Server-side AI for the app: the key stays here, read from Vault per call; the client never sees it.
//
//   { use, system?, messages, max_tokens? }  any signed-in user: answers a live text use (see ai_live_uses()) with the
//                                            connection and model the System Admin chose for it -> { text }
//   { action: 'test', connection_id }        System Admins: one tiny call with that connection -> { ok, model } or { ok: false, error }
//
// Uses marked admins_only (curriculum copilot, learner's eye, test retrieval) need an admin role. Nothing of the
// messages or the reply is logged; a log line holds the use, the outcome and the duration.
import { withSupabase } from '@supabase/server';
import { callProvider, LIMITS, readAsk, TEST_ASK, TEXT_PROVIDERS } from './core.ts';
import type { Provider } from './core.ts';

const fail = (status: number, error: string) => Response.json({ error }, { status });
type Conn = { id: string; provider: Provider; base_url: string | null; default_model: string | null };

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Use POST');
    const raw = await req.text();
    if (raw.length > LIMITS.body) return fail(413, 'The request is too large');
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return fail(400, 'Body must be JSON'); }

    const callerId = ctx.userClaims!.id;
    const admin = ctx.supabaseAdmin;
    const { data: roles, error: rolesError } = await admin.from('user_roles').select('role').eq('user_id', callerId);
    if (rolesError) return fail(500, 'Could not check your roles');
    const keyOf = async (connectionId: string) => {
      const { data, error } = await admin.rpc('ai_connection_key', { p_connection: connectionId });
      return error ? null : (data as string | null);
    };
    const started = Date.now();

    if (body.action === 'test') {
      if (!roles.some((r) => r.role === 'system_admin')) return fail(403, 'Only a System Admin can test a connection');
      const { data: conn } = await admin.from('ai_connections').select('id, provider, base_url, default_model').eq('id', String(body.connection_id || '')).maybeSingle<Conn>();
      if (!conn) return fail(404, 'Connection not found');
      if (!TEXT_PROVIDERS.includes(conn.provider)) return Response.json({ ok: false, error: 'Only text connections (Anthropic, OpenAI-compatible) can be tested here; this key is stored for later' });
      if (!conn.default_model) return Response.json({ ok: false, error: 'Set a default model first' });
      const key = await keyOf(conn.id);
      if (!key) return Response.json({ ok: false, error: 'No key stored yet' });
      const out = await callProvider({ provider: conn.provider, baseUrl: conn.base_url, model: conn.default_model, key }, TEST_ASK);
      console.log(JSON.stringify({ action: 'test', ok: out.ok, ms: Date.now() - started }));
      return Response.json(out.ok ? { ok: true, model: conn.default_model } : { ok: false, error: out.error });
    }

    const r = readAsk(body);
    if (!r.ok) return fail(400, r.error);
    // The same rule the app reads: enabled, text, built, with a connection that has a key and a model.
    const { data: live, error: liveError } = await admin.rpc('ai_live_uses');
    if (liveError) return fail(500, 'Could not read the AI settings');
    if (!((live as string[]) || []).includes(r.use)) return fail(409, 'This AI use is not live: a System Admin sets its connection in Administration · AI connections');
    const { data: use } = await admin.from('ai_uses').select('admins_only, model, connection:ai_connections(id, provider, base_url, default_model)').eq('key', r.use).single<{ admins_only: boolean; model: string | null; connection: Conn }>();
    if (!use || !use.connection) return fail(409, 'This AI use has no connection');
    if (use.admins_only && !roles.length) return fail(403, 'Only admins use this assistant');
    const key = await keyOf(use.connection.id);
    if (!key) return fail(409, 'The connection has no key');
    const out = await callProvider({ provider: use.connection.provider, baseUrl: use.connection.base_url, model: use.model || use.connection.default_model!, key }, r.ask);
    console.log(JSON.stringify({ use: r.use, ok: out.ok, ms: Date.now() - started }));
    return out.ok ? Response.json({ text: out.text }) : fail(502, out.error);
  }),
};
