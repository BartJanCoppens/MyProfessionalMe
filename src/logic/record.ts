// The learning record (F2) and the approvals queue (F3): evidence rules per format, decisions, waiting time and last
// activity. Pure functions; the database enforces the same rules (private.evidence_rule, private.evidence_ok).
import { fmtDate } from './contribution';

// What a format needs before it may be submitted. Mirrors private.evidence_rule(); change both together.
export type EvidenceRule = 'none' | 'reflection' | 'certificate';
export const REFLECTION_MIN = 140;
export const COMMENT_MIN = 10;
export const COMMENT_MAX = 500;
export const CERTIFICATE_FORMATS = ['Certification'];
export const REFLECTION_FORMATS = ['Book', 'Website', 'Mentoring', 'Coaching', 'Game', 'Micro-guide', 'Case write-up'];

export function evidenceRule(format: string): EvidenceRule {
  return CERTIFICATE_FORMATS.includes(format) ? 'certificate' : REFLECTION_FORMATS.includes(format) ? 'reflection' : 'none';
}

// How a format completes (owner's rules, 2 Nov 2026). Every format listed here completes itself, without a counsellor
// (private.is_self_complete); the rest go to the counsellor or an admin for acceptance. 'feedback' is
// private.completion_rule(): the database refuses a learner's completion without it. record.sync.test.ts compares these
// lists with the latest migration.
//   media: a podcast at 80% listened, a reel on a right answer · mark: the learner marks it completed
//   feedback: the learner's feedback, or the faculty registers attendance · quiz: three right answers after the practice session
export type Completion = 'acceptance' | 'media' | 'mark' | 'feedback' | 'quiz';
export const COMPLETION: Record<string, Exclude<Completion, 'acceptance'>> = { Podcast: 'media', Reel: 'media', 'E-learning': 'mark', Classroom: 'feedback', Avatar: 'quiz' };
export const SELF_COMPLETE = Object.keys(COMPLETION);
export const completionOf = (format: string): Completion => COMPLETION[format] || 'acceptance';
export const selfCompletes = (format: string) => completionOf(format) !== 'acceptance';

// The classroom feedback form: a rating from 1 to 5 and what the learner will apply.
export const FEEDBACK_MIN = 40;
export function feedbackProblem(rating: number | null | undefined, text: string): string | null {
  if (!rating || rating < 1 || rating > 5) return 'Rate the session from 1 to 5';
  const n = text.trim().length;
  if (n < FEEDBACK_MIN) return 'Say what you will apply (at least ' + FEEDBACK_MIN + ' characters)';
  if (n > 2000) return 'Keep it to 2000 characters';
  return null;
}

// What completes this format, in the learner's words (detail sidebar and help). accepter: the counsellor's full name.
export function completionText(format: string, accepter: string): string {
  const f = format.toLowerCase();
  switch (completionOf(format)) {
    case 'media': return format === 'Podcast' ? 'Listening to 80% completes it. It counts right away; no acceptance needed.' : 'A right answer to the question completes it. It counts right away; no acceptance needed.';
    case 'mark': return 'Mark it as completed when you have finished the course. It counts right away; no acceptance needed.';
    case 'feedback': return 'It completes when the faculty registers your attendance, or when you give your feedback on the session. No acceptance needed.';
    case 'quiz': return 'After your practice session, three right answers in the evaluation quiz complete it. No acceptance needed.';
    default: return evidenceRule(format) === 'none' ? 'Log your hours, then ' + accepter + ' accepts the ' + f + '.' : 'Log your hours and add your evidence; ' + accepter + ' accepts the ' + f + '.';
  }
}
// What a self-completing format still needs once all hours are logged, for the toast and the state label.
export function completionTodo(format: string): string {
  switch (completionOf(format)) {
    case 'mark': return 'mark it as completed';
    case 'feedback': return 'give your feedback';
    case 'quiz': return 'take the evaluation quiz';
    case 'media': return format === 'Podcast' ? 'listen to it' : 'answer the question';
    default: return '';
  }
}

export type Evidence = { note: string; link: string; ref: string };
export const NO_EVIDENCE: Evidence = { note: '', link: '', ref: '' };
export const hasEvidence = (e: Evidence) => !!(e.note.trim() || e.link.trim() || e.ref.trim());
export const sameEvidence = (a: Evidence, b: Evidence) => a.note.trim() === b.note.trim() && a.link.trim() === b.link.trim() && a.ref.trim() === b.ref.trim();

// Matches the evidence_link check: a web address without spaces, at most 500 characters.
export function linkProblem(link: string): string | null {
  const l = link.trim();
  if (!l) return null;
  return /^https?:\/\/\S+$/.test(l) && l.length <= 500 ? null : 'The link must be a web address starting with https://';
}

