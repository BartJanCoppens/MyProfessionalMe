// A game's AI role, as the `ai` function plays it (use game_role): the run is the caller's own, unfinished, on a game that has the role, and the
// database says so (public.game_role_context, service role: the one place what the role knows is read). The call is counted before it is made,
// the knowledge goes only to the model (between markers) and the conversation and state are marked as data. The database and the provider are
// handed in, so Vitest tests the flow (src/lib/aiGameRole.test.ts).
import { marked } from '../_shared/promptData.ts';
import { GAME_ASK, inputChars, gameRoleSystem, limitMessage, NO_SCRIPT, withPreamble } from './core.ts';
import type { Ask, GameAsk, Outcome } from './core.ts';

export const GAME_ROLE_USE = 'game_role';
export type RoleContext = { kind: string; about: string; knows: string; concept: string } | { refusal: 'not_yours' | 'finished' | 'not_allowed' | 'no_role' };
export type RoleDeps = {
  preamble: string; // the use's rules for staying in role, put first
  dailyLimit?: number;
  dailyChars?: number | null;
  context: () => Promise<RoleContext | null>; // public.game_role_context for this caller and run: null when it could not be read
  count: (chars: number) => Promise<'ok' | 'limit' | 'error'>;
  call: (ask: Ask) => Promise<Outcome>;
};
export type RoleResult = { status: 200; body: { text: string; cut: boolean } } | { status: number; error: string };

export const REFUSED = {
  not_yours: { status: 403, error: 'That is not your run' },
  finished: { status: 409, error: 'This run is finished' },
  not_allowed: { status: 403, error: 'You can no longer play-test this game' },
  no_role: { status: 400, error: 'This game has no AI role' },
} as const;

export async function playRole(d: RoleDeps, g: GameAsk): Promise<RoleResult> {
  const ctx = await d.context();
  if (!ctx) return { status: 500, error: 'Could not read the run' };
  if ('refusal' in ctx) return REFUSED[ctx.refusal];
  const last = g.messages.length - 1;
  // Every turn is data; the state rides on the player's last turn.
  const messages = g.messages.map((m, k) => ({ role: m.role, content: marked(m.content, GAME_ASK.messageChars) + (k === last && g.state ? '\nGame state: ' + marked(g.state, GAME_ASK.stateChars) : '') }));
  const ask = withPreamble({ system: gameRoleSystem(ctx, ctx.knows, ctx.concept), messages, max_tokens: 600 }, d.preamble);
  const counted = await d.count(inputChars(ask));
  if (counted !== 'ok') return counted === 'limit' ? { status: 429, error: limitMessage(d.dailyLimit ?? null, !NO_SCRIPT.includes(GAME_ROLE_USE), d.dailyChars ?? null) } : { status: 500, error: 'Could not count the call' };
  const out = await d.call(ask);
  if (!out.ok) return { status: 502, error: out.error };
  // An answer cut at its limit is a fragment, never text for the game.
  return out.cut ? { status: 502, error: 'AI did not return a usable reply · try again' } : { status: 200, body: { text: out.text, cut: false } };
}
