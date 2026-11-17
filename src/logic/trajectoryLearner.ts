// The learner's side of a trajectory: who counts as enrolled, when a person may leave, which action a step offers and how
// a credential looks in the wallet. Pure rules; withdraw mirrors withdraw_trajectory in the migration.
import { autoEnrolled, inMandatoryAudience, monthLabel, startMonth } from './trajectory';
import type { AudiencePerson as Person, Credential, Enrolment, StepKind, StepState, Trajectory, TrjDecision } from './trajectory';

// The subject's trajectory data: enrolments, credentials, industry and technology memberships, and the decisions on them.
export type TrjMine = { userId: string; enrols: Record<string, Enrolment>; creds: Credential[]; audiences: string[]; decisions: TrjDecision[] };

// The stored row, or (a mandatory auto-enrolment) an enrolment that has no row until the person's first action.
export function effectiveEnrolment(t: Trajectory, row: Enrolment | undefined, person: Person, now: Date): Enrolment | null {
  if (row) return row;
  return autoEnrolled(t, person) ? { status: 'enrolled', start_month: startMonth(t, true, now), steps: {} } : null;
}

// A request, or an enrolment with no signed-off step; never a mandatory auto-enrolment.
export function canWithdraw(t: Trajectory, row: Enrolment | undefined, person: Person): boolean {
  return !!row && !inMandatoryAudience(t, person) && (row.status === 'requested' || !Object.values(row.steps).some((e) => e.state === 'done'));
}

// The counsellor's latest "talk first" comment on a step (stepId) or the start request (null), as "<first name>: <comment>",
// while it still applies: the latest decision on it is a talk and, for a step, it is not sent again (submitted) or signed
// off; for the start request, the request still waits and was made before the talk. Step submissions carry no time, so a
// step's comment shows until its state changes to submitted or done. '' when nothing applies.
export function talkNote(decisions: TrjDecision[], trajectoryId: string, stepId: string | null, e: Enrolment | null): string {
  const last = decisions.filter((d) => d.trajectoryId === trajectoryId && d.stepId === stepId).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  if (!e || !last || last.decision !== 'talk' || !last.comment) return '';
  if (stepId === null ? e.status !== 'requested' || (!!e.asked_at && Date.parse(e.asked_at) > Date.parse(last.at)) : ['submitted', 'done'].includes(e.steps[stepId]?.state ?? '')) return '';
  return (last.byName.trim().split(/\s+/)[0] || 'Your counsellor') + ': ' + last.comment;
}

export type StepAction = 'open' | 'evidence' | 'signoff' | 'book' | 'result';
// What an unlocked step of an enrolled learner offers. A submitted step is frozen: the counsellor decides on what they saw.
export function stepAction(kind: StepKind, state: StepState): StepAction | null {
  if (state === 'done' || state === 'submitted') return null;
  if (kind === 'learn') return 'open';
  if (kind === 'evidence') return state === 'open' ? 'evidence' : null;
  if (kind === 'check') return state === 'open' ? 'signoff' : null;
  if (kind === 'exam') return state === 'booked' ? 'result' : 'book';
  return null;
}

export const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return d + ' ' + monthLabel(y * 12 + m - 1);
};
const dayNumber = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

export type CredentialLook = { status: 'accepted' | 'clarification' | 'submitted' | 'not-started'; label: string };
// Valid, to renew (expires within 30 days of today), expired, or an external one still waiting for the counsellor.
export function credentialLook(c: Credential, now: Date, counsellor: string): CredentialLook {
  if (c.status === 'waiting') return { status: 'submitted', label: 'Waiting for ' + counsellor };
  if (!c.expires_on) return { status: 'accepted', label: 'Valid' };
  const left = dayNumber(c.expires_on) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000;
  if (left < 0) return { status: 'not-started', label: 'Expired ' + dayLabel(c.expires_on) };
  return left <= 30 ? { status: 'clarification', label: 'Renew by ' + dayLabel(c.expires_on) } : { status: 'accepted', label: 'Valid' };
}
