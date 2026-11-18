// The avatar adapter: HeyGen LiveAvatar's short-lived session tokens for the live talking head. The key stays here, read from Vault per call
// through the connection that serves the AI use avatar_video; the client gets only a token that works for one session.
//
//   { action: 'start', runId }                          the caller's own unfinished run of a published avatar (or a play-test they may run), on a look
//                                                       with a HeyGen avatar: reserves the seconds (public.avatar_session_open: sessions and seconds a
//                                                       day per person, one open session, never more than the run's minutes plus one) and answers
//                                                       { token, sessionId, maxSeconds }
//   { action: 'report', sessionId, seconds, final }     the seconds used so far, clamped to the wall clock by the database; final closes the session and
//                                                       returns the unused seconds -> { usedSeconds }
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
      report: async (sessionId, seconds, final) => {
        const { data, error } = await admin.rpc('avatar_session_report', { p_user: callerId, p_session: sessionId, p_seconds: seconds, p_final: final });
        return error ? { ok: false, message: error.message } : { ok: true, used: data as number };
      },
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
