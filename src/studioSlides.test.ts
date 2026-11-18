// @vitest-environment jsdom
// Slides Studio (studios plan, Task 3.4) through the shared spine: the three build steps with a real runner (the talk-over
// checked, each slide voiced by the AI voice and stored with the draft, the talk timed), a failed voice retried on the slides
// still without one, the browser voice only as a preview that is never stored, captions only without any voice, and what
// still blocks sending.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/contributionStore';
import * as voice from './lib/voice';
import { BROWSER_VOICE } from './lib/voice';
import { emptyParts } from './logic/contribution';
import type { CreateData } from './logic/contribution';
import type { StockVoice } from './logic/ai';
import { aiAssisted } from './logic/items';
import { AI_VOICE, CAPTIONS, NO_VOICE, PRESENTER, SLIDES_MAX_SECONDS, VOICE_ALL, boundClips } from './logic/slidesContent';
import { retryStep, runBuild } from './logic/studioBuild';
import type { StudioEntry, StudioItem } from './logic/studios';
import { voiceOf } from './logic/voiceItem';
import { flush, harness, member, person, stubWindow } from './test/harness';
import type { NewDraft } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async (_f: unknown, id?: string | null) => id ?? 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
}));
vi.mock('./lib/voice', async (orig) => ({ ...(await orig<typeof import('./lib/voice')>()), speak: vi.fn(), speakInBrowser: vi.fn() }));

const FOLDER = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/';
const ROWS: StudioItem[] = [['Why it matters', 'Decisions · Not status updates', 'A steering committee exists to take decisions.'], ['Before', 'Send the pack ahead', 'Send the pack three working days ahead.'], ['After', 'Minutes · Decision log', 'Minutes go out within a day.']];
const VOICES: StockVoice[] = [{ id: 'sv1', name: 'Warm · Flemish English', voice_id: 'EL1', language: 'English', accent: null, active: true }, { id: 'sv2', name: 'Retired', voice_id: 'EL2', language: 'English', accent: null, active: false }];
const nwOf = (o: Partial<NewDraft> = {}): NewDraft => ({ line: 'Consulting', aud: '', type: 'Slides', title: 'Steering committees', dom: 'lead', lvl: '2', stage: 'Senior consultant',
  take: 'Decide, not report.', outline: [], sources: [], ai: false, aiNote: '', ...o });
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 });
const BUILD = 3; // Idea & sources, Shape it, Draft, Produce
let spoken = 0;
const mockVoice = () => vi.mocked(voice.speak).mockImplementation(async () => { spoken++; return { path: FOLDER + 'voice-' + spoken + '.mp3', seconds: 5 + spoken, marks: [{ kind: 'next' as const, at: 2 }], made: 'voice' as const }; });

