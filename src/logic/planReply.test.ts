// Reading the Trajectory AI's answer: strict (a wrong type or a cap gives null), citations and formats checked against what was
// sent (dropped and counted, never repaired), and merging a reply into the latest plan without losing what the admin accepted.
import { describe, expect, it } from 'vitest';
import { mergeReply, readPlanReply, seenKeys } from './planReply';
import type { PlanReply } from './planReply';
import type { Numbering } from './planPrompt';
import { emptyPlan, MANUAL_FORMATS, PLAN_CAPS, PLAN_FORMATS, refKey } from './trajectoryPlan';
import type { PlanModule } from './trajectoryPlan';

const numbering: Numbering = {
  passages: { P1: { ref: { kind: 'file', sourceId: 's1', page: 1, passage: 0 }, label: 'syllabus.pdf · p. 1', quote: 'The exam covers VAT.' }, P3: { ref: { kind: 'kb', bundleId: 'b1', chunk: 2 }, label: 'Guide · VAT', quote: 'Rates.' } },
  learnings: ['L1', 'L2'],
};
const prev = (id: string, over: Partial<PlanModule> = {}): PlanModule => ({ id, title: 'Old ' + id, depth: 'foundation', goals: ['g'], hours: 2, material: [], sources: [], checks: [], accepted: true, ...over });
let n = 0;
const read = (reply: unknown, previous: PlanModule[] = [prev('m1'), prev('m2')]) => { n = 0; return readPlanReply(typeof reply === 'string' ? reply : JSON.stringify(reply), { numbering, formats: PLAN_FORMATS, prev: previous, newId: () => 'new' + ++n }); };
const mod = (over: Record<string, unknown> = {}) => ({ title: 'VAT basics', depth: 'foundation', goals: ['Know the rules'], hours: 2, material: [{ kind: 'existing', learning: 'L1', reason: 'Covers it' }], sources: ['P1', 'L2'], checks: ['evidence'], ...over });
const body = (over: Record<string, unknown> = {}) => ({ reply: 'Here is a plan.', questions: [], brief: null, modules: [mod(), mod({ title: 'Two' }), mod({ title: 'Three' })], ...over });

describe('readPlanReply', () => {
  it('reads a reply with 3 valid modules, all not accepted', () => {
    const r = read(body())!;
    expect(r.modules).toHaveLength(3);
    expect(r.modules!.every((m) => m.accepted === false)).toBe(true);
    expect(r.modules![0]).toMatchObject({ title: 'VAT basics', hours: 2, material: [{ kind: 'existing', learningId: 'L1', reason: 'Covers it' }], checks: ['evidence'] });
    expect(r.modules![0].sources).toEqual([numbering.passages.P1, { ref: { kind: 'learning', learningId: 'L2' }, label: expect.any(String), quote: expect.any(String) }]);
    expect(r.dropped).toEqual({ sources: 0, learnings: 0, formats: 0 });
  });
  it('reads words around the JSON, and a reply with no modules', () => {
    expect(read('Sure!\n' + JSON.stringify(body({ modules: null })))!.modules).toBeNull();
  });
  it('drops a citation it was not given and says how many, leaving a module that cited only it with no sources', () => {
    const r = read(body({ modules: [mod({ sources: ['P99'] }), mod({ sources: ['P1', 'P99', 'L99'] })] }))!;
    expect(r.dropped.sources).toBe(3);
    expect(r.modules![0].sources).toEqual([]);
    expect(r.modules![1].sources).toHaveLength(1);
  });
  it('drops an existing learning that is not in the catalogue, and a studio format that is not allowed', () => {
    const r = read(body({ modules: [mod({ material: [{ kind: 'existing', learning: 'L999', reason: 'x' }, { kind: 'studio', format: 'Webinar', reason: 'x' }, { kind: 'studio', format: 'Flash cards', reason: 'x' }] })] }))!;
    expect(r.dropped).toMatchObject({ learnings: 1, formats: 1 });
    expect(r.modules![0].material).toEqual([{ kind: 'studio', format: 'Flash cards', reason: 'x' }]);
  });
  it('keeps a manual format and drops one that is neither', () => {
    const ok = read(body({ modules: [mod({ material: [{ kind: 'manual', format: 'Book', reason: 'x' }] })] }))!;
    expect(ok.modules![0].material).toEqual([{ kind: 'manual', format: 'Book', reason: 'x' }]);
    expect(MANUAL_FORMATS).toContain('Book');
    expect(read(body({ modules: [mod({ material: [{ kind: 'manual', format: 'Podcast', reason: 'x' }] })] }))!.dropped.formats).toBe(1);
  });
  it.each([
    ['a depth outside the three', { modules: [mod({ depth: 'advanced' })] }],
    ['hours as text', { modules: [mod({ hours: '3' })] }],
    ['hours that are not quarters', { modules: [mod({ hours: 1.1 })] }],
    ['a check that is the exam', { modules: [mod({ checks: ['exam'] })] }],
    ['13 modules', { modules: Array.from({ length: 13 }, () => mod()) }],
    ['a reply of 1,201 characters', { reply: 'x'.repeat(1201) }],
    ['an empty reply', { reply: '  ' }],
    ['more than 3 questions', { questions: ['a', 'b', 'c', 'd'] }],
    ['an empty module list', { modules: [] }],
    ['a module without a title', { modules: [mod({ title: '' })] }],
    ['6 goals', { modules: [mod({ goals: Array(6).fill('g') })] }],
    ['an unknown material kind', { modules: [mod({ material: [{ kind: 'web', reason: 'x' }] })] }],
    ['an id that is not text', { modules: [mod({ id: 5 })] }],
    ['a brief that is not an object', { brief: 'a brief' }],
  ])('gives null for %s', (_name, over) => { expect(read(body(over))).toBeNull(); });
  it('gives null for text that is not JSON', () => { expect(read('not json')).toBeNull(); });
  it('keeps a known id, gives any other the app\'s id, and never repeats one', () => {
    const r = read(body({ modules: [mod({ id: 'm1' }), mod({ id: 'zz' }), mod({ id: 'm1' })] }))!;
    expect(r.modules!.map((m) => m.id)).toEqual(['m1', 'new1', 'new2']);
  });
  it('reads the final exam: absent keeps, null clears, an object is checked', () => {
    expect('finalExam' in read(body())!).toBe(false);
    expect(read(body({ finalExam: null }))!.finalExam).toBeNull();
    expect(read(body({ finalExam: { title: 'Exam', hours: 2, reason: 'Ends it' } }))!.finalExam).toEqual({ title: 'Exam', hours: 2, reason: 'Ends it' });
    expect(read(body({ finalExam: { title: 'Exam', hours: 'two', reason: 'x' } }))).toBeNull();
  });
  it('reads a brief, with its numbers and nulls', () => {
    const brief = { goal: 'g', credential: 'c', issuer: 'i', audience: 'a', stage: null, line: 'Audit', level: 'applied', hoursBudget: 40, deadline: null, bodyRules: '', constraints: '', domain: 'tax' };
    expect(read(body({ brief }))!.brief).toEqual(brief);
    expect(read(body({ brief: { ...brief, hoursBudget: '40' } }))).toBeNull();
  });
  it('stays within the plan caps', () => { expect(PLAN_CAPS.modules).toBe(12); });
});

