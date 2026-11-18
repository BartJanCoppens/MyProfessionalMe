// @vitest-environment jsdom
// One message to the Trajectory AI: the guards, what is sent (bounded), and where the answer lands (the trajectory the call was for, merged
// onto the plan as it is when the answer arrives). The provider call and the plan store are faked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askAi } from './lib/aiStore';
import { savePlanSoon } from './lib/planStore';
import { deferred, flush, harness, person, systemAdmin } from './test/harness';
import { blankTrajectory } from './logic/trajectoryEdit';
import { emptyPlan, PLAN_CAPS } from './logic/trajectoryPlan';
import type { PlanModule, PlanRecord, TrjPlanState } from './logic/trajectoryPlan';
import { PLAN_ASK, requestChars } from './logic/planPrompt';
import { sendToPlan } from './trajectoryAiSend';
import type { AppState } from './types';

vi.mock('./lib/aiStore', async (orig) => ({ ...(await orig<object>()), askAi: vi.fn() }));
vi.mock('./lib/planStore', async (orig) => ({ ...(await orig<object>()), savePlanSoon: vi.fn() }));
const ask = vi.mocked(askAi), save = vi.mocked(savePlanSoon);

const T1 = { ...blankTrajectory('Audit'), id: 'T1', name: 'Tax certificate', credential: 'Certified adviser', issuer: 'ITAA' }, T2 = { ...T1, id: 'T2', name: 'Second' };
const mod = (id: string, over: Partial<PlanModule> = {}): PlanModule => ({ id, title: 'Module ' + id, depth: 'foundation', goals: ['g'], hours: 2, material: [], sources: [], checks: [], accepted: false, ...over });
const record = (over: Partial<PlanRecord> = {}): PlanRecord => ({ trajectoryId: 'T1', plan: emptyPlan(), messages: [], bundleIds: [], updatedAt: null, ...over });
const reply = (over: Record<string, unknown> = {}) => ({ text: JSON.stringify({ reply: 'Here is a plan.', questions: [], brief: null, modules: [{ title: 'VAT basics', depth: 'foundation', goals: ['g'], hours: 2, material: [], sources: ['P99'], checks: [] }], ...over }), cut: false });
const setup = (state: Partial<AppState> = {}, plans: Record<string, TrjPlanState> = { T1: { record: record(), sources: [] } }, subject = person({ id: 'u1' })) =>
  harness({ subject, access: systemAdmin('u1'), config: { liveAssistant: true }, state: { trjs: [T1, T2], trjSel: 'T1', aiLive: ['trajectory_ai'], trjPlans: plans, ...state } });
const plan = (h: ReturnType<typeof setup>, id = 'T1') => h.state.trjPlans[id]?.record;

beforeEach(() => { ask.mockReset(); save.mockReset(); });

