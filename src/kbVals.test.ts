// Knowledge library (admin): topic tree, tags, search, sort, bundle detail tabs, sources, RAG models, OKF files,
// validation, tar download, import, test retrieval and read-only bundles of other lines (FT-KB-*).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { BUNDLES0, TOPICS } from './data';
import * as store from './lib/contentStore';
import { okfFiles } from './logic/okf';
import type { AppState, Bundle } from './types';
import { domainAdmin, flush, harness, stubWindow, systemAdmin } from './test/harness';

vi.mock('./lib/contentStore', async (orig) => ({ ...(await orig<object>()), saveLearning: vi.fn(), removeLearning: vi.fn(), publishMappings: vi.fn(), saveBundleSoon: vi.fn(), saveBundleNow: vi.fn() }));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const ev = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>;
const enter = { key: 'Enter' } as KeyboardEvent<HTMLInputElement>;
const kbh = (state: Partial<AppState> = {}, access = systemAdmin()) => {
  const h = harness({ access, state: { screen: 'adminKb', ...state } });
  return Object.assign(h, { kb: () => h.vm().kb!, bundle: (id: string) => h.state.bundles.find((b) => b.id === id)! });
};
const open = (id: string, state: Partial<AppState> = {}, access = systemAdmin()) => kbh({ kbOpen: true, kbSel: id, ...state }, access);
const B = (id: string) => BUNDLES0.find((b) => b.id === id)!;
const q = 'Pillar Two groups consolidated revenue';

describe('the bundle list', () => {
  it('is only built on the Knowledge library screen', () => {
    expect(harness({ access: systemAdmin() }).vm().kb).toBeNull();
    expect(harness({ access: systemAdmin() }).vm().kbCount).toBe(String(BUNDLES0.length));
  });
  it('sums bundles, topic areas and passages in the lead', () => {
    expect(kbh().kb().kbLead).toMatch(/^7 bundles across 5 topic areas · [\d,]+ passages indexed\. /);
  });
  it('sorts by most recently indexed, most used or name', () => {
    const h = kbh();
    expect(h.kb().kbCards.map((c) => c.id)).toEqual(['B2', 'B1', 'B5', 'B7', 'B4', 'B8', 'B3']);
    h.kb().kbSetSort(ev('used'));
    expect(h.kb().kbCards.map((c) => c.id)).toEqual(['B4', 'B5', 'B1', 'B7', 'B2', 'B8', 'B3']);
    h.kb().kbSetSort(ev('name'));
    expect(h.kb().kbCards.map((c) => c.name)).toEqual(BUNDLES0.map((b) => b.name).sort((a, b) => a.localeCompare(b)));
    expect(h.kb().kbSortOptions.map((o) => o.value)).toEqual(['recent', 'used', 'name']);
  });
  it('describes each card with status, topic path, four tags and stats', () => {
    const card = kbh().kb().kbCards.find((c) => c.id === 'B3')!;
    expect(card).toMatchObject({ st: 'clarification', stLabel: 'Stale source', topic: 'Industries · Energy & utilities', tags: B('B3').tags.slice(0, 4) });
    expect(card.stats).toEqual([{ k: 'sources', v: '3' }, { k: 'concepts', v: String(B('B3').concepts.length) }, { k: 'RAG models', v: '1' }, { k: 'used by', v: '5' }]);
  });
  it('searches name, description, owner, tags and concept titles', () => {
    const h = kbh();
    h.kb().kbSetSearch(ev('talent team'));
    expect(h.kb().kbCards.map((c) => c.id)).toEqual(['B4', 'B8']);
    expect(kbh({ kbSearch: 'operating model layers' }).kb().kbCards.map((c) => c.id)).toEqual(['B1']);
    expect(kbh({ kbSearch: 'nothing like this' }).kb().kbResultText).toBe('0 of 7 bundles');
  });
});

