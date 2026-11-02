// Per-user learner data in Supabase (learner_learnings, ambitions, interests, learner_prefs, learning_decisions, project_evaluations,
// personality_tests).
// RLS lets the person write their own rows; admins and counsellors may only read them. Decisions are written by
// public.decide_learning() and public.register_attendance() (recordStore) and by the database when a learning completes itself.
import { supabase } from './supabase';
import type { LearnState, Progress } from '../logic/learner';
import type { Decision, Verdict } from '../logic/record';
import type { Ambition, Interest, Project, Test } from '../types';

// decisions: the acceptance record (F2), every decision on this person's learnings.
// projects: engagements and their evaluations (read like the formal track); tests: personality results (the person only).
export type LearnerData = { progress: Progress; ambitions: Ambition[]; interests: Interest[]; prefs: { initials: string; color: string }; decisions?: Decision[];
  projects?: Project[]; tests?: Test[] };

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export async function loadLearner(userId: string): Promise<LearnerData> {
  const [l, a, i, p, d, pe, pt] = await Promise.all([
    supabase.from('learner_learnings').select('learning_id, state, pct, chosen, submitted_at, updated_at, evidence_note, evidence_link, evidence_ref, evidence_rating').eq('user_id', userId),
    supabase.from('ambitions').select('id, text, horizon, domains, source').eq('user_id', userId).order('created_at'),
    supabase.from('interests').select('label, domain').eq('user_id', userId).order('created_at'),
    supabase.from('learner_prefs').select('avatar_initials, avatar_color').eq('user_id', userId).maybeSingle(),
    supabase.from('learning_decisions').select('learning_id, verdict, comment, decided_by, decided_by_name, decided_at, evidence').eq('user_id', userId).order('decided_at'),
    supabase.from('project_evaluations').select('id, client, name, role, period, hours, lead, evaluator, eval_date, overall, summary, dims, quote, advice').eq('user_id', userId).order('id'),
    supabase.from('personality_tests').select('id, name, provider, taken, headline, unit, bars, reading, sugg').eq('user_id', userId).order('id'),
  ]);
  [l.error, a.error, i.error, p.error, d.error, pe.error, pt.error].forEach(fail);
  const progress: Progress = {};
  (l.data || []).forEach((r) => {
    progress[r.learning_id] = { state: r.state as LearnState, pct: r.pct, chosen: r.chosen, submittedAt: r.submitted_at ?? null, updatedAt: r.updated_at ?? null,
      evidence: { note: r.evidence_note || '', link: r.evidence_link || '', ref: r.evidence_ref || '' }, rating: r.evidence_rating ?? null };
  });
  return {
    progress,
    ambitions: (a.data || []).map((r) => ({ id: String(r.id), text: r.text, horizon: r.horizon || '', doms: r.domains || [], from: r.source || '' })),
    interests: (i.data || []).map((r) => ({ label: r.label, dom: r.domain })),
    prefs: { initials: p.data?.avatar_initials || '', color: p.data?.avatar_color || '' },
    decisions: (d.data || []).map((r) => ({
      learningId: r.learning_id, verdict: r.verdict as Verdict, comment: r.comment || '', by: r.decided_by ?? null, byName: r.decided_by_name || '', at: r.decided_at,
      evidence: { note: r.evidence?.note || '', link: r.evidence?.link || '', ref: r.evidence?.ref || '' }, rating: r.evidence?.rating ?? null,
    })),
    projects: (pe.data || []).map((r) => ({
      id: 'P' + r.id, client: r.client, name: r.name, role: r.role, period: r.period, hours: r.hours, lead: r.lead, evaluator: r.evaluator, evalDate: r.eval_date || '',
      overall: r.overall || '', summary: r.summary || '', dims: r.dims ?? null, quote: r.quote || '', advice: r.advice || [],
    })),
    tests: (pt.data || []).map((r) => ({ id: 'T' + r.id, name: r.name, provider: r.provider, date: r.taken, headline: r.headline, unit: r.unit, bars: r.bars || [], reading: r.reading || '', sugg: r.sugg || [] })),
  };
}

// Atomic insert-or-update of your own progress row (save_learning); only the given fields change. Evidence fields are
// sent only when given ('' clears one); the database checks the format's evidence rule when the state is submitted, and a
// classroom's feedback (note and rating) when the learner completes it.
export async function saveProgress(_userId: string, learningId: string, patch: Partial<{ state: LearnState; pct: number; chosen: boolean; note: string; link: string; ref: string; rating: number }>) {
  fail((await supabase.rpc('save_learning', {
    p_learning_id: learningId, p_state: patch.state ?? null, p_pct: patch.pct ?? null, p_chosen: patch.chosen ?? null,
    ...(patch.note !== undefined && { p_note: patch.note }), ...(patch.link !== undefined && { p_link: patch.link }), ...(patch.ref !== undefined && { p_ref: patch.ref }),
    ...(patch.rating !== undefined && { p_rating: patch.rating }),
  })).error);
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

// Every profile has a learner_prefs row (created with the account), so this is a plain update.
export async function savePrefs(userId: string, prefs: { initials?: string; color?: string }) {
  const row = { ...(prefs.initials !== undefined && { avatar_initials: prefs.initials }), ...(prefs.color !== undefined && { avatar_color: prefs.color }) };
  fail((await supabase.from('learner_prefs').update(row).eq('user_id', userId)).error);
}
