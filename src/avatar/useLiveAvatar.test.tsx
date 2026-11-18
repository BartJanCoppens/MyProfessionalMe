// @vitest-environment jsdom
// The live talking head hook with the LiveAvatar SDK faked: it speaks only text it is given, never opens the microphone, falls back cleanly
// when the video fails or stops, and stops the session (with one final keepalive report) on unmount, page hide and three idle minutes.
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_STOP_MS, useLiveAvatar } from './useLiveAvatar';

const invoke = vi.fn(), keepalive = vi.fn(), getUserMedia = vi.fn();
vi.mock('../lib/aiStore', () => ({ invokeFunction: (...a: unknown[]) => invoke(...a), keepaliveFunction: (...a: unknown[]) => keepalive(...a) }));

type Handler = (...a: unknown[]) => void;
const sessions: FakeSession[] = [];
let startError: Error | null = null;
class FakeSession {
  handlers: Record<string, Handler> = {};
  voiceChat = { start: vi.fn(async () => { await getUserMedia({ audio: true }); }) };
  repeat = vi.fn(); attach = vi.fn(); stop = vi.fn(async () => {});
  // like the SDK's start(): it opens the microphone through voiceChat.start()
  start = vi.fn(async () => { if (startError) throw startError; await this.voiceChat.start(); });
  on(e: string, h: Handler) { this.handlers[e] = h; }
  token: string;
  constructor(token: string) { this.token = token; sessions.push(this); }
}
vi.mock('@heygen/liveavatar-web-sdk', () => ({
  LiveAvatarSession: function (token: string) { return new FakeSession(token); },
  SessionEvent: { SESSION_DISCONNECTED: 'session.disconnected', SESSION_STREAM_READY: 'session.stream_ready' },
}));

const SID = '3b241101-e2bb-4255-8caf-4136c566a962';
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
async function live(onFallback = vi.fn()) {
  const hook = renderHook(() => useLiveAvatar({ runId: 'run-1', enabled: true, onFallback }));
  await flush();
  return { ...hook, onFallback, session: sessions[sessions.length - 1] };
}

beforeEach(() => {
  vi.useFakeTimers();
  sessions.length = 0;
  startError = null;
  invoke.mockReset().mockResolvedValue({ token: 'tok', sessionId: SID, maxSeconds: 660 });
  keepalive.mockReset().mockResolvedValue(undefined);
  getUserMedia.mockReset();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useLiveAvatar', () => {
  it('asks for a session of the run, goes live and speaks the text it is given with repeat()', async () => {
    const { result, session } = await live();
    expect(invoke).toHaveBeenCalledWith('avatar', { action: 'start', runId: 'run-1' });
    expect(session.token).toBe('tok');
    expect(result.current.status).toBe('live');
    act(() => result.current.speak('Hello'));
    expect(session.repeat).toHaveBeenCalledWith('Hello');
  });
  it('never opens the microphone: the session gets only text', async () => {
    await live();
    expect(getUserMedia).toHaveBeenCalledTimes(0);
  });
  it('a disconnect the app did not ask for ends the video and hands over to the portrait', async () => {
    const { result, session, onFallback } = await live();
    await act(async () => { session.handlers['session.disconnected'](); });
    expect(result.current.status).toBe('ended');
    expect(onFallback).toHaveBeenCalledWith('The video stopped · the portrait speaks instead');
    expect(keepalive).toHaveBeenCalledTimes(1);
  });
  it('a refused session fails cleanly, with the function\'s words, and speaking does nothing', async () => {
    invoke.mockRejectedValueOnce(new Error('Your video minutes for today are used up · continue with the portrait or typing'));
    const { result, onFallback } = await live();
    expect(result.current.status).toBe('failed');
    expect(onFallback).toHaveBeenCalledWith('Your video minutes for today are used up · continue with the portrait or typing');
    act(() => result.current.speak('Hello'));
    expect(sessions).toHaveLength(0);
  });
  it('a session that will not start returns its seconds (a final report) and falls back with the reason', async () => {
    startError = Object.assign(new Error('x'), { status: 402 });
    const { result, onFallback } = await live();
    expect(result.current.status).toBe('failed');
    expect(onFallback).toHaveBeenCalledWith(expect.stringMatching(/out of credits/));
    expect(keepalive).toHaveBeenCalledTimes(1);
    expect(keepalive).toHaveBeenCalledWith('avatar', expect.objectContaining({ seconds: 0, final: true }));
  });
  it('unmount stops the session and sends one final keepalive report', async () => {
    const { unmount, session } = await live();
    unmount();
    await flush();
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(keepalive).toHaveBeenCalledTimes(1);
    expect(keepalive).toHaveBeenCalledWith('avatar', expect.objectContaining({ action: 'report', sessionId: SID, final: true }));
  });
  it('pagehide stops it too, once', async () => {
    const { session } = await live();
    act(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pagehide')); });
    await flush();
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(keepalive).toHaveBeenCalledTimes(1);
  });
  it('three minutes without a line stop it, saying it paused to save minutes; a line before that keeps it', async () => {
    const { result, session, onFallback } = await live();
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE_STOP_MS - 1000); });
    act(() => result.current.speak('Hello'));
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE_STOP_MS - 1000); });
    expect(result.current.status).toBe('live');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.status).toBe('ended');
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith('Video paused to save minutes · Resume video');
    expect(IDLE_STOP_MS).toBe(180_000);
  });
  it('stop() ends it on request without calling it a failure', async () => {
    const { result, session, onFallback } = await live();
    await act(async () => { await result.current.stop(); });
    expect(session.stop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
    expect(onFallback).not.toHaveBeenCalled();
  });
});
