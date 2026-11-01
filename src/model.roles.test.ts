// Navigation and roles, "View as" (read-only: nothing writes), the counsellor team view and career stages (FT-NAV-*, FT-VIEW-*, FT-TEAM-*, FT-STG-*).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMAINS, STAGES, TARGET } from './data';
import * as learner from './lib/learnerStore';
import type { Member } from './logic/team';
import type { Screen } from './types';
import { domainAdmin, flush, generalAdmin, harness, member, person, stubWindow, systemAdmin, withProgress } from './test/harness';

vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(async () => {}), addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));

beforeEach(() => { stubWindow({ localStorage: undefined }); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

const screenAfterGo = (access: ReturnType<typeof member>, screen: Screen) => { const h = harness({ access }); h.L().go(screen); return h.state.screen; };

describe('navigation by role', () => {
  it('sends a member who opens an admin screen back to the map', () => {
    expect((['adminLib', 'adminMap', 'adminKb', 'users'] as Screen[]).map((s) => screenAfterGo(member(), s))).toEqual(['map', 'map', 'map', 'map']);
    expect((['library', 'projects', 'profile', 'team'] as Screen[]).map((s) => screenAfterGo(member(), s))).toEqual(['library', 'projects', 'profile', 'team']);
  });
  it('lets a Domain Admin manage content and users of their line', () => {
    expect((['adminLib', 'adminMap', 'adminKb', 'users'] as Screen[]).map((s) => screenAfterGo(domainAdmin(['Audit']), s))).toEqual(['adminLib', 'adminMap', 'adminKb', 'users']);
  });
  it('lets a General Admin edit content but not open user management', () => {
    expect((['adminLib', 'adminMap', 'adminKb', 'users'] as Screen[]).map((s) => screenAfterGo(generalAdmin(), s))).toEqual(['adminLib', 'adminMap', 'adminKb', 'map']);
  });
  it('lets a System Admin open everything', () => {
    expect((['adminLib', 'adminMap', 'adminKb', 'users'] as Screen[]).map((s) => screenAfterGo(systemAdmin(), s))).toEqual(['adminLib', 'adminMap', 'adminKb', 'users']);
  });
  it('shows the administration menu and user management by role', () => {
    const flags = (access: ReturnType<typeof member>) => { const vm = harness({ access }).vm(); return [vm.showAdmin, vm.canManageUsers]; };
    expect([member(), domainAdmin(['Audit']), generalAdmin(), systemAdmin()].map(flags)).toEqual([[false, false], [true, true], [true, false], [true, true]]);
  });
  it('clears map selections when moving between screens', () => {
    const h = harness({ state: { sel: { type: 'hub', id: 'tech' }, mapSel: 'L1' } });
    h.vm().goLibrary();
    expect(h.state).toMatchObject({ screen: 'library', sel: null, mapSel: null });
  });
  it('navigates from every sidebar entry', () => {
    const h = harness({ access: systemAdmin() });
    const vm = h.vm();
    const go = [vm.goMap, vm.goLibrary, vm.goProj, vm.goProfile, vm.goTeam, vm.goAdminLib, vm.goAdminMap, vm.goKb, vm.goUsers];
    const seen = go.map((f) => { f(); return h.state.screen; });
    expect(seen).toEqual(['map', 'library', 'projects', 'profile', 'team', 'adminLib', 'adminMap', 'adminKb', 'users']);
    expect(h.state.kbOpen).toBe(false);
  });
  it('highlights the active entry, also for a detail opened from it', () => {
    const vm = harness({ state: { screen: 'detail', origin: 'profile', detailId: 'L1' } }).vm();
    expect([vm.navMap, vm.navLib, vm.navProj, vm.navProfile, vm.navAdminMap]).toEqual([false, false, false, true, false]);
    expect(harness({ state: { screen: 'detail', origin: 'adminMap', detailId: 'L1' } }).vm().navAdminMap).toBe(true);
    expect(harness({ state: { screen: 'detail', origin: 'projects', detailId: 'L1' } }).vm().navProj).toBe(true);
  });
  it('titles every screen', () => {
    const t = (screen: Screen) => { const vm = harness({ access: systemAdmin(), state: { screen } }).vm(); return [vm.crumb, vm.headerTitle]; };
    expect(t('map')).toEqual(['Me · Consultant · Consulting', 'My growth map']);
    expect(t('library')).toEqual(['Me · Library', 'Library']);
    expect(t('projects')).toEqual(['Me · Projects & evaluations', 'Projects & evaluations']);
    expect(t('profile')).toEqual(['Me · My profile', 'My profile']);
    expect(t('team')).toEqual(['Counsellor · counsellees', 'My team']);
    expect(t('adminLib')).toEqual(['Administration · Learning library', 'Learning library']);
    expect(t('adminMap')).toEqual(['Administration · Curriculum mapping · Consulting', 'Curriculum mapping']);
    expect(t('adminKb')).toEqual(['Administration · Knowledge library', 'Knowledge library']);
    expect(t('users')).toEqual(['Administration · User management', 'User management']);
  });
  it('counts pending curriculum changes in the menu', () => {
    expect(harness().vm()).toMatchObject({ pendingLabel: '', noPending: true });
    expect(harness({ state: { pending: { 'Consulting|L1': true, 'Audit|L2': true } } }).vm()).toMatchObject({ pendingLabel: '2 pending', noPending: false });
  });
  it('turns motion off from the prop', () => {
    expect(harness().vm().motionAttr).toBe('off');
    expect(harness({ config: { motion: true } }).vm().motionAttr).toBe('on');
  });
});

describe('the business line shown', () => {
  it('is the subject\'s line, then the configured one when they have none', () => {
    expect(harness({ subject: person({ businessLine: 'Tax & Legal' }) }).vm().bl).toBe('Tax & Legal');
    expect(harness({ subject: person({ businessLine: null }), config: { businessLine: 'Audit' } }).vm().bl).toBe('Audit');
  });
  it('drives which items are mandatory', () => {
    const audit = harness({ subject: person({ businessLine: 'Audit' }) }).vm();
    expect(audit.libItems.find((i) => i.id === 'L5')!.ob).toBe('mandatory');
    expect(harness().vm().libItems.find((i) => i.id === 'L5')!.ob).toBe('advised');
  });
});

describe('content rights per role', () => {
  it('lists the lines each role may give a learning or bundle', () => {
    const lines = (access: ReturnType<typeof member>) => harness({ access }).L().editableLines();
    expect(lines(systemAdmin())).toEqual(['', 'Consulting', 'Audit', 'Tax & Legal']);
    expect(lines(generalAdmin())).toEqual(['', 'Consulting', 'Audit', 'Tax & Legal']);
    expect(lines(domainAdmin(['Audit', 'Tax & Legal']))).toEqual(['Audit', 'Tax & Legal']);
    expect(lines(member())).toEqual([]);
  });
  it('keeps firm-wide content for General and System Admins', () => {
    const L = harness({ access: domainAdmin(['Audit']) }).L();
    expect([L.canEditLine(null), L.canEditLine('Audit'), L.canEditLine('Consulting')]).toEqual([false, true, false]);
    expect(L.whoEdits(null)).toBe('a General or System Admin edits it');
    expect(L.whoEdits('Audit')).toBe('Audit Domain Admins or a General Admin edit it');
    expect(L.lineName(null)).toBe('Firm-wide');
  });
});

describe('View as: someone else is read-only', () => {
  const viewed = person({ id: 'p2', name: 'Kim Learner', readOnly: true, data: withProgress({ L7: ['in-progress', 40] }, { ambitions: [{ id: '3', text: 'Grow', horizon: '1 year', doms: ['pers'], from: '' }], interests: [{ label: 'Writing', dom: 'pers' }] }) });
  const view = (state = {}) => harness({ subject: viewed, access: systemAdmin('admin'), state: { screen: 'detail' as Screen, detailId: 'L7', ...state } });
  const readOnly = 'Viewing Kim Learner · read-only';

  it('marks the sidebar card read-only', () => {
    expect(view().vm().who).toMatchObject({ name: 'Kim Learner', readOnly: true });
  });
  it('writes no progress: log hours, add to path, ask approval', async () => {
    const h = view();
    h.vm().logHours(); h.vm().addToPath(); h.vm().askApprove();
    h.vm().libItems.find((i) => i.id === 'L3')!.open();
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(h.toasts()).toEqual([readOnly, readOnly, readOnly]);
  });
  it('removes no ambitions or interests', async () => {
    const h = view();
    h.vm().ambitions[0].remove(); h.vm().interests[0].remove();
    await flush();
    expect(learner.removeAmbition).not.toHaveBeenCalled();
    expect(learner.removeInterest).not.toHaveBeenCalled();
    expect(h.reloadSubject).not.toHaveBeenCalled();
  });
  it('changes no avatar', () => {
    const h = view();
    h.vm().setInitials({ target: { value: 'xx' } } as never); h.vm().avatarSwatches[1].pick(); h.vm().removePhoto();
    expect(learner.savePrefs).not.toHaveBeenCalled();
    expect(h.wrote('avatarEdit')).toBe(false);
    expect(h.toasts()).toEqual([readOnly, readOnly, readOnly]);
  });
  it('starts no chat and saves no proposal', async () => {
    const h = view({ chatFor: 'p2', proposal: { interests: [{ label: 'Tax', domain: 'reg' }], ambition: null } });
    await h.L().send('hello');
    h.vm().saveProposal();
    await flush();
    expect(h.wrote('chat')).toBe(false);
    expect(learner.addInterest).not.toHaveBeenCalled();
    expect(learner.addAmbition).not.toHaveBeenCalled();
  });
  it('names the viewed person in copy', () => {
    const vm = view({ screen: 'team' }).vm();
    expect(vm.teamLead(0)).toBe('Nobody names Kim Learner as counsellor. Readiness is measured against each person\'s next stage in their business line; mandatory items are the ones the firm chases.');
  });
});

describe('the counsellor team view', () => {
  const m = (over: Partial<Member>): Member => ({ id: 'm1', name: 'Kim Learner', stage: 'Analyst', businessLine: 'Consulting', data: withProgress({}), ...over });
  it('counts counsellees in the lead', () => {
    const vm = harness().vm();
    expect([0, 1, 3].map((n) => vm.teamLead(n).split(' as counsellor')[0])).toEqual(['Nobody names you', 'One person names you', '3 people name you']);
  });
  it('summarises each counsellee: initials, grade, readiness, hours and overdue items', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-15T12:00:00Z'));
    const opened: string[] = [];
    const rows = harness().vm().teamRows([m({ data: withProgress({ L7: 'accepted' }) }), m({ id: 'm2', name: 'j.doe@example.com', stage: null, businessLine: null })], (id) => opened.push(id));
    expect(rows[0]).toMatchObject({ initials: 'KL', grade: 'Analyst · Consulting', hours: 2, mandStatus: 'clarification', mandLabel: '1 overdue', mandIcon: 'dot' });
    expect(rows[0].readinessLabel).toBe(rows[0].barW);
    expect(rows[0].cells.find((c) => c.overdue)!.title).toBe('Regulations · L0');
    expect(rows[0].cells[2]).toMatchObject({ v: 'L2', title: 'Personal growth · L2' });
    expect(rows[1]).toMatchObject({ initials: 'JD', grade: 'No stage · No line', mandLabel: 'On track', mandIcon: 'check', readinessLabel: '0%' });
    rows[1].open();
    expect(opened).toEqual(['m2']);
  });
  it('switches between roster and levels by domain', () => {
    const h = harness();
    expect(h.vm().teamTabs.map((t) => t.value)).toEqual(['roster', 'heat']);
    h.vm().setTeamTab('heat');
    expect(h.state.teamTab).toBe('heat');
    expect(h.vm().domShort).toEqual(DOMAINS.map((d) => d[2]));
  });
  // Bug: the heat-map footer "Expected at next stage" is a hard-coded list that disagrees with TARGET, the firm's next-stage expectation.
  it.fails('shows the firm\'s next-stage targets in the heat-map footer', () => {
    expect(harness().vm().heatTargets).toEqual(TARGET.map((v) => 'L' + v));
  });
});

describe('career stages', () => {
  it('go from Analyst to Partner, each followed by the next', () => {
    expect(STAGES).toEqual(['Analyst', 'Consultant', 'Senior consultant', 'Manager', 'Senior manager', 'Director', 'Partner']);
    const next = STAGES.map((stage) => harness({ subject: person({ stage }) }).vm().who.nextStage);
    expect(next).toEqual(['Consultant', 'Senior consultant', 'Manager', 'Senior manager', 'Director', 'Partner', 'Partner']);
  });
  it('treat a person without a stage as an Analyst heading for Consultant', () => {
    const vm = harness({ subject: person({ stage: null }) }).vm();
    expect(vm.who).toMatchObject({ roleLine: 'Consulting', nextStage: 'Consultant', readinessLine: '0% ready for Consultant' });
    expect(vm.centerSub).toBe('Analyst → Consultant · 0% ready');
    expect(vm.crumb).toBe('Me · Consulting');
  });
  it('count Director-stage mappings for a Senior manager and not before', () => {
    const maps = { ...harness().state.maps, Consulting: [['L3', 'Director', 'mandatory']] as [string, string, string][] };
    const ob = (stage: string) => harness({ subject: person({ stage }), state: { maps } }).vm().libItems.find((i) => i.id === 'L3')!.ob;
    expect([ob('Manager'), ob('Senior manager'), ob('Director'), ob('Partner')]).toEqual(['open', 'mandatory', 'mandatory', 'mandatory']);
  });
});
