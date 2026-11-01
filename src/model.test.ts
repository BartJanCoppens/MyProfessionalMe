import { describe, expect, it, vi } from 'vitest';
import { initState, Logic } from './model';
import type { Config } from './config';
import type { Subject } from './lib/useSubject';
import type { Access, AppState } from './types';
import { DOMAINS, LEARN } from './data';
import * as store from './lib/contentStore';

vi.mock('./lib/contentStore', async (orig) => ({ ...(await orig<object>()), saveLearning: vi.fn(async () => {}), removeLearning: vi.fn(async () => {}), publishMappings: vi.fn(async () => {}), saveBundleSoon: vi.fn(), saveBundleNow: vi.fn() }));

const cfg: Config = { businessLine: 'Consulting', startScreen: 'map', homeView: 'constellation', showMarks: true, liveAssistant: false, motion: false };
const ref = <T,>(current: T) => ({ current });

export function newcomer(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 'u1', name: 'New Person', email: 'new.person@example.com', businessLine: 'Consulting', stage: 'Consultant', counsellor: null, readOnly: false,
    data: { progress: {}, ambitions: [], interests: [], prefs: { initials: '', color: '' } }, photo: null, ...overrides,
  };
}

const viewModel = (subject: Subject, access: Access = { isSystem: false, domains: [], userId: subject.id }, state: Partial<AppState> = {}) =>
  new Logic({ ...initState(cfg), ...state }, () => {}, cfg, { toastTimer: ref(undefined), drag: ref(null), file: ref(null), chat: ref(null) }, access, subject, async () => {}).renderVals();

describe('a person with no learning data yet', () => {
  it('renders the view model with zero readiness and hours', () => {
    const vm = viewModel(newcomer());
    expect(vm.readiness).toBe(0);
    expect(vm.hoursYear).toBe(0);
  });
  it('renders without a business line or stage', () => {
    expect(() => viewModel(newcomer({ businessLine: null, stage: null }))).not.toThrow();
  });
});

describe('the person card in the sidebar', () => {
  it('describes stage, line, next stage and counsellor', () => {
    const vm = viewModel(newcomer({ counsellor: { id: 'c1', name: 'Ann Peeters' } }));
    expect(vm.who).toMatchObject({ name: 'New Person', roleLine: 'Consultant · Consulting', nextStage: 'Senior consultant', counsellorLine: 'Counsellor: Ann Peeters', readOnly: false });
  });
  it('says what is missing for a person without line, stage or counsellor', () => {
    const vm = viewModel(newcomer({ businessLine: null, stage: null }));
    expect(vm.who).toMatchObject({ roleLine: 'No business line yet', nextStage: 'Consultant', counsellorLine: 'No counsellor' });
  });
});

describe('marks', () => {
  it('are none for a newcomer', () => { expect(viewModel(newcomer()).marks).toEqual([]); });
  it('include a first certification once one is accepted', () => {
    const vm = viewModel(newcomer({ data: { progress: { L23: { state: 'accepted', pct: 100, chosen: false } }, ambitions: [], interests: [], prefs: { initials: '', color: '' } } }));
    expect(vm.marks).toEqual(['First certification']);
  });
});

const submitted = { progress: { L10: { state: 'submitted' as const, pct: 100, chosen: false } }, ambitions: [], interests: [], prefs: { initials: '', color: '' } };

describe('accepting a submitted learning', () => {
  it('is offered to the counsellor viewing the counsellee', () => {
    const vm = viewModel(newcomer({ readOnly: true, counsellor: { id: 'c1', name: 'Ann Peeters' }, data: submitted }), { isSystem: false, domains: [], userId: 'c1' }, { detailId: 'L10' });
    expect(vm.det.canAcceptIt).toBe(true);
  });
  it('is not offered to an unrelated viewer or to the learner', () => {
    expect(viewModel(newcomer({ readOnly: true, data: submitted }), { isSystem: false, domains: [], userId: 'x9' }, { detailId: 'L10' }).det.canAcceptIt).toBe(false);
    expect(viewModel(newcomer({ data: submitted }), undefined, { detailId: 'L10' }).det.canAcceptIt).toBe(false);
  });
});

describe('the assistant chat', () => {
  it('belongs to the person it was started for', () => {
    const vm = viewModel(newcomer(), undefined, { chat: [{ role: 'user', text: 'about someone else' }], chatFor: 'other', proposal: { interests: [{ label: 'Tax', domain: 'reg' }], ambition: null } });
    expect(vm.chat).toHaveLength(1);
    expect(vm.hasProposal).toBe(false);
  });
});

describe('a person without a business line', () => {
  it('gets a notice on the map', () => {
    expect(viewModel(newcomer({ businessLine: null })).noLineNote).toMatch(/business line/);
    expect(viewModel(newcomer()).noLineNote).toBe('');
  });
});

