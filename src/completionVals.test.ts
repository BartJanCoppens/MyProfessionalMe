// Completion per learning type (v0.7.2): e-learning "Mark as completed", the classroom feedback form, the avatar
// evaluation quiz, the Attendance card for admins (roster and register_attendance), the last hour per type, the copy,
// and View as writing nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeEvent } from 'react';
import { AVATAR_QUIZ } from './data';
import * as learner from './lib/learnerStore';
import * as attendance from './lib/attendanceStore';
import type { RosterRow } from './lib/attendanceStore';
import type { Decision } from './logic/record';
import { domainAdmin, flush, generalAdmin, harness, member, person, stubWindow, systemAdmin, withProgress } from './test/harness';

vi.mock('./lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('./lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));
vi.mock('./lib/attendanceStore', () => ({ loadRoster: vi.fn(async () => []), registerAttendance: vi.fn(async () => 0) }));

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });

const field = (value: string) => ({ target: { value } }) as ChangeEvent<HTMLInputElement>;
const coach = { id: 'c1', name: 'Sam Coach' };
const apply = 'I will open every workshop with the issue tree we built together.';
// L17 is an E-learning (1.5 h), L10 a Classroom (14 h), L38 an Avatar practice, L18 a Certification.
const learnerOn = (id: string, rows: Parameters<typeof withProgress>[0] = {}, decisions: Decision[] = []) =>
  harness({ subject: person({ counsellor: coach, data: withProgress(rows, { decisions }) }), state: { screen: 'detail', detailId: id } });
const viewAs = (id: string, rows: Parameters<typeof withProgress>[0] = {}, access = member('c1')) =>
  harness({ subject: person({ id: 'p2', name: 'Kim Learner', readOnly: true, counsellor: coach, data: withProgress(rows) }), access, state: { screen: 'detail', detailId: id } });

describe('e-learning: mark as completed', () => {
  it('offers "Mark as completed" and completes it at once, without a counsellor', async () => {
    const h = learnerOn('L17', { L17: ['in-progress', 40] });
    const vm = h.vm();
    expect(vm.done.kind).toBe('mark');
    expect(vm.done.mark).toMatchObject({ label: 'Mark as completed', disabled: false });
    expect(vm.det).toMatchObject({ canAsk: false, approvalNote: 'Mark it as completed when you have finished the course. It counts right away; no acceptance needed.' });
    vm.done.mark!.run();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L17', { state: 'accepted', pct: 100 });
    expect(h.reloadSubject).toHaveBeenCalled();
    expect(h.lastToast()).toBe('Completed · “GDPR for consultants” counts toward your hours and levels');
  });
  it('can be marked before any hour is logged, and not again once completed', () => {
    expect(learnerOn('L17').vm().done.mark).not.toBeNull();
    expect(learnerOn('L17', { L17: 'accepted' }).vm().done.mark).toBeNull();
  });
  it('shows completed on the library card and the road', () => {
    const vm = learnerOn('L17', { L17: 'accepted', L16: ['in-progress', 100] }).vm();
    expect(vm.libItems.find((i) => i.id === 'L17')!.stateLabel).toBe('Completed');
    expect(vm.libItems.find((i) => i.id === 'L16')!.stateLabel).toBe('All hours logged · mark it as completed');
    expect(vm.roadInflight.find((r) => r.id === 'L16')!.label).toBe('Independence & ethics annual · All hours logged · mark it as completed');
  });
});

describe('the last hour per type', () => {
  it.each([
    ['L10', 'give your feedback'],
    ['L38', 'take the evaluation quiz'],
  ])('stops %s at 100%% and says to %s', async (id, todo) => {
    const h = learnerOn(id, { [id]: ['in-progress', 99] });
    h.vm().logHours();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', id, { state: 'in-progress', pct: 100 });
    expect(h.lastToast()).toBe('All hours logged · ' + todo + ' to complete it');
  });
  it('still sends a certification to the counsellor', () => {
    const vm = learnerOn('L18', { L18: ['in-progress', 50] }).vm();
    expect(vm.done).toMatchObject({ kind: 'acceptance', mark: null, feedback: null, quiz: null, attendance: null });
    expect(vm.det.canAsk).toBe(true);
  });
});