// Field checks that apply whenever evidence is saved (the database's column checks).
export function fieldProblem(e: Evidence): string | null {
  const bad = linkProblem(e.link); if (bad) return bad;
  if (e.note.trim().length > 2000) return 'Keep the reflection to 2000 characters';
  if (e.ref.trim().length > 80) return 'Keep the certificate number to 80 characters';
  return null;
}
// What the format still needs before it may be submitted, or null when its rule is met.
export function evidenceNeed(format: string, e: Evidence): string | null {
  const rule = evidenceRule(format);
  if (rule === 'certificate' && !e.link.trim() && !e.ref.trim()) return 'a link to your certificate or its number';
  if (rule === 'reflection' && e.note.trim().length < REFLECTION_MIN) return 'a reflection of at least ' + REFLECTION_MIN + ' characters';
  return null;
}
// Why this evidence cannot be submitted yet, or null.
export function evidenceProblem(format: string, e: Evidence): string | null {
  const need = evidenceNeed(format, e);
  return fieldProblem(e) || (need ? 'Add ' + need + ' to submit' : null);
}

// What the learner reads on the detail, per rule.
export function ruleText(format: string, accepter: string): string {
  const rule = evidenceRule(format);
  return rule === 'certificate' ? 'A ' + format.toLowerCase() + ' counts once ' + accepter + ' sees the certificate: add a link to it, or its certificate number.'
    : rule === 'reflection' ? 'Write what you took from this ' + format.toLowerCase() + ' (at least ' + REFLECTION_MIN + ' characters). ' + accepter[0].toUpperCase() + accepter.slice(1) + ' reads it before accepting.'
      : 'No evidence needed: ' + accepter + ' confirms it. You may add a note or a link, for example to an attendance record.';
}
export const LINKED_NOT_UPLOADED = 'Files are linked, not uploaded: keep the certificate or attendance record on SharePoint or OneDrive and paste its link here.';

export type Verdict = 'accepted' | 'changes' | 'self_completed' | 'attended';
// rating: the classroom feedback's rating, when the learner completed it with feedback.
export type Decision = { learningId: string; verdict: Verdict; comment: string; by: string | null; byName: string; at: string; evidence: Evidence; rating?: number | null };

// The decisions on one learning, newest first.
export const decisionsFor = (all: Decision[] | undefined, learningId: string) => (all || []).filter((d) => d.learningId === learningId).sort((a, b) => b.at.localeCompare(a.at));

// The open request for changes: the latest decision asked for changes and the learning is back in progress.
export function openChanges(all: Decision[] | undefined, learningId: string, state: string): Decision | null {
  const last = decisionsFor(all, learningId)[0];
  return last && last.verdict === 'changes' && state === 'in-progress' ? last : null;
}

// One line of the acceptance record, from the viewer's side (meId: the signed-in person).
export function decisionLine(d: Decision, ownerId: string, meId: string) {
  const who = d.by && d.by === meId ? 'you' : d.byName || 'a former colleague';
  const label = d.verdict === 'accepted' ? 'Accepted by ' + who : d.verdict === 'changes' ? 'Changes requested by ' + who
    : d.verdict === 'attended' ? 'Attendance registered by ' + who + ' · counts without acceptance'
      : 'Completed by ' + (ownerId === meId ? 'you' : d.byName || 'the learner') + (d.rating ? ' with feedback · rated ' + d.rating + ' of 5' : '') + ' · counts without acceptance';
  return { label, date: fmtDate(d.at), comment: d.comment, tone: d.verdict === 'changes' ? 'amber' : 'green' };
}

const DAY = 86400000;
// Monday to Friday between two moments, in whole days (a Friday submission is 1 working day old on Monday).
export function workingDaysSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0;
  const from = new Date(iso); if (isNaN(from.getTime())) return 0;
  let n = 0;
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) + DAY; t <= now.getTime(); t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}
// Submissions are chased after five working days (E4 KPI).
export const LATE_AFTER = 5;
export function waitingLabel(iso: string | null | undefined, now: Date) {
  const n = workingDaysSince(iso, now);
  return { days: n, late: n > LATE_AFTER, text: (iso ? 'Submitted ' + fmtDate(iso) + ' · ' : '') + (n === 0 ? 'today' : n === 1 ? '1 working day' : n + ' working days') };
}

// The person's latest own change to their progress (updated_at), or null.
export function lastActivity(progress: Record<string, { updatedAt?: string | null }>): string | null {
  return Object.values(progress).reduce<string | null>((top, p) => (p.updatedAt && (!top || p.updatedAt > top) ? p.updatedAt : top), null);
}
export function lastActivityLabel(iso: string | null | undefined, now: Date): string {
  if (!iso) return 'No activity yet';
  const t = new Date(iso); if (isNaN(t.getTime())) return 'No activity yet';
  const days = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 35) { const w = Math.floor(days / 7); return w === 1 ? '1 week ago' : w + ' weeks ago'; }
  if (days < 365) { const m = Math.floor(days / 30); return m <= 1 ? '1 month ago' : m + ' months ago'; }
  return 'Over a year ago';
}
