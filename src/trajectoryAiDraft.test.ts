// @vitest-environment jsdom
// "Draft with AI" from placeholder steps (Studios Phase 7, Task 7.5): one studio opened with the module's brief, or several placeholders drafted one
// after the other (one AI call each, stopping at the daily limit), each saved as a draft in the admin's name and linked to its step. Stores are faked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { askAi } from './lib/aiStore';
import { saveDraft } from './lib/contributionStore';
import { domainAdmin, harness, person } from './test/harness';
import { blankTrajectory } from './logic/trajectoryEdit';
import { emptyPlan } from './logic/trajectoryPlan';
import type { PlanModule } from './logic/trajectoryPlan';
import type { Trajectory, TrjStep } from './logic/trajectory';
import { visibleSteps } from './logic/studios';
import { studioById } from './logic/studios';
import { draftPlaceholders, openStudioFor } from './trajectoryAiDraft';
import type { Bundle } from './types';
import type { AppState } from './types';

vi.mock('./lib/aiStore', async (orig) => ({ ...(await orig<object>()), askAi: vi.fn() }));
vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(async () => ({ contributions: [], reviews: [], rules: [], policies: [], peers: 0 })), saveDraft: vi.fn(),
  removeDraft: vi.fn(), submitContribution: vi.fn(), checkContribution: vi.fn(), decideReview: vi.fn(),
}));
vi.mock('./lib/trajectoryStore', async (orig) => ({ ...(await orig<object>()), saveTrajectorySoon: vi.fn() }));
const ask = vi.mocked(askAi), save = vi.mocked(saveDraft);

const bundle: Bundle = { id: 'b1', name: 'VAT basics', owner: 'x', topic: 't', topics2: [], desc: '', access: 'all', fresh: '12', status: 'live', updated: '', usedBy: 0, tags: [], sugg: [], models: [], concepts: [],
  sources: [['Guide', 'upload', '1 file', 2, '1 Jan', 'internal']], chunks: [[0, 'VAT on exports is zero rated.'], [0, 'Books are taxed at six percent.']] };
const mod = (id: string, title: string, fmt: string): PlanModule => ({ id, title, depth: 'applied', goals: ['Goal of ' + title], hours: 2, material: [{ kind: 'studio', format: fmt, reason: 'r' }],
  sources: [{ ref: { kind: 'kb', bundleId: 'b1', chunk: 0 }, label: 'Guide · VAT basics', quote: 'q' }], checks: [], accepted: true });
const make = (id: string, fmt: string, from: string): TrjStep => ({ id, k: 'make', title: 'Title ' + id, fmt, hours: 2, win: 3, req: true, pre: null, from });
const T: Trajectory = { ...blankTrajectory('Consulting'), id: 'T1', name: 'VAT track', steps: [make('m1', 'Flash cards', 'p:a'), make('m2', 'Job aid', 'p:b'), make('m3', 'Animated flow', 'p:c')] };
const record = { trajectoryId: 'T1', plan: { ...emptyPlan(), modules: [mod('a', 'VAT cards', 'Flash cards'), mod('b', 'VAT aid', 'Job aid'), mod('c', 'VAT flow', 'Animated flow')] }, messages: [], bundleIds: [], updatedAt: null };
// What the fake provider answers per use, and for the studio use per format asked (the request names it).
const answer = (use: string, req: { messages: { content: unknown }[] }) => {
  const asked = JSON.stringify(req.messages[0].content);
  const text = use === 'draft_items' ? JSON.stringify({ cards: [{ front: 'Rate?', back: '21 %' }] })
    : JSON.stringify({ items: asked.includes('Job aid') ? [['Before', 'a'], ['Before', 'b'], ['During', 'c'], ['After', 'd']] : [['Stage 1', 'a'], ['Stage 2', 'b'], ['Stage 3', 'c']] });
  return { text, cut: false };
};
const setup = (state: Partial<AppState> = {}, trj: Trajectory = T, subject = person({ id: 'u1' }), lines = ['Consulting']) => harness({ subject, access: { ...domainAdmin(lines), userId: 'u1' }, config: { liveAssistant: true },
  state: { trjs: [trj], trjSel: 'T1', bundles: [bundle], aiLive: ['draft_items', 'studio_draft'], trjPlans: { T1: { record, sources: [] } }, create: { contributions: [], reviews: [], rules: [], policies: [], peers: 0 }, ...state } });

let n = 0;
beforeEach(() => { vi.clearAllMocks(); n = 0; save.mockImplementation(async () => 'c' + ++n); ask.mockImplementation(async (use, req) => answer(use, req)); });

