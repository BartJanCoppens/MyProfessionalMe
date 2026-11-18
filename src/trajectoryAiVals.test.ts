// @vitest-environment jsdom
// The panel's view-model: closed means null, the stage follows the plan, the AI's omissions are said in words, the bundle picker picks into the
// plan, and the plan loads once. The plan store is faked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPlan, savePlanSoon } from './lib/planStore';
import { harness, person, systemAdmin } from './test/harness';
import { blankTrajectory } from './logic/trajectoryEdit';
import { emptyPlan } from './logic/trajectoryPlan';
import type { PlanBrief, PlanModule, PlanRecord } from './logic/trajectoryPlan';
import { ensurePlan } from './trajectoryAiState';
import { droppedNotes } from './trajectoryAiVals';
import type { AppState, Bundle } from './types';

vi.mock('./lib/planStore', async (orig) => ({ ...(await orig<object>()), savePlanSoon: vi.fn(), loadPlan: vi.fn() }));
const load = vi.mocked(loadPlan), save = vi.mocked(savePlanSoon);

const T1 = { ...blankTrajectory('Audit'), id: 'T1', name: 'Tax certificate', credential: 'c', issuer: 'ITAA' };
const brief = { goal: 'g', credential: 'c', issuer: 'i', audience: 'a', stage: null, line: 'Audit', level: 'l', hoursBudget: 40, deadline: null, bodyRules: '', constraints: '', domain: 'tax' } as PlanBrief;
const mod = (id: string): PlanModule => ({ id, title: 'M ' + id, depth: 'foundation', goals: [], hours: 2, material: [], sources: [], checks: [], accepted: false });
const record = (over: Partial<PlanRecord['plan']> = {}): PlanRecord => ({ trajectoryId: 'T1', plan: { ...emptyPlan(), ...over }, messages: [], bundleIds: [], updatedAt: null });
const bundle = (): Bundle => ({ id: 'b1', name: 'VAT guide', desc: 'Rates', owner: 'Tax', tags: [], access: 'all', status: 'live', usedBy: 1, sources: [], chunks: [], line: 'Audit' } as unknown as Bundle);
const setup = (state: Partial<AppState> = {}) => harness({ subject: person({ id: 'u1' }), access: systemAdmin('u1'), config: { liveAssistant: true }, state: { trjs: [T1], trjSel: 'T1', ...state } });
const open = { open: true, say: '', focus: null, editing: null, kbq: '', confirm: false };

beforeEach(() => { load.mockReset(); save.mockReset(); });

describe('vm.tai', () => {
  it('is null while the panel is closed', () => { expect(setup().vm().tai).toBeNull(); });
  it('follows the plan: Brief, then Plan once there is a brief, then Curate once there are modules', () => {
    const stage = (r: PlanRecord | null) => setup({ trjPanel: open, trjPlans: { T1: { record: r, sources: [] } } }).vm().tai!.stage;
    expect([stage(null), stage(record({ brief })), stage(record({ brief, modules: [mod('m1')] }))]).toEqual([0, 1, 2]);
  });
  it('is loading until the plan was read, and says the use is off when it is', () => {
    expect(setup({ trjPanel: open }).vm().tai).toMatchObject({ loading: true, off: expect.stringContaining('Trajectory AI') });
    expect(setup({ trjPanel: open, aiLive: ['trajectory_ai'], trjPlans: { T1: { record: null, sources: [] } } }).vm().tai).toMatchObject({ loading: false, off: null, canEdit: true });
  });
  it('is read-only in View as', () => {
    const h = harness({ subject: person({ id: 'other', readOnly: true }), access: systemAdmin('u1'), state: { trjs: [T1], trjSel: 'T1', trjPanel: open, trjPlans: { T1: { record: record({ brief }), sources: [] } } } });
    expect(h.vm().tai!.canEdit).toBe(false);
  });
  it('picks a bundle into the plan and saves it', () => {
    const h = setup({ trjPanel: open, bundles: [bundle()], trjPlans: { T1: { record: null, sources: [] } } });
    h.vm().tai!.picker.nwKbFound[0].add();
    expect(h.state.trjPlans.T1.record!.bundleIds).toEqual(['b1']);
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.vm().tai!.picker.nwKbPicked.map((p) => p.id)).toEqual(['b1']);
  });
  it('forgets the module asked about, the edit and a waiting Start over when another trajectory is picked', () => {
    const h = setup({ trjs: [T1, { ...T1, id: 'T2', name: 'Second' }], trjPanel: { ...open, focus: 'm1', editing: 'm1', confirm: true } });
    h.vm().trjList[1].pick();
    expect(h.state.trjSel).toBe('T2');
    expect(h.state.trjPanel).toMatchObject({ open: true, focus: null, editing: null, confirm: false });
  });
  it('says each kind of omission in words, singular and plural', () => {
    expect(droppedNotes({ sources: 1, learnings: 2, formats: 1 })).toEqual([
      'The AI cited 1 source it was not given · removed', 'The AI proposed 2 learnings that are not in the library · removed', 'The AI proposed 1 format that does not exist · removed']);
    expect(droppedNotes({ sources: 0, learnings: 0, formats: 0 })).toEqual([]);
    expect(droppedNotes(undefined)).toEqual([]);
  });
});

describe('ensurePlan', () => {
  it('reads the plan once and keeps one that is already there', async () => {
    load.mockResolvedValue({ record: record({ brief }), sources: [] });
    const h = setup();
    await ensurePlan(h.L(), 'T1');
    await ensurePlan(h.L(), 'T1');
    expect(load).toHaveBeenCalledTimes(1);
    expect(h.state.trjPlans.T1.record!.plan.brief).toBe(brief);
    const had = setup({ trjPlans: { T1: { record: null, sources: [] } } });
    await ensurePlan(had.L(), 'T1');
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('says why when the plan did not load', async () => {
    load.mockRejectedValue(new Error('offline'));
    const h = setup();
    await ensurePlan(h.L(), 'T1');
    expect(h.state.trjAi.error).toBe('The plan did not load · offline');
    expect(h.state.trjPlans.T1).toBeUndefined();
  });
});
