// The pure core of the `avatar` edge function (supabase/functions/avatar/core.ts): the request checks, the LiveAvatar token request,
// and the whole start and report answers with their outside steps (database, Vault, fetch) as fakes. The key never leaves.
import { describe, expect, it, vi } from 'vitest';
import { liveAvatarLanguage, readReport, readStart, readToken, reportResponse, startResponse, stopRequest, tokenRequest } from '../../supabase/functions/avatar/core.ts';
import type { StartDeps } from '../../supabase/functions/avatar/core.ts';

const KEY = 'hg-secret-key-4321';
const RID = '7c9e6679-7425-40de-944b-e07fc1f90ae7', SID = '3b241101-e2bb-4255-8caf-4136c566a962';
const AVATAR = '11111111-2222-4333-8444-555555555555';
const OPENED = { session_id: SID, max_seconds: 660, avatar_id: AVATAR, voice_id: null, language: 'nl' as const };
const PID = 'hg-session-77';
const body = async (r: Response) => JSON.parse(await r.text());

function deps(over: Partial<StartDeps> = {}): StartDeps & { reports: [string, number, boolean, boolean][]; attached: string[]; lines: Record<string, unknown>[] } {
  const reports: [string, number, boolean, boolean][] = [], attached: string[] = [], lines: Record<string, unknown>[] = [];
  return {
    live: async () => true, open: async () => OPENED, target: async () => ({ key: KEY, baseUrl: null }),
    report: async (id, seconds, final, stopped) => { reports.push([id, seconds, final, stopped]); return { ok: true, used: seconds }; },
    attach: async (_id, provider) => { attached.push(provider); }, provider: async () => PID,
    log: (l) => lines.push(l), reports, attached, lines,
    fetch: vi.fn(async () => new Response(JSON.stringify({ data: { session_token: 'tok-1', session_id: PID } }), { status: 200 })), ...over,
  };
}

describe('readStart and readReport', () => {
  it('names the run', () => {
    expect(readStart({ action: 'start', runId: 'x' })).toEqual({ ok: false, error: 'Name the run (runId)' });
    expect(readStart({ action: 'start', runId: RID })).toEqual({ ok: true, runId: RID });
  });
  it('takes seconds 0 to 3,600 as integers', () => {
    expect(readReport({ sessionId: SID, seconds: 90, final: true })).toEqual({ ok: true, report: { sessionId: SID, seconds: 90, final: true } });
    expect(readReport({ sessionId: SID, seconds: 0 }).ok).toBe(true);
    for (const seconds of [-1, 3601, 1.5, '5', null]) expect(readReport({ sessionId: SID, seconds }).ok).toBe(false);
    expect(readReport({ sessionId: 'x', seconds: 5 }).ok).toBe(false);
  });
});

describe('tokenRequest (Taxatar\'s body)', () => {
  const s = { avatarId: AVATAR, voiceId: null, language: 'nl' as const, maxSeconds: 660 };
  it('asks the LiveAvatar token URL with the key in X-API-KEY and the session settings', () => {
    const r = tokenRequest({ key: KEY, baseUrl: null }, s);
    expect(r.url).toBe('https://api.liveavatar.com/v1/sessions/token');
    expect((r.init.headers as Record<string, string>)['X-API-KEY']).toBe(KEY);
    const b = JSON.parse(r.init.body);
    expect(b).toMatchObject({ mode: 'FULL', avatar_id: AVATAR, max_session_duration: 660, video_settings: { quality: 'high', encoding: 'H264' }, interactivity_type: 'CONVERSATIONAL', avatar_persona: { language: 'nl' } });
    expect('voice_id' in b.avatar_persona).toBe(false);
  });
  it('adds the voice only when set, and takes another base URL', () => {
    const r = tokenRequest({ key: KEY, baseUrl: 'https://alt.example/' }, { ...s, voiceId: 'v-1' });
    expect(r.url).toBe('https://alt.example/v1/sessions/token');
    expect(JSON.parse(r.init.body).avatar_persona.voice_id).toBe('v-1');
  });
});

describe('liveAvatarLanguage and readToken (ported)', () => {
  it('maps tags to the codes LiveAvatar accepts', () => {
    expect([liveAvatarLanguage('nl-BE'), liveAvatarLanguage('nb'), liveAvatarLanguage('x')]).toEqual(['nl', 'no', 'en']);
  });
  it('reads the session token', () => {
    expect(readToken({ data: { session_token: 't' } })).toBe('t');
    expect(readToken({ token: 'u' })).toBe('u');
    expect(readToken({})).toBeNull();
  });
});

