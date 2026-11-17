// Explainer Studio (studios plan, Task 2.2) through the shared spine: the Shape answers it keeps (depth steers the draft,
// the ending is published), the three-question check drafted by AI only when the ending asks for it, the check shown in
// the Draft step and removable as a whole, and the ending and the check agreeing before the preview or the check.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/contributionStore';
import { emptyParts } from './logic/contribution';
import type { CreateData } from './logic/contribution';
import { DEPTH_QUESTION, END_CHECK, END_NONE, END_QUESTION, END_SUMMARY, NEEDS_CHECK, UNUSED_CHECK } from './logic/studioContent';
import { parseStudioItems, studioRequest } from './logic/studioItems';
import { CHECK_SIZE, rowsMax, studioById } from './logic/studios';
import type { StudioEntry, StudioItem } from './logic/studios';
import { flush, harness, member, person, stubWindow } from './test/harness';
import type { ExamQuestion, NewDraft } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async (_f: unknown, id?: string | null) => id ?? 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
}));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

const def = studioById('explainer')!;
const STEPS: StudioItem[] = [['Supplier', 'Creates the invoice.'], ['Access point', 'Checks the format.'], ['Customer', 'Gets the invoice.']];
const Q = (k: number): ExamQuestion => ({ t: 'Peppol', q: 'Question ' + k + '?', o: ['a', 'b', 'c', 'd'], a: k % 4, why: 'Because.' });
const CHECK = [Q(0), Q(1), Q(2)];
const PASSAGES = ['Peppol carries e-invoices between access points.', 'The access point checks the format.', 'The customer receives the invoice in its software.'];
const nwOf = (o: Partial<NewDraft> = {}): NewDraft => ({ line: 'Consulting', aud: '', type: 'Interactive explainer', title: 'How a Peppol e-invoice travels', dom: 'reg', lvl: '2', stage: 'Analyst',
  take: 'Peppol carries it.', outline: [], sources: [], ai: false, aiNote: '', ...o });
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 });
const open = (o: { list?: StudioEntry[]; shape?: Record<string, string>; live?: boolean; step?: number } = {}) => {
  const h = harness({ access: member('u1'), subject: person(), config: { liveAssistant: !!o.live },
    state: { screen: 'create', create: data(), createTab: 'new', nwKb: ['B1'], aiLive: o.live ? ['studio_draft'] : [], studio: { view: 'studio', step: o.step ?? 0, id: 'explainer' },
      nw: nwOf({ shape: o.shape ?? {}, items: { list: (o.list ?? []) as never, how: 'manual', problems: [], note: '' } }) } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  return Object.assign(h, { st: () => h.vm().create!.studio });
};

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Shape it', () => {
  it('asks the depth (it steers the AI draft) and the ending (it is published); no style, look or narration', () => {
    const h = open({ live: true });
    expect(h.st().steps).toEqual(['Idea & sources', 'Shape it', 'Draft', 'Preview & test', 'Check & send']);
    expect(h.st().shape.map((g) => [g.key, g.hint, g.chips.map((c) => c.label)])).toEqual([
      [DEPTH_QUESTION, 'Steers the AI draft', ['Overview', 'With technical detail']], [END_QUESTION, '', [END_CHECK, END_SUMMARY, END_NONE]]]);
  });
  it('offers the three-question check only when Draft with AI can write it', () => {
    const h = open();
    const end = h.st().shape.find((g) => g.key === END_QUESTION)!;
    expect(end.chips.map((c) => c.label)).toEqual([END_SUMMARY, END_NONE]);
    expect(end.hint).toBe('A three-question check is written by Draft with AI, which is not switched on');
  });
});

