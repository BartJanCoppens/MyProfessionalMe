// @vitest-environment jsdom
// The Animated flow's panel (studios plan, Task 2.3) on the detail page and as the Motion Studio's preview: the drawing
// only through the sanitiser (Review Focus 1), Play, Pause, Replay and the scrubber on the SVG's own clock, completion
// when played to the end or when the text version is read, the last frame and the text version when motion is off or
// reduced, and nothing saved in the preview.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../config';
import { LEARN, LEARN_BY, LEARN_META } from '../data';
import * as store from '../lib/contributionStore';
import { parseFormatContent } from '../lib/contentStore';
import * as learner from '../lib/learnerStore';
import { emptyParts } from '../logic/contribution';
import { MOTION_LENGTH } from '../logic/studioContent';
import { initState, Logic } from '../model';
import { cfg, emptyData, harness, member, person } from '../test/harness';
import type { LearnerData } from '../lib/learnerStore';
import type { AppState, Learn } from '../types';
import { flowView } from '../fmtMotion';
import AnimatedFlowPanel from './AnimatedFlowPanel';
import { DetailScreen } from './Library';
import { Preview } from './studioPreviews';

vi.mock('../lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}), acceptLearning: vi.fn(),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('../lib/contributionStore', () => ({ loadCreate: vi.fn(), saveDraft: vi.fn(), removeDraft: vi.fn(), submitContribution: vi.fn(), decideReview: vi.fn(), savePolicy: vi.fn(), removePolicy: vi.fn(), checkContribution: vi.fn() }));
vi.mock('../lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));

const ATTACK = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 640 320" onload="alert(1)"><script>alert(2)</script>'
  + '<rect id="box" width="40" height="20" onclick="alert(3)" style="fill:var(--tc-green, #86BC25)"><animate attributeName="opacity" from="0" to="1" dur="1s" fill="freeze"/></rect>'
  + '<use href="https://evil.example/x.svg#a"/><a xlink:href="javascript:alert(4)"><text>go</text></a><image href="https://evil.example/p.png"/></svg>';
const STAGES = [{ label: 'Order', text: 'The customer orders.' }, { label: 'Deliver', text: 'Goods leave.' }, { label: 'Collect', text: 'Payment arrives.' }];
const ALT = 'An animated flow in 3 stages. 1. Order. 2. Deliver. 3. Collect.';
const ROW: Learn = ['L994', 'Order-to-cash', 'corp', 1, 'Animated flow', 'Peer contribution', 0.025, 0, '', ''];
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L994 = ROW; LEARN_META.L994 = { line: null, status: 'published', content: parseFormatContent({ kind: 'motion', stages: STAGES, svg: ATTACK, alt: ALT, seconds: 20, made: 'ai' }) }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L994; delete LEARN_META.L994; });

// jsdom has no SMIL clock: the SVG's own controls are spies.
const smil = { pause: vi.fn(), unpause: vi.fn(), at: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  saved = {};
  vi.mocked(learner.saveProgress).mockImplementation(async (_u, id, patch) => { saved[id] = { state: patch.state ?? 'not-started', pct: patch.pct ?? 0, chosen: false, detail: patch.detail }; });
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  Object.assign(window.SVGSVGElement.prototype, { pauseAnimations: smil.pause, unpauseAnimations: smil.unpause, setCurrentTime: smil.at });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

// What the saves wrote, read back on reload as the subject's progress (as useSubject does).
let saved: LearnerData['progress'] = {};
function Live({ config = {}, readOnly = false }: { config?: Partial<Config>; readOnly?: boolean }) {
  const conf = { ...cfg, motion: true, ...config };
  const [st, setSt] = useState<AppState>(() => ({ ...initState(conf), screen: 'detail', detailId: 'L994' }));
  const [data, setData] = useState<LearnerData>(emptyData);
  const subject = person({ readOnly, data });
  const reload = async () => setData({ ...emptyData(), progress: { ...saved } });
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), conf,
    { toastTimer: { current: undefined }, drag: { current: null }, file: { current: null }, chat: { current: null } }, member(subject.id), subject, reload, async () => {}).renderVals();
  return <DetailScreen vm={vm} />;
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const lastAt = () => smil.at.mock.calls[smil.at.mock.calls.length - 1]?.[0];

