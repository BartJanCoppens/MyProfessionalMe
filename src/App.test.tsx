// @vitest-environment jsdom
// The app shell end to end with real view-model and screens: the auth gate, load errors, the sidebar per role,
// "View as", and one walk through every screen (FT-AUTH-*, FT-NAV-*, FT-VIEW-*, FT-UI-*). Data hooks and stores are mocked.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AUD_MAPS0, BUNDLES0, LEARN, MAPS0 } from './data';
import * as content from './lib/contentStore';
import * as learner from './lib/learnerStore';
import { useAuth } from './lib/useAuth';
import type { Auth } from './lib/useAuth';
import { useContent } from './lib/useContent';
import { useSubject } from './lib/useSubject';
import type { Subject } from './lib/useSubject';
import { useTeam } from './lib/useTeam';
import type { Member } from './logic/team';
import { db, has } from './test/fakeSupabase';
import { contribution, review } from './test/contributions';
import { emptyData, person, withProgress } from './test/harness';
import type { Access } from './types';

vi.mock('./lib/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('./lib/useSubject', async (orig) => ({ ...(await orig<object>()), useSubject: vi.fn() }));
vi.mock('./lib/useContent', () => ({ useContent: vi.fn() }));
vi.mock('./lib/useTeam', () => ({ useTeam: vi.fn() }));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(async () => {}), addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('./lib/contentStore', async (orig) => ({ ...(await orig<object>()), saveLearning: vi.fn(async () => {}), removeLearning: vi.fn(async () => {}), publishMappings: vi.fn(async () => {}), saveBundleSoon: vi.fn(), saveBundleNow: vi.fn(), loadContent: vi.fn() }));

const access = (over: Partial<Access> = {}): Access => ({ userId: 'u1', isSystem: false, domains: [], ...over });
const auth = (over: Partial<Auth> = {}, acc: Partial<Access> = {}): Auth => ({
  status: 'signed-in', session: null, roles: [], access: access(acc), reload: vi.fn(async () => {}), signOut: vi.fn(async () => {}),
  profile: { id: 'u1', email: 'robin.test@example.com', full_name: 'Robin Test', business_line: 'Consulting', must_change_password: false, created_at: '', career_stage: 'Consultant', counsellor_id: null },
  ...over,
});
const loaded = { learnings: LEARN.map((r) => [r, { line: null, status: 'published' as const }] as [typeof r, { line: null; status: 'published' }]), maps: { ...MAPS0, ...AUD_MAPS0 }, bundles: BUNDLES0 };
const subjectHook = (subject: Subject | null, over: Record<string, unknown> = {}) => ({ subject, options: [{ id: 'u1', label: 'Robin Test (you)' }], select: vi.fn(), reload: vi.fn(async () => {}), retry: vi.fn(), error: null, loading: false, ...over });

function setup({ a = auth(), subject = person() as Subject | null, subj = {}, cont = {}, team = [] as Member[], teamError = null as string | null } = {}) {
  vi.mocked(useAuth).mockReturnValue(a);
  const s = subjectHook(subject, subj);
  vi.mocked(useSubject).mockReturnValue(s as unknown as ReturnType<typeof useSubject>);
  const c = { content: loaded, error: null, retry: vi.fn(), reload: vi.fn(async () => loaded), ...cont };
  vi.mocked(useContent).mockReturnValue(c);
  vi.mocked(useTeam).mockReturnValue({ members: teamError ? null : team, error: teamError, retry: vi.fn() });
  render(<App />);
  return { a, s, c };
}
const nav = (label: string) => fireEvent.click(screen.getByText(label, { selector: 'nav button > span' }));
const button = (name: string | RegExp) => fireEvent.click(screen.getAllByRole('button', { name })[0]);
const heading = () => screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent);

