import { describe, expect, it, vi } from 'vitest';
import { BUNDLES0 } from '../data';

vi.mock('./supabase', () => ({ supabase: {} }));
const { bundleFrom, bundleRow, mappingChanges, mapsFrom, mergeMaps, parseFormatContent, toLearn } = await import('./contentStore');

describe('content rows', () => {
  it('turns a learning row into a catalogue entry and its meta', () => {
    const [row, meta] = toLearn({ id: 'L7', title: 'T', domain: 'prof', level: 2, format: 'Book', source: 'S', hours: '1.50', cpd: '0', due: '', why: '', business_line: 'Audit', status: 'draft' });
    expect(row).toEqual(['L7', 'T', 'prof', 2, 'Book', 'S', 1.5, 0, '', '']);
    expect(meta).toEqual({ line: 'Audit', status: 'draft' });
  });
  it('gives every audience a list, also when nothing is mapped', () => {
    const maps = mapsFrom([{ audience: 'Audit', learning_id: 'L1', stage: 'Analyst', obligation: 'mandatory' }]);
    expect(maps.Audit).toEqual([['L1', 'Analyst', 'mandatory']]);
    expect(maps.Consulting).toEqual([]);
    expect(maps['ind:energy']).toEqual([]);
  });
  it('round-trips a bundle with its business line', () => {
    const b = { ...BUNDLES0[0], line: 'Consulting' };
    const row = bundleRow(b);
    expect(row).toMatchObject({ id: b.id, access: b.access, business_line: 'Consulting' });
    expect(row.data).not.toHaveProperty('line');
    expect(bundleFrom(row)).toEqual(b);
  });
});

describe('mappingChanges', () => {
  it('writes what the map holds for each pending key and deletes what it dropped', () => {
    const maps = { Consulting: [['L1', 'Manager', 'advised']] as [string, string, string][], 'ind:energy': [] };
    const ch = mappingChanges(maps, { 'Consulting|L1': true, 'ind:energy|L14': true });
    expect(ch.upserts).toEqual([{ audience: 'Consulting', learning_id: 'L1', stage: 'Manager', obligation: 'advised' }]);
    expect(ch.deletes).toEqual([{ audience: 'ind:energy', learning_id: 'L14' }]);
  });
});

describe('mergeMaps', () => {
  it('lays unsent local edits over the reloaded maps and drops unknown learnings', () => {
    const reloaded = { Consulting: [['L1', 'Analyst', 'mandatory'], ['L2', 'Analyst', 'advised']] as [string, string, string][], Audit: [] as [string, string, string][] };
    const local = { Consulting: [['L1', 'Manager', 'mandatory'], ['L9', 'Analyst', 'advised']] as [string, string, string][], Audit: [['L3', 'Analyst', 'advised'], ['L404', 'Analyst', 'advised']] as [string, string, string][] };
    const r = mergeMaps(reloaded, local, { 'Consulting|L1': true, 'Consulting|L2': true, 'Audit|L3': true, 'Audit|L404': true }, new Set(['L1', 'L2', 'L3', 'L9']));
    expect(r.maps.Consulting).toEqual([['L1', 'Manager', 'mandatory']]);
    expect(r.maps.Audit).toEqual([['L3', 'Analyst', 'advised']]);
    expect(Object.keys(r.pending).sort()).toEqual(['Audit|L3', 'Consulting|L1', 'Consulting|L2']);
  });
});

describe('parseFormatContent', () => {
  const q = { t: 'Store', q: 'Which format?', o: ['CSV', 'Delta'], a: 1, why: 'Delta.' };
  it('returns an exam', () => {
    const raw = { kind: 'exam', bank: 60, real: 'About 100 minutes.', qs: [q] };
    expect(parseFormatContent(raw)).toEqual(raw);
  });
  it('returns null for an unknown kind, junk, or a missing value', () => {
    expect(parseFormatContent({ kind: 'bogus' })).toBeNull();
    expect(parseFormatContent('x')).toBeNull();
    expect(parseFormatContent(null)).toBeNull();
  });
  it('returns null for an exam answer outside its options', () => {
    expect(parseFormatContent({ kind: 'exam', bank: 1, real: '', qs: [{ ...q, a: 2 }] })).toBeNull();
  });
  it('returns null for a flash card that is not a pair', () => {
    expect(parseFormatContent({ kind: 'flash', total: 1, due: 1, next: 'Thu', cards: [['only one']] })).toBeNull();
    const ok = { kind: 'flash', total: 1, due: 1, next: 'Thu', cards: [['Q', 'A']] };
    expect(parseFormatContent(ok)).toEqual(ok);
  });
  it('compiles teach-back patterns case-insensitively and keeps null criteria', () => {
    const c = parseFormatContent({ kind: 'teach', prompt: 'p', crit: [['Impact', 'impact|people'], ['Plain language', null]] });
    expect(c?.kind).toBe('teach');
    if (c?.kind !== 'teach') return;
    expect(c.crit[0][1]?.test('PEOPLE matter')).toBe(true);
    expect(c.crit[1]).toEqual(['Plain language', null]);
  });
  it('returns null for an invalid teach-back pattern', () => {
    expect(parseFormatContent({ kind: 'teach', prompt: 'p', crit: [['Bad', '(']] })).toBeNull();
  });
  it('reads content from a learning row', () => {
    const content = { kind: 'aid', items: ['a'] };
    const [, meta] = toLearn({ id: 'L68', title: 'T', domain: 'prof', level: 2, format: 'Job aid', source: 'S', hours: 1, cpd: 0, due: '', why: '', business_line: null, status: 'published', content });
    expect(meta.content).toEqual(content);
  });
});
