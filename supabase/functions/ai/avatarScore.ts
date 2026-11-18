// Scoring a practice run, as the `ai` function runs it (action score_avatar): the run is the caller's own and the conversation is the one the database holds
// (public.avatar_score_input, never text from the client), the answer is read strictly here (_shared/avatarScore.ts) and recorded by the database for the hash it
// gave (public.record_avatar_score, which checks it again and ends the run). A cut or unusable answer records nothing. The database and the provider are handed
// in, so Vitest tests the flow (src/lib/aiAvatarScore.test.ts). The call is counted under avatar_conversation, like the character's turns.
import { readScore, scoreRequest } from '../_shared/avatarScore.ts';
import type { AvatarScore, ScoreInput } from '../_shared/avatarScore.ts';
import { inputChars, limitMessage, NO_SCRIPT, withPreamble } from './core.ts';
import type { Ask, Outcome } from './core.ts';
import type { RoleRefusal } from './rolePlay.ts';
import { AVATAR_USE } from './avatarTurn.ts';

export type ScoreLoad = ScoreInput & { score_hash: string };
export type ScoreDeps = {
  preamble: string; // the character's rules ("stay in character") do not belong to a scorer: the caller hands in none, the scoring text carries its own rules
  dailyLimit?: number;
  dailyChars?: number | null;
  load: () => Promise<ScoreLoad | RoleRefusal | null>; // public.avatar_score_input: the run, or why it cannot be scored; null when it could not be read
  count: (chars: number) => Promise<'ok' | 'limit' | 'error'>;
  call: (ask: Ask) => Promise<Outcome>;
  record: (hash: string, score: AvatarScore) => Promise<string | null>; // public.record_avatar_score: an error message, or null
};
export type ScoreResult = { status: 200; body: AvatarScore } | { status: number; error: string };

// avatar_score_input's refusals (src/lib/avatarScore.sync.test.ts reads the same words in the migration or the character's).
export const SCORE_REFUSED: Record<string, { status: number; error: string }> = {
  not_yours: { status: 403, error: 'That is not your run' },
  finished: { status: 409, error: 'This run has ended' },
  not_allowed: { status: 403, error: 'You can no longer practise with this draft' },
  no_scenario: { status: 400, error: 'This learning has no practice scenario' },
  no_lines: { status: 400, error: 'Say something before you end the run' },
  practice_only: { status: 400, error: 'This scenario is practice only: it has no score' },
};
const UNUSABLE = { status: 502, error: 'AI did not return a usable score · try again' };

export async function scoreAvatarRun(d: ScoreDeps): Promise<ScoreResult> {
  const loaded = await d.load();
  if (!loaded) return { status: 500, error: 'Could not read the run' };
  if ('refusal' in loaded) return SCORE_REFUSED[(loaded as RoleRefusal).refusal] ?? { status: 500, error: 'Could not read the run' };
  const input = loaded as ScoreLoad;
  const ask = withPreamble(scoreRequest(input), d.preamble);
  const counted = await d.count(inputChars(ask));
  if (counted !== 'ok') return counted === 'limit' ? { status: 429, error: limitMessage(d.dailyLimit ?? null, !NO_SCRIPT.includes(AVATAR_USE), d.dailyChars ?? null) } : { status: 500, error: 'Could not count the call' };
  const out = await d.call(ask);
  if (!out.ok) return { status: 502, error: out.error };
  const score = out.cut ? null : readScore(out.text, input.points, input.turns);
  if (!score) return UNUSABLE;
  const failed = await d.record(input.score_hash, score);
  return failed ? { status: 409, error: failed } : { status: 200, body: score };
}
