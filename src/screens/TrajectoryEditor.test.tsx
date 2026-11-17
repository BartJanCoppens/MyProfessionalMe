// @vitest-environment jsdom
// The trajectory editor as an admin sees it in curriculum mapping: the tab, the list, steps, mapping, the Live rule and the ◆ on the grid.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import * as store from '../lib/trajectoryStore';
import type { Trajectory } from '../logic/trajectory';
import { blankTrajectory } from '../logic/trajectoryEdit';
import { cfg, domainAdmin, person, systemAdmin } from '../test/harness';
import type { Access, AppState } from '../types';
import AdminMappingScreen from './Mapping';

vi.mock('../lib/trajectoryStore', async (orig) => ({ ...(await orig<object>()), createTrajectory: vi.fn(), saveTrajectorySoon: vi.fn(), saveTrajectoryNow: vi.fn() }));

let current: AppState;
function Live({ state, access }: { state: Partial<AppState>; access: Access }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), ...state }));
  useEffect(() => { current = st; });
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, access, person(), async () => {}, async () => {}).renderVals();
  return <><AdminMappingScreen vm={vm} />{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const trajectory = (over: Partial<Trajectory> = {}): Trajectory => ({
  ...blankTrajectory('Audit'), id: 'T1', name: 'Tax certificate', credential: 'Certified adviser', issuer: 'ITAA',
  steps: [{ id: 's1', k: 'learn', lid: 'L1', win: 3, req: true, pre: null }, { id: 's2', k: 'exam', title: 'Final exam', hours: 2, win: 12, req: true, pre: 's1' }], ...over,
});
const show = (trjs: Trajectory[], state: Partial<AppState> = {}, access: Access = systemAdmin()) =>
  render(<Live state={{ screen: 'adminMap', mapMode: 'traj', trjs, trjSel: trjs[0]?.id ?? null, ...state }} access={access} />);

beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('the trajectory editor', () => {
  it('opens from the tab and shows the list and the editor', () => {
    show([trajectory()], { mapMode: 'learn' });
    fireEvent.click(screen.getByRole('button', { name: /Certification trajectories · 1/ }));
    expect(current.mapMode).toBe('traj');
    expect(screen.getByText('Trajectories · 1')).toBeTruthy();
    expect(screen.getByDisplayValue('Tax certificate')).toBeTruthy();
    expect(screen.getAllByText('Final exam').length).toBe(2);
  });
  it('adds an exam step and opens its editor', () => {
    show([trajectory()]);
    fireEvent.click(screen.getByRole('button', { name: '+ Exam' }));
    expect(current.trjs[0].steps.map((s) => s.id).slice(0, 2)).toEqual(['s1', 's2']);
    expect(current.trjs[0].steps).toHaveLength(3);
    expect(screen.getByText('Step 3 · Exam')).toBeTruthy();
    expect(vi.mocked(store.saveTrajectorySoon)).toHaveBeenCalled();
  });
  it('moves a step down and removes one', () => {
    show([trajectory({ steps: [{ id: 's1', k: 'evidence', title: 'First', win: 1, req: true, pre: null }, { id: 's2', k: 'evidence', title: 'Second', win: 1, req: true, pre: null }] })]);
    fireEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    expect(current.trjs[0].steps.map((s) => s.id)).toEqual(['s2', 's1']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(current.trjs[0].steps.map((s) => s.id)).toEqual(['s1']);
  });
  it('maps an audience and shows an ambition audience as suggested only', () => {
    show([trajectory({ maps: [['amb:sust', 'Manager', 'advised']] })]);
    expect(screen.getByText('Suggested only')).toBeTruthy();
  });
  it('disables Live for a Domain Admin on a trajectory with a mandatory map', () => {
    show([trajectory({ enrol: 'auto', maps: [['Audit', 'Manager', 'mandatory']] })], {}, domainAdmin(['Audit']));
    expect((screen.getByRole('button', { name: 'Live' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('lists the warnings and draws the learner\'s lane', () => {
    show([trajectory({ credential: '' })]);
    expect(screen.getByText('Name the credential people earn.')).toBeTruthy();
    expect(screen.getByText(/Learner's eye · the lane/)).toBeTruthy();
    expect(screen.getAllByText('Credential')).toHaveLength(2);
  });
  it('marks coverage cells with the trajectory count', () => {
    show([trajectory({ maps: [['Audit', 'Manager', 'advised']] })], { mapMode: 'learn' });
    expect(screen.getByText('◆1')).toBeTruthy();
  });
});
