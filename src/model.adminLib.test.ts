// Admin learning library: list, filters, the add/edit drawer, validation, status, line options, remove, program import (FT-ADM-*).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import { BLS, IMPORT_RESULTS, LEARN, LEARN_META, MAPS0, PROGRAMS } from './data';
import * as store from './lib/contentStore';
import { deferred, domainAdmin, flush, generalAdmin, harness, member, stubWindow, systemAdmin } from './test/harness';

vi.mock('./lib/contentStore', async (orig) => ({ ...(await orig<object>()), saveLearning: vi.fn(async () => {}), removeLearning: vi.fn(async () => {}), publishMappings: vi.fn(async () => {}), saveBundleSoon: vi.fn(), saveBundleNow: vi.fn() }));
vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(), addAmbition: vi.fn(), addInterest: vi.fn(), removeAmbition: vi.fn(), removeInterest: vi.fn(), saveProgress: vi.fn(), savePrefs: vi.fn(), loadLearner: vi.fn(),
}));

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { Object.keys(LEARN_META).forEach((k) => delete LEARN_META[k]); });

const ev = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>;
const admin = (access = generalAdmin(), state = {}) => harness({ access, state: { screen: 'adminLib' as const, ...state } });
const form = (h: ReturnType<typeof admin>, patch: Record<string, string>) => ({ ...h.L().blankForm(), ...patch });

describe('the admin learning list', () => {
  it('lists every learning with its effort, paths and publication status', () => {
    const vm = admin().vm();
    expect(vm.adminRows).toHaveLength(LEARN.length);
    expect(vm.adminRows.find((r) => r.id === 'L7')).toMatchObject({ effort: '1.5 h', paths: 'Consulting · Analyst · Audit · Analyst · Tax & Legal · Analyst', pubStatus: 'accepted', pubLabel: 'Published' });
    expect(vm.adminRows.find((r) => r.id === 'L5')!.effort).toBe('12 h · 6 CPD');
    const onNoPath = LEARN.find((r) => !BLS.some((b) => MAPS0[b].some((m) => m[0] === r[0])))!;
    expect(vm.adminRows.find((r) => r.id === onNoPath[0])!.paths).toBe('Not on a path');
  });
  it('searches title and source', () => {
    const h = admin();
    h.vm().setAdminQ(ev('MICROSOFT'));
    expect(h.vm().adminRows.map((r) => r.id)).toEqual(['L23', 'L26', 'L35']);
  });
  it('filters by publication status and names the owning line', () => {
    LEARN_META.L19 = { line: 'Audit', status: 'review' };
    LEARN_META.L22 = { line: null, status: 'draft' };
    const h = admin();
    h.vm().setAdminStatus('Needs review');
    expect(h.vm().adminRows.map((r) => [r.id, r.pubStatus, r.pubLabel])).toEqual([['L19', 'clarification', 'Needs review · Audit']]);
    h.vm().setAdminStatus('Draft');
    expect(h.vm().adminRows.map((r) => r.id)).toEqual(['L22']);
    expect(h.vm().pubOptions.map((o) => o.value)).toEqual(['all', 'Published', 'Needs review', 'Draft']);
  });
  it('counts learnings per connected program', () => {
    const vm = admin().vm();
    expect(vm.programs.map((p) => p.name)).toEqual(PROGRAMS.map((p) => p[0]));
    expect(vm.programs.find((p) => p.name === 'Microsoft Learn')!.count).toBe(3);
  });
  it('starts a sync', () => {
    const h = admin();
    h.vm().syncNow();
    expect(h.lastToast()).toMatch(/^Sync started/);
  });
});

describe('opening the drawer', () => {
  it('adds a learning with the first line the admin may use', () => {
    const g = admin();
    g.vm().openDrawer();
    expect(g.state).toMatchObject({ drawerOpen: true, libForm: { id: null, title: '', domain: 'prof', level: '2', format: 'E-learning', line: '', status: 'draft' } });
    expect(g.vm().lfTitle).toBe('Add a learning');
    const d = admin(domainAdmin(['Audit']));
    d.vm().openDrawer();
    expect(d.state.libForm!.line).toBe('Audit');
  });
  it('offers firm-wide only to General and System Admins', () => {
    expect(admin().vm().lineOptions.map((o) => o.label)).toEqual(['Firm-wide · all business lines', 'Consulting only', 'Audit only', 'Tax & Legal only']);
    expect(admin(systemAdmin()).vm().lineOptions).toHaveLength(4);
    expect(admin(domainAdmin(['Audit', 'Consulting'])).vm().lineOptions.map((o) => o.value)).toEqual(['Consulting', 'Audit']);
  });
  it('refuses someone who administers nothing', () => {
    const h = admin(member());
    h.vm().openDrawer();
    expect(h.state.drawerOpen).toBe(false);
    expect(h.lastToast()).toBe('Only admins add learnings');
  });
  it('edits an existing learning of my line with its current values', () => {
    LEARN_META.L17 = { line: 'Audit', status: 'review' };
    const h = admin(domainAdmin(['Audit']));
    h.vm().adminRows.find((r) => r.id === 'L17')!.edit();
    expect(h.state.libForm).toEqual({ id: 'L17', title: 'GDPR for consultants', domain: 'reg', level: '2', format: 'E-learning', source: 'Internal academy', hours: '1.5', cpd: '1', why: LEARN.find((r) => r[0] === 'L17')![9], line: 'Audit', status: 'review' });
    expect(h.vm().lfTitle).toBe('Edit learning');
  });
  it('refuses a learning of another line', () => {
    LEARN_META.L17 = { line: 'Tax & Legal', status: 'published' };
    const h = admin(domainAdmin(['Audit']));
    h.vm().adminRows.find((r) => r.id === 'L17')!.edit();
    expect(h.wrote('libForm')).toBe(false);
    expect(h.lastToast()).toBe('Tax & Legal learning · Tax & Legal Domain Admins or a General Admin edit it');
  });
  it('closes and forgets the form', () => {
    const h = admin(generalAdmin(), { drawerOpen: true, libForm: { ...admin().L().blankForm(), title: 'x' } });
    h.vm().closeDrawer();
    expect(h.state).toMatchObject({ drawerOpen: false, libForm: null });
  });
});

