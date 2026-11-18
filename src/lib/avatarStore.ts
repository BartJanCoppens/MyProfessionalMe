// Avatar practice runs in Supabase (studios plan, Task 6.2): a run is started by the learner (a practice by an author or reviewer, on a
// contribution, is a test and never counts), each line goes to the character through the `ai` function (the server holds the conversation and
// what the character keeps back), and the run ends once through finish_avatar_run.
import type { GuardCode } from '../../supabase/functions/_shared/avatarGuard.ts';
import { runRow } from './runTarget';
import type { RunTarget } from './runTarget';
import { completeOrThrow } from './ai';
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

// Mine only: the read policy also shows a shared run of someone whose track I may see (a counsellee's), which is not mine.
export async function myAvatarRuns(learningId: string): Promise<AvatarRunRow[]> {
  const me = (await supabase.auth.getSession()).data.session?.user.id;
  if (!me) return [];
  const { data, error } = await supabase.from('avatar_runs').select('id, learning_id, contribution_id, test, started_at, finished_at, turns')
    .eq('learning_id', learningId).eq('user_id', me).order('started_at', { ascending: false });
  fail(error);
  return (data || []) as AvatarRunRow[];
}
