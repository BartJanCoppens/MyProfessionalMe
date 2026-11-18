// @vitest-environment jsdom
// The Slides panel (studios plan, Task 3.4) for the learner on the detail page, as the Slides Studio's preview and for the
// author and reviewers: one slide at a time on the shared step player, each slide's audio played with it, the bullets built in
// at the talk-over's cues, "Calm" or "Slide in" between slides (a fade with motion off), and completion only when the last
// slide has finished playing.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../config';
import { LEARN, LEARN_BY, LEARN_META } from '../data';
import { parseFormatContent } from '../lib/contentStore';
import * as learner from '../lib/learnerStore';
import * as media from '../lib/mediaStore';
import { slidesView } from '../fmtSlides';
import { initState, Logic } from '../model';
import { cfg, emptyData, member, person } from '../test/harness';
import type { LearnerData } from '../lib/learnerStore';
import type { AppState, Learn, SlidesContent } from '../types';
import { DetailScreen } from './Library';
import SlidesPanel from './SlidesPanel';
import { SavedContent } from './studioPreviews';

vi.mock('../lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}), acceptLearning: vi.fn(),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('../lib/mediaStore', () => ({ mediaUrl: vi.fn(async (p: string) => 'blob:' + p.split('/').pop()) }));
vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
vi.mock('../lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));

const FOLDER = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/';
const TALK = 'Decisions come first ⟨cue⟩ then risks ⟨cue⟩ then progress.';
const clip = (n: number, seconds: number) => ({ path: FOLDER + 'voice-' + n + '.mp3', seconds, marks: [] as { kind: 'next' | 'cue'; at: number }[] });
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" onload="alert(1)"><script>alert(2)</script><rect width="9" height="9"/></svg>';
const VOICED: SlidesContent = { kind: 'slides', template: 'Firm template', transitions: 'Calm', made: 'ai', seconds: 5, slides: [
  { title: 'Decisions', bullets: ['Decide first', 'Then risks', 'Then progress'], narration: TALK, audio: { ...clip(1, 3), marks: [{ kind: 'cue', at: 1 }, { kind: 'cue', at: 2 }] }, svg: SVG },
  { title: 'Minutes', bullets: ['Within a day'], narration: 'Minutes go out within a day.', audio: clip(2, 2) }] };
const CAPTIONS: SlidesContent = { ...VOICED, made: 'scripted', slides: VOICED.slides.map(({ audio: _a, ...s }) => ({ ...s, narration: s.title === 'Decisions' ? TALK : 'Short.' })) };
const ROW: Learn = ['L995', 'Steering committees', 'lead', 2, 'Slides', 'Peer contribution', 0.05, 0, '', ''];
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L995 = ROW; LEARN_META.L995 = { line: null, status: 'published', content: parseFormatContent(VOICED) }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L995; delete LEARN_META.L995; });

