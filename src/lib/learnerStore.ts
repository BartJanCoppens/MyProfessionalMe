// Per-user learner data in Supabase (learner_learnings, ambitions, interests, learner_prefs).
// RLS lets the person write their own rows; admins and counsellors may only read them.
import { supabase } from './supabase';
import type { LearnState, Progress } from '../logic/learner';
import type { Ambition, Interest } from '../types';

export type LearnerData = { progress: Progress; ambitions: Ambition[]; interests: Interest[]; prefs: { initials: string; color: string } };

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export async function loadLearner(userId: string): Promise<LearnerData> {
  const [l, a, i, p] = await Promise.all([
    supabase.from('learner_learnings').select('learning_id, state, pct, chosen').eq('user_id', userId),
    supabase.from('ambitions').select('id, text, horizon, domains, source').eq('user_id', userId).order('created_at'),
    supabase.from('interests').select('label, domain').eq('user_id', userId).order('created_at'),
    supabase.from('learner_prefs').select('avatar_initials, avatar_color').eq('user_id', userId).maybeSingle(),
  ]);
  [l.error, a.error, i.error, p.error].forEach(fail);
  const progress: Progress = {};
  (l.data || []).forEach((r) => { progress[r.learning_id] = { state: r.state as LearnState, pct: r.pct, chosen: r.chosen }; });
  return {
    progress,
    ambitions: (a.data || []).map((r) => ({ id: String(r.id), text: r.text, horizon: r.horizon || '', doms: r.domains || [], from: r.source || '' })),
    interests: (i.data || []).map((r) => ({ label: r.label, dom: r.domain })),
    prefs: { initials: p.data?.avatar_initials || '', color: p.data?.avatar_color || '' },
  };
}

// Update the row if it exists, otherwise insert it (the update grant excludes the key columns, so no upsert).
export async function saveProgress(userId: string, learningId: string, patch: Partial<{ state: LearnState; pct: number; chosen: boolean }>) {
  const { data, error } = await supabase.from('learner_learnings').update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('learning_id', learningId).select('learning_id');
  fail(error);
  if (data && data.length) return;
  const ins = await supabase.from('learner_learnings').insert({ user_id: userId, learning_id: learningId, ...patch });
  fail(ins.error);
}

export async function addAmbition(userId: string, a: Omit<Ambition, 'id'>): Promise<Ambition> {
  const { data, error } = await supabase.from('ambitions').insert({ user_id: userId, text: a.text, horizon: a.horizon, domains: a.doms, source: a.from })
    .select('id').single();
  fail(error);
  return { ...a, id: String(data!.id) };
}

export async function removeAmbition(id: string) {
  fail((await supabase.from('ambitions').delete().eq('id', Number(id))).error);
}

export async function addInterest(userId: string, i: Interest) {
  fail((await supabase.from('interests').insert({ user_id: userId, label: i.label, domain: i.dom })).error);
}

export async function removeInterest(userId: string, label: string) {
  fail((await supabase.from('interests').delete().eq('user_id', userId).eq('label', label)).error);
}

export async function savePrefs(userId: string, prefs: { initials?: string; color?: string }) {
  const row = { ...(prefs.initials !== undefined && { avatar_initials: prefs.initials }), ...(prefs.color !== undefined && { avatar_color: prefs.color }) };
  const { data, error } = await supabase.from('learner_prefs').update(row).eq('user_id', userId).select('user_id');
  fail(error);
  if (data && data.length) return;
  fail((await supabase.from('learner_prefs').insert({ user_id: userId, ...row })).error);
}