describe('the topic tree and tags', () => {
  it('lists all topics, every group and every topic with counts', () => {
    const tree = kbh().kb().kbTree;
    expect(tree).toHaveLength(1 + TOPICS.length + TOPICS.reduce((n, g) => n + g[2].length, 0));
    expect(tree[0]).toMatchObject({ key: 'all', count: '7', bg: '#f3f5f0' });
    expect(tree.find((t) => t.key === 'cons')!.count).toBe('4');
    expect(tree.find((t) => t.key === 'tec.cloud')!.count).toBe('');
  });
  it('filters by a group or a topic, and names it in the result line', () => {
    const h = kbh();
    h.kb().kbTree.find((t) => t.key === 'tax')!.pick();
    expect(h.state.kbTopic).toBe('tax');
    expect(h.kb().kbCards.map((c) => c.id).sort()).toEqual(['B2', 'B7']);
    expect(h.kb().kbResultText).toBe('2 of 7 bundles · Tax & Legal');
    h.kb().kbTree.find((t) => t.key === 'tax.vat')!.pick();
    expect(h.kb().kbResultText).toBe('1 of 7 bundles · VAT & indirect tax');
  });
  it('shows the most used tags of the topic and filters by one, toggling it off', () => {
    const h = kbh({ kbTopic: 'tax' });
    const chips = h.kb().kbTagChips;
    expect(chips.length).toBeLessThanOrEqual(14);
    expect(chips.map((c) => c.label)).toContain('VAT');
    chips.find((c) => c.label === 'VAT')!.pick();
    expect(h.state.kbTagF).toBe('VAT');
    expect(h.kb().kbResultText).toBe('1 of 7 bundles · Tax & Legal · #VAT');
    h.kb().kbTagChips.find((c) => c.label === 'VAT')!.pick();
    expect(h.state.kbTagF).toBeNull();
  });
});

describe('opening a bundle', () => {
  it('opens on the overview with fresh test state, and goes back to the list', () => {
    const h = kbh({ kbHits: [], kbAnswer: 'old', kbEdit: true });
    h.kb().kbCards.find((c) => c.id === 'B5')!.open();
    expect(h.state).toMatchObject({ kbSel: 'B5', kbOpen: true, kbTab: 'overview', kbFile: 'index.md', kbEdit: false, kbModel: null, kbTestModel: null, kbHits: null, kbAnswer: '', kbBusy: false });
    expect(h.kb()).toMatchObject({ kbDetailMode: true, kbListMode: false });
    h.kb().kbBack();
    expect(h.state).toMatchObject({ kbOpen: false, kbEdit: false });
  });
  it('labels the tabs with counts', () => {
    const files = okfFiles(B('B1')).length;
    expect(open('B1').kb().kbTabs.map((t) => t.label)).toEqual(['Overview & tags', 'Sources · 3', 'RAG models · 2', 'OKF files · ' + files, 'Test retrieval']);
    const h = open('B1');
    h.kb().kbSetTab('models');
    expect(h.state.kbTab).toBe('models');
  });
  it('shows the facts of the bundle', () => {
    const kbs = open('B1').kb().kbs;
    expect(kbs).toMatchObject({ name: 'Operating model & cost methods', topicPath: 'Consulting methods · Operating models', owner: 'Consulting learning team · last indexed 28 Oct 2026', stLabel: 'Indexed', editLabel: 'Edit' });
    expect(kbs.facts).toEqual([{ k: 'Passages', v: '350' }, { k: 'Concepts', v: '3' }, { k: 'Sources', v: '3' }, { k: 'RAG models', v: '2' }, { k: 'Used by', v: '14 pieces' }]);
    expect(kbs.concepts.map((c) => c.key)).toEqual(['operating-model-layers', 'target-state-first', 'cost-to-serve-scope']);
  });
  it('opens a concept file from the overview', () => {
    const h = open('B1');
    h.kb().kbs.concepts[1].open();
    expect(h.state).toMatchObject({ kbTab: 'files', kbFile: 'concepts/target-state-first.md' });
  });
  it('falls back to the first bundle for an unknown selection', () => {
    expect(open('B404').kb().kbs.name).toBe(BUNDLES0[0].name);
  });
});