beforeEach(() => { db.reset(); vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; window.history.replaceState({}, '', '/'); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the auth gate', () => {
  it('shows nothing while the session loads', () => {
    setup({ a: auth({ status: 'loading' }) });
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText('MyProfessionalMe')).toBeNull();
  });
  it('asks to sign in when signed out', () => {
    setup({ a: auth({ status: 'signed-out', profile: null }) });
    expect(heading()).toEqual(['Sign in']);
  });
  it('forces a temporary password to be replaced first', () => {
    setup({ a: auth({ profile: { ...auth().profile!, must_change_password: true } }) });
    expect(heading()).toEqual(['Choose your own password']);
    expect(screen.getByText(/You signed in as robin\.test@example\.com with a temporary password/)).toBeTruthy();
  });
  it('opens the growth map once signed in', () => {
    setup();
    expect(heading()).toEqual(['Your growth map']);
    expect(screen.getAllByText('Robin Test').length).toBeGreaterThan(0);
  });
});

describe('loading the workspace', () => {
  it('waits for the subject and the content', () => {
    setup({ subject: null });
    expect(screen.queryByRole('heading')).toBeNull();
    cleanup();
    setup({ cont: { content: null } });
    expect(screen.queryByRole('heading')).toBeNull();
  });
  it('explains a failed load, retries the part that failed and signs out', () => {
    const { s, a } = setup({ subj: { error: 'learner data unavailable' } });
    expect(screen.getByText('Your learning data did not load')).toBeTruthy();
    expect(screen.getByText('learner data unavailable')).toBeTruthy();
    button('Try again');
    expect(s.retry).toHaveBeenCalled();
    button('Sign out');
    expect(a.signOut).toHaveBeenCalled();
    cleanup();
    const { c } = setup({ cont: { error: 'content unavailable' } });
    button('Try again');
    expect(c.retry).toHaveBeenCalled();
  });
});

describe('the sidebar', () => {
  it('shows a member no administration and names the role', () => {
    setup();
    expect(screen.queryByText('Administration')).toBeNull();
    expect(screen.getByText('Member')).toBeTruthy();
  });
  it('shows a General Admin content screens and user management (to hand out creation rights)', () => {
    setup({ a: auth({}, { isGeneral: true }) });
    expect(screen.getByText('Knowledge library', { selector: 'nav button > span' })).toBeTruthy();
    expect(screen.getByText('User management', { selector: 'nav button > span' })).toBeTruthy();
    expect(screen.getByText('General Admin')).toBeTruthy();
    cleanup();
    setup({ a: auth({}, { isGeneral: true, domains: ['Audit'] }) });
    expect(screen.getByText('General Admin · Domain Admin · Audit')).toBeTruthy();
  });
  it('names Domain and System Admins', () => {
    setup({ a: auth({}, { domains: ['Audit', 'Consulting'] }) });
    expect(screen.getByText('Domain Admin · Audit, Consulting')).toBeTruthy();
    cleanup();
    setup({ a: auth({}, { isSystem: true }) });
    expect(screen.getByText('System Admin')).toBeTruthy();
    expect(screen.getByText('User management', { selector: 'nav button > span' })).toBeTruthy();
  });
  it('badges counsellees with overdue mandatory items', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
    setup({ team: [{ id: 'm1', name: 'Kim Learner', stage: 'Analyst', businessLine: 'Consulting', data: emptyData() }] });
    expect(screen.getByText('My team', { selector: 'nav button > span' }).parentElement!.textContent).toBe('My team1');
  });
  it('loads Create & share for the signed-in person and badges the reviews waiting for them', async () => {
    db.answer((c) => c.table === 'contributions' ? { data: [contribution({ id: 'x1', author_id: 'u5', status: 'review', step: 1 })] }
      : c.table === 'contribution_reviews' ? { data: [review({ contribution_id: 'x1', reviewer_id: 'u1' })] }
      : c.table === 'rpc:peer_count' ? { data: 2 } : { data: [] });
    setup();
    await waitFor(() => expect(screen.getByText('Create & share', { selector: 'nav button > span' }).parentElement!.textContent).toBe('Create & share1'));
    expect(db.on('creator_rules').some((c) => has(c, 'eq', 'user_id', 'u1'))).toBe(true);
    nav('Create & share');
    expect(screen.getByText('Review for peers · 1')).toBeTruthy();
  });
  it('signs out', () => {
    const { a } = setup();
    button('Sign out');
    expect(a.signOut).toHaveBeenCalled();
  });
  it('sends a member who opens an admin screen from the URL to the map', () => {
    window.history.replaceState({}, '', '/?screen=adminLib');
    setup();
    expect(heading()).toEqual(['Your growth map']);
    cleanup();
    window.history.replaceState({}, '', '/?screen=users');
    setup();
    expect(heading()).toEqual(['Your growth map']);
  });
});