const open = (o: { list?: StudioEntry[]; shape?: Record<string, string>; live?: boolean; voice?: string; how?: string; step?: number } = {}) => {
  stubWindow({});
  const h = harness({ access: member('u1'), subject: person(), config: { liveAssistant: true },
    state: { screen: 'create', create: data(), createTab: 'new', nwKb: ['B1'], aiLive: o.live === false ? [] : ['studio_voice'], stockVoices: VOICES, studio: { view: 'studio', step: o.step ?? BUILD, id: 'slides' },
      nw: nwOf({ shape: o.shape ?? { [PRESENTER]: AI_VOICE }, cast: { Voice: o.voice ?? VOICES[0].name }, items: { list: (o.list ?? ROWS) as never, how: (o.how ?? 'ai') as never, problems: [], note: '' } }) } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  const st = () => h.vm().create!.studio;
  const build = () => runBuild(st().build!.steps, st().buildRunner!, st().build!.set);
  const list = () => h.state.nw.items!.list as StudioEntry[];
  const statuses = () => st().build!.steps.map((s) => s.status);
  return Object.assign(h, { st, build, list, statuses });
};

beforeEach(() => { vi.clearAllMocks(); spoken = 0; mockVoice(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('who presents', () => {
  it('offers the AI voice only while it is live, and says why it is not offered', () => {
    const live = open().st().shape.find((g) => g.key === PRESENTER)!;
    expect(live.chips.map((c) => c.label)).toEqual([AI_VOICE, CAPTIONS]);
    expect(live.hint).toBe('');
    const off = open({ live: false, shape: {} }).st().shape.find((g) => g.key === PRESENTER)!;
    expect(off.chips.map((c) => c.label)).toEqual([CAPTIONS]);
    expect(off.hint).toMatch(/AI voice is not switched on/);
  });
  it('keeps an AI voice already chosen on screen when it stops being live, with the reason', () => {
    const g = open({ live: false }).st().shape.find((x) => x.key === PRESENTER)!;
    expect(g.chips.map((c) => [c.label, c.on])).toEqual([[AI_VOICE, true], [CAPTIONS, false]]);
    expect(g.hint).toMatch(/not switched on/);
  });
  it('has no recorded voice, avatar, video export, route or export row', () => {
    const h = open().st();
    const all = JSON.stringify([h.shape, h.produce]);
    ['My own recorded voice', 'AI avatar', 'Video', 'Short and long version', 'Routes'].forEach((w) => expect(all).not.toContain(w));
    expect(h.produce).toEqual([]);
  });
  it('says Length steers the AI draft, and carries Template and Transitions into what is published', () => {
    const shape = open().st().shape;
    expect(shape.map((g) => [g.key, g.hint])).toEqual([[PRESENTER, ''], ['Length?', 'Steers the AI draft'], ['Template', ''], ['Transitions', '']]);
  });
  it('casts the active stock voices only, once the AI voice is chosen and live', () => {
    expect(open().st().cast.map((g) => [g.key, g.chips.map((c) => c.label)])).toEqual([['Voice', ['Warm · Flemish English']]]);
    expect(open({ shape: { [PRESENTER]: CAPTIONS } }).st().cast).toEqual([]);
    expect(open({ live: false }).st().cast).toEqual([]);
  });
});

describe('building a deck with the AI voice', () => {
  it('shows the talk-over done once every slide has one, then voices each slide in the chosen stock voice and stores it with the draft', async () => {
    const h = open();
    expect(h.statuses()).toEqual(['done', 'todo', 'todo']);
    await h.build();
    expect(h.statuses()).toEqual(['done', 'done', 'done']);
    expect(voice.speak).toHaveBeenCalledTimes(3);
    expect(voice.speak).toHaveBeenNthCalledWith(2, { contributionId: 'new1', voiceId: 'EL1', text: ROWS[1][2] });
    const clips = voiceOf(h.list())!.clips;
    expect(clips.map((c) => [c.slide, c.text, c.seconds])).toEqual([[0, ROWS[0][2], 6], [1, ROWS[1][2], 7], [2, ROWS[2][2], 8]]);
    expect(boundClips(h.list())).toHaveLength(3);
    // saved with the draft, the rows kept, the provenance of the rows kept (drafted by AI stays AI-assisted)
    const saved = vi.mocked(store.saveDraft).mock.calls.at(-1)![0] as { items: unknown[] };
    expect(saved.items).toHaveLength(4);
    expect(aiAssisted({ ai: false, items: h.state.nw.items })).toBe(true);
    expect(h.st().content).toMatchObject({ kind: 'slides', made: 'ai', seconds: 21 });
  });
  it('keeps the slides it voiced when one fails, says why on that step, and a retry voices only the slides still without audio', async () => {
    vi.mocked(voice.speak).mockReset().mockImplementationOnce(async () => ({ path: FOLDER + 'voice-1.mp3', seconds: 6, marks: [], made: 'voice' as const }))
      .mockRejectedValueOnce(new Error('Daily voice limit reached for you today (UTC)'));
    const h = open();
    await h.build();
    expect(h.statuses()).toEqual(['done', 'failed', 'todo']);
    expect(h.st().build!.steps[1].error).toBe('Daily voice limit reached for you today (UTC)');
    expect(voiceOf(h.list())!.clips.map((c) => c.slide)).toEqual([0]);
    mockVoice();
    await retryStep(h.st().build!.steps, 1, h.st().buildRunner!, h.st().build!.set);
    expect(voice.speak).toHaveBeenCalledTimes(4); // 2 before, 2 now: not three again
    expect(boundClips(h.list())).toHaveLength(3);
  });
  it('voices again only the slide whose talk-over changed; a clip for other words does not count', async () => {
    const h = open();
    await h.build();
    const changed = h.list().map((x, k) => (k === 1 ? ['Before', 'Send the pack ahead', 'Send it a week ahead.'] : x)) as StudioEntry[];
    h.L().setState({ nw: { ...h.state.nw, items: { ...h.state.nw.items!, list: changed as never } } });
    expect(boundClips(changed)).toBeNull();
    expect(h.st().build!.steps.map((s) => s.status)).toEqual(['done', 'todo', 'todo']);
    expect(h.st().problems).toEqual([]);
    expect(h.st().send.problems).toEqual([VOICE_ALL]);
  });
  it('refuses to voice when the AI voice is not live, with no stored audio, and the studio cannot be sent with AI voice', async () => {
    const h = open({ live: false });
    await h.build();
    expect(h.statuses()).toEqual(['done', 'failed', 'todo']);
    expect(h.st().build!.steps[1].error).toMatch(/AI voice is not switched on/);
    expect(voice.speak).not.toHaveBeenCalled();
    expect(voiceOf(h.list())).toBeNull();
    expect(h.st().send.blocked).toBe(true);
    expect(h.st().send.problems).toEqual([NO_VOICE]);
  });
  it('asks for a stock voice first', async () => {
    const h = open({ voice: 'Not a voice' });
    await h.build();
    expect(h.st().build!.steps[1].error).toBe('Pick a stock voice in Produce first');
    expect(voice.speak).not.toHaveBeenCalled();
  });
  it('does nothing in View as', async () => {
    const h = open();
    h.subject.readOnly = true;
    await h.build();
    expect(voice.speak).not.toHaveBeenCalled();
    expect(h.st().build!.steps[1].error).toBe('Only the creator can build it');
  });
});

describe('captions only and timing', () => {
  it('needs no voice: every step is done from the rows, the talk runs at a reading pace and nothing is spoken', async () => {
    const h = open({ shape: { [PRESENTER]: CAPTIONS }, live: false });
    expect(h.statuses()).toEqual(['done', 'done', 'done']);
    expect(h.st().slides).toMatchObject({ line: expect.stringContaining('Captions only') });
    expect(h.st().send.problems).toEqual([]);
    expect(h.st().content).toMatchObject({ kind: 'slides', made: 'scripted', seconds: 9 });
    expect(voice.speak).not.toHaveBeenCalled();
  });
  it('refuses a talk over 15 minutes on the timing step, in words', async () => {
    const long = Array.from({ length: 3 }, (_, k): StudioItem => ['S' + k, 'b', 'word '.repeat(900)]);
    const h = open({ shape: { [PRESENTER]: CAPTIONS }, list: long });
    expect(h.statuses()).toEqual(['done', 'done', 'todo']);
    await h.build();
    expect(h.statuses()).toEqual(['done', 'done', 'failed']);
    expect(h.st().build!.steps[2].error).toMatch(/over the 15 min limit/);
    expect(SLIDES_MAX_SECONDS).toBe(900);
  });
  it('writes the talk-over first: a slide without one stops the build at the first step', async () => {
    const h = open({ shape: { [PRESENTER]: CAPTIONS }, list: [ROWS[0], ROWS[1], ['After', 'Minutes', ' ']] });
    expect(h.statuses()).toEqual(['todo', 'todo', 'todo']);
    await h.build();
    expect(h.st().build!.steps[0].error).toBe('Write the talk-over for every slide in the Draft step');
  });
});

describe('the browser voice', () => {
  it('previews a talk-over only when the AI voice is not live, labelled, and stores nothing', async () => {
    const h = open({ live: false, shape: { [PRESENTER]: CAPTIONS } });
    const hear = h.st().slides!.hear!;
    expect(hear.label).toBe(BROWSER_VOICE);
    expect(open().st().slides!.hear).toBeNull();
    vi.mocked(voice.speakInBrowser).mockReturnValue({ label: BROWSER_VOICE, done: Promise.resolve('ended'), stop: () => {} });
    await hear.slides[0].run();
    await flush();
    expect(voice.speakInBrowser).toHaveBeenCalledWith(ROWS[0][2]);
    expect(voice.speak).not.toHaveBeenCalled();
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(voiceOf(h.list())).toBeNull();
  });
});

describe('the preview', () => {
  it('is the deck as learners will get it, from the rows, and saves nothing', async () => {
    const h = open({ shape: { [PRESENTER]: CAPTIONS, Template: 'Minimal', Transitions: 'Camera flight' }, live: false });
    expect(h.st().content).toMatchObject({ kind: 'slides', template: 'Minimal', transitions: 'Camera flight', slides: [{ title: 'Why it matters' }, {}, {}] });
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('waits for the voice when the AI voice is chosen: no preview until every slide has its clip, and says why', () => {
    const h = open();
    expect(h.st().content).toBeNull();
    expect(h.st().previewNote).toBe(VOICE_ALL);
  });
});
