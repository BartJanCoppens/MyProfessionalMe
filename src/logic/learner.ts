// Values derived from one learner's own progress (no seeded persona).
import { DOMAINS, LEVELS, STAGES } from '../data';
import type { Learn } from '../types';

export type LearnState = 'not-started' | 'in-progress' | 'submitted' | 'accepted';
export type Progress = Record<string, { state: LearnState; pct: number; chosen: boolean }>;

// Level reached per domain (DOMAINS order): the highest level among accepted learnings, 0 if none.
export function levelsByDomain(progress: Progress, learn: Learn[]): number[] {
  return DOMAINS.map(([dom]) => learn.reduce((top, row) => (row[2] === dom && progress[row[0]]?.state === 'accepted' ? Math.max(top, row[3]) : top), 0));
}

export function stageIndex(stage: string | null | undefined): number {
  return Math.max(0, STAGES.indexOf(stage || ''));
}

export function levelLabel(level: number): string {
  return level ? LEVELS[level - 1] + ' · L' + level : 'Not started';
}

// The road shows Q4 2026 to Q3 2027. A due date ("30 Nov 2026", "Jan 2027") lands in its calendar quarter; overdue dates
// stay in the first column and later ones in the last. A date that cannot be read goes first, so it is never hidden.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dueQuarter(due: string): number {
  const m = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/.exec(due || '');
  if (!m) return 0;
  const q = (+m[2] - 2026) * 4 + Math.floor(MONTHS.indexOf(m[1]) / 3) - 3;
  return Math.min(3, Math.max(0, q));
}