describe('View as', () => {
  it('marks a viewed person read-only and goes back to me', () => {
    const { s } = setup({ subject: person({ id: 'p2', name: 'Kim Learner', readOnly: true }) });
    expect(screen.getByText('Viewing · read-only')).toBeTruthy();
    button('Back to me');
    expect(s.select).toHaveBeenCalledWith('u1');
  });
  it('picks another person from the list', () => {
    const { s } = setup({ a: auth({}, { isSystem: true }), subj: { options: [{ id: 'u1', label: 'Robin Test (you)' }, { id: 'p2', label: 'Kim Learner' }, { id: 'p3', label: 'Alex Other' }] } });
    button('Change');
    expect(screen.getByText('View as')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search by name'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nobody matches.')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search by name'), { target: { value: 'kim' } });
    button('Kim Learner');
    expect(s.select).toHaveBeenCalledWith('p2');
    expect(screen.queryByText('View as')).toBeNull();
  });
  it('opens a counsellee from My team', () => {
    const { s } = setup({ team: [{ id: 'm1', name: 'Kim Learner', stage: 'Analyst', businessLine: 'Consulting', data: emptyData() }] });
    nav('My team');
    expect(heading()).toEqual(['Your counsellees']);
    button('Open');
    expect(s.select).toHaveBeenCalledWith('m1');
    expect(heading()).toEqual(['Your growth map']);
  });
});