describe('startResponse', () => {
  const start = { action: 'start', runId: RID };
  it('answers 409 when the use is not live', async () => {
    const r = await startResponse(start, deps({ live: async () => false }));
    expect([r.status, (await body(r)).error]).toEqual([409, 'Live video is not switched on']);
  });
  it('answers 429 when the minutes of the day are used', async () => {
    const r = await startResponse(start, deps({ open: async () => ({ refusal: 'minutes_used' }) }));
    expect([r.status, (await body(r)).error]).toEqual([429, 'Your video minutes for today are used up · continue with the portrait or typing']);
  });
  it('maps the other refusals to words and opens nothing at HeyGen', async () => {
    const d = deps({ open: async () => ({ refusal: 'open_elsewhere' }) });
    const r = await startResponse(start, d);
    expect(r.status).toBe(409);
    expect(d.fetch).not.toHaveBeenCalled();
    expect((await startResponse(start, deps({ open: async () => ({ refusal: 'no_video' }) }))).status).toBe(409);
    expect((await startResponse(start, deps({ open: async () => ({ refusal: 'not_yours' }) }))).status).toBe(403);
    expect((await startResponse(start, deps({ open: async () => null }))).status).toBe(500);
  });
  it('success: 200, marked, with the token, the session and the seconds, and the key sent only to HeyGen', async () => {
    const d = deps();
    const r = await startResponse(start, d);
    expect(r.status).toBe(200);
    expect(r.headers.get('X-AI-Generated')).toBe('true');
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await body(r)).toEqual({ token: 'tok-1', sessionId: SID, maxSeconds: 660 });
    expect(d.reports).toEqual([]);
    expect(d.attached).toEqual([PID]);
    expect(JSON.stringify(d.lines)).not.toContain(KEY);
  });
  it('HeyGen 402 returns the seconds once and answers 503 without echoing the key', async () => {
    const d = deps({ fetch: vi.fn(async () => new Response(JSON.stringify({ message: 'bad key ' + KEY }), { status: 402 })) });
    const r = await startResponse(start, d);
    const text = await r.text();
    expect(r.status).toBe(503);
    expect(JSON.parse(text).error).toBe('Live video is unavailable right now · the portrait speaks instead');
    expect(text).not.toContain(KEY);
    expect(d.reports).toEqual([[SID, 0, true, true]]);
    expect(JSON.stringify(d.lines)).not.toContain(KEY);
  });
  it('a transport error, a reply with no token and a missing key return the seconds too', async () => {
    for (const over of [{ fetch: vi.fn(async () => { throw new Error('down ' + KEY); }) }, { fetch: vi.fn(async () => new Response('{}', { status: 200 })) }, { target: async () => null }]) {
      const d = deps(over);
      const r = await startResponse(start, d);
      expect(r.status).toBeGreaterThanOrEqual(409);
      expect(d.reports).toEqual([[SID, 0, true, true]]);
      expect(await r.text()).not.toContain(KEY);
    }
  });
});

describe('reportResponse', () => {
  it('refuses seconds out of 0 to 3,600', async () => {
    for (const seconds of [-1, 3601]) expect((await reportResponse({ action: 'report', sessionId: SID, seconds, final: false }, deps())).status).toBe(400);
  });
  it('answers the seconds used', async () => {
    const r = await reportResponse({ action: 'report', sessionId: SID, seconds: 42, final: true }, deps());
    expect([r.status, await body(r)]).toEqual([200, { usedSeconds: 42 }]);
  });
  it('a closed session answers 409 in words', async () => {
    const r = await reportResponse({ sessionId: SID, seconds: 5 }, deps({ report: async () => ({ ok: false, message: 'This video session has ended' }) }));
    expect([r.status, (await body(r)).error]).toEqual([409, 'This video session has ended']);
  });
});

describe('the final report never refunds from the client\'s number', () => {
  const final = { action: 'report', sessionId: SID, seconds: 1, final: true };
  it('stops the session at LiveAvatar with its own id, then reports stopped', async () => {
    const d = deps({ fetch: vi.fn(async () => new Response(JSON.stringify({ code: 1000, message: 'ok' }), { status: 200 })) });
    const r = await reportResponse(final, d);
    expect(r.status).toBe(200);
    const [url, init] = (d.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(stopRequest({ key: KEY, baseUrl: null }, PID).url);
    expect(JSON.parse(String(init.body))).toEqual({ session_id: PID });
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe(KEY);
    expect(d.reports).toEqual([[SID, 1, true, true]]);
  });
  it('a 2xx counts as a stop only when its body code is 100 or 1000: no code, another code or a body that is not JSON fails closed (reservation and lock hold until the window ends)', async () => {
    for (const [code, stopped] of [[100, true], [1000, true], [undefined, false], [4000, false], ['1000', false], [null, false]] as const) {
      const d = deps({ fetch: vi.fn(async () => new Response(JSON.stringify(code === undefined ? {} : { code, message: 'x' }), { status: 200 })) });
      await reportResponse(final, d);
      expect(d.reports).toEqual([[SID, 1, true, stopped]]);
    }
  });
  it('a 2xx whose body is not JSON is not a stop either', async () => {
    const d = deps({ fetch: vi.fn(async () => new Response('ok', { status: 200 })) });
    await reportResponse(final, d);
    expect(d.reports).toEqual([[SID, 1, true, false]]);
  });
  it('a 404 does not count as stopped: the reservation and the open session stay (fail closed)', async () => {
    const d = deps({ fetch: vi.fn(async () => new Response('{}', { status: 404 })) });
    await reportResponse(final, d);
    expect(d.reports).toEqual([[SID, 1, true, false]]);
  });
  it('when the stop fails, errors or cannot be asked (no id or key), the report says not stopped, so the database keeps the whole reservation', async () => {
    for (const over of [{ fetch: vi.fn(async () => new Response('{}', { status: 500 })) }, { fetch: vi.fn(async () => { throw new Error('down'); }) }, { provider: async () => null }, { target: async () => null }]) {
      const d = deps(over);
      expect((await reportResponse(final, d)).status).toBe(200);
      expect(d.reports).toEqual([[SID, 1, true, false]]);
    }
  });
  it('a heartbeat stops nothing', async () => {
    const d = deps();
    await reportResponse({ action: 'report', sessionId: SID, seconds: 30, final: false }, d);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.reports).toEqual([[SID, 30, false, false]]);
  });
});
