import { useEffect, useRef, type RefObject } from 'react';
import { limitedQueue } from './limiter';
import { HOST_SOURCE, firstNameInitial, parseBridgeRequest, type AskRole, type BridgeAnswer, type BridgeRequest, type LeaderRow, type RoleReply } from './protocol';

// The platform side of the bridge (reduced from GameStudio's useBridgeHost.ts): answers a game's requests as the
// signed-in player. It knows no Supabase: the stores come in through the context. One host per frame run:
// mount it under a key that changes with the page and the run.

export interface BridgeContext {
  /** null: no run (a preview or test play); the game can read but its score is not saved. */
  runId: string | null;
  data: unknown;
  /** The person's name; a game only ever sees first name and initial. */
  player: string;
  onScore: (score: number) => Promise<void>;
  leaderboard: (() => Promise<LeaderRow[]>) | null;
  askAI: ((req: AskRole) => Promise<RoleReply>) | null;
  /** The game called finish(); the score it submitted, if any. */
  onFinished(score: number | null): void;
  /** The frame loaded a second time (it navigated away) and was stopped: nothing is answered after. */
  onLeft(): void;
}

/** The sandboxed srcdoc frame's origin is opaque, which a message reports as the string "null". */
const FRAME_ORIGIN = 'null';
const LEADERBOARD_CALLS = 30;

/**
 * Only messages from this frame's window, with the frame's opaque origin, that parse are handled, and only
 * while the frame is on its first document.
 */
export function useBridgeHost(frame: RefObject<HTMLIFrameElement | null>, ctx: BridgeContext) {
  const latest = useRef(ctx);
  useEffect(() => { latest.current = ctx; });
  const submitted = useRef<number | null>(null);
  const scoreFailed = useRef(false);
  const left = useRef(false);
  const leaderboardQueue = useRef(limitedQueue(LEADERBOARD_CALLS));

  // The iframe's onLoad (attached at commit, so even a first load that fires at once is counted): the first load is
  // the game's own page; any further load means it navigated away.
  const loads = useRef(0);
  const onLoad = () => {
    loads.current += 1;
    if (loads.current > 1 && !left.current) { left.current = true; latest.current.onLeft(); }
  };

  useEffect(() => {
    async function submitScore(score: number): Promise<unknown> {
      const c = latest.current;
      if (submitted.current !== null) throw new Error('The score was already submitted');
      if (c.runId) {
        try { await c.onScore(score); } catch (e) { scoreFailed.current = true; throw e; }
      }
      submitted.current = score;
      return { saved: !!c.runId };
    }

    function handle(req: BridgeRequest): Promise<unknown> | unknown {
      const c = latest.current;
      switch (req.type) {
        case 'ready': return true;
        case 'getData': return c.data ?? null;
        case 'getPlayer': return { name: firstNameInitial(c.player) };
        case 'getLeaderboard': {
          const rows = c.leaderboard;
          if (!rows) throw new Error('This game has no leaderboard');
          return leaderboardQueue.current(async () => (await rows()).map((r) => ({ ...r, name: firstNameInitial(r.name) })));
        }
        case 'submitScore': return submitScore(req.score);
        case 'askAI':
          if (!c.askAI) throw new Error('This game has no AI role');
          return c.askAI({ messages: req.messages, state: req.state });
        case 'finish':
          // After a failed save the player stays where the message is, not on results without this game.
          if (!scoreFailed.current) c.onFinished(submitted.current);
          return true;
      }
    }

    // Replies go only to this frame's window. Its origin is opaque, so "*" is the only target a page can name.
    const respond = (res: BridgeAnswer) => {
      if (!left.current) frame.current?.contentWindow?.postMessage({ source: HOST_SOURCE, ...res }, '*');
    };
    const onMessage = (e: MessageEvent) => {
      if (left.current || !frame.current || e.source !== frame.current.contentWindow || e.origin !== FRAME_ORIGIN) return;
      const req = parseBridgeRequest(e.data);
      if (!req) return;
      Promise.resolve().then(() => handle(req)).then(
        (value) => respond({ id: req.id, ok: true, value }),
        (err) => respond({ id: req.id, ok: false, error: err instanceof Error ? err.message : 'Something went wrong' }),
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frame]);
  return { onLoad };
}
