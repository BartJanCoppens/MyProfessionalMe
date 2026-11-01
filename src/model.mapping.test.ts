// Curriculum mapping: lenses, audiences, coverage, the board's drag and drop, the selection dock, signals,
// the copilot (scripted and live), the learner's eye and publishing (FT-MAP-CUR-*).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { LEARN, MAPS0, SIGNALS } from './data';
import * as store from './lib/contentStore';
import type { Op, Persona } from './types';
import { deferred, domainAdmin, flush, generalAdmin, harness, person, stubWindow, systemAdmin } from './test/harness';

vi.mock('./lib/contentStore', async (orig) => ({ ...(await orig<object>()), saveLearning: vi.fn(async () => {}), removeLearning: vi.fn(async () => {}), publishMappings: vi.fn(async () => {}), saveBundleSoon: vi.fn(), saveBundleNow: vi.fn() }));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

const curr = (access = systemAdmin(), state = {}, subject = person()) => harness({ access, subject, state: { screen: 'adminMap' as const, ...state } });
const dropEvent = (data = '') => ({ preventDefault: vi.fn(), dataTransfer: { getData: vi.fn(() => data), setData: vi.fn(), effectAllowed: '' } }) as unknown as DragEvent & { preventDefault: ReturnType<typeof vi.fn> };
const col = (h: ReturnType<typeof curr>, stage: string) => h.vm().stageCols.find((c) => c.name === stage)!;
const mapOf = (h: ReturnType<typeof curr>, aud: string) => h.state.maps[aud];

describe('lenses and audiences', () => {
  it('opens on the admin\'s own business line', () => {
    expect(curr().vm().audName).toBe('Consulting');
    expect(curr(domainAdmin(['Audit'])).vm().audName).toBe('Audit');
    expect(curr(generalAdmin()).vm().audName).toBe('Consulting');
  });
  it('switches lens and opens its first audience', () => {
    const h = curr(systemAdmin(), { mapAud: 'Audit', mapStage: 'Analyst', mapSel: 'L7' });
    expect(h.vm().lensOptions.map((o) => o.label)).toEqual(['Business line', 'Industry', 'Technology', 'Ambition', 'Profile']);
    h.vm().setLens('ind');
    expect(h.state).toMatchObject({ mapLens: 'ind', mapAud: null, mapStage: null, mapSel: null });
    const vm = h.vm();
    expect(vm).toMatchObject({ audName: 'Energy & utilities', lensLabel: 'Industry', audSummary: '4 learnings · 84 people' });
    expect(vm.audChips.map((c) => [c.label, c.reach, c.on])).toEqual([['Energy & utilities', '84', true], ['Healthcare', '61', false], ['Wholesale & retail', '97', false], ['Public sector', '73', false]]);
  });
  it('picks an audience from its chip and a stage from the coverage grid', () => {
    const h = curr();
    h.vm().audChips[1].pick();
    expect(h.state).toMatchObject({ mapAud: 'Audit', mapStage: null });
    h.vm().covRows[2].cells[3].pick();
    expect(h.state).toMatchObject({ mapAud: 'Tax & Legal', mapStage: 'Manager' });
    expect(h.vm().covRows[2].cells[3].ring).not.toBe('none');
    expect(h.vm().stageCols[3].ring).not.toBe('none');
    h.vm().covRows[0].pick();
    expect(h.state).toMatchObject({ mapAud: 'Consulting', mapStage: null });
  });
  it('ignores a remembered audience from another lens', () => {
    expect(curr(systemAdmin(), { mapLens: 'tec', mapAud: 'Audit' }).vm().audName).toBe('Data & Azure');
  });
});

describe('coverage', () => {
  it('counts learnings, hours, mandatory items and reach per stage', () => {
    const row = curr().vm().covRows[0];
    expect(row).toMatchObject({ key: 'Consulting', reach: '508 people', rowBg: '#f3f5f0' });
    expect(row.cells[0]).toMatchObject({ stage: 'Analyst', label: '5', sub: '9 h', tip: 'Consulting · Analyst · 5 learnings · 3 mandatory · 97 people' });
    expect(row.cells[6]).toMatchObject({ label: '—', sub: '', bg: '#fafbf8' });
  });
  it('flags audiences with open signals', () => {
    const rows = curr(systemAdmin(), { mapLens: 'ind' }).vm().covRows;
    expect(rows.map((r) => r.sig)).toEqual(['2', '0', '1', '0']);
    expect(rows[0].hasSig).toBe(true);
  });
  it('summarises each stage column', () => {
    expect(col(curr(), 'Analyst').summary).toBe('5 learnings · 3 mandatory · 9 h · 97 people');
    expect(col(curr(systemAdmin(), { mapLens: 'amb', mapAud: 'amb:sust' }), 'Senior consultant').summary).toBe('1 learnings · 10 h · 12 people');
  });
});

