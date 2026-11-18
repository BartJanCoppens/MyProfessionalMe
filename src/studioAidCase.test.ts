// Job Aid Studio and Case Studio (studios plan, Task 2.1) through the shared spine: available on the hub, rows and "Shape
// it" answers saved with every studio draft, the preview's content built as publishing builds it, a saved draft edited
// again keeps its rows, and reviewers see the rows they approve.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/contributionStore';
import { emptyParts } from './logic/contribution';
import type { CreateData, Rule } from './logic/contribution';
import { EVIDENCE_QUESTION, studioContent } from './logic/studioContent';
import type { StudioItem } from './logic/studios';
import { contribution, review } from './test/contributions';
import { flush, harness, member, person, stubWindow } from './test/harness';
import type { AppState } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async (_fields: unknown, id?: string | null) => id ?? 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
}));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

const rule: Rule = { id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] };
const data = (o: Partial<CreateData> = {}): CreateData => ({ contributions: [], reviews: [], rules: [rule], policies: [], peers: 3, ...o });
const AID: StudioItem[] = [['Before', 'Objectives agreed'], ['Before', 'Stakeholder map'], ['During', 'Who signs off'], ['After', 'Minutes in 24 hours']];
const CASE: StudioItem[] = [['Brief', 'Two companies merged.'], ['Deliverable', 'A roadmap'], ['Deliverable', 'Three decisions'], ['Criterion', 'Realism']];
const rows = (list: StudioItem[]) => ({ list, how: 'manual' as const, problems: [], note: '' });
const nwOf = (type: string, o: object = {}) => ({ line: 'Consulting', aud: '', type, title: 'Client kick-off', dom: 'prof', lvl: '2', stage: 'Analyst', take: 'Tick it before the kick-off.', outline: [], sources: [], ai: false, aiNote: '', ...o });
const open = (o: { nw?: object; studio?: AppState['studio']; data?: CreateData; state?: Partial<AppState> } = {}) => {
  const h = harness({ access: member('u1'), subject: person(), state: { screen: 'create', create: o.data || data(), createTab: 'new', nw: nwOf('Job aid', o.nw), nwKb: [], studio: o.studio ?? { view: 'hub', step: 0 }, ...o.state } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  return Object.assign(h, { c: () => h.vm().create!, st: () => h.vm().create!.studio });
};
const card = (h: ReturnType<typeof open>, id: string) => h.st().cards.find((x) => x.id === id)!;
const stepOf = (h: ReturnType<typeof open>, name: string) => h.st().steps.indexOf(name);

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });

describe('the Shape and Produce steps', () => {
  it('says which questions only steer the AI draft; the ones that change the case do not', () => {
    const h = open({ studio: { view: 'studio', step: 0, id: 'case' }, nw: nwOf('Case exercise') });
    expect(h.st().shape.map((g) => [g.key, g.hint])).toEqual([['How long should it take?', ''], [EVIDENCE_QUESTION, '']]);
    // Produce comes after Draft: its answers are used when the creator drafts again.
    expect(h.st().produce.map((g) => [g.key, g.hint])).toEqual([['Names', 'Used when you draft again']]);
    const a = open({ studio: { view: 'studio', step: 0, id: 'aid' } });
    expect(a.st().shape.every((g) => g.hint === 'Steers the AI draft')).toBe(true);
    expect(a.st().produce.map((g) => [g.key, g.hint])).toEqual([['Template', 'Used when you draft again']]);
  });
});

describe('the hub', () => {
  it('opens the Job Aid Studio and the Case Studio', () => {
    const h = open();
    expect(h.st().cards.filter((x) => !x.disabled).map((x) => x.id)).toEqual(['podcast', 'slides', 'motion', 'explainer', 'aid', 'flash', 'case']);
    card(h, 'case').open();
    expect(h.state.studio).toMatchObject({ view: 'studio', id: 'case', step: 0 });
    expect(h.state.nw.type).toBe('Case exercise');
  });
});

describe('saving a studio draft', () => {
  it('saves the rows, the studio and the Shape answers with the check', async () => {
    const shape = { 'Template?': 'Checklist' };
    const h = open({ studio: { view: 'studio', step: 0, id: 'aid' }, nw: { items: rows(AID), shape } });
    h.L().setState({ studio: { view: 'studio', id: 'aid', step: stepOf(h, 'Check & send') } });
    h.st().send.check(); await flush();
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ type: 'Job aid', studio: 'aid', items: AID, shape }), null);
  });
  it('keeps the case\'s evidence answer with the draft', async () => {
    const shape = { [EVIDENCE_QUESTION]: 'Yes' };
    const h = open({ studio: { view: 'studio', step: 0, id: 'case' }, nw: nwOf('Case exercise', { items: rows(CASE), shape }) });
    h.L().setState({ studio: { view: 'studio', id: 'case', step: stepOf(h, 'Check & send') } });
    h.st().send.check(); await flush();
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ type: 'Case exercise', studio: 'case', items: CASE, shape }), null);
  });
  it('saves no rows and no answers from the upload form', async () => {
    const h = open({ studio: { view: 'form', step: 0 }, nw: nwOf('Podcast') });
    h.c().nwDraft(); await flush();
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ type: 'Podcast', items: null, shape: null }), null);
  });
});

