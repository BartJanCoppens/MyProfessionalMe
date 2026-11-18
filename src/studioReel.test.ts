// @vitest-environment jsdom
// Reel Studio (studios plan, Task 5.5) through the shared spine and the voicing runner it shares with Slides and Podcast: the four build
// steps (the rows checked with no AI, each scene voiced by the AI voice in one stock voice with its word timings stored, the visuals
// and captions checked against the 90 s cap, the final cut rendered by the browser and stored), what a failed or hidden render leaves
// behind (nothing), a cut that finishes after the creator moved to another draft, and what the studio shows done.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from './lib/contributionStore';
import * as media from './lib/mediaStore';
import * as voice from './lib/voice';
import { emptyParts } from './logic/contribution';
import type { CreateData } from './logic/contribution';
import type { StockVoice } from './logic/ai';
import { CARDS_VOICE, NO_VOICE, PORTRAIT_VOICE, PRESENTER, TEXT_ONLY } from './logic/reelContent';
import type { StudioEntry, StudioItem } from './logic/studios';
import { isVideoItem, videoOf } from './logic/videoItem';
import { spokenWords } from './logic/narration';
import { voiceOf, withClips } from './logic/voiceItem';
import type { Clip } from './logic/voiceItem';
import { prepareAudio, renderCut } from './reel/compositor';
import { CutError, VIDEO_MAX_BYTES } from './reel/cutRules';
import { PICK_LOOK, reelBuilt } from './studioReel';
import { flush, harness, member, person, stubWindow } from './test/harness';
import type { NewDraft } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async (_f: unknown, id?: string | null) => id ?? 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
}));
vi.mock('./lib/voice', async (orig) => ({ ...(await orig<typeof import('./lib/voice')>()), speak: vi.fn(), speakInBrowser: vi.fn() }));
vi.mock('./lib/mediaStore', () => ({ mediaUrl: vi.fn(async (p: string) => 'https://signed/' + p.split('/').pop()), uploadMedia: vi.fn(async (_id: string, _blob: Blob, name: string) => FOLDER + name) }));
vi.mock('./reel/compositor', () => ({ renderCut: vi.fn(), prepareAudio: vi.fn() }));
vi.mock('./reel/reelCut', async (orig) => ({ ...(await orig<typeof import('./reel/reelCut')>()), loadPortrait: vi.fn(async () => null) }));

const FOLDER = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/';
const ROWS: StudioItem[] = [['Hook', 'Your project is drifting. Here are three signs.', 'three signs'], ['Scene 1', 'Can you just also turns up in every steering committee.', 'Just also x3'],
  ['Scene 2', 'Hours are booked on tasks that are not in the statement of work.', 'A timesheet'], ['Close', 'Spot one? Raise it with your engagement manager this week.', 'Talk to your EM'],
  ['Check', 'What should you do?', 'Raise it this week · Wait · Ignore it']];
const SCENES = ROWS.slice(0, 4);
const VOICES: StockVoice[] = [{ id: 'sv1', name: 'Warm · Flemish English', voice_id: 'EL1', language: 'English', accent: null, active: true }];
const LOOK_ID = '11111111-1111-4111-8111-111111111111';
const LOOKS = [{ id: LOOK_ID, name: 'HR director · 50s', portrait: 'p1' as const, color: '#8a5a8c', licence: 'Drawn in code', active: true }];
// one word timing for every spoken word, as the voice answers them
const timed = (text: string, skip = false) => spokenWords(text).map((_, i) => i * 0.4).slice(skip ? 1 : 0);
const clip = (k: number, seconds = 5, words: number[] = timed(SCENES[k][1])): Clip => ({ slide: k, text: SCENES[k][1], voice: 'EL1', path: FOLDER + 'voice-' + (k + 1) + '.mp3', seconds, marks: [], words });
const VOICED = (seconds = 5): StudioEntry[] => withClips(ROWS, SCENES.map((_, k) => clip(k, seconds))) as StudioEntry[];
const nwOf = (o: Partial<NewDraft> = {}): NewDraft => ({ line: 'Consulting', aud: '', type: 'Reel', title: 'Three signs', dom: 'prof', lvl: '2', stage: 'Senior consultant', take: 'Spot drift early.', outline: [], sources: [], ai: false, aiNote: '', key: 'k1', ...o });
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 });
const made = { blob: new Blob(['video']), mime: 'video/mp4;codecs=avc1', ext: 'mp4' as const, seconds: 22.6 };
let spoken = 0;
const mockVoice = (seconds = 5) => vi.mocked(voice.speak).mockImplementation(async (r) => { spoken++; return { path: FOLDER + 'voice-' + spoken + '.mp3', seconds, marks: [], words: timed(r.text), made: 'voice' as const }; });

