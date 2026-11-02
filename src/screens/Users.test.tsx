// @vitest-environment jsdom
// User management: the list, filters, roles per caller, line/stage/counsellor changes, reset password, remove, add user (FT-USR-*).
// The database enforces the rules (RLS, manage-users); these tests check what the screen sends and shows. Supabase is a fake.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, has, op } from '../test/fakeSupabase';
import type { Call } from '../test/fakeSupabase';
import type { Access } from '../types';
import UsersScreen from './Users';

const u = (id: string, over: Record<string, unknown> = {}) => ({ id, email: id + '@example.com', full_name: 'Person ' + id.toUpperCase(), business_line: 'Audit', must_change_password: false, created_at: '', career_stage: null, counsellor_id: null, roles: [], ...over });
const users = [
  u('me', { roles: [{ role: 'system_admin', business_line: null }] }),
  u('a1', { roles: [{ role: 'domain_admin', business_line: 'Audit' }], must_change_password: true, career_stage: 'Manager' }),
  u('c1', { business_line: 'Consulting', counsellor_id: 'a1' }),
  u('n1', { business_line: null, full_name: null }),
  u('s2', { roles: [{ role: 'system_admin', business_line: null }, { role: 'general_admin', business_line: null }], business_line: 'Audit' }),
];
let writes: (c: Call) => { data?: unknown; error?: { message: string } | null } = () => ({ data: [{ id: 'x' }] });
const sys: Access = { userId: 'me', isSystem: true, domains: [] };
const auditAdmin: Access = { userId: 'a1', isSystem: false, domains: ['Audit'] };

beforeEach(() => {
  db.reset();
  writes = () => ({ data: [{ id: 'x' }] });
  db.answer((c) => (c.table === 'rpc:manageable_user_ids' ? { data: users.map((x) => x.id) } : op(c) === 'select' ? { data: users } : writes(c)));
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true });
});
afterEach(cleanup);

const mount = async (access = sys) => {
  const say = vi.fn();
  render(<UsersScreen access={access} meId={access.userId} say={say} />);
  await screen.findByText(/of 5 accounts$/);
  return say;
};
const row = (id: string) => screen.getByText(id + '@example.com', { selector: 'div' }).closest('[style*="grid"]') as HTMLElement;
const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const change = async (el: Element, value: string) => { await act(async () => { fireEvent.change(el, { target: { value } }); }); };

