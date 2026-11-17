// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../lib/trajectoryStore';
import type { Subject } from '../lib/useSubject';
import type { Member } from '../logic/team';
import { blankTrajectory } from '../logic/trajectoryEdit';
import type { Trajectory } from '../logic/trajectory';
import { emptyData, flush, harness, person, stubWindow } from '../test/harness';
import TeamScreen from './Team';

vi.mock('../lib/trajectoryStore', async (orig) => ({ ...(await orig<object>()), decideTrajectory: vi.fn() }));
const t: Trajectory = { ...blankTrajectory('Audit'), id: 'T1', name: 'Tax adviser', issuer: 'ITAA', status: 'live', enrol: 'approval',
  steps: [{ id: 's1', k: 'evidence', title: 'Portfolio', win: 6, req: true, pre: null }] };
const kim = (steps = {}): Member => ({ id: 'm1', name: 'Kim Learner', stage: 'Consultant', businessLine: 'Audit', data: emptyData(),
  trj: { enrols: { T1: { status: 'enrolled', start_month: 2026 * 12 + 9, steps } }, creds: [] } });

beforeEach(() => { vi.clearAllMocks(); stubWindow(); vi.mocked(store.decideTrajectory).mockResolvedValue({ result: 'done', error: null }); });
afterEach(cleanup);

const open = (members: Member[], subject?: Subject) => {
  const h = harness({ subject, state: { screen: 'team', teamTab: 'trj', trjs: [t] } });
  const refresh = vi.fn(async () => {});
  render(<TeamScreen vm={h.vm()} members={members} onRefresh={refresh} onOpen={vi.fn()} />);
  return { h, refresh };
};

describe('the Certifications tab', () => {
  it('shows the learner\'s proof, with a link that opens safely in a new tab', () => {
    open([kim({ s1: { state: 'submitted', link: 'https://example.com/p', note: 'My notes' } })]);
    expect(screen.getByText('Waiting for you · 1')).toBeTruthy();
    expect(screen.getByText('My notes')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'https://example.com/p' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
  it('renders an unsafe link as text and says when certifications did not load', () => {
    open([{ ...kim({ s1: { state: 'submitted', link: 'javascript:alert(1)' } }) }, { ...kim(), id: 'm2', name: 'Lee Other', trj: undefined }]);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeTruthy();
    expect(screen.getByText('Certifications did not load for Lee Other.')).toBeTruthy();
  });
  it('approves and reloads that person', async () => {
    const { refresh } = open([kim({ s1: { state: 'submitted', note: 'x' } })]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await flush();
    expect(store.decideTrajectory).toHaveBeenCalledWith('m1', 'T1', 's1', 'approve');
    expect(refresh).toHaveBeenCalledWith('m1');
  });
  it('lists the person in the progress table', () => {
    open([kim()]);
    expect(screen.getByText('Nothing waiting. New requests show up here.')).toBeTruthy();
    expect(screen.getByText('0 of 1 required steps')).toBeTruthy();
    expect(screen.getByText('On track')).toBeTruthy();
  });
  it('shows no buttons while viewing as someone else', () => {
    open([kim({ s1: { state: 'submitted', note: 'x' } })], person({ readOnly: true }));
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Talk first' })).toBeNull();
  });
});

describe('the person zoom', () => {
  it('lists the trajectories mapped to the viewed person', () => {
    const mapped: Trajectory = { ...t, maps: [['Audit', 'Consultant', 'mandatory']] };
    const h = harness({ state: { trjs: [mapped] }, subject: person({ businessLine: 'Audit' }) });
    expect(h.vm().pz.trjRows[0]).toMatch(/^Tax adviser via Audit · mandatory · /);
  });
});