describe('the palette and the board', () => {
  it('lists the learnings not yet mapped to the audience', () => {
    const vm = curr().vm();
    expect(vm.paletteCount).toBe(LEARN.length - MAPS0.Consulting.length);
    expect(vm.palette.map((p) => p.id)).not.toContain('L7');
  });
  it('maps a learning dragged from the palette onto a stage, as advised', () => {
    const h = curr();
    const start = dropEvent();
    h.vm().palette.find((p) => p.id === 'L6')!.onDragStart(start);
    expect(h.refs.drag.current).toBe('L6');
    expect(start.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'L6');
    const drop = dropEvent();
    col(h, 'Manager').onDrop(drop);
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(mapOf(h, 'Consulting')).toContainEqual(['L6', 'Manager', 'advised']);
    expect(h.state.pending).toEqual({ 'Consulting|L6': true });
    expect(h.state.overStage).toBeNull();
    expect(h.refs.drag.current).toBeNull();
    expect(h.lastToast()).toBe('Mapped to Consulting · Manager · publish to apply');
  });
  it('moves a mapped learning to another stage and keeps its obligation', () => {
    const h = curr();
    h.refs.drag.current = 'L7';
    col(h, 'Consultant').onDrop(dropEvent());
    expect(mapOf(h, 'Consulting').filter((m) => m[0] === 'L7')).toEqual([['L7', 'Consultant', 'mandatory']]);
  });
  it('does nothing when dropped on its own stage', () => {
    const h = curr({ ...systemAdmin() }, { overStage: 'Analyst' });
    h.refs.drag.current = 'L7';
    col(h, 'Analyst').onDrop(dropEvent());
    expect(h.state.pending).toEqual({});
    expect(h.state.overStage).toBeNull();
  });
  it('reads the learning from the drag data when the ref is empty, and ignores an empty drop', () => {
    const h = curr();
    col(h, 'Partner').onDrop(dropEvent('L9'));
    expect(mapOf(h, 'Consulting')).toContainEqual(['L9', 'Partner', 'advised']);
    const e = curr();
    col(e, 'Partner').onDrop(dropEvent(''));
    expect(e.state.pending).toEqual({});
  });
  it('highlights the stage under the pointer and clears it on leave', () => {
    const h = curr();
    const over = dropEvent();
    col(h, 'Manager').onDragOver(over);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(h.state.overStage).toBe('Manager');
    expect(col(h, 'Manager')).toMatchObject({ bd: '#86BC25', bdStyle: 'dashed' });
    const n = h.patches.length;
    col(h, 'Manager').onDragOver(dropEvent());
    expect(h.patches.length).toBe(n);
    col(h, 'Analyst').onDragLeave();
    expect(h.state.overStage).toBe('Manager');
    col(h, 'Manager').onDragLeave();
    expect(h.state.overStage).toBeNull();
  });
  it('unmaps a learning dropped back on the palette', () => {
    const h = curr();
    h.refs.drag.current = 'L7';
    h.vm().paletteDrop(dropEvent());
    expect(mapOf(h, 'Consulting').some((m) => m[0] === 'L7')).toBe(false);
    expect(h.lastToast()).toBe('Removed from Consulting · publish to apply');
    const u = curr();
    u.vm().paletteDrop(dropEvent('L6'));
    expect(u.state.pending).toEqual({});
  });
  it('survives a browser that refuses drag data', () => {
    const h = curr();
    const e = { dataTransfer: { setData: () => { throw new Error('no'); } } } as unknown as DragEvent;
    expect(() => h.vm().palette[0].onDragStart(e)).not.toThrow();
    expect(h.refs.drag.current).toBe(h.vm().palette[0].id);
  });
  it('shows board cards with their other audiences and pending state', () => {
    const h = curr(systemAdmin(), { pending: { 'Consulting|L7': true } });
    const card = col(h, 'Analyst').items.find((i) => i.id === 'L7')!;
    expect(card).toMatchObject({ sub: 'Personal growth · L2 · 1.5 h · +2 audiences', isMand: true, pending: true, border: '1px solid #c8cdc3' });
    expect(col(h, 'Senior consultant').items.find((i) => i.id === 'L2')!.sub).toBe('Job technical skills · L3 · 8 h · +3 audiences');
  });
});

