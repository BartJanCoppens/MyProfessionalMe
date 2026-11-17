import { describe, expect, it } from 'vitest';
import type { Credential, Enrolment, Trajectory, TrjDecision } from './trajectory';
import { blankTrajectory } from './trajectoryEdit';
import { canWithdraw, credentialLook, dayLabel, effectiveEnrolment, stepAction, talkNote } from './trajectoryLearner';

const trj = (over: Partial<Trajectory> = {}): Trajectory => ({ ...blankTrajectory('Audit'), id: 'T1', status: 'live', published_at: '2026-09-10T08:00:00Z', ...over });
const person = { line: 'Audit', stage: 'Consultant', audiences: [] as string[] };
const NOW = new Date('2026-11-17T10:00:00Z');
const row = (over: Partial<Enrolment> = {}): Enrolment => ({ status: 'enrolled', start_month: 2026 * 12 + 9, steps: {}, ...over });
const auto = trj({ enrol: 'auto', maps: [['Audit', 'Consultant', 'mandatory']] });

describe('effectiveEnrolment', () => {
  it('is the stored row when there is one', () => expect(effectiveEnrolment(trj(), row(), person, NOW)).toEqual(row()));
  it('is null with no row and no mandatory auto-enrolment', () => {
    expect(effectiveEnrolment(trj(), undefined, person, NOW)).toBeNull();
    expect(effectiveEnrolment(trj({ enrol: 'auto', maps: [['Audit', 'Consultant', 'advised']] }), undefined, person, NOW)).toBeNull();
  });
  it('enrols a mandatory auto person without a row, from the publication month', () => {
    expect(effectiveEnrolment(auto, undefined, person, NOW)).toEqual({ status: 'enrolled', start_month: 2026 * 12 + 8, steps: {} });
  });
});

describe('canWithdraw', () => {
  it('allows a request and an enrolment with no done step', () => {
    expect(canWithdraw(trj(), row({ status: 'requested' }), person)).toBe(true);
    expect(canWithdraw(trj(), row(), person)).toBe(true);
    expect(canWithdraw(trj(), row({ steps: { s1: { state: 'submitted' }, s2: { state: 'booked' } } }), person)).toBe(true);
  });
  it('refuses once a step is done, with no row, and for a mandatory auto person', () => {
    expect(canWithdraw(trj(), row({ steps: { s1: { state: 'done' } } }), person)).toBe(false);
    expect(canWithdraw(trj(), undefined, person)).toBe(false);
    expect(canWithdraw(auto, row(), person)).toBe(false);
    expect(canWithdraw({ ...auto, status: 'retired' }, row(), person)).toBe(false);
  });
  it('binds a member of a mandatory tec: audience, and frees them once the membership is removed', () => {
    const data = trj({ enrol: 'auto', maps: [['tec:data', 'Consultant', 'mandatory']] });
    expect(canWithdraw(data, row(), { ...person, audiences: ['tec:data'] })).toBe(false);
    expect(canWithdraw(data, row(), person)).toBe(true);
    expect(effectiveEnrolment(data, undefined, { ...person, audiences: ['tec:data'] }, NOW)?.status).toBe('enrolled');
  });
});

describe('stepAction', () => {
  it('opens a learning, asks for evidence, sign-off, and books then submits the exam', () => {
    expect(stepAction('learn', 'open')).toBe('open');
    expect(stepAction('learn', 'progress')).toBe('open');
    expect(stepAction('evidence', 'open')).toBe('evidence');
    expect(stepAction('check', 'open')).toBe('signoff');
    expect(stepAction('exam', 'open')).toBe('book');
    expect(stepAction('exam', 'booked')).toBe('result');
  });
  it('has nothing for a submitted, done or elective step', () => {
    expect(stepAction('evidence', 'submitted')).toBeNull();
    expect(stepAction('exam', 'submitted')).toBeNull();
    expect(stepAction('check', 'done')).toBeNull();
    expect(stepAction('elect', 'open')).toBeNull();
  });
});

