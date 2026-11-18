// The one role-play path of the `ai` function: a persona with hidden knowledge answering a person's messages, for a run of their own (the game's AI role
// and the Avatar's character). The run is checked first by the database (a service-role context RPC, the one place what the persona knows is
// read), then the use's preamble goes first, the call is counted before it is made (the per-person daily limits) and a cut answer is a failure,
// never text. What differs per use is handed in: the context and how it becomes a request (`build`), and the refusals. The database and the
// provider are handed in too, so Vitest tests the flow (src/lib/aiGameRole.test.ts, src/lib/aiAvatarTurn.test.ts).
import { countFirst } from '../_shared/aiGuard.ts';
import { inputChars, withPreamble } from './core.ts';
import type { Ask, Outcome } from './core.ts';

export type Refusal = { status: number; error: string };
/** What a context RPC answers when the run may not be played: a code, and what a message may need (the Avatar's number of lines). */
export type RoleRefusal = { refusal: string; [detail: string]: unknown };
export type RoleDeps<C> = {
  preamble: string; // the use's rules for staying in role, put first
  dailyLimit?: number;
  dailyChars?: number | null;
  context: () => Promise<C | RoleRefusal | null>; // the use's context RPC for this caller and run: null when it could not be read
  count: (chars: number) => Promise<'ok' | 'limit' | 'error'>;
  call: (ask: Ask) => Promise<Outcome>;
};
export type RoleResult = { status: 200; body: { text: string; cut: boolean } } | { status: number; error: string };

export async function playRole<C extends object>(d: RoleDeps<C>, build: (ctx: C) => Ask, refused: Record<string, Refusal | ((r: RoleRefusal) => Refusal)>, use: string): Promise<RoleResult> {
  const ctx = await d.context();
  if (!ctx) return { status: 500, error: 'Could not read the run' };
  if ('refusal' in ctx) {
    const r = ctx as RoleRefusal, answer = refused[r.refusal];
    return !answer ? { status: 500, error: 'Could not read the run' } : typeof answer === 'function' ? answer(r) : answer;
  }
  const ask = withPreamble(build(ctx as C), d.preamble);
  const stopped = await countFirst(d.count, inputChars(ask), use, d.dailyLimit, d.dailyChars);
  if (stopped) return stopped;
  const out = await d.call(ask);
  if (!out.ok) return { status: 502, error: out.error };
  // An answer cut at its limit is a fragment, never text for the run.
  return out.cut ? { status: 502, error: 'AI did not return a usable reply · try again' } : { status: 200, body: { text: out.text, cut: false } };
}
