// The pure part of the `avatar` edge function: reading a request, the HeyGen LiveAvatar token request, and the whole start and report
// answers with their outside steps (database, Vault, fetch) passed in, so Vitest tests them (src/lib/avatarCore.test.ts). index.ts wires
// those steps to Supabase. The token request and language mapping are copied from Taxatar's heygen-token function.
// The key is only ever put in a header to LiveAvatar; nothing HeyGen answers is passed on, so nothing can echo it.
import { AI_HEADER, fail, scrub, UUID } from '../_shared/aiGuard.ts';

export const AVATAR_USE = 'avatar_video';
export const LIVEAVATAR = 'https://api.liveavatar.com';
export const AVATAR_LIMITS = { body: 2000, timeoutMs: 15_000, reportMax: 3600 };
const UNAVAILABLE = 'Live video is unavailable right now · the portrait speaks instead';
type Read<T> = ({ ok: true } & T) | { ok: false; error: string };
const record = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;

export function readStart(body: unknown): Read<{ runId: string }> {
  const runId = record(body).runId;
  return typeof runId === 'string' && UUID.test(runId) ? { ok: true, runId } : { ok: false, error: 'Name the run (runId)' };
}

export type Report = { sessionId: string; seconds: number; final: boolean };
export function readReport(body: unknown): Read<{ report: Report }> {
  const b = record(body);
  if (typeof b.sessionId !== 'string' || !UUID.test(b.sessionId)) return { ok: false, error: 'Name the video session (sessionId)' };
  if (typeof b.seconds !== 'number' || !Number.isInteger(b.seconds) || b.seconds < 0 || b.seconds > AVATAR_LIMITS.reportMax) return { ok: false, error: 'Seconds are a whole number from 0 to 3,600' };
  return { ok: true, report: { sessionId: b.sessionId, seconds: b.seconds, final: b.final === true } };
}

/** LiveAvatar only validates the persona language when the session starts, and rejects Norwegian written as "nb"/"nn".
 *  Map BCP-47 tags to the ISO 639-1 codes it accepts (Taxatar's language.ts). */
export function liveAvatarLanguage(tag: string): string {
  const base = tag.split(/[-_]/)[0].toLowerCase();
  if (base === 'nb' || base === 'nn') return 'no';
  return /^[a-z]{2}$/.test(base) ? base : 'en';
}

export type TokenTarget = { key: string; baseUrl: string | null };
export type SessionSettings = { avatarId: string; voiceId: string | null; language: 'en' | 'nl' | 'fr'; maxSeconds: number };
// Taxatar's body, verbatim: a full avatar session, high-quality H264, conversational; voice_id only when the look has one.
export function tokenRequest(t: TokenTarget, s: SessionSettings) {
  return {
    url: (t.baseUrl || LIVEAVATAR).replace(/\/+$/, '') + '/v1/sessions/token',
    init: {
      method: 'POST' as const, headers: { 'Content-Type': 'application/json', 'X-API-KEY': t.key },
      body: JSON.stringify({
        mode: 'FULL', avatar_id: s.avatarId, max_session_duration: s.maxSeconds, video_settings: { quality: 'high', encoding: 'H264' }, interactivity_type: 'CONVERSATIONAL',
        avatar_persona: { language: liveAvatarLanguage(s.language), ...(s.voiceId ? { voice_id: s.voiceId } : {}) },
      }),
    },
  };
}

export function readToken(json: unknown): string | null {
  const j = record(json), d = record(j.data);
  const token = d.session_token ?? j.session_token ?? d.token ?? j.token;
  return typeof token === 'string' && token ? token : null;
}

export type Opened = { session_id: string; max_seconds: number; avatar_id: string; voice_id: string | null; language: 'en' | 'nl' | 'fr' };
export type StartDeps = {
  live: () => Promise<boolean>; // avatar_video is in ai_live_uses()
  open: (runId: string) => Promise<Opened | { refusal: string } | null>; // public.avatar_session_open: reserves the seconds; null when it could not be asked
  report: (sessionId: string, seconds: number, final: boolean) => Promise<{ ok: true; used: number } | { ok: false; message: string }>; // public.avatar_session_report
  target: () => Promise<TokenTarget | null>; // the use's HeyGen connection with its key from Vault; null without a key
  log: (line: Record<string, unknown>) => void;
  fetch?: typeof fetch;
};

const REFUSALS: Record<string, [number, string]> = {
  not_yours: [403, 'That is not your run'],
  finished: [409, 'This run has ended'],
  no_video: [409, 'This look has no live video · the portrait speaks instead'],
  open_elsewhere: [409, 'Another video session of yours is still open · wait a moment, then try again'],
  minutes_used: [429, 'Your video minutes for today are used up · continue with the portrait or typing'],
  sessions_used: [429, 'Your video sessions for today are used up · continue with the portrait or typing'],
};

// { action: 'start', runId }: reserves the seconds, then asks LiveAvatar for a short-lived token. When anything after the reservation fails, the reservation
// is returned (report 0, final) before the answer, so a refused token costs no minutes.
export async function startResponse(body: unknown, d: StartDeps): Promise<Response> {
  const started = Date.now();
  const r = readStart(body);
  if (!r.ok) return fail(400, r.error);
  if (!(await d.live())) return fail(409, 'Live video is not switched on');
  const opened = await d.open(r.runId);
  if (!opened) return fail(500, 'Could not reserve the video minutes');
  if ('refusal' in opened) { const [status, text] = REFUSALS[opened.refusal] || [409, 'Live video is not available for this run']; return fail(status, text); }
  const done = async (status: number, error: string) => {
    await d.report(opened.session_id, 0, true);
    d.log({ action: 'start', status, ms: Date.now() - started });
    return fail(status, error);
  };
  const t = await d.target();
  if (!t) return done(409, 'The video connection has no key');
  const req = tokenRequest(t, { avatarId: opened.avatar_id, voiceId: opened.voice_id, language: opened.language, maxSeconds: opened.max_seconds });
  try {
    const res = await (d.fetch || fetch)(req.url, { ...req.init, signal: AbortSignal.timeout(AVATAR_LIMITS.timeoutMs) });
    const token = res.ok ? readToken(await res.json().catch(() => ({}))) : null;
    if (!token) return done(503, UNAVAILABLE);
    d.log({ action: 'start', status: 200, ms: Date.now() - started });
    return Response.json({ token, sessionId: opened.session_id, maxSeconds: opened.max_seconds }, { headers: { ...AI_HEADER, 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    d.log({ action: 'start', error: scrub((err as Error).name, t.key) });
    return done(503, UNAVAILABLE);
  }
}

// { action: 'report', sessionId, seconds, final }: the seconds used so far (the database clamps them to the wall clock); final closes the session.
export async function reportResponse(body: unknown, d: StartDeps): Promise<Response> {
  const started = Date.now();
  const r = readReport(body);
  if (!r.ok) return fail(400, r.error);
  const out = await d.report(r.report.sessionId, r.report.seconds, r.report.final);
  d.log({ action: 'report', status: out.ok ? 200 : 409, ms: Date.now() - started });
  if (out.ok) return Response.json({ usedSeconds: out.used }, { headers: { 'Cache-Control': 'private, no-store' } });
  return fail(/not your/i.test(out.message) ? 403 : 409, /has ended|not your|0 to 3,600/i.test(out.message) ? out.message : 'Could not record the video seconds');
}
