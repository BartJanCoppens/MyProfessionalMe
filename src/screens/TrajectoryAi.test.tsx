// @vitest-environment jsdom
// The "Build with AI" panel as an admin sees it: the honest labels, the conversation (the AI's words are text), the module cards with their
// sources, what View as shows, and Start over. The provider call and the plan store are faked; the state is a real one.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import { askAi } from '../lib/aiStore';
import { mediaUrl } from '../lib/mediaStore';
import { startOver } from '../lib/planStore';
import { blankTrajectory } from '../logic/trajectoryEdit';
import { emptyPlan } from '../logic/trajectoryPlan';
import type { PlanBrief, PlanModule, PlanRecord, PlanSource, TrjPlanState } from '../logic/trajectoryPlan';
import { cfg, person, systemAdmin } from '../test/harness';
import type { Access, AppState } from '../types';
import TrajectoryAi from './TrajectoryAi';

vi.mock('../lib/aiStore', async (orig) => ({ ...(await orig<object>()), askAi: vi.fn() }));
vi.mock('../lib/planStore', async (orig) => ({ ...(await orig<object>()), savePlanSoon: vi.fn(), startOver: vi.fn(async () => {}), loadPlan: vi.fn(async () => ({ record: null, sources: [] })) }));
vi.mock('../lib/mediaStore', async (orig) => ({ ...(await orig<object>()), mediaUrl: vi.fn(async () => 'https://signed.example/file.pdf') }));
const ask = vi.mocked(askAi);

