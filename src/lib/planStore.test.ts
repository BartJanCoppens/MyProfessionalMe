// @vitest-environment jsdom
// The plan store against the in-memory Supabase fake: parsing at the boundary, the debounced save of the granted columns, start over,
// and the removal of source files. The trajectory delete order (files first) is in trajectoryStore.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, has, op } from '../test/fakeSupabase';
import { emptyPlan } from '../logic/trajectoryPlan';
import type { PlanRecord } from '../logic/trajectoryPlan';
import { loadPlan, removePlanFiles, removePlanSource, savePlanSoon, startOver } from './planStore';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));

const module1 = { id: 'm1', title: 'Basics', depth: 'foundation', goals: ['g'], hours: 2, material: [], sources: [], checks: [], accepted: false };
const record = (over: Partial<PlanRecord> = {}): PlanRecord => ({ trajectoryId: 'T1', plan: { ...emptyPlan(), modules: [module1 as never] }, messages: [], bundleIds: ['b1'], updatedAt: null, ...over });
const planRow = (over: Record<string, unknown> = {}) => ({ trajectory_id: 'T1', plan: { ...emptyPlan(), modules: [module1] }, messages: [{ role: 'admin', text: 'hi', at: 't' }], bundle_ids: ['b1'], updated_at: '2026-11-18T10:00:00Z', ...over });
const sourceRow = (over: Record<string, unknown> = {}) => ({ id: 's1', trajectory_id: 'T1', name: 'syllabus.pdf', path: 'u/s1/syllabus.pdf', pages: 2, passages: [[1, 'Exam 1']], chars: 6, flags: [], added_by: 'u', added_at: '2026-11-18T10:00:00Z', ...over });
const answers = (plan: unknown, sources: unknown[] = []) => db.answer((c) => ({ data: c.table === 'trajectory_plans' ? plan : sources }));
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { db.reset(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); warn.mockRestore(); });

