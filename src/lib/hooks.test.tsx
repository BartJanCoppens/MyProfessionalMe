// @vitest-environment jsdom
// Session, account and roles (useAuth), the subject and "View as" choices (useSubject), counsellees (useTeam) and the content load (useContent) (FT-AUTH-*, FT-VIEW-*, FT-TEAM-*).
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, has } from '../test/fakeSupabase';
import { emptyData } from '../test/harness';
import * as data from '../data';
import * as content from './contentStore';
import * as learner from './learnerStore';
import { useAuth } from './useAuth';
import type { Auth } from './useAuth';
import { useContent } from './useContent';
import { useSubject } from './useSubject';
import { useTeam } from './useTeam';

vi.mock('./supabase', async () => ({ supabase: (await import('../test/fakeSupabase')).db.client }));
vi.mock('./learnerStore', () => ({ loadLearner: vi.fn() }));
vi.mock('./contentStore', async (orig) => ({ ...(await orig<object>()), loadContent: vi.fn() }));
vi.mock('../data', async (orig) => ({ ...(await orig<object>()), setCatalogue: vi.fn() }));

beforeEach(() => { db.reset(); vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); });
afterEach(cleanup);

const profile = (id: string, over: Record<string, unknown> = {}) => ({ id, email: id + '@example.com', full_name: 'Person ' + id.toUpperCase(), business_line: 'Consulting', must_change_password: false, created_at: '', career_stage: 'Consultant', counsellor_id: null, ...over });
const session = (id: string) => ({ user: { id } });

describe('useAuth', () => {
  it('is loading until the session is known, then signed out without one', async () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    expect(result.current.access).toEqual({ userId: '', isSystem: false, isGeneral: false, domains: [] });
  });
  it('loads the profile and turns roles into access', async () => {
    db.client.auth.getSession.mockResolvedValue({ data: { session: session('u1') } });
    db.answer((c) => (c.table === 'profiles' ? { data: profile('u1') } : { data: [{ role: 'general_admin', business_line: null }, { role: 'domain_admin', business_line: 'Audit' }] }));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    expect(result.current.profile!.id).toBe('u1');
    expect(result.current.access).toEqual({ userId: 'u1', isSystem: false, isGeneral: true, domains: ['Audit'] });
    expect(has(db.on('user_roles')[0], 'eq', 'user_id', 'u1')).toBe(true);
  });
  it('follows sign-out and sign-in events', async () => {
    db.answer((c) => (c.table === 'profiles' ? { data: profile('u2') } : { data: [{ role: 'system_admin', business_line: null }] }));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('signed-out'));
    act(() => db.emitAuth('SIGNED_IN', session('u2')));
    await waitFor(() => expect(result.current.status).toBe('signed-in'));
    expect(result.current.access.isSystem).toBe(true);
    act(() => db.emitAuth('SIGNED_OUT', null));
    expect(result.current.status).toBe('signed-out');
  });
  it('reloads the account and signs out', async () => {
    db.client.auth.getSession.mockResolvedValue({ data: { session: session('u1') } });
    let mustChange = true;
    db.answer((c) => (c.table === 'profiles' ? { data: profile('u1', { must_change_password: mustChange }) } : { data: [] }));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.profile?.must_change_password).toBe(true));
    mustChange = false;
    await act(() => result.current.reload());
    expect(result.current.profile!.must_change_password).toBe(false);
    await act(() => result.current.signOut());
    expect(db.client.auth.signOut).toHaveBeenCalled();
  });
});

const authOf = (id: string, access: Partial<Auth['access']> = {}, over: Record<string, unknown> = {}): Auth => ({
  status: 'signed-in', session: null, profile: profile(id, over) as unknown as Auth['profile'], roles: [],
  access: { userId: id, isSystem: false, domains: [], ...access }, reload: async () => {}, signOut: async () => {},
});
const people = [profile('u1', { counsellor_id: 'c1' }), profile('c1', { business_line: 'Audit' }), profile('m1', { counsellor_id: 'u1', full_name: null }), profile('x1', { business_line: 'Audit' })];