describe('the Director and Partner stages', () => {
  it('Director follows Senior manager', () => {
    const vm = viewModel(newcomer({ stage: 'Senior manager' }));
    expect(vm.who.nextStage).toBe('Director');
    expect(vm.who.readinessLine).toBe('0% ready for Director');
  });
  it('Partner follows Director', () => {
    expect(viewModel(newcomer({ stage: 'Director' })).who.readinessLine).toBe('0% ready for Partner');
  });
  it('is the top of the career path', () => {
    expect(viewModel(newcomer({ stage: 'Partner' })).who.readinessLine).toBe('Partner · top of the career path');
  });
  it('copy for a Partner names Partner instead of a next stage', () => {
    const vm = viewModel(newcomer({ stage: 'Partner' }));
    const text = JSON.stringify(vm);
    expect(text).not.toContain('the next stage');
    expect(text).not.toContain('Partner → Partner');
    expect(vm.centerSub).toBe('Partner · top of the career path');
  });
});

describe("the learner's eye", () => {
  it('offers only the person being viewed', () => {
    const vm = viewModel(newcomer({ stage: 'Manager' }));
    expect(vm).not.toHaveProperty('personaOptions');
    expect(vm.pz).toMatchObject({ name: 'New Person', stage: 'Manager' });
  });
});

describe('the Knowledge library', () => {
  vi.stubGlobal('window', { setTimeout, clearTimeout, scrollTo: () => {} });
  const admin: Access = { isSystem: true, domains: [], userId: 'u1' };
  const kb = (state: Partial<AppState>, access = admin) => {
    const sink: Partial<AppState>[] = []; const subject = newcomer(); const st = { ...initState(cfg), screen: 'adminKb' as const, ...state };
    const vm = new Logic(st, (p) => { sink.push(typeof p === 'function' ? p(st) : p); }, cfg,
      { toastTimer: ref(undefined), drag: ref(null), file: ref(null), chat: ref(null) }, access, subject, async () => {}).renderVals();
    return { vm, sink };
  };
  it('finds bundles by concept title and by tag', () => {
    expect(kb({ kbSearch: 'qdmtt' }).vm.kb!.kbCards.map((c) => c.name)).toEqual(['Belgian tax updates 2026']);
    expect(kb({ kbSearch: 'sbi' }).vm.kb!.kbCards.map((c) => c.name)).toEqual(['Communication & feedback']);
  });
  it('counts a bundle under its secondary topics too', () => {
    const industries = kb({}).vm.kb!.kbTree.find((t) => t.label === 'Industries')!;
    expect(industries.count).toBe('2');
  });
  it('refuses to delete the last RAG model and promotes a new default', () => {
    const one = kb({ kbOpen: true, kbSel: 'B5' });
    one.vm.kb!.km.del();
    expect(one.sink.some((p) => 'bundles' in p)).toBe(false);
    const two = kb({ kbOpen: true, kbSel: 'B2' });
    two.vm.kb!.km.del();
    const b2 = two.sink.find((p) => 'bundles' in p)!.bundles!.find((b) => b.id === 'B2')!;
    expect(b2.models).toHaveLength(1);
    expect(b2.models[0].def).toBe(true);
  });
  it('is for admins only', () => {
    const user = kb({ screen: 'map' }, { isSystem: false, domains: [], userId: 'u1' });
    user.vm.goKb();
    expect(user.sink[0]).toMatchObject({ screen: 'map' });
  });
});


describe('the Knowledge library over time', () => {
  const admin: Access = { isSystem: true, domains: [], userId: 'u1' };
  const live = (state: Partial<AppState>) => {
    let st: AppState = { ...initState(cfg), screen: 'adminKb', ...state };
    const set = (p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => { st = { ...st, ...(typeof p === 'function' ? p(st) : p) }; };
    const vm = () => new Logic(st, set, { ...cfg, liveAssistant: true }, { toastTimer: ref(undefined), drag: ref(null), file: ref(null), chat: ref(null) }, admin, newcomer(), async () => {}).renderVals().kb!;
    return { vm, get: () => st };
  };
  it('drops a late answer once another bundle is open', async () => {
    let answer: (v: string) => void = () => {};
    vi.stubGlobal('window', { setTimeout, clearTimeout, scrollTo: () => {}, claude: { complete: () => new Promise<string>((r) => { answer = r; }) } });
    const kb = live({ kbOpen: true, kbSel: 'B2', kbTestModel: 'Mquick1', kbQ: 'Pillar Two groups consolidated revenue' });
    kb.vm().kbAsk();
    expect(kb.get().kbBusy).toBe(true);
    kb.vm().kbBack(); kb.vm().kbCards.find((c) => c.id === 'B1')!.open();
    expect(kb.get().kbBusy).toBe(false);
    answer('A late answer about Pillar Two [1]');
    await new Promise((r) => setTimeout(r, 0));
    expect(kb.get().kbAnswer).toBe('');
  });
  it('says so when an imported file cannot be read', async () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout, scrollTo: () => {} });
    const kb = live({});
    const target = { files: [{ name: 'x.md', text: () => Promise.reject(new Error('unreadable')) }], value: 'x.md' };
    kb.vm().kbOnImport({ target } as never);
    await new Promise((r) => setTimeout(r, 0));
    expect(kb.get().toast).toMatch(/^Could not read x\.md/);
    expect(kb.get().bundles).toHaveLength(initState(cfg).bundles.length);
  });
});

