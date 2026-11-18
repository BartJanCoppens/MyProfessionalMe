// @vitest-environment jsdom
// Podcast Studio (studios plan, Task 3.5) through the shared spine and the voicing runner it shares with Slides: the three build
// steps (the script checked, each turn voiced by the AI voice in its speaker's stock voice and stored with the draft, the
// chapters timed), a failed voice retried on the turns still without one, a speaker's new voice voicing only that speaker again,
// the browser voice only as a preview that is never stored, no episode without the live voice, and what still blocks sending.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/contributionStore';
import * as voice from './lib/voice';
import { BROWSER_VOICE } from './lib/voice';
import { emptyParts } from './logic/contribution';
import type { CreateData } from './logic/contribution';
import type { StockVoice } from './logic/ai';
import { FORMAT_QUESTION, INTERVIEW, NO_VOICE, SOLO, TWO_HOSTS, VOICE_ALL, boundClips } from './logic/podcastContent';
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
const ROWS: StudioItem[] = [['Chapter 1 · 0:00', 'Why it lands in the close'], ['Host', 'Most teams think this is a tax problem. Why is it a close problem?'], ['Guest', 'Half of the data sits in consolidation.'],
  ['Chapter 2 · 0:30', 'What to fix first'], ['Host', 'Give me the one thing to fix first.'], ['Guest', 'Entity data, then deferred taxes.']];
const VOICES: StockVoice[] = [{ id: 'sv1', name: 'Warm · Flemish English', voice_id: 'EL1', language: 'English', accent: null, active: true }, { id: 'sv2', name: 'Calm · Dutch', voice_id: 'EL2', language: 'Dutch', accent: null, active: true },
  { id: 'sv3', name: 'Other voice', voice_id: 'EL3', language: 'English', accent: null, active: true }, { id: 'sv4', name: 'Retired voice', voice_id: 'EL4', language: 'English', accent: null, active: false }];
const nwOf = (o: Partial<NewDraft> = {}): NewDraft => ({ line: 'Consulting', aud: '', type: 'Podcast', title: 'Pillar Two lands in the close', dom: 'reg', lvl: '3', stage: 'Senior consultant',
  take: 'Fix the data first.', outline: [], sources: [], ai: false, aiNote: '', ...o });
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 });
const BUILD = 3; // Idea & sources, Shape it, Draft, Produce
let spoken = 0;
const mockVoice = () => vi.mocked(voice.speak).mockImplementation(async () => { spoken++; return { path: FOLDER + 'voice-' + spoken + '.mp3', seconds: 5 + spoken, marks: [], words: [0, 1.5], made: 'voice' as const }; });
const CAST = { 'Host voice': 'Warm · Flemish English', 'Guest voice': 'Calm · Dutch' };