describe('classroom: the feedback form', () => {
  it('needs a rating and at least 40 characters on what you will apply', async () => {
    const h = learnerOn('L10', { L10: ['in-progress', 50] });
    expect(h.vm().done.feedback).toMatchObject({ open: true, disabled: false, rating: '', count: '0 / 40 characters', problem: 'Rate the session from 1 to 5' });
    expect(h.vm().det.approvalNote).toBe('It completes when the faculty registers your attendance, or when you give your feedback on the session. No acceptance needed.');
    h.vm().done.feedback!.send();
    expect(h.lastToast()).toBe('Rate the session from 1 to 5');
    h.vm().done.feedback!.setRating('4');
    h.vm().done.feedback!.setText(field('Good day.'));
    expect(h.vm().done.feedback).toMatchObject({ rating: '4', count: '9 / 40 characters', problem: 'Say what you will apply (at least 40 characters)' });
    h.vm().done.feedback!.send();
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe('Say what you will apply (at least 40 characters)');
  });
  it('completes the classroom with the feedback, before any hour is logged', async () => {
    const h = learnerOn('L10');
    h.vm().done.feedback!.setRating('5');
    h.vm().done.feedback!.setText(field('  ' + apply + '  '));
    expect(h.vm().done.feedback!.problem).toBeNull();
    h.vm().done.feedback!.send();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L10', { state: 'accepted', pct: 100, note: apply, rating: 5 });
    expect(h.lastToast()).toBe('Thank you for your feedback · “Structured problem solving” is complete and counts toward your hours');
    expect(h.state.fbDraft).toBeNull();
  });
  it('shows the feedback as given once completed, and the record line', () => {
    const data = withProgress({ L10: 'accepted' }, { decisions: [{ learningId: 'L10', verdict: 'self_completed', comment: '', by: 'u1', byName: 'Robin Test', at: '2026-11-02T10:00:00Z', evidence: { note: apply, link: '', ref: '' }, rating: 4 }] });
    data.progress.L10.evidence = { note: apply, link: '', ref: '' }; data.progress.L10.rating = 4;
    const vm = harness({ subject: person({ data }), state: { screen: 'detail', detailId: 'L10' } }).vm();
    expect(vm.done.feedback).toMatchObject({ open: false, disabled: true, given: { rating: 'Rated 4 of 5', text: apply } });
    expect(vm.rec.history.map((x) => [x.label, x.evidence])).toEqual([['Completed by you with feedback · rated 4 of 5 · counts without acceptance', '']]);
    expect(vm.rec.showEvidence).toBe(false);
  });
  it('shows no form once the faculty registered the attendance, and says who did', () => {
    const vm = learnerOn('L10', { L10: 'accepted' }, [{ learningId: 'L10', verdict: 'attended', comment: '', by: 'a1', byName: 'Pat Admin', at: '2026-11-02T10:00:00Z', evidence: { note: '', link: '', ref: '' } }]).vm();
    expect(vm.done.feedback).toBeNull();
    expect(vm.det.stateLabel).toBe('Completed');
    expect(vm.rec.history.map((x) => x.label)).toEqual(['Attendance registered by Pat Admin · counts without acceptance']);
  });
  it('keeps one person\'s draft away from another', () => {
    const h = learnerOn('L10');
    h.vm().done.feedback!.setText(field(apply));
    const other = harness({ subject: person({ id: 'u9', name: 'Other Person', data: withProgress({}) }), state: { screen: 'detail', detailId: 'L10', fbDraft: h.state.fbDraft } });
    expect(other.vm().done.feedback!.text).toBe('');
  });
});