describe('draftPlaceholders', () => {
  it('drafts each placeholder in step order, one AI call each, saves it in a studio without a creation rule and links the step', async () => {
    const h = setup();
    const r = await draftPlaceholders(h.L(), 'T1', ['m3', 'm1', 'm2']);
    expect(r.drafted).toBe(3);
    expect(ask).toHaveBeenCalledTimes(3);
    expect(save.mock.calls.map((c) => [c[0].type, c[0].studio, c[0].for_step, c[0].for_trajectory, c[0].title, c[0].business_line])).toEqual([
      ['Flash cards', 'flash', 'm1', 'T1', 'VAT cards', 'Consulting'], ['Job aid', 'aid', 'm2', 'T1', 'VAT aid', 'Consulting'], ['Animated flow', 'motion', 'm3', 'T1', 'VAT flow', 'Consulting']]);
    expect(save.mock.calls.every((c) => c[1] === null || c[1] === undefined)).toBe(true);
    expect(save.mock.calls.map((c) => c[0].ai_assisted)).toEqual([true, true, true]);
    expect(h.state.trjs[0].steps.map((s) => s.cid)).toEqual(['c1', 'c2', 'c3']);
    expect(h.state.trjAi.busy).toBeNull();
    expect(h.state.trjAi.drafting ?? null).toBeNull();
  });
  it('shows its progress while it runs', async () => {
    const h = setup();
    await draftPlaceholders(h.L(), 'T1', ['m1', 'm2', 'm3']);
    const seen = h.patches.flatMap((p) => (p.trjAi?.drafting ? [p.trjAi.drafting] : []));
    expect(seen).toEqual([{ done: 0, total: 3 }, { done: 1, total: 3 }, { done: 2, total: 3 }, { done: 3, total: 3 }]);
  });
  it('stops at the first limit error and says how far it got', async () => {
    ask.mockImplementation(async (use, req) => { if (ask.mock.calls.length === 2) throw new Error('Daily AI limit reached · try again tomorrow'); return answer(use, req); });
    const h = setup();
    const r = await draftPlaceholders(h.L(), 'T1', ['m1', 'm2', 'm3']);
    expect(r.drafted).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(r.notes).toContain('Drafted 1 of 3 · Daily AI limit reached · try again tomorrow');
    expect(h.lastToast()).toBe('Drafted 1 of 3 · Daily AI limit reached · try again tomorrow');
    expect(h.state.trjAi.busy).toBeNull();
  });
  it('notes a placeholder no studio makes and goes on with the next', async () => {
    const t = { ...T, steps: [make('m1', 'Book', 'p:a'), T.steps[0]].map((s, i) => (i ? { ...s, id: 'm2' } : s)) };
    const h = setup({}, t);
    const r = await draftPlaceholders(h.L(), 'T1', ['m1', 'm2']);
    expect(r.drafted).toBe(1);
    expect(r.notes[0]).toBe('Title m1: No studio makes Book · add it as evidence instead');
  });
  it('saves the Game placeholder with no rows when the AI is off, and says to build it in the Game Studio', async () => {
    const t = { ...T, steps: [make('m1', 'Game', 'p:a')] };
    const h = setup({ aiLive: [], trjPlans: { T1: { record: { ...record, plan: { ...record.plan, modules: [mod('a', 'VAT game', 'Game')] } }, sources: [] } } }, t);
    const r = await draftPlaceholders(h.L(), 'T1', ['m1']);
    expect(r.drafted).toBe(1);
    expect(save.mock.calls[0][0].items).toEqual([]);
    expect(r.notes).toContain('Title m1: Build the game in the Game Studio');
  });
  it('with the studio use off the rows are saved as scripted from the cited passages, never marked AI', async () => {
    const h = setup({ aiLive: ['draft_items'] });
    await draftPlaceholders(h.L(), 'T1', ['m2']);
    expect(ask).not.toHaveBeenCalled();
    expect(save.mock.calls[0][0].ai_assisted).toBe(false);
    expect((save.mock.calls[0][0].items as unknown[]).length).toBeGreaterThan(0);
  });
  it('does nothing in View as, while busy, or for a trajectory the admin cannot change', async () => {
    const viewing = setup({}, T, person({ id: 'other', readOnly: true }));
    await draftPlaceholders(viewing.L(), 'T1', ['m1']);
    const busy = setup({ trjAi: { busy: 'send', error: null } });
    await draftPlaceholders(busy.L(), 'T1', ['m1']);
    const audit = setup({}, T, person({ id: 'u1' }), ['Audit']);
    const r = await draftPlaceholders(audit.L(), 'T1', ['m1']);
    expect(save).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    expect(r.drafted).toBe(0);
  });
});

describe('openStudioFor', () => {
  it('opens Create & share at the Flash studio\'s Draft step with the module\'s brief, its cited bundle and an AI draft', async () => {
    const h = setup();
    await openStudioFor(h.L(), 'T1', 'm1');
    const s = h.state;
    expect([s.screen, s.createTab, s.editing, s.studio.view, s.studio.id, s.studio.step]).toEqual(['create', 'new', null, 'studio', undefined, visibleSteps(studioById('flash')!).indexOf('Draft')]);
    expect([s.nw.title, s.nw.type, s.nw.take, s.nw.brief?.depth, s.nwKb]).toEqual(['VAT cards', 'Flash cards', 'Goal of VAT cards', 'applied', ['b1']]);
    expect(s.nw.items?.how).toBe('ai');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(ask.mock.calls[0][1])).toContain('Learning goals');
  });
  it('opens another studio at its own Draft step', async () => {
    const h = setup();
    await openStudioFor(h.L(), 'T1', 'm2');
    expect([h.state.studio.id, h.state.studio.step]).toEqual(['aid', visibleSteps(studioById('aid')!).indexOf('Draft')]);
    expect(h.state.nw.items?.how).toBe('ai');
  });
  it('says why instead when the admin may not change the trajectory, and does nothing in View as or while a draft is busy', async () => {
    const audit = setup({}, T, person({ id: 'u1' }), ['Audit']);
    await openStudioFor(audit.L(), 'T1', 'm1');
    expect(audit.lastToast()).toBe('Not changed · you can only change trajectories of your own business line');
    expect(audit.state.screen).not.toBe('create');
    const viewing = setup({}, T, person({ id: 'other', readOnly: true }));
    await openStudioFor(viewing.L(), 'T1', 'm1');
    const busy = setup({ nwAiBusy: true });
    await openStudioFor(busy.L(), 'T1', 'm1');
    expect([viewing.state.screen, busy.state.screen].includes('create')).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
});
