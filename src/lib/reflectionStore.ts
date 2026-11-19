// The learner's reflections in a course (E-learning Studio, Task 1.5), in Supabase: a private table only the learner reads or writes (see
// 20261119110000_course_reflections.sql). Typing comes in bursts, so a save waits for a quiet moment (saveSoon, the last text wins); a blank text deletes the row.
import { cancelSoon, saveSoon } from './saveSoon';
import { supabase } from './supabase';

export const REFLECTION_MAX = 2000;

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

// This person's reflections in one course, by block id.
export async function loadReflections(learningId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('course_reflections').select('block_id, text').eq('learning_id', learningId);
  fail(error);
  return Object.fromEntries(((data || []) as { block_id: string; text: string }[]).map((r) => [r.block_id, r.text]));
}

// An upsert of the three granted columns (the database stamps who and when); `onSaved` runs once the write succeeded.
const write = (learningId: string, blockId: string, text: string) => async () => {
  const { error } = text.trim()
    ? await supabase.from('course_reflections').upsert({ learning_id: learningId, block_id: blockId, text }, { onConflict: 'user_id,learning_id,block_id' })
    : await supabase.from('course_reflections').delete().eq('learning_id', learningId).eq('block_id', blockId);
  fail(error);
};

const pending = new Set<string>();

// `forUser`: who made the edit. If another person is signed in when the timer fires (an account switch within the wait), nothing is written.
export function saveReflectionSoon(learningId: string, blockId: string, text: string, onError: (message: string) => void, wait = 800, onSaved: () => void = () => {}, forUser?: string) {
  const save = write(learningId, blockId, text), key = 'reflection:' + learningId + '|' + blockId;
  pending.add(key);
  saveSoon(key, () => text, async () => {
    if (forUser && (await supabase.auth.getSession()).data.session?.user.id !== forUser) return;
    await save();
    onSaved();
  }, onError, wait);
}

// Drops every save still waiting (the workspace closes on sign-out).
export function cancelReflections() { pending.forEach(cancelSoon); pending.clear(); }
