// @vitest-environment jsdom
// The certification layer on My growth map, on the real view-model: the chip, the three views, the dock and what it opens.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import type { Subject } from '../lib/useSubject';
import type { Credential, Enrolment, Trajectory } from '../logic/trajectory';
import { blankTrajectory } from '../logic/trajectoryEdit';
import { cfg, person } from '../test/harness';
import type { AppState } from '../types';
import { certResetPatch } from '../trajectoryMap';
import MapScreen from './Map';

vi.mock('../lib/learnerStore', () => ({ loadLearner: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn() }));
let current: AppState;
function Live({ state, subject }: { state: Partial<AppState>; subject: Subject }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), ...state }));
  useEffect(() => { current = st; });
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, { isSystem: false, domains: [], userId: 'u1' }, subject, async () => {}, async () => {}).renderVals();
  return <MapScreen vm={vm} />;
}
const START = 2026 * 12 + 9;
const enrolled: Enrolment = { status: 'enrolled', start_month: START, steps: {} };
const trj = (over: Partial<Trajectory> = {}): Trajectory => ({
  ...blankTrajectory('Consulting'), id: 'T1', name: 'Tax certificate', credential: 'Certified adviser', issuer: 'ITAA', status: 'live', enrol: 'open', months: 12,
  steps: [{ id: 'a', k: 'learn', lid: 'L1', win: 2, req: true, pre: null }, { id: 'b', k: 'learn', lid: 'L3', win: 6, req: true, pre: 'a' }], ...over,
});
const show = (state: Partial<AppState> = {}, enrols: Record<string, Enrolment> = { T1: enrolled }, creds: Credential[] = [], subject = person()) =>
  render(<Live subject={subject} state={{ trjs: [trj()], trjMine: { userId: subject.id, enrols, creds }, ...state }} />);
const threads = (c: HTMLElement) => c.querySelectorAll('[data-cert="thread"]').length;
const label = () => screen.queryByRole('button', { name: '◆ Tax certificate' });
const chip = () => screen.getByRole('button', { name: /^Certifications/ });

beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(cleanup);

