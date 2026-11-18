// The Avatar's character, as the `ai` function plays it (use avatar_conversation) on the one role-play path (rolePlay.ts): the run is the caller's own,
// unfinished and in time (public.avatar_run_context, service role: the one place what the character reveals or hides is read). The client sends the
// run and one line; the server holds the conversation, so no character line can be forged. The reply and the learner's line are written once
// (public.avatar_add_turns) after the answer. This file is only the Avatar's side: its context, refusals, request and the turn write.
// Guardrails around the call are Task 6.3. Tested in src/lib/aiAvatarTurn.test.ts.
import { AVATAR_PROMPT_VERSION, avatarPromptHash, buildPersonaPrompt } from '../_shared/avatarPrompt.ts';
import type { CharacterContext } from '../_shared/avatarPrompt.ts';
import { AVATAR_ASK } from '../_shared/avatarRules.ts';
import { marked } from '../_shared/promptData.ts';
import { UUID } from './core.ts';
import type { Msg } from './core.ts';
import { playRole } from './rolePlay.ts';
import type { RoleDeps as RoleDepsOf, RoleRefusal } from './rolePlay.ts';

export const AVATAR_USE = 'avatar_conversation';
export type AvatarTurn = { who: 'learner' | 'character'; text: string; guard: string | null };
export type AvatarRunContext = CharacterContext & { points: unknown[]; minutes: 5 | 10 | 15; turns: AvatarTurn[]; learner_turns: number; prompt_version: string | null; prompt_hash: string | null };
export type AvatarDeps = RoleDepsOf<AvatarRunContext> & {
  // public.avatar_add_turns: appends the learner's line and the character's, and records the prompt version and hash; the database's refusal, or null.
  // `expected` is the number of turns the context saw: a stale append (another line was stored meanwhile) is refused.
  addTurns: (turns: AvatarTurn[], version: string, hash: string, expected: number) => Promise<string | null>;
};
export type AvatarAsk = { ok: true; runId: string; say: string };
export type AvatarResult = { status: 200; body: { say: string; turn: number; held: boolean } } | { status: number; error: string };

// avatar_run_context's refusals, one for one (src/lib/avatarRuns.sync.test.ts).
export const REFUSED = {
  not_yours: { status: 403, error: 'That is not your run' },
  finished: { status: 409, error: 'This run has ended' },
  not_allowed: { status: 403, error: 'You can no longer practise with this draft' },
  no_scenario: { status: 400, error: 'This learning has no practice scenario' },
  time_up: { status: 409, error: 'This run\'s time is up · end it to see your score' },
  prompt_changed: { status: 409, error: 'The prompt changed during the run' }, // the edge's own, before counting (the database says it again at the write)
  turns_used: (r: RoleRefusal) => ({ status: 409, error: 'You used the ' + String(r.lines) + ' lines of this run · end it to see your score' }),
};
const UNUSABLE = { status: 502, error: 'AI did not return a usable reply · try again' };

// { use, run_id, say }: one line of the learner's. No system text and no conversation: the scenario sets the character, the database holds the turns.
export function readAvatarAsk(body: unknown): AvatarAsk | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.system !== undefined || b.messages !== undefined) return { ok: false, error: 'The scenario sets the character, not the request' };
  if (typeof b.run_id !== 'string' || !UUID.test(b.run_id)) return { ok: false, error: 'Name the run (run_id)' };
  if (typeof b.say !== 'string' || !b.say.trim()) return { ok: false, error: 'Say something to the character (say)' };
  if (b.say.length > AVATAR_ASK.sayChars) return { ok: false, error: 'A line is at most ' + AVATAR_ASK.sayChars.toLocaleString('en-US') + ' characters' };
  return { ok: true, runId: b.run_id, say: b.say };
}

// The stored turns in order (the learner's as user, the character's as assistant), then the new line; every one is data, whoever wrote it.
const messagesOf = (turns: AvatarTurn[], say: string): Msg[] => [
  ...turns.map((t) => ({ role: t.who === 'learner' ? 'user' as const : 'assistant' as const, content: marked(t.text, AVATAR_ASK.replyChars) })),
  { role: 'user', content: marked(say, AVATAR_ASK.sayChars) },
];

export async function playAvatarTurn(d: AvatarDeps, a: AvatarAsk): Promise<AvatarResult> {
  const seen: { ctx?: AvatarRunContext } = {}, hash = await avatarPromptHash();
  // A run another prompt began is refused here, before the call is counted (the database refuses it again at the write).
  const context = async () => {
    const ctx = await d.context();
    if (ctx && !('refusal' in ctx) && ctx.prompt_version && (ctx.prompt_version !== AVATAR_PROMPT_VERSION || ctx.prompt_hash !== hash)) return { refusal: 'prompt_changed' };
    return ctx;
  };
  const out = await playRole({ ...d, context }, (ctx) => {
    seen.ctx = ctx;
    return { system: buildPersonaPrompt(ctx), messages: messagesOf(ctx.turns, a.say), max_tokens: AVATAR_ASK.maxTokens };
  }, REFUSED, AVATAR_USE);
  if ('error' in out) return out;
  const reply = out.body.text.trim();
  if (!reply || reply.length > AVATAR_ASK.replyChars) return UNUSABLE;
  const stored = seen.ctx!.turns.length;
  const refused = await d.addTurns([{ who: 'learner', text: a.say, guard: null }, { who: 'character', text: reply, guard: null }], AVATAR_PROMPT_VERSION, hash, stored);
  if (refused) return { status: 409, error: refused };
  return { status: 200, body: { say: reply, turn: stored + 2, held: false } };
}
