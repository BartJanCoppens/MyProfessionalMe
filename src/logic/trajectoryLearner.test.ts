import { describe, expect, it } from 'vitest';
import type { Credential, Enrolment, Trajectory } from './trajectory';
import { blankTrajectory } from './trajectoryEdit';
import { canWithdraw, credentialLook, dayLabel, effectiveEnrolment, stepAction } from './trajectoryLearner';

const trj = (over: Partial<Trajectory> = {}): Trajectory => ({ ...blankTrajectory('Audit'), id: 'T1', status: 'live', published_at: '2026-09-10T08:00:00Z', ...over });
const person = { line: 'Audit', stage: 'Consultant' };
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