describe('the learner\'s Animated flow', () => {
  it('draws the flow only through the sanitiser: no script, handler or outside link reaches the page', () => {
    const { container } = render(<Live />);
    const drawing = screen.getByRole('img', { name: ALT });
    expect(drawing.querySelector('rect')).not.toBeNull();
    expect(drawing.querySelector('animate')).not.toBeNull();
    ['script', 'image', 'a'].forEach((tag) => expect(drawing.getElementsByTagName(tag).length, tag).toBe(0));
    // the <use> stays, its outside href does not
    expect([...drawing.querySelectorAll('*')].filter((e) => e.getAttribute('href') || e.getAttribute('xlink:href'))).toHaveLength(0);
    expect(container.getElementsByTagName('script').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/alert|onload|onclick|evil\.example|javascript:/);
    expect(screen.getByText('3 stages · 20 s · Made with AI')).toBeTruthy();
  });
  it('waits at the first frame, plays, pauses, scrubs and replays on the drawing\'s own clock', () => {
    vi.useFakeTimers();
    render(<Live />);
    expect(smil.pause).toHaveBeenCalled();
    expect(lastAt()).toBe(0);
    click('Play');
    expect(smil.unpause).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(9000); });
    expect(screen.getByText('Stage 2 of 3 · Deliver')).toBeTruthy();
    smil.pause.mockClear();
    click('Pause');
    expect(smil.pause).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('slider', { name: 'Position in the flow' }), { target: { value: '16' } });
    expect(lastAt()).toBe(16);
    expect(screen.getByText('Stage 3 of 3 · Collect')).toBeTruthy();
    click('Replay');
    expect(lastAt()).toBe(0);
    expect(smil.unpause).toHaveBeenCalledTimes(2);
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
  it('starts a new drawing at its first frame, stopped, wherever the last one was', () => {
    vi.useFakeTimers();
    const opts = { ro: false, still: false, done: false, onEnd: vi.fn(), onRead: () => {} };
    const flow = (svg: string) => flowView({ kind: 'motion', stages: STAGES, svg, alt: ALT, seconds: 20, made: 'ai' }, opts);
    const { rerender } = render(<AnimatedFlowPanel fl={flow('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>')} />);
    click('Play');
    act(() => { vi.advanceTimersByTime(9000); });
    rerender(<AnimatedFlowPanel fl={flow('<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>')} />);
    expect((screen.getByRole('slider', { name: 'Position in the flow' }) as HTMLInputElement).value).toBe('0');
    expect(screen.getByText('Stage 1 of 3 · Order')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(20000); });
    expect(opts.onEnd).not.toHaveBeenCalled();
  });
  it('completes when played to the end, once, and holds the last frame', () => {
    vi.useFakeTimers();
    render(<Live />);
    click('Play');
    act(() => { vi.advanceTimersByTime(21000); });
    expect(lastAt()).toBe(20);
    expect(learner.saveProgress).toHaveBeenCalledTimes(1);
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L994', { state: 'accepted', pct: 100, detail: { played: true } });
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy();
  });
  it('keeps the text version one click away, and completes when it is read', () => {
    render(<Live />);
    expect(screen.queryByText(ALT)).toBeNull();
    click('Show the text version');
    expect(screen.getByText(ALT)).toBeTruthy();
    click('Done reading');
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L994', { state: 'accepted', pct: 100, detail: { read: true } });
  });
  it('reading the text version while it plays completes it once: reaching the end afterwards writes nothing more', async () => {
    vi.useFakeTimers();
    render(<Live />);
    click('Play');
    click('Show the text version');
    await act(async () => { click('Done reading'); });
    act(() => { vi.advanceTimersByTime(21000); });
    expect(learner.saveProgress).toHaveBeenCalledTimes(1);
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L994', { state: 'accepted', pct: 100, detail: { read: true } });
  });
  it('with ?motion=off shows the last frame, paused, and the text version, without a player', () => {
    render(<Live config={{ motion: false }} />);
    expect(smil.pause).toHaveBeenCalled();
    expect(lastAt()).toBe(20);
    expect(smil.unpause).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.getByText(ALT)).toBeTruthy();
    expect(screen.getByText(/Motion is off/)).toBeTruthy();
  });
  it('does the same when the device asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn((q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', media: q })));
    render(<Live />);
    expect(lastAt()).toBe(20);
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
    expect(screen.getByText(ALT)).toBeTruthy();
  });
  it('in View as plays but saves nothing and offers no Done reading', () => {
    vi.useFakeTimers();
    render(<Live readOnly />);
    click('Play');
    act(() => { vi.advanceTimersByTime(21000); });
    click('Show the text version');
    expect(screen.queryByRole('button', { name: 'Done reading' })).toBeNull();
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
});

describe('the Motion Studio preview', () => {
  it('is the learner\'s panel over the built flow; playing and reading are never saved', () => {
    vi.useFakeTimers();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="9" height="9"><animate attributeName="opacity" dur="1s"/></rect></svg>';
    const h = harness({ access: member('u1'), subject: person(), config: { motion: true }, state: { screen: 'create', createTab: 'new', nwKb: [], studio: { view: 'studio', step: 4, id: 'motion' },
      create: { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 },
      nw: { line: 'Consulting', aud: '', type: 'Animated flow', title: 'T', dom: 'corp', lvl: '1', stage: 'Analyst', take: 'x', outline: [], sources: [], ai: false, aiNote: '', shape: { [MOTION_LENGTH]: '20 s' },
        items: { list: [['Order', 'a'], ['Deliver', 'b'], ['Collect', 'c'], { svg, alt: 'Three stages.', made: 'scripted', seconds: 20 }] as never, how: 'manual', problems: [], note: '' } } } });
    render(<Preview kind="motion" c={h.vm().create!} />);
    expect(screen.getByText(/play-test/i)).toBeTruthy();
    expect(screen.getByText('3 stages · 20 s · Scripted · boxes and arrows')).toBeTruthy();
    click('Play');
    act(() => { vi.advanceTimersByTime(21000); });
    click('Show the text version');
    click('Done reading');
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(h.patches).toHaveLength(0);
  });
  it('says what is missing before the flow is animated', () => {
    const h = harness({ access: member('u1'), subject: person(), state: { screen: 'create', createTab: 'new', nwKb: [], studio: { view: 'studio', step: 4, id: 'motion' },
      create: { contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 },
      nw: { line: 'Consulting', aud: '', type: 'Animated flow', title: 'T', dom: 'corp', lvl: '1', stage: 'Analyst', take: 'x', outline: [], sources: [], ai: false, aiNote: '',
        items: { list: [['Order', 'a'], ['Deliver', 'b'], ['Collect', 'c']] as never, how: 'manual', problems: [], note: '' } } } });
    render(<Preview kind="motion" c={h.vm().create!} />);
    expect(screen.getByText('Build the animation in Produce')).toBeTruthy();
  });
});
