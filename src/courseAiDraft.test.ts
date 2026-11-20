// AI help in the E-learning Studio's Produce step: fill a lesson, draft all lessons, suggest one block. One pipeline (studio_draft through viaAi), strict reading,
// nothing scripted presented as AI, existing blocks kept.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/contributionStore';
import { emptyParts } from './logic/contribution';
import type { CreateData } from './logic/contribution';
import { lessonsOf } from './logic/courseContent';
import type { CourseBlock } from './logic/courseContent';
import type { StudioEntry } from './logic/studios';
import type { Item } from './logic/items';
import { harness, member, person, stubWindow } from './test/harness';
import type { AppState } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async () => 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
  loadGrants: vi.fn(), addGrant: vi.fn(), removeGrant: vi.fn(), loadExperts: vi.fn(), setExpert: vi.fn(),
}));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

// The sources can run out partway through a draft-all (groundedPassages answers null after `cutAfter` calls).
const sources = vi.hoisted(() => ({ cutAfter: Infinity, calls: 0 }));
vi.mock('./studioDraft', async (orig) => {
  const real = await orig<typeof import('./studioDraft')>();
  return { ...real, groundedPassages: (...a: Parameters<typeof real.groundedPassages>) => (++sources.calls > sources.cutAfter ? null : real.groundedPassages(...a)) };
});

