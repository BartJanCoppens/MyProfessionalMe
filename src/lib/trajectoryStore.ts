// Certification trajectories, enrolments and credentials, in Supabase. Rows are parsed at the boundary: a trajectory
// with malformed steps or maps is dropped with a console warning, never thrown. Learners write enrolments only through
// the RPCs below (request, withdraw, submit, submit_renewal); the counsellor decides through decide_trajectory and
// confirm_credential.
import type { Credential, Enrolment, StepEntry, Trajectory, TrjDecision, TrjMap, TrjStep } from '../logic/trajectory';
import { isObject } from '../logic/values';
import { inOrder } from './contentStore';
import { supabase } from './supabase';

export type TrajectoryDraft = Omit<Trajectory, 'id' | 'published_at'>;
export type ExternalCredential = { name: string; issuer: string; earned_on: string; expires_on: string | null; link: string; ref: string };
type TrajectoryRow = Omit<Trajectory, 'steps' | 'maps'> & { steps: unknown; maps: unknown };
type EnrolmentRow = { trajectory_id: string; status: Enrolment['status']; start_month: number; steps: unknown; asked_at: string | null; created_at: string | null };
type DecisionRow = { trajectory_id: string; step_id: string | null; decision: TrjDecision['decision']; comment: string | null; decided_by_name: string | null; decided_at: string };
type CredentialRow = Omit<Credential, 'link' | 'ref' | 'renewal_of' | 'superseded_at'> & { link: string | null; ref: string | null; renewal_of: string | null; superseded_at: string | null };
type Failure = { message: string; code?: string };

const TRAJECTORY_COLUMNS = 'id, name, issuer, credential, enrol, months, valid_months, renewal, cost, status, business_line, steps, maps, published_at';
const KINDS = ['learn', 'elect', 'evidence', 'check', 'exam'];
const stepOk = (s: unknown) => isObject(s) && typeof s.id === 'string' && s.id.trim() !== '' && typeof s.k === 'string' && KINDS.includes(s.k);
const mapOk = (m: unknown) => Array.isArray(m) && m.length === 3 && typeof m[0] === 'string' && typeof m[1] === 'string' && (m[2] === 'mandatory' || m[2] === 'advised');
const entryOk = (e: unknown) => isObject(e) && ['submitted', 'booked', 'done'].includes(e.state as string);

export function parseTrajectory(r: TrajectoryRow): Trajectory | null {
  if (!Array.isArray(r.steps) || !r.steps.every(stepOk) || !Array.isArray(r.maps) || !r.maps.every(mapOk)) {
    console.warn(`Trajectory ${r.id} dropped: its steps or maps are malformed`);
    return null;
  }
  return { ...r, steps: r.steps as TrjStep[], maps: r.maps as TrjMap[] };
}

function parseEnrolment(r: EnrolmentRow): Enrolment {
  const ok = isObject(r.steps) && Object.values(r.steps).every(entryOk);
  if (!ok) console.warn(`Enrolment on ${r.trajectory_id} has malformed steps; shown with none`);
  return { status: r.status, start_month: r.start_month, steps: ok ? r.steps as Record<string, StepEntry> : {}, asked_at: r.asked_at ?? null, created_at: r.created_at ?? null };
}

// Postgres errors to what a person can read. The RPCs raise their own 42501 messages ("A step is already signed off"),
// which are kept; a row-level-security refusal has no such message, so it gets the app's usual wording.
// duplicate: what a 23505 (the credential is already held) means for the caller.
const YOU_HOLD = 'You already hold this credential.';
function userMessage(error: Failure, duplicate = YOU_HOLD): string {
  if (error.code === '23505') return duplicate;
  if (error.code === '42501' && /row-level security|permission denied/.test(error.message)) return 'Not allowed · ask an admin';
  return error.message;
}
const failure = (error: Failure | null, duplicate?: string) => (error ? userMessage(error, duplicate) : null);
const fail = (error: Failure | null) => { if (error) throw new Error(userMessage(error)); };
const idNumber = (id: string) => Number(id.slice(1)) || 0;

