// Counsellor view: one counsellee's readiness, hours, levels and overdue mandatory items.
import { DOMAINS, LEARN, STAGES } from '../data';
import type { LearnerData } from '../lib/learnerStore';
import type { Mapping } from '../types';
import { levelsByDomain, stageIndex } from './learner';

export type Member = { id: string; name: string; stage: string | null; businessLine: string | null; data: LearnerData };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '30 Nov 2026' is that day; 'Mar 2027' is the last day of the month.
export function deadline(due: string): Date | null {
  const p = due.trim().split(/\s+/);
  const [day, mon, year] = p.length === 3 ? [Number(p[0]), p[1], Number(p[2])] : [0, p[0], Number(p[1])];
  const m = MONTHS.indexOf(mon);
  if (m < 0 || !year) return null;
  return day ? new Date(Date.UTC(year, m, day, 23, 59)) : new Date(Date.UTC(year, m + 1, 0, 23, 59));
}

export function memberSummary(member: Member, maps: Record<string, Mapping[]>, today: Date) {
  const progress = member.data.progress, stage = stageIndex(member.stage);
  const map = (member.businessLine && maps[member.businessLine]) || [];
  const done = (id: string, hours: number) => {
    const p = progress[id];
    return !p ? 0 : p.state === 'accepted' || p.state === 'submitted' ? hours : p.state === 'in-progress' ? hours * p.pct / 100 : 0;
  };
  let tot = 0, got = 0;
  const overdueDomains: string[] = [];
  let overdue = 0;
  map.forEach(([id, st, ob]) => {
    const row = LEARN.find((r) => r[0] === id);
    if (!row || STAGES.indexOf(st) > stage + 1) return;
    tot += row[6]; got += done(id, row[6]);
    const due = ob === 'mandatory' && row[8] ? deadline(row[8]) : null;
    if (due && due < today && progress[id]?.state !== 'accepted') {
      overdue++;
      if (!overdueDomains.includes(row[2])) overdueDomains.push(row[2]);
    }
  });
  return {
    readiness: tot ? Math.round(100 * got / tot) : 0,
    hours: Math.round(LEARN.reduce((a, r) => a + done(r[0], r[6]), 0)),
    levels: levelsByDomain(progress, LEARN),
    overdue,
    overdueDomains: DOMAINS.map((d) => d[0]).filter((d) => overdueDomains.includes(d)),
  };
}
