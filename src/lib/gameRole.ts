// A game's AI role, from the platform's side (studios plan, Task 4.5): the game asks through the bridge, this sends it through the one AI path
// (`complete`, use game_role: server-only, so never Claude Design) as the run it is on, the conversation and the state. There is no system text:
// the role and what it knows are the database's, read by the `ai` function for the run. A failure is the game's failure, with the function's
// own words; nothing falls through to another source and no scripted line stands in for the role.
import type { AskRole, RoleReply } from '../game/protocol';
import { GAME_ASK } from '../../supabase/functions/_shared/gameRules.ts';
import { jsonObject } from '../../supabase/functions/_shared/promptData.ts';
import { complete } from './ai';
import type { CompleteOpts } from './ai';

export const ROLE_UNAVAILABLE = 'The AI role is not available right now';
export const ROLE_NEEDS_RUN = 'The AI role needs a saved run: View as and a preview of a draft that is not saved have none';

/** The model's reply as {say, action}; text that is not that JSON becomes what the role says. */
export function readRoleReply(text: string): RoleReply {
  const j = jsonObject(text) as { say?: unknown; action?: unknown } | null;
  if (!j || typeof j.say !== 'string') return { say: text.trim().slice(0, GAME_ASK.messageChars), action: null };
  const action = typeof j.action === 'string' ? j.action.trim().slice(0, GAME_ASK.actionChars) : '';
  return { say: j.say.slice(0, GAME_ASK.messageChars), action: action || null };
}

/** What the bridge calls for a game's askAI on this run (null: there is none to count the ask against). */
export function roleAsker(runId: string | null, opts: Pick<CompleteOpts, 'enabled' | 'live' | 'ask'>) {
  return async (req: AskRole): Promise<RoleReply> => {
    if (!opts.enabled || !opts.live.includes('game_role')) throw new Error(ROLE_UNAVAILABLE);
    if (!runId) throw new Error(ROLE_NEEDS_RUN);
    let failure: Error | null = null;
    const out = await complete('game_role', {
      messages: req.messages.map((m) => ({ role: m.role === 'player' ? 'user' as const : 'assistant' as const, content: m.text })),
      game: { run_id: runId, state: req.state == null ? '' : JSON.stringify(req.state) },
    }, { ...opts, onError: (e) => { failure = e; } });
    if (!out) throw failure ?? new Error(ROLE_UNAVAILABLE);
    return readRoleReply(out.text);
  };
}
