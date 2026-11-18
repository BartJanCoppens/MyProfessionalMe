// Avatar practice runs in Supabase (studios plan, Task 6.2): a run is started by the learner (a practice by an author or reviewer, on a
// contribution, is a test and never counts), each line goes to the character through the `ai` function (the server holds the conversation and
// what the character keeps back), and the run ends once through finish_avatar_run.
import { runRow } from './runTarget';
import type { RunTarget } from './runTarget';
import { invokeFunction } from './aiStore';
import { supabase } from './supabase';

export type AvatarTurn = { who: 'learner' | 'character'; text: string; guard: string | null };
export type AvatarRunRow = { id: string; learning_id: string | null; contribution_id: string | null; test: boolean; started_at: string; finished_at: string | null; turns: AvatarTurn[] };
/** What the character answered: its line, the number of lines in the run so far, and whether a guard put in the substitute line. */
export type CharacterReply = { say: string; turn: number; held: boolean };

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export async function startAvatarRun(target: RunTarget): Promise<string> {
  const { data, error } = await supabase.from('avatar_runs').insert(runRow(target)).select('id').single();
  fail(error);
  return (data as { id: string }).id;
}

// Only the run and the learner's line are sent: the function reads the character, the earlier lines and what it keeps back for that run.
// A failure is thrown with the function's words; no scripted line stands in for the character.
export async function sayToCharacter(runId: string, say: string): Promise<CharacterReply> {
  const data = await invokeFunction<Partial<CharacterReply>>('ai', { use: 'avatar_conversation', run_id: runId, say });
  if (!data || typeof data.say !== 'string' || typeof data.turn !== 'number') throw new Error('The character did not answer · try again');
  return { say: data.say, turn: data.turn, held: data.held === true };
}

export async function endAvatarRun(runId: string): Promise<void> {
  const { error } = await supabase.rpc('finish_avatar_run', { p_run: runId });
  fail(error);
}

export async function myAvatarRuns(learningId: string): Promise<AvatarRunRow[]> {
  const { data, error } = await supabase.from('avatar_runs').select('id, learning_id, contribution_id, test, started_at, finished_at, turns')
    .eq('learning_id', learningId).order('started_at', { ascending: false });
  fail(error);
  return (data || []) as AvatarRunRow[];
}
