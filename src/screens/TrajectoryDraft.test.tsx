// @vitest-environment jsdom
// "Draft with AI" on placeholder steps: in the step's drawer and on the plan's module cards; honest status from My contributions; View as shows nothing.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import type { Trajectory, TrjStep } from '../logic/trajectory';
import { blankTrajectory } from '../logic/trajectoryEdit';
import { emptyPlan } from '../logic/trajectoryPlan';
import type { PlanModule } from '../logic/trajectoryPlan';
import { visibleSteps, studioById } from '../logic/studios';
import { cfg, person, systemAdmin } from '../test/harness';
import type { Access, AppState } from '../types';
import AdminMappingScreen from './Mapping';

vi.mock('../lib/trajectoryStore', async (orig) => ({ ...(await orig<object>()), saveTrajectorySoon: vi.fn() }));
vi.mock('../lib/planStore', async (orig) => ({ ...(await orig<object>()), savePlanSoon: vi.fn(), loadPlan: vi.fn(async () => ({ record: null, sources: [] })) }));

let current: AppState, newest: Logic;
class LatestLogic extends Logic { latest = () => newest; }
function Live({ state, access, readOnly = false }: { state: Partial<AppState>; access: Access; readOnly?: boolean }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), ...state }));
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const logic = new LatestLogic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, access, person({ readOnly }), async () => {}, async () => {});
  useEffect(() => { current = st; newest = logic; });
  const vm = logic.renderVals();
  return <><AdminMappingScreen vm={vm} />{vm.toast && <div role="status">{vm.toast}</div>}</>;
}

const make = (id: string, from: string, over: Partial<TrjStep> = {}): TrjStep => ({ id, k: 'make', title: 'Cards ' + id, fmt: 'Flash cards', hours: 2, win: 3, req: true, pre: null, from, ...over });
const steps = (): TrjStep[] => [make('s1', 'p:m1'), make('s2', 'p:m2'), make('s3', 'p:m3'), { id: 'e1', k: 'evidence', title: 'Log it', hours: 0, win: 4, req: true, pre: null }];
const trajectory = (st: TrjStep[] = steps()): Trajectory => ({ ...blankTrajectory('Audit'), id: 'T1', name: 'Tax certificate', credential: 'Certified adviser', issuer: 'ITAA', months: 12, steps: st });
const mod = (id: string): PlanModule => ({ id, title: 'Module ' + id, depth: 'applied', goals: ['Know ' + id], hours: 2, material: [{ kind: 'studio', format: 'Flash cards', reason: 'r' }], sources: [], checks: [], accepted: true });
const own = (id: string, status: string, extra: Record<string, unknown> = {}) => ({ id, author_id: 'u1', status, ...extra }) as never;
const show = (state: Partial<AppState> = {}, t = trajectory(), access: Access = systemAdmin(), readOnly = false) =>
  render(<Live readOnly={readOnly} access={access} state={{ screen: 'adminMap', mapMode: 'traj', trjs: [t], trjSel: t.id, trjUsed: [], aiLive: [],
    create: { contributions: [], reviews: [], rules: [], policies: [], peers: 0 },
    trjPanel: { open: false, say: '', focus: null, editing: null, kbq: '', confirm: false, applying: false },
    trjPlans: { T1: { record: { trajectoryId: 'T1', plan: { ...emptyPlan(), modules: [mod('m1'), mod('m2'), mod('m3')] }, messages: [], bundleIds: [], updatedAt: null }, sources: [] } }, ...state }} />);