describe('the selection dock', () => {
  it('selects a card, dims other domains and selects it off again', () => {
    const h = curr();
    col(h, 'Analyst').items.find((i) => i.id === 'L7')!.onClick();
    expect(h.state.mapSel).toBe('L7');
    expect(col(h, 'Analyst').items.find((i) => i.id === 'L16')!.op).toBe(0.45);
    expect(col(h, 'Analyst').items.find((i) => i.id === 'L7')!.border).toBe('2px solid #1a1d18');
    col(h, 'Analyst').items.find((i) => i.id === 'L7')!.onClick();
    expect(h.state.mapSel).toBeNull();
  });
  it('explains who a business-line mapping reaches and the rule behind it', () => {
    const ms = curr(systemAdmin(), { mapSel: 'L7' }).vm().ms!;
    expect(ms).toMatchObject({
      title: 'Feedback that lands', ob: 'mandatory', canMand: true, sub: 'Business line · Consulting · Analyst · Personal growth · Practitioner · L2 · 1.5 h',
      touch: 'Reaches about 97 people (estimate) at Analyst in Consulting. It joins their mandatory items and counts toward readiness.',
      rulePlain: 'Business line is Consulting and stage is Analyst → mandatory before the next promotion review',
      ruleExpr: 'business_line == "Consulting" && stage == "Analyst" → mandatory(L7)',
    });
    expect(ms.also.map((a) => a.text)).toEqual(['Business line · Audit · Analyst · mandatory', 'Business line · Tax & Legal · Analyst · mandatory']);
  });
  it('says when no other audience has the learning', () => {
    expect(curr(systemAdmin(), { mapSel: 'L3' }).vm().ms!.also).toEqual([{ color: '#d5dacf', text: 'No other audience' }]);
  });
  it('changes the obligation and removes the mapping', () => {
    const h = curr(systemAdmin(), { mapSel: 'L7' });
    h.vm().ms!.setOb('advised');
    expect(mapOf(h, 'Consulting')).toContainEqual(['L7', 'Analyst', 'advised']);
    expect(h.lastToast()).toBe('Now advised for Consulting · publish to apply');
    h.vm().ms!.remove();
    expect(mapOf(h, 'Consulting').some((m) => m[0] === 'L7')).toBe(false);
    expect(h.state.mapSel).toBeNull();
    expect(h.state.pending).toEqual({ 'Consulting|L7': true });
  });
  it('keeps ambition audiences advised and describes them as suggestions', () => {
    const h = curr(systemAdmin(), { mapLens: 'amb', mapAud: 'amb:sust', mapSel: 'L34' });
    const ms = h.vm().ms!;
    expect(ms.touch).toBe('Reaches up to about 12 people (estimate) at Senior consultant who saved this ambition. It shows in their ambitions cloud as a suggestion and never counts toward readiness.');
    expect(ms.ruleExpr).toBe('ambition == "Sustainability lead" && stage == "Senior consultant" → suggest(L34)');
    ms.setOb('mandatory');
    expect(mapOf(h, 'amb:sust')).toContainEqual(['L34', 'Senior consultant', 'advised']);
    expect(curr(systemAdmin(), { mapLens: 'pro', mapAud: 'pro:blue', mapSel: 'L37' }).vm().ms!.touch).toMatch(/who shared this profile\. It shows in their personality cloud/);
  });
  it('opens the learning in the library and returns to mapping', () => {
    const h = curr(systemAdmin(), { mapSel: 'L7' });
    h.vm().ms!.openLib();
    expect(h.state).toMatchObject({ screen: 'detail', detailId: 'L7', origin: 'adminMap' });
  });
  it('closes the dock', () => {
    const h = curr(systemAdmin(), { mapSel: 'L7' });
    h.vm().clearMapSel();
    expect(h.state.mapSel).toBeNull();
  });
});