describe('editing the overview', () => {
  it('toggles edit mode', () => {
    const h = open('B1');
    h.kb().kbs.toggleEdit();
    expect(h.state.kbEdit).toBe(true);
    expect(h.kb().kbs.editLabel).toBe('Done');
  });
  it('renames, describes and re-scopes a bundle and saves it shortly after', () => {
    const h = open('B1');
    h.kb().kbs.setName(ev('Ops & cost'));
    h.kb().kbs.setDesc(ev(''));
    h.kb().kbs.setAccess(ev('admins'));
    h.kb().kbs.setFresh(ev('6'));
    expect(h.bundle('B1')).toMatchObject({ name: 'Ops & cost', desc: '', access: 'admins', fresh: '6' });
    expect(h.kb().kbs.desc).toBe('No description yet.');
    expect(store.saveBundleSoon).toHaveBeenCalledTimes(4);
    const latest = vi.mocked(store.saveBundleSoon).mock.calls[3][1];
    h.vm();
    expect(latest()).toMatchObject({ id: 'B1', name: 'Ops & cost', fresh: '6' });
  });
  it('moves the main topic and keeps secondary topics distinct', () => {
    const h = open('B1');
    h.kb().kbs.setTopic(ev('cons.cost'));
    expect(h.bundle('B1')).toMatchObject({ topic: 'cons.cost', topics2: ['ind.whole'] });
    h.kb().kbs.addTopic2(ev('cons.cost'));
    h.kb().kbs.addTopic2(ev('ind.whole'));
    h.kb().kbs.addTopic2(ev(''));
    expect(h.bundle('B1').topics2).toEqual(['ind.whole']);
    h.kb().kbs.addTopic2(ev('tec.ai'));
    expect(h.bundle('B1').topics2).toEqual(['ind.whole', 'tec.ai']);
    expect(h.kb().kbTopic2Options.map((o) => o.value)).not.toContain('tec.ai');
    h.kb().kbs.topics2[0].remove();
    expect(h.bundle('B1').topics2).toEqual(['tec.ai']);
  });
  it('gives a bundle to a line', () => {
    const h = open('B1');
    expect(h.kb().kbs.lineOptions.map((o) => o.label)).toEqual(['Firm-wide', 'Consulting', 'Audit', 'Tax & Legal']);
    h.kb().kbs.setLine(ev('Audit'));
    expect(h.bundle('B1').line).toBe('Audit');
    h.kb().kbs.setLine(ev(''));
    expect(h.bundle('B1').line).toBeNull();
  });
  it('re-indexes, then marks sources synced today', () => {
    vi.useFakeTimers();
    const h = open('B1');
    h.kb().kbs.reindex();
    expect(h.bundle('B1').status).toBe('reindex');
    expect(h.lastToast()).toBe('Re-indexing Operating model & cost methods · creators keep using the last index until it finishes');
    vi.advanceTimersByTime(2200);
    expect(h.bundle('B1')).toMatchObject({ status: 'indexed', updated: '31 Oct 2026' });
    expect(h.bundle('B1').sources.map((s) => s[4])).toEqual(['31 Oct', '31 Oct', '27 Oct']);
  });
  it('says so when a save fails', () => {
    const h = open('B1');
    h.kb().kbs.setName(ev('x'));
    vi.mocked(store.saveBundleSoon).mock.calls[0][2]('permission denied');
    expect(h.lastToast()).toBe('Not saved · permission denied · your change is still on screen; edit again to retry');
  });
});