describe('Draft with AI', () => {
  it('asks for the check, within the cap, only when the explainer ends with it', () => {
    const ask = (shape: Record<string, string>) => studioRequest(def, nwOf({ shape }), PASSAGES);
    const withCheck = ask({ [END_QUESTION]: END_CHECK }).messages[0].content as string;
    expect(withCheck).toContain('"check"');
    expect(withCheck).toContain('exactly ' + CHECK_SIZE + ' multiple-choice questions');
    expect(withCheck).toContain('stay within ' + (rowsMax(def) - CHECK_SIZE) + ' rows');
    expect(ask({ [END_QUESTION]: END_SUMMARY }).messages[0].content).not.toContain('"check"');
    expect(ask({}).messages[0].content).toContain('stay within ' + rowsMax(def) + ' rows');
  });
  it('reads the check strictly: three well-formed questions after the steps, or nothing', () => {
    const shape = { [END_QUESTION]: END_CHECK };
    expect(parseStudioItems(def, JSON.stringify({ items: STEPS, check: CHECK }), shape)).toEqual([...STEPS, ...CHECK]);
    expect(parseStudioItems(def, JSON.stringify({ items: STEPS, check: CHECK.slice(0, 2) }), shape)).toBeNull();
    expect(parseStudioItems(def, JSON.stringify({ items: STEPS, check: [...CHECK.slice(0, 2), { ...Q(3), a: 7 }] }), shape)).toBeNull();
    expect(parseStudioItems(def, JSON.stringify({ items: STEPS }), shape)).toBeNull();
    expect(parseStudioItems(def, JSON.stringify({ items: STEPS, check: CHECK }), {})).toEqual(STEPS);
  });
  it('lands the AI steps and check as AI items', async () => {
    stubWindow({ claude: { complete: vi.fn(async () => JSON.stringify({ items: STEPS, check: CHECK })) } });
    const h = open({ live: true, shape: { [END_QUESTION]: END_CHECK }, step: 2 });
    await h.st().aiDraft.run();
    expect(h.state.nw.items).toMatchObject({ how: 'ai', list: [...STEPS, ...CHECK] });
    expect(h.st().rows.map((r) => r.label)).toEqual(['Supplier', 'Access point', 'Customer']);
    expect(h.st().check!.rows.map((r) => r.front)).toEqual(['Question 0?', 'Question 1?', 'Question 2?']);
    expect(h.st().problems).toEqual([]);
  });
});

describe('the Draft step', () => {
  it('edits and removes steps without touching the check', () => {
    const h = open({ list: [...STEPS, ...CHECK], shape: { [END_QUESTION]: END_CHECK } });
    h.st().rows[1].edit(1, 'Validates the format.');
    h.st().rows[0].remove();
    expect(h.state.nw.items!.list).toEqual([STEPS[1].slice(0, 1).concat('Validates the format.'), STEPS[2], ...CHECK]);
    h.st().add();
    expect(h.state.nw.items!.list.slice(-4)).toEqual([['', ''], ...CHECK]);
  });
  it('removes the check as a whole, and then asks for another ending', () => {
    const h = open({ list: [...STEPS, ...CHECK], shape: { [END_QUESTION]: END_CHECK } });
    expect(h.st().check!.rows[0].back).toBe('Answer: a · Because.');
    h.st().check!.remove();
    expect(h.state.nw.items!.list).toEqual(STEPS);
    expect(h.st().check).toBeNull();
    expect(h.st().problems).toEqual([NEEDS_CHECK]);
  });
  it('asks to remove a check the ending does not use, and shows no preview until they agree', () => {
    const h = open({ list: [...STEPS, ...CHECK], shape: { [END_QUESTION]: END_NONE } });
    expect(h.st().problems).toEqual([UNUSED_CHECK]);
    expect(h.st().content).toBeNull();
    h.st().send.check(); expect(store.checkContribution).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe(UNUSED_CHECK);
  });
  it('previews the steps with the check when they agree, and saves steps, check and answers', async () => {
    const h = open({ list: [...STEPS, ...CHECK], shape: { [END_QUESTION]: END_CHECK, [DEPTH_QUESTION]: 'Overview' } });
    expect(h.st().content).toMatchObject({ kind: 'explainer', end: END_CHECK, check: CHECK, steps: [{ label: 'Supplier', text: 'Creates the invoice.' }, expect.anything(), expect.anything()] });
    h.st().send.check(); await flush(10);
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ type: 'Interactive explainer', studio: 'explainer', items: [...STEPS, ...CHECK],
      shape: { [END_QUESTION]: END_CHECK, [DEPTH_QUESTION]: 'Overview' } }), null);
  });
});
