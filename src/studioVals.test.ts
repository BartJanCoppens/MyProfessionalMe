// The Studios hub and the one studio D1 keeps, Flash card & Exam Studio (design v4, Task 13): the hub, the four steps,
// the draft through viaAi('draft_items'), the checks and review route, and the same contribution as the upload form.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/contributionStore';
import { emptyParts } from './logic/contribution';
import type { CreateData, Rule, RuleParts } from './logic/contribution';
import { flush, harness, member, person, stubWindow } from './test/harness';
import type { AppState } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async () => 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
  loadGrants: vi.fn(), addGrant: vi.fn(), removeGrant: vi.fn(), loadExperts: vi.fn(), setExpert: vi.fn(),
}));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

const rule = (o: Partial<RuleParts>): Rule => ({ id: 1, user_id: 'u1', ...emptyParts(), ...o });
const data = (o: Partial<CreateData> = {}): CreateData => ({ contributions: [], reviews: [], rules: [rule({ lines: ['Consulting'] })], policies: [], peers: 3, ...o });
const base = { line: 'Consulting', aud: '', type: 'Flash cards', title: 'Corporate tax basics', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'One fact per card.', outline: [], sources: [], ai: false, aiNote: '' };
const deck = (n: number, how: 'scripted' | 'ai' = 'scripted') => ({ list: Array.from({ length: n }, (_, i) => ['Front ' + i, 'Back ' + i] as [string, string]), how, problems: [], note: '' });
const flashCard = (h: { st: () => { cards: { id: string }[] } }) => h.st().cards.find((x) => x.id === 'flash')! as ReturnType<typeof h.st>['cards'][number] & { open: () => void; disabled: boolean };
const open = (o: { nw?: object; studio?: AppState['studio']; data?: CreateData; live?: boolean; readOnly?: boolean } = {}) => {
  const h = harness({ access: member('u1'), subject: person(o.readOnly ? { id: 'u9', name: 'Other Person', readOnly: true } : {}), config: { liveAssistant: !!o.live },
    state: { screen: 'create', create: o.data || data(), createTab: 'new', nw: { ...base, ...o.nw }, nwKb: ['B1'], studio: { view: 'studio', step: 0 }, ...(o.studio && { studio: o.studio }) } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  return Object.assign(h, { c: () => h.vm().create!, st: () => h.vm().create!.studio });
};

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('the hub', () => {
  it('opens on the hub with ten studios, three of them available and the link to the upload form', () => {
    const h = open({ studio: { view: 'hub', step: 0 } });
    expect(h.c().newView).toBe('hub');
    expect(h.st().cards.map((x) => x.name)).toHaveLength(10);
    expect(h.st().cards.filter((x) => !x.disabled).map((x) => x.name)).toEqual(['Job Aid Studio', 'Flash card & Exam Studio', 'Case Studio']);
    expect(h.st().uploadLabel).toBe('Upload something you already made →');
  });
  it('opens the studio at step one with a format a studio makes', () => {
    const h = open({ studio: { view: 'hub', step: 0 }, nw: { type: 'Reel' } });
    flashCard(h).open();
    expect(h.state.studio).toEqual({ view: 'studio', step: 0 });
    expect(h.state.nw.type).toBe('Flash cards');
  });
  it('opens the upload form from the link and returns with All studios', () => {
    const h = open({ studio: { view: 'hub', step: 0 } });
    h.st().openUpload();
    expect(h.c().newView).toBe('form');
    h.st().toHub();
    expect(h.state.studio.view).toBe('hub');
  });
  it('keeps the studio closed when no rule allows cards or exams', () => {
    const h = open({ studio: { view: 'hub', step: 0 }, data: data({ rules: [rule({ lines: ['Consulting'], formats: ['Reel'] })] }) });
    expect(flashCard(h).disabled).toBe(true);
    flashCard(h).open();
    expect(h.state.studio.view).toBe('hub');
    expect(h.lastToast()).toBe('Not in your creation rules');
  });
  it('shows the form when a contribution is being edited', () => {
    const h = open({ studio: { view: 'hub', step: 0 } });
    h.L().setState({ editing: 'x' });
    expect(h.c().newView).toBe('form');
  });
  it('goNew lands on the hub', () => {
    const h = open({ studio: { view: 'studio', step: 2 } });
    h.c().goNew();
    expect(h.state.studio).toEqual({ view: 'hub', step: 0 });
  });
});

describe('rules with several combinations', () => {
  const two = data({ rules: [rule({ lines: ['Consulting'], formats: ['Podcast'] }), rule({ lines: ['Audit'], formats: ['Flash cards'] })] });
  it('moves the draft to the line of the rule that allows the format, and can reach Send', async () => {
    const h = open({ studio: { view: 'hub', step: 0 }, data: two, nw: { type: 'Podcast', line: 'Consulting', items: deck(2) } });
    flashCard(h).open();
    expect(h.state.nw).toMatchObject({ type: 'Flash cards', line: 'Audit' });
    h.L().setState({ studio: { view: 'studio', step: 3 }, nw: { ...h.state.nw, items: deck(4) } });
    h.st().send.check(); await flush(10);
    expect(h.st().send.blocked).toBe(false);
    expect(h.c().nwAllowed).toBe(true);
  });
  it('re-fits the draft when a format is picked', () => {
    const rules = data({ rules: [rule({ lines: ['Consulting'], formats: ['Practice exam'] }), rule({ lines: ['Audit'], formats: ['Flash cards'] })] });
    const h = open({ data: rules, nw: { type: 'Practice exam', line: 'Consulting' } });
    h.st().formats.find((f) => f.label === 'Flash cards')!.pick();
    expect(h.state.nw).toMatchObject({ type: 'Flash cards', line: 'Audit' });
  });
  it('disables the card natively when the only rule is another format', () => {
    const h = open({ studio: { view: 'hub', step: 0 }, data: data({ rules: [rule({ lines: ['Consulting'], formats: ['Podcast'] })] }) });
    expect(flashCard(h).disabled).toBe(true);
    expect(h.st().formats).toEqual([]);
  });
});

describe('the steps', () => {
  it('has four steps: Shape it is folded into the first, Produce is dropped', () => {
    expect(open().st().steps).toEqual(['Idea & sources', 'Draft', 'Preview & test', 'Check & send']);
  });
  it('needs a title and the takeaway before step two, then advances and goes back', () => {
    const h = open({ nw: { title: '', take: '' } });
    h.st().next();
    expect(h.state.studio.step).toBe(0);
    expect(h.lastToast()).toBe('Add a title and the one takeaway first');
    const g = open();
    expect(g.st().noPrev).toBe(true);
    g.st().next();
    expect(g.state.studio.step).toBe(1);
    expect(g.st().prev).toBeTypeOf('function');
    g.st().prev();
    expect(g.state.studio.step).toBe(0);
  });
  it('needs items before leaving Draft, and every step after is reachable', () => {
    const h = open({ studio: { view: 'studio', step: 1 } });
    h.st().next();
    expect(h.state.studio.step).toBe(1);
    expect(h.lastToast()).toBe('Add the cards first · draft them or import a CSV');
    const few = open({ studio: { view: 'studio', step: 1 }, nw: { items: deck(2) } });
    few.st().next();
    expect(few.state.studio.step).toBe(1);
    expect(few.lastToast()).toBe('Draft at least 4 items in step 2');
    const g = open({ studio: { view: 'studio', step: 1 }, nw: { items: deck(4) } });
    g.st().next(); g.st().next();
    expect(g.state.studio.step).toBe(3);
    expect(g.st().hasNext).toBe(false);
  });
  it('offers only the formats the rules allow, and drops the items when the format changes', () => {
    const h = open({ nw: { items: deck(2) } });
    expect(h.st().formats.map((f) => f.label)).toEqual(['Flash cards', 'Practice exam']);
    h.st().formats[1].pick();
    expect(h.state.nw.type).toBe('Practice exam');
    expect(h.state.nw.items!.list).toEqual([]);
    const only = open({ data: data({ rules: [rule({ lines: ['Consulting'], formats: ['Flash cards'] })] }) });
    expect(only.st().formats.map((f) => f.label)).toEqual(['Flash cards']);
  });
});

describe('Draft', () => {
  it('drafts through viaAi(draft_items) and labels it Made with AI', async () => {
    const complete = vi.fn(async () => '{"cards":[{"front":"Standard rate?","back":"25 %"}]}');
    stubWindow({ claude: { complete } });
    const h = open({ live: true, studio: { view: 'studio', step: 1 } });
    await h.c().itemsPanel!.draft();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(h.state.nw.items).toMatchObject({ how: 'ai', list: [['Standard rate?', '25 %']] });
    expect(h.st().itemsLabel).toBe('Made with AI');
  });
  it('scripted cards are labelled as scripted, never AI', async () => {
    const h = open({ studio: { view: 'studio', step: 1 } });
    await h.c().itemsPanel!.draft();
    expect(h.state.nw.items!.how).toBe('scripted');
    expect(h.st().itemsLabel).toBe('Scripted from the bundle');
  });
  it('labels an imported CSV by what it is', () => {
    const h = open({ studio: { view: 'studio', step: 1 } });
    h.c().itemsPanel!.importCsv('What is VAT?,A tax on spending');
    expect(h.st().itemsLabel).toBe('Imported from a CSV');
  });
});

describe('Preview & test', () => {
  it('gives the draft cards and never saves anything', () => {
    const h = open({ studio: { view: 'studio', step: 2 }, nw: { items: deck(2) } });
    expect(h.st().preview).toMatchObject({ kind: 'cards', cards: [['Front 0', 'Back 0'], ['Front 1', 'Back 1']] });
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('gives the draft questions for an exam', () => {
    const q = { t: 'VAT', q: 'Rate?', o: ['6', '12', '21', '25'], a: 2, why: 'Standard rate' };
    const h = open({ studio: { view: 'studio', step: 2 }, nw: { type: 'Practice exam', items: { list: [q], how: 'ai', problems: [], note: '' } } });
    expect(h.st().preview).toMatchObject({ kind: 'questions', questions: [q] });
  });
});

describe('Check & send', () => {
  const at = (nw: object = {}, o: object = {}) => open({ studio: { view: 'studio', step: 3 }, nw: { items: deck(4), ...nw }, ...o });
  const failing = (reasons: string[]) => vi.mocked(store.checkContribution).mockResolvedValueOnce({ passed: false, reasons });
  it('lists the automatic checks, with the client-name check from CLIENT_WORDS', () => {
    const ok = at();
    expect(ok.st().send.checks.map((x) => x.text)).toEqual(expect.arrayContaining(['No client names found', '4 cards drafted from the bundle · check each one']));
    const bad = at({ title: 'Delcroix rates' });
    expect(bad.st().send.checks.map((x) => x.text).join(' ')).toMatch(/looks like a client name/);
    expect(bad.st().send.blocked).toBe(true);
  });
  it('shows the studio\'s minimum before the server is asked', () => {
    const h = at({ items: deck(2) });
    expect(h.st().send.problems).toEqual(['Draft at least 4 items in step 2']);
    expect(h.st().send.blocked).toBe(true);
  });
  it('reports a client name once: in the checks, not again among the server\'s reasons', async () => {
    failing(['“Delcroix” looks like a client name · anonymise it']);
    const h = at({ title: 'Delcroix rates' });
    h.st().send.check(); await flush(10);
    expect(h.st().send.checks.map((x) => x.text)).toContain('“Delcroix” looks like a client name · anonymise it');
    expect(h.st().send.problems).toEqual([]);
  });
  it('keeps Send for review closed until the automatic check has passed', () => {
    const h = at();
    expect(h.st().send.blocked).toBe(true);
    expect(h.st().send.checkLabel).toBe('Run the automatic check');
    expect(h.st().send.checkNote).toBe('Saves your draft and checks it on the server. Send for review opens when it passes.');
  });
  it('the check saves the draft with its studio, runs on the saved draft and opens Send', async () => {
    const h = at();
    h.st().send.check(); await flush(10);
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ type: 'Flash cards', studio: 'flash' }), null);
    expect(store.checkContribution).toHaveBeenCalledWith('new1');
    expect(store.submitContribution).not.toHaveBeenCalled();
    expect(h.st().send.blocked).toBe(false);
    expect(h.st().send.checkNote).toBe('The automatic check passed on this version.');
    expect(h.state.studio.view).toBe('studio');
  });
  it('shows the reasons of a failed check with the shared problem list and keeps Send closed', async () => {
    failing(['This studio does not make Flash cards', '“Hoverna” looks like a client name · anonymise it']);
    const h = at();
    h.st().send.check(); await flush(10);
    expect(h.st().send.problems).toEqual(['This studio does not make Flash cards', '“Hoverna” looks like a client name · anonymise it']);
    expect(h.st().send.blocked).toBe(true);
  });
  it('does not ask the server while the studio itself still sees a problem', async () => {
    const h = at({ items: deck(2) });
    expect(h.st().send.checkBlocked).toBe(true);
    h.st().send.check(); await flush(10);
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Draft at least 4 items in step 2');
  });
  it('a second check updates the same draft, never a new one', async () => {
    const h = at();
    h.st().send.check(); await flush(10);
    h.st().send.check(); await flush(10);
    expect(vi.mocked(store.saveDraft).mock.calls[1]).toEqual([expect.not.objectContaining({ studio: expect.anything() }), 'new1']);
  });
  it('after All studios and back, the next check updates the same draft', async () => {
    const h = at();
    h.st().send.check(); await flush(10);
    h.st().toHub();
    flashCard(h).open();
    h.st().send.check(); await flush(10);
    expect(store.saveDraft).toHaveBeenCalledTimes(2);
    expect(vi.mocked(store.saveDraft).mock.calls[1][1]).toBe('new1');
  });
  it('moving to the upload form and saving continues the same row', async () => {
    const h = at();
    h.st().send.check(); await flush(10);
    h.st().openUpload();
    h.c().nwDraft(); await flush(10);
    expect(vi.mocked(store.saveDraft).mock.calls[1][1]).toBe('new1');
  });
  it('a new draft started after the check is a new row', async () => {
    const h = at();
    h.st().send.check(); await flush(10);
    h.c().goNew();
    expect(h.state.nw.savedId).toBeUndefined();
    h.c().nwCancel();
    expect(h.state.nw.savedId).toBeUndefined();
  });
  it('an edit after the check closes Send again until it is re-run', async () => {
    const h = at();
    h.st().send.check(); await flush(10);
    h.c().nwSetTitle({ target: { value: 'Another title' } } as never);
    expect(h.st().send.blocked).toBe(true);
    expect(h.st().send.problems).toEqual([]);
  });
  it('shows the review route and policy from the existing policy', () => {
    const h = at();
    expect(h.st().send.route.map((r) => r.name)).toEqual(['Peer reviewer 1 of 2', 'Peer reviewer 2 of 2', 'Subject-matter expert', 'Learning team']);
    expect(h.st().send.policyNote).toMatch(/^Review for this combination: /);
  });
  it('sends the checked draft through the same save and submit as the upload form, checked again, then returns to the hub', async () => {
    const h = at();
    h.st().send.check(); await flush(10);
    expect(h.st().send.label).toBe('Send for review');
    h.st().send.run(); await flush(10);
    expect(store.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'Flash cards', items: deck(4).list, ai_assisted: false }), 'new1');
    expect(store.checkContribution).toHaveBeenCalledTimes(2);
    expect(store.submitContribution).toHaveBeenCalledWith('new1');
    expect(h.state.createTab).toBe('mine');
    expect(h.state.studio).toEqual({ view: 'hub', step: 0 });
  });
  it('does not submit when the check before submitting fails', async () => {
    const h = at();
    h.st().send.check(); await flush(10);
    failing(['Not allowed by your creation rules; ask an admin']);
    h.st().send.run(); await flush(10);
    expect(store.submitContribution).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Not allowed by your creation rules; ask an admin');
  });
  it('saves AI-made items as AI-assisted', async () => {
    const h = at({ items: deck(4, 'ai') });
    h.st().send.check(); await flush(10);
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ ai_assisted: true }), null);
  });
  it('refuses while viewing someone else', async () => {
    const h = at({}, { readOnly: true });
    h.st().send.check(); await flush(10);
    h.st().send.run(); await flush(10);
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(store.checkContribution).not.toHaveBeenCalled();
  });
});