describe('typing in the form', () => {
  it('updates each field', () => {
    const h = admin(generalAdmin(), { libForm: admin().L().blankForm() });
    h.vm().lfSet.title(ev('Pricing'));
    h.vm().lfSet.hours(ev('3'));
    h.vm().lfSet.line(ev('Audit'));
    expect(h.state.libForm).toMatchObject({ title: 'Pricing', hours: '3', line: 'Audit' });
  });
  it('ignores typing once the form is closed', () => {
    const h = admin();
    h.vm().lfSet.title(ev('late'));
    expect(h.state.libForm).toBeNull();
  });
});

describe('importing from a connected program', () => {
  it('filters the catalogue results', () => {
    const h = admin();
    h.vm().setImportQ(ev('CLOUD'));
    expect(h.vm().importResults.map((r) => r.title)).toEqual(['Cloud economics for advisors']);
    expect(admin().vm().importResults).toHaveLength(IMPORT_RESULTS.length);
  });
  it('prefills title, source, hours and domain, keeping the rest of the form', () => {
    const h = admin(generalAdmin(), { libForm: { ...admin().L().blankForm(), why: 'kept', line: 'Audit' } });
    h.vm().importResults[0].import();
    expect(h.state.libForm).toMatchObject({ title: 'Negotiation for consultants', source: 'Coursera', hours: '6', domain: 'prof', why: 'kept', line: 'Audit' });
    const blank = admin(domainAdmin(['Audit']));
    blank.vm().importResults[2].import();
    expect(blank.state.libForm).toMatchObject({ title: 'Supply chain analytics', source: 'edX', hours: '10', domain: 'tech', line: 'Audit', status: 'draft' });
  });
});

describe('validating the form', () => {
  const tryIt = async (patch: Record<string, string>) => {
    const h = admin();
    const h2 = admin(generalAdmin(), { libForm: form(h, patch) });
    await h2.L().saveLearningForm('published');
    return h2;
  };
  it('needs a title', async () => {
    expect((await tryIt({ title: '   ', hours: '2' })).lastToast()).toBe('Give the learning a title');
  });
  it('needs a positive number of hours', async () => {
    for (const hours of ['', '0', '-1', 'two']) expect((await tryIt({ title: 'T', hours })).lastToast()).toBe('Effort must be a number of hours above zero');
  });
  it('needs CPD units to be a number', async () => {
    expect((await tryIt({ title: 'T', hours: '1', cpd: 'lots' })).lastToast()).toBe('CPD units must be a number');
    expect((await tryIt({ title: 'T', hours: '1', cpd: '-2' })).lastToast()).toBe('CPD units must be a number');
  });
  it('saves nothing when invalid', async () => {
    await tryIt({ title: '' });
    expect(store.saveLearning).not.toHaveBeenCalled();
  });
  it('does nothing without an open form', async () => {
    await admin().L().saveLearningForm('draft');
    expect(store.saveLearning).not.toHaveBeenCalled();
  });
});