describe('sendToPlan', () => {
  it('asks once under the trajectory_ai use, appends both messages, adds the modules not accepted and saves', async () => {
    ask.mockResolvedValue(reply());
    const h = setup();
    await sendToPlan(h.L(), 'T1', 'Plan a VAT track', 'talk', null);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toBe('trajectory_ai');
    expect(plan(h)!.messages.map((m) => [m.role, m.text])).toEqual([['admin', 'Plan a VAT track'], ['ai', 'Here is a plan.']]);
    expect(plan(h)!.plan.modules.map((m) => [m.title, m.accepted])).toEqual([['VAT basics', false]]);
    expect(plan(h)!.messages[1].dropped).toEqual({ sources: 1, learnings: 0, formats: 0 });
    expect(save).toHaveBeenCalled();
    expect(save.mock.calls.at(-1)![0].messages).toHaveLength(2);
    expect(h.state.trjAi).toEqual({ busy: null, error: null });
  });
  it('sends a request within 50,000 characters even with a full conversation', async () => {
    ask.mockResolvedValue(reply());
    const messages = Array.from({ length: PLAN_CAPS.messages }, (_, i) => ({ role: i % 2 ? 'ai' as const : 'admin' as const, text: 'x'.repeat(PLAN_CAPS.messageChars), at: '' }));
    const h = setup({}, { T1: { record: record({ messages }), sources: [] } });
    await sendToPlan(h.L(), 'T1', 'y'.repeat(PLAN_CAPS.messageChars), 'talk', null);
    expect(requestChars(ask.mock.calls[0][1])).toBeLessThanOrEqual(PLAN_ASK.budgetChars);
    expect(plan(h)!.messages.length).toBeLessThanOrEqual(PLAN_CAPS.messages);
  });
  it('makes no call while busy, in View as, when the use is off, or for an empty or over-long message', async () => {
    const busy = setup({ trjAi: { busy: 'send', error: null } });
    await sendToPlan(busy.L(), 'T1', 'hi', 'talk', null);
    await sendToPlan(setup({}, undefined, person({ id: 'other', readOnly: true })).L(), 'T1', 'hi', 'talk', null);
    const off = setup({ aiLive: [] });
    await sendToPlan(off.L(), 'T1', 'hi', 'talk', null);
    const h = setup();
    await sendToPlan(h.L(), 'T1', '   ', 'talk', null);
    await sendToPlan(h.L(), 'T1', 'x'.repeat(PLAN_CAPS.messageChars + 1), 'talk', null);
    expect(ask).not.toHaveBeenCalled();
    expect(off.lastToast()).toBe('Build with AI needs AI: a System Admin switches on Trajectory AI in AI connections');
    expect(h.state.trjAi.error).toMatch(/at most 4,000 characters/);
  });
  it('a second send while one is in flight makes no second call', async () => {
    const gate = deferred<{ text: string; cut: boolean }>();
    ask.mockReturnValue(gate.promise);
    const h = setup();
    const first = sendToPlan(h.L(), 'T1', 'one', 'talk', null);
    await sendToPlan(h.L(), 'T1', 'two', 'talk', null);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(h.state.trjAi.busy).toBe('send');
    gate.resolve(reply());
    await first;
    expect(h.state.trjAi.busy).toBeNull();
  });
  it('an answer that cannot be used adds nothing from the AI and says so; so does a cut one', async () => {
    for (const answer of [{ text: 'not json', cut: false }, { ...reply(), cut: true }, reply({ reply: 'x'.repeat(1300) })]) {
      ask.mockResolvedValueOnce(answer);
      const h = setup();
      await sendToPlan(h.L(), 'T1', 'hi', 'talk', null);
      expect(plan(h)!.messages.map((m) => m.role)).toEqual(['admin']);
      expect(plan(h)!.plan.modules).toEqual([]);
      expect(h.state.trjAi.error).toBe('AI did not return a usable plan · try again');
    }
  });
  it('a daily limit gives the function\'s own text and no scripted plan', async () => {
    ask.mockRejectedValue(new Error('Daily AI limit reached (40 a day per person for this use); try again tomorrow (UTC)'));
    const h = setup();
    await sendToPlan(h.L(), 'T1', 'hi', 'talk', null);
    expect(h.state.trjAi.error).toMatch(/^Daily AI limit reached/);
    expect(plan(h)!.plan.modules).toEqual([]);
    expect(plan(h)!.messages.map((m) => m.role)).toEqual(['admin']);
  });
  it('lands the answer in the trajectory the call was for, not the one on screen', async () => {
    const gate = deferred<{ text: string; cut: boolean }>();
    ask.mockReturnValue(gate.promise);
    const h = setup({}, { T1: { record: record(), sources: [] }, T2: { record: record({ trajectoryId: 'T2' }), sources: [] } });
    const sending = sendToPlan(h.L(), 'T1', 'hi', 'talk', null);
    h.L().setState({ trjSel: 'T2' });
    gate.resolve(reply());
    await sending;
    expect(plan(h, 'T1')!.plan.modules).toHaveLength(1);
    expect(plan(h, 'T2')!.plan.modules).toEqual([]);
    expect(plan(h, 'T2')!.messages).toEqual([]);
    expect(save.mock.calls.at(-1)![0].trajectoryId).toBe('T1');
  });
  it('merges onto the plan as it is when the answer arrives, so what the admin accepted meanwhile stays', async () => {
    const gate = deferred<{ text: string; cut: boolean }>();
    ask.mockReturnValue(gate.promise);
    const m1 = mod('m1', { title: 'VAT basics', goals: ['g'] });
    const h = setup({}, { T1: { record: record({ plan: { ...emptyPlan(), modules: [m1] } }), sources: [] } });
    const sending = sendToPlan(h.L(), 'T1', 'hi', 'talk', null);
    h.L().setState((s) => ({ trjPlans: { ...s.trjPlans, T1: { ...s.trjPlans.T1, record: { ...s.trjPlans.T1.record!, plan: { ...s.trjPlans.T1.record!.plan, modules: [{ ...m1, accepted: true }] } } } } }));
    gate.resolve(reply({ modules: [{ id: 'm1', title: 'VAT basics', depth: 'foundation', goals: ['g'], hours: 2, material: [], sources: [], checks: [] }] }));
    await sending;
    expect(plan(h)!.plan.modules.map((m) => [m.id, m.accepted])).toEqual([['m1', true]]);
  });
  it('sends the module asked about, and the full-plan request in propose mode, and notes the focus on the message', async () => {
    ask.mockResolvedValue(reply({ modules: null }));
    const h = setup();
    await sendToPlan(h.L(), 'T1', 'Shorter please', 'talk', 'm2');
    await sendToPlan(h.L(), 'T1', '', 'propose', null);
    expect(ask.mock.calls[0][1].messages[0].content).toContain('About module m2');
    expect(ask.mock.calls[1][1].messages[0].content).toContain('Propose the full plan now');
    expect(plan(h)!.messages.filter((m) => m.role === 'admin').map((m) => [m.text, m.focus])).toEqual([['Shorter please', 'm2'], ['Propose the plan.', undefined]]);
  });
  it('puts the AI\'s questions in its message', async () => {
    ask.mockResolvedValue(reply({ modules: null, questions: ['Which line?', 'How many hours?'] }));
    const h = setup();
    await sendToPlan(h.L(), 'T1', 'hi', 'talk', null);
    expect(plan(h)!.messages[1].text).toBe('Here is a plan.\n\n1. Which line?\n2. How many hours?');
    await flush();
  });
});
