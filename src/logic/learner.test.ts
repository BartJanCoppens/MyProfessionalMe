import { describe, expect, it } from 'vitest';
import { LEARN } from '../data';
import { levelLabel, levelsByDomain, stageIndex, dueQuarter } from './learner';

describe('levelsByDomain', () => {
  it('is all zeros for a learner with no progress', () => {
    expect(levelsByDomain({}, LEARN)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('takes the highest accepted level in a domain', () => {
    const progress = { L1: { state: 'accepted' as const, pct: 100, chosen: false }, L3: { state: 'accepted' as const, pct: 100, chosen: false } };
    expect(levelsByDomain(progress, LEARN)[0]).toBe(4);
  });
  it('ignores learnings that are not accepted', () => {
    expect(levelsByDomain({ L3: { state: 'in-progress', pct: 50, chosen: true } }, LEARN)[0]).toBe(0);
  });
});

describe('stageIndex', () => {
  it('defaults to the first stage when unknown', () => {
    expect(stageIndex(null)).toBe(0);
    expect(stageIndex('Chairman')).toBe(0);
  });
  it('finds a known stage', () => {
    expect(stageIndex('Senior consultant')).toBe(2);
    expect(stageIndex('Director')).toBe(5);
    expect(stageIndex('Partner')).toBe(6);
  });
});

describe('levelLabel', () => {
  it('reads Not started for level 0', () => { expect(levelLabel(0)).toBe('Not started'); });
  it('names a reached level', () => { expect(levelLabel(3)).toBe('Advanced · L3'); });
});

describe('dueQuarter', () => {
  it('places a due date in its road quarter, from Q4 2026 to Q3 2027', () => {
    expect(['30 Nov 2026', 'Jan 2027', 'Mar 2027', 'Jun 2027', '15 Sep 2027'].map(dueQuarter)).toEqual([0, 1, 1, 2, 3]);
  });
  it('keeps overdue and far-off dates on the road, and unreadable ones first', () => {
    expect(['3 Mar 2026', 'Dec 2028', 'asap', ''].map(dueQuarter)).toEqual([0, 3, 0, 0]);
  });
});
