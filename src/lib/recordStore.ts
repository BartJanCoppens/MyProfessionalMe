// Decisions on submitted learnings and the approvals queue (F2, F3), in Supabase.
// public.decide_learning() is the only way to accept or request changes: it checks who may decide (the counsellor, a
// managing Domain Admin, a General or System Admin; never the person) and records the decision. waiting_submissions()
// returns what waits for the signed-in person under their row-level security.
import { supabase } from './supabase';
import type { Evidence } from '../logic/record';

const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

// Returns the learning's new state: 'accepted', or 'in-progress' after a request for changes.
export async function decideLearning(userId: string, learningId: string, verdict: 'accepted' | 'changes', comment = ''): Promise<string> {
  const { data, error } = await supabase.rpc('decide_learning', { p_user_id: userId, p_learning_id: learningId, p_verdict: verdict, p_comment: comment.trim() || null });
  fail(error);
  return String(data);
}

export type QueueRow = { userId: string; name: string; line: string | null; learningId: string; submittedAt: string | null; evidence: Evidence; lastActivity: string | null };

type Row = { user_id: string; name: string; business_line: string | null; learning_id: string; submitted_at: string | null; evidence_note: string | null; evidence_link: string | null; evidence_ref: string | null; last_activity: string | null };

export async function loadQueue(): Promise<QueueRow[]> {
  const { data, error } = await supabase.rpc('waiting_submissions');
  fail(error);
  return ((data || []) as Row[]).map((r) => ({
    userId: r.user_id, name: r.name, line: r.business_line, learningId: r.learning_id, submittedAt: r.submitted_at,
    evidence: { note: r.evidence_note || '', link: r.evidence_link || '', ref: r.evidence_ref || '' }, lastActivity: r.last_activity,
  }));
}