const open = (o: { list?: StudioEntry[]; shape?: Record<string, string>; live?: boolean; readOnly?: boolean; cast?: Record<string, string> } = {}) => {
  stubWindow({});
  const h = harness({ access: member('u1'), subject: person({ readOnly: !!o.readOnly }), config: { liveAssistant: true },
    state: { screen: 'create', create: data(), createTab: 'new', nwKb: ['B1'], aiLive: o.live === false ? [] : ['studio_voice'], stockVoices: VOICES, stockLooks: LOOKS, studio: { view: 'studio', step: 3, id: 'reel' },
      nw: nwOf({ shape: o.shape ?? { [PRESENTER]: CARDS_VOICE }, cast: o.cast ?? { Voice: 'Warm · Flemish English' }, items: { list: (o.list ?? ROWS) as never, how: 'manual', problems: [], note: '' } }) } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  const st = () => h.vm().create!.studio, step = (k: number) => st().buildRunner!('x', k), list = () => h.state.nw.items!.list as StudioEntry[];
  return Object.assign(h, { st, step, list });
};

beforeEach(() => { vi.clearAllMocks(); spoken = 0; mockVoice(); vi.mocked(renderCut).mockResolvedValue(made); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('step 1 and step 3: the rows and the 90 s cap', () => {
  it('checks the rows with no AI and no voice call, and fails on the first problem in words', async () => {
    await expect(open().step(0)).resolves.toBeUndefined();
    expect(voice.speak).not.toHaveBeenCalled();
    await expect(open({ list: ROWS.slice(0, 4) }).step(0)).rejects.toThrow('Add the check question: one question, the right answer first');
  });
  it('fails the visuals step when the reel runs 92 s, and stores nothing', async () => {
    const h = open({ list: VOICED(23) });
    await expect(h.step(2)).rejects.toThrow('The reel runs 93 s · at most 90 s');
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(renderCut).not.toHaveBeenCalled();
  });
  it('fails the visuals step for a scene whose word timings do not match its words', async () => {
    const bad = withClips(ROWS, SCENES.map((_, k) => clip(k, 5, k === 1 ? [0] : undefined))) as StudioEntry[];
    await expect(open({ list: bad }).step(2)).rejects.toThrow('Voice scene 2 again · its word timing does not match its words');
  });
  it('passes the visuals step for a reel within 90 s that is voiced', async () => {
    await expect(open({ list: VOICED(), shape: { [PRESENTER]: PORTRAIT_VOICE } }).step(2)).resolves.toBeUndefined();
  });
});

describe('step 2: voicing each scene', () => {
  it('has the AI voice say every scene without a clip once, in the one stock voice, and stores the word timings with the draft', async () => {
    const h = open();
    await h.step(1);
    expect(vi.mocked(voice.speak).mock.calls.map(([r]) => [r.voiceId, r.text])).toEqual(SCENES.map((s) => ['EL1', s[1]]));
    expect(voiceOf(h.list())!.clips.map((c) => [c.slide, c.voice, c.words])).toEqual(SCENES.map((s, k) => [k, 'EL1', timed(s[1])]));
    expect((vi.mocked(store.saveDraft).mock.calls.at(-1)![0] as { items: unknown[] }).items).toHaveLength(ROWS.length + 1);
  });
  it('keeps the clips that have word timings and voices again those that have none (voiced before word timings existed)', async () => {
    const { words: _none, ...wordless } = clip(1), old = withClips(ROWS, [clip(0), wordless, clip(2), clip(3)]) as StudioEntry[];
    const h = open({ list: old });
    await h.step(1);
    expect(vi.mocked(voice.speak).mock.calls.map(([r]) => r.text)).toEqual([SCENES[1][1]]);
    expect(voiceOf(h.list())!.clips.every((c) => c.words)).toBe(true);
  });
  it('fails with the reason when the AI voice is not switched on, and says nothing was voiced', async () => {
    await expect(open({ live: false }).step(1)).rejects.toThrow(NO_VOICE);
    expect(voice.speak).not.toHaveBeenCalled();
  });
  it('is skipped for text and music only, which makes no voice call and shows its own step name', async () => {
    const h = open({ shape: { [PRESENTER]: TEXT_ONLY } });
    await h.step(1);
    expect(voice.speak).not.toHaveBeenCalled();
    expect(h.st().build!.steps[1].name).toBe('No voice · text and music only');
    expect(open().st().build!.steps[1].name).toBe('Voicing each scene');
  });
});

describe('step 4: the final cut', () => {
  const cutOf = (h: ReturnType<typeof open>) => h.step(3);
  it('renders the cut with the media bucket\'s limit and each clip where its scene starts, uploads reel-<16 hex>.mp4 and writes one video item made from the rows', async () => {
    const h = open({ list: VOICED() });
    await cutOf(h);
    const cut = vi.mocked(renderCut).mock.calls[0][0];
    expect(cut.maxBytes).toBe(VIDEO_MAX_BYTES);
    expect(cut.seconds).toBe(20.9);
    expect(cut.audio.map((a) => [a.url, a.at])).toEqual([['https://signed/voice-1.mp3', 0], ['https://signed/voice-2.mp3', 5.3], ['https://signed/voice-3.mp3', 10.6], ['https://signed/voice-4.mp3', 15.9]]);
    expect(vi.mocked(media.uploadMedia).mock.calls[0][2]).toMatch(/^reel-[0-9a-f]{16}\.mp4$/);
    const video = h.list().filter(isVideoItem);
    expect(video).toHaveLength(1);
    expect(video[0]).toMatchObject({ kind: 'video', size: '720x1280', mime: 'video/mp4', seconds: 22.6, path: FOLDER + vi.mocked(media.uploadMedia).mock.calls[0][2] });
    expect(video[0].made).toMatchObject({ rows: ROWS, clips: [1, 2, 3, 4].map((k) => FOLDER + 'voice-' + k + '.mp3'), look: null, format: '9:16 vertical', captions: 'Burned in', music: 'None' });
    expect(h.list().slice(0, 5)).toEqual(ROWS);
    expect(voiceOf(h.list())!.clips).toHaveLength(4);
  });
  it('is made from what Produce chose: the square format, separate captions, the music and the stock look of the portrait presenter', async () => {
    const h = open({ list: VOICED(), shape: { [PRESENTER]: PORTRAIT_VOICE } });
    h.L().setState({ nw: { ...h.state.nw, produce: { Format: '1:1 square', Captions: 'Separate file', Music: 'Upbeat' }, cast: { Voice: 'Warm · Flemish English', Look: LOOK_ID } } });
    await cutOf(h);
    expect(vi.mocked(renderCut).mock.calls[0][0].size).toEqual({ w: 1080, h: 1080 });
    expect(vi.mocked(renderCut).mock.calls[0][0].music).toBe('Upbeat');
    expect(videoOf(h.list())).toMatchObject({ size: '1080x1080', made: { format: '1:1 square', captions: 'Separate file', music: 'Upbeat', look: LOOK_ID } });
  });
  it('asks for a stock look when the stock presenter has none picked, and renders nothing', async () => {
    const h = open({ list: VOICED(), shape: { [PRESENTER]: PORTRAIT_VOICE } });
    await expect(cutOf(h)).rejects.toThrow(PICK_LOOK);
    expect(renderCut).not.toHaveBeenCalled();
  });
  it('a text and music only reel has no voice item and no clips in its cut', async () => {
    const h = open({ list: ROWS as StudioEntry[], shape: { [PRESENTER]: TEXT_ONLY } });
    await cutOf(h);
    expect(vi.mocked(renderCut).mock.calls[0][0].audio).toEqual([]);
    expect(voiceOf(h.list())).toBeNull();
    expect(videoOf(h.list())!.made.clips).toEqual([]);
  });
  it('a render refused with CUT_HIDDEN leaves the items as they were and never saves or uploads', async () => {
    vi.mocked(renderCut).mockRejectedValue(new CutError('CUT_HIDDEN'));
    const h = open({ list: VOICED() }), before = JSON.stringify(h.list());
    await expect(cutOf(h)).rejects.toThrow(/tab was hidden/);
    expect(JSON.stringify(h.list())).toBe(before);
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(media.uploadMedia).not.toHaveBeenCalled();
  });
  it('a cut that is too large for the bucket is refused by the compositor before anything is stored', async () => {
    vi.mocked(renderCut).mockRejectedValue(new CutError('CUT_TOO_LARGE', 'This video would come out at about 61.0 MB · at most 50 MB · make it shorter'));
    const h = open({ list: VOICED() });
    await expect(cutOf(h)).rejects.toThrow(/at most 50 MB/);
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('uses the audio context opened in the click (prepare) and hands it to the render', async () => {
    const context = { close: vi.fn(async () => {}) };
    vi.mocked(prepareAudio).mockReturnValue(context as never);
    const h = open({ list: VOICED() }), runner = h.st().buildRunner!;
    runner.prepare!();
    await runner('x', 3);
    expect(vi.mocked(renderCut).mock.calls[0][1].context).toBe(context);
  });
  it('closes that context when an earlier step fails, since no render will', async () => {
    const context = { close: vi.fn(async () => {}) };
    vi.mocked(prepareAudio).mockReturnValue(context as never);
    const h = open({ live: false }), runner = h.st().buildRunner!;
    runner.prepare!();
    await expect(runner('x', 1)).rejects.toThrow();
    expect(context.close).toHaveBeenCalled();
  });
  it('a cut that finishes after the creator switched drafts is saved to its own draft, and the screen keeps the draft it is on', async () => {
    const h = open({ list: VOICED() });
    vi.mocked(renderCut).mockImplementation(async () => { h.L().setState({ nw: nwOf({ key: 'k2', title: 'Another draft' }) }); return made; });
    await cutOf(h); await flush();
    const saved = vi.mocked(store.saveDraft).mock.calls.at(-1)![0] as { items: unknown[]; title: string };
    expect(saved.title).toBe('Three signs');
    expect(saved.items.filter(isVideoItem)).toHaveLength(1);
    expect(h.state.nw.title).toBe('Another draft');
    expect(h.state.toast).toMatch(/The build finished after you left this draft/);
  });
  it('fails in View as, before anything runs', async () => {
    const h = open({ readOnly: true, list: VOICED() });
    for (const k of [0, 1, 2, 3]) await expect(h.step(k)).rejects.toThrow('Only the creator can build it');
    expect(renderCut).not.toHaveBeenCalled();
  });
});

describe('how far the build shows done', () => {
  const shape = { [PRESENTER]: CARDS_VOICE };
  const cut = (items: StudioEntry[]) => [...items, { kind: 'video', path: FOLDER + 'reel-0123456789abcdef.mp4', seconds: 20.9, size: '720x1280', mime: 'video/mp4',
    made: { rows: ROWS, clips: SCENES.map((_, k) => FOLDER + 'voice-' + (k + 1) + '.mp3'), look: null, format: '9:16 vertical', captions: 'Burned in', music: 'None' } }] as StudioEntry[];
  it('counts the rows, the voice, the 90 s cap and the cut made from these rows and clips', () => {
    expect(reelBuilt(ROWS.slice(0, 4), shape)).toBe(0);
    expect(reelBuilt(ROWS, shape)).toBe(1);
    expect(reelBuilt(VOICED(23), shape)).toBe(2);
    expect(reelBuilt(VOICED(), shape)).toBe(3);
    expect(reelBuilt(cut(VOICED()), shape)).toBe(4);
    expect(reelBuilt(ROWS, { [PRESENTER]: TEXT_ONLY })).toBe(3);
  });
  it('drops back to the cut step once a row changed after it', () => {
    const edited = cut(VOICED()).map((x) => (Array.isArray(x) && x[0] === 'Scene 1' ? ['Scene 1', x[1], 'Changed'] : x)) as StudioEntry[];
    expect(reelBuilt(edited, shape)).toBe(3);
  });
  it('shows the steps done from the draft on screen', () => {
    expect(open({ list: cut(VOICED()) }).st().build!.steps.map((s) => s.status)).toEqual(['done', 'done', 'done', 'done']);
    expect(open({ list: ROWS as StudioEntry[] }).st().build!.steps.map((s) => s.status)).toEqual(['done', 'todo', 'todo', 'todo']);
  });
});