describe('tags', () => {
  it('adds a typed tag on Enter, without a leading #', () => {
    const h = open('B1', { kbTagIn: '#pricing' });
    h.kb().kbTagKey(enter);
    expect(h.bundle('B1').tags).toContain('pricing');
    expect(h.state.kbTagIn).toBe('');
  });
  it('refuses a duplicate tag in any case', () => {
    const h = open('B2', { kbTagIn: 'vat' });
    h.kb().kbAddTag();
    expect(h.bundle('B2').tags).toEqual(B('B2').tags);
    expect(h.lastToast()).toBe('Already tagged “vat”');
  });
  it('ignores an empty tag and other keys', () => {
    const h = open('B1', { kbTagIn: '  ' });
    h.kb().kbAddTag();
    h.kb().kbTagKey({ key: 'a' } as KeyboardEvent<HTMLInputElement>);
    expect(h.wrote('bundles')).toBe(false);
  });
  it('adds a suggested tag and drops the suggestion', () => {
    const h = open('B1');
    h.kb().kbs.sugg[0].add();
    expect(h.bundle('B1').tags).toContain('logistics cost');
    expect(h.bundle('B1').sugg.map((s) => s[0])).toEqual(['design principles']);
    expect(h.kb().kbs.sugg[0].conf).toBe('74%');
  });
  it('removes a tag and says when none are left', () => {
    const h = open('B5');
    B('B5').tags.forEach(() => h.kb().kbs.tags[0].remove());
    expect(h.kb().kbs.noTags).toBe(true);
  });
  it('types into the tag box', () => {
    const h = open('B1');
    h.kb().kbSetTagIn(ev('x'));
    expect(h.state.kbTagIn).toBe('x');
  });
});

describe('sources', () => {
  it('marks client and licensed sources as never retrieved, and stale ones as old', () => {
    const b1 = open('B1').kb().kbs.sources;
    expect(b1[2]).toMatchObject({ name: 'Delcroix engagement files', chunks: '—', sens: 'Client confidential', tone: 'orange', op: 0.6, note: 'Excluded from retrieval · client data' });
    expect(b1[0]).toMatchObject({ chunks: '212', type: 'Upload', note: '2.1 MB', op: 1 });
    expect(open('B4').kb().kbs.sources[2].note).toBe('Retrieval blocked · licence forbids reuse');
    expect(open('B3').kb().kbs.sources[0]).toMatchObject({ note: 'Older than 6 months · re-sync or replace', noteFg: '#9a3d0c' });
  });
  it('removes a source and renumbers passages and citations', () => {
    const h = open('B1');
    h.kb().kbs.sources[0].remove();
    const b = h.bundle('B1');
    expect(b.sources.map((s) => s[0])).toEqual(['Cost-to-serve playbook', 'Delcroix engagement files']);
    expect(b.chunks.map((c) => c[0])).toEqual([0, 0]);
    expect(b.concepts.map((c) => c[7])).toEqual([[], [], [0]]);
  });
  it('needs a name to add a source', () => {
    const h = open('B1');
    h.kb().kbAddSource();
    expect(h.lastToast()).toBe('Name the source first');
    expect(h.wrote('bundles')).toBe(false);
  });
  it('adds a source, indexes it and reports passages after a moment', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const h = open('B1');
    h.kb().kbSetConn('sharepoint');
    expect(h.kb().kbAddPh).toBe('SharePoint folder URL');
    h.kb().kbSetAddName(ev(' Pricing method v2 '));
    h.kb().kbSetSens(ev('internal'));
    h.kb().kbAddSource();
    expect(h.bundle('B1').sources[3]).toEqual(['Pricing method v2', 'sharepoint', 'connected', 0, '31 Oct', 'internal']);
    expect(h.bundle('B1').status).toBe('reindex');
    expect(h.state.kbAdd).toEqual({ conn: 'sharepoint', name: '', sens: 'internal' });
    expect(h.lastToast()).toBe('Added · indexing Pricing method v2 · an OKF source file was created');
    expect(h.kb().kbs.sources[3].chunks).toBe('indexing');
    vi.advanceTimersByTime(1800);
    expect(h.bundle('B1').sources[3][3]).toBe(90);
    expect(h.bundle('B1').status).toBe('indexed');
  });
  it('keeps a client source out of retrieval and a draft bundle a draft', () => {
    vi.useFakeTimers();
    const draft = { ...B('B8'), status: 'draft' };
    const h = open('B8', { bundles: [draft], kbAdd: { conn: 'upload', name: 'Client notes', sens: 'client' } });
    h.kb().kbAddSource();
    expect(h.lastToast()).toBe('Added · stored for provenance, never retrieved');
    vi.advanceTimersByTime(1800);
    expect(h.bundle('B8').sources.at(-1)![3]).toBe(0);
    expect(h.bundle('B8').status).toBe('draft');
  });
});

