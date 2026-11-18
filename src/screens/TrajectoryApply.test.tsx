// @vitest-environment jsdom
// Apply in the Build with AI panel: the button and why it is off, the confirmation, one write path with the debounced save, the line rule, and View as.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import { saveTrajectorySoon } from '../lib/trajectoryStore';
import type { Trajectory } from '../logic/trajectory';
import { blankTrajectory } from '../logic/trajectoryEdit';
import { emptyPlan } from '../logic/trajectoryPlan';
import type { PlanModule, PlanRecord } from '../logic/trajectoryPlan';
import { cfg, domainAdmin, person, systemAdmin } from '../test/harness';
import type { Access, AppState } from '../types';
import { applyToTrajectory } from '../trajectoryApply';
import AdminMappingScreen from './Mapping';

vi.mock('../lib/trajectoryStore', async (orig) => ({ ...(await orig<object>()), saveTrajectorySoon: vi.fn() }));
vi.mock('../lib/planStore', async (orig) => ({ ...(await orig<object>()), savePlanSoon: vi.fn(), loadPlan: vi.fn(async () => ({ record: null, sources: [] })) }));
const save = vi.mocked(saveTrajectorySoon);

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

const trajectory = (over: Partial<Trajectory> = {}): Trajectory => ({ ...blankTrajectory('Audit'), id: 'T1', name: 'Tax certificate', credential: 'Certified adviser', issuer: 'ITAA', months: 12, steps: [{ id: 's1', k: 'evidence', title: 'Log', hours: 0, win: 1, req: true, pre: null }], ...over });
const mod = (id: string, over: Partial<PlanModule> = {}): PlanModule => ({ id, title: 'Module ' + id, depth: 'applied', goals: [], hours: 6, material: [{ kind: 'studio', format: 'Flash cards', reason: 'r' }], sources: [], checks: [], accepted: true, ...over });
const record = (modules: PlanModule[]): PlanRecord => ({ trajectoryId: 'T1', plan: { ...emptyPlan(), modules, finalExam: { title: 'Final assessment', hours: 3, reason: 'r' } }, messages: [], bundleIds: [], updatedAt: null });
const show = (modules: PlanModule[], state: Partial<AppState> = {}, t = trajectory(), access: Access = systemAdmin(), readOnly = false) =>
  render(<Live readOnly={readOnly} access={access} state={{ screen: 'adminMap', mapMode: 'traj', trjs: [t], trjSel: t.id, trjUsed: [], aiLive: ['trajectory_ai'],
    trjPanel: { open: true, say: '', focus: null, editing: null, kbq: '', confirm: false, applying: false }, trjPlans: { [t.id]: { record: record(modules), sources: [] } }, ...state }} />);
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('the Apply button', () => {
  it('counts the accepted modules', () => {
    show([mod('m1'), mod('m2'), mod('m3', { accepted: false })]);
    expect(screen.getByRole('button', { name: 'Apply 2 accepted modules' })).toBeTruthy();
  });
  it('is off with "Accept a module first" when none is accepted, and with "Wait for the AI to answer" while it works', () => {
    show([mod('m1', { accepted: false })]);
    expect((screen.getByRole('button', { name: /^Apply/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Accept a module first')).toBeTruthy();
    cleanup();
    show([mod('m1')], { trjAi: { busy: 'send', error: null } });
    expect((screen.getByRole('button', { name: 'Apply 1 accepted module' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Wait for the AI to answer')).toBeTruthy();
  });
  it('is not there in View as', () => {
    show([mod('m1')], {}, trajectory(), systemAdmin(), true);
    expect(screen.queryByRole('button', { name: /^Apply/ })).toBeNull();
  });
});

describe('Apply', () => {
  it('asks first, listing what is added, and changes nothing until confirmed', () => {
    show([mod('m1', { checks: ['signoff'] }), mod('m2')]);
    click('Apply 2 accepted modules');
    expect(screen.getByText('Apply adds steps; it never removes or changes one.')).toBeTruthy();
    expect(screen.getByText('Steps to add · 4')).toBeTruthy();
    expect(current.trjs[0].steps).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
    click('Cancel');
    expect(current.trjs[0].steps).toHaveLength(1);
  });
  it('writes the steps through the one save path, says what it did, and marks the modules Applied', () => {
    show([mod('m1', { checks: ['signoff'] }), mod('m2')]);
    click('Apply 2 accepted modules'); click('Add 4 steps');
    expect(current.trjs[0].steps.map((s) => s.k)).toEqual(['evidence', 'make', 'check', 'make', 'exam']);
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('Applied · 4 steps added');
    expect(screen.getAllByText('Applied')).toHaveLength(2);
  });
  it('adds the steps once when Apply is run twice', async () => {
    show([mod('m1')]);
    click('Apply 1 accepted module');
    await act(async () => { applyToTrajectory(newest, 'T1'); applyToTrajectory(newest, 'T1'); });
    expect(current.trjs[0].steps.filter((s) => s.from === 'p:m1')).toHaveLength(1);
    expect(current.trjs[0].steps.filter((s) => s.k === 'exam')).toHaveLength(1);
  });
  it('a title edit right after Apply is saved together with the steps (the save reads the latest trajectory)', () => {
    show([mod('m1')]);
    click('Apply 1 accepted module'); click(/^Add \d+ steps?$/);
    fireEvent.change(screen.getByLabelText('Trajectory name'), { target: { value: 'Renamed' } });
    const last = save.mock.calls[save.mock.calls.length - 1], saved = last[1]();
    expect(saved?.name).toBe('Renamed');
    expect(saved?.steps.some((s) => s.from === 'p:m1')).toBe(true);
  });
  it('a Domain Admin of another line is refused in words, before anything changes or is saved', () => {
    show([mod('m1')], {}, trajectory({ business_line: 'Consulting' }), domainAdmin(['Audit']));
    act(() => { applyToTrajectory(newest, 'T1'); });
    expect(screen.getByRole('status').textContent).toBe('Not changed · you can only change trajectories of your own business line');
    expect(current.trjs[0].steps).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
  });
  it('does nothing in View as', () => {
    show([mod('m1')], {}, trajectory(), systemAdmin(), true);
    act(() => { applyToTrajectory(newest, 'T1'); });
    expect(current.trjs[0].steps).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
  });
  it('skips what is there and says so in the toast', () => {
    show([mod('m1')], {}, trajectory({ steps: [{ id: 's1', k: 'make', title: 'Module m1', fmt: 'Flash cards', hours: 6, win: 6, req: true, pre: null }] }));
    click('Apply 1 accepted module');
    expect(screen.getByText(/Module m1 · A step with this title is already in the trajectory/)).toBeTruthy();
  });
});
