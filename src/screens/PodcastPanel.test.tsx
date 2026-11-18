// @vitest-environment jsdom
// The one podcast player (studios plan, Task 3.5) on the shared step player and clock: a stored episode turn by turn on each
// turn's audio with chapter jumps and the transcript, the seeded v3 episodes (L42, L43, L48) chapter by chapter on the clock, the
// end told once after the last step, completion at the end only for the learner, and the same panel as the studio preview.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from '../data';
import { parseFormatContent } from '../lib/contentStore';
import * as learner from '../lib/learnerStore';
import * as media from '../lib/mediaStore';
import { podcastView } from '../fmtPodcast';
import { initState, Logic } from '../model';
import { cfg, emptyData, member, person } from '../test/harness';
import type { LearnerData } from '../lib/learnerStore';
import type { AppState, Learn, PodcastContent } from '../types';
import { DetailScreen } from './Library';
import PodcastPanel from './PodcastPanel';
import { SavedContent } from './studioPreviews';

vi.mock('../lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}), acceptLearning: vi.fn(),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('../lib/mediaStore', () => ({ mediaUrl: vi.fn(async (p: string) => 'blob:' + p.split('/').pop()) }));
vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
vi.mock('../lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));

const FOLDER = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/';
const audio = (n: number, seconds: number) => ({ path: FOLDER + 'voice-' + n + '.mp3', seconds, marks: [] as { kind: 'next' | 'cue'; at: number }[] });
const STORED: PodcastContent = { kind: 'podcast', made: 'ai', seconds: 10, chapters: [{ title: 'Why it lands in the close', start: 0, turn: 0 }, { title: 'What to fix first', start: 5, turn: 2 }],
  turns: [{ speaker: 'Host', text: 'Why is it a close problem?', audio: audio(1, 2) }, { speaker: 'Guest', text: 'Half of the data sits in consolidation.', audio: audio(2, 3) },
    { speaker: 'Host', text: 'What should a team fix first?', audio: audio(3, 2) }, { speaker: 'Guest', text: 'Entity data, then deferred taxes.', audio: audio(4, 3) }] };
const ROW: Learn = ['L996', 'Pillar Two lands in the close', 'reg', 3, 'Podcast', 'Peer contribution', 0.05, 0, '', ''];
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L996 = ROW; LEARN_META.L996 = { line: null, status: 'published', content: parseFormatContent(STORED), aiMade: true }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L996; delete LEARN_META.L996; });

const sound = { play: vi.fn(), pause: vi.fn() };
let sources: string[] = [], saved: LearnerData['progress'] = {};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  sources = []; saved = {};
  sound.play.mockReset().mockImplementation(async function (this: HTMLAudioElement) { sources.push(this.src); });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(sound.play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(sound.pause);
  vi.mocked(learner.saveProgress).mockImplementation(async (_u, id, patch) => { saved[id] = { state: patch.state ?? 'not-started', pct: patch.pct ?? 0, chosen: false, detail: patch.detail }; });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const click = (name: string | RegExp) => act(() => { fireEvent.click(screen.getByRole('button', { name })); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const opts = (o: Partial<Parameters<typeof podcastView>[1]> = {}) => ({ ro: false, done: false, onEnd: vi.fn(), ...o });
const panel = async (c: PodcastContent, o = opts()) => { render(<PodcastPanel pc={podcastView(c, o)} />); await act(async () => {}); return o; };

function Live({ id, readOnly = false }: { id: string; readOnly?: boolean }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), screen: 'detail', detailId: id }));
  const [data, setData] = useState<LearnerData>(emptyData);
  const subject = person({ readOnly, data });
  const reload = async () => setData({ ...emptyData(), progress: { ...saved } });
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg,
    { toastTimer: { current: undefined }, drag: { current: null }, file: { current: null }, chat: { current: null } }, member(subject.id), subject, reload, async () => {}).renderVals();
  return <DetailScreen vm={vm} />;
}

