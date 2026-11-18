// The trajectory plan: its caps, the problems it can have, and the pure edits an admin makes while curating it.
import { describe, expect, it } from 'vitest';
import { acceptModule, DEPTH_LEVEL, editModule, emptyPlan, moveModule, PLAN_CAPS, PLAN_FORMATS, planProblems, refKey, removeModule } from './trajectoryPlan';
import type { PlanModule, TrajectoryPlan } from './trajectoryPlan';

const mod = (over: Partial<PlanModule> = {}): PlanModule => ({
  id: 'm1', title: 'Corporate tax basics', depth: 'foundation', goals: ['Read a tax return'], hours: 4, material: [], sources: [], checks: [], accepted: false, ...over,
});
const plan = (...modules: PlanModule[]): TrajectoryPlan => ({ ...emptyPlan(), modules });

describe('the empty plan', () => {
  it('has no brief, modules, exam or removed titles', () => {
    expect(emptyPlan()).toEqual({ version: 1, brief: null, modules: [], finalExam: null, removed: [] });
  });
  it('gives each depth its contribution level', () => {
    expect(DEPTH_LEVEL).toEqual({ foundation: 2, applied: 3, expert: 4 });
  });
});

describe('planProblems', () => {
  it('finds none in a good plan', () => {
    expect(planProblems(plan(mod({ material: [{ kind: 'studio', format: 'Flash cards', reason: 'Drill' }, { kind: 'manual', format: 'Book', reason: 'Read' }] })))).toEqual([]);
  });
  it('refuses 13 modules', () => {
    const many = Array.from({ length: 13 }, (_, i) => mod({ id: 'm' + i }));
    expect(planProblems(plan(...many))).toContain('A plan has at most 12 modules');
  });
  it('refuses 6 goals', () => {
    expect(planProblems(plan(mod({ goals: ['a', 'b', 'c', 'd', 'e', 'f'] })))).toContain('A module has at most 5 goals');
  });
  it('refuses hours outside 0.25 to 80 and hours that do not go in quarters', () => {
    expect(planProblems(plan(mod({ hours: 0.1 })))).toContain('Hours are between 0.25 and 80');
    expect(planProblems(plan(mod({ hours: 81 })))).toContain('Hours are between 0.25 and 80');
    expect(planProblems(plan(mod({ hours: 1.1 })))).toContain('Hours go up in quarters');
    expect(planProblems(plan(mod({ hours: 0.25 })))).toEqual([]);
  });
  it('refuses a format the studios cannot make', () => {
    expect(planProblems(plan(mod({ material: [{ kind: 'studio', format: 'Webinar', reason: 'x' }] })))).toContain('Webinar is not a format the plan can propose');
    expect(planProblems(plan(mod({ material: [{ kind: 'manual', format: 'Webinar' as never, reason: 'x' }] })))).toContain('Webinar is not a format the plan can propose');
  });
  it('refuses long text, too much material and too many sources', () => {
    expect(planProblems(plan(mod({ title: 'x'.repeat(121) })))).toContain('A title is at most 120 characters');
    expect(planProblems(plan(mod({ goals: ['x'.repeat(201)] })))).toContain('A goal is at most 200 characters');
    const m = { kind: 'manual', format: 'Book', reason: 'x'.repeat(241) } as const;
    expect(planProblems(plan(mod({ material: [m] })))).toContain('A reason is at most 240 characters');
    expect(planProblems(plan(mod({ material: [m, m, m, m].map((x) => ({ ...x, reason: 'x' })) })))).toContain('A module has at most 3 pieces of material');
    const s = { ref: { kind: 'learning', learningId: 'L1' }, label: 'L', quote: 'q' } as const;
    expect(planProblems(plan(mod({ sources: Array(7).fill(s) })))).toContain('A module cites at most 6 sources');
    expect(planProblems(plan(mod({ sources: [{ ...s, quote: 'x'.repeat(161) }] })))).toContain('A quote is at most 160 characters');
  });
  it('refuses an empty title, a repeated id and 31 removed titles', () => {
    expect(planProblems(plan(mod({ title: ' ' })))).toContain('Every module needs a title');
    expect(planProblems(plan(mod(), mod()))).toContain('Module ids are unique');
    expect(planProblems({ ...emptyPlan(), removed: Array(31).fill('x') })).toContain('A plan remembers at most 30 removed titles');
  });
  it('checks the final exam hours', () => {
    expect(planProblems({ ...emptyPlan(), finalExam: { title: 'Exam', hours: 100, reason: 'x' } })).toContain('Hours are between 0.25 and 80');
  });
});

describe('curating', () => {
  it('moves a module, and leaves the plan alone at either end', () => {
    const p = plan(mod({ id: 'm1' }), mod({ id: 'm2' }));
    expect(moveModule(p, 'm1', -1)).toBe(p);
    expect(moveModule(p, 'm2', 1)).toBe(p);
    expect(moveModule(p, 'm1', 1).modules.map((m) => m.id)).toEqual(['m2', 'm1']);
  });
  it('removes a module and remembers its title, at most 30', () => {
    const p = plan(mod({ id: 'm1', title: 'Gone' }), mod({ id: 'm2' }));
    const out = removeModule(p, 'm1');
    expect(out.modules.map((m) => m.id)).toEqual(['m2']);
    expect(out.removed[out.removed.length - 1]).toBe('Gone');
    const full = removeModule({ ...p, removed: Array.from({ length: 30 }, (_, i) => 't' + i) }, 'm1');
    expect(full.removed).toHaveLength(PLAN_CAPS.removed);
    expect(full.removed[29]).toBe('Gone');
    expect(removeModule(p, 'nope')).toBe(p);
  });
  it('keeps accepted when the admin edits, and toggles it on request', () => {
    const p = plan(mod({ accepted: true }));
    expect(editModule(p, 'm1', { title: 'New' }).modules[0]).toMatchObject({ title: 'New', accepted: true, id: 'm1' });
    expect(acceptModule(p, 'm1', false).modules[0].accepted).toBe(false);
  });
});

describe('formats and source keys', () => {
  it('offers the formats of the studios, and not a Presentation', () => {
    for (const f of ['Flash cards', 'Practice exam', 'Animated flow', 'Avatar']) expect(PLAN_FORMATS).toContain(f);
    expect(PLAN_FORMATS).not.toContain('Presentation');
  });
  it('gives each reference a key', () => {
    expect(refKey({ kind: 'kb', bundleId: 'b1', chunk: 3 })).toBe('kb:b1#3');
    expect(refKey({ kind: 'file', sourceId: 's1', page: 2 })).toBe('file:s1#p2');
    expect(refKey({ kind: 'learning', learningId: 'L1' })).toBe('learning:L1');
  });
});