export async function loadTrajectories(): Promise<Trajectory[]> {
  const { data, error } = await supabase.from('trajectories').select(TRAJECTORY_COLUMNS);
  fail(error);
  const parsed = ((data || []) as TrajectoryRow[]).map(parseTrajectory);
  return parsed.filter((t): t is Trajectory => !!t).sort((a, b) => idNumber(a.id) - idNumber(b.id));
}

export async function loadEnrolments(userId: string): Promise<Record<string, Enrolment>> {
  const { data, error } = await supabase.from('trajectory_enrolments').select('trajectory_id, status, start_month, steps, asked_at, created_at').eq('user_id', userId);
  fail(error);
  return Object.fromEntries(((data || []) as EnrolmentRow[]).map((r) => [r.trajectory_id, parseEnrolment(r)]));
}

// The person's trajectory decisions (approve and talk first), newest first.
export async function loadDecisions(userId: string): Promise<TrjDecision[]> {
  const { data, error } = await supabase.from('trajectory_decisions')
    .select('trajectory_id, step_id, decision, comment, decided_by_name, decided_at').eq('user_id', userId).order('decided_at', { ascending: false });
  fail(error);
  return ((data || []) as DecisionRow[]).map((r) => ({
    trajectoryId: r.trajectory_id, stepId: r.step_id, decision: r.decision, comment: r.comment ?? '', byName: r.decided_by_name ?? '', at: r.decided_at,
  }));
}

export async function loadCredentials(userId: string): Promise<Credential[]> {
  const { data, error } = await supabase.from('credentials')
    .select('id, user_id, name, issuer, earned_on, expires_on, link, ref, trajectory_id, status, renewal_of, superseded_at').eq('user_id', userId).order('earned_on', { ascending: false });
  fail(error);
  return ((data || []) as CredentialRow[]).map((r) => ({ ...r, link: r.link ?? '', ref: r.ref ?? '' }));
}

// A learner's own credential, waiting for the counsellor (only the columns the learner is granted).
export async function addExternalCredential(c: ExternalCredential): Promise<{ error: string | null }> {
  const { error } = await supabase.from('credentials').insert({
    name: c.name.trim(), issuer: c.issuer.trim(), earned_on: c.earned_on, expires_on: c.expires_on, link: c.link.trim() || null, ref: c.ref.trim() || null,
  });
  return { error: failure(error) };
}

// From 30 days before a confirmed credential's expiry (and after it): proof of renewal, waiting for the counsellor.
// expires: the new expiry of an external credential; null for a trajectory credential (set at confirmation).
export async function submitRenewal(credentialId: string, proof: { link: string; ref: string; expires: string | null }): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('submit_renewal', { p_credential: credentialId, p_link: proof.link.trim() || null, p_ref: proof.ref.trim() || null, p_expires: proof.expires || null });
  return { error: failure(error, 'A renewal of this credential is already waiting.') };
}

// The owner removes their own credential (or renewal) while it waits for the counsellor (a confirmed one stays).
export async function removeCredential(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('credentials').delete().eq('id', id).select('id');
  if (error) return { error: failure(error) };
  return { error: (data as unknown[] | null)?.length ? null : 'Not removed · only your own credential still waiting for your counsellor can be removed' };
}

const refused = 'Not saved · you can only change trajectories of your own business line';
export async function createTrajectory(draft: TrajectoryDraft): Promise<Trajectory> {
  const { data, error } = await supabase.from('trajectories').insert(draft).select(TRAJECTORY_COLUMNS).single();
  fail(error);
  const created = parseTrajectory(data as TrajectoryRow);
  if (!created) throw new Error(refused);
  return created;
}