describe('avatar practice: the evaluation quiz', () => {
  const Q = AVATAR_QUIZ.L38;
  const answer = (h: ReturnType<typeof learnerOn>, picks: number[]) => picks.forEach((oi, qi) => h.vm().done.quiz!.items[qi].opts[oi].pick());
  it('has three questions for every avatar learning', () => {
    expect(Object.keys(AVATAR_QUIZ).sort()).toEqual(['L38', 'L39', 'L40', 'L41']);
    for (const qs of Object.values(AVATAR_QUIZ)) {
      expect(qs).toHaveLength(3);
      for (const q of qs) { expect(q.opts.length).toBeGreaterThanOrEqual(3); expect(q.a).toBeLessThan(q.opts.length); }
    }
  });
  it('is written as after the practice session; the session itself is still coming', () => {
    const vm = learnerOn('L38').vm();
    expect(vm.done.quiz).toMatchObject({ done: false, disabled: false, canCheck: false, lead: 'After your practice session: answer all three questions. Three right answers complete the learning.' });
    expect(vm.det.approvalNote).toBe('After your practice session, three right answers in the evaluation quiz complete it. No acceptance needed.');
    vm.det.av!.start();
  });
  it('completes the learning when all three are right', async () => {
    const h = learnerOn('L38');
    answer(h, Q.map((q) => q.a));
    expect(h.vm().done.quiz!.canCheck).toBe(true);
    h.vm().done.quiz!.check();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L38', { state: 'accepted', pct: 100 });
    expect(h.vm().done.quiz).toMatchObject({ passed: true, result: 'All three right. The practice is complete.' });
    expect(h.lastToast()).toBe('Quiz passed · “Holding scope with a procurement director” is complete and counts toward your hours');
  });
  it('shows feedback on a wrong answer and allows a retry that keeps the right ones', async () => {
    const h = learnerOn('L38');
    const wrong = (Q[1].a + 1) % Q[1].opts.length;
    answer(h, [Q[0].a, wrong, Q[2].a]);
    h.vm().done.quiz!.check();
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    const q = h.vm().done.quiz!;
    expect(q).toMatchObject({ passed: false, checked: true, canCheck: false, result: '2 of 3 right. Look at the marked question against the brief, then try again.' });
    expect(q.items.map((i) => i.wrong)).toEqual([false, true, false]);
    expect(q.items[1].opts[wrong].bd).toBe('#9a2b22');
    q.items[1].opts[Q[1].a].pick(); // locked until "Try again"
    expect(h.vm().done.quiz!.items[1].opts[wrong].picked).toBe(true);
    h.vm().done.quiz!.retry();
    expect(h.vm().done.quiz).toMatchObject({ checked: false, canCheck: false });
    expect(h.vm().done.quiz!.items.map((i) => i.opts.some((o) => o.picked))).toEqual([true, false, true]);
    h.vm().done.quiz!.items[1].opts[Q[1].a].pick();
    h.vm().done.quiz!.check();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L38', { state: 'accepted', pct: 100 });
  });
  it('asks for every answer before checking', () => {
    const h = learnerOn('L38');
    answer(h, [Q[0].a]);
    h.vm().done.quiz!.check();
    expect(h.lastToast()).toBe('Answer all 3 questions first');
  });
  it('says the practice is complete once accepted', () => {
    expect(learnerOn('L38', { L38: 'accepted' }).vm().done.quiz).toMatchObject({ done: true, lead: 'Quiz passed · this practice is complete.', items: [] });
  });
});

describe('View as writes nothing', () => {
  it('disables mark, feedback and quiz, and refuses every write', async () => {
    const e = viewAs('L17', { L17: ['in-progress', 40] });
    expect(e.vm().done.mark!.disabled).toBe(true);
    e.vm().done.mark!.run();
    const c = viewAs('L10', { L10: ['in-progress', 40] });
    expect(c.vm().done.feedback).toMatchObject({ disabled: true, problem: null, lead: 'Only Kim can give this feedback.' });
    c.vm().done.feedback!.setRating('5');
    c.vm().done.feedback!.setText(field(apply));
    expect(c.state.fbDraft).toBeNull();
    c.vm().done.feedback!.send();
    const q = viewAs('L38');
    expect(q.vm().done.quiz).toMatchObject({ disabled: true, lead: 'Only Kim can take this quiz.' });
    AVATAR_QUIZ.L38.forEach((x, i) => q.vm().done.quiz!.items[i].opts[x.a].pick());
    expect(q.state.quiz).toBeNull();
    q.vm().done.quiz!.check();
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    for (const h of [e, c, q]) expect(h.lastToast()).toBe('Viewing Kim Learner · read-only');
  });
});

