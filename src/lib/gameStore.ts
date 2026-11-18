// Game runs in Supabase (studios plan, Task 4.3): a run is started by the player (a play-test by an author or reviewer, on a
// contribution), finished once through finish_game_run (the server clock and the score), and read back as the leaderboard, a
// definer function with first names and initials only, and the player's own best. Nothing reads another person's raw runs.
import type { LeaderRow } from '../game/protocol';
import type { GameReviewStatus } from '../logic/gameContent';
import { runRow } from './runTarget';
import type { RunTarget } from './runTarget';
import { supabase } from './supabase';

export type Best = { score: number; seconds: number };

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

// A play-test (a contribution) is marked test; a test never counts.
export async function startRun(target: RunTarget): Promise<string> {
  const { data, error } = await supabase.from('game_runs').insert(runRow(target)).select('id').single();
  fail(error);
  return (data as { id: string }).id;
}

// The server's house-rules verdict on a Game contribution (author or assigned reviewer), for the files and texts as they are now; null when none.
export async function loadGameReview(contributionId: string): Promise<GameReviewStatus | null> {
  const { data, error } = await supabase.rpc('game_review_status', { p_contribution: contributionId });
  fail(error);
  return (data as GameReviewStatus | null) ?? null;
}

export async function finishRun(runId: string, score: number): Promise<void> {
  const { error } = await supabase.rpc('finish_game_run', { p_run: runId, p_score: score });
  fail(error);
}

export async function leaderboard(learningId: string): Promise<LeaderRow[]> {
  const { data, error } = await supabase.rpc('game_leaderboard', { p_learning: learningId });
  fail(error);
  return ((data || []) as LeaderRow[]).map((r) => ({ rank: r.rank, name: r.name, score: r.score, seconds: r.seconds }));
}

export async function myBest(learningId: string): Promise<Best | null> {
  const { data, error } = await supabase.from('game_runs').select('score, seconds').eq('learning_id', learningId).eq('test', false)
    .not('finished_at', 'is', null).order('score', { ascending: false }).order('seconds', { ascending: true }).limit(1).maybeSingle();
  fail(error);
  const row = data as Best | null;
  return row ? { score: row.score, seconds: row.seconds } : null;
}
