// Certification trajectories: totals, progress, relevance, auto-enrolment, start month, credential expiry and the
// proof rule for a submitted step. Pure rules. They mirror the database (supabase/migrations/*_trajectories.sql);
// trajectory.sync.test.ts checks the proof rule against the migration. Months are UTC, year * 12 + month index.
import { BLS } from '../data';
import type { LearnState } from './learner';
import { MEMBERSHIP_PATTERN } from './membership';

export type StepKind = 'learn' | 'elect' | 'evidence' | 'check' | 'exam';
export type TrjStep = { id: string; k: StepKind; lid?: string; opts?: string[]; pick?: number; title?: string; hours?: number; win: number; req: boolean; pre: string | null };
// [audience, career stage, obligation]. Audience: a business line, or ind:/tec:/amb:/pro:<key>.
export type TrjMap = [string, string, 'mandatory' | 'advised'];
export type Trajectory = {
  id: string; name: string; issuer: string; credential: string; enrol: 'auto' | 'open' | 'approval'; months: number; valid_months: number | null;
  renewal: string; cost: string; status: 'draft' | 'live' | 'retired'; business_line: string | null; steps: TrjStep[]; maps: TrjMap[]; published_at: string | null;
};
export type StepEntry = { state: 'submitted' | 'booked' | 'done'; link?: string; ref?: string; note?: string };
// asked_at: when a start request was made (null when none was needed); absent where a test or an auto-enrolment has none.
export type Enrolment = { status: 'requested' | 'enrolled'; start_month: number; steps: Record<string, StepEntry>; asked_at?: string | null };
// One decide_trajectory decision (trajectory_decisions). stepId null: the start request. comment '' when none was given.
export type TrjDecision = { trajectoryId: string; stepId: string | null; decision: 'approve' | 'talk'; comment: string; byName: string; at: string };
export type Credential = {
  id: string; user_id: string; name: string; issuer: string; earned_on: string; expires_on: string | null; link: string; ref: string;
  trajectory_id: string | null; status: 'waiting' | 'confirmed';
};
// What a step needs to know about a library learning (an Item has these fields).
export type LearningRef = { hours: number; cpd: number; state: LearnState; pct: number };
type Library = Record<string, LearningRef | undefined>;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const cheapest = (values: number[], n: number) => sum(values.slice().sort((a, b) => a - b).slice(0, n));
const pickOf = (st: TrjStep) => st.pick || 1;
const isRequired = (st: TrjStep) => st.req || st.k === 'exam';

// Study hours of a step: a learning's hours, an elect step's cheapest `pick` options, else the step's own hours.
export function stepHours(st: TrjStep, byId: Library): number {
  if (st.k === 'learn') return byId[st.lid ?? '']?.hours ?? 0;
  if (st.k === 'elect') return cheapest((st.opts || []).map((id) => byId[id]?.hours ?? 0), pickOf(st));
  return st.hours || 0;
}
export function stepCpd(st: TrjStep, byId: Library): number {
  if (st.k === 'learn') return byId[st.lid ?? '']?.cpd ?? 0;
  if (st.k === 'elect') return cheapest((st.opts || []).map((id) => byId[id]?.cpd ?? 0), pickOf(st));
  return 0;
}

// perYear: hours by the year of each step's window (month 1-12 is year 1; later years fold into year 3).
export function totals(t: Trajectory, byId: Library): { tot: number; cpd: number; req: number; perYear: [number, number, number] } {
  const perYear: [number, number, number] = [0, 0, 0];
  let tot = 0, cpd = 0, req = 0;
  for (const st of t.steps) {
    const h = stepHours(st, byId);
    tot += h; cpd += stepCpd(st, byId);
    if (isRequired(st)) req++;
    perYear[Math.min(2, Math.floor(Math.max(0, (st.win || 1) - 1) / 12))] += h;
  }
  return { tot, cpd, req, perYear };
}

export type StepState = 'open' | 'progress' | 'submitted' | 'booked' | 'done';
export type StepProgress = { id: string; state: StepState; pct: number; locked: boolean; missing: boolean };
type Raw = { state: StepState; pct: number; missing: boolean };

function learnState(it: LearningRef | undefined): Raw {
  if (!it) return { state: 'open', pct: 0, missing: true };
  if (it.state === 'accepted') return { state: 'done', pct: 100, missing: false };
  if (it.state === 'submitted') return { state: 'submitted', pct: 100, missing: false };
  return it.state === 'in-progress' ? { state: 'progress', pct: it.pct, missing: false } : { state: 'open', pct: 0, missing: false };
}
function electState(st: TrjStep, byId: Library): Raw {
  const items = (st.opts || []).map((id) => byId[id]);
  const accepted = items.filter((it) => it?.state === 'accepted').length;
  const started = items.some((it) => it && (it.state === 'in-progress' || it.state === 'submitted'));
  const missing = items.filter(Boolean).length < pickOf(st);
  const state: StepState = accepted >= pickOf(st) ? 'done' : accepted || started ? 'progress' : 'open';
  return { state, pct: 0, missing };
}
function rawState(st: TrjStep, e: Enrolment | null, byId: Library): Raw {
  if (st.k === 'learn') return learnState(byId[st.lid ?? '']);
  if (st.k === 'elect') return electState(st, byId);
  return { state: e?.steps[st.id]?.state ?? 'open', pct: 0, missing: false };
}

