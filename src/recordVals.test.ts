// Learning record and approvals view-model (F2, F3): evidence per format, submit, accept and request changes, the
// acceptance record, the queue and its badge, General Admin acceptance, and View as writing nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import * as learner from './lib/learnerStore';
import * as record from './lib/recordStore';
import type { QueueRow } from './lib/recordStore';
import type { Decision } from './logic/record';
import type { Member } from './logic/team';
import { domainAdmin, emptyData, flush, generalAdmin, harness, member, person, stubWindow, withProgress } from './test/harness';

vi.mock('./lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('./lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

const field = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>;
const coach = { id: 'c1', name: 'Sam Coach' };
const link = 'https://sharepoint.example/certificates/az900.pdf';
const reflection = 'I now open with the answer, then give the three reasons and the evidence behind each. I will use it in the steering committee pack next week.';
const decision = (o: Partial<Decision>): Decision => ({ learningId: 'L3', verdict: 'accepted', comment: '', by: 'c1', byName: 'Sam Coach', at: '2026-10-30T10:00:00Z', evidence: { note: '', link: '', ref: '' }, ...o });
// L18 is a Certification (10 h), L3 a Book, L10 and L4 Classroom, L17 an E-learning, L44 a Reel.
const learnerOn = (id: string, rows: Parameters<typeof withProgress>[0], decisions: Decision[] = []) =>
  harness({ subject: person({ counsellor: coach, data: withProgress(rows, { decisions }) }), state: { screen: 'detail', detailId: id } });

describe('evidence per format on the learner\'s detail', () => {
  it('asks a certification for a certificate link or number, and says files are linked', () => {
    const rec = learnerOn('L18', { L18: ['in-progress', 50] }).vm().rec;
    expect(rec).toMatchObject({ editable: true, showEvidence: true, showRef: true, noteLabel: 'Note (optional)', noteCount: '', problem: 'Add a link to your certificate or its number to submit' });
    expect(rec.ruleText).toBe('A certification counts once Sam Coach sees the certificate: add a link to it, or its certificate number.');
    expect(rec.linkedNote).toMatch(/^Files are linked, not uploaded/);
  });
  it('counts the reflection a book needs', () => {
    const h = learnerOn('L3', { L3: ['in-progress', 50] });
    expect(h.vm().rec).toMatchObject({ showRef: false, noteLabel: 'Reflection', noteCount: '0 / 140 characters', problem: 'Add a reflection of at least 140 characters to submit' });
    h.vm().rec.setNote(field(reflection));
    expect(h.vm().rec).toMatchObject({ noteCount: reflection.length + ' / 140 characters', problem: null, dirty: true });
  });
  it('needs nothing for a classroom item and shows no form before it starts', () => {
    expect(learnerOn('L10', { L10: ['in-progress', 50] }).vm().rec).toMatchObject({ editable: true, problem: null });
    expect(learnerOn('L10', {}).vm().rec).toMatchObject({ editable: false, showEvidence: false });
    expect(learnerOn('L18', {}).vm().rec.editable).toBe(true);
  });
  it('shows no evidence form for a podcast or reel, which complete themselves', () => {
    expect(learnerOn('L44', { L44: ['in-progress', 0] }).vm().rec.showEvidence).toBe(false);
  });
});

describe('submitting with evidence', () => {
  it('stops at 100% when the last hour is logged without the evidence the format needs', async () => {
    const h = learnerOn('L18', { L18: ['in-progress', 95] });
    h.vm().logHours();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L18', { state: 'in-progress', pct: 100 });
    expect(h.lastToast()).toBe('All hours logged · add a link to your certificate or its number, then submit it to Sam Coach');
  });
  it('submits with the last hour when the evidence is there, sending what was typed', async () => {
    const h = learnerOn('L18', { L18: ['in-progress', 95] });
    h.vm().rec.setLink(field(' ' + link + ' '));
    h.vm().logHours();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L18', { state: 'submitted', pct: 100, note: '', link, ref: '' });
    expect(h.lastToast()).toBe('All hours logged · sent to Sam Coach for acceptance');
  });
  it('refuses to submit without the evidence, and the button says why', async () => {
    const h = learnerOn('L18', { L18: ['in-progress', 100] });
    expect(h.vm().det).toMatchObject({ canAsk: true, canLog: false });
    h.vm().askApprove();
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Add a link to your certificate or its number to submit');
  });
  it('submits a certificate number with the submission', async () => {
    const h = learnerOn('L18', { L18: ['in-progress', 100] });
    h.vm().rec.setRef(field('AZ900-12345'));
    h.vm().askApprove();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L18', { state: 'submitted', pct: 100, note: '', link: '', ref: 'AZ900-12345' });
    expect(h.lastToast()).toBe('Sent to Sam Coach · they see the hours you logged and your evidence');
  });
  it('sends saved evidence once, without repeating it', async () => {
    const data = withProgress({ L18: ['in-progress', 100] });
    data.progress.L18.evidence = { note: '', link, ref: '' };
    const h = harness({ subject: person({ counsellor: coach, data }), state: { screen: 'detail', detailId: 'L18' } });
    expect(h.vm().rec).toMatchObject({ problem: null, dirty: false, link });
    h.vm().askApprove();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L18', { state: 'submitted', pct: 100 });
  });
  it('saves evidence on its own, checking the link first', async () => {
    const h = learnerOn('L10', { L10: ['in-progress', 50] });
    h.vm().rec.save();
    expect(h.lastToast()).toBe('Nothing changed');
    h.vm().rec.setLink(field('sharepoint/attendance'));
    h.vm().rec.save();
    expect(h.lastToast()).toBe('The link must be a web address starting with https://');
    h.vm().rec.setLink(field('https://sharepoint.example/attendance'));
    h.vm().rec.save();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L10', { note: '', link: 'https://sharepoint.example/attendance', ref: '' });
    expect(h.lastToast()).toBe('Evidence saved · it goes with your submission');
  });
  it('keeps the rule while a submission waits: evidence cannot drop below it', async () => {
    const data = withProgress({ L18: 'submitted' });
    data.progress.L18.evidence = { note: '', link, ref: '' };
    const h = harness({ subject: person({ counsellor: coach, data }), state: { screen: 'detail', detailId: 'L18' } });
    h.vm().rec.setLink(field(''));
    h.vm().rec.save();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Add a link to your certificate or its number to submit');
  });
});

describe('requested changes and the acceptance record', () => {
  const back = [decision({ verdict: 'changes', comment: 'Name one idea you will apply on your next engagement.' })];
  it('shows the comment to the learner and offers to resubmit', () => {
    const h = learnerOn('L3', { L3: ['in-progress', 100] }, back);
    const vm = h.vm();
    expect(vm.rec.changes).toEqual({ title: 'Changes requested by Sam Coach · 30 Oct 2026', comment: 'Name one idea you will apply on your next engagement.', hint: 'Make the change, then resubmit. Your hours stay logged.' });
    expect(vm.rec.submitLabel).toBe('Resubmit for acceptance');
    expect(vm.det).toMatchObject({ stateLabel: 'Changes requested', canLog: false, canAsk: true });
    expect(vm.libItems.find((i) => i.id === 'L3')!.stateLabel).toBe('Changes requested');
  });
  it('resubmits with the improved reflection', async () => {
    const h = learnerOn('L3', { L3: ['in-progress', 100] }, back);
    h.vm().rec.setNote(field(reflection));
    h.vm().askApprove();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L3', { state: 'submitted', pct: 100, note: reflection, link: '', ref: '' });
  });
  it('lists every decision, newest first, with comment and the evidence decided on', () => {
    const decisions = [...back, decision({ at: '2026-10-31T09:00:00Z', comment: 'Clear and concrete.', evidence: { note: reflection, link: '', ref: '' } })];
    const rec = learnerOn('L3', { L3: 'accepted' }, decisions).vm().rec;
    expect(rec.history.map((x) => [x.label, x.date, x.comment, x.evidence])).toEqual([
      ['Accepted by Sam Coach', '31 Oct 2026', 'Clear and concrete.', 'reflection'],
      ['Changes requested by Sam Coach', '30 Oct 2026', 'Name one idea you will apply on your next engagement.', ''],
    ]);
    expect(rec).toMatchObject({ changes: null, editable: false, hasHistory: true });
  });
  it('records a reel that completed itself', () => {
    const rec = learnerOn('L44', { L44: 'accepted' }, [decision({ learningId: 'L44', verdict: 'self_completed', by: 'u1', byName: 'Robin Test' })]).vm().rec;
    expect(rec.history.map((x) => x.label)).toEqual(['Completed by you · counts without acceptance']);
  });
  it('shows when a waiting learning was submitted', () => {
    const data = withProgress({ L17: 'submitted' });
    data.progress.L17.submittedAt = '2026-10-29T08:00:00Z';
    expect(harness({ subject: person({ data }), state: { screen: 'detail', detailId: 'L17' } }).vm().rec.submittedLine).toBe('Submitted 29 Oct 2026');
  });
});

describe('deciding from the learning detail (View as)', () => {
  const evData = () => { const d = withProgress({ L18: 'submitted', L10: 'submitted' }); d.progress.L18.evidence = { note: '', link, ref: '' }; return d; };
  const counsellee = () => person({ id: 'p2', name: 'Kim Learner', readOnly: true, counsellor: coach, businessLine: 'Audit', data: evData() });
  const as = (access: ReturnType<typeof member>, id = 'L18') => harness({ subject: counsellee(), access, state: { screen: 'detail', detailId: id } });
  it('shows the evidence read-only and offers the decision', () => {
    const rec = as(member('c1')).vm().rec;
    expect(rec).toMatchObject({ editable: false, showEvidence: true, saved: { link, note: '', ref: '', none: '' } });
    expect(rec.decide).not.toBeNull();
    expect(as(member('c1'), 'L10').vm().rec.saved.none).toBe('No evidence needed for a classroom');
    expect(as(member('c1'), 'L1').vm().rec.saved.none).toBe('No evidence needed for an e-learning');
  });
  it('offers the decision to a General Admin (Q7), not to another line\'s Domain Admin or the learner', () => {
    expect(as(generalAdmin('g1')).vm().rec.decide).not.toBeNull();
    expect(as(generalAdmin('g1')).vm().det.canAcceptIt).toBe(true);
    expect(as(domainAdmin(['Consulting'], 'd1')).vm().rec.decide).toBeNull();
    expect(learnerOn('L17', { L17: 'submitted' }).vm().rec.decide).toBeNull();
  });
  it('accepts with an optional comment, then reloads the person and the queue', async () => {
    const h = as(generalAdmin('g1'));
    h.vm().rec.decide!.setComment(field('Certificate checked.'));
    h.vm().rec.decide!.accept();
    await flush();
    expect(record.decideLearning).toHaveBeenCalledWith('p2', 'L18', 'accepted', 'Certificate checked.');
    expect(h.reloadSubject).toHaveBeenCalled();
    expect(record.loadQueue).toHaveBeenCalled();
    expect(h.lastToast()).toBe('Accepted · “CSRD essentials” now counts toward Kim’s levels');
    expect(h.state.decideNote).toEqual({});
  });
  it('requests changes only with a real comment', async () => {
    const h = as(member('c1'));
    h.vm().rec.decide!.setComment(field('Too short'));
    h.vm().rec.decide!.sendBack();
    await flush();
    expect(record.decideLearning).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Say what should change (at least 10 characters)');
    h.vm().rec.decide!.setComment(field('The link opens a login page; share it with the firm.'));
    expect(h.vm().rec.decide!.commentCount).toBe('52 / 500');
    h.vm().rec.decide!.sendBack();
    await flush();
    expect(record.decideLearning).toHaveBeenCalledWith('p2', 'L18', 'changes', 'The link opens a login page; share it with the firm.');
    expect(h.lastToast()).toBe('Sent back to Kim · it is in progress again with your comment');
  });
  it('says so when someone else decided first', async () => {
    vi.mocked(record.decideLearning).mockRejectedValueOnce(new Error('This learning is no longer waiting for acceptance'));
    const h = as(member('c1'));
    h.vm().rec.decide!.accept();
    await flush();
    expect(h.lastToast()).toBe('This learning is no longer waiting for acceptance');
    expect(h.reloadSubject).not.toHaveBeenCalled();
  });
  it('writes nothing of the learner\'s own in View as', async () => {
    const h = harness({ subject: person({ id: 'p2', name: 'Kim Learner', readOnly: true, data: withProgress({ L18: ['in-progress', 95], L3: ['in-progress', 50] }) }), access: member('c1'), state: { screen: 'detail', detailId: 'L18' } });
    h.vm().logHours();
    h.vm().askApprove();
    h.vm().rec.save();
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Viewing Kim Learner · read-only');
    expect(h.vm().rec.editable).toBe(false);
  });
});

describe('the approvals queue', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  const row = (o: Partial<QueueRow>): QueueRow => ({ userId: 'p2', name: 'Kim Learner', line: 'Audit', learningId: 'L18', submittedAt: '2026-10-30T08:00:00Z', evidence: { note: '', link, ref: '' }, lastActivity: '2026-10-19T10:00:00Z', ...o });
  const queue = [row({}), row({ userId: 'p3', name: 'Ali Member', line: null, learningId: 'L10', submittedAt: '2026-11-06T16:00:00Z', evidence: { note: '', link: '', ref: '' }, lastActivity: null })];
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  it('lists each submission with the evidence, the wait and the person\'s last activity', () => {
    const appr = harness({ access: member('c1'), state: { screen: 'approvals', queue } }).vm().appr!;
    expect(appr.rows.map((r) => [r.name, r.sub, r.title, r.format, r.waited, r.late, r.evidence.link, r.evidence.none, r.openLabel])).toEqual([
      ['Kim Learner', 'Audit · last activity: 3 weeks ago', 'CSRD essentials', 'Certification', 'Submitted 30 Oct 2026 · 6 working days', true, link, '', 'Open in Kim’s app'],
      ['Ali Member', 'No business line · last activity: no activity yet', 'Structured problem solving', 'Classroom', 'Submitted 6 Nov 2026 · 1 working day', false, '', 'No evidence needed for a classroom', 'Open in Ali’s app'],
    ]);
    expect(appr).toMatchObject({ loading: false, empty: false, error: null });
  });
  it('counts what waits on the sidebar badge, whoever is viewed', () => {
    expect(harness({ access: member('c1'), state: { queue } }).vm()).toMatchObject({ approvalsBadge: 2, appr: null, navApprovals: false });
    const viewing = harness({ subject: person({ id: 'p9', readOnly: true }), access: member('c1'), state: { queue, screen: 'detail', origin: 'approvals' } }).vm();
    expect(viewing).toMatchObject({ approvalsBadge: 2, navApprovals: true, backLabel: '← Back to approvals' });
    expect(harness({ access: member('c1') }).vm().approvalsBadge).toBe(0);
  });
  it('accepts from the queue for the row\'s person and reloads the queue', async () => {
    vi.mocked(record.loadQueue).mockResolvedValueOnce([queue[1]]);
    const h = harness({ access: member('c1'), state: { screen: 'approvals', queue } });
    h.vm().appr!.rows[0].accept();
    await vi.waitFor(() => expect(h.state.queue).toEqual([queue[1]]));
    expect(record.decideLearning).toHaveBeenCalledWith('p2', 'L18', 'accepted', '');
    expect(h.vm().approvalsBadge).toBe(1);
  });
  it('requests changes from the queue with the row\'s own comment', async () => {
    const h = harness({ access: member('c1'), state: { screen: 'approvals', queue } });
    h.vm().appr!.rows[1].setComment(field('Add the attendance link from the academy.'));
    expect(h.vm().appr!.rows[0].comment).toBe('');
    h.vm().appr!.rows[1].sendBack();
    await vi.waitFor(() => expect(record.decideLearning).toHaveBeenCalledWith('p3', 'L10', 'changes', 'Add the attendance link from the academy.'));
  });
  it('opens the screen and reloads what waits', async () => {
    vi.mocked(record.loadQueue).mockResolvedValueOnce(queue);
    const h = harness({ access: member('c1') });
    h.vm().goApprovals();
    expect(h.state.screen).toBe('approvals');
    await vi.waitFor(() => expect(h.state.queue).toEqual(queue));
    expect(h.vm()).toMatchObject({ headerTitle: 'Waiting for you', crumb: 'Counsellor · approvals', navApprovals: true });
  });
  it('shows loading, empty and failed states, and retries', async () => {
    expect(harness({ state: { screen: 'approvals' } }).vm().appr).toMatchObject({ loading: true, empty: false });
    expect(harness({ state: { screen: 'approvals', queue: [] } }).vm().appr).toMatchObject({ loading: false, empty: true });
    const h = harness({ state: { screen: 'approvals', queueError: 'permission denied' } });
    expect(h.vm().appr).toMatchObject({ loading: false, error: 'permission denied' });
    h.vm().appr!.retry();
    expect(h.state.queueError).toBeNull();
    await vi.waitFor(() => expect(h.state.queue).toEqual([]));
  });
});

describe('last activity in My team', () => {
  it('reads the latest own change of each counsellee', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
    const data = emptyData(); data.progress = { L1: { state: 'in-progress', pct: 20, chosen: false, updatedAt: '2026-10-19T10:00:00Z' } };
    const members: Member[] = [{ id: 'p2', name: 'Kim Learner', stage: 'Analyst', businessLine: 'Audit', data }, { id: 'p3', name: 'Ali Member', stage: null, businessLine: null, data: emptyData() }];
    expect(harness().vm().teamRows(members, () => {}).map((r) => r.lastActive)).toEqual(['3 weeks ago', 'No activity yet']);
  });
});
