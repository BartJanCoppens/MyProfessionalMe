// The house-rules review of a game, as the `ai` function runs it (action review_game): the game is the one the database gives for this
// caller (never files from the client), the verdict is read strictly here and recorded by the database for the hash it gave. The
// database and the provider are handed in, so Vitest tests the flow (src/lib/aiReview.test.ts).
import { readVerdict, reviewRequest } from '../_shared/gameReview.ts';
import type { ReviewInput } from '../_shared/gameReview.ts';
import { inputChars, limitMessage, withPreamble } from './core.ts';
import type { Ask, Outcome } from './core.ts';

export type ReviewLoad = ReviewInput & { review_hash: string };
export type Verdict = { passed: boolean; reasons: string[] };
export type ReviewDeps = {
  preamble: string; // the use's house rules, put first
  dailyLimit?: number;
  load: () => Promise<ReviewLoad | null>; // public.game_review_input: null unless the caller is the author of a built game they may still edit
  count: (chars: number) => Promise<'ok' | 'limit' | 'error'>;
  call: (ask: Ask) => Promise<Outcome>;
  record: (reviewHash: string, v: Verdict) => Promise<string | null>; // public.record_game_review: an error message, or null
};
export type ReviewResult = { status: 200; body: Verdict } | { status: number; error: string };

export async function reviewGame(d: ReviewDeps): Promise<ReviewResult> {
  const game = await d.load();
  if (!game) return { status: 404, error: 'That game is not yours to review, or it is not built yet' };
  const ask = withPreamble(reviewRequest(game), d.preamble);
  const counted = await d.count(inputChars(ask));
  if (counted !== 'ok') return counted === 'limit' ? { status: 429, error: limitMessage(d.dailyLimit ?? null, false) } : { status: 500, error: 'Could not count the call' };
  const out = await d.call(ask);
  if (!out.ok) return { status: 502, error: out.error };
  const verdict = out.cut ? null : readVerdict(out.text);
  if (!verdict) return { status: 502, error: 'AI did not return a usable review · retry this step' };
  const failed = await d.record(game.review_hash, verdict);
  return failed ? { status: 409, error: failed } : { status: 200, body: verdict };
}
