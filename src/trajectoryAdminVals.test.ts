// Admin trajectory editor (design v4): list, "+ New", steps, mapping, who may do what, warnings and the coverage ◆ count.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import * as store from './lib/trajectoryStore';
import type { Trajectory } from './logic/trajectory';
import { blankTrajectory } from './logic/trajectoryEdit';
import { LEARN_META } from './data';
import type { Access, AppState } from './types';
import { domainAdmin, flush, generalAdmin, harness, stubWindow, systemAdmin } from './test/harness';

vi.mock('./lib/trajectoryStore', async (orig) => ({ ...(await orig<object>()), createTrajectory: vi.fn(), saveTrajectorySoon: vi.fn(), saveTrajectoryNow: vi.fn() }));
beforeEach(() => { stubWindow(); vi.clearAllMocks(); });

const ev = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement & HTMLSelectElement>;
const T = (id: string, over: Partial<Trajectory> = {}): Trajectory => ({
  ...blankTrajectory(null), id, name: 'Trajectory ' + id, credential: 'Credential', status: 'draft',
  steps: [{ id: 's1', k: 'learn', lid: 'L1', win: 3, req: true, pre: null }, { id: 's2', k: 'exam', title: 'Exam', hours: 2, win: 12, req: true, pre: 's1' }], ...over,
});
const setup = (trjs: Trajectory[], access: Access = systemAdmin(), state: Partial<AppState> = {}) =>
  harness({ access, state: { screen: 'adminMap', mapMode: 'traj', trjs, trjSel: trjs[0]?.id ?? null, ...state } });

describe('the tabs and the list', () => {
  it('switches between learnings and trajectories, with the count on the tab', () => {
    const h = setup([T('T1'), T('T2')], systemAdmin(), { mapMode: 'learn' });
    expect(h.vm().isTrjMode).toBe(false);
    expect(h.vm().mapModeTabs.map((t) => t.label)).toEqual(['Single learnings', 'Certification trajectories · 2']);
    h.vm().setMapMode('traj');
    expect(h.state.mapMode).toBe('traj');
    expect(h.vm().isTrjMode).toBe(true);
  });
  it('lists trajectories with status, entry and audiences', () => {
    const h = setup([T('T1', { enrol: 'auto', status: 'live', maps: [['Audit', 'Manager', 'mandatory'], ['amb:sust', 'Manager', 'advised']] })]);
    const row = h.vm().trjList[0];
    expect(row).toMatchObject({ name: 'Trajectory T1', on: true, st: 'accepted', stLabel: 'Live', enrolLabel: 'Auto-enrol' });
    expect(row.auds.map((a) => a.label)).toEqual(['Audit · Manager · mandatory', 'Sustainability lead · Manager · suggested']);
    expect(row.meta).toContain('2 steps');
  });
});

describe('+ New', () => {
  it('creates a draft named "New trajectory" in the admin\'s line and selects it', async () => {
    vi.mocked(store.createTrajectory).mockImplementation(async (d) => ({ ...d, id: 'T9', published_at: null }));
    const h = setup([], domainAdmin(['Audit']));
    h.vm().trjNew(); await flush();
    expect(store.createTrajectory).toHaveBeenCalledWith(expect.objectContaining({ name: 'New trajectory', status: 'draft', enrol: 'open', business_line: 'Audit' }));
    expect(h.state.trjs.map((t) => t.id)).toEqual(['T9']);
    expect(h.state.trjSel).toBe('T9');
  });
  it('is firm-wide for a System Admin', async () => {
    vi.mocked(store.createTrajectory).mockImplementation(async (d) => ({ ...d, id: 'T9', published_at: null }));
    const h = setup([]);
    h.vm().trjNew(); await flush();
    expect(store.createTrajectory).toHaveBeenCalledWith(expect.objectContaining({ business_line: null }));
  });
  it('says so when it could not be created', async () => {
    vi.mocked(store.createTrajectory).mockRejectedValue(new Error('Not allowed · ask an admin'));
    const h = setup([]);
    h.vm().trjNew(); await flush();
    expect(h.lastToast()).toBe('Not saved · Not allowed · ask an admin');
    expect(h.state.trjs).toEqual([]);
  });
});

