// Create & share rules (FT-CS-*): content checks, rubric, creation rules, strictest review requirement, stages, badge.
import { describe, expect, it } from 'vitest';
import { NEW_TYPES, REVIEW_STAGES, RUBRIC } from '../data';
import {
  CREATE_TYPES, DEFAULT_POLICY, PART_VALUES, allowedValues, attrsLabel, blockedTerm, checksPass, contentChecks, daysWaiting, emptyParts, fmtDate, isEmptyRule, mayCreate,
  policyFor, policyLabel, reviewBadge, rubricComplete, ruleMatches, ruleProblem, ruleSentence, stageAt, stagesFor, stagesOf, togglePart, withinLines,
} from './contribution';
import type { Attrs, Contribution, CreateData, PolicyRow, Review, RuleParts } from './contribution';
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

const rule = (o: Partial<RuleParts> = {}): RuleParts => ({ ...emptyParts(), ...o });
const at = (o: Partial<Attrs> = {}): Attrs => ({ line: 'Consulting', format: 'Reel', domain: 'prof', audience: null, ...o });
const pol = (id: number, o: Partial<RuleParts>, peers: number, expert: boolean, quality: boolean): PolicyRow => ({ id, ...rule(o), peers, expert, quality });

describe('creation rules', () => {
  const example = rule({ lines: ['Consulting', 'Tax & Legal'], formats: ['Podcast'] });
  it('OR within a part, AND across the filled parts', () => {
    expect(ruleMatches(example, at({ line: 'Tax & Legal', format: 'Podcast' }))).toBe(true);
    expect(ruleMatches(example, at({ line: 'Consulting', format: 'Podcast', domain: 'reg' }))).toBe(true);
    expect(ruleMatches(example, at({ line: 'Audit', format: 'Podcast' }))).toBe(false);
    expect(ruleMatches(example, at({ line: 'Consulting', format: 'Reel' }))).toBe(false);
  });
  it('treat an empty part as any', () => {
    const anyLine = rule({ formats: ['Reel'], domains: ['reg'] });
    ['Consulting', 'Audit', 'Tax & Legal'].forEach((line) => expect(ruleMatches(anyLine, at({ line, domain: 'reg' }))).toBe(true));
    expect(ruleMatches(anyLine, at({ domain: 'prof' }))).toBe(false);
  });
  it('make the audience optional unless the rule names audiences', () => {
    expect(ruleMatches(rule({ lines: ['Consulting'] }), at({ audience: 'ind:energy' }))).toBe(true);
    expect(ruleMatches(rule({ lines: ['Consulting'] }), at())).toBe(true);
    const energy = rule({ audiences: ['ind:energy', 'tec:ai'] });
    expect(ruleMatches(energy, at())).toBe(false);
    expect(ruleMatches(energy, at({ audience: 'tec:ai' }))).toBe(true);
    expect(ruleMatches(energy, at({ audience: 'tec:sap' }))).toBe(false);
  });
  it('allow when any of several rules matches', () => {
    const rules = [example, rule({ domains: ['reg'] })];
    expect(mayCreate(rules, at({ line: 'Audit', format: 'Reel', domain: 'reg' }))).toBe(true);
    expect(mayCreate(rules, at({ line: 'Audit', format: 'Reel', domain: 'prof' }))).toBe(false);
    expect(mayCreate([], at())).toBe(false);
  });
  it('read in plain words', () => {
    expect(ruleSentence(example)).toBe('Consulting or Tax & Legal · Podcast');
    expect(ruleSentence(rule({ formats: ['Reel'], domains: ['reg'] }))).toBe('Any line · Reel · Regulations');
    expect(ruleSentence(rule({ lines: ['Audit'], audiences: ['ind:energy'] }))).toBe('Audit · Energy & utilities');
  });
  it('offer the union of what the rules allow, everything for a part some rule leaves open', () => {
    const a = allowedValues([example, rule({ lines: ['Audit'], domains: ['reg'], audiences: ['tec:ai'] })]);
    expect(a.lines).toEqual(['Consulting', 'Audit', 'Tax & Legal']);
    expect(a.formats).toEqual(PART_VALUES.formats);
    expect(a.domains).toEqual(PART_VALUES.domains);
    expect(a.audiences).toEqual(PART_VALUES.audiences);
    expect(a.noAudience).toBe(true);
    const narrow = allowedValues([rule({ lines: ['Audit'], formats: ['Podcast'], domains: ['reg'], audiences: ['tec:ai'] })]);
    expect([narrow.lines, narrow.formats, narrow.domains, narrow.audiences, narrow.noAudience]).toEqual([['Audit'], ['Podcast'], ['reg'], ['tec:ai'], false]);
  });
  it('toggle values in display order and know an empty rule', () => {
    let r = togglePart(emptyParts(), 'lines', 'Tax & Legal');
    r = togglePart(r, 'lines', 'Consulting');
    expect(r.lines).toEqual(['Consulting', 'Tax & Legal']);
    expect(togglePart(r, 'lines', 'Consulting').lines).toEqual(['Tax & Legal']);
    expect(isEmptyRule(emptyParts())).toBe(true);
  });
  it('let a Domain Admin grant only within their lines, never any line', () => {
    expect(withinLines(rule({ formats: ['Reel'] }), true, [])).toBe(true);
    expect(withinLines(rule({ formats: ['Reel'] }), false, ['Consulting'])).toBe(false);
    expect(withinLines(rule({ lines: ['Consulting'] }), false, ['Consulting'])).toBe(true);
    expect(withinLines(rule({ lines: ['Consulting', 'Audit'] }), false, ['Consulting'])).toBe(false);
    expect(ruleProblem(emptyParts(), true, [])).toBe('Pick at least one value');
    expect(ruleProblem(rule({ formats: ['Reel'] }), false, ['Consulting'])).toBe('Pick at least one of your business lines, and only yours');
    expect(ruleProblem(rule({ lines: ['Consulting'] }), false, ['Consulting'])).toBe('');
  });
  it('label the line and audience of a contribution', () => {
    expect(attrsLabel(at({ audience: 'ind:energy' }))).toBe('Consulting · Energy & utilities');
  });
});

