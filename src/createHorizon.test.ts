// Create & share's upload form takes a .horizon file for a Presentation (studios plan, Task 3.3; Review Focus 6): read
// and checked in the browser, refused with a reason before anything is stored, otherwise the draft is saved, the file
// uploaded into its folder through the media adapter, and its summary saved as the one item.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import garden from './horizon/fixtures/Garden tour.horizon?raw';
import * as store from './lib/contributionStore';
import * as media from './lib/mediaStore';
import type { CreateData, Rule } from './logic/contribution';
import { emptyParts } from './logic/contribution';
import { flush, harness, member, person, stubWindow } from './test/harness';
import type { AppState } from './types';

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e', ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async () => ID), removeDraft: vi.fn(), submitContribution: vi.fn(async () => 'review'), checkContribution: vi.fn(),
  decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), loadGrants: vi.fn(), addGrant: vi.fn(), removeGrant: vi.fn(), loadExperts: vi.fn(), setExpert: vi.fn(),
}));
vi.mock('./lib/mediaStore', () => ({ uploadMedia: vi.fn(async (id: string) => USER + '/' + id + '/presentation.horizon'), mediaText: vi.fn(), removeContributionMedia: vi.fn() }));

const rule: Rule = { id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'], formats: ['Presentation'] };
const data: CreateData = { contributions: [], reviews: [], rules: [rule], policies: [], peers: 3 };
const open = (o: { readOnly?: boolean; state?: Partial<AppState> } = {}) => {
  const h = harness({ access: member('u1'), subject: person(o.readOnly ? { id: 'u9', name: 'Other Person', readOnly: true } : {}), state: { screen: 'create', create: data, createTab: 'new', ...o.state } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  h.L().setState({ nw: { ...h.state.nw, type: 'Presentation', line: 'Consulting' } });
  return Object.assign(h, { c: () => h.vm().create! });
};
// A file as the browser hands it over: its name, size and text.
const file = (text: string, name = 'Garden tour.horizon', size = text.length) => ({ name, size, text: async () => text }) as unknown as File;
const pick = async (h: ReturnType<typeof open>, f: File) => {
  h.c().horizonPanel!.pick({ target: { files: [f], value: 'x' } } as never);
  await flush(10);
};

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });

describe('the Presentation upload', () => {
  it('shows only for a Presentation, and asks for the file before it can be sent', () => {
    const h = open();
    expect(h.c().itemsPanel).toBeNull();
    expect(h.c().horizonPanel).toMatchObject({ item: null, problems: [], max: 'Up to 50 MB' });
    expect(h.c().nwChecks.map((c) => c.text)).toContain('Add the .horizon file');
    h.L().setState({ nw: { ...h.state.nw, type: 'Podcast' } });
    expect(h.c().horizonPanel).toBeNull();
  });
  it('saves the draft, uploads the file into its folder and keeps the file\'s summary as the item', async () => {
    const h = open();
    await pick(h, file(garden));
    expect(vi.mocked(media.uploadMedia)).toHaveBeenCalledWith(ID, expect.anything(), 'presentation.horizon');
    const item = { kind: 'horizon', path: USER + '/' + ID + '/presentation.horizon', title: 'Garden tour', slides: 3, seconds: 0 };
    expect(vi.mocked(store.saveDraft).mock.calls.at(-1)).toEqual([expect.objectContaining({ type: 'Presentation', title: 'Garden tour', items: [item] }), ID]);
    expect(h.state.nw).toMatchObject({ title: 'Garden tour', savedId: ID, items: { list: [item], problems: [] } });
    expect(h.c().horizonPanel!.item).toEqual({ title: 'Garden tour', line: '3 slides · counts 0.25 h' });
    expect(h.c().nwChecks.map((c) => c.text)).toContain('Presentation added · 3 slides · counts 0.25 h');
    expect(h.lastToast()).toBe('Saved as draft · the presentation is stored with it');
  });
  it.each([
    ['not JSON', file('<html>'), 'This file is not JSON, so it is not a Horizon presentation'],
    ['without format horizon', file('{"version":1,"frames":[]}'), 'This file does not say it is a Horizon presentation (format: horizon)'],
    ['made with a newer Horizon', file('{"format":"horizon","version":3,"frames":[{"id":"a"}]}'), 'Made with a newer Horizon (file version 3) · this player reads version 1'],
    ['over 50 MB', file(garden, 'Big.horizon', 51 * 1024 * 1024), 'A Horizon presentation is at most 50 MB · this one is 51.0 MB'],
    ['not a .horizon file', file(garden, 'deck.pptx'), 'Add a .horizon file made in Horizon'],
    ['with a client name on a slide', file(garden.replace('Come back in spring', 'Come back to Delcroix')), '“Delcroix” looks like a client name in the presentation · anonymise it in Horizon'],
  ])('refuses a file %s before anything is stored, and says why', async (_, f, why) => {
    const h = open();
    await pick(h, f);
    expect(h.state.nw.items!.problems).toEqual([why]);
    expect(vi.mocked(store.saveDraft)).not.toHaveBeenCalled();
    expect(vi.mocked(media.uploadMedia)).not.toHaveBeenCalled();
  });
  it('says so when Storage refuses the file, and keeps the draft without it', async () => {
    vi.mocked(media.uploadMedia).mockImplementationOnce(async () => { throw new Error('Not allowed · files change only while your contribution is a draft or has changes requested'); });
    const h = open();
    await pick(h, file(garden));
    expect(h.lastToast()).toBe('Not allowed · files change only while your contribution is a draft or has changes requested');
    expect(h.state.nw.items!.list).toEqual([]);
    expect(h.state.createBusy).toBe(false);
  });
  it('does nothing while viewing someone else', async () => {
    const h = open({ readOnly: true });
    await pick(h, file(garden));
    expect(vi.mocked(store.saveDraft)).not.toHaveBeenCalled();
  });
  it('refuses to submit without the file', async () => {
    const h = open();
    h.L().setState({ nw: { ...h.state.nw, title: 'T', take: 'One point.' } });
    h.c().nwSubmit(); await flush(10);
    expect(h.lastToast()).toBe('Add the .horizon file first');
    expect(vi.mocked(store.submitContribution)).not.toHaveBeenCalled();
  });
});
