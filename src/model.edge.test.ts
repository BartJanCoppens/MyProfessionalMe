// Edge cases: a changed catalogue (setCatalogue), unknown ids, stale results across people (FT-EDGE-*).
// Kept in its own file: setCatalogue replaces LEARN in place for every module of this test file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META, setCatalogue } from './data';
import type { Learn, LearnMeta } from './types';
import { flush, harness, person, stubWindow, systemAdmin, withProgress } from './test/harness';

vi.mock('./lib/contentStore', async (orig) => ({ ...(await orig<object>()), saveLearning: vi.fn(), removeLearning: vi.fn(), publishMappings: vi.fn(), saveBundleSoon: vi.fn(), saveBundleNow: vi.fn() }));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

const original: [Learn, LearnMeta][] = LEARN.map((r) => [r, { line: null, status: 'published' }]);
const catalogue = (rows: Learn[]) => setCatalogue(rows.map((r) => [r, { line: null, status: 'published' }]));
beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { setCatalogue(original); Object.keys(LEARN_META).forEach((k) => delete LEARN_META[k]); });

describe('a catalogue loaded from the database', () => {
  it('replaces the learnings, their lookup and their metadata in place', () => {
    const row: Learn = ['L100', 'New thing', 'prof', 2, 'Book', 'Perlego', 3, 0, '', ''];
    setCatalogue([[row, { line: 'Audit', status: 'draft' }]]);
    expect(LEARN).toEqual([row]);
    expect(Object.keys(LEARN_BY)).toEqual(['L100']);
    expect(LEARN_META).toEqual({ L100: { line: 'Audit', status: 'draft' } });
  });
  it('drops mappings to learnings that are gone from every screen', () => {
    catalogue(LEARN.filter((r) => r[0] !== 'L7'));
    const vm = harness({ access: systemAdmin(), state: { screen: 'adminMap' } }).vm();
    expect(vm.covRows[0].cells[0].label).toBe('4');
    expect(vm.libItems.map((i) => i.id)).not.toContain('L7');
  });
  it('counts only the learnings in the loaded catalogue', () => {
    catalogue(LEARN.filter((r) => r[0] !== 'L22'));
    expect(harness().vm().libCount).toBe(String(LEARN.length));
  });
  it('lays out a learning shorter than an hour in minutes', () => {
    catalogue(LEARN.map((r) => (r[0] === 'L16' ? ['L16', r[1], r[2], r[3], r[4], r[5], 0.5, r[7], r[8], r[9]] as Learn : r)));
    expect(harness().vm().libItems.find((i) => i.id === 'L16')!.hoursLabel).toBe('30 min');
  });
  // Bug: renderVals() falls back to items[0] for the detail; with an empty catalogue (a fresh database) it throws on d0.di.
  it.fails('renders with an empty catalogue', () => {
    catalogue([]);
    expect(() => harness().vm()).not.toThrow();
  });
  // Bug: road() maps due dates through a fixed table (30 Nov 2026, Jan/Mar/Jun 2027); any other due date of a mandatory
  // item on the path (learnings.due is free text) gives cols[undefined] and the whole view-model throws.
  it.fails('renders a mandatory learning due outside the four road quarters', () => {
    catalogue(LEARN.map((r) => (r[0] === 'L17' ? ['L17', r[1], r[2], r[3], r[4], r[5], r[6], r[7], 'Dec 2026', r[9]] as Learn : r)));
    expect(() => harness().vm()).not.toThrow();
  });
  // Bug: curriculum() builds signal cards with byId[g.op.lid].title; once a learning a signal names (here L32) is removed from
  // the catalogue, renderVals() throws for every System or General Admin, on every screen.
  it.fails('renders for an admin when a signal names a learning that was removed', () => {
    catalogue(LEARN.filter((r) => r[0] !== 'L32'));
    expect(() => harness({ access: systemAdmin() }).vm()).not.toThrow();
  });
});

describe('unknown ids and empty data', () => {
  it('ignores progress on a learning that no longer exists', () => {
    const vm = harness({ subject: person({ data: withProgress({ L999: 'accepted' }) }) }).vm();
    expect(vm.hoursYear).toBe(0);
    expect(vm.marks).toEqual([]);
  });
  it('shows no selection dock for an unknown selection', () => {
    expect(harness({ state: { sel: { type: 'node', id: 'L999', dom: 'tech' } } }).vm().dock).toBeNull();
    expect(harness({ access: systemAdmin(), state: { screen: 'adminMap', mapSel: 'L999' } }).vm().ms).toBeNull();
  });
  it('names an unknown domain in an ambition by its key', () => {
    const vm = harness({ subject: person({ data: withProgress({}, { ambitions: [{ id: '1', text: 'x', horizon: '', doms: ['zzz'], from: '' }] }) }) }).vm();
    expect(vm.ambitions[0]).toMatchObject({ meta: '', doms: [{ key: 'zzz', label: 'zzz' }] });
  });
});

describe('results that arrive for someone else', () => {
  it('shows the assistant chat only for the person it was started for', async () => {
    const h = harness();
    await h.L().send('five years');
    const other = harness({ subject: person({ id: 'p2', name: 'Kim Learner', readOnly: true }), state: h.state });
    expect(other.vm().chat).toHaveLength(1);
  });
  // Bug: learner's-eye readings are stored under the persona key 'me' for every person, so after "View as" another
  // person the reading made for the previous one is still shown (the chat guards against this with chatFor).
  it.fails('does not show a learner\'s-eye reading made for someone else', async () => {
    const mine = harness({ access: systemAdmin(), state: { screen: 'adminMap' } });
    await mine.vm().readAs();
    await flush();
    const viewed = harness({ access: systemAdmin(), subject: person({ id: 'p2', name: 'Kim Learner', readOnly: true }), state: mine.state });
    expect(viewed.vm().read).toBeNull();
  });
});