describe('steps', () => {
  it('adds a learning, electives, evidence, sign-off and exam with new ids', () => {
    const h = setup([T('T1')]);
    h.vm().tj!.addLearn(ev('L2'));
    h.vm().tj!.addElect(); h.vm().tj!.addEvidence(); h.vm().tj!.addCheck(); h.vm().tj!.addExam();
    const steps = h.state.trjs[0].steps;
    expect(steps.map((s) => s.k)).toEqual(['learn', 'exam', 'learn', 'elect', 'evidence', 'check', 'exam']);
    expect(steps.slice(0, 2).map((s) => s.id)).toEqual(['s1', 's2']);
    expect(new Set(steps.map((s) => s.id)).size).toBe(7);
    expect(steps[2].lid).toBe('L2');
    expect(h.state.trjStep).toBe(steps[6].id);
  });
  it('offers only published learnings that no step uses', () => {
    const h = setup([T('T1')]);
    const ids = h.vm().tj!.learnOptions.map((o) => o.value);
    expect(ids[0]).toBe('');
    expect(ids).not.toContain('L1');
    expect(ids).toContain('L2');
  });
  it('tags a case that counts as trajectory evidence in the step and elective pickers', () => {
    const was = LEARN_META.L2;
    try {
      LEARN_META.L2 = { line: null, status: 'published', content: { kind: 'case', brief: 'b', deliv: ['d'], rubric: ['r'], reviewer: 'Reviewed by your counsellor.', evidence: true } };
      const h = setup([T('T1')]);
      expect(h.vm().tj!.learnOptions.find((o) => o.value === 'L2')!.label).toMatch(/ · counts as trajectory evidence$/);
      expect(h.vm().tj!.learnOptions.filter((o) => /evidence/.test(o.label)).map((o) => o.value)).toEqual(['L2']);
      LEARN_META.L2 = { ...LEARN_META.L2, content: { kind: 'case', brief: 'b', deliv: ['d'], rubric: ['r'], reviewer: 'x', evidence: false } };
      expect(h.vm().tj!.learnOptions.find((o) => o.value === 'L2')!.label).not.toMatch(/evidence/);
    } finally { if (was) LEARN_META.L2 = was; else delete LEARN_META.L2; }
  });
  it('moves a step up and down by id', () => {
    const h = setup([T('T1', { steps: [{ id: 's1', k: 'evidence', title: 'A', win: 1, req: true, pre: null }, { id: 's2', k: 'evidence', title: 'B', win: 1, req: true, pre: null }] })]);
    expect(h.vm().tj!.steps.map((s) => [s.noUp, s.noDown])).toEqual([[true, false], [false, true]]);
    h.vm().tj!.steps[1].up();
    expect(h.state.trjs[0].steps.map((s) => s.id)).toEqual(['s2', 's1']);
    h.vm().tj!.steps[0].down();
    expect(h.state.trjs[0].steps.map((s) => s.id)).toEqual(['s1', 's2']);
  });
  it('removing a step clears the prerequisite that pointed at it', () => {
    const h = setup([T('T1')]);
    h.vm().tj!.steps[0].remove();
    expect(h.state.trjs[0].steps.map((s) => [s.id, s.pre])).toEqual([['s2', null]]);
  });
  it('"Only after" lists just the earlier steps', () => {
    const h = setup([T('T1')], systemAdmin(), { trjStep: 's2' });
    expect(h.vm().tse!.preOptions.map((o) => o.value)).toEqual(['', 's1']);
    expect(h.vm().tse!.pre).toBe('s1');
    h.vm().tse!.setPre(ev(''));
    expect(h.state.trjs[0].steps[1].pre).toBeNull();
  });
  it('an exam is always required; evidence can be made optional', () => {
    const h = setup([T('T1', { steps: [{ id: 's1', k: 'evidence', title: 'E', win: 1, req: true, pre: null }, { id: 's2', k: 'exam', title: 'X', win: 2, req: true, pre: null }] })], systemAdmin(), { trjStep: 's1' });
    expect(h.vm().tse!.canReq).toBe(true);
    h.vm().tse!.toggleReq();
    expect(h.state.trjs[0].steps[0].req).toBe(false);
    expect(setup([T('T1')], systemAdmin(), { trjStep: 's2' }).vm().tse!.canReq).toBe(false);
  });
  it('electives: options added and removed keep "pick" within range', () => {
    const h = setup([T('T1')]);
    h.vm().tj!.addElect();
    h.vm().tse!.addOpt(ev('L2')); h.vm().tse!.addOpt(ev('L3'));
    h.vm().tse!.setPick(ev('2'));
    expect(h.state.trjs[0].steps[2]).toMatchObject({ opts: ['L2', 'L3'], pick: 2 });
    h.vm().tse!.opts[0].remove();
    expect(h.state.trjs[0].steps[2]).toMatchObject({ opts: ['L3'], pick: 1 });
  });
});

