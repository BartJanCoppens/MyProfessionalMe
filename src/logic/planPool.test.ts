// The bounded pool of passages and the catalogue sent with each Trajectory AI call.
import { afterEach, describe, expect, it } from 'vitest';
import { setCatalogue } from '../data';
import type { Bundle, Learn, LearnMeta } from '../types';
import { catalogueFor, PLAN_POOL, poolFor } from './planPool';
import { emptyPlan, refKey } from './trajectoryPlan';
import type { PlanModule, PlanSource, SourceRef, TrajectoryPlan } from './trajectoryPlan';

const bundle = (over: Partial<Bundle> = {}): Bundle => ({
  id: 'b1', name: 'VAT basics', owner: 'x', topic: 't', topics2: [], desc: '', access: 'all', fresh: '12', status: 'live', updated: '', usedBy: 0, tags: [], sugg: [], models: [], concepts: [],
  sources: [['Guide', 'upload', '1 file', 2, '1 Jan', 'internal'], ['Client file', 'upload', '1 file', 1, '1 Jan', 'client'], ['Licensed', 'upload', '1 file', 1, '1 Jan', 'licensed']],
  chunks: [[0, 'VAT on exports is zero rated'], [1, 'VAT secret client matter'], [2, 'VAT licensed text'], [0, 'Unrelated pensions text']], ...over,
});
const source = (over: Partial<PlanSource> = {}): PlanSource => ({ id: 's1', trajectoryId: 'T', name: 'syllabus.pdf', path: null, pages: 2, chars: 100, flags: [], addedBy: 'u', addedAt: '', passages: [[1, 'VAT exam topics'], [2, 'Intrastate VAT rules']], ...over });
const mod = (refs: { ref: SourceRef; quote: string }[]): PlanModule => ({ id: 'm1', title: 'T', depth: 'foundation', goals: [], hours: 1, material: [], accepted: false, checks: [], sources: refs.map((r) => ({ ...r, label: 'lbl' })) });
const planWith = (refs: { ref: SourceRef; quote: string }[]): TrajectoryPlan => ({ ...emptyPlan(), modules: [mod(refs)] });

describe('poolFor', () => {
  it('puts a cited passage first even when it does not match the query', () => {
    const plan = planWith([{ ref: { kind: 'kb', bundleId: 'b1', chunk: 3 }, quote: 'x' }]);
    const pool = poolFor({ plan, sources: [source()], bundles: [bundle()], query: 'VAT exports' });
    expect(pool[0]).toMatchObject({ ref: { kind: 'kb', bundleId: 'b1', chunk: 3 }, text: 'Unrelated pensions text', label: 'Guide · VAT basics' });
    expect(pool.length).toBeGreaterThan(1);
  });
  it('never includes a client or licensed bundle source', () => {
    const pool = poolFor({ plan: emptyPlan(), sources: [], bundles: [bundle()], query: 'VAT exports secret client licensed' });
    expect(pool.map((p) => p.text).join(' ')).not.toMatch(/secret client|licensed text/);
    expect(pool.map((p) => refKey(p.ref))).toEqual(['kb:b1#0']);
  });
  it('ranks uploaded passages with the bundle passages and labels them with file and page', () => {
    const pool = poolFor({ plan: emptyPlan(), sources: [source()], bundles: [bundle()], query: 'VAT intrastate' });
    expect(pool.find((p) => p.ref.kind === 'file')).toMatchObject({ ref: { kind: 'file', sourceId: 's1', page: 2 }, label: 'syllabus.pdf · p. 2' });
  });
  it('sends 24 passages at most', () => {
    const passages: [number, string][] = Array.from({ length: 30 }, (_, i) => [i + 1, 'VAT matching passage ' + i]);
    expect(poolFor({ plan: emptyPlan(), sources: [source({ passages })], bundles: [], query: 'VAT matching passage' })).toHaveLength(PLAN_POOL.passages);
  });
  it('cuts every text to 700 characters', () => {
    const long = 'VAT ' + 'long '.repeat(300);
    const pool = poolFor({ plan: planWith([{ ref: { kind: 'file', sourceId: 's1', page: 1 }, quote: 'q' }]), sources: [source({ passages: [[1, long]] })], bundles: [], query: 'long' });
    expect(pool.length).toBeGreaterThan(0);
    pool.forEach((p) => expect(p.text.length).toBeLessThanOrEqual(PLAN_POOL.passageChars));
  });
  it('uses the stored quote for a cited passage that is gone, and says the source changed', () => {
    const plan = planWith([{ ref: { kind: 'kb', bundleId: 'b1', chunk: 99 }, quote: 'Old quote about VAT' }, { ref: { kind: 'file', sourceId: 'gone', page: 1 }, quote: 'Old file quote' }]);
    const pool = poolFor({ plan, sources: [], bundles: [bundle()], query: '' });
    expect(pool).toEqual([
      { ref: { kind: 'kb', bundleId: 'b1', chunk: 99 }, label: 'lbl (source changed)', text: 'Old quote about VAT' },
      { ref: { kind: 'file', sourceId: 'gone', page: 1 }, label: 'lbl (source changed)', text: 'Old file quote' },
    ]);
  });
  it('never sends the quote of a cited passage whose source is now client or licensed', () => {
    const plan = planWith([{ ref: { kind: 'kb', bundleId: 'b1', chunk: 1 }, quote: 'secret quote' }]);
    expect(poolFor({ plan, sources: [], bundles: [bundle()], query: '' })).toEqual([]);
  });
  it('has no duplicate reference, and cites at most 16 first', () => {
    const refs = Array.from({ length: 20 }, (_, i) => ({ ref: { kind: 'file', sourceId: 's1', page: i + 1 } as SourceRef, quote: 'q' + i }));
    const passages: [number, string][] = refs.map((_, i) => [i + 1, 'VAT page ' + i]);
    const pool = poolFor({ plan: planWith([...refs, refs[0]]), sources: [source({ passages })], bundles: [], query: 'VAT page' });
    const keys = pool.map((p) => refKey(p.ref));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.slice(0, 16)).toEqual(refs.slice(0, 16).map((r) => refKey(r.ref)));
  });
});