describe('a learner walking through the app', () => {
  it('switches map views, zooms into a domain and back', () => {
    setup();
    button('Radar');
    expect(screen.getByText(/^Largest gaps:/)).toBeTruthy();
    button('Road');
    expect(screen.getByText('Firm path to Senior consultant')).toBeTruthy();
    button('Constellation');
    fireEvent.click(screen.getAllByTitle('Zoom into Job technical skills')[0]);
    expect(screen.getAllByText(/Not started → L4/).length).toBeGreaterThan(0);
    button('← All domains');
  });
  it('searches the library, empties it and clears the filters', () => {
    setup();
    nav('Library');
    expect(heading()).toEqual(['Library']);
    fireEvent.change(screen.getByPlaceholderText('Search title, source or topic'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No learnings match these filters')).toBeTruthy();
    button('clear all filters');
    expect(screen.getByText(LEARN.length + ' of ' + LEARN.length + ' learnings')).toBeTruthy();
  });
  it('opens a learning, logs an hour and adds an open one to the path', () => {
    setup();
    nav('Library');
    fireEvent.click(screen.getAllByText('GDPR for consultants')[0]);
    expect(heading()).toEqual(['GDPR for consultants']);
    button('Log 1 hour');
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L17', { state: 'in-progress', pct: 67 });
    button('← Back to library');
    fireEvent.click(screen.getAllByText('Target operating model casebook')[0]);
    button('+ Add to my path');
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L3', { chosen: true });
  });
  it('practises with an avatar from the detail page', () => {
    setup();
    nav('Library');
    fireEvent.click(screen.getByText('Holding scope with a procurement director'));
    button('Start a session');
    expect(screen.getByRole('status').textContent).toMatch(/^Coming with the avatar studio$/);
  });
  it('says ratings and notes are not available yet on a learning', () => {
    setup({ subject: person({ data: withProgress({ L7: ['in-progress', 40] }) }) });
    nav('Library');
    fireEvent.click(screen.getByText('Feedback that lands'));
    expect(screen.getByText('Ratings and notes are not available yet')).toBeTruthy();
    expect(screen.queryByText('Rate & leave a note')).toBeNull();
  });
  it('talks to the scripted assistant on the profile and saves its proposal', async () => {
    setup();
    nav('My profile');
    expect(heading()).toEqual(['My profile']);
    button('I enjoyed the energy client most');
    expect(await screen.findByText(/Energy-transition work is a clear direction/)).toBeTruthy();
    button('Save');
    await act(async () => {});
    expect(learner.addAmbition).toHaveBeenCalled();
  });
  it('shows projects and evaluations with nothing seeded', () => {
    setup();
    nav('Projects & evaluations');
    expect(heading()).toEqual(['Projects & evaluations']);
    button('Request an evaluation');
    expect(screen.getByRole('status').textContent).toMatch(/^Prototype: sends an evaluation request/);
  });
});

describe('an admin walking through the administration', () => {
  const sys = () => setup({ a: auth({}, { isSystem: true }) });
  it('adds a learning in the drawer and is told what is missing', async () => {
    sys();
    nav('Learning library');
    expect(heading()).toEqual(['Learning library']);
    button('+ Add learning');
    expect(screen.getByText('Add a learning')).toBeTruthy();
    button('Save as draft');
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toBe('Give the learning a title');
    expect(content.saveLearning).not.toHaveBeenCalled();
  });
  it('prefills the drawer from a connected program and saves it', async () => {
    sys();
    nav('Learning library');
    button('+ Add learning');
    button('Import');
    await act(async () => { button('Publish'); });
    expect(content.saveLearning).toHaveBeenCalledWith(expect.objectContaining({ title: 'Negotiation for consultants', hours: 6, status: 'published' }), undefined);
  });
  it('maps learnings, applies a signal and publishes', async () => {
    sys();
    nav('Curriculum mapping');
    expect(heading()).toEqual(['Curriculum mapping']);
    button('Apply');
    expect(screen.getByText('Curriculum mapping', { selector: 'nav button > span' }).parentElement!.textContent).toContain('1 pending');
    await act(async () => { button(/^Publish/); });
    expect(content.publishMappings).toHaveBeenCalled();
  });
  it('asks the copilot and reads the stack as the learner', async () => {
    sys();
    nav('Curriculum mapping');
    button('What do Energy seniors still miss?');
    expect(await screen.findByText(/Energy & utilities seniors have sector strategy/)).toBeTruthy();
    button('Read it as Robin');
    expect(await screen.findByText(/This looks like a plan I can finish/)).toBeTruthy();
  });
  it('browses the Knowledge library, opens a bundle and every tab', () => {
    sys();
    nav('Knowledge library');
    expect(heading()).toEqual(['Knowledge library']);
    fireEvent.click(screen.getByText('Belgian tax updates 2026'));
    for (const tab of [/^Sources/, /^RAG models/, /^OKF files/, 'Test retrieval', 'Overview & tags']) button(tab);
    button('← All bundles');
    expect(screen.getByText(/^7 of 7 bundles/)).toBeTruthy();
  });
  it('opens user management', async () => {
    db.answer((c) => (c.table === 'rpc:manageable_user_ids' ? { data: [] } : { data: [] }));
    sys();
    nav('User management');
    expect(heading()).toEqual(['User management']);
    expect(await screen.findByText('0 of 0 accounts')).toBeTruthy();
  });
});

describe('toasts', () => {
  it('appear and leave after a few seconds', () => {
    vi.useFakeTimers();
    setup();
    button('Ask your counsellor');
    expect(within(screen.getByRole('status')).getByText('No counsellor yet · an admin can assign one in User management')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2800); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
