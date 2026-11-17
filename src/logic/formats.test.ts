// Spaced repetition, exam scoring and teach-back rules for the v4 formats.
import { describe, expect, it } from 'vitest';
import { parseFormatContent } from '../lib/contentStore';
import type { ExamContent, FlashContent, TeachContent } from '../types';
import { READY_PCT, countLabel, dueCards, examScore, examVerdict, nextReview, teachCheck } from './formats';

const exam = parseFormatContent({
  kind: 'exam', bank: 40, real: 'x',
  qs: [
    { t: 'Rates', q: 'q1', o: ['a', 'b', 'c', 'd'], a: 1, why: 'w' },
    { t: 'SMEs', q: 'q2', o: ['a', 'b', 'c', 'd'], a: 0, why: 'w' },
    { t: 'Pillar Two', q: 'q3', o: ['a', 'b', 'c', 'd'], a: 0, why: 'w' },
    { t: 'Payments', q: 'q4', o: ['a', 'b', 'c', 'd'], a: 2, why: 'w' },
    { t: 'Profession', q: 'q5', o: ['a', 'b', 'c', 'd'], a: 1, why: 'w' },
  ],
}) as ExamContent;
const teach = parseFormatContent({
  kind: 'teach', prompt: 'p',
  crit: [['Impact materiality', 'impact|people|environment|society|planet'], ['Financial materiality', 'financ|risk|cash|value|enterprise'], ['Why both count', 'both|two|either|together|and also'], ['Plain language', null]],
}) as TeachContent;
const flash: FlashContent = { kind: 'flash', total: 3, due: 3, next: '', cards: [['a', 'b'], ['c', 'd'], ['e', 'f']] };
const now = new Date('2026-11-17T10:00:00Z');
const allRight = Object.fromEntries(exam.qs.map((q, i) => [i, q.a]));

describe('nextReview', () => {
  it('schedules again, good and easy at 10 minutes, 3 days and 8 days', () => {
    expect(nextReview('again', now).getTime()).toBe(now.getTime() + 10 * 60_000);
    expect(nextReview('good', now).getTime()).toBe(now.getTime() + 3 * 86_400_000);
    expect(nextReview('easy', now).getTime()).toBe(now.getTime() + 8 * 86_400_000);
  });
});

describe('dueCards', () => {
  it('lists cards with no date or a date at or before now', () => {
    const due = { '1': '2026-11-17T10:00:00.000Z', '2': '2026-11-18T10:00:00.000Z' };
    expect(dueCards(flash, { due }, now)).toEqual([0, 1]);
  });
});

describe('examScore', () => {
  it('scores 100 with every answer right, over five topics', () => {
    const r = examScore(exam.qs, allRight);
    expect(r.pct).toBe(100);
    expect(r.byTopic).toHaveLength(5);
    expect(examVerdict(r.pct)).toBe('Ready to book the real exam');
  });
  it('scores 40 with two right and says not ready', () => {
    const r = examScore(exam.qs, { 0: 1, 1: 0 });
    expect(r.pct).toBe(40);
    expect(r.byTopic.find((t) => t.label === 'Rates')?.v).toBe(100);
    expect(r.byTopic.find((t) => t.label === 'Payments')?.v).toBe(0);
    expect(examVerdict(r.pct)).toBe('Not ready yet: aim for 70 % before you book');
  });
  it('treats the threshold as ready', () => {
    expect(READY_PCT).toBe(70);
    expect(examVerdict(70)).toBe('Ready to book the real exam');
  });
});

describe('teachCheck', () => {
  it('scores 4 on a full answer', () => {
    const r = teachCheck(teach, 'Impact on people and planet, and financial risk to the company; both count');
    expect(r.score).toBe(4);
    expect(r.hits).toEqual([true, true, true, true]);
  });
  it('fails plain language when empty or 150 words or more', () => {
    expect(teachCheck(teach, '').hits[3]).toBe(false);
    expect(teachCheck(teach, Array(150).fill('word').join(' ')).hits[3]).toBe(false);
    expect(teachCheck(teach, Array(149).fill('word').join(' ')).hits[3]).toBe(true);
  });
});

describe('countLabel', () => {
  it('formats done of total with the noun', () => {
    expect(countLabel(2, 4, 'checkpoints')).toBe('2 of 4 checkpoints');
  });
});
