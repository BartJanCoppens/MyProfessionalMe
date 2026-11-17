// Server-side AI for the app: the key stays here, read from Vault per call; the client never sees it.
//
//   { use, system?, messages, max_tokens? }  any signed-in user: answers a live text use (see ai_live_uses()) with the
//                                            connection and model the System Admin chose for it -> { text }
//   { action: 'test', connection_id }        System Admins: one tiny call with that connection -> { ok, model } or { ok: false, error }
//
// Guard rails: the use's fixed instruction (ai_uses.preamble) always goes first and the client's system text after it;
// each person has a daily limit per use (ai_uses.daily_limit), counted in ai_usage before the call (429 beyond it);
// uses marked admins_only (curriculum copilot, learner's eye, test retrieval) need an admin role; max_tokens and the
// request size are capped (core.ts). Nothing of the messages or the reply is logged; a log line holds the use, the
// outcome and the duration.
import { withSupabase } from '@supabase/server';
import { callerRoles, connectionKey, countCall, fail, isLive, useRow } from '../_shared/aiUse.ts';
import type { Conn } from '../_shared/aiUse.ts';
import { callProvider, inputChars, limitMessage, LIMITS, readAsk, TEST_ASK, TEXT_PROVIDERS, withPreamble } from './core.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Use POST');
    const raw = await req.text();
    if (raw.length > LIMITS.body) return fail(413, 'The request is too large');
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return fail(400, 'Body must be JSON'); }

    const callerId = ctx.userClaims!.id;
    const admin = ctx.supabaseAdmin;
    const roles = await callerRoles(admin, callerId);
    if (!roles) return fail(500, 'Could not check your roles');
    const started = Date.now();

    if (body.action === 'test') {
      if (!roles.includes('system_admin')) return fail(403, 'Only a System Admin can test a connection');
      const { data: conn } = await admin.from('ai_connections').select('id, provider, base_url, default_model').eq('id', String(body.connection_id || '')).maybeSingle<Conn>();
      if (!conn) return fail(404, 'Connection not found');
      if (!TEXT_PROVIDERS.includes(conn.provider)) return Response.json({ ok: false, error: 'Only text connections (Anthropic, OpenAI-compatible) can be tested here; a voice connection is checked by hearing a stock voice' });
      if (!conn.default_model) return Response.json({ ok: false, error: 'Set a default model first' });
      const key = await connectionKey(admin, conn.id);
      if (!key) return Response.json({ ok: false, error: 'No key stored yet' });
      const out = await callProvider({ provider: conn.provider, baseUrl: conn.base_url, model: conn.default_model, key }, TEST_ASK);
      console.log(JSON.stringify({ action: 'test', ok: out.ok, ms: Date.now() - started }));
      return Response.json(out.ok ? { ok: true, model: conn.default_model } : { ok: false, error: out.error });
    }

    const r = readAsk(body);
    if (!r.ok) return fail(400, r.error);
    // The same rule the app reads: enabled, built, with a connection that has a key (and a model, for text).
    const live = await isLive(admin, r.use);
    if (live === null) return fail(500, 'Could not read the AI settings');
    if (!live) return fail(409, 'This AI use is not live: a System Admin sets its connection in Administration · AI connections');
    const use = await useRow(admin, r.use);
    if (!use || !use.connection) return fail(409, 'This AI use has no connection');
    // Voice uses are live too (ai_live_uses), but only the `voice` function serves them.
    if (use.kind !== 'text') return fail(409, 'This is not a text use: the voice function serves it');
    if (use.admins_only && !roles.length) return fail(403, 'Only admins use this assistant');
    const ask = withPreamble(r.ask, use.preamble);
    // Counted before the call, atomically; beyond the limit nothing is counted and nothing is sent.
    const counted = await countCall(admin, callerId, r.use, inputChars(ask));
    if (counted !== 'ok') return counted === 'limit' ? fail(429, limitMessage(use.daily_limit)) : fail(500, 'Could not count the call');
    const key = await connectionKey(admin, use.connection.id);
    if (!key) return fail(409, 'The connection has no key');
    const out = await callProvider({ provider: use.connection.provider, baseUrl: use.connection.base_url, model: use.model || use.connection.default_model!, key }, ask);
    console.log(JSON.stringify({ use: r.use, ok: out.ok, ms: Date.now() - started }));
    return out.ok ? Response.json({ text: out.text }) : fail(502, out.error);
  }),
};
