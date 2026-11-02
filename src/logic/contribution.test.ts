// Create & share rules (FT-CS-*): content checks, rubric, review policies, stages per policy, badge, topics.
import { describe, expect, it } from 'vitest';
import { NEW_TYPES, REVIEW_STAGES, RUBRIC } from '../data';
import {
  CREATE_TYPES, DEFAULT_POLICY, allTopics, blockedTerm, checksPass, contentChecks, daysWaiting, fmtDate, parseTopic, policyFor, policyLabel,
  reviewBadge, rubricComplete, stageAt, stagesFor, stagesOf, topicKey, topicLabel, topicLong,
} from './contribution';
import type { Contribution, CreateData, PolicyRow, Review } from './contribution';
import { contribution, review } from '../test/contributions';

describe('content checks', () => {
  const ok = { title: 'Three questions that expose scope creep', takeaway: 'Ask what changed, who asked and what it costs.' };
  it('pass a clean draft', () => {
    expect(contentChecks(ok).map((c) => c.ok)).toEqual([true, true, true]);
    expect(checksPass(contentChecks(ok))).toBe(true);
  });
  it('refuse a title over 60 characters and an empty one', () => {
    const c = contentChecks({ ...ok, title: 'x'.repeat(61) });
    expect(c[0]).toEqual({ ok: false, text: 'Title is over 60 characters (61)' });
    expect(contentChecks({ ...ok, title: 'x'.repeat(60) })[0].ok).toBe(true);
    expect(contentChecks({ ...ok, title: '   ' })[0]).toEqual({ ok: false, text: 'Add a title' });
  });
  it('need one takeaway of at most 200 characters', () => {
    expect(contentChecks({ ...ok, takeaway: ' ' })[1]).toEqual({ ok: false, text: 'Write the one takeaway' });
    expect(contentChecks({ ...ok, takeaway: 'y'.repeat(201) })[1].ok).toBe(false);
    expect(contentChecks(ok)[1].text).toBe('One takeaway, 46 of 200 characters');
  });
  it('name the client found in the takeaway', () => {
    const c = contentChecks({ ...ok, takeaway: 'What we learned at Delcroix about pricing.' });
    expect(c[2]).toEqual({ ok: false, text: '“Delcroix” looks like a client name · anonymise it' });
    expect(checksPass(c)).toBe(false);
  });
  it('search the outline and cited sources too', () => {
    expect(contentChecks({ ...ok, outline: ['Open with the Brabant case'] })[2].ok).toBe(false);
    expect(contentChecks({ ...ok, sources: ['Notes · HOVERNA workshop'] })[2].text).toBe('“Hoverna” looks like a client name · anonymise it');
  });
  it('match whole words in any case, across punctuation and spacing', () => {
    expect(blockedTerm('DELCROIX')).toBe('delcroix');
    expect(blockedTerm('Pilot at Flemish-Care,  then')).toBe('flemish care');
    expect(blockedTerm('Delcroixville and brabantine')).toBeNull();
  });
});

describe('the rubric', () => {
  it('approves only when all four items hold', () => {
    expect(RUBRIC).toHaveLength(4);
    expect(rubricComplete([true, true, true, true])).toBe(true);
    expect(rubricComplete([true, true, true, false])).toBe(false);
    expect(rubricComplete([true, true, true])).toBe(false);
    expect(rubricComplete(undefined)).toBe(false);
  });
});