export async function saveTrajectory(t: Trajectory) {
  const { id, published_at: _published, ...fields } = t;
  const { data, error } = await supabase.from('trajectories').update(fields).eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new Error(refused);
}

// Edits come in bursts. Each trajectory saves one write at a time, in order; a scheduled save reads the trajectory as it
// is when the timer fires, so the last edit wins. (Same scheme as saveBundleSoon; inOrder is shared, the timers are not.)
const timers = new Map<string, number>();
export function saveTrajectorySoon(id: string, latest: () => Trajectory | undefined, onError: (message: string) => void, wait = 600) {
  clearTimeout(timers.get(id));
  timers.set(id, window.setTimeout(() => { timers.delete(id); const t = latest(); if (t) inOrder(id, () => saveTrajectory(t)).catch((err) => onError((err as Error).message)); }, wait));
}
// A trajectory nobody enrolled on and no credential refers to (the database decides; see trajectory_in_use). A pending
// debounced save of it is cancelled first, and a write already running finishes before the delete, so it is never written back.
const notDeleted = 'Not deleted · people are enrolled or hold its credential · retire it instead';
export async function deleteTrajectory(id: string): Promise<{ error: string | null }> {
  clearTimeout(timers.get(id));
  timers.delete(id);
  let result: { error: string | null } = { error: null };
  await inOrder(id, async () => {
    const { data, error } = await supabase.from('trajectories').delete().eq('id', id).select('id');
    result = { error: error ? failure(error) : (data as unknown[] | null)?.length ? null : notDeleted };
  });
  return result;
}
// The ids (of those this admin can read) that are in use, so the editor offers Delete only on the others.
export async function loadTrajectoriesInUse(): Promise<string[]> {
  const { data, error } = await supabase.rpc('trajectories_in_use');
  fail(error);
  return (data || []) as string[];
}
export function saveTrajectoryNow(t: Trajectory, onError: (message: string) => void) {
  inOrder(t.id, () => saveTrajectory(t)).catch((err) => onError((err as Error).message));
}

// Learner actions. The database checks every rule; a refusal comes back as `error`, never thrown.
export async function requestTrajectory(trajectoryId: string): Promise<{ status: Enrolment['status'] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('request_trajectory', { p_trajectory: trajectoryId });
  return { status: error ? null : data as Enrolment['status'], error: failure(error) };
}
export async function withdrawTrajectory(trajectoryId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('withdraw_trajectory', { p_trajectory: trajectoryId });
  return { error: failure(error) };
}
export async function submitTrajectoryStep(trajectoryId: string, stepId: string, state: 'submitted' | 'booked', proof: { link?: string; ref?: string; note?: string } = {}): Promise<{ state: 'submitted' | 'booked' | null; error: string | null }> {
  const { data, error } = await supabase.rpc('submit_trajectory_step', {
    p_trajectory: trajectoryId, p_step: stepId, p_state: state, p_link: proof.link || null, p_ref: proof.ref || null, p_note: proof.note || null,
  });
  return { state: error ? null : data as 'submitted' | 'booked', error: failure(error) };
}

// Counsellor or managing admin. step null: the start request. Result: 'enrolled', 'done' or 'talk'. comment: needed for
// 'talk' (COMMENT_MIN to COMMENT_MAX characters, checked by the database), optional for 'approve'. who: the person's
// first name, for the message when they already hold a valid credential from this trajectory.
export async function decideTrajectory(userId: string, trajectoryId: string, stepId: string | null, decision: 'approve' | 'talk', comment: string | null = null, who = 'This person'): Promise<{ result: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('decide_trajectory', { p_user: userId, p_trajectory: trajectoryId, p_step: stepId, p_decision: decision, p_comment: comment });
  return { result: error || data == null ? null : String(data), error: failure(error, who + ' already holds a valid credential from this trajectory.') };
}
export async function confirmCredential(credentialId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('confirm_credential', { p_id: credentialId });
  return { error: failure(error) };
}