const text = (id: string, lesson: number): CourseBlock => ({ block: 'text', id, lesson, h: 'H ' + id, t: 'Words ' + id });
const list = (): Item[] => [['Lesson 1', 'One', 'First'], ['Lesson 2', 'Two', 'Second'], ['Lesson 3', 'Three', 'Third'], text('b0001', 0), text('b0002', 0), text('b0003', 1)] as Item[];
const Q = { block: 'check', t: 'T', q: 'Which?', o: ['a', 'b', 'c', 'd'], a: 2, why: 'Because.' };
const GOOD = [{ block: 'text', h: 'AI heading', t: 'AI text.' }, { block: 'callout', t: 'AI callout.' }, Q];
const answer = (blocks: unknown[]) => JSON.stringify({ blocks });
const at = (o: { live?: boolean; items?: Item[]; state?: Partial<AppState>; readOnly?: boolean } = {}) => {
  const nw = { line: 'Consulting', aud: '', type: 'E-learning', title: 'Cross-border VAT', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'Know where VAT is due.', outline: [], sources: [], ai: false, aiNote: '',
    items: { list: o.items ?? list(), how: 'manual' as const, problems: [], note: '' } };
  const data: CreateData = { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 };
  const h = harness({ access: member('u1'), subject: person({ readOnly: o.readOnly }), config: { liveAssistant: o.live ?? true },
    state: { screen: 'create', create: data, createTab: 'new', nw, nwKb: ['B1'], studio: { view: 'studio', step: 3, id: 'elearn' }, ...o.state } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  return Object.assign(h, { ai: () => h.vm().create!.studio.course!.ai!, course: () => h.vm().create!.studio.course!, items: () => h.state.nw.items!.list as StudioEntry[],
    blocksOf: (k: number) => lessonsOf(h.state.nw.items!.list).map((l) => l.blocks)[k] });
};
const ai = (fn: (req: unknown) => Promise<string>) => { const complete = vi.fn(fn); stubWindow({ claude: { complete } }); return complete; };
beforeEach(() => { stubWindow(); vi.clearAllMocks(); sources.cutAfter = Infinity; sources.calls = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('fill a lesson', () => {
  it('asks once, from the lesson and the chosen bundles as marked data, under studio_draft', async () => {
    const complete = ai(async () => answer(GOOD));
    const h = at();
    await h.ai().fillLesson.run();
    expect(complete).toHaveBeenCalledTimes(1);
    const req = JSON.stringify(complete.mock.calls[0][0]);
    expect(req).toContain('<<<One>>>');
    expect(req).toContain('<<<Cross-border VAT>>>');
    expect(req).toMatch(/Use ONLY these passages/);
  });
  it('keeps the existing blocks, adds the new ones after them, marks the course AI-assisted and the new blocks "AI draft"', async () => {
    ai(async () => answer(GOOD));
    const h = at();
    await h.ai().fillLesson.run();
    const k = h.blocksOf(0);
    expect(k.map((b) => b.block)).toEqual(['text', 'text', 'text', 'callout', 'check']);
    expect(k.slice(0, 2).map((b) => b.id)).toEqual(['b0001', 'b0002']);
    expect(h.blocksOf(1).map((b) => b.id)).toEqual(['b0003']);
    expect(h.state.nw.items!.how).toBe('ai');
    expect(h.lastToast()).toBe('Added 3 blocks from your sources · review each one');
    expect(h.state.courseAi.ids).toEqual(k.slice(2).map((b) => b.id));
    expect(h.vm().create!.studio.course!.blocks.map((b) => b.ai)).toEqual([false, false, true, true, true]);
  });
  it('drops blocks that fail the course rules and says how many', async () => {
    ai(async () => answer([GOOD[0], { ...Q, o: ['a', 'b'] }, { block: 'image', path: '', alt: 'x', cap: '' }]));
    const h = at();
    await h.ai().fillLesson.run();
    expect(h.blocksOf(0).map((b) => b.block)).toEqual(['text', 'text', 'text']);
    expect(h.lastToast()).toBe('Added 1 block from your sources · review each one · 2 dropped: they did not fit the course rules or the lesson\'s room');
  });
  it('unusable JSON adds nothing, says so, and never calls scripted blocks AI', async () => {
    ai(async () => 'nope');
    const h = at();
    await h.ai().fillLesson.run();
    expect(h.items()).toEqual(list());
    expect(h.state.nw.items!.how).toBe('manual');
    expect(h.lastToast()).toBe('AI did not return usable blocks · try again');
  });
  it('with AI off it adds nothing and says so', async () => {
    const h = at({ live: false });
    await h.ai().fillLesson.run();
    expect(h.items()).toEqual(list());
    expect(h.lastToast()).toBe('AI drafting is not switched on · add blocks yourself');
  });
  it('a refusal of the use (daily limit) is said in its own words', async () => {
    ai(async () => { throw new Error('Daily AI limit reached (50)'); });
    const h = at();
    await h.ai().fillLesson.run();
    expect(h.items()).toEqual(list());
    expect(h.lastToast()).toBe('Daily AI limit reached (50)');
  });
  it('refuses without a bundle, and when the lesson is full', async () => {
    const complete = ai(async () => answer(GOOD));
    const h = at({ state: { nwKb: [] } });
    await h.ai().fillLesson.run();
    expect(h.lastToast()).toBe('Pick at least one knowledge bundle');
    const full = at({ items: [...list(), ...Array.from({ length: 18 }, (_, i) => text('c' + String(i).padStart(4, '0'), 0))] });
    await full.ai().fillLesson.run();
    expect(full.lastToast()).toBe('A lesson holds at most 20 blocks');
    expect(complete).not.toHaveBeenCalled();
  });
  it('keeps the blocks the creator added while it ran, and takes the lesson by its place', async () => {
    const h = at();
    ai(async () => { h.L().setState((s) => ({ nw: { ...s.nw, items: { ...s.nw.items!, list: [...s.nw.items!.list, text('b0009', 0) as Item] } } })); return answer(GOOD); });
    await h.ai().fillLesson.run();
    expect(h.blocksOf(0).map((b) => b.id).filter((id) => /^b000/.test(id))).toEqual(['b0001', 'b0002', 'b0009']);
    expect(h.blocksOf(0)).toHaveLength(6);
  });
  it('one AI action at a time', async () => {
    const complete = ai(async () => answer(GOOD));
    const h = at({ state: { nwAiBusy: true } });
    await h.ai().fillLesson.run();
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('the draft changes while the AI works', () => {
  it('adds nothing to the other draft and says so', async () => {
    const h = at();
    ai(async () => { h.L().setState((s) => ({ nw: { ...s.nw, key: 'another' } })); return answer(GOOD); });
    await h.ai().fillLesson.run();
    expect(h.items()).toEqual(list());
    expect(h.state.courseAi.ids).toEqual([]);
    expect(h.lastToast()).toBe('The lesson changed meanwhile · nothing added');
  });
  it('a suggestion does not move the selection when the creator went to another lesson', async () => {
    const h = at({ state: { courseEdit: { lesson: 0, block: 'b0001' } } });
    ai(async () => { h.L().setState({ courseEdit: { lesson: 1, block: null } }); return answer([{ block: 'reflect', p: 'Q?' }]); });
    await h.course().shelf.flatMap((g) => g.items).find((i) => i.label === 'Reflection')!.suggest!();
    expect(h.state.courseEdit).toEqual({ lesson: 1, block: null });
  });
  it('valid blocks beyond the lesson\'s room count as dropped, and the note says so', async () => {
    ai(async () => answer([GOOD[0], GOOD[1], Q, { block: 'reflect', p: 'x' }, { block: 'text', h: 'a', t: 'b' }, { block: 'callout', t: 'c' }]));
    const h = at({ items: [...list(), ...Array.from({ length: 16 }, (_, i) => text('c' + String(i).padStart(4, '0'), 0))] });
    await h.ai().fillLesson.run();
    expect(h.blocksOf(0)).toHaveLength(20);
    expect(h.lastToast()).toBe('Added 2 blocks from your sources · review each one · 4 dropped: they did not fit the course rules or the lesson\'s room');
  });
  it('draft all keeps the summary of what it added when the sources run out', async () => {
    ai(async () => answer([GOOD[0]]));
    sources.cutAfter = 1;
    const h = at();
    await h.ai().fillAll.run();
    expect(h.blocksOf(0)).toHaveLength(3);
    expect(h.blocksOf(1)).toHaveLength(1);
    expect(h.lastToast()).toBe('Added 1 block from your sources in 1 lesson · review each one · no sources left to draft from');
  });
});

describe('suggest one block', () => {
  const shelf = (h: ReturnType<typeof at>, label: string) => h.course().shelf.flatMap((g) => g.items).find((i) => i.label === label)!;
  it('is offered for the eight kinds, not for an image, hotspot or embed', () => {
    const h = at();
    const all = h.course().shelf.flatMap((g) => g.items);
    expect(all.filter((i) => i.suggest).map((i) => i.label)).toEqual(['Text', 'Callout', 'Accordion', 'Knowledge check', 'Sort into groups', 'Branching scenario', 'Reflection', 'Calculation exercise']);
  });
  it('puts the block after the selected block and selects it', async () => {
    const complete = ai(async () => answer([{ block: 'reflect', p: 'What would you do?' }]));
    const h = at({ state: { courseEdit: { lesson: 0, block: 'b0001' } } });
    await shelf(h, 'Reflection').suggest!();
    expect(h.blocksOf(0).map((b) => b.block)).toEqual(['text', 'reflect', 'text']);
    expect(h.blocksOf(0)[1]).toMatchObject({ p: 'What would you do?' });
    expect(JSON.stringify(complete.mock.calls[0][0])).toMatch(/exactly one block/);
    expect(h.state.courseAi.ids).toEqual([h.blocksOf(0)[1].id]);
    expect(h.state.courseEdit.block).toBe(h.blocksOf(0)[1].id);
    expect(h.state.nw.items!.how).toBe('ai');
  });
  it('without a selected block it goes to the end of the lesson', async () => {
    ai(async () => answer([{ block: 'callout', t: 'Note.' }]));
    const h = at();
    await shelf(h, 'Callout').suggest!();
    expect(h.blocksOf(0).map((b) => b.block)).toEqual(['text', 'text', 'callout']);
  });
  it('a block of another kind than asked is dropped and nothing is added', async () => {
    ai(async () => answer([{ block: 'text', h: 'x', t: 'y' }]));
    const h = at();
    await shelf(h, 'Callout').suggest!();
    expect(h.items()).toEqual(list());
    expect(h.lastToast()).toBe('AI did not return usable blocks · try again');
  });
});

describe('draft all lessons', () => {
  it('goes one lesson at a time, shows progress, and leaves a lesson that failed alone', async () => {
    let n = 0;
    const complete = ai(async () => (++n === 2 ? 'nope' : answer([GOOD[0]])));
    const h = at();
    await h.ai().fillAll.run();
    expect([...new Set(h.patches.map((p) => p.courseAi?.progress).filter(Boolean))]).toEqual(['Drafting lesson 1 of 3', 'Drafting lesson 2 of 3', 'Drafting lesson 3 of 3']);
    expect(complete).toHaveBeenCalledTimes(3);
    expect(h.blocksOf(0)).toHaveLength(3);
    expect(h.blocksOf(1)).toHaveLength(1);
    expect(h.blocksOf(2)).toHaveLength(1);
    expect(h.lastToast()).toBe('Added 2 blocks from your sources in 2 lessons · review each one · Lesson 2: AI did not return usable blocks · try again');
    expect(h.state.courseAi.progress).toBeNull();
    expect(h.state.nwAiBusy).toBe(false);
  });
  it('stops when the daily limit is reached, keeps what it added, and says so', async () => {
    let n = 0;
    const complete = ai(async () => { if (++n === 2) throw new Error('Daily AI limit reached (50)'); return answer([GOOD[0]]); });
    const h = at();
    await h.ai().fillAll.run();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(h.blocksOf(0)).toHaveLength(3);
    expect(h.lastToast()).toBe('Added 1 block from your sources in 1 lesson · review each one · Daily AI limit reached (50) · lessons 2 to 3 were not drafted');
    expect(h.state.nw.items!.how).toBe('ai');
  });
  it('skips a lesson that is full', async () => {
    const complete = ai(async () => answer([GOOD[0]]));
    const h = at({ items: [...list(), ...Array.from({ length: 19 }, (_, i) => text('c' + String(i).padStart(4, '0'), 1))] });
    await h.ai().fillAll.run();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(h.blocksOf(1)).toHaveLength(20);
  });
});

describe('who may use it', () => {
  it('View as has no AI actions and no suggest links, and nothing is called', async () => {
    const complete = ai(async () => answer(GOOD));
    const h = at({ readOnly: true });
    expect(h.course().ai).toBeNull();
    expect(h.course().shelf).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });
  it('editing an AI block takes its "AI draft" marker off', async () => {
    ai(async () => answer([GOOD[1]]));
    const h = at();
    await h.ai().fillLesson.run();
    const id = h.blocksOf(0)[2].id;
    h.L().setState({ courseEdit: { lesson: 0, block: id } });
    h.course().inspector!.fields[0].set('Edited.');
    expect(h.state.courseAi.ids).toEqual([]);
  });
});