describe('the library filters', () => {
  it('say so when nothing matches, and clear back to everything', () => {
    let patch: Partial<AppState> = {};
    const subject = newcomer();
    const vm = new Logic({ ...initState(cfg), libQ: 'zzzz', libFormat: 'Reel', libDom: 'pers' }, (p) => { patch = typeof p === 'function' ? {} : p; }, cfg,
      { toastTimer: ref(undefined), drag: ref(null), file: ref(null), chat: ref(null) }, { isSystem: false, domains: [], userId: subject.id }, subject, async () => {}).renderVals();
    expect(vm.libItems).toHaveLength(0);
    expect(vm.libEmpty).toBe(true);
    vm.clearLibFilters();
    expect(patch).toMatchObject({ libQ: '', libOb: 'all', libLevel: '0', libFormat: 'all', libDom: 'all' });
  });
});

describe('domain zoom', () => {
  const sinkOf = (state: Partial<AppState>) => {
    const sink: Partial<AppState>[] = []; const subject = newcomer();
    const vm = new Logic({ ...initState(cfg), ...state }, (p) => { sink.push(typeof p === 'function' ? {} : p); }, cfg,
      { toastTimer: ref(undefined), drag: ref(null), file: ref(null), chat: ref(null) }, { isSystem: false, domains: [], userId: subject.id }, subject, async () => {}).renderVals();
    return { vm, sink };
  };
  it('shows one node per learning in the domain', () => {
    const { vm } = sinkOf({ zoom: 'pers' });
    expect(vm.isZoom).toBe(true);
    expect(vm.zm!.nodes).toHaveLength(LEARN.filter((r) => r[2] === 'pers').length);
  });
  it('wraps around from the first domain to the last and back', () => {
    const first = sinkOf({ zoom: DOMAINS[0][0] });
    first.vm.zm!.prev();
    expect(first.sink[0]).toMatchObject({ zoom: DOMAINS[8][0] });
    const last = sinkOf({ zoom: DOMAINS[8][0] });
    last.vm.zm!.next();
    expect(last.sink[0]).toMatchObject({ zoom: DOMAINS[0][0] });
  });
  it('reads "Not started" for a domain with nothing accepted', () => {
    const { vm } = sinkOf({ zoom: 'pers' });
    expect(vm.zm!.levelText).toMatch(/^Not started → L\d$/);
    expect(vm.zm!.levelSub).toMatch(/to go for Senior consultant$/);
    expect(vm.zm!.band).toBeNull();
  });
  it('zooms in from a hub and back out', () => {
    const { vm, sink } = sinkOf({});
    vm.cHubs[2].zoom();
    vm.zoomOut();
    expect(sink).toEqual([{ zoom: DOMAINS[2][0], sel: null }, { zoom: null, sel: null }]);
  });
});