let current: AppState;
// latest() answers the newest Logic, as App's logicRef does: an answer that arrives later reads the plan as it is then.
let newest: Logic;
class LatestLogic extends Logic { latest = () => newest; }
let patchState: (p: Partial<AppState>) => void;
function Live({ state, readOnly = false, access = systemAdmin('u1') }: { state: Partial<AppState>; readOnly?: boolean; access?: Access }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState({ ...cfg, liveAssistant: true }), ...state }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const set = (p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  const logic = new LatestLogic(st, set, { ...cfg, liveAssistant: true }, { toastTimer, drag, file, chat }, access, person({ id: readOnly ? 'other' : 'u1', readOnly }), async () => {}, async () => {});
  useEffect(() => { newest = logic; current = st; patchState = (p) => set(p); });
  const vm = logic.renderVals();
  return <>{vm.tai && <TrajectoryAi tai={vm.tai} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}

const T1 = { ...blankTrajectory('Audit'), id: 'T1', name: 'Tax certificate', credential: 'Certified adviser', issuer: 'ITAA' }, T2 = { ...T1, id: 'T2', name: 'Second' };
const mod = (id: string, over: Partial<PlanModule> = {}): PlanModule => ({ id, title: 'Module ' + id, depth: 'applied', goals: ['Know the VAT rules'], hours: 6, material: [{ kind: 'existing', learningId: 'L1', reason: 'Covers it' }], sources: [], checks: ['evidence'], accepted: false, ...over });
const brief: PlanBrief = { goal: 'Prepare advisers', credential: 'Certified adviser', issuer: 'ITAA', audience: 'Seniors', stage: null, line: 'Audit', level: 'applied', hoursBudget: 40, deadline: null, bodyRules: '', constraints: '', domain: 'tax' };
const record = (over: Partial<PlanRecord> = {}): PlanRecord => ({ trajectoryId: 'T1', plan: emptyPlan(), messages: [], bundleIds: [], updatedAt: null, ...over });
const source = (): PlanSource => ({ id: 's1', trajectoryId: 'T1', name: 'syllabus.pdf', path: 'u/s1/syllabus.pdf', pages: 4, passages: [[1, 'x']], chars: 1, flags: [], addedBy: 'u1', addedAt: '' });
const show = (plans: Record<string, TrjPlanState> = { T1: { record: record(), sources: [] } }, state: Partial<AppState> = {}, readOnly = false) =>
  render(<Live readOnly={readOnly} state={{ trjs: [T1, T2], trjSel: 'T1', aiLive: ['trajectory_ai'], trjPanel: { open: true, say: '', focus: null, editing: null, kbq: '', confirm: false }, trjPlans: plans, ...state }} />);
const answer = (over: Record<string, unknown> = {}) => ({ text: JSON.stringify({ reply: 'Here is a plan.', questions: [], brief: null, modules: null, ...over }), cut: false });
const type = (text: string) => fireEvent.change(screen.getByLabelText('Message to the AI'), { target: { value: text } });
const planned = (...modules: PlanModule[]) => ({ T1: { record: record({ plan: { ...emptyPlan(), brief, modules } }), sources: [source()] } });

beforeEach(() => { ask.mockReset(); vi.mocked(startOver).mockClear(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('the Build with AI panel', () => {
  it('says what it is: proposed by AI, from your sources, you decide, and that Apply is what changes the trajectory', () => {
    show();
    expect(screen.getByText('Proposed by AI · from your sources only · you decide')).toBeTruthy();
    expect(screen.getByText('Made with AI')).toBeTruthy();
    expect(screen.getByText('Nothing changes the trajectory until you press Apply.')).toBeTruthy();
    expect(screen.getByText('Brief')).toBeTruthy();
  });
  it('with Trajectory AI off, says so and has no Send, while the saved plan still accepts, moves and removes', () => {
    show(planned(mod('m1'), mod('m2')), { aiLive: [] });
    expect(screen.getByText('Build with AI needs AI: a System Admin switches on Trajectory AI in AI connections')).toBeTruthy();
    expect(screen.queryByLabelText('Message to the AI')).toBeNull();
    fireEvent.click(screen.getAllByText('Accept')[0]);
    expect(current.trjPlans.T1.record!.plan.modules[0].accepted).toBe(true);
    fireEvent.click(screen.getByLabelText('Move Module m1 down'));
    expect(current.trjPlans.T1.record!.plan.modules.map((m) => m.id)).toEqual(['m2', 'm1']);
    fireEvent.click(screen.getAllByTitle(/^Remove Module/)[0]);
    expect(current.trjPlans.T1.record!.plan.modules.map((m) => m.id)).toEqual(['m1']);
    expect(current.trjPlans.T1.record!.plan.removed).toEqual(['Module m2']);
  });
  it('Send asks once under trajectory_ai and shows the reply as text, never as markup', async () => {
    ask.mockResolvedValue(answer({ reply: 'Try <b>x</b> first' }));
    show();
    type('Plan a VAT track');
    fireEvent.click(screen.getByText('Send'));
    expect(await screen.findByText('Try <b>x</b> first')).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toBe('trajectory_ai');
    expect(screen.getByText('Plan a VAT track')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
  });
  it('a second Send while the first works makes no second call', async () => {
    let release: (v: { text: string; cut: boolean }) => void = () => {};
    ask.mockReturnValue(new Promise((r) => { release = r; }));
    show();
    type('one');
    fireEvent.click(screen.getByText('Send'));
    type('two');
    const send = screen.getByText('Send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send);
    expect(ask).toHaveBeenCalledTimes(1);
    release(answer());
    await screen.findByText('Here is a plan.');
  });
  it('shows "No source yet" for a module without one, and labels hours and depth as proposals', () => {
    show(planned(mod('m1')));
    expect(screen.getByText('No source yet')).toBeTruthy();
    expect(screen.getByText('about 6 h · a proposal', { exact: false })).toBeTruthy();
    expect(screen.getByText('Applied · a proposal', { exact: false })).toBeTruthy();
    expect(screen.getByText('In the library · Operating model design')).toBeTruthy();
  });
  it('labels a gap to create and a manual format', () => {
    show(planned(mod('m1', { material: [{ kind: 'studio', format: 'Flash cards', reason: 'r' }, { kind: 'manual', format: 'Book', reason: 'r' }] })));
    expect(screen.getByText('To create · Flash cards')).toBeTruthy();
    expect(screen.getByText('Manual · Book')).toBeTruthy();
  });
  it('says how many sources the AI cited that it was not given, and that they were removed', async () => {
    ask.mockResolvedValue(answer({ modules: [{ title: 'VAT', depth: 'foundation', goals: ['g'], hours: 2, material: [], sources: ['P98', 'P99'], checks: [] }] }));
    show();
    type('Plan');
    fireEvent.click(screen.getByText('Send'));
    expect(await screen.findByText('The AI cited 2 sources it was not given · removed')).toBeTruthy();
    expect(screen.getByText('No source yet')).toBeTruthy();
  });
  it('a daily limit shows the function\'s text and adds no module', async () => {
    ask.mockRejectedValue(new Error('Daily AI limit reached (40 a day per person for this use); try again tomorrow (UTC)'));
    show();
    type('Plan');
    fireEvent.click(screen.getByText('Send'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/^Daily AI limit reached/);
    expect(current.trjPlans.T1.record!.plan.modules).toEqual([]);
  });
  it('an answer that arrives after another trajectory was opened lands in the first one', async () => {
    let release: (v: { text: string; cut: boolean }) => void = () => {};
    ask.mockReturnValue(new Promise((r) => { release = r; }));
    show({ T1: { record: record(), sources: [] }, T2: { record: record({ trajectoryId: 'T2' }), sources: [] } });
    type('Plan');
    fireEvent.click(screen.getByText('Send'));
    patchState({ trjSel: 'T2' });
    await screen.findByText('Second');
    release(answer({ modules: [{ title: 'VAT', depth: 'foundation', goals: ['g'], hours: 2, material: [], sources: [], checks: [] }] }));
    await waitFor(() => expect(current.trjPlans.T1.record!.plan.modules).toHaveLength(1));
    expect(current.trjPlans.T2.record!.plan.modules).toEqual([]);
    expect(screen.queryByText('Module VAT')).toBeNull();
  });
  it('shows the brief as the AI\'s summary, with "Correct it in the chat", and offers Propose the plan once it exists', () => {
    show();
    expect(screen.queryByText('Propose the plan')).toBeNull();
    cleanup();
    show(planned());
    expect(screen.getByText('The AI\'s summary of the brief')).toBeTruthy();
    expect(screen.getByText('Correct it in the chat.')).toBeTruthy();
    expect(screen.getByText('Propose the plan')).toBeTruthy();
  });
  it('asks about one module: the next message is about it', async () => {
    ask.mockResolvedValue(answer());
    show(planned(mod('m1')));
    fireEvent.click(screen.getByText('Ask the AI about this module'));
    expect(screen.getByText('Ask about the whole plan')).toBeTruthy();
    type('Shorter');
    fireEvent.click(screen.getByText('Send'));
    await screen.findByText('Here is a plan.');
    expect(ask.mock.calls[0][1].messages[0].content).toContain('About module m1');
  });
  it('edits a module\'s title, goals, hours and depth', () => {
    show(planned(mod('m1')));
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed' } });
    fireEvent.blur(screen.getByLabelText('Goals · one per line'), { target: { value: 'One\nTwo\n' } });
    fireEvent.blur(screen.getByLabelText('Hours'), { target: { value: '8.5' } });
    fireEvent.change(screen.getByLabelText('Depth'), { target: { value: 'expert' } });
    expect(current.trjPlans.T1.record!.plan.modules[0]).toMatchObject({ title: 'Renamed', goals: ['One', 'Two'], hours: 8.5, depth: 'expert', accepted: false });
  });
  it('shows a citation as its label, with the quote on focus, and opens a file\'s PDF', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    show(planned(mod('m1', { sources: [{ ref: { kind: 'file', sourceId: 's1', page: 4, passage: 0 }, label: 'syllabus.pdf · p. 4', quote: 'The exam covers VAT.' }, { ref: { kind: 'learning', learningId: 'L1' }, label: 'Operating model design', quote: '' }] })));
    expect(screen.getByText('Learning · Operating model design')).toBeTruthy();
    const cite = screen.getByText('syllabus.pdf · p. 4');
    expect(screen.queryByText('“The exam covers VAT.”')).toBeNull();
    fireEvent.focus(cite);
    expect(screen.getByText('“The exam covers VAT.”')).toBeTruthy();
    fireEvent.click(cite);
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://signed.example/file.pdf', '_blank', 'noopener'));
    expect(mediaUrl).toHaveBeenCalledWith('u/s1/syllabus.pdf');
    vi.unstubAllGlobals();
  });
  it('View as shows the plan read-only: no Send, Apply, Start over, or card actions', () => {
    show(planned(mod('m1')), {}, true);
    expect(screen.getByText('Module m1', { exact: false })).toBeTruthy();
    expect(screen.queryByText('Send')).toBeNull();
    expect(screen.queryByText('Apply')).toBeNull();
    expect(screen.queryByText('Start over')).toBeNull();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByLabelText('Message to the AI')).toBeNull();
  });
  it('Start over needs two clicks and keeps the sources', async () => {
    show({ T1: { record: record({ plan: { ...emptyPlan(), brief, modules: [mod('m1')] }, messages: [{ role: 'admin', text: 'hello', at: '' }], bundleIds: ['b1'] }), sources: [source()] } });
    fireEvent.click(screen.getByText('Start over'));
    expect(startOver).not.toHaveBeenCalled();
    expect(screen.getByText('This clears the plan and the conversation. Your sources stay.')).toBeTruthy();
    fireEvent.click(screen.getByText('Yes, start over'));
    await waitFor(() => expect(current.trjPlans.T1.record!.messages).toEqual([]));
    expect(startOver).toHaveBeenCalledWith('T1');
    expect(current.trjPlans.T1.record!.plan.modules).toEqual([]);
    expect(current.trjPlans.T1.record!.bundleIds).toEqual(['b1']);
    expect(current.trjPlans.T1.sources).toHaveLength(1);
    expect(within(document.body).getByText('syllabus.pdf · 4 pages · 1 passage')).toBeTruthy();
  });
  it('the second click is a Cancel away: nothing is cleared', () => {
    show(planned(mod('m1')));
    fireEvent.click(screen.getByText('Start over'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Start over')).toBeTruthy();
    expect(startOver).not.toHaveBeenCalled();
  });
});
