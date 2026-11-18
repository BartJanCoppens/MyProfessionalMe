// The live session's pure parts (ported from Taxatar's heyGenSession.ts and its usage-meter test): what a failure means, and the meter that reports the
// seconds a video session really ran.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyLiveError, createUsageMeter, openLiveVideo, reportLiveSeconds, USAGE_HEARTBEAT_MS } from './liveSession';

const invoke = vi.fn(), keepalive = vi.fn();
vi.mock('../lib/aiStore', () => ({ invokeFunction: (...a: unknown[]) => invoke(...a), keepaliveFunction: (...a: unknown[]) => keepalive(...a), warmKeepalive: () => Promise.resolve() }));

const SID = '3b241101-e2bb-4255-8caf-4136c566a962';

describe('classifyLiveError', () => {
  it('a 402 or quota means the video minutes are gone', () => {
    expect(classifyLiveError({ status: 402 }).reason).toBe('no_credits');
    expect(classifyLiveError({ errorCode: 4033 }).reason).toBe('no_credits');
  });
  it('code 4000 means the token was rejected; a missing session means it expired; the rest is unknown', () => {
    expect(classifyLiveError({ code: 4000 }).reason).toBe('token_rejected');
    expect(classifyLiveError(new Error('Session not found')).reason).toBe('session');
    expect(classifyLiveError(new Error('boom'))).toEqual({ reason: 'unknown', message: 'boom' });
  });
});

describe('createUsageMeter', () => {
  afterEach(() => vi.useRealTimers());
  it('reports zero seconds, final, once, when stopped before it started (a failed start)', () => {
    const report = vi.fn().mockResolvedValue(undefined);
    const meter = createUsageMeter(SID, report, () => 0);
    meter.stop();
    meter.stop();
    expect(report.mock.calls).toEqual([[SID, 0, true]]);
  });
  it('heartbeats every 30 s with the seconds so far, and two stops send one final report', () => {
    vi.useFakeTimers();
    let t = 1000;
    const report = vi.fn().mockResolvedValue(undefined);
    const meter = createUsageMeter(SID, report, () => t);
    meter.start();
    t += USAGE_HEARTBEAT_MS;
    vi.advanceTimersByTime(USAGE_HEARTBEAT_MS);
    expect(report).toHaveBeenLastCalledWith(SID, 30, false);
    t += 12_000;
    meter.stop();
    meter.stop();
    expect(report).toHaveBeenLastCalledWith(SID, 42, true);
    expect(report.mock.calls.filter((c) => c[2] === true)).toHaveLength(1);
    vi.advanceTimersByTime(USAGE_HEARTBEAT_MS * 3);
    expect(report).toHaveBeenCalledTimes(2);
  });
});

describe('openLiveVideo and reportLiveSeconds', () => {
  it('asks the avatar function for a session of the run and returns its token, session and seconds', async () => {
    invoke.mockResolvedValueOnce({ token: 't', sessionId: SID, maxSeconds: 660 });
    expect(await openLiveVideo('run-1')).toEqual({ token: 't', sessionId: SID, maxSeconds: 660 });
    expect(invoke).toHaveBeenCalledWith('avatar', { action: 'start', runId: 'run-1' });
  });
  it('throws when the answer has no token', async () => {
    invoke.mockResolvedValueOnce({});
    await expect(openLiveVideo('run-1')).rejects.toThrow(/no session/i);
  });
  it('a heartbeat goes through the function client; a final report is a keepalive request; neither throws', async () => {
    invoke.mockRejectedValueOnce(new Error('down'));
    await expect(reportLiveSeconds(SID, 30.4, false)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenLastCalledWith('avatar', { action: 'report', sessionId: SID, seconds: 30, final: false });
    keepalive.mockRejectedValueOnce(new Error('down'));
    await expect(reportLiveSeconds(SID, 42, true)).resolves.toBeUndefined();
    expect(keepalive).toHaveBeenCalledWith('avatar', { action: 'report', sessionId: SID, seconds: 42, final: true });
  });
});
