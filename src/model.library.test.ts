// Library (search, filters, tiles, chips, covers) and learning detail (log hours, add to path, approval, accept, notes) (FT-LIB-*, FT-DET-*).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import { BLS, DOMAINS, LEARN, MAPS0 } from './data';
import * as learner from './lib/learnerStore';
import * as record from './lib/recordStore';
import { domainAdmin, flush, harness, member, person, stubWindow, systemAdmin, withProgress } from './test/harness';

vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(async () => {}), addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('./lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });

const input = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>;
const select = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLSelectElement>;
const coach = { id: 'c1', name: 'Sam Coach' };

describe('library search', () => {
  it('matches title, source and domain, ignoring case', () => {
    expect(harness({ state: { libQ: 'GDPR' } }).vm().libItems.map((i) => i.id)).toEqual(['L17']);
    expect(harness({ state: { libQ: 'perlego' } }).vm().libItems.every((i) => i.source === 'Perlego')).toBe(true);
    expect(harness({ state: { libQ: 'leadership' } }).vm().libItems.map((i) => i.dom)).toContain('lead');
  });
  it('updates the query from the search box', () => {
    const h = harness();
    h.vm().setLibQ(input('excel'));
    expect(h.state.libQ).toBe('excel');
    expect(h.vm().libResultText).toBe('1 of ' + LEARN.length + ' learnings');
  });
});

describe('library filters', () => {
  it('shows only mandatory items, and says for which line and stage', () => {
    const h = harness();
    h.vm().setLibOb('mandatory');
    const vm = h.vm();
    expect(vm.libItems.every((i) => i.ob === 'mandatory')).toBe(true);
    expect(vm.libItems.map((i) => i.id)).toEqual(['L1', 'L7', 'L10', 'L16', 'L17', 'L24', 'L30']);
    expect(vm.libResultText).toBe('7 of ' + LEARN.length + ' learnings · mandatory for Consulting up to the Senior consultant stage');
  });
  it('treats a learning I chose as chosen, and one mapped beyond my next stage as open', () => {
    const vm = harness({ subject: person({ data: withProgress({ L3: ['not-started', 0, true] }) }) }).vm();
    const by = (id: string) => vm.libItems.find((i) => i.id === id)!;
    expect(by('L3')).toMatchObject({ ob: 'chosen', obLabel: 'Chosen by me' });
    expect(by('L4')).toMatchObject({ ob: 'open', obLabel: 'Open', dueLabel: '' });
  });
  it('filters by level', () => {
    const h = harness();
    h.vm().setLibLevel(select('5'));
    expect(h.state.libLevel).toBe('5');
    expect(h.vm().libItems).toEqual([]);
    expect(harness({ state: { libLevel: '1' } }).vm().libItems.map((i) => i.id)).toEqual(['L16', 'L20', 'L25', 'L45', 'L46']);
    expect(harness().vm().levelOptions[0]).toEqual({ value: '0', label: 'Any level' });
  });
  it('filters by format tile, and the same tile clears it', () => {
    const h = harness();
    h.vm().fmtTiles.find((t) => t.key === 'Avatar')!.pick();
    expect(h.state.libFormat).toBe('Avatar');
    expect(h.vm().libItems.map((i) => i.id)).toEqual(['L38', 'L39', 'L40', 'L41']);
    h.vm().fmtTiles.find((t) => t.key === 'Avatar')!.pick();
    expect(h.state.libFormat).toBe('all');
  });
  it('filters by domain chip', () => {
    const h = harness();
    const chips = h.vm().domChips;
    expect(chips.map((c) => c.key)).toEqual(DOMAINS.map((d) => d[0]));
    expect(chips.every((c) => !c.on)).toBe(true);
    chips.find((c) => c.key === 'corp')!.onClick();
    expect(h.state.libDom).toBe('corp');
    const vm = h.vm();
    expect(vm.domChips.find((c) => c.key === 'corp')!.on).toBe(true);
    expect(vm.libItems.map((i) => i.id)).toEqual(['L20', 'L21', 'L22']);
    vm.domChips.find((c) => c.key === 'corp')!.onClick();
    expect(h.state.libDom).toBe('all');
  });
  it('combines filters and shows the empty state', () => {
    const vm = harness({ state: { libDom: 'corp', libFormat: 'Avatar' } }).vm();
    expect(vm.libEmpty).toBe(true);
    expect(vm.libResultText).toBe('0 of ' + LEARN.length + ' learnings');
  });
});

describe('library cards', () => {
  it('carry a cover, a status and the due date of a mandatory item', () => {
    const vm = harness({ subject: person({ data: withProgress({ L1: ['in-progress', 40] }) }) }).vm();
    const l17 = vm.libItems.find((i) => i.id === 'L17')!;
    expect(l17).toMatchObject({ kind: 'elearn', isMandatory: true, hasDue: true, dueLabel: 'Due 30 Nov 2026', dueColor: '#9a3d0c', meta: 'Internal academy · 1.5 h · Practitioner · L2 · 1 CPD' });
    expect(vm.libItems.find((i) => i.id === 'L1')).toMatchObject({ state: 'in-progress', stateLabel: 'In progress · 40%', pct: 40 });
    expect(vm.libItems.find((i) => i.id === 'L20')).toMatchObject({ ob: 'advised', dueLabel: 'By Analyst stage', dueColor: '#8b918a' });
  });
  it('introduce the avatar of an avatar-practice learning', () => {
    const l38 = harness().vm().libItems.find((i) => i.id === 'L38')!;
    expect(l38).toMatchObject({ isAvatar: true, avInit: 'MV', avWith: 'Practise with Marc Verhoeven · Procurement director, energy utility', kind: 'avatar' });
  });
  it('explain why an open learning is there', () => {
    const vm = harness().vm();
    expect(vm.libItems.find((i) => i.id === 'L6')!.why).toBe('Not on any Consulting path at your stage. Add it if it serves where you want to go; it still counts toward your hours and levels.');
    expect(vm.libItems.find((i) => i.id === 'L3')!.why).toMatch(/^Mapped for the Senior manager stage in Consulting\. Not on any Consulting path at your stage\./);
    expect(vm.libItems.find((i) => i.id === 'L7')!.why).toBe('Mandatory for the Analyst stage in Consulting. Your counsellor can tell you how it fits your next engagement.');
  });
  it('open the detail and remember where they came from', () => {
    const h = harness({ state: { screen: 'library' } });
    h.vm().libItems[0].open();
    expect(h.state).toMatchObject({ screen: 'detail', detailId: 'L1', origin: 'library', noteOpen: false });
    const m = harness({ state: { screen: 'map' } });
    m.vm().nextUp[0].open();
    expect(m.state).toMatchObject({ screen: 'detail', origin: 'map' });
    const a = harness({ state: { screen: 'adminLib' } });
    a.vm().libItems[0].open();
    expect(a.state.origin).toBe('library');
  });
  it('clear every filter at once', () => {
    const h = harness({ state: { libQ: 'x', libOb: 'open', libLevel: '3', libFormat: 'Book', libDom: 'acad' } });
    h.vm().clearLibFilters();
    expect(h.state).toMatchObject({ libQ: '', libOb: 'all', libLevel: '0', libFormat: 'all', libDom: 'all' });
  });
});

describe('learning detail', () => {
  const detail = (id: string, opts: Parameters<typeof harness>[0] = {}) => harness({ ...opts, state: { screen: 'detail', detailId: id, ...opts.state } });
  it('describes the level ladder against my level and the next-stage target', () => {
    const det = detail('L1', { subject: person({ data: withProgress({ L2: 'accepted' }) }) }).vm().det;
    expect(det.levelSub).toBe('Advanced · L3 in Job technical skills. You are at L3; Senior consultant expects L4.');
    expect(det.ladder.map((r) => r.note)).toEqual(['Reached', 'Reached', 'This learning', 'Senior consultant', '']);
    expect(det.outcomes).toHaveLength(3);
  });
  it('lists every business-line path the learning is on', () => {
    const det = detail('L7').vm().det;
    expect(det.paths).toEqual(BLS.map((bl) => ({ bl, stage: 'Analyst', ob: 'Mandatory' })));
  });
  it('says "No path" for a learning on no business-line path', () => {
    const maps = { ...MAPS0, Consulting: [], Audit: [], 'Tax & Legal': [] };
    expect(detail('L3', { state: { maps } }).vm().det.paths).toEqual([{ bl: 'No path', stage: 'open to everyone', ob: '' }]);
  });
  it('has no ratings or notes yet', () => {
    const det = detail('L1').vm().det;
    expect(det.rating).toBe('Ratings and notes are not available yet');
    expect(det.notes).toEqual([]);
  });
  it('opens, posts and closes a note, and keeps a rating', () => {
    const h = detail('L1');
    h.vm().toggleNote();
    expect(h.state.noteOpen).toBe(true);
    h.vm().setRating('5');
    expect(h.state.myRating).toBe('5');
    h.vm().saveNote();
    expect(h.state.noteOpen).toBe(false);
    expect(h.lastToast()).toBe('Note posted · visible to colleagues on this learning');
  });
  it('lists the facts of the learning', () => {
    const det = detail('L17').vm().det;
    expect(det.kv).toEqual([{ k: 'Format', v: 'E-learning' }, { k: 'Source', v: 'Internal academy' }, { k: 'Effort', v: '1.5 h' }, { k: 'Level', v: 'Practitioner · L2' },
      { k: 'CPD units', v: '1 unit' }, { k: 'Deadline', v: '30 Nov 2026' }, { k: 'Counts toward', v: 'Regulations · hours' }]);
  });
  it('offers the right actions per state and obligation', () => {
    expect(detail('L3').vm().det).toMatchObject({ canAdd: true, canLog: true, canAsk: false });
    expect(detail('L7').vm().det).toMatchObject({ canAdd: false, canLog: true, canAsk: false });
    const busy = detail('L7', { subject: person({ data: withProgress({ L7: ['in-progress', 40] }) }) }).vm().det;
    expect(busy).toMatchObject({ canLog: true, canAsk: true, hoursDone: '0.6 h', hoursText: 'logged of 1.5 h', frac: 0.4 });
    expect(detail('L7', { subject: person({ data: withProgress({ L7: 'submitted' }) }) }).vm().det).toMatchObject({ canLog: false, canAsk: false });
  });
  it('explains approval per obligation, naming the counsellor', () => {
    const named = { subject: person({ counsellor: coach }) };
    expect(detail('L7', named).vm().det.approvalNote).toBe('Mandatory items complete only after Sam Coach accepts them.');
    expect(detail('L3').vm().det.approvalNote).toBe('Open items count toward your hours and levels once your counsellor accepts them.');
    expect(detail('L20').vm().det.approvalNote).toBe('Log your hours here; your counsellor accepts the result.');
  });
  it('explains an open learning a cloud suggests with its evidence', () => {
    const subject = person({ data: withProgress({}, { ambitions: [{ id: 'a1', text: 'Lead a team', horizon: '3 years', doms: ['lead'], from: '' }] }) });
    const det = detail('L28', { subject }).vm().det;
    expect(det.hasSugg).toBe(true);
    expect(det.why).toBe('Builds leadership, which this ambition depends on. Suggested by Ambition · Lead a team. Not on a Consulting path at your stage; it counts toward your hours and levels once added.');
  });
  it('shows the avatar persona, skills and runs of an avatar-practice learning', () => {
    const h = detail('L38', { subject: person({ counsellor: coach }) });
    const av = h.vm().det.av!;
    expect(av).toMatchObject({ persona: 'Marc Verhoeven', initials: 'MV', sub: 'No runs yet · 3 runs available', hasRuns: false });
    expect(av.skills.map((s) => [s.name, s.val])).toEqual([['Assertiveness', '—'], ['Clarity', '—'], ['Listening', '—']]);
    av.start();
    expect(h.lastToast()).toMatch(/^Coming with the avatar studio$/);
    av.share();
    expect(h.lastToast()).toBe('Best run shared with Sam Coach · they see scores and the transcript, not the recording');
    expect(detail('L1').vm().det.av).toBeNull();
  });
  it('falls back to the first learning for an unknown id', () => {
    expect(detail('L999').vm().det.id).toBe(LEARN[0][0]);
  });
  it('goes back to where it was opened from', () => {
    const labels = (['projects', 'profile', 'map', 'adminMap', 'library'] as const).map((origin) => detail('L1', { state: { origin } }).vm().backLabel);
    expect(labels).toEqual(['← Back to projects', '← Back to my profile', '← Back to my growth map', '← Back to curriculum mapping', '← Back to library']);
    const h = detail('L1', { state: { origin: 'map' } });
    expect(h.vm()).toMatchObject({ navMap: true, navLib: false, headerTitle: 'Operating model design', crumb: 'Me · Library · Job technical skills' });
    h.vm().goBack();
    expect(h.state.screen).toBe('map');
  });
});

describe('logging hours', () => {
  it('logs one hour as a share of the effort', async () => {
    const h = harness({ state: { screen: 'detail', detailId: 'L7' } });
    h.vm().logHours();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L7', { state: 'in-progress', pct: 67 });
    expect(h.reloadSubject).toHaveBeenCalled();
    expect(h.lastToast()).toBe('1 hour logged · 67% of 1.5 h');
  });
  it('submits for acceptance once every hour is logged', async () => {
    const h = harness({ subject: person({ counsellor: coach }), state: { screen: 'detail', detailId: 'L16' } });
    h.vm().logHours();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L16', { state: 'submitted', pct: 100 });
    expect(h.lastToast()).toBe('All hours logged · sent to Sam Coach for acceptance');
  });
  it('shows the error when saving fails', async () => {
    vi.mocked(learner.saveProgress).mockRejectedValueOnce(new Error('network down'));
    const h = harness({ state: { screen: 'detail', detailId: 'L7' } });
    h.vm().logHours();
    await flush();
    expect(h.reloadSubject).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('network down');
  });
});

describe('adding to my path and asking approval', () => {
  it('adds an open learning to my path', async () => {
    const h = harness({ state: { screen: 'detail', detailId: 'L3' } });
    h.vm().addToPath();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L3', { chosen: true });
    expect(h.lastToast()).toBe('Added to your path · it now shows on your map with a green ring');
  });
  it('does nothing for a learning already on my path', () => {
    harness({ subject: person({ data: withProgress({ L3: ['not-started', 0, true] }) }), state: { screen: 'detail', detailId: 'L3' } }).vm().addToPath();
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
  it('asks the counsellor to approve', async () => {
    const h = harness({ subject: person({ data: withProgress({ L17: ['in-progress', 40] }) }), state: { screen: 'detail', detailId: 'L17' } });
    h.vm().askApprove();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L17', { state: 'submitted', pct: 100 });
    expect(h.lastToast()).toBe('Sent to your counsellor · they see the hours you logged');
  });
});

describe('accepting a submitted learning', () => {
  const counsellee = person({ id: 'p2', name: 'Kim Learner', readOnly: true, counsellor: { id: 'c1', name: 'Sam Coach' }, businessLine: 'Audit', data: withProgress({ L10: 'submitted' }) });
  it('is offered to a System Admin and to a Domain Admin of the person\'s line only', () => {
    const can = (access: ReturnType<typeof member>) => harness({ subject: counsellee, access, state: { detailId: 'L10' } }).vm().det.canAcceptIt;
    expect(can(systemAdmin('x'))).toBe(true);
    expect(can(domainAdmin(['Audit'], 'x'))).toBe(true);
    expect(can(domainAdmin(['Consulting'], 'x'))).toBe(false);
    expect(can(member('c1'))).toBe(true);
  });
  it('accepts, reloads and names the person', async () => {
    const h = harness({ subject: counsellee, access: member('c1'), state: { detailId: 'L10' } });
    h.vm().rec.decide!.accept();
    await flush();
    expect(record.decideLearning).toHaveBeenCalledWith('p2', 'L10', 'accepted', '');
    expect(h.reloadSubject).toHaveBeenCalled();
    expect(h.lastToast()).toBe('Accepted · “Structured problem solving” now counts toward Kim’s levels');
  });
  it('says so when the learning is no longer waiting', async () => {
    vi.mocked(record.decideLearning).mockRejectedValueOnce(new Error('This learning is no longer waiting for acceptance'));
    const h = harness({ subject: counsellee, access: member('c1'), state: { detailId: 'L10' } });
    h.vm().rec.decide!.accept();
    await flush();
    expect(h.lastToast()).toBe('This learning is no longer waiting for acceptance');
  });
  it('labels a submitted learning as awaiting the counsellor by first name', () => {
    expect(harness({ subject: counsellee, access: member('c1'), state: { detailId: 'L10' } }).vm().det.stateLabel).toBe('Awaiting Sam');
  });
});
