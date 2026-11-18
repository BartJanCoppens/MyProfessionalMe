// Server-side AI for the app: the key stays here, read from Vault per call; the client never sees it.
//
//   { use, system?, messages, max_tokens? }  any signed-in user: answers a live text use (see ai_live_uses()) with the
//                                            connection and model the System Admin chose for it -> { text }
//   { action: 'test', connection_id }        System Admins: one tiny call with that connection -> { ok, model } or { ok: false, error }
//   { use: 'game_role', run_id, messages, state } the player of a run (their own, unfinished) of a game with an AI role: the role's reply -> { text };
//                                            the role and what it knows are read by the database for the run (public.game_role_context), never sent by the client
//   { action: 'review_game', contribution_id } the author of a built Game: the house-rules review (use studio_game) of the files the
//                                            database holds for that contribution -> { passed, reasons }, recorded by the database
//                                            for those files (public.record_game_review); the verdict is never the client's
//
// Guard rails: the use's fixed instruction (ai_uses.preamble) always goes first and the client's system text after it;
// each person has a daily limit per use (ai_uses.daily_limit), counted in ai_usage before the call (429 beyond it);
// uses marked admins_only (curriculum copilot, learner's eye, test retrieval) need an admin role; max_tokens and the
// request size are capped (core.ts). Nothing of the messages or the reply is logged; a log line holds the use, the
// outcome and the duration. A use may raise the answer size and wait (USE_LIMITS in _shared/aiGuard.ts); an answer cut at its limit says so (cut).
import { withSupabase } from '@supabase/server';
import { callerRoles, connectionKey, countCall, fail, isLive, readUse } from '../_shared/aiUse.ts';
import type { Conn, UseRow } from '../_shared/aiUse.ts';
import { NO_SCRIPT, USE_LIMITS } from '../_shared/aiGuard.ts';
import { callProvider, inputChars, limitMessage, LIMITS, readAsk, readGameAsk, TEST_ASK, TEXT_PROVIDERS, withPreamble } from './core.ts';
import { GAME_ROLE_USE, playRole } from './gameRole.ts';
import type { RoleContext } from './gameRole.ts';
import { GAME_USE, reviewGame } from './review.ts';
import type { ReviewLoad } from './review.ts';

type Admin = Parameters<typeof isLive>[0];
// The use as the caller may use it now (live, a text use, theirs to use), or the answer that says why not.
async function openUse(admin: Admin, key: string, roles: string[]): Promise<{ use: UseRow } | Response> {
  // The same rule the app reads: enabled, built, with a connection that has a key (and a model, for text).
  const live = await isLive(admin, key);
  if (live === null) return fail(500, 'Could not read the AI settings');
  if (!live) return fail(409, 'This AI use is not live: a System Admin sets its connection in Administration · AI connections');
  const use = await readUse(admin, key);
  if (!use || !use.connection) return fail(409, 'This AI use has no connection');
  // Voice uses are live too (ai_live_uses), but only the `voice` function serves them.
  if (use.kind !== 'text') return fail(409, 'This is not a text use: the voice function serves it');
  if (use.admins_only && !roles.length) return fail(403, 'Only admins use this assistant');
  return { use };
}

// The provider call's target for a live use: its connection, the use's model (else the connection's) and the key.
const targetOf = (use: UseRow, key: string) => ({ provider: use.connection!.provider, baseUrl: use.connection!.base_url, model: use.model || use.connection!.default_model!, key });
// The use as the caller may use it now, with its target (the key read from Vault), or the answer that says why not.
async function openTarget(admin: Admin, key: string, roles: string[]): Promise<{ use: UseRow; target: ReturnType<typeof targetOf> } | Response> {
  const opened = await openUse(admin, key, roles);
  if (opened instanceof Response) return opened;
  const secret = await connectionKey(admin, opened.use.connection!.id);
  return secret ? { use: opened.use, target: targetOf(opened.use, secret) } : fail(409, 'The connection has no key');
}

type Call = { admin: Admin; body: Record<string, unknown>; callerId: string; roles: string[]; started: number };

