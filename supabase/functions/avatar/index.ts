// The avatar adapter: HeyGen LiveAvatar's short-lived session tokens for the live talking head. The key stays here, read from Vault per call
// through the connection that serves the AI use avatar_video; the client gets only a token that works for one session.
//
//   { action: 'start', runId }                          the caller's own unfinished run of a published avatar (or a play-test they may run), on a look
//                                                       with a HeyGen avatar: reserves the seconds (public.avatar_session_open: sessions and seconds a
//                                                       day per person, one open session, never more than the run's minutes plus one) and answers
//                                                       { token, sessionId, maxSeconds }
//   { action: 'report', sessionId, seconds, final }     a heartbeat (seconds so far) or the final report. The client's number never lowers the charge: a final
//                                                       report stops the session at LiveAvatar and charges the wall clock since it opened; if the stop cannot
//                                                       be confirmed the whole reservation stays charged and the session stays open until its maximum
//                                                       has passed -> { usedSeconds }
//
// HeyGen is told max_session_duration, so a session the client never reports ends by itself. Answers made by the avatar carry X-AI-Generated: true.
// The key and what HeyGen answers are never passed on or logged; a log line holds the action, the status and the duration.
import { withSupabase } from '@supabase/server';
import { connectionKey, fail, isLive, readUse } from '../_shared/aiUse.ts';
import { AVATAR_LIMITS, AVATAR_USE, reportResponse, startResponse } from './core.ts';
import type { Opened, StartDeps } from './core.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Use POST');
    const raw = await req.text();
    if (raw.length > AVATAR_LIMITS.body) return fail(413, 'The request is too large');
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return fail(400, 'Body must be JSON'); }

    const callerId = ctx.userClaims!.id, admin = ctx.supabaseAdmin;
    const deps: StartDeps = {
      live: async () => (await isLive(admin, AVATAR_USE)) === true,
      open: async (runId) => {
        const { data, error } = await admin.rpc('avatar_session_open', { p_user: callerId, p_run: runId });
        return error ? null : (data as Opened | { refusal: string });
      },
      report: async (sessionId, seconds, final, stopped) => {
        const { data, error } = await admin.rpc('avatar_session_report', { p_user: callerId, p_session: sessionId, p_seconds: seconds, p_final: final, p_stopped: stopped });
        return error ? { ok: false, message: error.message } : { ok: true, used: data as number };
      },
      attach: async (sessionId, providerSessionId) => { await admin.rpc('avatar_session_attach', { p_user: callerId, p_session: sessionId, p_provider: providerSessionId }); },
      provider: async (sessionId) => { const { data } = await admin.rpc('avatar_session_provider', { p_user: callerId, p_session: sessionId }); return (data as string | null) ?? null; },
      target: async () => {
        const use = await readUse(admin, AVATAR_USE);
        const key = use?.connection?.provider === 'heygen' ? await connectionKey(admin, use.connection.id) : null;
        return use?.connection && key ? { key, baseUrl: use.connection.base_url } : null;
      },
      log: (line) => console.log(JSON.stringify(line)),
    };
    return body.action === 'report' ? reportResponse(body, deps) : startResponse(body, deps);
  }),
};
