// @vitest-environment jsdom
// The Slides Studio's screens (studios plan, Task 3.4): Shape it with "Who presents?" and its reason, Produce with the stock voice,
// the build and the browser voice (labelled, never stored), and the preview as the learner's deck.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../lib/contributionStore';
import * as voice from '../lib/voice';
import { BROWSER_VOICE } from '../lib/voice';
import type { StockVoice } from '../logic/ai';
import type { CreateData } from '../logic/contribution';
import { AI_VOICE, CAPTIONS, PRESENTER } from '../logic/slidesContent';
import { initState, Logic } from '../model';
import { cfg, member, person } from '../test/harness';
import type { AppState } from '../types';
import CreateScreen from './Create';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
vi.mock('../lib/voice', async (orig) => ({ ...(await orig<typeof import('../lib/voice')>()), speak: vi.fn(), speakInBrowser: vi.fn() }));
vi.mock('../lib/mediaStore', () => ({ mediaUrl: vi.fn(async () => 'blob:x') }));

const VOICES: StockVoice[] = [{ id: 'sv1', name: 'Warm · Flemish English', voice_id: 'EL1', language: 'English', accent: null, active: true }];
const ROWS = [['Why it matters', 'Decisions · Not updates', 'A steering committee takes decisions.'], ['Before', 'Send the pack ahead', 'Send the pack three days ahead.'], ['After', 'Minutes · Log', 'Minutes go out within a day.']];
const rule = { id: 1, user_id: 'u1', lines: ['Consulting'], formats: [], domains: [], audiences: [] };
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [rule], policies: [], peers: 3 });
const nw = { line: 'Consulting', aud: '', type: 'Slides', title: 'Steering committees', dom: 'lead', lvl: '2', stage: 'Senior consultant', take: 'Decide, not report.', outline: [], sources: [], ai: false, aiNote: '',
  items: { list: ROWS as never, how: 'manual' as const, problems: [], note: '' } };

function Live({ state, readOnly = false, live = true }: { state: Partial<AppState>; readOnly?: boolean; live?: boolean }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState({ ...cfg, liveAssistant: true }), screen: 'create', create: data(), createTab: 'new', stockVoices: VOICES, aiLive: live ? ['studio_voice'] : [], ...state }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), { ...cfg, liveAssistant: true }, { toastTimer, drag, file, chat }, member('u1'), person({ readOnly }), async () => {}).renderVals();
  return <>{vm.create && <CreateScreen c={vm.create} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const at = (step: number, extra: Partial<AppState['nw']> = {}, o: { readOnly?: boolean; live?: boolean } = {}) =>
  <Live {...o} state={{ nw: { ...nw, ...extra }, studio: { view: 'studio', step, id: 'slides' } }} />;
const SHAPE = 1, DRAFT = 2, PRODUCE = 3, PREVIEW = 4;

beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('Shape it', () => {
  it('asks who presents, the length, the template and the transitions, and nothing it cannot deliver', () => {
    render(at(SHAPE, { shape: { [PRESENTER]: AI_VOICE } }));
    ['Who presents?', 'Length?', 'Template', 'Transitions'].forEach((q) => expect(screen.getByRole('group', { name: q })).toBeTruthy());
    expect(screen.getByRole('button', { name: AI_VOICE })).toBeTruthy();
    ['My own recorded voice', 'AI avatar on the slide', 'Routes?', 'Short and long version', 'Video'].forEach((w) => expect(screen.queryByText(w)).toBeNull());
    expect(screen.getByText('Steers the AI draft')).toBeTruthy();
  });
  it('shows the reason instead of the AI voice while it is not live', () => {
    render(at(SHAPE, {}, { live: false }));
    expect(screen.queryByRole('button', { name: AI_VOICE })).toBeNull();
    expect(screen.getByRole('button', { name: CAPTIONS })).toBeTruthy();
    expect(screen.getByText(/The AI voice is not switched on/)).toBeTruthy();
  });
});

describe('Draft', () => {
  it('names the three fields of a slide: its title, its bullets and its talk-over', () => {
    render(at(DRAFT));
    expect(screen.getByText(/Items · Slide title · Bullets, separated by " · " · Talk-over/)).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Talk-over of item 2' }) as HTMLInputElement).value).toBe('Send the pack three days ahead.');
    expect((screen.getByRole('textbox', { name: 'Bullets, separated by " · " of item 1' }) as HTMLInputElement).value).toBe('Decisions · Not updates');
  });
});

describe('Produce', () => {
  it('casts the stock voices and shows how far the voicing got', () => {
    render(at(PRODUCE, { shape: { [PRESENTER]: AI_VOICE } }));
    expect(screen.getByRole('button', { name: 'Warm · Flemish English' })).toBeTruthy();
    expect(screen.getByText('AI voice · voiced 0 of 3 slides')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue building' })).toBeTruthy();
    expect(screen.queryByText(BROWSER_VOICE)).toBeNull();
  });
  it('without the AI voice offers the browser voice for a preview, labelled, and speaks and stores nothing until asked', async () => {
    vi.mocked(voice.speakInBrowser).mockReturnValue({ label: BROWSER_VOICE, done: new Promise(() => {}), stop: vi.fn() });
    render(at(PRODUCE, { shape: { [PRESENTER]: CAPTIONS } }, { live: false }));
    expect(screen.getByText(/Hear the talk-over · Browser voice · not saved/)).toBeTruthy();
    expect(screen.getByText(/Captions only · no voice is made/)).toBeTruthy();
    expect(voice.speakInBrowser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hear slide 2' }));
    expect(voice.speakInBrowser).toHaveBeenCalledWith('Send the pack three days ahead.');
    expect(screen.getByRole('button', { name: 'Stop slide 2' })).toBeTruthy();
    expect(voice.speak).not.toHaveBeenCalled();
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('says so when the browser never starts the voice', async () => {
    vi.mocked(voice.speakInBrowser).mockReturnValue({ label: BROWSER_VOICE, done: Promise.resolve('blocked'), stop: vi.fn() });
    render(at(PRODUCE, { shape: { [PRESENTER]: CAPTIONS } }, { live: false }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hear slide 1' })); });
    expect(screen.getByRole('status').textContent).toMatch(/browser did not start the voice/);
    expect(screen.getByRole('button', { name: 'Hear slide 1' })).toBeTruthy();
  });
  it('offers no browser voice while the AI voice is live, and none in View as', () => {
    render(at(PRODUCE, { shape: { [PRESENTER]: CAPTIONS } }));
    expect(screen.queryByText(/Browser voice/)).toBeNull();
    cleanup();
    render(at(PRODUCE, { shape: { [PRESENTER]: CAPTIONS } }, { live: false, readOnly: true }));
    expect(screen.queryByRole('button', { name: 'Hear slide 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Start building|Continue building/ })).toBeNull();
  });
});

describe('Preview & test', () => {
  it('plays the deck as learners will see it, without saving, once it can be told', async () => {
    render(at(PREVIEW, { shape: { [PRESENTER]: CAPTIONS } }, { live: false }));
    await act(async () => {});
    expect(screen.getByText('Play the deck')).toBeTruthy();
    expect(screen.getByText('A play-test, as learners will see it: nothing is saved or counted.')).toBeTruthy();
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('says what is missing when the AI voice is chosen and not every slide is voiced', () => {
    render(at(PREVIEW, { shape: { [PRESENTER]: AI_VOICE } }));
    expect(screen.queryByText('Play the deck')).toBeNull();
    expect(screen.getByText('Voice every slide in Produce, or choose Captions only in Shape it')).toBeTruthy();
  });
});
