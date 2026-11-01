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
