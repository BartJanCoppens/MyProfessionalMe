import { describe, expect, it } from 'vitest';
import * as data from '../data';

describe('seed data', () => {
  it('holds no personal data about a seeded learner or their counsellor', () => {
    const text = JSON.stringify(Object.values(data).filter((v) => typeof v !== 'function'));
    expect(text).not.toMatch(/Lena|Mertens|Thomas/);
  });
  it('keeps learnings free of progress columns', () => {
    for (const row of data.LEARN) expect(row).toHaveLength(10);
  });
});