describe('the account list', () => {
  it('lists the accounts the caller may manage, marking yourself', async () => {
    await mount();
    expect(screen.getByText('5 of 5 accounts')).toBeTruthy();
    expect(within(row('me')).getByText('· you')).toBeTruthy();
    expect(within(row('a1')).getByText('Temporary password')).toBeTruthy();
    expect(within(row('c1')).getByText('Own password')).toBeTruthy();
    expect(db.calls.map((c) => c.table)).toEqual(['profiles', 'rpc:manageable_user_ids', 'creator_grants', 'domain_experts']);
  });
  it('leaves out people returned by RLS but not manageable', async () => {
    db.answer((c) => (c.table === 'rpc:manageable_user_ids' ? { data: ['me', 'a1'] } : { data: users }));
    render(<UsersScreen access={sys} meId="me" say={vi.fn()} />);
    expect(await screen.findByText('2 of 2 accounts')).toBeTruthy();
  });
  it('filters by line, people without a line, and search, and says when nothing matches', async () => {
    await mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'Consulting' })[0]);
    expect(screen.getByText('1 of 5 accounts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'No line' }));
    expect(screen.getByText('1 of 5 accounts')).toBeTruthy();
    expect(screen.getAllByText('n1@example.com', { selector: 'div' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByPlaceholderText('Search name or email'), { target: { value: 'zzz' } });
    expect(screen.getByText('No accounts match.')).toBeTruthy();
  });
  it('shows a load error', async () => {
    db.answer(() => ({ error: { message: 'permission denied for profiles' } }));
    render(<UsersScreen access={sys} meId="me" say={vi.fn()} />);
    expect(await screen.findByText('permission denied for profiles')).toBeTruthy();
    expect(screen.getByText('Loading accounts')).toBeTruthy();
  });
});

describe('roles', () => {
  it('lets a System Admin grant and revoke every role', async () => {
    const say = await mount();
    await click(within(row('c1')).getByRole('button', { name: 'Audit' }));
    const ins = db.on('user_roles')[0];
    expect(ins.steps[0]).toEqual(['insert', [{ user_id: 'c1', role: 'domain_admin', business_line: 'Audit', created_by: 'me' }]]);
    expect(say).toHaveBeenCalledWith('Granted Domain Admin · Audit for Person C1');
    await click(within(row('a1')).getByRole('button', { name: 'Domain Admin · Audit' }));
    const del = db.on('user_roles')[1];
    expect(op(del)).toBe('delete');
    expect(has(del, 'eq', 'business_line', 'Audit')).toBe(true);
    await click(within(row('c1')).getByRole('button', { name: 'General Admin' }));
    expect(say).toHaveBeenCalledWith('Granted General Admin for Person C1');
    await click(within(row('s2')).getByRole('button', { name: 'System Admin' }));
    expect(has(db.on('user_roles')[3], 'is', 'business_line', null)).toBe(true);
    expect(say).toHaveBeenCalledWith('Revoked System Admin for Person S2');
  });
  it('explains that the last System Admin cannot go', async () => {
    writes = () => ({ error: { message: 'cannot remove the last System Admin' } });
    const say = await mount();
    await click(within(row('me')).getByRole('button', { name: 'System Admin' }));
    expect(say).toHaveBeenCalledWith('Cannot remove the last System Admin');
  });
  it('shows a Domain Admin the roles as tags only', async () => {
    await mount(auditAdmin);
    expect(within(row('s2')).getByText('General Admin')).toBeTruthy();
    expect(within(row('c1')).getByText('Member')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'General Admin' })).toBeNull();
    expect(screen.getByText(/^Create and manage accounts in Audit\./)).toBeTruthy();
  });
});

describe('line, stage and counsellor', () => {
  it('moves a person to another line', async () => {
    const say = await mount();
    await change(within(row('c1')).getAllByRole('combobox')[0], 'Audit');
    expect(db.on('profiles').find((c) => op(c) === 'update')!.steps[0]).toEqual(['update', [{ business_line: 'Audit' }]]);
    expect(say).toHaveBeenCalledWith('Person C1 moved to Audit');
  });
  it('says so when the database moves nobody', async () => {
    writes = () => ({ data: [] });
    const say = await mount();
    await change(within(row('c1')).getAllByRole('combobox')[0], 'Audit');
    expect(say).toHaveBeenCalledWith('You cannot move this user to Audit');
  });
  it('sets and clears a stage and a counsellor', async () => {
    const say = await mount();
    const [, stage, counsellor] = within(row('c1')).getAllByRole('combobox');
    await change(stage, 'Director');
    expect(say).toHaveBeenCalledWith('Person C1 · stage Director');
    await change(stage, '');
    expect(say).toHaveBeenCalledWith('Person C1 · stage cleared');
    await change(counsellor, 'me');
    expect(say).toHaveBeenCalledWith('Person C1 · counsellor set');
    await change(counsellor, '');
    expect(say).toHaveBeenCalledWith('Person C1 · counsellor cleared');
    writes = () => ({ data: [] });
    await change(stage, 'Manager');
    expect(say).toHaveBeenCalledWith('You cannot change this user');
  });
  it('keeps a Domain Admin away from System Admins and from their own stage', async () => {
    await mount(auditAdmin);
    expect(within(row('s2')).queryAllByRole('combobox')).toHaveLength(0);
    expect(within(row('s2')).queryByText('Reset password')).toBeNull();
    expect(within(row('a1')).getAllByRole('combobox')).toHaveLength(1);
    expect((within(row('c1')).getAllByRole('combobox')[2] as HTMLSelectElement).value).toBe('a1');
  });
});

