// The live video session's plumbing (studios plan, Task 6.5): asking the `avatar` function for a short-lived token, reporting the seconds a session really ran,
// and what a failure means. classifyLiveError and createUsageMeter are ported from Taxatar's heyGenSession.ts. The HeyGen key is never here: only the token.
import { invokeFunction, keepaliveFunction, warmKeepalive } from '../lib/aiStore';

export type LiveSessionStart = { token: string; sessionId: string; maxSeconds: number };
export type LiveErrorReason = 'no_credits' | 'token_rejected' | 'session' | 'unknown';
export type LiveError = { reason: LiveErrorReason; message: string };
export const USAGE_HEARTBEAT_MS = 30_000;

// Reserves the seconds and gets the token for the run (the function checks the run, the look, the limits and the open session).
export async function openLiveVideo(runId: string): Promise<LiveSessionStart> {
  const d = await invokeFunction<Partial<LiveSessionStart>>('avatar', { action: 'start', runId });
  if (!d || typeof d.token !== 'string' || typeof d.sessionId !== 'string' || typeof d.maxSeconds !== 'number') throw new Error('The video function returned no session');
  return { token: d.token, sessionId: d.sessionId, maxSeconds: d.maxSeconds };
}

// Seconds so far (the server clamps them to the wall clock). A final report is a keepalive request so it leaves while the page closes. Never throws:
// a report that fails leaves the reservation, which ends by itself.
export async function reportLiveSeconds(sessionId: string, seconds: number, final: boolean): Promise<void> {
  const body = { action: 'report', sessionId, seconds: Math.max(0, Math.round(seconds)), final };
  try {
    if (final) await keepaliveFunction('avatar', body);
    else { await invokeFunction('avatar', body); void warmKeepalive(); } // a heartbeat also refreshes the token the last report will use
  } catch { /* the reservation ends by itself */ }
}

/** Classifies a thrown value from the LiveAvatar SDK or the token call into a stable shape. */
export function classifyLiveError(e: unknown): LiveError {
  const err = e as { errorCode?: number; code?: number; status?: number; message?: string } | undefined;
  const msg = err?.message ?? String(e ?? '');
  if (err?.errorCode === 4033 || err?.code === 4033 || err?.status === 402 || /insufficient|no credits|credit|balance/i.test(msg)) {
    return { reason: 'no_credits', message: 'Live video is not available: the video account is out of credits.' };
  }
  if (err?.code === 4000 || /validating session token/i.test(msg)) return { reason: 'token_rejected', message: 'Live video is not available for this scenario right now.' };
  if (/session not found/i.test(msg)) return { reason: 'session', message: 'The video session expired before it could start.' };
  return { reason: 'unknown', message: msg || 'Live video failed to start.' };
}

export type UsageMeter = { start(): void; stop(): Promise<void> };

/** Meters one video session: a heartbeat while live, one final report on stop (also when it never started: the reservation is returned). */
export function createUsageMeter(sessionId: string, report: typeof reportLiveSeconds = reportLiveSeconds, now: () => number = () => Date.now()): UsageMeter {
  let startedAt: number | null = null, timer: ReturnType<typeof setInterval> | null = null, stopped = false;
  const elapsed = () => (startedAt === null ? 0 : (now() - startedAt) / 1000);
  return {
    start() {
      if (stopped || startedAt !== null) return;
      startedAt = now();
      timer = setInterval(() => { void report(sessionId, elapsed(), false); }, USAGE_HEARTBEAT_MS);
    },
    // Resolves when the final report has been sent (the server stops the session at LiveAvatar then), so the caller can stop its own end after it.
    async stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearInterval(timer);
      await report(sessionId, elapsed(), true);
    },
  };
}
