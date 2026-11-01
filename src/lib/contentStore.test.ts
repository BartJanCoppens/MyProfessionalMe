import { describe, expect, it, vi } from 'vitest';
import { BUNDLES0 } from '../data';

vi.mock('./supabase', () => ({ supabase: {} }));
const { bundleFrom, bundleRow, mappingChanges, mapsFrom, toLearn } = await import('./contentStore');

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