const learn = (id: string, title: string, why = 'why'): Learn => [id, title, 'D', 3, 'Micro-guide', 'Firm', 1.5, 0, '', why];
const meta = (line: string | null, status: LearnMeta['status'] = 'published'): LearnMeta => ({ line, status });
afterEach(() => setCatalogue([]));

describe('catalogueFor', () => {
  const rows: [Learn, LearnMeta][] = [
    [learn('L1', 'VAT in practice', 'x'.repeat(300)), meta('Tax & Legal')], [learn('L2', 'Audit sampling'), meta('Audit')], [learn('L3', 'Firm-wide ethics'), meta(null)],
    [learn('L4', 'VAT draft'), meta('Tax & Legal', 'draft')], [learn('L5', 'VAT in review'), meta('Tax & Legal', 'review')],
  ];
  it('holds published learnings of the line or firm-wide, never a draft or another line', () => {
    setCatalogue(rows);
    const out = catalogueFor({ plan: emptyPlan(), learnings: rows.map((r) => r[0]), line: 'Tax & Legal', query: '' });
    expect(out.map((r) => r.id).sort()).toEqual(['L1', 'L3']);
    expect(out[0]).toMatchObject({ id: 'L1', title: 'VAT in practice', format: 'Micro-guide', hours: 1.5, level: 3 });
    expect(out.find((r) => r.id === 'L1')!.desc).toHaveLength(PLAN_POOL.catalogueChars);
  });
  it('always holds the plan\'s existing and cited learnings, then the best matches, at most 40', () => {
    const many: [Learn, LearnMeta][] = Array.from({ length: 60 }, (_, i) => [learn('N' + i, i === 59 ? 'VAT wanted' : 'Other ' + i), meta(null)]);
    setCatalogue(many);
    const plan: TrajectoryPlan = { ...emptyPlan(), modules: [{ ...mod([{ ref: { kind: 'learning', learningId: 'N1' }, quote: 'q' }]), material: [{ kind: 'existing', learningId: 'N0', reason: 'r' }] }] };
    const out = catalogueFor({ plan, learnings: many.map((r) => r[0]), line: null, query: 'VAT wanted' });
    expect(out).toHaveLength(PLAN_POOL.catalogue);
    expect(out.slice(0, 2).map((r) => r.id).sort()).toEqual(['N0', 'N1']);
    expect(out.map((r) => r.id)).toContain('N59');
  });
});
