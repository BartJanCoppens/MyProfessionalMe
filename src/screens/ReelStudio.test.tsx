// @vitest-environment jsdom
// The Reel Studio's screens (studios plan, Task 5.5): Shape it with "Who presents?" (the voice options only while the AI voice is live), Draft with the check
// row, Produce with the stock voice and look, the build with the final cut's progress and Cancel, and the preview (the step player and canvas before the cut,
// never saved).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../lib/contributionStore';
import * as media from '../lib/mediaStore';
import { prepareAudio, renderCut } from '../reel/compositor';
import { CutError } from '../reel/cutRules';
import type { StockVoice } from '../logic/ai';
import type { CreateData } from '../logic/contribution';
import { CARDS_VOICE, PORTRAIT_VOICE, PRESENTER, TEXT_ONLY } from '../logic/reelContent';
import { initState, Logic } from '../model';
import { cfg, member, person } from '../test/harness';
import type { AppState } from '../types';
import CreateScreen from './Create';

vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
vi.mock('../lib/mediaStore', () => ({ mediaUrl: vi.fn(async () => 'blob:x'), uploadMedia: vi.fn(async (_i: string, _b: Blob, name: string) => 'u/c/' + name) }));
vi.mock('../reel/compositor', () => ({ renderCut: vi.fn(), prepareAudio: vi.fn() }));
vi.mock('../reel/reelCut', async (orig) => ({ ...(await orig<typeof import('../reel/reelCut')>()), loadPortrait: vi.fn(async () => null) }));

const VOICES: StockVoice[] = [{ id: 'sv1', name: 'Warm · Flemish English', voice_id: 'EL1', language: 'English', accent: null, active: true }];
const LOOKS = [{ id: '11111111-1111-4111-8111-111111111111', name: 'HR director · 50s', portrait: 'p1' as const, color: '#8a5a8c', licence: 'Drawn in code', active: true }];
const ROWS = [['Hook', 'Your project is drifting. Here are three signs.', 'three signs'], ['Scene 1', 'Hours are booked on tasks that are not in scope.', 'A timesheet'], ['Close', 'Raise it this week.', 'Talk to your EM'],
  ['Check', 'What now?', 'Raise it · Wait · Ignore it']];
const rule = { id: 1, user_id: 'u1', lines: ['Consulting'], formats: [], domains: [], audiences: [] };
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [rule], policies: [], peers: 3 });
const nw = { line: 'Consulting', aud: '', type: 'Reel', title: 'Three signs', dom: 'prof', lvl: '2', stage: 'Senior consultant', take: 'Spot drift early.', outline: [], sources: [], ai: false, aiNote: '', key: 'k1',
  items: { list: ROWS as never, how: 'manual' as const, problems: [], note: '' } };

function Live({ state, readOnly = false, live = true }: { state: Partial<AppState>; readOnly?: boolean; live?: boolean }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState({ ...cfg, liveAssistant: true }), screen: 'create', create: data(), createTab: 'new', stockVoices: VOICES, stockLooks: LOOKS, aiLive: live ? ['studio_voice'] : [], ...state }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), { ...cfg, liveAssistant: true }, { toastTimer, drag, file, chat }, member('u1'), person({ readOnly }), async () => {}).renderVals();
  return <>{vm.create && <CreateScreen c={vm.create} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const at = (step: number, extra: Partial<AppState['nw']> = {}, o: { readOnly?: boolean; live?: boolean } = {}) =>
  <Live {...o} state={{ nw: { ...nw, ...extra }, studio: { view: 'studio', step, id: 'reel' } }} />;
const SHAPE = 1, DRAFT = 2, PRODUCE = 3, PREVIEW = 4, SEND = 5;

beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Shape it', () => {
  it('asks who it is for, who presents, the tone and the length; the avatar and the creator\'s own voice are not offered', () => {
    render(at(SHAPE));
    ['Who is it for?', 'Who presents?', 'Tone?', 'Length?'].forEach((q) => expect(screen.getByRole('group', { name: q })).toBeTruthy());
    ['An AI avatar', 'My own voice-over'].forEach((w) => expect(screen.queryByText(w)).toBeNull());
    expect(screen.getAllByText('Steers the AI draft')).toHaveLength(3);
  });
  it('offers the two AI voice presenters while the AI voice is live', () => {
    render(at(SHAPE));
    [PORTRAIT_VOICE, CARDS_VOICE, TEXT_ONLY].forEach((o) => expect(screen.getByRole('button', { name: o })).toBeTruthy());
  });
  it('shows the reason instead of the voice presenters while it is not live, and keeps text and music only', () => {
    render(at(SHAPE, {}, { live: false }));
    [PORTRAIT_VOICE, CARDS_VOICE].forEach((o) => expect(screen.queryByRole('button', { name: o })).toBeNull());
    expect(screen.getByRole('button', { name: TEXT_ONLY })).toBeTruthy();
    expect(screen.getByText(/The AI voice is not switched on/)).toBeTruthy();
  });
});

describe('Draft', () => {
  it('names the three fields of a row and says when the check question is missing', () => {
    render(at(DRAFT, { items: { list: ROWS.slice(0, 3) as never, how: 'manual', problems: [], note: '' } }));
    expect(screen.getByText(/Items · Scene, or Check · Voice-over, or the check question · On-screen text, or the options/)).toBeTruthy();
    expect(screen.getByText('Add the check question: one question, the right answer first')).toBeTruthy();
  });
});