describe('editing rights on the board', () => {
  it('lets a Domain Admin read another line without changing it', () => {
    const h = curr(domainAdmin(['Consulting']), { mapAud: 'Audit' });
    expect(h.vm().editable).toBe(false);
    h.refs.drag.current = 'L6';
    col(h, 'Manager').onDrop(dropEvent());
    expect(mapOf(h, 'Audit')).toEqual(MAPS0.Audit);
    expect(h.lastToast()).toBe('Outside your domain: Audit');
  });
  // Bug: the read-only note says only a System Admin edits the audience, but its Domain Admins and General Admins do too (kbVals uses whoEdits()).
  it('names who can edit a read-only audience', () => {
    expect(curr(domainAdmin(['Consulting']), { mapAud: 'Audit' }).vm().readOnlyNote).not.toMatch(/Only a System Admin/);
  });
  it('applies the allowed part of a mixed change and says what was refused', () => {
    const h = curr(domainAdmin(['Consulting']));
    h.L().applyOps([{ op: 'add', aud: 'Consulting', lid: 'L6', stage: 'Analyst' }, { op: 'add', aud: 'ind:energy', lid: 'L6', stage: 'Analyst' }], 'never shown');
    expect(mapOf(h, 'Consulting')).toContainEqual(['L6', 'Analyst', 'advised']);
    expect(mapOf(h, 'ind:energy').some((m) => m[0] === 'L6')).toBe(false);
    expect(h.toasts()).toEqual(['Outside your domain: Energy & utilities · the rest was applied']);
  });
  it('lets a General Admin edit every lens', () => {
    expect(['bl', 'ind', 'tec', 'amb', 'pro'].map((mapLens) => curr(generalAdmin(), { mapLens }).vm().editable)).toEqual([true, true, true, true, true]);
  });
});

describe('signals', () => {
  it('show every open signal to a System or General Admin and none to a Domain Admin', () => {
    expect(curr().vm().sigCards.map((s) => s.id)).toEqual(SIGNALS.map((s) => s.id));
    expect(curr(generalAdmin()).vm().sigCount).toBe(String(SIGNALS.length));
    expect(curr(domainAdmin(['Consulting'])).vm()).toMatchObject({ noSig: true, sigCount: '0' });
  });
  it('describe the change, where it lands and its impact', () => {
    const cards = curr().vm().sigCards;
    expect(cards[0]).toMatchObject({ title: 'Add “Negotiating scope with procurement”', where: 'Industry · Energy & utilities · Senior consultant', impact: 'Reaches about 22 people · +7 h each (estimate)', hasQuote: true });
    expect(cards[1]).toMatchObject({ title: 'Make “CSRD essentials” advised', impact: 'Frees 10 mandatory h for about 22 people (estimate)' });
    expect(cards[1].evidence).toMatch(/^A Senior consultant in Energy & utilities stacks 19 h of mandatory learning/);
    expect(cards[4]).toMatchObject({ title: 'Remove “Value-chain cost modelling in Excel”', impact: 'Removes a duplicate for about 25 people (estimate)', hasQuote: false });
  });
  it('apply the change and open its audience', () => {
    const h = curr();
    h.vm().sigCards[0].apply();
    expect(mapOf(h, 'ind:energy')).toContainEqual(['L32', 'Senior consultant', 'advised']);
    expect(h.state).toMatchObject({ sigDone: { S1: true }, mapLens: 'ind', mapAud: 'ind:energy', mapStage: 'Senior consultant', mapSel: null, pending: { 'ind:energy|L32': true } });
    expect(h.lastToast()).toBe('Applied · Energy & utilities · publish to apply');
    expect(h.vm().sigCards.map((s) => s.id)).not.toContain('S1');
  });
  it('are dismissed without changing the maps', () => {
    const h = curr();
    h.vm().sigCards[2].dismiss();
    expect(h.state.sigDone).toEqual({ S3: true });
    expect(h.state.pending).toEqual({});
  });
  it('disappear once the map already holds their change', () => {
    const maps = { ...curr().state.maps, 'ind:energy': [['L18', 'Senior consultant', 'advised']] as [string, string, string][] };
    expect(curr(systemAdmin(), { maps }).vm().sigCards.map((s) => s.id)).not.toContain('S2');
  });
});

