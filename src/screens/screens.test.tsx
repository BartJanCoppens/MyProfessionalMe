// @vitest-environment jsdom
// Screens rendered over a live view-model (a state that re-renders like the Shell): what the user sees and can click
// on the map docks and zoom, detail, profile, projects, team, the admin drawer, the mapping board and the Knowledge library (FT-UI-*).
// Seed data has no projects or personality tests yet; one of each is mocked in so those screens can be checked.
import { act, cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initState, Logic } from '../model';
import type { VM } from '../model';
import * as content from '../lib/contentStore';
import * as learner from '../lib/learnerStore';
import type { Subject } from '../lib/useSubject';
import type { Member } from '../logic/team';
import { cfg, emptyData, person, systemAdmin, withProgress } from '../test/harness';
import type { Access, AppState } from '../types';
import MapScreen from './Map';
import { DetailScreen } from './Library';
import ProfileScreen from './Profile';
import ProjectsScreen from './Projects';
import TeamScreen from './Team';
import { AddLearningDrawer, AdminLibraryScreen } from './Admin';
import AdminMappingScreen from './Mapping';
import KnowledgeScreen from './Knowledge';

vi.mock('../data', async (orig) => {
  const d = await orig<typeof import('../data')>();
  return {
    ...d,
    PROJECTS: [
      { id: 'P1', client: 'Northwind', name: 'Cost review', role: 'Analyst', period: 'Sep–Oct 2026', hours: 120, lead: 'Lead Person', evaluator: 'Eval Person', evalDate: '20 Oct 2026', overall: 'Meets expectations',
        summary: 'A cost review.', dims: [['Analysis', 2, 'Sharp'], ['Communication', 0, 'Too long']], quote: 'Solid work.', advice: [['L37', 'Tell the story first.'], ['L10', 'Structure earlier.']] },
      { id: 'P2', client: 'Contoso', name: 'Target model', role: 'Consultant', period: 'Oct 2026', hours: 40, lead: 'Other Lead', evaluator: 'Other Lead', evalDate: '', overall: '', summary: 'Ongoing.', dims: null, quote: '', advice: [] },
    ],
    TESTS: [{ id: 'T1', name: 'Four Colours', provider: 'Insights', date: 'Oct 2026', headline: 'Cool blue first', unit: '%', bars: [['Blue', 60, '#2f7fc1'], ['Red', 20]], reading: 'Prefers facts.', sugg: [['L37', 'Practise the story.']] }],
  };
});
vi.mock('../lib/learnerStore', () => ({
  acceptLearning: vi.fn(async () => {}), addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('../lib/contentStore', async (orig) => ({ ...(await orig<object>()), saveLearning: vi.fn(async () => {}), removeLearning: vi.fn(async () => {}), publishMappings: vi.fn(async () => {}), saveBundleSoon: vi.fn(), saveBundleNow: vi.fn() }));

type Refs = { file: RefObject<HTMLInputElement | null>; chat: RefObject<HTMLDivElement | null> };
let current: AppState;
function Live({ state, subject, access, view }: { state: Partial<AppState>; subject: Subject; access: Access; view: (vm: VM, refs: Refs) => ReactNode }) {
  const [st, setSt] = useState<AppState>(() => ({ ...initState(cfg), ...state }));
  useEffect(() => { current = st; });
  const toastTimer = useRef<number | undefined>(undefined), drag = useRef<string | null>(null), file = useRef<HTMLInputElement | null>(null), chat = useRef<HTMLDivElement | null>(null);
  const vm = new Logic(st, (p) => setSt((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, access, subject, async () => {}, async () => {}).renderVals();
  return <>{view(vm, { file, chat })}{vm.drawerOpen && <AddLearningDrawer vm={vm} />}{vm.toast && <div role="status">{vm.toast}</div>}</>;
}
const show = (view: (vm: VM, refs: Refs) => ReactNode, state: Partial<AppState> = {}, subject: Subject = person(), access: Access = systemAdmin()) =>
  render(<Live state={state} subject={subject} access={access} view={view} />);
const click = (name: string | RegExp, n = 0) => fireEvent.click(screen.getAllByRole('button', { name })[n]);
const toast = () => screen.getByRole('status').textContent;

beforeEach(() => { vi.clearAllMocks(); window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the growth map screen', () => {
  const map = (state: Partial<AppState> = {}, subject = person()) => show((vm) => <MapScreen vm={vm} />, state, subject);
  it('shows the dock of a selected learning and adds it to the path', () => {
    map({ sel: { type: 'node', id: 'L3', dom: 'tech' } });
    click('+ Add to my path');
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L3', { chosen: true });
    click('Open learning →');
    expect(current).toMatchObject({ screen: 'detail', detailId: 'L3', origin: 'map' });
  });
  it('lists a domain\'s learnings in the hub dock', () => {
    map({ sel: { type: 'hub', id: 'corp' } });
    expect(screen.getAllByText('Corporate functions').length).toBeGreaterThan(0);
    expect(screen.getAllByText('How finance closes the books').length).toBeGreaterThan(0);
    click('Clear');
    expect(current.sel).toBeNull();
  });
  it('explains a cloud and adds a suggested learning', () => {
    map({ sel: { type: 'cloud', id: 'amb' } }, person({ data: withProgress({}, { interests: [{ label: 'Data analysis', dom: 'tec' }] }) }));
    expect(screen.getByText('Toward your ambitions')).toBeTruthy();
    click('+ Add');
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L26', { chosen: true });
    click('Open ambitions →');
    expect(current.screen).toBe('profile');
  });
  it('switches clouds off from their chips', () => {
    map();
    fireEvent.click(screen.getByText('Ambitions', { selector: 'button' }));
    expect(current.clouds.amb).toBe(false);
  });
  it('zooms through domains and back out', () => {
    map({ zoom: 'tech' });
    expect(screen.getAllByText('Job technical skills').length).toBeGreaterThan(0);
    click('›');
    expect(current.zoom).toBe('acad');
    click('‹');
    expect(current.zoom).toBe('tech');
    click('← All domains');
    expect(current.zoom).toBeNull();
  });
  it('draws the radar and the road with work in flight', () => {
    map({ view: 'radar' }, person({ data: withProgress({ L1: 'accepted', L2: ['in-progress', 50] }) }));
    expect(screen.getByText(/^Largest gaps:/)).toBeTruthy();
    cleanup();
    map({ view: 'road' }, person({ data: withProgress({ L2: ['in-progress', 50], L3: 'submitted' }) }));
    expect(screen.getByText('Value-chain cost modelling in Excel · In progress · 50%')).toBeTruthy();
    expect(screen.getAllByText('GDPR for consultants').length).toBeGreaterThan(0);
  });
  it('tells a person without a business line', () => {
    map({}, person({ businessLine: null }));
    expect(screen.getByText(/^You have no business line yet/)).toBeTruthy();
  });
});

describe('the learning detail screen', () => {
  const detail = (id: string, subject = person(), access: Access = { isSystem: false, domains: [], userId: subject.id }) => show((vm) => <DetailScreen vm={vm} />, { screen: 'detail', detailId: id }, subject, access);
  it('introduces the avatar of a practice learning and starts a session', () => {
    detail('L39', person({ counsellor: { id: 'c1', name: 'Sam Coach' } }));
    expect(screen.getAllByText(/Noah Claes/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Share best run with/)).toBeNull();
    click('Start a session');
    expect(toast()).toMatch(/^Prototype: opens the avatar studio/);
  });
  it('asks for approval of a learning in progress', () => {
    detail('L7', person({ data: withProgress({ L7: ['in-progress', 40] }) }));
    click(/^Mark for review|^Ask/);
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L7', { state: 'submitted', pct: 100 });
  });
  it('lets the counsellor accept a submitted learning', async () => {
    detail('L10', person({ readOnly: true, counsellor: { id: 'c1', name: 'Sam Coach' }, data: withProgress({ L10: 'submitted' }) }), { isSystem: false, domains: [], userId: 'c1' });
    await act(async () => { click('Accept'); });
    expect(learner.acceptLearning).toHaveBeenCalledWith('u1', 'L10');
  });
  it('rates and writes a note', () => {
    detail('L1');
    click('Rate & leave a note');
    click('5');
    fireEvent.change(screen.getByPlaceholderText('One or two lines that help a colleague decide'), { target: { value: 'Useful' } });
    expect(current.myRating).toBe('5');
    click('Post note');
    expect(toast()).toBe('Note posted · visible to colleagues on this learning');
  });
});

describe('the profile screen', () => {
  const profile = (subject = person(), state: Partial<AppState> = {}) => show((vm, refs) => <ProfileScreen vm={vm} fileRef={refs.file} chatRef={refs.chat} />, { screen: 'profile', ...state }, subject);
  const known = person({ data: withProgress({}, { ambitions: [{ id: '4', text: 'Lead a team', horizon: '3 years', doms: ['lead'], from: '' }], interests: [{ label: 'Writing', dom: 'pers' }] }) });
  it('removes an ambition and an interest', async () => {
    profile(known);
    await act(async () => { click('Remove'); });
    expect(learner.removeAmbition).toHaveBeenCalledWith('4');
    const chip = screen.getByText('Writing').parentElement!;
    await act(async () => { fireEvent.click(within(chip).getByRole('button')); });
    expect(learner.removeInterest).toHaveBeenCalledWith('u1', 'Writing');
  });
  it('edits the avatar initials and colour, and removes a photo', () => {
    profile(person({ photo: 'data:image/png;base64,AA' }));
    fireEvent.change(screen.getByDisplayValue('RT'), { target: { value: 'zq' } });
    expect(learner.savePrefs).toHaveBeenCalledWith('u1', { initials: 'ZQ', color: undefined });
    fireEvent.click(screen.getByTitle('Green'));
    expect(learner.savePrefs).toHaveBeenCalledWith('u1', { initials: undefined, color: '#86BC25' });
    click('Remove photo');
    expect(current.avatarEdit).toMatchObject({ photo: null });
  });
  it('chats on Enter and drops a proposal', async () => {
    profile();
    const box = screen.getByPlaceholderText('What would you like more of in your work?');
    fireEvent.change(box, { target: { value: 'I like data work' } });
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }); });
    expect(screen.getByText(/That sounds like a real interest/)).toBeTruthy();
    click('Not now');
    expect(current.proposal).toBeNull();
  });
  it('shares a personality result and opens what it suggests', () => {
    profile(person({ counsellor: { id: 'c1', name: 'Sam Coach' } }));
    expect(screen.getByText('Four Colours')).toBeTruthy();
    click('Sam');
    expect(toast()).toBe('Four Colours result shared with Sam Coach');
    click('Only me');
    expect(toast()).toBe('Four Colours result is now visible to you only');
    fireEvent.click(screen.getAllByText('Storytelling with data')[0]);
    expect(current).toMatchObject({ screen: 'detail', detailId: 'L37', origin: 'profile' });
  });
});

describe('the projects screen', () => {
  it('shows an evaluation with its dimensions and advice, and a pending one', () => {
    show((vm) => <ProjectsScreen vm={vm} />, { screen: 'projects', projSel: 'P1' });
    expect(screen.getByText('Solid work.', { exact: false })).toBeTruthy();
    expect(screen.getByText('Too long')).toBeTruthy();
    click('+ Add');
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L37', { chosen: true });
    fireEvent.click(screen.getByText(/^Contoso ·/));
    expect(current.projSel).toBe('P2');
    expect(screen.getByText(/^Evaluation requested from Other Lead/)).toBeTruthy();
  });
});

describe('the team screen', () => {
  const team = (members: Member[] | null, tab = 'roster') => { const onOpen = vi.fn(); show((vm) => <TeamScreen vm={vm} members={members} onOpen={onOpen} />, { screen: 'team', teamTab: tab }); return onOpen; };
  const kim: Member = { id: 'm1', name: 'Kim Learner', stage: 'Analyst', businessLine: 'Consulting', data: emptyData() };
  it('waits for the counsellees and says when there are none', () => {
    team(null);
    expect(screen.getByText('Loading counsellees')).toBeTruthy();
    cleanup();
    team([]);
    expect(screen.getByText('Nobody has you as counsellor yet')).toBeTruthy();
  });
  it('lists counsellees and opens one', () => {
    const onOpen = team([kim]);
    expect(screen.getByText('Analyst · Consulting')).toBeTruthy();
    click('Open');
    expect(onOpen).toHaveBeenCalledWith('m1');
  });
  it('shows levels by domain with overdue items', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
    team([kim], 'heat');
    expect(screen.getByText('Expected at next stage')).toBeTruthy();
    expect(screen.getByTitle('Regulations · L0').querySelector('span')).not.toBeNull();
    click('Roster');
    expect(current.teamTab).toBe('roster');
  });
});