describe('loadPlan', () => {
  it('returns the record and the sources of the trajectory', async () => {
    answers(planRow(), [sourceRow()]);
    const out = await loadPlan('T1');
    expect(out.record).toMatchObject({ trajectoryId: 'T1', bundleIds: ['b1'], updatedAt: '2026-11-18T10:00:00Z' });
    expect(out.record!.plan.modules[0].id).toBe('m1');
    expect(out.record!.messages).toHaveLength(1);
    expect(out.sources).toEqual([expect.objectContaining({ id: 's1', trajectoryId: 'T1', path: 'u/s1/syllabus.pdf', passages: [[1, 'Exam 1']], addedBy: 'u' })]);
    expect(db.on('trajectory_plans').every((c) => has(c, 'eq', 'trajectory_id', 'T1'))).toBe(true);
  });
  it('gives no record when the trajectory has no plan yet', async () => {
    answers(null, []);
    expect(await loadPlan('T1')).toEqual({ record: null, sources: [] });
  });
  it('shows a malformed plan as the empty plan, with a warning, and keeps the rest of the row', async () => {
    answers(planRow({ plan: { modules: 'x' } }));
    const out = await loadPlan('T1');
    expect(out.record!.plan).toEqual(emptyPlan());
    expect(out.record!.bundleIds).toEqual(['b1']);
    expect(String(warn.mock.calls[0][0])).toContain('T1');
  });
  it('shows a plan with a malformed module as the empty plan', async () => {
    answers(planRow({ plan: { ...emptyPlan(), modules: [{ id: 'm1' }] } }));
    expect((await loadPlan('T1')).record!.plan).toEqual(emptyPlan());
  });
  it('shows malformed messages as none, and drops a malformed source with a warning', async () => {
    answers(planRow({ messages: 'x' }), [sourceRow({ passages: 'x' }), sourceRow({ id: 's2' })]);
    const out = await loadPlan('T1');
    expect(out.record!.messages).toEqual([]);
    expect(out.sources.map((s) => s.id)).toEqual(['s2']);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  it('throws the database error', async () => {
    db.answer(() => ({ error: { message: 'boom' } }));
    await expect(loadPlan('T1')).rejects.toThrow('boom');
  });
});

describe('savePlanSoon', () => {
  it('writes once for two edits within the wait, with the second record', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    savePlanSoon(record({ bundleIds: ['first'] }), onError);
    vi.advanceTimersByTime(300);
    savePlanSoon(record({ bundleIds: ['second'] }), onError);
    vi.advanceTimersByTime(599);
    expect(db.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(db.on('trajectory_plans')).toHaveLength(1);
    const call = db.on('trajectory_plans')[0];
    expect(op(call)).toBe('upsert');
    expect((call.steps[0][1][0] as { bundle_ids: string[] }).bundle_ids).toEqual(['second']);
    expect(onError).not.toHaveBeenCalled();
  });
  it('sends only the granted columns, and asks to merge on the trajectory', async () => {
    vi.useFakeTimers();
    savePlanSoon(record(), vi.fn());
    await vi.advanceTimersByTimeAsync(600);
    const [row, options] = db.on('trajectory_plans')[0].steps[0][1] as [Record<string, unknown>, unknown];
    expect(Object.keys(row).sort()).toEqual(['bundle_ids', 'messages', 'plan', 'trajectory_id']);
    expect(options).toEqual({ onConflict: 'trajectory_id' });
  });
  it('reports a refusal in words', async () => {
    vi.useFakeTimers();
    db.answer(() => ({ error: { message: 'new row violates row-level security policy', code: '42501' } as { message: string } }));
    const onError = vi.fn();
    savePlanSoon(record(), onError);
    await vi.advanceTimersByTimeAsync(600);
    expect(onError).toHaveBeenCalledWith('Not saved · you can only plan trajectories of your own business line');
  });
});

describe('startOver', () => {
  it('sets the plan to the empty plan and the messages to none, and touches nothing else', async () => {
    db.answer(() => ({ data: [{ trajectory_id: 'T1' }] }));
    await startOver('T1');
    const call = db.on('trajectory_plans')[0];
    expect(op(call)).toBe('update');
    expect(call.steps[0][1][0]).toEqual({ plan: emptyPlan(), messages: [] });
    expect(has(call, 'eq', 'trajectory_id', 'T1')).toBe(true);
    expect(db.on('trajectory_plan_sources')).toHaveLength(0);
  });
  it('holds back a pending save, so the old plan is not written back', async () => {
    vi.useFakeTimers();
    db.answer(() => ({ data: [{ trajectory_id: 'T1' }] }));
    savePlanSoon(record(), vi.fn());
    await startOver('T1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(db.on('trajectory_plans').map(op)).toEqual(['update']);
  });
  it('says so when no row changed', async () => {
    db.answer(() => ({ data: [] }));
    await expect(startOver('T1')).rejects.toThrow('Not changed · there is no plan, or you cannot change it');
  });
});

describe('the files of a deleted trajectory\'s sources', () => {
  it('removes the files in one call, and nothing when there are none', async () => {
    db.answer(() => ({ data: [{ name: 'x' }, { name: 'y' }] }));
    await removePlanFiles(['u/s1/a.pdf', 'u/s2/b.pdf']);
    expect(db.calls.map((c) => c.table)).toEqual(['storage:media']);
    expect(db.calls[0].steps).toEqual([['remove', [['u/s1/a.pdf', 'u/s2/b.pdf']]]]);
    db.reset();
    await removePlanFiles([]);
    expect(db.calls).toHaveLength(0);
  });
  it('warns and goes on when Storage refuses: a leftover file is acceptable', async () => {
    db.answer(() => ({ error: { message: 'new row violates row-level security policy' } }));
    await expect(removePlanFiles(['u/s1/a.pdf'])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('removePlanSource', () => {
  it('removes the file first, then the row', async () => {
    db.answer((c) => ({ data: c.table === 'trajectory_plan_sources' ? (c.steps[0][0] === 'select' ? { path: 'u/s1/a.pdf' } : [{ id: 's1' }]) : [{ name: 'a.pdf' }] }));
    await removePlanSource('s1');
    expect(db.calls.map((c) => c.table + ':' + op(c))).toEqual(['trajectory_plan_sources:select', 'storage:media:remove', 'trajectory_plan_sources:delete']);
    expect(has(db.calls[2], 'eq', 'id', 's1')).toBe(true);
  });
  it('removes the row alone when there is no file', async () => {
    db.answer((c) => ({ data: c.table === 'trajectory_plan_sources' ? (c.steps[0][0] === 'select' ? { path: null } : [{ id: 's1' }]) : [] }));
    await removePlanSource('s1');
    expect(db.calls.map((c) => c.table)).toEqual(['trajectory_plan_sources', 'trajectory_plan_sources']);
  });
  it('keeps the row when Storage skips the file (fewer removed than asked): the file still has its row, so nothing is orphaned', async () => {
    db.answer((c) => ({ data: c.table === 'trajectory_plan_sources' ? { path: 'u/s1/a.pdf' } : [] }));
    await expect(removePlanSource('s1')).rejects.toThrow('the source stays');
    expect(db.on('trajectory_plan_sources').map(op)).toEqual(['select']);
  });
  it('keeps the row when the file cannot be removed, and says so', async () => {
    db.answer((c) => (c.table === 'storage:media' ? { error: { message: 'new row violates row-level security policy' } } : { data: { path: 'u/s1/a.pdf' } }));
    await expect(removePlanSource('s1')).rejects.toThrow('Not removed · the original file could not be removed, so the source stays');
    expect(db.on('trajectory_plan_sources').map(op)).toEqual(['select']);
  });
  it('says so when the row delete is refused', async () => {
    db.answer((c) => ({ data: c.table === 'trajectory_plan_sources' ? (c.steps[0][0] === 'select' ? { path: null } : []) : [] }));
    await expect(removePlanSource('s1')).rejects.toThrow('Not removed · only an editor of this trajectory can remove a source');
  });
});