// Progress by step id (so moving or removing steps never shifts anyone's state). A learn step is done only when the
// learning is accepted. A step is locked until its prerequisite is done; a missing optional prerequisite blocks nothing.
// next: index of the first step that is not done, not locked and not missing, or -1.
export function trajectoryProgress(t: Trajectory, e: Enrolment | null, byId: Library) {
  const raw = new Map(t.steps.map((st) => [st.id, rawState(st, e, byId)]));
  const steps: StepProgress[] = t.steps.map((st) => {
    const r = raw.get(st.id)!, pre = st.pre ? raw.get(st.pre) : undefined;
    const preOptionalMissing = !!pre && pre.missing && !isRequired(t.steps.find((x) => x.id === st.pre)!);
    return { id: st.id, state: r.state, pct: r.pct, missing: r.missing, locked: r.state !== 'done' && !!pre && pre.state !== 'done' && !preOptionalMissing };
  });
  const required = t.steps.map((st, i) => (isRequired(st) ? i : -1)).filter((i) => i >= 0);
  const reqDone = required.filter((i) => steps[i].state === 'done').length;
  return {
    steps, reqN: required.length, reqDone, complete: required.length > 0 && reqDone === required.length,
    next: steps.findIndex((s) => s.state !== 'done' && !s.locked && !s.missing),
  };
}

// Among the maps for the person's audience keys (line and memberships): a mandatory one at their stage, so a bound
// person is told why, else any at their stage. None without a stage.
export function mapAtStage(t: Trajectory, keys: string[], stage: string | null | undefined): TrjMap | undefined {
  const mine = t.maps.filter((m) => keys.includes(m[0]) && stage != null && m[1] === stage);
  return mine.find((m) => m[2] === 'mandatory') ?? mine[0];
}
// The map that explains why a trajectory concerns the person: mapAtStage, else any map for one of their keys.
export function relevantMap(t: Trajectory, keys: string[], stage?: string | null): TrjMap | undefined {
  return mapAtStage(t, keys, stage) ?? t.maps.find((m) => keys.includes(m[0]));
}

// A person as the mandatory rule sees them: business line, career stage and industry and technology memberships.
export type AudiencePerson = { line: string | null; stage: string | null; audiences: string[] };
// Mirror of private.trajectory_maps_ok: business-line, ind: and tec: maps may be mandatory; amb: and pro: only advise.
export const canBeMandatory = (aud: string): boolean => BLS.includes(aud) || MEMBERSHIP_PATTERN.test(aud);
// Mirror of private.in_mandatory_audience on an auto trajectory, whatever its status: such a person cannot withdraw.
// A mandatory map at their stage binds them when its audience is their business line or one of their memberships.
export function inMandatoryAudience(t: Trajectory, person: AudiencePerson): boolean {
  return t.enrol === 'auto' && !!person.stage
    && t.maps.some((m) => m[2] === 'mandatory' && m[1] === person.stage && ((!!person.line && m[0] === person.line) || person.audiences.includes(m[0])));
}
// The trajectory binds this person while it is live (the row is written at their first action).
export const autoEnrolled = (t: Trajectory, person: AudiencePerson): boolean => t.status === 'live' && inMandatoryAudience(t, person);

export const monthOf = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
// Mandatory auto-enrolment starts in the publication month (now when unpublished); everything else starts now.
export function startMonth(t: Trajectory, mandatoryAuto: boolean, now: Date): number {
  return mandatoryAuto && t.published_at ? monthOf(new Date(t.published_at)) : monthOf(now);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (n: number) => MONTHS[((n % 12) + 12) % 12] + ' ' + Math.floor(n / 12);
export const credentialExpiry = (earnedMonth: number, validMonths: number | null): number | null => (validMonths == null ? null : earnedMonth + validMonths);

// Proof for a submitted step, as submit_trajectory_step checks it: an exam needs a certificate link or number,
// evidence a link or a note, a check nothing; a link must be http(s); lengths are capped. null when fine.
export const PROOF_LIMITS = { link: 500, ref: 80, note: 2000 };
export function stepProofProblem(kind: 'evidence' | 'check' | 'exam', proof: { link?: string; ref?: string; note?: string }): string | null {
  const link = (proof.link ?? '').trim(), ref = (proof.ref ?? '').trim(), note = (proof.note ?? '').trim();
  if (link && (link.length > PROOF_LIMITS.link || !/^https?:\/\/\S+$/.test(link))) return 'The link must start with http:// or https://';
  if (ref.length > PROOF_LIMITS.ref || note.length > PROOF_LIMITS.note) return 'The certificate number or the note is too long';
  if (kind === 'exam' && !link && !ref) return 'Add the certificate link or number';
  if (kind === 'evidence' && !link && !note) return 'Add a link to the evidence or a note';
  return null;
}