describe('the admin library screen and drawer', () => {
  it('filters the list and edits a learning in the drawer', async () => {
    show((vm) => <AdminLibraryScreen vm={vm} />, { screen: 'adminLib' });
    fireEvent.change(screen.getByPlaceholderText('Search the library'), { target: { value: 'GDPR' } });
    click('Edit');
    expect(screen.getByText('Edit learning')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('GDPR for consultants'), { target: { value: 'GDPR basics' } });
    expect(screen.queryByPlaceholderText('Search the program catalogue')).toBeNull();
    await act(async () => { click('Mark for review'); });
    expect(content.saveLearning).toHaveBeenCalledWith(expect.objectContaining({ title: 'GDPR basics', status: 'review' }), 'L17');
  });
  it('removes a learning from the drawer', async () => {
    show((vm) => <AdminLibraryScreen vm={vm} />, { screen: 'adminLib' });
    fireEvent.change(screen.getByPlaceholderText('Search the library'), { target: { value: 'Behavioural' } });
    click('Edit');
    await act(async () => { click('Remove'); });
    expect(content.removeLearning).toHaveBeenCalledWith('L6');
  });
  it('syncs programs and closes the drawer', () => {
    show((vm) => <AdminLibraryScreen vm={vm} />, { screen: 'adminLib' });
    click('Sync programs');
    expect(toast()).toMatch(/^Sync started/);
    click('+ Add learning');
    fireEvent.change(screen.getByPlaceholderText('Search the program catalogue'), { target: { value: 'cloud' } });
    expect(screen.getByText('Cloud economics for advisors')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Publisher or provider'), { target: { value: 'Coursera' } });
    expect(current.libForm!.source).toBe('Coursera');
    click('Cancel');
    expect(current.drawerOpen).toBe(false);
  });
});

describe('the curriculum mapping screen', () => {
  const mapping = (state: Partial<AppState> = {}) => show((vm) => <AdminMappingScreen vm={vm} />, { screen: 'adminMap', ...state });
  const dataTransfer = () => ({ setData: vi.fn(), getData: vi.fn(() => ''), effectAllowed: '' });
  it('drags a learning from the palette onto a stage', () => {
    mapping();
    const card = screen.getByText('Behavioural economics for advisors').parentElement!;
    fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
    const column = screen.getByText('Partner', { selector: 'div' }).parentElement!.parentElement!;
    fireEvent.dragOver(column, { dataTransfer: dataTransfer() });
    expect(current.overStage).toBe('Partner');
    const drop = createEvent.drop(column);
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer() });
    fireEvent(column, drop);
    expect(current.maps.Consulting).toContainEqual(['L6', 'Partner', 'advised']);
    expect(toast()).toBe('Mapped to Consulting · Partner · publish to apply');
  });
  it('changes and removes a selected mapping in the dock', () => {
    mapping({ mapSel: 'L7' });
    click('Advised');
    expect(current.maps.Consulting).toContainEqual(['L7', 'Analyst', 'advised']);
    click('Remove from Consulting');
    expect(current.mapSel).toBeNull();
    expect(current.maps.Consulting.some((m) => m[0] === 'L7')).toBe(false);
  });
  it('dismisses a signal and switches lens', () => {
    mapping();
    click('Dismiss');
    expect(Object.keys(current.sigDone)).toHaveLength(1);
    click('Ambition');
    expect(current.mapLens).toBe('amb');
    expect(screen.getAllByText('Sustainability lead').length).toBeGreaterThan(0);
  });
  it('asks the copilot from its input and applies the proposal', async () => {
    mapping();
    const box = screen.getByPlaceholderText('e.g. Give Public sector analysts a lighter start');
    fireEvent.change(box, { target: { value: 'something lighter for public sector' } });
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }); });
    await act(async () => { click('Apply all'); });
    expect(current.maps['ind:public']).toContainEqual(['L31', 'Analyst', 'advised']);
  });
});