describe('Produce', () => {
  it('shows the stock look only for the stock presenter, with the voice, and the format, captions and music as choices that say what they do', () => {
    render(at(PRODUCE, { shape: { [PRESENTER]: PORTRAIT_VOICE } }));
    expect(screen.getByRole('button', { name: /HR director/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Warm · Flemish English' })).toBeTruthy();
    ['9:16 vertical', '1:1 square', 'Burned in', 'Separate file', 'None', 'Calm', 'Upbeat'].forEach((o) => expect(screen.getByRole('button', { name: o })).toBeTruthy());
    expect(screen.getByText('Made in code · a short loop, no recording')).toBeTruthy();
    expect(screen.getByText(/Burned in also draws them on the video/)).toBeTruthy();
    expect(screen.getByText('AI voice · voiced 0 of 3 scenes')).toBeTruthy();
    expect(screen.getByText('No final cut yet')).toBeTruthy();
    cleanup();
    render(at(PRODUCE, { shape: { [PRESENTER]: CARDS_VOICE } }));
    expect(screen.queryByRole('button', { name: /HR director/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Warm · Flemish English' })).toBeTruthy();
    cleanup();
    render(at(PRODUCE, { shape: { [PRESENTER]: TEXT_ONLY } }));
    expect(screen.queryByRole('button', { name: /HR director|Warm · Flemish English/ })).toBeNull();
    expect(screen.getByText(/Text and music only · no voice is made/)).toBeTruthy();
    expect(screen.getByText(/2\. No voice · text and music only/)).toBeTruthy();
  });
  it('has no build action in View as', () => {
    render(at(PRODUCE, { shape: { [PRESENTER]: TEXT_ONLY } }, { readOnly: true }));
    expect(screen.queryByRole('button', { name: /Start building|Continue building/ })).toBeNull();
  });
});

describe('the build and the final cut', () => {
  const text = { shape: { [PRESENTER]: TEXT_ONLY } };
  const start = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start building|Continue building/ })); }); };
  it('opens the audio context in the click, shows the progress with Cancel and the open-tab note, and stores the cut when it is done', async () => {
    const order: string[] = [];
    vi.mocked(prepareAudio).mockImplementation(() => { order.push('prepare'); return undefined; });
    let finish: (r: unknown) => void = () => {};
    vi.mocked(renderCut).mockImplementation((_c, o) => { order.push('render'); o.onProgress(42); return new Promise((resolve) => { finish = resolve as never; }); });
    vi.mocked(store.saveDraft).mockResolvedValue('p1');
    vi.mocked(store.loadCreate).mockResolvedValue(data());
    render(at(PRODUCE, text));
    await start();
    await waitFor(() => expect(renderCut).toHaveBeenCalled());
    expect(order).toEqual(['prepare', 'render']);
    expect(await screen.findByText(/Rendering 42 % · about \d+:\d\d left · keep this tab open and in front/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    await act(async () => { finish({ blob: new Blob(['v']), mime: 'video/mp4', ext: 'mp4', seconds: 10.2 }); });
    await waitFor(() => expect(media.uploadMedia).toHaveBeenCalledTimes(1));
    expect(vi.mocked(media.uploadMedia).mock.calls[0][2]).toMatch(/^reel-[0-9a-f]{16}\.mp4$/);
    expect(screen.queryByText(/Rendering/)).toBeNull();
  });
  it('Cancel stops the render, says nothing was saved and the step shows why, with its Retry', async () => {
    vi.mocked(renderCut).mockImplementation((_c, o) => new Promise((_, no) => o.signal.addEventListener('abort', () => no(new CutError('CUT_CANCELLED')))));
    render(at(PRODUCE, text));
    await start();
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })); });
    expect((await screen.findByRole('alert')).textContent).toBe('Cancelled · nothing was saved');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(media.uploadMedia).not.toHaveBeenCalled();
  });
  it('a render the browser refuses (a hidden tab) says why in the step and stores nothing', async () => {
    vi.mocked(renderCut).mockRejectedValue(new CutError('CUT_HIDDEN'));
    render(at(PRODUCE, text));
    await start();
    expect((await screen.findByRole('alert')).textContent).toMatch(/The tab was hidden/);
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
});

describe('Preview & test', () => {
  it('plays a reel that is not cut yet on the step player with the canvas, says music comes with the final cut, and saves nothing', async () => {
    render(at(PREVIEW, { shape: { [PRESENTER]: TEXT_ONLY } }));
    await act(async () => {});
    expect(screen.getByText('Preview · music is added in the final cut · not saved, never counts as progress')).toBeTruthy();
    expect(screen.getByText(/Step 1 of 3/)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'three signs' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Raise it' }));
    expect(screen.getByText('Right. The reel is complete.')).toBeTruthy();
    expect(store.saveDraft).not.toHaveBeenCalled();
  });
  it('says what is missing when the AI voice is chosen and not every scene is voiced', () => {
    render(at(PREVIEW, { shape: { [PRESENTER]: CARDS_VOICE } }));
    expect(screen.queryByText(/Step 1 of/)).toBeNull();
    expect(screen.getByText('Voice every scene in Produce, or choose Text and music only in Shape it')).toBeTruthy();
  });
});

describe('Check & send', () => {
  it('lists that captions or the transcript are included, and keeps the check closed until the reel is cut', () => {
    render(at(SEND, { shape: { [PRESENTER]: TEXT_ONLY } }));
    expect(screen.getByText('Captions or transcript included')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run the automatic check' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Make the final cut in Produce')).toBeTruthy();
  });
});