describe('the copilot, scripted', () => {
  const ask = async (text: string, access = systemAdmin(), state = {}) => { const h = curr(access, state); await h.L().askCp(text); return h; };
  it('finds learnings that arrive twice and proposes removing the narrower copy', async () => {
    const h = await ask('Where does a learning arrive twice?');
    expect(h.state.cpReply).toMatch(/^These arrive twice for anyone in both audiences: Feedback that lands at Analyst \(Consulting, Audit, Tax & Legal\)/);
    expect(h.vm()).toMatchObject({ cpHasReply: true, cpHasOps: true, cpOps: [{ verb: 'Remove', text: '“Value-chain cost modelling in Excel” from Wholesale & retail' }] });
  });
  it('says when nothing arrives twice', async () => {
    const maps = Object.fromEntries(Object.keys(curr().state.maps).map((k) => [k, []]));
    expect((await ask('any overlap?', systemAdmin(), { maps })).state.cpReply).toBe('Nothing arrives twice at the same stage right now.');
  });
  it('proposes scope negotiation for Energy seniors, once', async () => {
    const h = await ask('What do Energy seniors still miss?');
    expect(h.vm().cpOps).toEqual([{ verb: 'Add', text: '“Negotiating scope with procurement” → Energy & utilities · Senior consultant · advised' }]);
    h.vm().cpApply();
    expect(h.lastToast()).toBe('1 change applied · publish to apply');
    await h.L().askCp('energy again');
    expect(h.state.cpOpsP).toEqual([]);
  });
  it('drafts a light start for the public sector', async () => {
    expect((await ask('Something lighter for public sector analysts')).state.cpOpsP).toEqual([{ op: 'add', aud: 'ind:public', lid: 'L31', stage: 'Analyst', ob: 'advised' }]);
  });
  it('drafts a business-developer path and applies it in one go', async () => {
    const h = await ask('Draft a path for the Business developer ambition');
    expect(h.state.cpOpsP!.map((o) => o.lid)).toEqual(['L32', 'L33', 'L37']);
    h.vm().cpApply();
    expect(mapOf(h, 'amb:bizdev').map((m) => m[0])).toEqual(['L12', 'L32', 'L33', 'L37']);
    expect(h.state.cpOpsP).toBeNull();
    expect(h.lastToast()).toBe('3 changes applied · publish to apply');
  });
  it('explains what it can do for anything else', async () => {
    const h = await ask('hello');
    expect(h.state.cpReply).toMatch(/^I can add, remove or re-weight learnings for any audience/);
    expect(h.vm().cpHasOps).toBe(false);
  });
  it('drops a proposal', async () => {
    const h = await ask('energy');
    h.vm().cpDrop();
    expect(h.state.cpOpsP).toBeNull();
  });
  it('ignores an empty question and a question while busy', async () => {
    const h = curr();
    await h.L().askCp('  ');
    expect(h.patches).toEqual([]);
    const b = curr(systemAdmin(), { cpBusy: true });
    await b.L().askCp('energy');
    expect(b.patches).toEqual([]);
  });
  it('sends on Enter, from the input and from the prompt chips', async () => {
    const h = curr(systemAdmin(), { cpInput: 'energy' });
    h.vm().cpKey({ key: 'Tab' } as KeyboardEvent<HTMLInputElement>);
    expect(h.patches).toEqual([]);
    h.vm().cpKey({ key: 'Enter' } as KeyboardEvent<HTMLInputElement>);
    await flush();
    expect(h.state.cpOpsP).toHaveLength(1);
    h.vm().setCpInput({ target: { value: 'x' } } as ChangeEvent<HTMLInputElement>);
    expect(h.state.cpInput).toBe('x');
    const p = curr(systemAdmin(), { cpInput: 'hello' });
    p.vm().cpSend();
    await flush();
    expect(p.state.cpReply).toMatch(/^I can add/);
    const c = curr();
    expect(c.vm().cpPrompts).toHaveLength(3);
    c.vm().cpPrompts[1].send();
    await flush();
    expect(c.state.cpReply).toMatch(/^These arrive twice/);
  });
  it('refuses proposals outside a Domain Admin\'s line when applied', async () => {
    const h = await ask('energy', domainAdmin(['Consulting']));
    h.vm().cpApply();
    expect(mapOf(h, 'ind:energy').some((m) => m[0] === 'L32')).toBe(false);
    expect(h.lastToast()).toBe('Outside your domain: Energy & utilities');
  });
});