describe('review requirements and stages', () => {
  const rows: PolicyRow[] = [pol(1, { formats: ['Micro-guide'] }, 1, false, true), pol(2, { lines: ['Audit'] }, 0, false, false)];
  it('default to two peers, an expert and quality & risk', () => {
    expect(policyFor(rows, at())).toEqual(DEFAULT_POLICY);
    expect(policyFor(rows, null)).toEqual({ peers: 2, expert: true, quality: true });
    expect(policyFor(rows, at({ format: 'Micro-guide' }))).toEqual({ peers: 1, expert: false, quality: true });
  });
  it('take the strictest of every matching requirement', () => {
    expect(policyFor(rows, at({ line: 'Audit', format: 'Micro-guide' }))).toEqual({ peers: 1, expert: false, quality: true });
    const more = rows.concat(pol(3, { domains: ['reg'] }, 0, true, false));
    expect(policyFor(more, at({ line: 'Audit', format: 'Micro-guide', domain: 'reg' }))).toEqual({ peers: 1, expert: true, quality: true });
    expect(policyFor(more, at({ line: 'Audit', domain: 'reg' }))).toEqual({ peers: 0, expert: true, quality: false });
  });
  it('count audience-scoped requirements when no audience is given', () => {
    const aud = [pol(1, { audiences: ['tec:sap'] }, 1, false, true), pol(2, { lines: ['Audit'], formats: ['Reel'] }, 0, false, false)];
    expect(policyFor(aud, at({ line: 'Audit' }))).toEqual({ peers: 1, expert: false, quality: true });
    expect(policyFor(aud, at({ line: 'Audit', audience: 'ind:energy' }))).toEqual({ peers: 0, expert: false, quality: false });
    expect(policyFor(aud, at({ line: 'Audit', audience: 'tec:sap' }))).toEqual({ peers: 1, expert: false, quality: true });
  });
  it('show only the steps the requirement asks for', () => {
    expect(stagesFor(DEFAULT_POLICY).map((s) => s.name)).toEqual(REVIEW_STAGES);
    expect(stagesFor({ peers: 1, expert: false, quality: true }).map((s) => s.name)).toEqual(['Draft', 'Peer review', 'Quality & risk', 'Published']);
    expect(stagesFor({ peers: 0, expert: false, quality: false }).map((s) => s.name)).toEqual(['Draft', 'Published']);
  });
  it('label the requirement', () => {
    expect(policyLabel(DEFAULT_POLICY)).toBe('2 peers, expert, quality & risk');
    expect(policyLabel({ peers: 1, expert: false, quality: true })).toBe('1 peer, quality & risk');
    expect(policyLabel({ peers: 0, expert: false, quality: false })).toBe('no review · published on submit');
  });
  it('follow the routed steps once submitted, the effective requirement while a draft', () => {
    const draft = contribution({ type: 'Micro-guide' });
    expect(stagesOf(draft, [], rows).map((s) => s.step)).toEqual([0, 1, 3, 4]);
    const sent = contribution({ status: 'review', step: 3 });
    const st = stagesOf(sent, [review({ step: 3 })], rows);
    expect(st.map((s) => s.name)).toEqual(['Draft', 'Quality & risk', 'Published']);
    expect(stageAt(st, 3)).toBe(1);
    expect(stageAt(stagesOf(contribution({ status: 'published', step: 4 }), [], rows), 4)).toBe(1);
  });
});

describe('the review badge', () => {
  const d = (reviews: Review[], contributions: Contribution[]): CreateData => ({ contributions, reviews, rules: [], policies: [], peers: 2 });
  it('counts pending reviews of the signed-in person on contributions in review', () => {
    const c1 = contribution({ status: 'review', step: 1 }), c2 = contribution({ id: 'c2', status: 'changes', step: 1 }), c3 = contribution({ id: 'c3', status: 'review', step: 2 });
    const data = d([review(), review({ contribution_id: 'c2' }), review({ contribution_id: 'c3', step: 2, verdict: 'waiting' }), review({ contribution_id: 'c1', slot: 2, reviewer_id: 'u3' })], [c1, c2, c3]);
    expect(reviewBadge(data, 'u2')).toBe(1);
    expect(reviewBadge(data, 'u3')).toBe(1);
    expect(reviewBadge(data, 'u9')).toBe(0);
    expect(reviewBadge(null, 'u2')).toBe(0);
  });
});

describe('types', () => {
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
