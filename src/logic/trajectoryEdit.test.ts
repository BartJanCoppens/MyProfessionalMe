import { describe, expect, it, vi } from 'vitest';
import { addMap, addStep, blankTrajectory, earlierSteps, moveStep, nextStepId, removeStep, saveable } from './trajectoryEdit';
import type { Trajectory, TrjStep } from './trajectory';

const step = (id: string, over: Partial<TrjStep> = {}): TrjStep => ({ id, k: 'evidence', title: id, hours: 0, win: 3, req: true, pre: null, ...over });
const base = (steps: TrjStep[], over: Partial<Trajectory> = {}): Trajectory => ({ ...blankTrajectory(null), id: 'T1', steps, ...over });

describe('blankTrajectory', () => {
  it('is an open draft with one exam step, in the given line', () => {
    const t = blankTrajectory('Audit');
    expect(t).toMatchObject({ name: 'New trajectory', enrol: 'open', status: 'draft', business_line: 'Audit', maps: [], valid_months: null });
    expect(t.credential.trim()).not.toBe('');
    expect(t.steps).toEqual([{ id: 's1', k: 'exam', title: 'Final assessment', hours: 2, win: 12, req: true, pre: null }]);
  });
});

describe('step ids', () => {
  it('never reuses an id, also after the highest step was removed', () => {
    const once = [step('s1'), step('s2')];
    const added = addStep(once, { k: 'evidence' }, 12);
    const removed = removeStep(added, added[2].id);
    const again = addStep(removed, { k: 'evidence' }, 12);
    expect(again[2].id).not.toBe(added[2].id);
    expect(again[2].id).toMatch(/^s[0-9a-z]+$/);
    expect(new Set(again.map((x) => x.id)).size).toBe(3);
  });
  it('regenerates on a clash with an existing id', () => {
    const spy = vi.spyOn(Math, 'random');
    spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.5).mockReturnValue(0.123);
    const first = nextStepId([]);
    const second = nextStepId([step(first)]);
    expect(second).not.toBe(first);
    spy.mockRestore();
  });
  it('appends new steps with the design defaults', () => {
    let steps = [step('s1', { k: 'learn', lid: 'L1', win: 6 })];
    steps = addStep(steps, { k: 'elect' }, 12);
    steps = addStep(steps, { k: 'evidence' }, 12);
    steps = addStep(steps, { k: 'check' }, 12);
    steps = addStep(steps, { k: 'exam' }, 12);
    expect(new Set(steps.map((s) => s.id)).size).toBe(5);
    expect(steps[1]).toMatchObject({ k: 'elect', opts: [], pick: 1, win: 6, req: true, pre: null });
    expect(steps[2]).toMatchObject({ title: 'Describe the evidence', hours: 0, pre: null });
    expect(steps[3]).toMatchObject({ title: 'Counsellor sign-off', pre: steps[2].id });
    expect(steps[4]).toMatchObject({ title: 'Exam', hours: 2, win: 12, pre: steps[3].id });
  });
  it('a learning step carries its library id', () => {
    expect(addStep([], { k: 'learn', lid: 'L9' }, 12)[0]).toMatchObject({ k: 'learn', lid: 'L9', req: true, pre: null });
  });
});

describe('moveStep', () => {
  const steps = [step('s1'), step('s2', { pre: 's1' }), step('s3', { pre: 's2' })];
  it('swaps neighbours and keeps ids', () => {
    expect(moveStep(steps, 's2', 1).map((s) => s.id)).toEqual(['s1', 's3', 's2']);
  });
  it('does nothing at the ends', () => {
    expect(moveStep(steps, 's1', -1)).toEqual(steps);
    expect(moveStep(steps, 's3', 1)).toEqual(steps);
  });
  it('clears a prerequisite that now comes later', () => {
    const moved = moveStep(steps, 's2', 1);
    expect(moved.find((s) => s.id === 's3')!.pre).toBeNull();
    expect(moved.find((s) => s.id === 's2')!.pre).toBe('s1');
  });
});

describe('removeStep', () => {
  it('removes the step and clears any pre pointing at it', () => {
    const out = removeStep([step('s1'), step('s2', { pre: 's1' }), step('s3', { pre: 's2' })], 's1');
    expect(out.map((s) => [s.id, s.pre])).toEqual([['s2', null], ['s3', 's2']]);
  });
});

describe('earlierSteps', () => {
  it('lists only the steps before the given one', () => {
    expect(earlierSteps([step('s1'), step('s2'), step('s3')], 's3').map((s) => s.id)).toEqual(['s1', 's2']);
    expect(earlierSteps([step('s1')], 's1')).toEqual([]);
  });
});

describe('addMap', () => {
  it('is mandatory for a business line, industry or technology on an auto-enrol trajectory', () => {
    expect(addMap(base([], { enrol: 'auto' }), 'Audit', 'Manager')!.maps).toEqual([['Audit', 'Manager', 'mandatory']]);
    expect(addMap(base([], { enrol: 'auto' }), 'ind:energy', 'Manager')!.maps).toEqual([['ind:energy', 'Manager', 'mandatory']]);
    expect(addMap(base([], { enrol: 'auto' }), 'tec:data', 'Manager')!.maps).toEqual([['tec:data', 'Manager', 'mandatory']]);
    expect(addMap(base([], { enrol: 'auto' }), 'amb:sust', 'Manager')!.maps).toEqual([['amb:sust', 'Manager', 'advised']]);
    expect(addMap(base([], { enrol: 'auto' }), 'pro:blue', 'Manager')!.maps).toEqual([['pro:blue', 'Manager', 'advised']]);
    expect(addMap(base([], { enrol: 'open' }), 'Audit', 'Manager')!.maps).toEqual([['Audit', 'Manager', 'advised']]);
  });
  it('refuses a duplicate audience and stage', () => {
    expect(addMap(base([], { maps: [['Audit', 'Manager', 'advised']] }), 'Audit', 'Manager')).toBeNull();
  });
});

describe('saveable', () => {
  it('needs a name and a credential (the database refuses empty ones)', () => {
    expect(saveable(base([]))).toBe(true);
    expect(saveable(base([], { name: ' ' }))).toBe(false);
    expect(saveable(base([], { credential: '' }))).toBe(false);
  });
});