// action 'test': one tiny call with a connection (System Admins).
async function testConnection({ admin, body, roles, started }: Call): Promise<Response> {
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

// action 'review_game': the house-rules review of the author's built game.
async function review({ admin, body, callerId, roles, started }: Call): Promise<Response> {
  const opened = await openTarget(admin, GAME_USE, roles);
  if (opened instanceof Response) return opened;
  const { use, target } = opened, contribution = String(body.contribution_id || '');
  const out = await reviewGame({
    preamble: use.preamble, dailyLimit: use.daily_limit, dailyChars: use.daily_chars,
    load: async () => ((await admin.rpc('game_review_input', { p_user: callerId, p_contribution: contribution })).data as ReviewLoad | null) ?? null,
    count: (chars) => countCall(admin, callerId, GAME_USE, chars),
    call: (ask) => callProvider(target, ask, fetch, USE_LIMITS[GAME_USE].timeoutMs),
    record: async (hash, v) => (await admin.rpc('record_game_review', { p_contribution: contribution, p_review_hash: hash, p_passed: v.passed, p_reasons: v.reasons })).error?.message ?? null,
  });
  console.log(JSON.stringify({ action: 'review_game', status: out.status, ms: Date.now() - started }));
  return 'error' in out ? fail(out.status, out.error) : Response.json(out.body);
}

// use 'game_role': a game's AI role for the caller's own run.
async function gameRole({ admin, body, callerId, roles, started }: Call): Promise<Response> {
  const g = readGameAsk(body);
  if (!g.ok) return fail(400, g.error);
  const opened = await openTarget(admin, GAME_ROLE_USE, roles);
  if (opened instanceof Response) return opened;
  const { use, target } = opened;
  const out = await playRole({
    preamble: use.preamble, dailyLimit: use.daily_limit, dailyChars: use.daily_chars,
    context: async () => ((await admin.rpc('game_role_context', { p_user: callerId, p_run: g.runId })).data as RoleContext | null) ?? null,
    count: (chars) => countCall(admin, callerId, GAME_ROLE_USE, chars),
    call: (ask) => callProvider(target, ask, fetch, USE_LIMITS[GAME_ROLE_USE]?.timeoutMs),
  }, g);
  console.log(JSON.stringify({ use: GAME_ROLE_USE, status: out.status, ms: Date.now() - started }));
  return 'error' in out ? fail(out.status, out.error) : Response.json(out.body);
}

// Any other live text use: { use, system?, messages, max_tokens? }.
async function answer({ admin, body, callerId, roles, started }: Call): Promise<Response> {
  const r = readAsk(body);
  if (!r.ok) return fail(400, r.error);
  const opened = await openUse(admin, r.use, roles);
  if (opened instanceof Response) return opened;
  const { use } = opened;
  const ask = withPreamble(r.ask, use.preamble);
  // Counted before the call, atomically; beyond the limit nothing is counted and nothing is sent.
  const counted = await countCall(admin, callerId, r.use, inputChars(ask));
  if (counted !== 'ok') return counted === 'limit' ? fail(429, limitMessage(use.daily_limit, !NO_SCRIPT.includes(r.use), use.daily_chars)) : fail(500, 'Could not count the call');
  const key = await connectionKey(admin, use.connection!.id);
  if (!key) return fail(409, 'The connection has no key');
  const out = await callProvider(targetOf(use, key), ask, fetch, USE_LIMITS[r.use]?.timeoutMs);
  console.log(JSON.stringify({ use: r.use, ok: out.ok, ms: Date.now() - started }));
  return out.ok ? Response.json({ text: out.text, cut: out.cut }) : fail(502, out.error);
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Use POST');
    const raw = await req.text();
    if (raw.length > LIMITS.body) return fail(413, 'The request is too large');
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return fail(400, 'Body must be JSON'); }

    const callerId = ctx.userClaims!.id, admin = ctx.supabaseAdmin;
    const roles = await callerRoles(admin, callerId);
    if (!roles) return fail(500, 'Could not check your roles');
    const call: Call = { admin, body, callerId, roles, started: Date.now() };
    if (body.action === 'test') return testConnection(call);
    if (body.action === 'review_game') return review(call);
    return body.use === GAME_ROLE_USE ? gameRole(call) : answer(call);
  }),
};