describe('the certification layer on the constellation', () => {
  it('draws a gold thread, the credential diamond and its label for an enrolled trajectory', () => {
    const { container } = show();
    expect(threads(container)).toBe(1);
    expect(container.querySelectorAll('[data-cert="ring"]').length).toBe(2);
    expect(label()).toBeTruthy();
    expect(chip().textContent).toContain('1');
  });
  it('fills the diamond only for a confirmed credential', () => {
    const fill = (c: HTMLElement) => c.querySelector('[data-cert="credential"] polygon')!.getAttribute('fill');
    const a = show({}, { T1: { ...enrolled, steps: {} } });
    expect(fill(a.container)).toBe('#fdf3dc');
    cleanup();
    const cred: Credential = { id: 'c1', user_id: 'u1', name: 'Certified adviser', issuer: 'ITAA', earned_on: '2026-11-01', expires_on: null, link: '', ref: 'x', trajectory_id: 'T1', status: 'confirmed' };
    expect(fill(show({}, { T1: enrolled }, [cred]).container)).toBe('#e0a100');
    cleanup();
    expect(fill(show({}, { T1: enrolled }, [{ ...cred, status: 'waiting' }]).container)).toBe('#fdf3dc');
  });
  it('hides every view of the layer when the Certifications chip is switched off', () => {
    const { container } = show();
    fireEvent.click(chip());
    expect(threads(container)).toBe(0);
    expect(label()).toBeNull();
    expect(screen.queryByRole('button', { name: /My certifications/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Radar' }));
    expect(container.querySelectorAll('[data-cert="radar"]').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Road' }));
    expect(screen.queryByText('◆ Tax certificate')).toBeNull();
    fireEvent.click(chip());
    expect(screen.getByText('◆ Tax certificate')).toBeTruthy();
  });
  it('has no layer, and a zero chip, for a person with no enrolment', () => {
    const { container } = show({}, {});
    expect(threads(container)).toBe(0);
    expect(label()).toBeNull();
    expect(screen.queryByRole('button', { name: /My certifications/ })).toBeNull();
    expect(chip().textContent).toContain('0');
  });
  it('leaves out a request that is still waiting', () => {
    const { container } = show({}, { T1: { ...enrolled, status: 'requested' } });
    expect(threads(container)).toBe(0);
    expect(chip().textContent).toContain('0');
  });
  it('counts a mandatory auto-enrolment that has no row yet', () => {
    const t = trj({ enrol: 'auto', maps: [['Consulting', 'Consultant', 'mandatory']] });
    const { container } = show({ trjs: [t] }, {});
    expect(threads(container)).toBe(1);
  });
  it('opens the trajectory page from the label, with the map as origin', () => {
    show();
    fireEvent.click(label()!);
    expect(current).toMatchObject({ screen: 'trajectory', trjView: 'T1', trjOrigin: 'map' });
  });
  it('shows the layer of the viewed person, read-only', () => {
    const { container } = show({}, { T1: enrolled }, [], person({ readOnly: true }));
    expect(threads(container)).toBe(1);
  });
});

describe('the dock', () => {
  it('lists the trajectories and opens one', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /My certifications/ }));
    expect(screen.getByText('Your certification trajectories')).toBeTruthy();
    expect(screen.getByText('0 of 2 required steps')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Open →/ }));
    expect(current).toMatchObject({ screen: 'trajectory', trjView: 'T1', trjOrigin: 'map' });
  });
  it('closes again and goes with the chip', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /My certifications/ }));
    fireEvent.click(screen.getByRole('button', { name: /Hide my certifications/ }));
    expect(screen.queryByText('Your certification trajectories')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /My certifications/ }));
    fireEvent.click(chip());
    expect(screen.queryByText('Your certification trajectories')).toBeNull();
  });
});

describe('the radar and the road', () => {
  it('draws a polygon and a focusable legend entry per trajectory on the radar', () => {
    const t2 = trj({ id: 'T2', name: 'Second', steps: [{ id: 'a', k: 'learn', lid: 'L1', win: 2, req: true, pre: null }] });
    const { container } = show({ trjs: [trj(), t2] }, { T1: enrolled, T2: enrolled });
    fireEvent.click(screen.getByRole('button', { name: 'Radar' }));
    expect(container.querySelectorAll('[data-cert="radar"]').length).toBe(2);
    const second = screen.getByRole('button', { name: /^◆ Second/ });
    fireEvent.click(second);
    expect(current.certFocus).toBe('T2');
    expect(second.getAttribute('aria-pressed')).toBe('true');
  });
  it('adds a lane with the open steps and the credential on the road', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Road' }));
    expect(screen.getByText('0 of 2 required steps · credential by Oct 2027')).toBeTruthy();
    expect(screen.getByText('◆ Certified adviser')).toBeTruthy();
  });
});

describe('the cert dock is not a focus', () => {
  it('leaves hubs, nodes and clouds at their no-selection opacity', () => {
    const opacities = (c: HTMLElement) => Array.from(c.querySelectorAll('svg g[opacity], svg line[opacity]')).map((e) => e.getAttribute('opacity'));
    const none = show();
    const base = opacities(none.container);
    cleanup();
    const open = show({ sel: { type: 'cert' } });
    expect(opacities(open.container)).toEqual(base);
  });
  it('is cleared, with the radar focus, when the viewed person changes', () => {
    const patch = certResetPatch({ ...initState(cfg), sel: { type: 'cert' }, certFocus: 'T1' });
    expect(patch).toEqual({ certFocus: null, sel: null });
    expect(certResetPatch({ ...initState(cfg), sel: { type: 'hub', id: 'corp' }, certFocus: 'T1' })).toEqual({ certFocus: null });
  });
});
