// The Avatar's character, as the `ai` function plays it (use avatar_conversation) on the one role-play path (rolePlay.ts): the run is the caller's own,
// unfinished and in time (public.avatar_run_context, service role: the one place what the character reveals or hides is read). The client sends the
// run and one line; the server holds the conversation, so no character line can be forged. The reply and the learner's line are written once
// (public.avatar_add_turns) after the answer. This file is only the Avatar's side: its context, refusals, request and the turn write. The guards
// (_shared/avatarGuard.ts): the learner's line is checked by patterns first (a hold sends nothing and counts nothing), then one count covers the persona's
// ask and both classifiers' (avatarGuarded.ts); a held line or reply is never answered: the character says an in-character substitute line, stored with the
// guard code on both turns, and the held reply is stored nowhere. Tested in src/lib/aiAvatarTurn.test.ts.
import { AVATAR_PROMPT_VERSION, avatarPromptHash, buildPersonaPrompt } from '../_shared/avatarPrompt.ts';
import type { CharacterContext } from '../_shared/avatarPrompt.ts';
import { kindOf, prefilterSay, sanitizeUntrusted, substituteLine } from '../_shared/avatarGuard.ts';
import type { GuardCode } from '../_shared/avatarGuard.ts';
import { AVATAR_ASK } from '../_shared/avatarRules.ts';
import { marked } from '../_shared/promptData.ts';
import { guardedCall, guardedCount } from './avatarGuarded.ts';
import type { GuardState } from './avatarGuarded.ts';
import { UUID } from './core.ts';
import type { Msg } from './core.ts';
import { playRole } from './rolePlay.ts';
import type { RoleDeps as RoleDepsOf, RoleRefusal } from './rolePlay.ts';

export const AVATAR_USE = 'avatar_conversation';
export type AvatarTurn = { who: 'learner' | 'character'; text: string; guard: GuardCode | null };
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

// The stored turns in order (the learner's as user, the character's as assistant), then the new line; every one is data, whoever wrote it, and a learner's
// line is sanitised again. A held exchange (both its turns carry the guard code) is left out: the character never sees what was held, and the turns still alternate.
const messagesOf = (turns: AvatarTurn[], say: string): Msg[] => [
  ...turns.filter((t) => !t.guard).map((t) => ({ role: t.who === 'learner' ? 'user' as const : 'assistant' as const, content: marked(t.who === 'learner' ? sanitizeUntrusted(t.text) : t.text, AVATAR_ASK.replyChars) })),
  { role: 'user', content: marked(say, AVATAR_ASK.sayChars) },
];

// The held exchange: the learner's line as typed and the substitute, both with the code; no provider was asked for it, or its reply is dropped.
async function storeHeld(d: AvatarDeps, ctx: AvatarRunContext, say: string, code: GuardCode, hash: string): Promise<AvatarResult> {
  const line = substituteLine(ctx.language, kindOf(code)), stored = ctx.turns.length;
  const refused = await d.addTurns([{ who: 'learner', text: say, guard: code }, { who: 'character', text: line, guard: code }], AVATAR_PROMPT_VERSION, hash, stored);
  return refused ? { status: 409, error: refused } : { status: 200, body: { say: line, turn: stored + 2, held: true } };
}

export async function playAvatarTurn(d: AvatarDeps, a: AvatarAsk): Promise<AvatarResult> {
  const hash = await avatarPromptHash();
  // A run another prompt began is refused here, before the call is counted (the database refuses it again at the write).
  const first = await d.context();
  const ctx = first && !('refusal' in first) && first.prompt_version && (first.prompt_version !== AVATAR_PROMPT_VERSION || first.prompt_hash !== hash) ? { refusal: 'prompt_changed' } : first;
  const usable = ctx && !('refusal' in ctx) ? ctx as AvatarRunContext : null;
  const pre = prefilterSay(a.say, usable?.language);
  if (usable && pre.held) return storeHeld(d, usable, a.say, pre.held, hash);
  const state: GuardState = { held: null };
  const out = await playRole({ ...d, context: async () => ctx, count: guardedCount(d.count, pre.text), call: guardedCall(d.call, pre.text, state) }, (c) => {
    return { system: buildPersonaPrompt(c), messages: messagesOf(c.turns, pre.text), max_tokens: AVATAR_ASK.maxTokens };
  }, REFUSED, AVATAR_USE);
  if ('error' in out) return out;
  if (state.held) return storeHeld(d, usable!, a.say, state.held, hash);
  const reply = out.body.text.trim();
  if (!reply || reply.length > AVATAR_ASK.replyChars) return UNUSABLE;
  const stored = usable!.turns.length;
  const refused = await d.addTurns([{ who: 'learner', text: a.say, guard: null }, { who: 'character', text: reply, guard: null }], AVATAR_PROMPT_VERSION, hash, stored);
  if (refused) return { status: 409, error: refused };
  return { status: 200, body: { say: reply, turn: stored + 2, held: false } };
}