const cred = (over: Partial<Credential> = {}): Credential => ({ id: 'c', user_id: 'u1', name: 'X', issuer: 'Y', earned_on: '2026-01-05', expires_on: null, link: '', ref: '', trajectory_id: null, status: 'confirmed', ...over });
describe('credentialLook', () => {
  it('is Valid with no expiry or a distant one', () => {
    expect(credentialLook(cred(), NOW, 'Sam').label).toBe('Valid');
    expect(credentialLook(cred({ expires_on: '2027-03-01' }), NOW, 'Sam').label).toBe('Valid');
  });
  it('asks to renew within 30 days, including today and day 30', () => {
    expect(credentialLook(cred({ expires_on: '2026-12-17' }), NOW, 'Sam')).toMatchObject({ label: 'Renew by 17 Dec 2026', status: 'clarification' });
    expect(credentialLook(cred({ expires_on: '2026-11-17' }), NOW, 'Sam').label).toBe('Renew by 17 Nov 2026');
    expect(credentialLook(cred({ expires_on: '2026-12-18' }), NOW, 'Sam').label).toBe('Valid');
  });
  it('shows an expired credential and a waiting external one', () => {
    expect(credentialLook(cred({ expires_on: '2026-11-16' }), NOW, 'Sam').label).toBe('Expired 16 Nov 2026');
    expect(credentialLook(cred({ status: 'waiting', expires_on: '2026-11-20' }), NOW, 'Sam')).toMatchObject({ label: 'Waiting for Sam', status: 'submitted' });
  });
});
it('dayLabel', () => expect(dayLabel('2026-02-03')).toBe('3 Feb 2026'));

describe('talkNote: the latest "talk first" comment the learner sees', () => {
  const talk = (over: Partial<TrjDecision> = {}): TrjDecision => ({ trajectoryId: 'T1', stepId: 's1', decision: 'talk', comment: 'Add the client file, please.', byName: 'Casey Boss', at: '2026-11-10T09:00:00Z', ...over });
  it('shows the counsellor\'s first name and the comment on a step sent back', () => {
    expect(talkNote([talk()], 'T1', 's1', row())).toBe('Casey: Add the client file, please.');
  });
  it('says "Your counsellor" when the name is not known', () => {
    expect(talkNote([talk({ byName: '' })], 'T1', 's1', row())).toBe('Your counsellor: Add the client file, please.');
  });
  it('hides it once the step is sent again or signed off, and when a newer decision replaced it', () => {
    expect(talkNote([talk()], 'T1', 's1', row({ steps: { s1: { state: 'submitted' } } }))).toBe('');
    expect(talkNote([talk()], 'T1', 's1', row({ steps: { s1: { state: 'done' } } }))).toBe('');
    expect(talkNote([talk(), talk({ decision: 'approve', comment: '', at: '2026-11-12T09:00:00Z' })], 'T1', 's1', row())).toBe('');
  });
  it('shows the newest talk, and only for its own trajectory and step', () => {
    const older = talk({ comment: 'The first comment, now old.', at: '2026-11-01T09:00:00Z' });
    expect(talkNote([older, talk()], 'T1', 's1', row())).toBe('Casey: Add the client file, please.');
    expect(talkNote([talk()], 'T1', 's2', row())).toBe('');
    expect(talkNote([talk()], 'T2', 's1', row())).toBe('');
    expect(talkNote([talk()], 'T1', null, row({ status: 'requested' }))).toBe('');
  });
  it('a talk from before this enrolment is not shown (the learner left and started again)', () => {
    expect(talkNote([talk()], 'T1', 's1', row({ created_at: '2026-11-12T09:00:00Z' }))).toBe('');
    expect(talkNote([talk({ stepId: null })], 'T1', null, row({ status: 'requested', created_at: '2026-11-12T09:00:00Z' }))).toBe('');
    expect(talkNote([talk()], 'T1', 's1', row({ created_at: '2026-11-01T09:00:00Z' }))).toBe('Casey: Add the client file, please.');
  });
  it('on the start request: shows it while the request waits and was made before the talk', () => {
    const start = talk({ stepId: null, comment: 'Let us plan the study leave.' });
    expect(talkNote([start], 'T1', null, row({ status: 'requested', asked_at: '2026-11-01T09:00:00Z' }))).toBe('Casey: Let us plan the study leave.');
    expect(talkNote([start], 'T1', null, row({ status: 'requested', asked_at: '2026-11-15T09:00:00Z' }))).toBe('');
    expect(talkNote([start], 'T1', null, row({ status: 'enrolled' }))).toBe('');
    expect(talkNote([start], 'T1', null, null)).toBe('');
  });
});
