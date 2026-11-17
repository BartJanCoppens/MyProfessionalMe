import { describe, expect, it } from 'vitest';
import { AUDS } from '../data';
import { audienceKeys, MEMBERSHIP_AUDIENCES, MEMBERSHIP_PATTERN } from './membership';

describe('industry and technology membership', () => {
  it('offers the ind and tec audiences of AUDS, in their order, each in the stored format', () => {
    expect(MEMBERSHIP_AUDIENCES.map((a) => a.key)).toEqual([...AUDS.ind, ...AUDS.tec].map((a) => a[0]));
    expect(MEMBERSHIP_AUDIENCES.find((a) => a.key === 'tec:data')?.name).toBe('Data & Azure');
    expect(MEMBERSHIP_AUDIENCES.every((a) => MEMBERSHIP_PATTERN.test(a.key))).toBe(true);
  });
  it('never offers business lines, ambitions or profiles', () => {
    expect(['Audit', 'amb:sust', 'pro:blue', 'tec:Data'].some((k) => MEMBERSHIP_PATTERN.test(k))).toBe(false);
  });
  it('audienceKeys: the business line, then the memberships', () => {
    expect(audienceKeys('Audit', ['tec:data'])).toEqual(['Audit', 'tec:data']);
    expect(audienceKeys(null, ['ind:energy'])).toEqual(['ind:energy']);
  });
});
