import { useEffect, useRef, type RefObject } from 'react';
import { HOST_SOURCE, parseBridgeRequest, type AskRole, type BridgeRequest, type BridgeAnswer, type LeaderRow, type RoleReply } from './protocol';

// The platform side of the bridge (reduced from GameStudio's useBridgeHost.ts): answers a game's requests as the
// signed-in player. It knows no Supabase: the stores come in through the context.

export interface BridgeContext {
  /** null: no run (a preview or test play); the game can read but its score is not saved. */
  runId: string | null;
  data: unknown;
  /** Already formatted for a game ("Jan P."). */
  player: string;
  onScore: (score: number) => Promise<void>;
  leaderboard: (() => Promise<LeaderRow[]>) | null;
  askAI: ((req: AskRole) => Promise<RoleReply>) | null;
  /** The game called finish(); the score it submitted, if any. */
  onFinished(score: number | null): void;
  /** The frame left the page it was given and was stopped. */
  onLeft(): void;
}

/** Only messages from this frame's window that parse are handled; everything else is ignored. */
export function useBridgeHost(frame: RefObject<HTMLIFrameElement | null>, ctx: BridgeContext) {
  const latest = useRef(ctx);
  useEffect(() => { latest.current = ctx; });
  const submitted = useRef<number | null>(null);
  const scoreFailed = useRef(false);
  useEffect(() => { submitted.current = null; scoreFailed.current = false; }, [ctx.runId]);

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
        case 'getPlayer': return { name: c.player };
        case 'getLeaderboard':
          if (!c.leaderboard) throw new Error('This game has no leaderboard');
          return c.leaderboard();
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

    const respond = (res: BridgeAnswer) => frame.current?.contentWindow?.postMessage({ source: HOST_SOURCE, ...res }, '*');
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
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
}