describe('editing the trajectory', () => {
  it('updates state at once and saves shortly after, the latest version', () => {
    const h = setup([T('T1')]);
    h.vm().tj!.setName(ev('Renamed'));
    expect(h.state.trjs[0].name).toBe('Renamed');
    const [id, latest] = vi.mocked(store.saveTrajectorySoon).mock.calls[0];
    expect(id).toBe('T1');
    h.vm();
    expect(latest()?.name).toBe('Renamed');
  });
  it('keeps an empty credential on screen but does not save it', () => {
    const h = setup([T('T1')]);
    h.vm().tj!.setCred(ev(''));
    expect(h.state.trjs[0].credential).toBe('');
    h.vm();
    expect(vi.mocked(store.saveTrajectorySoon).mock.calls[0][1]()).toBeUndefined();
  });
  it('maps a credential validity and expected duration', () => {
    const h = setup([T('T1')]);
    h.vm().tj!.setValid(ev('24')); h.vm().tj!.setMonths(ev('18'));
    expect(h.state.trjs[0]).toMatchObject({ valid_months: 24, months: 18 });
    h.vm().tj!.setValid(ev('0'));
    expect(h.state.trjs[0].valid_months).toBeNull();
  });
});

describe('mapping', () => {
  it('maps to an audience and stage, once', () => {
    const h = setup([T('T1', { enrol: 'auto' })], systemAdmin(), { trjAud: 'Audit', trjStage: 'Manager' });
    h.vm().tj!.addMap();
    expect(h.state.trjs[0].maps).toEqual([['Audit', 'Manager', 'mandatory']]);
    h.vm().setTrjAud(ev('Audit'));
    h.vm().tj!.addMap();
    expect(h.lastToast()).toBe('Already mapped to Audit · Manager');
    expect(h.state.trjs[0].maps).toHaveLength(1);
  });
  it('needs an audience first', () => {
    const h = setup([T('T1')], systemAdmin(), { trjAud: '' });
    h.vm().tj!.addMap();
    expect(h.lastToast()).toBe('Choose an audience first');
  });
  it('shows "Suggested only" for ambition and profile audiences and offers mandatory for business lines, industries and technologies', () => {
    const h = setup([T('T1', { maps: [['amb:sust', 'Manager', 'advised'], ['Audit', 'Manager', 'advised'], ['ind:energy', 'Manager', 'advised'], ['tec:data', 'Manager', 'advised'], ['pro:blue', 'Manager', 'advised']] })]);
    expect(h.vm().tj!.maps.map((m) => [m.canMand, m.noMand])).toEqual([[false, true], [true, false], [true, false], [true, false], [false, true]]);
  });
  it('changes the obligation and removes a map', () => {
    const h = setup([T('T1', { maps: [['Audit', 'Manager', 'advised']] })]);
    h.vm().tj!.maps[0].setOb('mandatory');
    expect(h.state.trjs[0].maps[0][2]).toBe('mandatory');
    h.vm().tj!.maps[0].remove();
    expect(h.state.trjs[0].maps).toEqual([]);
  });
  it('lists only the audiences this admin may edit', () => {
    const labels = (a: Access) => setup([T('T1')], a).vm().trjAudOptions.map((o) => o.value);
    expect(labels(systemAdmin())).toContain('amb:sust');
    expect(labels(generalAdmin())).toContain('ind:energy');
    expect(labels(domainAdmin(['Audit']))).toEqual(['', 'Audit']);
  });
});

