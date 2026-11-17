import { describe, expect, it } from 'vitest';
import * as data from '../data';

describe('seed data', () => {
  it('holds no personal data about a seeded learner or their counsellor', () => {
    const text = JSON.stringify(Object.values(data).filter((v) => typeof v !== 'function'));
    expect(text).not.toMatch(/Lena|Mertens|Thomas/);
    expect(text).not.toMatch(/your 2024 certificate/);
  });
  it('keeps learnings free of progress columns', () => {
    for (const row of data.LEARN) expect(row).toHaveLength(10);
  });
  describe('v4 formats', () => {
    const formats = ['Flash cards', 'Practice exam', 'Practice exam', 'Flash cards', 'Case exercise', 'Teach-back', 'Stretch assignment', 'Webinar', 'Job aid'];
    it('lists L60 to L68 with their formats and no person in a source', () => {
      const rows = Array.from({ length: 9 }, (_, i) => data.LEARN.find((r) => r[0] === 'L' + (60 + i)));
      expect(rows.every(Boolean)).toBe(true);
      expect(rows.map((r) => r![4])).toEqual(formats);
      expect(rows.map((r) => r![5]).join('|')).not.toMatch(/Yusuf|Demir|Thomas|De Smet/);
      expect(rows.map((r) => r![9]).join('|')).not.toMatch(/Yusuf|Thomas/);
    });
  });
});