const panel = { open: true, say: '', focus: null, editing: null, kbq: '', confirm: false, applying: false };
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('Draft with AI in the step drawer', () => {
  it('a make step offers it, and an evidence step never does', () => {
    show({ trjStep: 's1' });
    expect(screen.getByRole('button', { name: 'Draft with AI' })).toBeTruthy();
    cleanup();
    show({ trjStep: 'e1' });
    expect(screen.queryByRole('button', { name: /Draft with AI/ })).toBeNull();
  });
  it('opens Create & share at the Flash studio\'s Draft step with the module\'s title', async () => {
    show({ trjStep: 's1' });
    await act(async () => { click('Draft with AI'); });
    expect([current.screen, current.createTab, current.studio.view, current.studio.step]).toEqual(['create', 'new', 'studio', visibleSteps(studioById('flash')!).indexOf('Draft')]);
    expect(current.nw.title).toBe('Module m1');
    expect(current.nw.brief?.stepId).toBe('s1');
  });
  it('a step whose cid is the admin\'s own draft shows it, with its status', () => {
    show({ trjStep: 's1', create: { contributions: [own('c1', 'draft')], reviews: [], rules: [], policies: [], peers: 0 } }, trajectory([make('s1', 'p:m1', { cid: 'c1' })]));
    expect(screen.getByRole('button', { name: 'Open the draft · Draft' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Draft with AI' })).toBeNull();
    cleanup();
    show({ trjStep: 's1', create: { contributions: [own('c1', 'review')], reviews: [], rules: [], policies: [], peers: 0 } }, trajectory([make('s1', 'p:m1', { cid: 'c1' })]));
    expect(screen.getByRole('button', { name: 'Open the draft · In review' })).toBeTruthy();
    expect(screen.getAllByText('Draft in review').length).toBeGreaterThan(0);
  });
  it('a step whose cid is not one of the admin\'s own drafts is taken: no Draft with AI, and it says so', () => {
    show({ trjStep: 's1' }, trajectory([make('s1', 'p:m1', { cid: 'someone-elses' })]));
    expect(screen.queryByRole('button', { name: /Draft with AI/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Open the draft/ })).toBeNull();
    expect(screen.getAllByText('A draft is already linked to this placeholder · not one of yours').length).toBeGreaterThan(0);
  });
  it('opens the draft in Create & share', async () => {
    show({ trjStep: 's1', create: { contributions: [own('c1', 'draft', { type: 'Flash cards', title: 'T', domain: 'prof', level: 3, audience_stage: 'Consultant', takeaway: '', outline: '', sources: [], items: null, shape: null, studio: 'flash', for_trajectory: 'T1', for_step: 's1', bundle_ids: [] })], reviews: [], rules: [], policies: [], peers: 0 } }, trajectory([make('s1', 'p:m1', { cid: 'c1' })]));
    await act(async () => { click('Open the draft · Draft'); });
    expect([current.screen, current.editing, current.nw.brief?.stepId]).toEqual(['create', 'c1', 's1']);
  });
  it('is not there in View as', () => {
    show({ trjStep: 's1' }, trajectory(), systemAdmin(), true);
    expect(screen.queryByRole('button', { name: /Draft with AI/ })).toBeNull();
  });
});

describe('Draft all with AI on the plan', () => {
  it('offers to draft all the placeholders, and shows how far it is while it runs', () => {
    show({ trjPanel: panel });
    expect(screen.getByRole('button', { name: 'Draft all 3 with AI' })).toBeTruthy();
    cleanup();
    show({ trjPanel: panel, trjAi: { busy: 'draft', error: null, drafting: { done: 1, total: 3 } } });
    expect(screen.getByText('Drafting 2 of 3')).toBeTruthy();
  });
  it('counts only the placeholders that are free: one that holds another editor\'s draft is not in "Draft all"', () => {
    show({ trjPanel: panel }, trajectory([make('s1', 'p:m1', { cid: 'someone-elses' }), make('s2', 'p:m2'), make('s3', 'p:m3')]));
    expect(screen.getByRole('button', { name: 'Draft all 2 with AI' })).toBeTruthy();
  });
  it('shows each module\'s placeholder with its own button', () => {
    show({ trjPanel: panel });
    expect(screen.getAllByRole('button', { name: /^Draft with AI/ }).length).toBeGreaterThanOrEqual(3);
  });
  it('is not there in View as', () => {
    show({ trjPanel: panel }, trajectory(), systemAdmin(), true);
    expect(screen.queryByRole('button', { name: /Draft all/ })).toBeNull();
  });
});