describe('the copilot, live', () => {
  it('keeps only valid operations, at most five, and never mandatory for ambitions', async () => {
    const ops: Op[] = [
      { op: 'add', aud: 'nope', lid: 'L1', stage: 'Analyst' }, { op: 'add', aud: 'Audit', lid: 'L999', stage: 'Analyst' }, { op: 'swap' as Op['op'], aud: 'Audit', lid: 'L1' },
      { op: 'add', aud: 'Audit', lid: 'L1', stage: 'Intern' }, { op: 'add', aud: 'amb:sust', lid: 'L1', stage: 'Analyst', ob: 'mandatory' }, { op: 'add', aud: 'Audit', lid: 'L3', stage: 'Manager', ob: 'mandatory' },
      { op: 'setOb', aud: 'Audit', lid: 'L7', ob: 'advised' }, { op: 'remove', aud: 'Audit', lid: 'L16' }, { op: 'add', aud: 'Audit', lid: 'L4', stage: 'Manager' }, { op: 'add', aud: 'Audit', lid: 'L6', stage: 'Manager' },
    ];
    const complete = vi.fn(async () => JSON.stringify({ reply: 'Done.', ops }));
    stubWindow({ claude: { complete } });
    const h = harness({ access: systemAdmin(), config: { liveAssistant: true }, state: { screen: 'adminMap' } });
    await h.L().askCp('tidy Audit');
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 700 }));
    expect(h.state.cpReply).toBe('Done.');
    expect(h.state.cpOpsP).toEqual([
      { op: 'add', aud: 'amb:sust', lid: 'L1', stage: 'Analyst', ob: 'advised' }, { op: 'add', aud: 'Audit', lid: 'L3', stage: 'Manager', ob: 'mandatory' },
      { op: 'setOb', aud: 'Audit', lid: 'L7', ob: 'advised' }, { op: 'remove', aud: 'Audit', lid: 'L16', ob: 'advised' }, { op: 'add', aud: 'Audit', lid: 'L4', stage: 'Manager', ob: 'advised' },
    ]);
  });
  it('falls back to the scripted copilot when the model fails', async () => {
    stubWindow({ claude: { complete: async () => { throw new Error('offline'); } } });
    const h = harness({ access: systemAdmin(), config: { liveAssistant: true }, state: { screen: 'adminMap' } });
    await h.L().askCp('energy');
    expect(h.state.cpOpsP).toHaveLength(1);
    expect(h.state.cpBusy).toBe(false);
  });
});