describe('who sees and publishes what', () => {
  const all = [T('T1', { business_line: 'Audit' }), T('T2', { business_line: 'Consulting' }), T('T3', { business_line: null })];
  it('a Domain Admin sees only the trajectories of their line; System and General Admins see all', () => {
    expect(setup(all, domainAdmin(['Audit'])).vm().trjList.map((r) => r.name)).toEqual(['Trajectory T1']);
    expect(setup(all, systemAdmin()).vm().trjList).toHaveLength(3);
    expect(setup(all, generalAdmin()).vm().trjList).toHaveLength(3);
  });
  it('a Domain Admin cannot set Live on a trajectory with a mandatory map; a General Admin can', () => {
    const t = T('T1', { business_line: 'Audit', enrol: 'auto', maps: [['Audit', 'Manager', 'mandatory']] });
    const da = setup([t], domainAdmin(['Audit']));
    expect(da.vm().trjStatusOptions).toEqual([{ value: 'draft', label: 'Draft' }, { value: 'live', label: 'Live', disabled: true }, { value: 'retired', label: 'Retired' }]);
    da.vm().tj!.setStatus('live');
    expect(da.state.trjs[0].status).toBe('draft');
    expect(da.lastToast()).toMatch(/General or System Admin/);
    const ga = setup([t], generalAdmin());
    expect(ga.vm().trjStatusOptions[1].disabled).toBeFalsy();
    ga.vm().tj!.setStatus('live');
    expect(ga.state.trjs[0].status).toBe('live');
  });
  it('a Domain Admin can set Live when no map is mandatory', () => {
    const da = setup([T('T1', { business_line: 'Audit', maps: [['Audit', 'Manager', 'advised']] })], domainAdmin(['Audit']));
    expect(da.vm().trjStatusOptions[1].disabled).toBeFalsy();
    da.vm().tj!.setStatus('live');
    expect(da.state.trjs[0].status).toBe('live');
  });
  it('a Domain Admin cannot make a live trajectory mandatory', () => {
    const da = setup([T('T1', { business_line: 'Audit', status: 'live', maps: [['Audit', 'Manager', 'advised']] })], domainAdmin(['Audit']));
    da.vm().tj!.maps[0].setOb('mandatory');
    expect(da.state.trjs[0].maps[0][2]).toBe('advised');
  });
});

describe('warnings and the learner\'s eye', () => {
  it('shows the admin warnings', () => {
    const h = setup([T('T1', { enrol: 'auto', maps: [['amb:sust', 'Manager', 'advised']], credential: '' })]);
    const w = h.vm().tj!.warns.map((x) => x.text);
    expect(w).toContain('Only business-line, industry and technology audiences are auto-enrolled; ambition and profile audiences see a suggestion.');
    expect(w).toContain('Name the credential people earn.');
    expect(h.vm().tj!.hasWarn).toBe(true);
  });
  it('warns, first, that a trajectory without a name or credential is not saved', () => {
    const h = setup([T('T1', { credential: ' ' })]);
    expect(h.vm().tj!.warns[0].text).toBe('Not saved until it has a name and a credential.');
    expect(setup([T('T1', { name: '' })]).vm().tj!.warns[0].text).toBe('Not saved until it has a name and a credential.');
    expect(setup([T('T1')]).vm().tj!.warns.map((w) => w.text)).not.toContain('Not saved until it has a name and a credential.');
  });
  it('warns about a step whose learning is not published (draft or needs review)', () => {
    const was = LEARN_META.L1;
    try {
      LEARN_META.L1 = { line: null, status: 'draft' };
      expect(setup([T('T1')]).vm().tj!.warns.map((w) => w.text)).toContain('Step 1 points at a learning that is unpublished or no longer in the library.');
      LEARN_META.L1 = { line: null, status: 'review' };
      expect(setup([T('T1')]).vm().tj!.warns.map((w) => w.text)).toContain('Step 1 points at a learning that is unpublished or no longer in the library.');
    } finally { if (was) LEARN_META.L1 = was; else delete LEARN_META.L1; }
    expect(setup([T('T1')]).vm().tj!.warns.map((w) => w.text)).not.toContain('Step 1 points at a learning that is unpublished or no longer in the library.');
  });
  it('promises only what happens: the counsellor accepts the exam, the wallet shows "Renew by"', () => {
    const tj = setup([T('T1', { issuer: 'ITAA', valid_months: 24, renewal: '20 CPD units a year' })]).vm().tj!;
    expect(tj.credMeta).toBe('ITAA · awarded when the counsellor accepts the exam · valid 2 years');
    expect(tj.renewMeta).toBe('20 CPD units a year · the wallet shows "Renew by" 30 days before expiry');
  });
  it('counts the same trajectories on the tab and in the list', () => {
    const h = setup([T('T1'), T('T2', { status: 'retired' })]);
    expect(h.vm().trjCount).toBe('2');
    expect(h.vm().mapModeTabs[1].label).toBe('Certification trajectories · 2');
  });
  it('draws a stone per step, dashed when optional, then the credential and the renewal', () => {
    const h = setup([T('T1', { valid_months: 24, steps: [
      { id: 's1', k: 'learn', lid: 'L1', win: 3, req: false, pre: null }, { id: 's2', k: 'exam', title: 'Exam', hours: 2, win: 12, req: true, pre: 's1' }] })]);
    const st = h.vm().tj!.stones;
    expect(st.map((x) => x.mark)).toEqual(['1', '2', '◆', '↻']);
    expect(st[0].bd).toBe('1.5px dashed #8b918a');
    expect(st[1]).toMatchObject({ bg: '#1a1d18', bd: '1.5px solid #1a1d18' });
    expect(st[2]).toMatchObject({ label: 'Credential', when: 'month 12' });
    expect(st[3].when).toBe('every 2 years');
  });
});

