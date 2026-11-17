// @vitest-environment jsdom
// Industries & technologies: the chip editor on My team (counsellor) and in User management (admins), read-only in View as,
// and what the memberships change (mandatory trajectories in the team table and the person zoom).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as membership from '../lib/membershipStore';
import type { Member } from '../logic/team';
import type { Trajectory } from '../logic/trajectory';
import { blankTrajectory } from '../logic/trajectoryEdit';
import { db, op } from '../test/fakeSupabase';
import { emptyData, flush, harness, person, stubWindow } from '../test/harness';
import type { Access } from '../types';
import Membership from './Membership';
import TeamScreen from './Team';
import UsersScreen from './Users';

vi.mock('../lib/membershipStore', async (orig) => ({ ...(await orig<object>()), setAudience: vi.fn() }));
const set = vi.mocked(membership.setAudience);
const kim = (over: Partial<Member> = {}): Member => ({ id: 'm1', name: 'Kim Learner', stage: 'Consultant', businessLine: 'Audit', data: emptyData(), trj: { enrols: {}, creds: [] }, audiences: ['tec:data'], ...over });
const group = () => screen.getByRole('group', { name: /Industries & technologies/ });

beforeEach(() => { vi.clearAllMocks(); db.reset(); stubWindow(); set.mockResolvedValue({ error: null }); });
afterEach(cleanup);

describe('the chip editor', () => {
  it('shows every industry and technology as a chip and toggles one', async () => {
    const toggle = vi.fn(async () => {});
    render(<Membership v={{ name: 'Kim', audiences: ['tec:data'], canEdit: true, toggle }} />);
    expect(within(group()).getAllByRole('button')).toHaveLength(7);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Data & Azure' })); });
    expect(toggle).toHaveBeenCalledWith('tec:data', false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Healthcare' })); });
    expect(toggle).toHaveBeenCalledWith('ind:health', true);
  });
  it('sends one change at a time', async () => {
    let done = () => {};
    const toggle = vi.fn(() => new Promise<void>((r) => { done = r; }));
    render(<Membership v={{ name: 'Kim', audiences: [], canEdit: true, toggle }} />);
    fireEvent.click(screen.getByRole('button', { name: 'SAP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generative AI' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    await act(async () => { done(); });
    fireEvent.click(screen.getByRole('button', { name: 'Generative AI' }));
    expect(toggle).toHaveBeenCalledTimes(2);
  });
  it('is read-only as plain chips, and says when there is nothing or it did not load', () => {
    const { rerender } = render(<Membership v={{ name: 'Kim', audiences: ['ind:energy'], canEdit: false, toggle: vi.fn() }} />);
    expect(within(group()).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Energy & utilities')).toBeTruthy();
    rerender(<Membership v={{ name: 'Kim', audiences: [], canEdit: false, toggle: vi.fn() }} />);
    expect(screen.getByText('None set')).toBeTruthy();
    rerender(<Membership v={{ name: 'Kim', audiences: undefined, canEdit: true, toggle: vi.fn() }} />);
    expect(screen.getByText('Did not load')).toBeTruthy();
  });
});

describe('My team', () => {
  const roster = (members: Member[], subject = person()) => {
    const h = harness({ subject, state: { screen: 'team', teamTab: 'roster' } });
    const refresh = vi.fn(async () => {});
    render(<TeamScreen vm={h.vm()} members={members} onRefresh={refresh} onOpen={vi.fn()} />);
    return { h, refresh };
  };
  it('lets the counsellor set a counsellee\'s technology, then reloads that person', async () => {
    const { h, refresh } = roster([kim()]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'SAP' })); });
    await flush();
    expect(set).toHaveBeenCalledWith('m1', 'tec:sap', true);
    expect(refresh).toHaveBeenCalledWith('m1');
    expect(h.state.toast).toBe('SAP added for Kim');
  });
  it('says what the database refused and keeps the chips', async () => {
    set.mockResolvedValue({ error: 'Not allowed · ask an admin' });
    const { h, refresh } = roster([kim()]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Data & Azure' })); });
    await flush();
    expect(h.state.toast).toBe('Not allowed · ask an admin');
    expect(refresh).not.toHaveBeenCalled();
  });
  it('is read-only while viewing as someone else', () => {
    roster([kim()], person({ readOnly: true }));
    expect(within(group()).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Data & Azure')).toBeTruthy();
  });
});

describe('what membership changes', () => {
  const data: Trajectory = { ...blankTrajectory(null), id: 'T9', name: 'Data engineer', status: 'live', enrol: 'auto', maps: [['tec:data', 'Consultant', 'mandatory']] };
  it('a counsellee in a mandatory tec: audience is on the trajectory table, one outside is not', () => {
    const h = harness({ state: { trjs: [data] } });
    expect(h.vm().teamTrjVals([kim()], async () => {}).teamTrj.map((r) => r.trj)).toEqual(['Data engineer']);
    expect(h.vm().teamTrjVals([kim({ audiences: [] })], async () => {}).teamTrj).toEqual([]);
  });
  it('the person zoom lists trajectories mapped to the subject\'s memberships', () => {
    const h = harness({ state: { trjs: [data], trjMine: { userId: 'u1', enrols: {}, creds: [], audiences: ['tec:data'] } } });
    expect(h.vm().pz.trjRows[0]).toMatch(/^Data engineer via Data & Azure · mandatory · /);
  });
});

describe('User management', () => {
  const u = (id: string, over: Record<string, unknown> = {}) => ({ id, email: id + '@example.com', full_name: 'Person ' + id.toUpperCase(), business_line: 'Audit', must_change_password: false, created_at: '', career_stage: null, counsellor_id: null, roles: [], ...over });
  const sys: Access = { userId: 'me', isSystem: true, domains: [] };
  const mount = async () => {
    db.answer((c) => (c.table === 'rpc:manageable_user_ids' ? { data: ['me', 'p1'] } : c.table === 'audience_members' ? { data: [{ user_id: 'p1', audience: 'ind:energy' }] } : op(c) === 'select' ? { data: [u('me'), u('p1')] } : { data: [] }));
    const say = vi.fn();
    render(<UsersScreen access={sys} meId="me" say={say} />);
    await screen.findByText('2 of 2 accounts');
    return say;
  };
  const groupOf = (name: string) => screen.getByRole('group', { name: 'Industries & technologies of ' + name });
  it('shows each person\'s memberships and lets the admin change someone else\'s', async () => {
    const say = await mount();
    const chip = within(groupOf('Person P1')).getByRole('button', { name: 'Energy & utilities' });
    await act(async () => { fireEvent.click(chip); });
    expect(set).toHaveBeenCalledWith('p1', 'ind:energy', false);
    expect(say).toHaveBeenCalledWith('Energy & utilities removed for Person P1');
  });
  it('shows the admin\'s own memberships read-only: nobody sets their own', async () => {
    await mount();
    expect(within(groupOf('Person ME')).queryAllByRole('button')).toHaveLength(0);
  });
});