describe('mergeReply', () => {
  const reply = (over: Partial<PlanReply> = {}): PlanReply => ({ reply: 'r', questions: [], brief: null, modules: null, dropped: { sources: 0, learnings: 0, formats: 0 }, ...over });
  const plan = (modules: PlanModule[], removed: string[] = ['Gone']) => ({ ...emptyPlan(), modules, removed });
  const cite = (page: number) => ({ ref: { kind: 'file' as const, sourceId: 's1', page, passage: 0 }, label: 'p. ' + page, quote: 'q' });
  const seenAll = new Set<string>();
  const merge = (latest: ReturnType<typeof plan>, r: PlanReply, snapshot = latest, seen = seenAll) => mergeReply(latest, r, { snapshot, seen });
  const fresh = (m: PlanModule, over: Partial<PlanModule> = {}): PlanModule => ({ ...m, accepted: false, ...over });
  it('replaces a module that is not accepted and was not edited, never accepted', () => {
    const m1 = prev('m1', { accepted: false });
    expect(merge(plan([m1]), reply({ modules: [fresh(m1, { title: 'Better' })] })).plan.modules.map((m) => [m.title, m.accepted])).toEqual([['Better', false]]);
  });
  it('keeps an accepted module as it is and offers a changed version as a suggestion', () => {
    const m1 = prev('m1'), m2 = prev('m2');
    const r = merge(plan([m1, m2]), reply({ modules: [fresh(m1), fresh(m2, { title: 'Changed' })] }));
    expect(r.plan.modules.map((m) => [m.id, m.title, m.accepted])).toEqual([['m1', 'Old m1', true], ['m2', 'Old m2', true]]);
    expect(r.plan.modules[0].suggestion).toBeUndefined();
    expect(r.plan.modules[1].suggestion).toMatchObject({ title: 'Changed' });
    expect(r.suggested).toBe(1);
  });
  it('compares content whatever the order of the keys (as a stored plan comes back)', () => {
    const stored = JSON.parse(JSON.stringify(prev('m1', { material: [{ kind: 'existing', learningId: 'L1', reason: 'x' }] }), ['reason', 'learningId', 'kind', 'accepted', 'checks', 'sources', 'material', 'hours', 'goals', 'depth', 'title', 'id']));
    const same = fresh(prev('m1', { material: [{ kind: 'existing', learningId: 'L1', reason: 'x' }] }));
    expect(merge(plan([stored]), reply({ modules: [same] })).plan.modules[0].suggestion).toBeUndefined();
  });
  it('never deletes an accepted module the reply leaves out, and says how many it kept', () => {
    const m1 = prev('m1'), m2 = prev('m2', { accepted: false }), m3 = prev('m3');
    const r = merge(plan([m1, m2, m3]), reply({ modules: [fresh(m2, { title: 'Only this' })] }));
    expect(r.plan.modules.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(r.kept).toBe(2);
  });
  it('lets the AI drop a module that was neither accepted nor edited', () => {
    const m1 = prev('m1', { accepted: false }), m2 = prev('m2', { accepted: false });
    expect(merge(plan([m1, m2]), reply({ modules: [fresh(m1)] })).plan.modules.map((m) => m.id)).toEqual(['m1']);
  });
  it('keeps the admin\'s edit made while the AI worked, and never overwrites it', () => {
    const snapshot = plan([prev('m1', { accepted: false })]), latest = plan([prev('m1', { accepted: false, title: 'Admin title' })]);
    const r = merge(latest, reply({ modules: [fresh(prev('m1'), { title: 'AI title' })] }), snapshot);
    expect(r.plan.modules.map((m) => m.title)).toEqual(['Admin title']);
  });
  it('does not bring back a module the admin removed while it worked, nor one whose title was removed', () => {
    const snapshot = plan([prev('m1', { accepted: false }), prev('m2', { accepted: false })]), latest = plan([prev('m1', { accepted: false })], ['Old m2']);
    const r = merge(latest, reply({ modules: [fresh(prev('m1')), fresh(prev('m2')), fresh(prev('zz'), { title: 'Old m2' }), fresh(prev('new1'), { title: 'Fresh idea' })] }), snapshot);
    expect(r.plan.modules.map((m) => m.title)).toEqual(['Old m1', 'Fresh idea']);
  });
  it('keeps the citations the AI was not shown, whether or not they were numbered, and never drops accepted for it', () => {
    const unseen = cite(20), seenOne = cite(1), seen = new Set([refKey(seenOne.ref)]);
    const accepted = prev('m1', { sources: [unseen, seenOne] }), open = prev('m2', { accepted: false, sources: [unseen, seenOne] });
    const r = merge(plan([accepted, open]), reply({ modules: [fresh(accepted, { sources: [seenOne] }), fresh(open, { sources: [], title: 'Revised' })] }), undefined, seen);
    expect(r.plan.modules[0].accepted).toBe(true);
    expect(r.plan.modules[0].suggestion).toBeUndefined();
    expect(r.plan.modules[1].sources).toEqual([unseen]);
    expect(r.plan.modules[1].title).toBe('Revised');
  });
  it('leaves the modules as they were when the reply has none, and keeps the removed titles', () => {
    const p = plan([prev('m1')]);
    const merged = merge(p, reply({ reply: 'only talk' })).plan;
    expect(merged.modules).toEqual(p.modules);
    expect(merged.removed).toEqual(['Gone']);
  });
  it('replaces the brief only when the reply has one, and the final exam only when it says', () => {
    const brief = { goal: 'g', credential: 'c', issuer: 'i', audience: 'a', stage: null, line: null, level: 'l', hoursBudget: null, deadline: null, bodyRules: '', constraints: '', domain: 'd' };
    const p = { ...plan([]), brief, finalExam: { title: 'E', hours: 2, reason: 'r' } };
    expect(merge(p, reply()).plan.brief).toBe(brief);
    expect(merge(p, reply()).plan.finalExam).toEqual(p.finalExam);
    expect(merge(p, reply({ finalExam: null })).plan.finalExam).toBeNull();
    expect(merge(p, reply({ brief: { ...brief, goal: 'new' } })).plan.brief!.goal).toBe('new');
  });
});

describe('seenKeys', () => {
  it('lists the references numbered in the request, passages and learnings', () => {
    expect([...seenKeys(numbering)].sort()).toEqual(['file:s1#p1.0', 'kb:b1#2', 'learning:L1', 'learning:L2']);
  });
});

describe('the final exam caps', () => {
  it('refuses a title over 120 characters or a reason over 240, so the plan JSON cannot be cut', () => {
    expect(read(body({ finalExam: { title: 'x'.repeat(121), hours: 2, reason: 'r' } }))).toBeNull();
    expect(read(body({ finalExam: { title: 'Exam', hours: 2, reason: 'r'.repeat(241) } }))).toBeNull();
    expect(read(body({ finalExam: { title: 'x'.repeat(120), hours: 2, reason: 'r'.repeat(240) } }))).not.toBeNull();
  });
});
