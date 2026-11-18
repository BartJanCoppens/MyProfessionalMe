// The Avatar Studio's own parts (studios plan, Task 6.6): the cast (a look with "Live video" or "Portrait only", an optional stock voice offered only while the avatar voice is
// live), the choices a reopened draft shows again, and the preview built from the draft's Produce answers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { draftOf } from './createSave';
import { viewItems } from './createItems';
import * as store from './lib/contributionStore';
import { emptyParts } from './logic/contribution';
import type { Contribution, CreateData, Rule } from './logic/contribution';
import { studioContent } from './logic/studioContent';
import { studioById } from './logic/studios';
import { flush, harness, member, person, stubWindow } from './test/harness';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async () => 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(), removePolicy: vi.fn(),
  loadGrants: vi.fn(), addGrant: vi.fn(), removeGrant: vi.fn(), loadExperts: vi.fn(), setExpert: vi.fn(),
}));
vi.mock('./lib/learnerStore', () => ({ acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn() }));

const LOOKS = [{ id: 'l1', name: 'HR director · 50s', portrait: 'p1' as const, color: '#8a5a8c', licence: 'x', active: true, heygen_avatar_id: 'av-1' },
  { id: 'l2', name: 'Analyst · 30s', portrait: 'p2' as const, color: '#2f7fc1', licence: 'x', active: true, heygen_avatar_id: null }];
const VOICES = [{ id: 'v1', name: 'Warm · 40s', voice_id: 'tVoice', language: 'en', accent: null, active: true }];
const rule = (): Rule => ({ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'], formats: ['Avatar'] });
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [rule()], policies: [], peers: 3 });
const base = { line: 'Consulting', aud: '', type: 'Avatar', title: 'Selling an HR system', dom: 'prof', lvl: '3', stage: 'Analyst', take: 'Ask first.', outline: [], sources: [], ai: false, aiNote: '' };
const open = (live: string[], nw: object = {}) => {
  const h = harness({ access: member('u1'), subject: person(), config: { liveAssistant: true },
    state: { screen: 'create', create: data(), createTab: 'new', nw: { ...base, ...nw }, studio: { view: 'studio', step: 3, id: 'avatar' }, stockLooks: LOOKS, stockVoices: VOICES, aiLive: live } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  return Object.assign(h, { cast: () => h.vm().create!.studio.cast });
};

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('the Avatar Studio cast', () => {
  it('lists the stock looks, each as "Live video" or "Portrait only", and offers no voice while the avatar voice is not live', () => {
    const cast = open([]).cast();
    expect(cast.map((g) => g.key)).toEqual(['Look']);
    expect(cast[0].chips.map((c) => c.label)).toEqual(['HR director · 50s · Live video', 'Analyst · 30s · Portrait only']);
  });
  it('offers an optional stock voice while the avatar voice is live: "No voice" or a stock voice, stored by its id', async () => {
    const h = open(['avatar_voice']);
    const voice = h.cast().find((g) => g.key === 'Voice')!;
    expect(voice.hint).toBe('Speaks the portrait · optional');
    expect(voice.chips.map((c) => c.label)).toEqual(['No voice · the browser voice speaks', 'Warm · 40s']);
    voice.chips[1].pick();
    await flush();
    expect(h.state.nw.cast).toEqual({ Voice: 'v1' });
    expect(h.cast().find((g) => g.key === 'Voice')!.chips[1].on).toBe(true);
  });
});

describe('a reopened Avatar draft', () => {
  const saved = { id: 'c1', type: 'Avatar', studio: 'avatar', title: 'T', domain: 'prof', level: 3, audience_stage: 'Analyst', takeaway: '', outline: '', sources: [], ai_assisted: false, business_line: 'Consulting', audience: null,
    items: [], shape: { 'How is it scored?': 'Practice only', Language: 'Dutch', Difficulty: 'Tough', Look: 'l1', Voice: 'v1' } } as unknown as Contribution;
  it('splits the Produce answers and the cast out of the saved shape, so the Produce pickers show the saved choices', () => {
    const d = draftOf(saved);
    expect(d.shape).toEqual({ 'How is it scored?': 'Practice only' });
    expect(d.produce).toEqual({ Language: 'Dutch', Difficulty: 'Tough' });
    expect(d.cast).toEqual({ Look: 'l1', Voice: 'v1' });
  });
  it('shows the saved look as chosen', () => {
    const h = open(['avatar_voice'], draftOf(saved));
    expect(h.cast().find((g) => g.key === 'Look')!.chips.map((c) => c.on)).toEqual([true, false]);
    expect(h.vm().create!.studio.produce.find((g) => g.key === 'Language')!.chips.find((c) => c.on)!.label).toBe('Dutch');
  });
  it('leaves another studio\'s shape alone', () => {
    expect(draftOf({ ...saved, type: 'Reel', studio: 'reel', shape: { 'Who presents?': 'x', Music: 'Upbeat' } } as unknown as Contribution).shape).toEqual({ 'Who presents?': 'x', Music: 'Upbeat' });
  });
});

describe('the Avatar preview content', () => {
  const rows = studioById('avatar')!.items.map((r) => [...r]) as never[];
  it('reads the draft\'s Produce answers and cast, as the published content will', () => {
    const c = studioContent('Avatar', rows, { 'Who does the learner talk to?': 'A client executive', 'How is it scored?': 'Practice only', 'How long is a run?': '15 minutes' },
      { looks: LOOKS, voices: VOICES, draft: { produce: { Language: 'French', Difficulty: 'Gentle' }, cast: { Look: 'l1', Voice: 'v1' } } });
    expect(c).toMatchObject({ kind: 'avatar', language: 'French', difficulty: 'Gentle', minutes: 15, scoring: 'Practice only', look: { id: 'l1' }, voice: { id: 'v1', name: 'Warm · 40s' }, counterpart: 'A client executive' });
  });
});

describe('a saved Avatar contribution shown to its author or reviewers', () => {
  it('practises with the chosen stock voice: the saved view is given the stock voices', () => {
    const rows = studioById('avatar')!.items.map((r) => [...r]);
    const c = { id: 'c1', type: 'Avatar', studio: 'avatar', ai_assisted: false, items: rows, shape: { 'Who does the learner talk to?': 'A client executive', 'How is it scored?': 'Practice only', 'How long is a run?': '5 minutes', Language: 'English', Difficulty: 'Gentle', Look: 'l1', Voice: 'v1' } } as unknown as Contribution;
    const t = viewItems(c, '', false, undefined, LOOKS, VOICES).asLearner;
    expect(t?.content).toMatchObject({ kind: 'avatar', voice: { id: 'v1' } });
  });
});