describe('content admins', () => {
  vi.stubGlobal('window', { setTimeout, clearTimeout, scrollTo: () => {} });
  const general: Access = { isSystem: false, isGeneral: true, domains: [], userId: 'u1' };
  const consulting: Access = { isSystem: false, domains: ['Consulting'], userId: 'u1' };
  const build = (access: Access, state: Partial<AppState> = {}, reload = vi.fn(async () => {})) => {
    const sink: Partial<AppState>[] = []; const st = { ...initState(cfg), ...state };
    const L = new Logic(st, (p) => { sink.push(typeof p === 'function' ? p(st) : p); }, cfg, { toastTimer: ref(undefined), drag: ref(null), file: ref(null), chat: ref(null) }, access, newcomer(), async () => {}, reload);
    return { L, sink, reload };
  };
  it('a General Admin maps for every business line and audience; a Domain Admin only for their own line', () => {
    expect(['Consulting', 'Audit', 'Tax & Legal', 'ind:energy'].map((a) => build(general).L.canEditAud(a))).toEqual([true, true, true, true]);
    expect(['Consulting', 'Audit', 'ind:energy'].map((a) => build(consulting).L.canEditAud(a))).toEqual([true, false, false]);
  });
  it('a General Admin manages no users', () => {
    const { L, sink } = build(general);
    expect(L.canManageUsers()).toBe(false);
    L.go('users');
    expect(sink[0]).toMatchObject({ screen: 'map' });
  });
  it('a Domain Admin opens their own learnings but not firm-wide ones', () => {
    const { L, sink } = build(consulting, { screen: 'adminLib' });
    L.renderVals().adminRows.find((r) => r.id === 'L1')!.edit();
    expect(sink.some((p) => 'libForm' in p)).toBe(false);
    expect(sink.find((p) => 'toast' in p)!.toast).toMatch(/^Firm-wide learning · a General or System Admin edits it/);
    const g = build(general, { screen: 'adminLib' });
    g.L.renderVals().adminRows.find((r) => r.id === 'L1')!.edit();
    expect(g.sink[0].libForm).toMatchObject({ id: 'L1', title: LEARN[0][1], line: '' });
  });
  it('checks the learning form before saving', async () => {
    vi.mocked(store.saveLearning).mockClear();
    const { L, sink } = build(general, { libForm: { ...build(general).L.blankForm(), title: 'Pricing basics', hours: 'abc' } });
    await L.saveLearningForm('published');
    expect(store.saveLearning).not.toHaveBeenCalled();
    expect(sink.find((p) => 'toast' in p)!.toast).toBe('Effort must be a number of hours above zero');
  });
  it('saves a learning for the chosen line and reloads the catalogue', async () => {
    vi.mocked(store.saveLearning).mockClear();
    const { L, reload } = build(consulting, { libForm: { ...build(consulting).L.blankForm(), title: 'Pricing basics', hours: '1,5' } });
    await L.saveLearningForm('draft');
    expect(store.saveLearning).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pricing basics', hours: 1.5, business_line: 'Consulting', status: 'draft' }), undefined);
    expect(reload).toHaveBeenCalledWith();
  });
  it('will not remove a learning that another line still uses', async () => {
    vi.mocked(store.removeLearning).mockClear();
    const maps = { ...initState(cfg).maps, Audit: [['L30', 'Analyst', 'advised']] as [string, string, string][] };
    const { L, sink } = build(consulting, { maps, libForm: { ...build(consulting).L.blankForm(), id: 'L30', title: 'Own learning' } });
    await L.removeLearningForm();
    expect(store.removeLearning).not.toHaveBeenCalled();
    expect(sink.find((p) => 'toast' in p)!.toast).toMatch(/^Still mapped for Audit, Tax & Legal · ask their admins to unmap it before you remove it$/);
  });
  it('publishes pending curriculum changes to the database', async () => {
    vi.mocked(store.publishMappings).mockClear();
    const maps = { ...initState(cfg).maps, Consulting: [['L5', 'Partner', 'advised']] as [string, string, string][] };
    const { L, reload } = build(consulting, { maps, pending: { 'Consulting|L5': true, 'Consulting|L7': true } });
    await L.publish();
    expect(store.publishMappings).toHaveBeenCalledWith({ upserts: [{ audience: 'Consulting', learning_id: 'L5', stage: 'Partner', obligation: 'advised' }], deletes: [{ audience: 'Consulting', learning_id: 'L7' }] });
    expect(reload).toHaveBeenCalledWith(['Consulting|L5', 'Consulting|L7']);
  });
  it('lets a Domain Admin edit only their own line\'s bundles', () => {
    const bundles = initState(cfg).bundles.map((b) => ({ ...b, line: b.id === 'B1' ? 'Consulting' : 'Tax & Legal' }));
    const other = build(consulting, { screen: 'adminKb', kbOpen: true, kbSel: 'B2', bundles });
    const kb = other.L.renderVals().kb!;
    expect(kb.kbs.editable).toBe(false);
    kb.kbs.reindex();
    expect(other.sink.some((p) => 'bundles' in p)).toBe(false);
    const own = build(consulting, { screen: 'adminKb', kbOpen: true, kbSel: 'B1', bundles });
    own.L.renderVals().kb!.kbs.reindex();
    expect(own.sink.some((p) => 'bundles' in p)).toBe(true);
    expect(store.saveBundleSoon).toHaveBeenCalled();
  });
});

describe('mappings to learnings the viewer cannot see', () => {
  it('render without crashing', () => {
    const maps = { ...initState(cfg).maps, 'Tax & Legal': [['L999', 'Senior manager', 'mandatory']] as [string, string, string][] };
    expect(() => viewModel(newcomer(), undefined, { maps, screen: 'adminMap' })).not.toThrow();
    expect(() => viewModel(newcomer(), undefined, { maps })).not.toThrow();
  });
});
