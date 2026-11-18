// Avatar practice runs in Supabase (studios plan, Task 6.2): a run is started by the learner (a practice by an author or reviewer, on a
// contribution, is a test and never counts), each line goes to the character through the `ai` function (the server holds the conversation and
// what the character keeps back), and the run ends once through finish_avatar_run.
import type { GuardCode } from '../../supabase/functions/_shared/avatarGuard.ts';
import type { AvatarScore } from '../../supabase/functions/_shared/avatarScore.ts';
import { runRow } from './runTarget';
import type { RunTarget } from './runTarget';
import { completeOrThrow } from './ai';
import { invokeFunction } from './aiStore';
import type { CompleteOpts } from './ai';
import { supabase } from './supabase';

export type AvatarTurn = { who: 'learner' | 'character'; text: string; guard: GuardCode | null };
export type AvatarRunRow = { id: string; learning_id: string | null; contribution_id: string | null; test: boolean; started_at: string; finished_at: string | null; turns: AvatarTurn[] };
/** What the character answered: its line, the number of lines in the run so far, and whether a guard put in the substitute line. */
export type CharacterReply = { say: string; turn: number; held: boolean };

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export async function startAvatarRun(target: RunTarget): Promise<string> {
  const { data, error } = await supabase.from('avatar_runs').insert(runRow(target)).select('id').single();
  fail(error);
  return (data as { id: string }).id;
}

export const CHARACTER_UNAVAILABLE = 'The character is not available right now';
const inFlight = new Set<string>();

// Through the one AI path (`complete`, use avatar_conversation: server-only, so never Claude Design): only the run and the learner's line are sent; the
// function reads the character, the earlier lines and what it keeps back for that run. A failure is thrown with the function's words; no scripted line
// stands in for the character. One line at a time per run: a second while the first is on its way is refused, so the transcript stays in order.
export async function sayToCharacter(runId: string, say: string, opts: Pick<CompleteOpts, 'enabled' | 'live' | 'ask'>): Promise<CharacterReply> {
  if (inFlight.has(runId)) throw new Error('Wait for the character to answer');
  inFlight.add(runId);
  try {
    const out = await completeOrThrow('avatar_conversation', { messages: [], run: { run_id: runId, say } }, opts, CHARACTER_UNAVAILABLE);
    const turn = out.meta?.turn;
    if (typeof turn !== 'number') throw new Error('The character did not answer · try again');
    return { say: out.text, turn, held: out.meta?.held === true };
  } finally { inFlight.delete(runId); }
}

export async function endAvatarRun(runId: string): Promise<void> {
  const { error } = await supabase.rpc('finish_avatar_run', { p_run: runId });
  fail(error);
}

const NO_SCORE = 'AI did not return a usable score · try again';
// The AI's reading of what I said, in the run's own conversation (the function reads it, never the client) and recorded by the database, which ends the run.
// It is advice: it never completes a learning. A failure is thrown with the function's words; no scripted score stands in.
export async function scoreAvatarRun(runId: string): Promise<AvatarScore> {
  const data = await invokeFunction<Partial<AvatarScore> | null>('ai', { action: 'score_avatar', run_id: runId });
  if (!data || typeof data.overall !== 'number' || !Array.isArray(data.points)) throw new Error(NO_SCORE);
  return data as AvatarScore;
}

// My choice to show a scored run (not a practice in the studio) to my counsellor.
export async function shareAvatarRun(runId: string): Promise<void> {
  fail((await supabase.rpc('share_avatar_run', { p_run: runId })).error);
}

// The counsellor's note on a run shared with them (once): never completion.
export async function confirmAvatarRun(runId: string, note: string): Promise<void> {
  fail((await supabase.rpc('confirm_avatar_run', { p_run: runId, p_note: note })).error);
}

/** What the counsellor sees of a shared run: the AI's reading (without the server's injection flags), never the transcript until it is opened. */
export type SharedRun = { runId: string; userId: string; name: string; learningId: string; title: string; score: Omit<AvatarScore, 'flags'>; sharedAt: string };
type SharedRow = { run_id: string; user_id: string; name: string; learning_id: string; title: string; score: SharedRun['score']; shared_at: string; total: number };

// The unconfirmed runs shared with me as their counsellor (an admin only when the learner has none), oldest first, the first 50 and the number waiting: the database's rule, the same as
// the approvals queue's. My own runs are never in it.
export async function sharedAvatarRuns(): Promise<{ runs: SharedRun[]; total: number }> {
  const { data, error } = await supabase.rpc('shared_avatar_runs');
  fail(error);
  const rows = (data || []) as SharedRow[];
  // `total` is the number waiting, more than the list when over 50 wait
  return { runs: rows.map((r) => ({ runId: r.run_id, userId: r.user_id, name: r.name, learningId: r.learning_id, title: r.title, score: r.score, sharedAt: r.shared_at })), total: rows.length ? Number(rows[0].total) : 0 };
}

// One shared run's transcript, read when it is opened; the text of a line a guard held is blank (its guard code marks it).
export async function sharedRunTurns(runId: string): Promise<AvatarTurn[]> {
  const { data, error } = await supabase.rpc('shared_avatar_run_turns', { p_run: runId });
  fail(error);
  return (data || []) as AvatarTurn[];
}

// Take a share back, until the counsellor has confirmed it.
export async function withdrawAvatarRun(runId: string): Promise<void> {
  fail((await supabase.rpc('withdraw_avatar_run', { p_run: runId })).error);
}

// Mine only: the read policy also shows a shared run of someone whose track I may see (a counsellee's), which is not mine.
export async function myAvatarRuns(learningId: string): Promise<AvatarRunRow[]> {
  const me = (await supabase.auth.getSession()).data.session?.user.id;
  if (!me) return [];
  const { data, error } = await supabase.from('avatar_runs').select('id, learning_id, contribution_id, test, started_at, finished_at, turns')
    .eq('learning_id', learningId).eq('user_id', me).order('started_at', { ascending: false });
  fail(error);
  return (data || []) as AvatarRunRow[];
}