const audio = { play: vi.fn(), pause: vi.fn() };
let sources: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  sources = []; saved = {};
  audio.play.mockReset().mockImplementation(async function (this: HTMLAudioElement) { sources.push(this.src); });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(audio.play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(audio.pause);
  vi.mocked(learner.saveProgress).mockImplementation(async (_u, id, patch) => { saved[id] = { state: patch.state ?? 'not-started', pct: patch.pct ?? 0, chosen: false, detail: patch.detail }; });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const opts = (o: Partial<Parameters<typeof slidesView>[1]> = {}) => ({ ro: false, still: false, done: false, onEnd: vi.fn(), ...o });
const panel = async (c: SlidesContent, o = opts()) => { render(<SlidesPanel sl={slidesView(c, o)} />); await act(async () => {}); return o; };
const click = (name: string | RegExp) => act(() => { fireEvent.click(screen.getByRole('button', { name })); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

let saved: LearnerData['progress'] = {};
function Live({ config = {}, readOnly = false }: { config?: Partial<Config>; readOnly?: boolean }) {
  const conf = { ...cfg, motion: true, ...config };
  const [st, setSt] = useState<AppState>(() => ({ ...initState(conf), screen: 'detail', detailId: 'L995' }));
  const [data, setData] = useState<LearnerData>(emptyData);
  const subject = person({ readOnly, data });
  const reload = async () => setData({ ...emptyData(), progress: { ...saved } });
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), conf,
    { toastTimer: { current: undefined }, drag: { current: null }, file: { current: null }, chat: { current: null } }, member(subject.id), subject, reload, async () => {}).renderVals();
  return <DetailScreen vm={vm} />;
}

describe('a deck told by the AI voice', () => {
  it('gets a signed link for each slide\'s audio, shows the first slide with its caption, and says how it is told', async () => {
    await panel(VOICED);
    expect(media.mediaUrl).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Play the deck')).toBeTruthy();
    expect(screen.getByText('2 slides · 5 s · counts 0.05 h · AI voice · Made with AI')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Decisions' })).toBeTruthy();
    expect(screen.getByText('Narrated with an AI voice · Made with AI')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2 · 0 / 3 s')).toBeTruthy();
  });
  it('plays each slide\'s own audio and moves on at its end, and tells the end only after the last slide has finished', async () => {
    const o = await panel(VOICED);
    click('Play');
    expect(sources).toEqual(['blob:voice-1.mp3']);
    tick(3200);
    expect(screen.getByRole('heading', { name: 'Minutes' })).toBeTruthy();
    expect(sources).toEqual(['blob:voice-1.mp3', 'blob:voice-2.mp3']);
    expect(o.onEnd).not.toHaveBeenCalled();
    tick(1900);
    expect(o.onEnd).not.toHaveBeenCalled();
    tick(300);
    expect(o.onEnd).toHaveBeenCalledTimes(1);
    tick(5000);
    expect(o.onEnd).toHaveBeenCalledTimes(1);
  });
  it('does not complete by stepping to the last slide with Next', async () => {
    const o = await panel(VOICED);
    click('Next');
    expect(screen.getByRole('heading', { name: 'Minutes' })).toBeTruthy();
    expect(o.onEnd).not.toHaveBeenCalled();
  });
  it('builds the bullets in at the talk-over\'s cues, the first at once', async () => {
    await panel(VOICED);
    expect(screen.getAllByRole('listitem').map((x) => x.textContent)).toEqual(['Decide first']);
    click('Play');
    tick(1200);
    expect(screen.getAllByRole('listitem').map((x) => x.textContent)).toEqual(['Decide first', 'Then risks']);
    tick(1000);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
  it('shows a slide without a cue with all its bullets', async () => {
    await panel(VOICED);
    click('Next');
    expect(screen.getAllByRole('listitem').map((x) => x.textContent)).toEqual(['Within a day']);
  });
  it('draws a slide\'s picture only through the sanitiser', async () => {
    const { container } = render(<SlidesPanel sl={slidesView(VOICED, opts())} />);
    await act(async () => {});
    expect(screen.getByRole('img', { name: 'Decisions' }).querySelector('rect')).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/alert|onload|<script/);
  });
  it('says so, and plays nothing, when the audio cannot be opened', async () => {
    vi.mocked(media.mediaUrl).mockRejectedValueOnce(new Error('This file is not there, or not open to you'));
    const o = await panel(VOICED);
    expect(screen.getByRole('alert').textContent).toContain('This file is not there, or not open to you');
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(o.onEnd).not.toHaveBeenCalled();
  });
});

describe('a deck with captions only', () => {
  it('needs no file: each slide runs at a reading pace, in silence, with its caption', async () => {
    const o = await panel(CAPTIONS);
    expect(media.mediaUrl).not.toHaveBeenCalled();
    expect(screen.getByText(/Captions only · no voice/)).toBeTruthy();
    click('Play');
    expect(audio.play).not.toHaveBeenCalled();
    expect(screen.getByText('Decisions come first then risks then progress.')).toBeTruthy();
    tick(1500);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    tick(1700);
    tick(2300);
    expect(o.onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('between slides', () => {
  const moved = async (c: SlidesContent, o = opts()) => { await panel(c, o); click('Next'); return screen.getByTestId('slide').style.animation; };
  it('Calm fades, Slide in flies in with Horizon\'s easing, and either is a fade with motion off', async () => {
    expect(await moved(VOICED)).toMatch(/pmFade/);
    cleanup();
    expect(await moved({ ...VOICED, transitions: 'Slide in' })).toMatch(/pmFlyIn .*cubic-bezier\(0\.65, ?0, ?0\.35, ?1\)/);
    cleanup();
    expect(await moved({ ...VOICED, transitions: 'Slide in' }, opts({ still: true }))).toMatch(/pmFade/);
  });
  it('carries the template: the firm\'s accent bar, or none', async () => {
    await panel(VOICED);
    expect(screen.getByTestId('slide').dataset.template).toBe('Firm template');
    cleanup();
    await panel({ ...VOICED, template: 'Minimal' });
    expect(screen.getByTestId('slide').dataset.template).toBe('Minimal');
  });
});

describe('on the detail page and in review', () => {
  it('completes the learning once, when the last slide has finished, saving that it was played to the end', async () => {
    render(<Live />);
    await act(async () => {});
    click('Play');
    tick(3200);
    tick(2200);
    await act(async () => {});
    expect(learner.saveProgress).toHaveBeenCalledTimes(1);
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L995', { state: 'accepted', pct: 100, detail: { last: true } });
  });
  it('saves nothing while viewing someone else', async () => {
    render(<Live readOnly />);
    await act(async () => {});
    expect(screen.getByText('Viewing someone else: playing it completes nothing.')).toBeTruthy();
    click('Play');
    tick(3200);
    tick(2200);
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
  it('is the preview for the author and reviewers, where playing it to the end completes nothing', async () => {
    render(<SavedContent t={{ key: 'c1', content: VOICED, hours: 0, still: false }} />);
    await act(async () => {});
    expect(screen.getByText('As learners will see it')).toBeTruthy();
    click('Play');
    tick(3200);
    tick(2200);
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
});
