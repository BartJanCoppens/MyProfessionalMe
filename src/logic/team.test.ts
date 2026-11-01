import { describe, expect, it } from 'vitest';
import { MAPS0 } from '../data';
import { memberSummary } from './team';
import type { Member } from './team';

const member = (over: Partial<Member> = {}): Member => ({
  id: 'm1', name: 'Ann Peeters', stage: 'Consultant', businessLine: 'Consulting',
  data: { progress: {}, ambitions: [], interests: [], prefs: { initials: '', color: '' } }, ...over,
});

describe('memberSummary', () => {
  it('is all zero for a counsellee without progress', () => {
    const s = memberSummary(member(), MAPS0, new Date('2026-11-01'));
    expect(s).toMatchObject({ readiness: 0, hours: 0, levels: [0, 0, 0, 0, 0, 0, 0, 0, 0], overdue: 0 });
  });
  it('counts a mandatory item past its deadline as overdue in its domain', () => {
    const s = memberSummary(member(), MAPS0, new Date('2026-12-15'));
    expect(s.overdue).toBe(1);
    expect(s.overdueDomains).toEqual(['reg']);
  });
  it('does not count an accepted item as overdue', () => {
    const done = member({ data: { progress: { L17: { state: 'accepted', pct: 100, chosen: false } }, ambitions: [], interests: [], prefs: { initials: '', color: '' } } });
    expect(memberSummary(done, MAPS0, new Date('2026-12-15')).overdue).toBe(0);
  });
  it('raises readiness and hours with progress on mapped items', () => {
    const busy = member({ data: { progress: { L10: { state: 'accepted', pct: 100, chosen: false } }, ambitions: [], interests: [], prefs: { initials: '', color: '' } } });
    const s = memberSummary(busy, MAPS0, new Date('2026-11-01'));
    expect(s.readiness).toBeGreaterThan(0);
    expect(s.hours).toBe(14);
    expect(s.levels[3]).toBe(3);
  });
});
