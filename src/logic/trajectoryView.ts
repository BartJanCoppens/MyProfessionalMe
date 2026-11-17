// What the admin trajectory editor shows for a trajectory: labels, step lines and the learner's-eye stones (the design's wording).
import type { StepKind, Trajectory, TrjStep } from './trajectory';

export const STEP_KINDS: Record<StepKind, [string, string]> = { learn: ['Learning', 'muted'], elect: ['Electives', 'info'], evidence: ['Evidence', 'source'], check: ['Sign-off', 'bundle'], exam: ['Exam', 'green'] };
export const ENROL: [Trajectory['enrol'], string][] = [['auto', 'Auto-enrol'], ['open', 'Open opt-in'], ['approval', 'Counsellor approval']];
export const ISSUERS = ['ITAA', 'ACCA', 'IBR-IRE', 'Microsoft', 'Internal academy', 'Other'];

export const fmtHours = (h: number) => (h > 0 && h < 1 ? Math.round(h * 60) + ' min' : Math.round(h * 10) / 10 + ' h');
export const enrolLabel = (e: Trajectory['enrol']) => (ENROL.find((x) => x[0] === e) ?? ENROL[1])[1];
export const validLabel = (months: number) => (months === 12 ? 'year' : months % 12 === 0 ? months / 12 + ' years' : months + ' months');
export const statusLabel = (s: Trajectory['status']) => (s === 'live' ? 'Live' : s === 'retired' ? 'Retired' : 'Draft');

export type TitleOf = (learningId: string) => string;
export function stepTitle(st: TrjStep, titleOf: TitleOf): string {
  if (st.k === 'learn') return titleOf(st.lid ?? '');
  if (st.k === 'elect') return 'Choose ' + (st.pick || 1) + ' of ' + (st.opts || []).length + ': ' + (st.opts || []).map(titleOf).join(' · ');
  return st.title ?? '';
}

export type Stone = { mark: string; label: string; when: string; bg: string; fg: string; bd: string; radius: string; line: string };
// One stone per step (dashed when optional), the credential stone, then a renewal stone when the credential expires.
export function stones(t: Trajectory, titleOf: TitleOf): Stone[] {
  const steps = t.steps.map((st, i): Stone => ({
    mark: String(i + 1), when: 'month ' + (st.win || 1), radius: '50%', line: '#d5dacf',
    label: st.k === 'learn' ? stepTitle(st, titleOf) : st.k === 'elect' ? 'Choose ' + (st.pick || 1) + ' of ' + (st.opts || []).length : st.k === 'exam' ? stepTitle(st, titleOf) : STEP_KINDS[st.k][0],
    bg: st.k === 'exam' ? '#1a1d18' : '#fff', fg: st.k === 'exam' ? '#fff' : '#1a1d18', bd: st.req || st.k === 'exam' ? '1.5px solid #1a1d18' : '1.5px dashed #8b918a',
  }));
  const credential: Stone = {
    mark: '◆', label: t.credential || 'Credential', when: 'month ' + t.months, bg: '#fdf3dc', fg: '#7a5000', bd: '1.5px solid #e0a100', radius: '6px',
    line: t.valid_months ? 'repeating-linear-gradient(90deg,#d5dacf 0 4px,transparent 4px 8px)' : 'transparent',
  };
  const renew: Stone[] = t.valid_months ? [{ mark: '↻', label: 'Renew', when: 'every ' + validLabel(t.valid_months), bg: '#fff', fg: '#5a6058', bd: '1.5px dashed #b9bfb5', radius: '50%', line: 'transparent' }] : [];
  return [...steps, credential, ...renew];
}