describe('the learner\'s eye', () => {
  it('stacks the viewed person\'s business-line learning at their stage', () => {
    const pz = curr().vm().pz;
    expect(pz).toMatchObject({ name: 'Robin Test', stage: 'Consultant', totLabel: '33 h of 80 h', mandLabel: '19 h of 40 h budget', mandW: '47.5%', hasDup: false, totFg: '#1a1d18' });
    expect(pz.tags).toEqual([{ key: 'Business line', label: 'Consulting', color: '#1a1d18' }]);
    expect(pz.layers[0].meta).toBe('5 learnings · 33 h');
  });
  it('reads the stack as the person, scripted', async () => {
    const h = curr();
    expect(h.vm().readLabel).toBe('Read it as Robin');
    await h.vm().readAs();
    expect(h.vm().read).toEqual({ text: 'This looks like a plan I can finish. The business-line items set the floor and the rest follows what I asked for.', fix: 'No change needed; check again after the next evaluation round.' });
    expect(Object.keys(h.state.reads)).toHaveLength(1);
    expect(h.state.readBusy).toBe(false);
  });
  it('does not read twice at once', async () => {
    const h = curr(systemAdmin(), { readBusy: true });
    expect(h.vm().readLabel).toBe('Reading the stack');
    await h.vm().readAs();
    expect(h.patches).toEqual([]);
  });
  it('uses the live reading when there is one', async () => {
    stubWindow({ claude: { complete: async () => '{"text":"Too much.","fix":"Drop one."}' } });
    const h = harness({ access: systemAdmin(), config: { liveAssistant: true }, state: { screen: 'adminMap' } });
    await h.vm().readAs();
    expect(h.vm().read).toEqual({ text: 'Too much.', fix: 'Drop one.' });
  });
  const persona = (stage: string, aud: Partial<Persona[4]>): Persona => ['p', 'Kim', 'Kim Learner', stage, { bl: 'Consulting', ind: null, tec: null, amb: null, pro: null, ...aud }];
  it('counts a learning that arrives through two audiences once', () => {
    const st = curr().L().stack(persona('Senior consultant', { ind: 'ind:whole' }));
    expect(st.dups).toEqual([{ lid: 'L2', title: 'Value-chain cost modelling in Excel', via: ['Consulting', 'Wholesale & retail'] }]);
    expect(st.layers.map((l) => [l.aud, l.n])).toEqual([['Consulting', 6], ['Wholesale & retail', 0]]);
  });
  it('reacts to too much mandatory learning, duplicates, a thin stack and an empty layer', () => {
    const L = curr().L();
    const heavy = { ...curr().state.maps, Consulting: ['L3', 'L4', 'L5', 'L10'].map((id) => [id, 'Consultant', 'mandatory'] as [string, string, string]) };
    const H = curr(systemAdmin(), { maps: heavy }).L();
    const p = persona('Consultant', {});
    expect(H.scriptedRead(p, H.stack(p)).text).toBe('This is more mandatory learning than my year allows: 52 hours before I choose anything myself. I would rush the mandatory items and quietly skip the rest.');
    const dup = persona('Senior consultant', { ind: 'ind:whole' });
    expect(L.scriptedRead(dup, L.stack(dup)).fix).toBe('Remove Value-chain cost modelling in Excel from Wholesale & retail; Consulting already covers it.');
    const thin = persona('Analyst', { tec: 'tec:sap' });
    expect(L.scriptedRead(thin, L.stack(thin))).toEqual({ text: 'There is very little here for me yet. It reads like a starter list rather than a path toward anything I said I wanted.', fix: 'Map at least one learning to SAP at Analyst.' });
    const thinAlone = persona('Analyst', {});
    expect(L.scriptedRead(thinAlone, L.stack(thinAlone)).fix).toBe('Add one stretch item at Analyst.');
    const gap = persona('Consultant', { amb: 'amb:expert' });
    expect(L.scriptedRead(gap, L.stack(gap))).toEqual({ text: 'This looks like a plan I can finish. The business-line items set the floor and the rest follows what I asked for, although nothing reflects my ambition yet.', fix: 'Map one learning to Deep specialist at Consultant.' });
  });
  it('shows a person without a business line the line on screen', () => {
    expect(curr(systemAdmin(), {}, person({ businessLine: null, stage: null })).vm().pz).toMatchObject({ stage: 'Analyst', tags: [{ label: 'Consulting' }] });
  });
});

describe('publishing', () => {
  it('does nothing without pending changes', async () => {
    await curr().L().publish();
    expect(store.publishMappings).not.toHaveBeenCalled();
  });
  it('publishes and says how many changes went live', async () => {
    const h = curr(systemAdmin(), { pending: { 'Consulting|L7': true } });
    await h.vm().publish();
    expect(store.publishMappings).toHaveBeenCalledWith({ upserts: [{ audience: 'Consulting', learning_id: 'L7', stage: 'Analyst', obligation: 'mandatory' }], deletes: [] });
    expect(h.reloadContent).toHaveBeenCalledWith(['Consulting|L7']);
    expect(h.lastToast()).toBe('Published · 1 change now live on every map they reach');
  });
  it('shows why the database refused and keeps the changes pending', async () => {
    vi.mocked(store.publishMappings).mockRejectedValueOnce(new Error('Not published · you can only change the curriculum of your own audiences'));
    const h = curr(systemAdmin(), { pending: { 'Audit|L7': true } });
    await h.L().publish();
    expect(h.reloadContent).not.toHaveBeenCalled();
    expect(h.state.pending).toEqual({ 'Audit|L7': true });
    expect(h.lastToast()).toBe('Not published · you can only change the curriculum of your own audiences');
  });
  it('publishes once when clicked twice', async () => {
    const gate = deferred();
    vi.mocked(store.publishMappings).mockImplementationOnce(() => gate.promise);
    const h = curr(systemAdmin(), { pending: { 'Consulting|L7': true } });
    const first = h.L().publish();
    await h.L().publish();
    expect(store.publishMappings).toHaveBeenCalledTimes(1);
    gate.resolve();
    await first;
    await h.L().publish();
    expect(store.publishMappings).toHaveBeenCalledTimes(2);
  });
});
