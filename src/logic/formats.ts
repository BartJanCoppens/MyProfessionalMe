// Pure rules for the v4 formats: flash-card scheduling, practice-exam scoring, teach-back check.
import type { DetailOf, ExamContent, FlashContent, TeachContent } from '../types';

export type FlashDetail = DetailOf['flash'];
type ExamQ = ExamContent['qs'][number];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const DELAY = { again: 10 * MINUTE, good: 3 * DAY, easy: 8 * DAY } as const;

export const nextReview = (rating: keyof typeof DELAY, now: Date): Date => new Date(now.getTime() + DELAY[rating]);

export function dueCards(c: FlashContent, d: FlashDetail, now: Date): number[] {
  return c.cards.flatMap((_, i) => {
    const due = d.due[String(i)];
    return !due || new Date(due).getTime() <= now.getTime() ? [i] : [];
  });
}

export const READY_PCT = 70;

export function examScore(qs: ExamQ[], picks: Record<number, number>) {
  const pct = (right: number, n: number) => (n ? Math.round((right / n) * 100) : 0);
  const topics = new Map<string, { right: number; n: number }>();
  let right = 0;
  qs.forEach((q, i) => {
    const hit = picks[i] === q.a;
    if (hit) right++;
    const t = topics.get(q.t) ?? { right: 0, n: 0 };
    topics.set(q.t, { right: t.right + (hit ? 1 : 0), n: t.n + 1 });
  });
  return { pct: pct(right, qs.length), byTopic: [...topics].map(([label, t]) => ({ label, v: pct(t.right, t.n) })) };
}

export const examVerdict = (pct: number) =>
  pct >= READY_PCT ? 'Ready to book the real exam' : `Not ready yet: aim for ${READY_PCT} % before you book`;

export function teachCheck(c: TeachContent, text: string): { score: number; hits: boolean[] } {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const hits = c.crit.map(([, re]) => (re ? re.test(text) : words >= 1 && words < 150));
  return { score: hits.filter(Boolean).length, hits };
}

export const countLabel = (done: number, total: number, noun: string) => `${done} of ${total} ${noun}`;