describe('RAG models', () => {
  it('opens the default model and summarises its settings', () => {
    const kb = open('B1').kb();
    expect(kb.kbModels.map((m) => [m.name, m.def])).toEqual([['Precise · cite everything', true], ['Broad exploration', false]]);
    expect(kb.km).toMatchObject({ name: 'Precise · cite everything', notDef: false, hybridText: '70% meaning · 30% exact words' });
    expect(kb.km.summary).toBe('Splits sources into 800-token passages (10% overlap), embeds them with Multilingual E5 large, and returns up to 5 passages scoring 0.70 or higher, re-ranked. Claude Sonnet drafts at temperature 0 and cites every sentence. Saved as retrieval/precise-cite-everything.md.');
  });
  it('makes another model the default', () => {
    const h = open('B1');
    h.kb().kbModels[1].open();
    expect(h.kb().km.notDef).toBe(true);
    h.kb().km.makeDef();
    expect(h.bundle('B1').models.map((m) => m.def)).toEqual([false, true]);
    expect(h.lastToast()).toBe('Broad exploration is now the default for creators');
  });
  it('changes settings of the open model', () => {
    const h = open('B1');
    h.kb().km.set.topk(ev('12'));
    h.kb().km.set.overlap(ev('0'));
    h.kb().km.setHybrid(ev('55'));
    h.kb().km.setRerank(false);
    h.kb().km.setName(ev('Tuned'));
    expect(h.bundle('B1').models[0]).toMatchObject({ name: 'Tuned', topk: '12', overlap: '0', hybrid: 55, rerank: false });
    expect(h.kb().km.summary).toMatch(/^Splits sources into 800-token passages \(no overlap\)/);
  });
  it('adds a new model from the default and duplicates the open one', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const h = open('B1');
    h.kb().kbNewModel();
    expect(h.bundle('B1').models[2]).toMatchObject({ id: 'M1000', name: 'New model', def: false, embed: 'e5' });
    expect(h.state.kbModel).toBe('M1000');
    vi.setSystemTime(2000);
    h.kb().km.dup();
    expect(h.bundle('B1').models[3]).toMatchObject({ id: 'M2000', name: 'New model copy', def: false });
  });
  it('deletes a model that is not the last', () => {
    const h = open('B1', { kbModel: 'Mbroad1' });
    h.kb().km.del();
    expect(h.bundle('B1').models.map((m) => m.id)).toEqual(['Mprecise0']);
    expect(h.state.kbModel).toBeNull();
  });
});