describe('classroom: the Attendance card (admins)', () => {
  const rows: RosterRow[] = [
    { userId: 'p2', name: 'Kim Learner', line: 'Consulting', state: 'in-progress' },
    { userId: 'p3', name: 'Ali Member', line: 'Consulting', state: 'accepted' },
    { userId: 'p4', name: 'Jo Analyst', line: null, state: 'not-started' },
  ];
  const adminOn = (access = domainAdmin(['Consulting'], 'a1'), subject = person({ id: 'a1', name: 'Pat Admin' })) => harness({ subject, access, state: { screen: 'library' } });
  it('is for admins only, on a classroom learning only', () => {
    expect(learnerOn('L10').vm().done.attendance).toBeNull();
    expect(harness({ access: domainAdmin(['Consulting'], 'u1'), state: { screen: 'detail', detailId: 'L17' } }).vm().done.attendance).toBeNull();
    expect(harness({ access: domainAdmin(['Consulting'], 'u1'), state: { screen: 'detail', detailId: 'L10' } }).vm().done.attendance).toMatchObject({ notLoaded: true });
  });
  it('loads the roster when an admin opens a classroom, and ticks who completed it', async () => {
    vi.mocked(attendance.loadRoster).mockResolvedValueOnce(rows);
    const h = adminOn();
    h.L().openDetail('L10');
    expect(h.vm().done.attendance).toMatchObject({ loading: true, notLoaded: false });
    await flush();
    expect(attendance.loadRoster).toHaveBeenCalledWith('L10');
    const att = h.vm().done.attendance!;
    expect(att).toMatchObject({ loading: false, showSearch: false, summary: '1 of 3 completed', canSave: false, lead: 'Tick the people who attended. You can register the people of Consulting you manage.' });
    expect(att.rows.map((r) => [r.name, r.sub, r.ticked, r.locked])).toEqual([
      ['Kim Learner', 'Consulting · in progress', false, false], ['Ali Member', 'Consulting · completed', true, true], ['Jo Analyst', 'No business line', false, false]]);
  });
  it('registers the people ticked, not those already completed, then reloads', async () => {
    vi.mocked(attendance.loadRoster).mockResolvedValue(rows);
    vi.mocked(attendance.registerAttendance).mockResolvedValueOnce(2);
    const h = adminOn();
    h.L().openDetail('L10');
    await flush();
    h.vm().done.attendance!.save();
    expect(h.lastToast()).toBe('Tick the people who attended');
    h.vm().done.attendance!.rows[0].toggle();
    h.vm().done.attendance!.rows[1].toggle(); // locked: stays as it is
    h.vm().done.attendance!.rows[2].toggle();
    expect(h.vm().done.attendance).toMatchObject({ canSave: true, summary: '1 of 3 completed · 2 ticked to register' });
    h.vm().done.attendance!.save();
    await flush(10);
    expect(attendance.registerAttendance).toHaveBeenCalledWith('L10', ['p2', 'p4']);
    expect(h.lastToast()).toBe('Attendance registered for 2 people · “Structured problem solving” is complete for them');
    expect(attendance.loadRoster).toHaveBeenCalledTimes(2);
    expect(h.reloadSubject).not.toHaveBeenCalled();
  });
  it('works in View as and reloads the viewed person when they were registered', async () => {
    vi.mocked(attendance.loadRoster).mockResolvedValue(rows);
    vi.mocked(attendance.registerAttendance).mockResolvedValueOnce(1);
    const h = adminOn(domainAdmin(['Consulting'], 'a1'), person({ id: 'p2', name: 'Kim Learner', readOnly: true }));
    h.L().openDetail('L10');
    await flush();
    h.vm().done.attendance!.rows[0].toggle();
    h.vm().done.attendance!.save();
    await flush(10);
    expect(attendance.registerAttendance).toHaveBeenCalledWith('L10', ['p2']);
    expect(h.reloadSubject).toHaveBeenCalled();
    expect(h.lastToast()).toBe('Attendance registered for 1 person · “Structured problem solving” is complete for them');
  });
  it('gives General and System Admins everyone, with a search box', async () => {
    vi.mocked(attendance.loadRoster).mockResolvedValue(rows);
    for (const access of [generalAdmin('g1'), systemAdmin('s1')]) {
      const h = adminOn(access);
      h.L().openDetail('L10');
      await flush();
      expect(h.vm().done.attendance).toMatchObject({ showSearch: true, lead: 'Tick the people who attended. You can register anyone.' });
      h.vm().done.attendance!.setQ(field('ali'));
      expect(h.vm().done.attendance!.rows.map((r) => r.name)).toEqual(['Ali Member']);
      h.vm().done.attendance!.setQ(field('nobody'));
      expect(h.vm().done.attendance!.empty).toBe('Nobody matches “nobody”.');
    }
  });
  it('says the database refusal and keeps the ticks', async () => {
    vi.mocked(attendance.loadRoster).mockResolvedValue(rows);
    vi.mocked(attendance.registerAttendance).mockRejectedValueOnce(new Error('You can register attendance only for people you manage as an admin'));
    const h = adminOn();
    h.L().openDetail('L10');
    await flush();
    h.vm().done.attendance!.rows[0].toggle();
    h.vm().done.attendance!.save();
    await flush(10);
    expect(h.lastToast()).toBe('You can register attendance only for people you manage as an admin');
    expect(h.vm().done.attendance).toMatchObject({ busy: false, canSave: true });
  });
  it('shows a failed roster and retries', async () => {
    vi.mocked(attendance.loadRoster).mockRejectedValueOnce(new Error('permission denied')).mockResolvedValueOnce([]);
    const h = adminOn();
    h.L().openDetail('L10');
    await flush();
    expect(h.vm().done.attendance).toMatchObject({ error: 'permission denied', loading: false });
    h.vm().done.attendance!.retry();
    await flush();
    expect(h.vm().done.attendance).toMatchObject({ error: null, empty: 'Nobody you can register yet.' });
  });
  it('does not load a roster for a member or a non-classroom learning', () => {
    harness({ access: member('u1') }).L().openDetail('L10');
    harness({ access: domainAdmin(['Consulting'], 'u1') }).L().openDetail('L17');
    expect(attendance.loadRoster).not.toHaveBeenCalled();
  });
});