describe('the coverage grid', () => {
  it('counts ◆ for the trajectories mapped to that audience and stage (retired ones not)', () => {
    const h = setup([
      T('T1', { maps: [['Audit', 'Manager', 'advised']] }), T('T2', { status: 'live', maps: [['Audit', 'Manager', 'mandatory'], ['Audit', 'Director', 'advised']] }),
      T('T3', { status: 'retired', maps: [['Audit', 'Manager', 'advised']] }),
    ], systemAdmin(), { mapMode: 'learn', mapLens: 'bl' });
    const audit = h.vm().covRows.find((r) => r.key === 'Audit')!;
    const cell = (stage: string) => audit.cells.find((c) => c.stage === stage)!;
    expect([cell('Manager').trjN, cell('Director').trjN, cell('Analyst').trjN]).toEqual(['2', '1', '0']);
    expect(cell('Manager').hasTrj).toBe(true);
    expect(cell('Analyst').hasTrj).toBe(false);
    expect(cell('Manager').tip).toContain('2 trajectories');
  });
  it('counts only what this admin sees', () => {
    const h = setup([T('T1', { business_line: 'Consulting', maps: [['Audit', 'Manager', 'advised']] })], domainAdmin(['Audit']), { mapMode: 'learn' });
    expect(h.vm().covRows.find((r) => r.key === 'Audit')!.cells.find((c) => c.stage === 'Manager')!.trjN).toBe('0');
  });
});

describe('business line', () => {
  const labels = (h: ReturnType<typeof setup>) => h.vm().tj!.lineOptions.map((o) => o.label);
  it('offers Firm-wide and every line to a System or General Admin', () => {
    expect(labels(setup([T('T1')]))).toEqual(['Firm-wide', 'Consulting', 'Audit', 'Tax & Legal']);
    expect(labels(setup([T('T1')], generalAdmin()))).toEqual(['Firm-wide', 'Consulting', 'Audit', 'Tax & Legal']);
  });
  it('offers a Domain Admin only the lines they administer', () => {
    const h = setup([T('T1', { business_line: 'Audit' })], domainAdmin(['Audit', 'Consulting']));
    expect(labels(h)).toEqual(['Consulting', 'Audit']);
    expect(h.vm().tj!.line).toBe('Audit');
  });
  it('shows null as Firm-wide and saves a change through saveTrajectorySoon', () => {
    const h = setup([T('T1')]);
    expect(h.vm().tj!.line).toBe('');
    h.vm().tj!.setLine(ev('Audit'));
    expect(h.state.trjs[0].business_line).toBe('Audit');
    expect(store.saveTrajectorySoon).toHaveBeenCalled();
    h.vm().tj!.setLine(ev(''));
    expect(h.state.trjs[0].business_line).toBeNull();
  });
  it('blocks a change the database would refuse', () => {
    const h = setup([T('T1', { business_line: 'Audit' })], domainAdmin(['Audit']));
    h.vm().tj!.setLine(ev('Consulting'));
    expect(h.state.trjs[0].business_line).toBe('Audit');
    expect(h.lastToast()).toMatch(/^Not changed/);
    expect(store.saveTrajectorySoon).not.toHaveBeenCalled();
  });
  it('lets a Domain Admin with two lines create on the first and switch to the second', async () => {
    vi.mocked(store.createTrajectory).mockImplementation(async (d) => ({ ...d, id: 'T9', published_at: null }));
    const h = setup([], domainAdmin(['Consulting', 'Audit']));
    h.vm().trjNew(); await flush();
    expect(h.state.trjs[0].business_line).toBe('Consulting');
    h.vm().tj!.setLine(ev('Audit'));
    expect(h.state.trjs[0].business_line).toBe('Audit');
  });
});