describe('Preview & test', () => {
  it('gives the content publishing makes of the rows, and saves nothing', () => {
    const shape = { [EVIDENCE_QUESTION]: 'Yes' };
    const h = open({ studio: { view: 'studio', step: 0, id: 'case' }, nw: nwOf('Case exercise', { items: rows(CASE), shape }) });
    h.L().setState({ studio: { view: 'studio', id: 'case', step: stepOf(h, 'Preview & test') } });
    expect(h.st().stepName).toBe('Preview & test');
    expect(h.st().content).toEqual(studioContent('Case exercise', CASE, shape));
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('has no content while the rows are not valid yet', () => {
    const h = open({ studio: { view: 'studio', step: 0, id: 'aid' }, nw: { items: rows(AID.slice(0, 2)) } });
    expect(h.st().content).toBeNull();
  });
});

describe('a saved studio draft', () => {
  const saved = contribution({ id: 'c7', type: 'Job aid', studio: 'aid', items: AID, shape: { 'Template?': 'Checklist' }, ai_assisted: true });
  it('Continue editing opens its studio with its rows and answers, and saving writes them back', async () => {
    const h = open({ data: data({ contributions: [saved] }), state: { createTab: 'mine', contribSel: 'c7' } });
    h.c().cs!.second();
    expect(h.c().newView).toBe('studio');
    expect(h.state.studio).toMatchObject({ view: 'studio', id: 'aid', step: 0 });
    expect(h.st().rows.map((r) => r.text)).toEqual(AID.map((r) => r[1]));
    expect(h.state.nw.items).toMatchObject({ list: AID, how: 'ai' });
    expect(h.state.nw.shape).toEqual({ 'Template?': 'Checklist' });
    expect(h.state.nw.ai).toBe(false);
    h.c().nwDraft(); await flush();
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ items: AID, shape: { 'Template?': 'Checklist' }, ai_assisted: true }), 'c7');
  });
  it('changes requested: the author edits the rows in the studio, checks and resubmits the same row', async () => {
    const asked = { ...saved, status: 'changes' as const };
    const h = open({ data: data({ contributions: [asked] }), state: { createTab: 'mine', contribSel: 'c7' } });
    expect(h.c().cs!.mainLabel).toBe('Edit and resubmit');
    h.c().cs!.main();
    h.L().setState({ studio: { ...h.state.studio, step: stepOf(h, 'Draft') } });
    h.st().rows[1].edit(1, 'Stakeholder map with sponsors');
    h.L().setState({ studio: { ...h.state.studio, step: stepOf(h, 'Check & send') } });
    h.st().send.check(); await flush();
    const edited = [AID[0], ['Before', 'Stakeholder map with sponsors'], ...AID.slice(2)];
    expect(store.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ items: edited }), 'c7');
    expect(store.checkContribution).toHaveBeenCalledWith('c7');
    h.st().send.run(); await flush(10);
    expect(store.submitContribution).toHaveBeenCalledWith('c7');
    expect(h.state.editing).toBeNull();
  });
  it('leaving the edit from the studio goes back to My contributions; a Flash edit stays in the form', () => {
    const h = open({ data: data({ contributions: [saved, contribution({ id: 'c8', type: 'Flash cards', studio: 'flash', items: [['F', 'B']] })] }), state: { createTab: 'mine', contribSel: 'c7' } });
    h.c().cs!.second();
    expect(h.st().backLabel).toBe('← My contributions');
    h.st().toHub();
    expect(h.state).toMatchObject({ editing: null, createTab: 'mine', studio: { view: 'hub' } });
    h.L().setState({ contribSel: 'c8' });
    h.c().cs!.second();
    expect(h.c().newView).toBe('form');
  });
  it('the compact Flash studio drops another studio\'s answers', () => {
    const h = open({ nw: { shape: { 'Template?': 'Checklist' } } });
    card(h, 'flash').open();
    expect(h.state.nw.shape).toEqual({});
  });
  it('reopening its studio continues the draft; another studio starts a new one', () => {
    const h = open({ data: data({ contributions: [{ ...saved, id: 'new1' }] }), nw: { items: rows(AID), savedId: 'new1', shape: { 'Template?': 'Checklist' } } });
    card(h, 'aid').open();
    expect(h.state.nw).toMatchObject({ savedId: 'new1', items: { list: AID }, shape: { 'Template?': 'Checklist' } });
    h.st().toHub();
    card(h, 'case').open();
    expect(h.state.nw.savedId).toBeUndefined();
    expect(h.state.nw.items?.list).toEqual([]);
    expect(h.state.nw.type).toBe('Case exercise');
  });
  it('shows its rows to the author and to a reviewer', () => {
    const h = open({ data: data({ contributions: [{ ...saved, status: 'review', author_id: 'u2' }], reviews: [review({ contribution_id: 'c7', reviewer_id: 'u1' })] }), state: { createTab: 'review' } });
    expect(h.c().rs!.itemsHead).toBe('4 items to check');
    expect(h.c().rs!.itemRows[0]).toEqual({ front: 'Before', back: 'Objectives agreed' });
    expect(h.c().rs!.fileNote).toBe('Check each item against the takeaway.');
    expect(h.c().rs!.answerRows).toEqual([{ front: 'Template?', back: 'Checklist' }]);
    expect(h.c().rs!.answersHead).toBe('Studio answers');
  });
});
