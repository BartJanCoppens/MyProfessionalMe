// The live talking head (studios plan, Task 6.5), a lean port of Taxatar's useHeyGenAvatar. It asks the `avatar` function for a short-lived token, runs a
// LiveAvatar session that speaks only the text it is given (repeat) and never opens the microphone: nothing the learner says is recorded or sent here (typing is
// always the way to answer; browser speech recognition, if the panel offers it, is the panel's own). A session that cannot start, is refused (limits), stops by itself
// or goes idle hands over to the portrait through onFallback; the learner is never stuck on video (S4). The session is stopped, and its seconds finally reported with
// a keepalive request, on stop, unmount, page hide, idle and run end, so no session is left running unreported.
import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveAvatarSession, SessionEvent } from '@heygen/liveavatar-web-sdk';
import { classifyLiveError, createUsageMeter, openLiveVideo } from './liveSession';
import type { UsageMeter } from './liveSession';

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'failed';
export const IDLE_STOP_MS = 180_000; // no learner line (so no spoken reply) for 3 minutes: the video stops to save minutes
export const STOPPED_MESSAGE = 'The video stopped · the portrait speaks instead';
export const IDLE_MESSAGE = 'Video paused to save minutes · Resume video';

type Options = { runId: string; enabled: boolean; onFallback: (message: string) => void };

export function useLiveAvatar({ runId, enabled, onFallback }: Options) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const session = useRef<LiveAvatarSession | null>(null), meter = useRef<UsageMeter | null>(null), video = useRef<HTMLVideoElement | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null), generation = useRef(0), fallback = useRef(onFallback);
  fallback.current = onFallback;

  // Stops everything once: the meter's final report (which also returns the seconds of a session that never started) and the SDK session.
  const release = useCallback(async () => {
    generation.current += 1;
    if (idle.current) clearTimeout(idle.current);
    const [s, m] = [session.current, meter.current];
    session.current = null; meter.current = null;
    m?.stop();
    if (s) await s.stop().catch((): void => undefined);
  }, []);

  const end = useCallback(async (next: LiveStatus, message?: string) => {
    await release();
    setStatus(next);
    if (message) fallback.current(message);
  }, [release]);

  const armIdle = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => { void end('ended', IDLE_MESSAGE); }, IDLE_STOP_MS);
  }, [end]);

  const connect = useCallback(async () => {
    const mine = ++generation.current;
    setStatus('connecting');
    let opened;
    try { opened = await openLiveVideo(runId); } catch (e) {
      if (mine === generation.current) { setStatus('failed'); fallback.current(classifyLiveError(e).message); }
      return;
    }
    const usage = createUsageMeter(opened.sessionId);
    if (mine !== generation.current) { usage.stop(); return; } // stopped while the token was coming: give the seconds back
    const s = new LiveAvatarSession(opened.token);
    s.voiceChat.start = async () => {}; // the SDK would open the microphone here; the avatar only speaks the text it is given
    s.on(SessionEvent.SESSION_DISCONNECTED, () => { if (session.current === s) void end('ended', STOPPED_MESSAGE); });
    session.current = s; meter.current = usage;
    try { await s.start(); } catch (e) {
      if (mine === generation.current) await end('failed', classifyLiveError(e).message);
      return;
    }
    if (mine !== generation.current) return;
    if (video.current) s.attach(video.current);
    usage.start();
    armIdle();
    setStatus('live');
  }, [runId, end, armIdle]);

  const attach = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
    if (el && session.current) session.current.attach(el);
  }, []);
  // Speaks the character's reply (the portrait or the browser voice speaks when this is not live). A reply means the learner just wrote a line: the idle clock restarts.
  const speak = useCallback((text: string) => {
    if (!session.current) return;
    session.current.repeat(text);
    armIdle();
  }, [armIdle]);
  const stop = useCallback(async () => { await release(); setStatus('idle'); }, [release]);
  const resume = useCallback(() => { if (!session.current) void connect(); }, [connect]);

  useEffect(() => {
    if (!enabled) { setStatus('idle'); return; }
    void connect();
    return () => { void release(); };
  }, [enabled, connect, release]);
  useEffect(() => {
    const onHide = () => { void release(); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [release]);

  return { status, attach, speak, stop, resume };
}