describe('a stored episode', () => {
  it('gets a signed link for each turn\'s audio, shows the chapter, the speaker and the line, and says how it is told', async () => {
    await panel(STORED);
    expect(media.mediaUrl).toHaveBeenCalledTimes(4);
    expect(screen.getByText('Listen')).toBeTruthy();
    expect(screen.getByText('2 chapters · 10 s · counts 0.05 h · AI voices · Made with AI')).toBeTruthy();
    expect(screen.getByText('Why it lands in the close', { selector: '[data-testid="chapter-now"]' })).toBeTruthy();
    expect(screen.getByTestId('turn-now').textContent).toBe('Host: Why is it a close problem?');
    expect(screen.getByText('Told by AI voices · Made with AI · the transcript is the script')).toBeTruthy();
  });
  it('lists the chapters with their start, and the transcript with every turn', async () => {
    await panel(STORED);
    expect(screen.getAllByTestId('chapter').map((c) => c.textContent)).toEqual(['0:00Why it lands in the close', '0:05What to fix first']);
    const transcript = screen.getByTestId('transcript');
    expect(within(transcript).getAllByRole('listitem').map((x) => x.textContent)).toEqual(['Host: Why is it a close problem?', 'Guest: Half of the data sits in consolidation.', 'Host: What should a team fix first?', 'Guest: Entity data, then deferred taxes.']);
  });
  it('plays each turn\'s own audio, moves on at its end, and tells the end only after the last turn', async () => {
    const o = await panel(STORED);
    click('Play');
    expect(sources).toEqual(['blob:voice-1.mp3']);
    tick(2200);
    expect(sources).toEqual(['blob:voice-1.mp3', 'blob:voice-2.mp3']);
    expect(screen.getByTestId('turn-now').textContent).toBe('Guest: Half of the data sits in consolidation.');
    tick(3200);
    tick(2200);
    expect(o.onEnd).not.toHaveBeenCalled();
    tick(3200);
    expect(o.onEnd).toHaveBeenCalledTimes(1);
    tick(5000);
    expect(o.onEnd).toHaveBeenCalledTimes(1);
  });
  it('jumps to a chapter\'s first turn, and keeps playing when it was playing; jumping never completes', async () => {
    const o = await panel(STORED);
    click(/What to fix first/);
    expect(screen.getByText('Step 3 of 4 · 0 / 2 s')).toBeTruthy();
    expect(screen.getByText('What to fix first', { selector: '[data-testid="chapter-now"]' })).toBeTruthy();
    expect(sources).toEqual([]);
    click('Play');
    expect(sources).toEqual(['blob:voice-3.mp3']);
    click(/Why it lands in the close/);
    expect(sources).toEqual(['blob:voice-3.mp3', 'blob:voice-1.mp3']);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(o.onEnd).not.toHaveBeenCalled();
  });
  it('says so, and plays nothing, when the audio cannot be opened', async () => {
    vi.mocked(media.mediaUrl).mockRejectedValueOnce(new Error('This file is not there, or not open to you'));
    await panel(STORED);
    expect(screen.getByRole('alert').textContent).toContain('This file is not there, or not open to you');
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });
});

describe('the seeded episodes (v3) on the same player', () => {
  it.each([['L42', ['Why tenders reopen scope', 'Trading timing for scope', 'What to put in writing']], ['L43', ['What a CFO reads first', 'Numbers without a story', 'Answering “why now”']],
    ['L48', ['How a tariff is built', 'Capacity tariffs in Flanders', 'What it means for clients']]])('%s plays chapter by chapter on the clock, with no audio, no transcript and no file', async (id, titles) => {
    render(<Live id={id} />);
    await act(async () => {});
    expect(screen.getAllByTestId('chapter').map((c) => c.textContent!.replace(/^\d+:\d\d/, ''))).toEqual(titles);
    expect(screen.queryByTestId('transcript')).toBeNull();
    expect(screen.getByText(/No recording of this episode/)).toBeTruthy();
    expect(media.mediaUrl).not.toHaveBeenCalled();
    click('Play');
    expect(sound.play).not.toHaveBeenCalled();
    tick(1000);
    expect(screen.getByText(/Step 1 of 3 · 1 \/ /)).toBeTruthy();
  });
  it('jumps to a chapter and completes the learning once, at the end of the last chapter', async () => {
    render(<Live id="L42" />);
    await act(async () => {});
    click(/What to put in writing/);
    expect(screen.getByText('Step 3 of 3 · 0 / 525 s')).toBeTruthy();
    click('Play');
    tick(524000);
    expect(learner.saveProgress).not.toHaveBeenCalled();
    tick(2000);
    await act(async () => {});
    expect(learner.saveProgress).toHaveBeenCalledTimes(1);
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L42', { state: 'accepted', pct: 100, detail: { last: true } });
  });
  it('saves nothing while viewing someone else', async () => {
    render(<Live id="L42" readOnly />);
    await act(async () => {});
    expect(screen.getByText('Viewing someone else: playing it completes nothing.')).toBeTruthy();
    click(/What to put in writing/);
    click('Play');
    tick(527000);
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
});

describe('a studio episode on the detail page and in review', () => {
  it('completes once at the end, saving that it was listened to the end, and is marked Made with AI', async () => {
    render(<Live id="L996" />);
    await act(async () => {});
    click('Play');
    for (const s of [2200, 3200, 2200, 3200]) tick(s);
    await act(async () => {});
    expect(learner.saveProgress).toHaveBeenCalledTimes(1);
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L996', { state: 'accepted', pct: 100, detail: { last: true } });
  });
  it('is the preview for the author and reviewers, where listening to the end completes nothing', async () => {
    render(<SavedContent t={{ key: 'c1', content: STORED, hours: 0, still: false }} />);
    await act(async () => {});
    expect(screen.getByText('As learners will see it')).toBeTruthy();
    click('Play');
    for (const s of [2200, 3200, 2200, 3200]) tick(s);
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
});