const open = (o: { list?: StudioEntry[]; shape?: Record<string, string>; live?: boolean; cast?: Record<string, string>; step?: number } = {}) => {
  stubWindow({});
  const h = harness({ access: member('u1'), subject: person(), config: { liveAssistant: true },
    state: { screen: 'create', create: data(), createTab: 'new', nwKb: ['B1'], aiLive: o.live === false ? [] : ['studio_voice'], stockVoices: VOICES, studio: { view: 'studio', step: o.step ?? BUILD, id: 'podcast' },
      nw: nwOf({ shape: o.shape ?? { [FORMAT_QUESTION]: INTERVIEW }, cast: o.cast ?? CAST, items: { list: (o.list ?? ROWS) as never, how: 'ai', problems: [], note: '' } }) } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  const st = () => h.vm().create!.studio;
  const build = () => runBuild(st().build!.steps, st().buildRunner!, st().build!.set);
  const list = () => h.state.nw.items!.list as StudioEntry[];
  const statuses = () => st().build!.steps.map((s) => s.status);
  return Object.assign(h, { st, build, list, statuses });
};

beforeEach(() => { vi.clearAllMocks(); spoken = 0; mockVoice(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('who speaks and in which voice', () => {
  it('casts the active stock voices to each speaker of the format, once the AI voice is live', () => {
    expect(open().st().cast.map((g) => [g.key, g.chips.map((c) => c.label)])).toEqual([
      ['Host voice', ['Warm · Flemish English', 'Calm · Dutch', 'Other voice']], ['Guest voice', ['Warm · Flemish English', 'Calm · Dutch', 'Other voice']]]);
    expect(open({ shape: { [FORMAT_QUESTION]: TWO_HOSTS } }).st().cast.map((g) => g.key)).toEqual(['Host voice', 'Co-host voice']);
    expect(open({ shape: { [FORMAT_QUESTION]: SOLO } }).st().cast.map((g) => g.key)).toEqual(['Host voice']);
    expect(open({ live: false }).st().cast).toEqual([]);
  });
  it('has no intro music or transcript choice, and says Length and Who listens steer the AI draft', () => {
    const st = open().st();
    expect(st.produce).toEqual([]);
    expect(st.shape.map((g) => [g.key, g.hint])).toEqual([[FORMAT_QUESTION, ''], ['Length?', 'Steers the AI draft'], ['Who listens?', 'Steers the AI draft']]);
  });
});

describe('building an episode', () => {
  it('shows the script done once it is valid, then voices each turn in its speaker\'s voice and stores each with the draft', async () => {
    const h = open();
    expect(h.statuses()).toEqual(['done', 'todo', 'todo']);
    await h.build();
    expect(h.statuses()).toEqual(['done', 'done', 'done']);
    expect(voice.speak).toHaveBeenCalledTimes(4);
    expect(vi.mocked(voice.speak).mock.calls.map(([r]) => [r.voiceId, r.text])).toEqual([
      ['EL1', ROWS[1][1]], ['EL2', ROWS[2][1]], ['EL1', ROWS[4][1]], ['EL2', ROWS[5][1]]]);
    expect(voiceOf(h.list())!.clips.map((c) => [c.slide, c.voice, c.seconds])).toEqual([[0, 'EL1', 6], [1, 'EL2', 7], [2, 'EL1', 8], [3, 'EL2', 9]]);
    expect(boundClips(h.list())).toHaveLength(4);
    expect(voiceOf(h.list())!.clips.every((c) => c.words?.length === 2)).toBe(true); // each clip stores when its words start
    const saved = vi.mocked(store.saveDraft).mock.calls.at(-1)![0] as { items: unknown[] };
    expect(saved.items).toHaveLength(ROWS.length + 1);
    expect(h.st().content).toMatchObject({ kind: 'podcast', made: 'ai', seconds: 30, chapters: [{ title: 'Why it lands in the close', start: 0, turn: 0 }, { title: 'What to fix first', start: 13, turn: 2 }] });
  });
  it('keeps the turns it voiced when one fails, says why on that step, and a retry voices only the turns still without audio', async () => {
    vi.mocked(voice.speak).mockReset().mockImplementationOnce(async () => ({ path: FOLDER + 'voice-1.mp3', seconds: 6, marks: [], words: [], made: 'voice' as const }))
      .mockRejectedValueOnce(new Error('Daily voice limit reached for you today (UTC)'));
    const h = open();
    await h.build();
    expect(h.statuses()).toEqual(['done', 'failed', 'todo']);
    expect(h.st().build!.steps[1].error).toBe('Daily voice limit reached for you today (UTC)');
    expect(voiceOf(h.list())!.clips.map((c) => c.slide)).toEqual([0]);
    mockVoice();
    await retryStep(h.st().build!.steps, 1, h.st().buildRunner!, h.st().build!.set);
    expect(voice.speak).toHaveBeenCalledTimes(5); // 2 before, 3 now: not four again
    expect(boundClips(h.list())).toHaveLength(4);
  });
  it('voices again only the speaker whose voice was changed, never mixing voices within a speaker', async () => {
    const h = open();
    await h.build();
    h.st().cast.find((g) => g.key === 'Guest voice')!.chips.find((c) => c.label === 'Other voice')!.pick();
    expect(voiceOf(h.list())!.clips.map((c) => c.slide)).toEqual([0, 2]); // the host's clips stay
    expect(h.statuses()).toEqual(['done', 'todo', 'todo']);
    vi.mocked(voice.speak).mockClear();
    await h.build();
    expect(vi.mocked(voice.speak).mock.calls.map(([r]) => [r.voiceId, r.text])).toEqual([['EL3', ROWS[2][1]], ['EL3', ROWS[5][1]]]);
    expect(boundClips(h.list())).toHaveLength(4);
  });
  it('refuses the same voice for two speakers before anything is spoken', async () => {
    const h = open({ cast: { 'Host voice': 'Calm · Dutch', 'Guest voice': 'Calm · Dutch' } });
    await h.build();
    expect(h.st().build!.steps[1].error).toBe('Pick a different voice for each speaker');
    expect(voice.speak).not.toHaveBeenCalled();
  });
  it('clips stored before word timings (no words) still count: nothing is voiced again', async () => {
    const first = open();
    await first.build();
    const old = first.list().map((x) => (Array.isArray(x) ? x : { ...(x as object), clips: (x as { clips: object[] }).clips.map(({ words: _w, ...c }: { words?: number[] }) => c) })) as StudioEntry[];
    const h = open({ list: old });
    vi.mocked(voice.speak).mockClear();
    await h.build();
    expect(voice.speak).not.toHaveBeenCalled();
  });
  it('after a reload or an Edit, with no voice picked, goes on in the voices the stored clips were made in', async () => {
    const first = open();
    await first.build();
    const h = open({ list: first.list().map((x) => x) .slice(0, ROWS.length + 1).map((x, k) => (k === ROWS.length ? { ...(x as object), clips: (x as { clips: unknown[] }).clips.slice(0, 2) } : x)) as StudioEntry[], cast: {} });
    expect(h.st().cast.map((g) => g.chips.filter((c) => c.on).map((c) => c.label))).toEqual([['Warm · Flemish English'], ['Calm · Dutch']]);
    vi.mocked(voice.speak).mockClear();
    await h.build();
    expect(vi.mocked(voice.speak).mock.calls.map(([r]) => r.voiceId)).toEqual(['EL1', 'EL2']);
  });
  it('writes the script first: a script that breaks its rules stops the build at the first step', async () => {
    const h = open({ list: [ROWS[1], ROWS[0], ROWS[2]] });
    await h.build();
    expect(h.statuses()).toEqual(['failed', 'todo', 'todo']);
    expect(h.st().build!.steps[0].error).toMatch(/Start with a chapter/);
  });
  it('refuses a line by a speaker the format does not have', async () => {
    const h = open({ shape: { [FORMAT_QUESTION]: SOLO } });
    await h.build();
    expect(h.st().build!.steps[0].error).toBe('A line has a speaker this format does not have: Host only');
  });
  it('asks for a stock voice for every speaker first', async () => {
    const h = open({ cast: { 'Host voice': 'Warm · Flemish English' } });
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

describe('no episode without the live AI voice', () => {
  it('refuses to voice, stores no audio and says the episode cannot be produced; it is not offered for sending', async () => {
    const h = open({ live: false });
    await h.build();
    expect(h.statuses()).toEqual(['done', 'failed', 'todo']);
    expect(h.st().build!.steps[1].error).toMatch(/AI voice is not switched on/);
    expect(voice.speak).not.toHaveBeenCalled();
    expect(voiceOf(h.list())).toBeNull();
    expect(h.st().send.blocked).toBe(true);
    expect(h.st().send.problems).toEqual([NO_VOICE]);
    expect(h.st().podcast!.line).toMatch(/cannot be produced/);
  });
  it('previews the script with the browser voice, labelled, and stores nothing', async () => {
    const h = open({ live: false });
    const hear = h.st().podcast!.hear!;
    expect(hear.label).toBe(BROWSER_VOICE);
    expect(hear.noun).toBe('line');
    expect(hear.parts.map((p) => p.title)).toEqual(['Host · Most teams think this is a tax problem', 'Guest · Half of the data sits in consolidation', 'Host · Give me the one thing to fix first', 'Guest · Entity data, then deferred taxes']);
    expect(open().st().podcast!.hear).toBeNull();
    vi.mocked(voice.speakInBrowser).mockReturnValue({ label: BROWSER_VOICE, done: Promise.resolve('ended'), stop: () => {} });
    await hear.parts[1].run();
    await flush();
    expect(voice.speakInBrowser).toHaveBeenCalledWith(ROWS[2][1]);
    expect(voice.speak).not.toHaveBeenCalled();
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(voiceOf(h.list())).toBeNull();
  });
});

describe('what the Produce step shows and what blocks sending', () => {
  it('says how many lines are voiced and, once all are, the chapters, the length and the hours it counts', async () => {
    const h = open();
    expect(h.st().podcast!.line).toBe('AI voice · voiced 0 of 4 lines');
    await h.build();
    expect(h.st().podcast!.line).toBe('AI voice · voiced 4 of 4 lines · 2 chapters · 30 s · counts 0.05 h');
  });
  it('waits for the voice: no preview until every turn has its clip, and says why', () => {
    const h = open();
    expect(h.st().content).toBeNull();
    expect(h.st().previewNote).toBe(VOICE_ALL);
    expect(h.st().send.problems).toEqual([VOICE_ALL]);
  });
  it('is a preview of the episode as learners will get it once voiced, and saves nothing more', async () => {
    const h = open();
    await h.build();
    vi.mocked(store.saveDraft).mockClear();
    expect(h.st().content).toMatchObject({ kind: 'podcast' });
    expect(h.st().send.problems).toEqual([]);
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
});