describe('the Knowledge library screen', () => {
  const kb = (state: Partial<AppState> = {}) => show((vm) => (vm.kb ? <KnowledgeScreen kb={vm.kb} /> : null), { screen: 'adminKb', ...state });
  it('searches, opens a bundle and edits its overview', () => {
    kb();
    fireEvent.change(screen.getByPlaceholderText('Search bundles, tags, concepts'), { target: { value: 'feedback' } });
    fireEvent.click(screen.getByText('Communication & feedback'));
    click('Edit');
    fireEvent.change(screen.getByPlaceholderText('Bundle name'), { target: { value: 'Feedback' } });
    const tag = screen.getByPlaceholderText('Add a tag and press Enter');
    fireEvent.change(tag, { target: { value: 'coaching' } });
    fireEvent.keyDown(tag, { key: 'Enter' });
    expect(current.bundles.find((b) => b.id === 'B4')).toMatchObject({ name: 'Feedback', tags: expect.arrayContaining(['coaching']) });
    expect(content.saveBundleSoon).toHaveBeenCalled();
  });
  it('adds a source on the sources tab', () => {
    kb({ kbOpen: true, kbSel: 'B8', kbTab: 'sources' });
    fireEvent.change(screen.getByPlaceholderText('File name, e.g. Pricing method v2.pdf'), { target: { value: 'Agenda v3.docx' } });
    click('Add');
    expect(current.bundles.find((b) => b.id === 'B8')!.sources.at(-1)![0]).toBe('Agenda v3.docx');
  });
  it('manages RAG models on the models tab', () => {
    kb({ kbOpen: true, kbSel: 'B1', kbTab: 'models' });
    click('+ New RAG model');
    click('Set as default');
    expect(toast()).toBe('New model is now the default for creators');
    click('Duplicate');
    click('Delete');
    expect(current.bundles.find((b) => b.id === 'B1')!.models.map((m) => m.name)).toEqual(['Precise · cite everything', 'Broad exploration', 'New model']);
  });
  it('validates and downloads on the files tab', () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    kb({ kbOpen: true, kbSel: 'B8', kbTab: 'files' });
    click('Validate');
    expect(screen.getByText('Conformant OKF v0.2 bundle')).toBeTruthy();
    click('Download .tar');
    expect(toast()).toMatch(/^Downloaded \d+ OKF files as facilitation-toolkit\.okf\.tar$/);
  });
  it('tests retrieval on the test tab', () => {
    kb({ kbOpen: true, kbSel: 'B2', kbTab: 'test' });
    fireEvent.change(screen.getByPlaceholderText('Ask what a creator would ask'), { target: { value: 'Pillar Two groups consolidated revenue' } });
    click('Ask');
    expect(current.kbAnswer).toMatch(/\[1\]/);
  });
  it('creates a new bundle', () => {
    kb();
    click('+ New bundle');
    expect(current.bundles[0].name).toBe('New bundle');
    expect(screen.getByPlaceholderText('Bundle name')).toBeTruthy();
  });
});