describe('reset password and remove', () => {
  it('resets a password and hands it over once', async () => {
    await mount();
    await click(within(row('c1')).getByText('Reset password'));
    expect(db.client.functions.invoke).toHaveBeenCalledWith('manage-users', { body: { action: 'reset_password', user_id: 'c1', password: expect.stringMatching(/^.{14}$/) } });
    const pw = (db.client.functions.invoke.mock.calls[0][1] as { body: { password: string } }).body.password;
    expect(screen.getByText('New temporary password for c1@example.com:')).toBeTruthy();
    expect(screen.getByText(pw)).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Copy' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(pw);
  });
  it('reports a failed reset', async () => {
    db.client.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'User not allowed' } });
    const say = await mount();
    await click(within(row('c1')).getByText('Reset password'));
    expect(say).toHaveBeenCalledWith('User not allowed');
  });
  it('removes a person only after confirming', async () => {
    const say = await mount();
    await click(within(row('c1')).getByText('Remove'));
    await click(within(row('c1')).getByText('Cancel'));
    expect(db.client.functions.invoke).not.toHaveBeenCalled();
    await click(within(row('c1')).getByText('Remove'));
    await click(within(row('c1')).getByRole('button', { name: 'Remove' }));
    expect(db.client.functions.invoke).toHaveBeenCalledWith('manage-users', { body: { action: 'remove', user_id: 'c1' } });
    expect(say).toHaveBeenCalledWith('Person C1 removed');
  });
  it('offers neither to yourself', async () => {
    await mount();
    expect(within(row('me')).queryByText('Reset password')).toBeNull();
    expect(within(row('me')).queryByText('Remove')).toBeNull();
  });
});

describe('adding a user', () => {
  it('creates an account with a temporary password and can make them Domain Admin', async () => {
    db.client.functions.invoke.mockResolvedValueOnce({ data: { ok: true, user_id: 'new1' }, error: null });
    const say = await mount();
    fireEvent.click(screen.getByRole('button', { name: '+ Add user' }));
    const create = screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('firstname.lastname@intelli-select.com'), { target: { value: ' New.Person@Example.com ' } });
    fireEvent.change(screen.getByPlaceholderText('Optional'), { target: { value: 'New Person' } });
    fireEvent.change(screen.getAllByRole('combobox').at(-1)!, { target: { value: 'Audit' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Make them Domain Admin for Audit')).toBeTruthy();
    await click(create);
    expect(db.client.functions.invoke).toHaveBeenCalledWith('manage-users', { body: expect.objectContaining({ action: 'create', email: 'New.Person@Example.com', full_name: 'New Person', business_line: 'Audit' }) });
    expect(db.on('user_roles')[0].steps[0]).toEqual(['insert', [{ user_id: 'new1', role: 'domain_admin', business_line: 'Audit', created_by: 'me' }]]);
    expect(say).toHaveBeenCalledWith('Account created for new.person@example.com');
    expect(screen.getByText('Temporary password for new.person@example.com:')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
  });
  it('generates another password and cancels', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '+ Add user' }));
    const box = screen.getAllByRole('textbox').at(-1) as HTMLInputElement;
    const first = box.value;
    fireEvent.click(screen.getByText('Generate'));
    expect(box.value).not.toBe(first);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Add a user')).toBeNull();
  });
  it('shows why an account was not created, and a role that was not granted', async () => {
    db.client.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Email already registered' } });
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '+ Add user' }));
    fireEvent.change(screen.getByPlaceholderText('firstname.lastname@intelli-select.com'), { target: { value: 'x@example.com' } });
    await click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Email already registered')).toBeTruthy();
    db.client.functions.invoke.mockResolvedValueOnce({ data: { ok: true, user_id: 'n2' }, error: null });
    writes = () => ({ error: { message: 'denied' } });
    fireEvent.click(screen.getByRole('checkbox'));
    await click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Account created, but the Domain Admin role was not granted: denied')).toBeTruthy();
  });
  it('lets a Domain Admin add users to their own lines only, without roles', async () => {
    await mount(auditAdmin);
    fireEvent.click(screen.getByRole('button', { name: '+ Add user' }));
    expect(screen.getByText('You can add users to the lines you administer.')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    const lines = screen.getAllByRole('combobox').at(-1) as HTMLSelectElement;
    expect(Array.from(lines.options).map((o) => o.value)).toEqual(['Audit']);
  });
});