describe('useSubject', () => {
  beforeEach(() => {
    db.answer(() => ({ data: people }));
    vi.mocked(learner.loadLearner).mockImplementation(async (id) => ({ ...emptyData(), prefs: { initials: id.toUpperCase(), color: '' } }));
  });
  it('shows the signed-in person, editable, with their counsellor', async () => {
    const { result } = renderHook(() => useSubject(authOf('u1', {}, { counsellor_id: 'c1' })));
    await waitFor(() => expect(result.current.subject).not.toBeNull());
    expect(result.current.subject).toMatchObject({ id: 'u1', name: 'Person U1', readOnly: false, counsellor: { id: 'c1', name: 'Person C1' }, stage: 'Consultant', businessLine: 'Consulting', photo: null });
    expect(result.current.subject!.data.prefs.initials).toBe('U1');
    expect(result.current.loading).toBe(false);
  });
  it('offers a member only themselves and their counsellees', async () => {
    const { result } = renderHook(() => useSubject(authOf('u1', {}, { counsellor_id: 'c1' })));
    await waitFor(() => expect(result.current.options).toHaveLength(2));
    expect(result.current.options).toEqual([{ id: 'u1', label: 'Person U1 (you)' }, { id: 'm1', label: 'm1@example.com' }]);
  });
  it('offers a Domain Admin the people they manage, but not their own counsellor from another line', async () => {
    const { result } = renderHook(() => useSubject(authOf('u1', { domains: ['Consulting'] }, { counsellor_id: 'c1' })));
    await waitFor(() => expect(result.current.options.length).toBeGreaterThan(0));
    expect(result.current.options.map((o) => o.id)).toEqual(['u1', 'm1', 'x1']);
    const sys = renderHook(() => useSubject(authOf('u1', { isSystem: true }, { counsellor_id: 'c1' })));
    await waitFor(() => expect(sys.result.current.options.map((o) => o.id)).toEqual(['u1', 'c1', 'm1', 'x1']));
  });
  it('views someone else read-only and remembers the choice for this tab', async () => {
    const { result } = renderHook(() => useSubject(authOf('u1', { isSystem: true })));
    await waitFor(() => expect(result.current.subject?.id).toBe('u1'));
    act(() => result.current.select('x1'));
    expect(sessionStorage.getItem('mpm-subject')).toBe('x1');
    await waitFor(() => expect(result.current.subject?.id).toBe('x1'));
    expect(result.current.subject).toMatchObject({ readOnly: true, counsellor: null, businessLine: 'Audit' });
    expect(learner.loadLearner).toHaveBeenLastCalledWith('x1');
  });
  it('falls back to yourself when the remembered person is not choosable', async () => {
    sessionStorage.setItem('mpm-subject', 'x1');
    const { result } = renderHook(() => useSubject(authOf('u1')));
    await waitFor(() => expect(result.current.subject?.id).toBe('u1'));
  });
  it('shows a photo kept in this browser', async () => {
    localStorage.setItem('mpm-avatar:u1', 'data:image/jpeg;base64,AA');
    const { result } = renderHook(() => useSubject(authOf('u1')));
    await waitFor(() => expect(result.current.subject?.photo).toBe('data:image/jpeg;base64,AA'));
  });
  it('reports a failed load and retries', async () => {
    db.answer(() => ({ error: { message: 'profiles unavailable' } }));
    const { result } = renderHook(() => useSubject(authOf('u1')));
    await waitFor(() => expect(result.current.error).toBe('profiles unavailable'));
    db.answer(() => ({ data: people }));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.subject?.id).toBe('u1'));
    expect(result.current.error).toBeNull();
  });
  it('reports learner data that does not load', async () => {
    vi.mocked(learner.loadLearner).mockRejectedValue(new Error('learner data unavailable'));
    const { result } = renderHook(() => useSubject(authOf('u1')));
    await waitFor(() => expect(result.current.error).toBe('learner data unavailable'));
  });
  it('reloads the people list and the subject', async () => {
    const { result } = renderHook(() => useSubject(authOf('u1')));
    await waitFor(() => expect(result.current.subject).not.toBeNull());
    const before = db.on('profiles').length;
    await act(() => result.current.reload());
    await waitFor(() => expect(db.on('profiles').length).toBe(before + 1));
  });
});

describe('useTeam', () => {
  it('loads the counsellees with their learner data', async () => {
    db.answer(() => ({ data: [{ id: 'm1', email: 'm1@example.com', full_name: null, business_line: 'Audit', career_stage: null }] }));
    vi.mocked(learner.loadLearner).mockResolvedValue(emptyData());
    const { result } = renderHook(() => useTeam('c1'));
    expect(result.current.members).toBeNull();
    await waitFor(() => expect(result.current.members).toEqual([{ id: 'm1', name: 'm1@example.com', stage: null, businessLine: 'Audit', data: emptyData() }]));
    expect(result.current.error).toBeNull();
    expect(has(db.on('profiles')[0], 'eq', 'counsellor_id', 'c1')).toBe(true);
  });
  it('reports a team that cannot load, and loads it again on retry', async () => {
    db.answer(() => ({ error: { message: 'denied' } }));
    const { result } = renderHook(() => useTeam('c1'));
    await waitFor(() => expect(result.current.error).toBe('denied'));
    expect(result.current.members).toBeNull();
    db.answer(() => ({ data: [] }));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.members).toEqual([]));
    expect(result.current.error).toBeNull();
  });
  it('drops the previous person\'s team while the next one loads', async () => {
    db.answer(() => ({ data: [] }));
    const { result, rerender } = renderHook(({ id }) => useTeam(id), { initialProps: { id: 'c1' } });
    await waitFor(() => expect(result.current.members).toEqual([]));
    rerender({ id: 'c2' });
    expect(result.current.members).toBeNull();
  });
});

describe('useContent', () => {
  const loaded = { learnings: [], maps: {}, bundles: [] };
  it('loads the catalogue and fills LEARN', async () => {
    vi.mocked(content.loadContent).mockResolvedValue(loaded);
    const { result } = renderHook(() => useContent());
    await waitFor(() => expect(result.current.content).toEqual(loaded));
    expect(data.setCatalogue).toHaveBeenCalledWith([]);
    await act(async () => { await result.current.reload(); });
    expect(content.loadContent).toHaveBeenCalledTimes(2);
  });
  it('reports a failed load and retries', async () => {
    vi.mocked(content.loadContent).mockRejectedValueOnce(new Error('content unavailable'));
    const { result } = renderHook(() => useContent());
    await waitFor(() => expect(result.current.error).toBe('content unavailable'));
    vi.mocked(content.loadContent).mockRejectedValueOnce(new Error('still down'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBe('still down'));
    vi.mocked(content.loadContent).mockResolvedValue(loaded);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.content).toEqual(loaded));
    expect(result.current.error).toBeNull();
  });
});
