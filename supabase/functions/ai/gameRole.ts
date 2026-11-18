// A game's AI role, as the `ai` function plays it (use game_role) on the one role-play path (rolePlay.ts): the run is the caller's own, unfinished, on a
// game that has the role, and the database says so (public.game_role_context). This file is only the game's side: what its context holds, its
// refusals and how the role, the game's concept, the conversation and the state become a request (the knowledge goes only to the model, between
// markers, and the conversation and state are marked as data). Tested in src/lib/aiGameRole.test.ts.
import { marked } from '../_shared/promptData.ts';
import { GAME_ASK, gameRoleSystem } from './core.ts';
import type { GameAsk } from './core.ts';
import { playRole } from './rolePlay.ts';
import type { RoleDeps as RoleDepsOf, RoleResult } from './rolePlay.ts';

export const GAME_ROLE_USE = 'game_role';
export type GameRoleContext = { kind: string; about: string; knows: string; concept: string };
export type RoleDeps = RoleDepsOf<GameRoleContext>;

export const REFUSED = {
  not_yours: { status: 403, error: 'That is not your run' },
  finished: { status: 409, error: 'This run is finished' },
  not_allowed: { status: 403, error: 'You can no longer play-test this game' },
  no_role: { status: 400, error: 'This game has no AI role' },
} as const;

export const playGameRole = (d: RoleDeps, g: GameAsk): Promise<RoleResult> => playRole(d, (ctx) => {
  const last = g.messages.length - 1;
  // Every turn is data; the state rides on the player's last turn.
  const messages = g.messages.map((m, k) => ({ role: m.role, content: marked(m.content, GAME_ASK.messageChars) + (k === last && g.state ? '\nGame state: ' + marked(g.state, GAME_ASK.stateChars) : '') }));
  return { system: gameRoleSystem(ctx, ctx.knows, ctx.concept), messages, max_tokens: 600 };
}, REFUSED, GAME_ROLE_USE);