describe('OKF files', () => {
  it('lists the index first, then a folder per kind', () => {
    const tree = open('B1').kb().kbTreeFiles;
    expect(tree[0]).toMatchObject({ name: 'operating-model-cost-methods/', cursor: 'default' });
    expect(tree[1]).toMatchObject({ key: 'index.md', name: 'index.md', bg: '#1a1d18' });
    expect(tree.filter((t) => t.key.endsWith('/') && t.key !== '/').map((t) => t.name)).toEqual(['concepts/', 'sources/', 'retrieval/']);
  });
  it('opens a file and shows its frontmatter and body', () => {
    const h = open('B1');
    h.kb().kbTreeFiles.find((t) => t.key === 'sources/delcroix-engagement-files.md')!.open();
    expect(h.state.kbFile).toBe('sources/delcroix-engagement-files.md');
    const view = h.kb().kbFileView;
    expect(view).toMatchObject({ path: 'sources/delcroix-engagement-files.md', type: 'source' });
    expect(view.front).toContain('retrieval: excluded');
    expect(view.body).toMatch(/^# Delcroix engagement files/);
  });
  it('falls back to the index for a file that no longer exists', () => {
    expect(open('B1', { kbFile: 'concepts/gone.md' }).kb().kbFileView.path).toBe('index.md');
  });
});

describe('validation', () => {
  const rows = (b: Bundle) => { const h = open(b.id, { bundles: [b] }); h.kb().kbValidate(); return h.kb().kbValidRows.map((r) => r.text); };
  it('passes a conformant bundle', () => {
    expect(rows(B('B8'))).toEqual([okfFiles(B('B8')).length + ' files · every file has a type field · index.md present', 'Conformant OKF v0.2 bundle']);
  });
  it('notes excluded sources without failing', () => {
    expect(rows(B('B1')).slice(1)).toEqual(['1 source listed with retrieval: excluded', 'Conformant OKF v0.2 bundle']);
  });
  it('flags broken links, missing citations, missing tags and stale sources', () => {
    const bad: Bundle = { ...B('B3'), tags: [], concepts: [['a', 'concept', 'A', '', '', ['missing'], [], [9]]] };
    const r = rows(bad);
    expect(r).toContain('concepts/a.md links to concepts/missing.md, which does not exist');
    expect(r).toContain('concepts/a.md has no citation');
    expect(r).toContain('index.md has no tags; creators will not find this bundle by tag');
    expect(r).toContain('Some sources are older than the 6-month freshness window');
    expect(r).not.toContain('Conformant OKF v0.2 bundle');
    const h = open('B3', { bundles: [bad] });
    h.kb().kbValidate();
    expect(h.kb().kbValidRows.filter((x) => x.dot === '#e0a100')).toHaveLength(4);
    expect(h.kb().kbHasValid).toBe(true);
  });
});

describe('downloading the bundle', () => {
  it('saves the OKF files as one tar named after the bundle', () => {
    vi.useFakeTimers();
    const click = vi.fn(), remove = vi.fn(), anchor = { href: '', download: '', click, remove };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const h = open('B1');
    h.kb().kbDownload();
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(anchor).toMatchObject({ href: 'blob:x', download: 'operating-model-cost-methods.okf.tar' });
    expect(click).toHaveBeenCalled();
    expect(h.lastToast()).toBe('Downloaded ' + okfFiles(B('B1')).length + ' OKF files as operating-model-cost-methods.okf.tar');
    vi.advanceTimersByTime(2000);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});

describe('creating and importing bundles', () => {
  it('creates an empty draft bundle in the open topic and stores it at once', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(5000);
    const h = kbh({ kbTopic: 'tax.vat' });
    h.kb().kbNew();
    expect(h.state.bundles[0]).toMatchObject({ id: 'B5000', name: 'New bundle', owner: 'Firm-wide · admin', topic: 'tax.vat', status: 'draft', line: null, models: [expect.objectContaining({ def: true })] });
    expect(h.state).toMatchObject({ kbSel: 'B5000', kbOpen: true, kbEdit: true });
    expect(store.saveBundleNow).toHaveBeenCalledWith(expect.objectContaining({ id: 'B5000' }), expect.any(Function));
    expect(h.kb().kbs.concepts).toEqual([expect.objectContaining({ key: '-', title: 'No concepts yet' })]);
    expect(h.kb().kbPrompts.map((p) => p.label)).toEqual(['What does this bundle cover?']);
  });
  it('gives a Domain Admin\'s new bundle to their line, in the default topic when a group is open', () => {
    const h = kbh({ kbTopic: 'tax' }, domainAdmin(['Audit']));
    h.kb().kbNew();
    expect(h.state.bundles[0]).toMatchObject({ owner: 'Audit · admin', line: 'Audit', topic: 'cons.opm' });
  });
  const file = (name: string, text: string) => ({ name, text: () => Promise.resolve(text) });
  it('imports OKF files as a new bundle, skipping files without a type', async () => {
    vi.useFakeTimers();
    const target = { files: [file('index.md', '---\ntype: bundle\ntitle: Imported pack\ntags: [alpha, beta]\n---\n# Imported pack'),
      file('c.md', '---\ntype: concept\ntitle: First idea\n---\nA paragraph that is long enough to become a passage of its own.'), file('notes.txt', 'no frontmatter')], value: 'x' };
    const h = kbh({}, domainAdmin(['Audit']));
    h.kb().kbOnImport({ target } as never);
    await vi.advanceTimersByTimeAsync(0);
    const b = h.state.bundles[0];
    expect(b).toMatchObject({ name: 'Imported pack', tags: ['alpha', 'beta'], line: 'Audit', status: 'reindex' });
    expect(h.state).toMatchObject({ kbSel: b.id, kbOpen: true, kbTab: 'overview' });
    expect(h.lastToast()).toBe('Imported 3 files · 1 concepts · 1 skipped without a type field');
    expect(store.saveBundleNow).toHaveBeenCalled();
    expect(target.value).toBe('');
    await vi.advanceTimersByTimeAsync(1600);
    expect(h.state.bundles[0].status).toBe('indexed');
  });
  it('imports a malformed file as an empty bundle named after it', async () => {
    const h = kbh();
    h.kb().kbOnImport({ target: { files: [file('loose notes.md', 'just text, no frontmatter')], value: 'x' } } as never);
    await flush(10);
    expect(h.state.bundles[0]).toMatchObject({ name: 'loose notes', concepts: [], line: null });
    expect(h.lastToast()).toBe('Imported 1 file · 0 concepts · 1 skipped without a type field');
  });
  it('does nothing when no file was chosen', async () => {
    const h = kbh();
    h.kb().kbOnImport({ target: { files: null, value: '' } } as never);
    await flush();
    expect(h.state.bundles).toHaveLength(BUNDLES0.length);
  });
});

describe('test retrieval', () => {
  it('ranks passages with the default model and drafts a cited answer from them', () => {
    const h = open('B2', { kbQ: q });
    expect(h.kb().kbTestSub).toBe('Top 3 · threshold 0.80 · 70% keyword · Claude Sonnet');
    h.kb().kbAsk();
    const kb = h.kb();
    expect(kb.kbHasHits).toBe(true);
    expect(kb.kbHits[0].text).toMatch(/^Pillar Two applies to groups/);
    expect(kb.kbHitCount).toMatch(/^\d of up to 3 passages$/);
    expect(h.state.kbAnswer).toMatch(/^Pillar Two applies to groups[^[]*\[1\]/);
    expect(h.state.kbBusy).toBe(false);
  });
  it('says when no passage reaches the threshold', () => {
    const h = open('B2', { kbQ: 'zebra crossing weather' });
    h.kb().kbKey(enter);
    expect(h.kb()).toMatchObject({ kbNoHits: true, kbHasHits: false, kbHitCount: '0 of up to 3 passages' });
    expect(h.kb().kbNoHitText).toBe('No passage reaches the 0.80 threshold. Creators would get no draft, which is the intended behaviour. Lower the threshold in the RAG model or add a source.');
  });
  it('asks the suggested questions from the concepts', () => {
    const h = open('B2');
    expect(h.kb().kbPrompts[0].label).toBe('What should I know about pillar two scope?');
    h.kb().kbPrompts[0].send();
    expect(h.state.kbQ).toBe('What should I know about pillar two scope?');
  });
  it('ignores an empty question, a question while busy, and other keys', () => {
    const h = open('B2', { kbQ: ' ' });
    h.kb().kbAsk();
    h.kb().kbKey({ key: 'x' } as KeyboardEvent<HTMLInputElement>);
    expect(h.patches).toEqual([]);
    const b = open('B2', { kbQ: q, kbBusy: true });
    b.kb().kbAsk();
    expect(b.patches).toEqual([]);
  });
  it('switches the test model and clears the last answer', () => {
    const h = open('B2', { kbHits: [], kbAnswer: 'x' });
    expect(h.kb().kbTestModelOptions.map((o) => o.label)).toEqual(['Legal strict · default', 'Quick answers']);
    h.kb().kbSetTestModel(ev('Mquick1'));
    expect(h.state).toMatchObject({ kbTestModel: 'Mquick1', kbHits: null, kbAnswer: '', kbBusy: false });
    expect(h.kb().kbTestSub).toBe('Top 3 · threshold 0.65 · 40% keyword · Claude Haiku');
    h.kb().kbSetQ(ev('hello'));
    expect(h.state.kbQ).toBe('hello');
  });
  it('uses the live answer, or the passages when the model fails', async () => {
    stubWindow({ claude: { complete: async () => '  Groups above €750m [1]  ' } });
    const live = harness({ access: systemAdmin(), config: { liveAssistant: true }, state: { screen: 'adminKb', kbOpen: true, kbSel: 'B2', kbQ: q } });
    live.vm().kb!.kbAsk();
    expect(live.state.kbBusy).toBe(true);
    await flush();
    expect(live.state).toMatchObject({ kbAnswer: 'Groups above €750m [1]', kbBusy: false });
    stubWindow({ claude: { complete: async () => { throw new Error('offline'); } } });
    const down = harness({ access: systemAdmin(), config: { liveAssistant: true }, state: { screen: 'adminKb', kbOpen: true, kbSel: 'B2', kbQ: q } });
    down.vm().kb!.kbAsk();
    await flush();
    expect(down.state.kbAnswer).toMatch(/\[1\]/);
  });
  it('drops a late answer after the test model changed', async () => {
    let answer: (v: string) => void = () => {};
    stubWindow({ claude: { complete: () => new Promise<string>((r) => { answer = r; }) } });
    const h = harness({ access: systemAdmin(), config: { liveAssistant: true }, state: { screen: 'adminKb', kbOpen: true, kbSel: 'B2', kbQ: q } });
    h.vm().kb!.kbAsk();
    h.vm().kb!.kbSetTestModel(ev('Mquick1'));
    answer('late [1]');
    await flush();
    expect(h.state.kbAnswer).toBe('');
  });
});

describe('bundles of another line', () => {
  const lined = BUNDLES0.map((b) => ({ ...b, line: b.id === 'B1' ? 'Consulting' : b.id === 'B2' ? 'Tax & Legal' : null }));
  it('are read-only for a Domain Admin, with a note on who edits them', () => {
    const h = open('B2', { bundles: lined }, domainAdmin(['Consulting']));
    expect(h.kb().kbs).toMatchObject({ editable: false, readOnlyNote: 'Tax & Legal bundle · read-only for you; Tax & Legal Domain Admins or a General Admin edit it.' });
    h.kb().kbs.setName(ev('x'));
    h.kb().kbs.tags[0].remove();
    h.kb().kbs.sources[0].remove();
    expect(h.wrote('bundles')).toBe(false);
    expect(store.saveBundleSoon).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Tax & Legal bundle · read-only for you; Tax & Legal Domain Admins or a General Admin edit it.');
  });
  it('keeps firm-wide bundles for General and System Admins', () => {
    expect(open('B5', { bundles: lined }, domainAdmin(['Consulting'])).kb().kbs.readOnlyNote).toBe('Firm-wide bundle · read-only for you; a General or System Admin edits it.');
    expect(open('B5', { bundles: lined }, domainAdmin(['Consulting'])).kb().kbs.editable).toBe(false);
    expect(open('B1', { bundles: lined }, domainAdmin(['Consulting'])).kb().kbs.editable).toBe(true);
  });
  it('still let the Domain Admin test retrieval and download', () => {
    const h = open('B2', { bundles: lined, kbQ: q }, domainAdmin(['Consulting']));
    h.kb().kbAsk();
    expect(h.state.kbHits!.length).toBeGreaterThan(0);
  });
});

describe('an empty Knowledge library', () => {
  // Bug: kbScreen falls back to B[0] for the selected bundle, so with no bundles at all (a fresh database) the screen throws.
  it('renders without bundles', () => {
    expect(() => kbh({ bundles: [] }).kb()).not.toThrow();
  });
});

