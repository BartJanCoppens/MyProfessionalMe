// The E-learning Studio's spine (E-learning Studio plan, Task 1.2): its lesson rows in Draft with the course's blocks kept attached, Draft with AI for the
// lessons only, and the move from Draft to Produce that gives every lesson without blocks its first text block.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/contributionStore';
import { emptyParts } from './logic/contribution';
import type { CreateData } from './logic/contribution';
import { lessonsOf } from './logic/courseContent';
import type { CourseBlock } from './logic/courseContent';
import { studioRequest } from './logic/studioItems';
import { studioById } from './logic/studios';
import type { StudioEntry } from './logic/studios';
import { harness, member, person, stubWindow } from './test/harness';
import type { Item } from './logic/items';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async () => 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
  loadGrants: vi.fn(), addGrant: vi.fn(), removeGrant: vi.fn(), loadExperts: vi.fn(), setExpert: vi.fn(),
}));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

const def = studioById('elearn')!;
const text = (id: string, lesson: number): CourseBlock => ({ block: 'text', id, lesson, h: 'H ' + id, t: 'Words ' + id });
const list = (): Item[] => [['Lesson 1', 'One', 'First'], ['Lesson 2', 'Two', 'Second'], ['Lesson 3', 'Three', 'Third'], text('b0001', 0), text('b0002', 0), text('b0003', 1), text('b0004', 2)] as Item[];
const at = (step: number, items: Item[] = list(), live = false) => {
  const nw = { line: 'Consulting', aud: '', type: 'E-learning', title: 'Cross-border VAT', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'Know where VAT is due.', outline: [], sources: [], ai: false, aiNote: '', items: { list: items, how: 'manual' as const, problems: [], note: '' } };
  const data: CreateData = { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 };
  const h = harness({ access: member('u1'), subject: person(), config: { liveAssistant: live }, state: { screen: 'create', create: data, createTab: 'new', nw, nwKb: ['B1'], studio: { view: 'studio', step, id: 'elearn' } } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  return Object.assign(h, { st: () => h.vm().create!.studio, items: () => h.state.nw.items!.list as StudioEntry[] });
};
beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('the E-learning Studio\'s Draft step', () => {
  it('shows the lessons as rows of label, title and summary', () => {
    const h = at(2);
    expect(h.st().rows.map((r) => [r.label, r.text, r.text2])).toEqual([['Lesson 1', 'One', 'First'], ['Lesson 2', 'Two', 'Second'], ['Lesson 3', 'Three', 'Third']]);
    expect(h.st().hasText2).toBe(true);
  });
  it('editing a lesson title keeps its blocks', () => {
    const h = at(2);
    h.st().rows[0].edit(1, 'One, renamed');
    expect(lessonsOf(h.items()).map((l) => [l.title, l.blocks.map((b) => b.id)])).toEqual([['One, renamed', ['b0001', 'b0002']], ['Two', ['b0003']], ['Three', ['b0004']]]);
  });
  it('removing lesson 2 removes its blocks and moves the later blocks up', () => {
    const h = at(2);
    h.st().rows[1].remove();
    expect(lessonsOf(h.items()).map((l) => [l.title, l.blocks.map((b) => b.id)])).toEqual([['One', ['b0001', 'b0002']], ['Three', ['b0004']]]);
    expect(h.items().some((x) => !Array.isArray(x) && (x as CourseBlock).id === 'b0003')).toBe(false);
  });
  it('adding a lesson keeps every block', () => {
    const h = at(2);
    h.st().add();
    expect(h.items().filter(Array.isArray)).toHaveLength(4);
    expect(h.items().filter((x) => !Array.isArray(x))).toHaveLength(4);
  });
});

describe('from Draft to Produce', () => {
  it('seeds each lesson without blocks with a text block of its title and summary', () => {
    const h = at(2, list().slice(0, 3));
    h.st().next();
    expect(h.state.studio.step).toBe(3);
    expect(lessonsOf(h.items()).map((l) => l.blocks.map((b) => (b.block === 'text' ? [b.h, b.t] : [])))).toEqual([[['One', 'First']], [['Two', 'Second']], [['Three', 'Third']]]);
  });
  it('leaves lessons that have blocks alone', () => {
    const h = at(2);
    h.st().next();
    expect(h.items()).toEqual(list());
  });
  it('does not leave Draft with fewer than 2 lessons', () => {
    const h = at(2, list().slice(0, 1));
    h.st().next();
    expect(h.state.studio.step).toBe(2);
    expect(h.lastToast()).toBe('Add at least 2 lessons');
  });
  it('keeps the Produce step for the course editor, with a lead of its own', () => {
    const h = at(3);
    expect(h.st().stepName).toBe('Produce');
    expect(h.st().stepHint).toMatch(/lesson/i);
  });
});

describe('Draft with AI for the lessons', () => {
  it('asks for Lesson rows of title and summary only, never for blocks, up to 12 lessons', () => {
    const ask = studioRequest(def, { ...at(2).state.nw, shape: { 'Who is it for?': 'Tax specialists' } }, ['A passage.']).messages[0].content as string;
    expect(ask).toContain('"Lesson 1"');
    expect(ask).toContain('["label","text","text2"]');
    expect(ask).toContain('<<<Who is it for?: Tax specialists>>>');
    expect(ask).toMatch(/Between 2 and 12 rows/);
  });
  it('a valid answer lands as the lesson rows, AI-drafted', async () => {
    const rows = [['Lesson 1', 'Place of supply', 'Where a service is taxed'], ['Lesson 2', 'The invoice', 'What it must say']];
    stubWindow({ claude: { complete: vi.fn(async () => JSON.stringify({ items: rows })) } });
    const h = at(2, [], true);
    await h.st().aiDraft.run();
    expect(h.state.nw.items).toMatchObject({ how: 'ai', list: rows });
  });
  it('a malformed answer falls back to scripted lesson rows, never marked AI', async () => {
    stubWindow({ claude: { complete: vi.fn(async () => '{"items":[["only one"]]}') } });
    const h = at(2, [], true);
    await h.st().aiDraft.run();
    expect(h.state.nw.items!.how).toBe('scripted');
    expect(h.st().itemsLabel).toBe('Scripted from the bundle');
    const rows = h.items().filter(Array.isArray) as string[][];
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r, k) => { expect(r).toHaveLength(3); expect(r[0]).toBe('Lesson ' + (k + 1)); });
  });
});

describe('drafting again after blocks were built', () => {
  const rows = [['Lesson 1', 'Place', 'Where'], ['Lesson 2', 'Invoice', 'What'], ['Lesson 3', 'Report', 'When']];
  it('keeps the blocks attached to the lessons that remain (AI)', async () => {
    stubWindow({ claude: { complete: vi.fn(async () => JSON.stringify({ items: rows })) } });
    const h = at(2, list(), true);
    await h.st().aiDraft.run();
    expect(h.state.nw.items!.how).toBe('ai');
    expect(lessonsOf(h.items()).map((l) => [l.title, l.blocks.map((b) => b.id)])).toEqual([['Place', ['b0001', 'b0002']], ['Invoice', ['b0003']], ['Report', ['b0004']]]);
  });
  it('keeps them through the scripted draft too, and says when a lesson with blocks goes', async () => {
    const h = at(2, list());
    await h.st().aiDraft.run();
    expect(h.state.nw.items!.how).toBe('scripted');
    const kept = h.items().filter((x) => !Array.isArray(x)).length;
    expect(kept).toBeGreaterThan(0);
    const n = h.items().filter(Array.isArray).length;
    if (n < 3) expect(h.lastToast()).toMatch(/blocks/);
  });
});