describe('review policies and stages', () => {
  const rows: PolicyRow[] = [{ topic_kind: 'format', topic_value: 'Micro-guide', peers: 1, expert: false, quality: true }, { topic_kind: 'line', topic_value: 'Audit', peers: 0, expert: false, quality: false }];
  it('default to two peers, an expert and quality & risk', () => {
    expect(policyFor(rows, { kind: 'line', value: 'Consulting' })).toEqual(DEFAULT_POLICY);
    expect(policyFor(rows, null)).toEqual({ peers: 2, expert: true, quality: true });
    expect(policyFor(rows, { kind: 'format', value: 'Micro-guide' })).toEqual({ peers: 1, expert: false, quality: true });
  });
  it('show only the steps the policy requires', () => {
    expect(stagesFor(DEFAULT_POLICY).map((s) => s.name)).toEqual(REVIEW_STAGES);
    expect(stagesFor({ peers: 1, expert: false, quality: true }).map((s) => s.name)).toEqual(['Draft', 'Peer review', 'Quality & risk', 'Published']);
    expect(stagesFor({ peers: 0, expert: false, quality: false }).map((s) => s.name)).toEqual(['Draft', 'Published']);
  });
  it('label the policy', () => {
    expect(policyLabel(DEFAULT_POLICY)).toBe('2 peers, expert, quality & risk');
    expect(policyLabel({ peers: 1, expert: false, quality: true })).toBe('1 peer, quality & risk');
    expect(policyLabel({ peers: 0, expert: false, quality: false })).toBe('no review · published on submit');
  });
  it('follow the routed steps once submitted, the current policy while a draft', () => {
    const draft = contribution({ topic_kind: 'format', topic_value: 'Micro-guide', type: 'Micro-guide' });
    expect(stagesOf(draft, [], rows).map((s) => s.step)).toEqual([0, 1, 3, 4]);
    const sent = contribution({ status: 'review', step: 3 });
    const st = stagesOf(sent, [review({ step: 3 })], rows);
    expect(st.map((s) => s.name)).toEqual(['Draft', 'Quality & risk', 'Published']);
    expect(stageAt(st, 3)).toBe(1);
    expect(stageAt(stagesOf(contribution({ status: 'published', step: 4 }), [], rows), 4)).toBe(1);
  });
});

describe('the review badge', () => {
  const d = (reviews: Review[], contributions: Contribution[]): CreateData => ({ contributions, reviews, grants: [], policies: [], peers: 2 });
  it('counts pending reviews of the signed-in person on contributions in review', () => {
    const c1 = contribution({ status: 'review', step: 1 }), c2 = contribution({ id: 'c2', status: 'changes', step: 1 }), c3 = contribution({ id: 'c3', status: 'review', step: 2 });
    const data = d([review(), review({ contribution_id: 'c2' }), review({ contribution_id: 'c3', step: 2, verdict: 'waiting' }), review({ contribution_id: 'c1', slot: 2, reviewer_id: 'u3' })], [c1, c2, c3]);
    expect(reviewBadge(data, 'u2')).toBe(1);
    expect(reviewBadge(data, 'u3')).toBe(1);
    expect(reviewBadge(data, 'u9')).toBe(0);
    expect(reviewBadge(null, 'u2')).toBe(0);
  });
});

describe('topics', () => {
  it('cover lines, industry and technology audiences, formats and domains', () => {
    const t = allTopics();
    expect(t.filter((x) => x.kind === 'line').map((x) => x.value)).toEqual(['Consulting', 'Audit', 'Tax & Legal']);
    expect(t.filter((x) => x.kind === 'audience').every((x) => /^(ind|tec):/.test(x.value))).toBe(true);
    expect(t.filter((x) => x.kind === 'format').map((x) => x.value)).toEqual(['Reel', 'Podcast', 'Micro-guide', 'Case write-up']);
    expect(t.filter((x) => x.kind === 'domain')).toHaveLength(9);
  });
  it('round-trip keys and read as labels', () => {
    expect(parseTopic(topicKey({ kind: 'audience', value: 'ind:energy' }))).toEqual({ kind: 'audience', value: 'ind:energy' });
    expect(parseTopic('nonsense')).toBeNull();
    expect(topicLabel({ kind: 'audience', value: 'ind:energy' })).toBe('Energy & utilities');
    expect(topicLong({ kind: 'domain', value: 'reg' })).toBe('Domain · Regulations');
  });
  it('leave out the avatar scenario until the avatar studio exists', () => {
    expect(NEW_TYPES).toHaveLength(5);
    expect(CREATE_TYPES.map((t) => t[0])).not.toContain('Avatar scenario');
  });
});

describe('dates', () => {
  it('format ISO dates and waiting time', () => {
    expect(fmtDate('2026-10-03T10:00:00Z')).toBe('3 Oct 2026');
    expect(fmtDate(null)).toBe('');
    const now = new Date('2026-11-02T12:00:00Z');
    expect(daysWaiting('2026-11-02T08:00:00Z', now)).toBe('Assigned today');
    expect(daysWaiting('2026-10-30T08:00:00Z', now)).toBe('Waiting 3 days');
  });
});
