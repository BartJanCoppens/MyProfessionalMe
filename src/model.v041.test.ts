// v0.4.1 (functional design F1): the owner's answers Q1, Q5 and Q8, one business-line rule, honest copy.
import { describe, expect, it } from 'vitest';
import { harness, person, withProgress, stubWindow } from './test/harness';
import { memberSummary } from './logic/team';

stubWindow();

const analyst = (rows: Parameters<typeof withProgress>[0], over = {}) => person({ stage: 'Analyst', data: withProgress(rows), ...over });

describe('readiness (Q5: accepted hours only)', () => {
  it('does not rise for a submitted item until it is accepted', () => {
    const none = harness({ subject: analyst({}) }).vm().readiness;
    expect(harness({ subject: analyst({ L7: 'submitted' }) }).vm().readiness).toBe(none);
    expect(harness({ subject: analyst({ L7: 'accepted' }) }).vm().readiness).toBeGreaterThan(none);
  });
  it('ignores hours in progress', () => {
    expect(harness({ subject: analyst({ L7: ['in-progress', 80] }) }).vm().readiness).toBe(0);
  });
  it('splits the year\'s hours into accepted and awaiting acceptance', () => {
    expect(harness({ subject: analyst({ L7: 'accepted', L16: 'submitted' }) }).vm().hoursSplit).toMatch(/^\d+(\.\d)? h accepted · \d+(\.\d)? h awaiting acceptance$/);
  });
  it('gives the counsellor the same readiness as the learner, also without a business line', () => {
    const data = withProgress({ L7: 'accepted', L16: 'submitted' });
    const own = harness({ subject: person({ stage: 'Analyst', businessLine: null, data }) }).vm().readiness;
    const roster = memberSummary({ id: 'u1', name: 'Robin', stage: 'Analyst', businessLine: null, data }, harness().state.maps, new Date('2026-11-01'), 'Consulting');
    expect(roster.readiness).toBe(own);
  });
});

describe('privacy (Q8: counsellors see the learning track, not ambitions or personality)', () => {
  const viewed = () => harness({ subject: person({ name: 'Kim Learner', readOnly: true, data: withProgress({}, { ambitions: [{ id: '1', text: 'Lead a team', horizon: '', doms: ['lead'], from: '' }], interests: [{ label: 'Coaching', dom: 'lead' }] }) }) }).vm();
  it('shows nobody else a person\'s ambitions or interests', () => {
    const vm = viewed();
    expect(vm.ambitions).toEqual([]);
    expect(vm.interests).toEqual([]);
    expect(vm.privateNote).toBe('Ambitions, interests and personality results are private to Kim.');
  });
  it('leaves the viewed person\'s ambitions cloud empty', () => {
    expect(viewed().cloudChips.find((c) => c.key === 'amb')!.count).toBe('0');
  });
  it('tells the learner what their counsellor sees', () => {
    expect(harness().vm().profLead).toBe('Your ambitions, interests and personality results are private. Your counsellor sees your learning track: progress and acceptance.');
    expect(harness().vm().privateNote).toBe('');
  });
});

describe('honest copy', () => {
  it('says ratings and notes are not available yet', () => {
    expect(harness({ state: { detailId: 'L1' } }).vm().det.rating).toBe('Ratings and notes are not available yet');
  });
  it('promises no automatic logging, evidence or sign-off', () => {
    const det = harness({ state: { detailId: 'L1' } }).vm().det;
    expect(JSON.stringify(det)).not.toMatch(/logged automatically|see your evidence|need no approval|ACCA, ITAA/);
  });
  it('labels example signals and estimated reach', () => {
    const vm = harness({ access: { isSystem: true, domains: [], userId: 'u1' }, state: { screen: 'adminMap' } }).vm();
    expect(vm.sigCards.every((c) => c.example)).toBe(true);
    expect(JSON.stringify(vm)).not.toMatch(/Learning Council sign-off/);
  });
});

describe('"Needs review" hides a learning like a draft (Q1)', () => {
  it('is refused while another line\'s audience still maps the learning', async () => {
    const h = harness({ access: { isSystem: false, domains: ['Consulting'], userId: 'u1' } });
    const form = { ...h.L().blankForm(), id: 'L30', title: 'Shared', hours: '2', line: 'Consulting' };
    const g = harness({ access: h.access, state: { libForm: form } });
    await g.L().saveLearningForm('review');
    expect(g.lastToast()).toMatch(/^Still mapped for .* · ask their admins to unmap it before it is hidden from learners$/);
  });
});