describe('saving a learning', () => {
  it('publishes a firm-wide learning with trimmed fields and decimal commas', async () => {
    const h = admin(generalAdmin(), { drawerOpen: true, libForm: form(admin(), { title: ' Pricing basics ', source: ' Coursera ', hours: '2,5', cpd: '1,5', why: ' because ', level: '3' }) });
    await h.L().saveLearningForm('published');
    expect(store.saveLearning).toHaveBeenCalledWith({ title: 'Pricing basics', domain: 'prof', level: 3, format: 'E-learning', source: 'Coursera', hours: 2.5, cpd: 1.5, due: '', why: 'because', business_line: null, status: 'published' }, undefined);
    expect(h.reloadContent).toHaveBeenCalled();
    expect(h.state).toMatchObject({ drawerOpen: false, libForm: null });
    expect(h.lastToast()).toBe('Published · learners see it in the library · Firm-wide');
  });
  it('marks a learning for review on a line', async () => {
    const h = admin(domainAdmin(['Audit']), { libForm: form(admin(domainAdmin(['Audit'])), { title: 'T', hours: '1' }) });
    await h.L().saveLearningForm('review');
    expect(store.saveLearning).toHaveBeenCalledWith(expect.objectContaining({ business_line: 'Audit', status: 'review', cpd: 0 }), undefined);
    expect(h.lastToast()).toBe('Saved · marked as needing review · Audit');
  });
  it('keeps the deadline of an edited learning', async () => {
    const h = admin(generalAdmin(), { libForm: { ...admin().L().formFor(LEARN.find((r) => r[0] === 'L17')!) } });
    await h.L().saveLearningForm('published');
    expect(store.saveLearning).toHaveBeenCalledWith(expect.objectContaining({ due: '30 Nov 2026', hours: 1.5, cpd: 1 }), 'L17');
  });
  it('refuses to make a learning a draft while another line still maps it', async () => {
    const h = admin(domainAdmin(['Consulting']), { libForm: { ...admin().L().formFor(LEARN.find((r) => r[0] === 'L7')!), line: 'Consulting' } });
    await h.L().saveLearningForm('draft');
    expect(store.saveLearning).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Still mapped for Audit, Tax & Legal · ask their admins to unmap it before it becomes a draft');
    await h.L().saveLearningForm('published');
    expect(store.saveLearning).toHaveBeenCalledTimes(1);
  });
  it('keeps the drawer open and shows why when the database refuses', async () => {
    vi.mocked(store.saveLearning).mockRejectedValueOnce(new Error('Not saved · you can only edit learnings of your own business line'));
    const h = admin(generalAdmin(), { drawerOpen: true, libForm: form(admin(), { title: 'T', hours: '1' }) });
    await h.L().saveLearningForm('draft');
    expect(h.state.drawerOpen).toBe(true);
    expect(h.lastToast()).toBe('Not saved · you can only edit learnings of your own business line');
    expect(h.reloadContent).not.toHaveBeenCalled();
  });
  it('saves once when clicked twice', async () => {
    const gate = deferred();
    vi.mocked(store.saveLearning).mockImplementationOnce(() => gate.promise);
    const h = admin(generalAdmin(), { libForm: form(admin(), { title: 'T', hours: '1' }) });
    const first = h.vm().saveDraft();
    await h.vm().savePublish();
    expect(store.saveLearning).toHaveBeenCalledTimes(1);
    gate.resolve();
    await first;
    expect(h.state.libForm).toBeNull();
    const again = admin(generalAdmin(), { libForm: form(admin(), { title: 'U', hours: '1' }) });
    await again.vm().saveReview();
    expect(store.saveLearning).toHaveBeenCalledTimes(2);
  });
});

describe('removing a learning', () => {
  it('removes it with its mappings and reloads', async () => {
    const h = admin(generalAdmin(), { drawerOpen: true, libForm: { ...admin().L().formFor(LEARN.find((r) => r[0] === 'L6')!) } });
    h.vm().removeLearning();
    await flush();
    expect(store.removeLearning).toHaveBeenCalledWith('L6');
    expect(h.reloadContent).toHaveBeenCalled();
    expect(h.state).toMatchObject({ drawerOpen: false, libForm: null });
    expect(h.lastToast()).toBe('Removed “Behavioural economics for advisors” and its curriculum mappings');
  });
  it('shows why when the database refuses', async () => {
    vi.mocked(store.removeLearning).mockRejectedValueOnce(new Error('Not removed · you can only remove learnings of your own business line'));
    const h = admin(generalAdmin(), { libForm: { ...admin().L().formFor(LEARN.find((r) => r[0] === 'L6')!) } });
    await h.L().removeLearningForm();
    expect(h.lastToast()).toBe('Not removed · you can only remove learnings of your own business line');
  });
  it('does nothing for a learning that was never saved', async () => {
    const h = admin(generalAdmin(), { libForm: admin().L().blankForm() });
    await h.L().removeLearningForm();
    expect(store.removeLearning).not.toHaveBeenCalled();
  });
  it('lets a General Admin remove a learning every line maps', async () => {
    const h = admin(generalAdmin(), { libForm: { ...admin().L().formFor(LEARN.find((r) => r[0] === 'L7')!) } });
    await h.L().removeLearningForm();
    expect(store.removeLearning).toHaveBeenCalledWith('L7');
  });
});

describe('a member reaching the admin library', () => {
  it('cannot open a learning for editing', () => {
    const h = admin(member());
    h.vm().adminRows[0].edit();
    expect(h.wrote('libForm')).toBe(false);
    expect(h.lastToast()).toBe('Firm-wide learning · a General or System Admin edits it');
  });
});
