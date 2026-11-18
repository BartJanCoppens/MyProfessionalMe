// What a studio's rows publish as (studios plan, Task 2.1): the same fixtures as the SC cases in supabase/tests/rls.sql,
// read back by parseFormatContent, and the SQL that builds and checks them kept in step with the TypeScript rules.
import { describe, expect, it } from 'vitest';
import { parseFormatContent } from '../lib/contentStore';
import { STUDIOS } from '../studioData';
import { ITEM_FORMATS, ITEM_MAX, LONG_MAX, SHORT_MAX } from './items';
import { CASE_HOURS, CASE_REVIEWER, DEPTH_QUESTION, END_CHECK, END_NONE, END_QUESTION, END_SUMMARY, EVIDENCE_QUESTION, LENGTH_QUESTION, MOTION_LENGTH, NEEDS_CHECK, NEEDS_CHECK_AI, NEEDS_CHECK_NO_AI, UNUSED_CHECK,
  caseHours, countsAsEvidence, explainerProblems, studioContent } from './studioContent';
import { LEADERBOARD_QUESTION, ROLE_QUESTION } from './gameContent';
import { FORMAT_QUESTION } from './podcastContent';
import { PRESENTER, TEMPLATE, TRANSITIONS } from './slidesContent';
import { CASE_LABELS, CHECK_SIZE, itemsValid, rowsMax, studioById } from './studios';
import type { StudioEntry, StudioItem } from './studios';
import type { ExamQuestion } from '../types';

const AID: StudioItem[] = [['Before', 'Objectives and scope confirmed '], ['Before', 'Stakeholder map ready'], ['During', 'Agree who signs off'], ['After', 'Minutes out within 24 hours']];
const STEPS: StudioItem[] = [['Supplier', 'Creates the invoice. '], ['Access point', 'Checks the format.'], ['Customer', 'Gets the invoice.']];
const Q = (k: number): ExamQuestion => ({ t: 'Peppol', q: 'Question ' + k + '?', o: ['a', 'b', 'c', 'd'], a: k % 4, why: 'Because.' });
const CHECK = [Q(0), Q(1), Q(2)];
const CASE: StudioItem[] = [['Brief', 'Two companies merged on 1 October.'], ['Deliverable', 'A day-100 roadmap'], ['Deliverable', 'Three decisions for the CFO'], ['Criterion', 'Realistic sequencing']];

describe('studioContent', () => {
  it('makes a job aid of one "label · text" line per row, as private.aid_content does', () => {
    const c = studioContent('Job aid', AID, {});
    expect(c).toEqual({ kind: 'aid', items: ['Before · Objectives and scope confirmed', 'Before · Stakeholder map ready', 'During · Agree who signs off', 'After · Minutes out within 24 hours'] });
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('makes a case of the brief, deliverables and criteria, reviewed by the counsellor, as private.case_content does', () => {
    const c = studioContent('Case exercise', CASE, { [EVIDENCE_QUESTION]: 'Yes', [LENGTH_QUESTION]: 'A full day' });
    expect(c).toEqual({ kind: 'case', brief: 'Two companies merged on 1 October.', deliv: ['A day-100 roadmap', 'Three decisions for the CFO'], rubric: ['Realistic sequencing'],
      reviewer: 'Reviewed by your counsellor.', evidence: true });
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('makes an explainer of its steps, its depth and its ending, as private.explainer_content does', () => {
    const c = studioContent('Interactive explainer', STEPS, { [DEPTH_QUESTION]: 'With technical detail', [END_QUESTION]: END_SUMMARY });
    expect(c).toEqual({ kind: 'explainer', style: 'Step-through', depth: 'With technical detail', end: END_SUMMARY,
      steps: [{ label: 'Supplier', text: 'Creates the invoice.' }, { label: 'Access point', text: 'Checks the format.' }, { label: 'Customer', text: 'Gets the invoice.' }] });
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('ends an explainer with its three-question check only when that is the chosen ending', () => {
    const c = studioContent('Interactive explainer', [...STEPS, ...CHECK], { [END_QUESTION]: END_CHECK });
    expect(c).toMatchObject({ end: END_CHECK, check: CHECK });
    expect(parseFormatContent(c)).toEqual(c);
    expect(studioContent('Interactive explainer', [...STEPS, ...CHECK], { [END_QUESTION]: END_NONE })).not.toHaveProperty('check');
  });
  it('reads an unanswered or unknown depth and ending as an overview with a summary card', () => {
    expect(studioContent('Interactive explainer', STEPS, {})).toMatchObject({ depth: 'Overview', end: END_SUMMARY });
    expect(studioContent('Interactive explainer', STEPS, { [DEPTH_QUESTION]: 'Deep', [END_QUESTION]: 'Fireworks' })).toMatchObject({ depth: 'Overview', end: END_SUMMARY });
  });
  it('asks for the check when the ending is the check, and for its removal when it is not', () => {
    expect(explainerProblems(STEPS, { [END_QUESTION]: END_CHECK })).toEqual([NEEDS_CHECK + NEEDS_CHECK_AI]);
    expect(explainerProblems(STEPS, { [END_QUESTION]: END_CHECK }, false)).toEqual([NEEDS_CHECK + NEEDS_CHECK_NO_AI]);
    expect(explainerProblems([...STEPS, ...CHECK], { [END_QUESTION]: END_CHECK })).toEqual([]);
    expect(explainerProblems([...STEPS, ...CHECK], { [END_QUESTION]: END_SUMMARY })).toEqual([UNUSED_CHECK]);
    expect(explainerProblems([...STEPS, ...CHECK], {})).toEqual([UNUSED_CHECK]);
    expect(explainerProblems(STEPS, {})).toEqual([]);
  });
  it('counts a case as trajectory evidence only when the answer is Yes', () => {
    expect(studioContent('Case exercise', CASE, { [EVIDENCE_QUESTION]: 'No' })).toMatchObject({ evidence: false });
    expect(studioContent('Case exercise', CASE, {})).toMatchObject({ evidence: false });
    expect(countsAsEvidence(studioContent('Case exercise', CASE, { [EVIDENCE_QUESTION]: 'Yes' }))).toBe(true);
    expect(countsAsEvidence(studioContent('Case exercise', CASE, {}))).toBe(false);
    expect(countsAsEvidence(studioContent('Job aid', AID, {}))).toBe(false);
    expect(countsAsEvidence(null)).toBe(false);
  });
  it('makes the design examples into content the library reads', () => {
    ['aid', 'case', 'explainer'].forEach((id) => { const d = studioById(id)!; expect(parseFormatContent(studioContent(d.format, d.items, {}))).not.toBeNull(); });
  });
  it('has no content for a format without a built studio', () => {
    expect(studioContent('Reel', [['Hook', 'x', 'y']], {})).toBeNull();
  });
  it('asks the evidence and length questions the Case Studio asks, with an hour count per length option', () => {
    const qs = studioById('case')!.qs;
    expect(qs.map((q) => q[0])).toEqual([LENGTH_QUESTION, EVIDENCE_QUESTION]);
    expect(Object.keys(CASE_HOURS)).toEqual(qs[0][1]);
  });
  it('counts a case 2, 4 or 8 hours by its length, half a day when unanswered', () => {
    expect([caseHours({ [LENGTH_QUESTION]: '2 hours' }), caseHours({ [LENGTH_QUESTION]: 'Half a day' }), caseHours({ [LENGTH_QUESTION]: 'A full day' }), caseHours({})]).toEqual([2, 4, 8, 4]);
  });
  it('offers only answers the product delivers: every other question or row says it steers the AI draft', () => {
    const published = [LENGTH_QUESTION, EVIDENCE_QUESTION, END_QUESTION, MOTION_LENGTH, PRESENTER, TEMPLATE, TRANSITIONS, FORMAT_QUESTION, ROLE_QUESTION, LEADERBOARD_QUESTION];
    STUDIOS.filter((d) => d.available && !d.compact).forEach((d) => [...d.qs, ...d.rows].forEach(([q, , steers]) => expect(!!steers || published.includes(q), d.id + ' · ' + q).toBe(true)));
    expect(studioById('case')!.rows.map((r) => r[0])).toEqual(['Names']);
    expect(studioById('aid')!.qs.map((q) => q[0])).toEqual(['Template?', 'When is it used?']);
    expect(studioById('aid')!.rows.map((r) => r[0])).toEqual(['Template']);
  });
  it('keeps only the Explainer choices its panel delivers: depth steers the draft, the ending is published; no style, look or narration', () => {
    const d = studioById('explainer')!;
    expect(d.available).toBe(true);
    expect(d.qs).toEqual([[DEPTH_QUESTION, ['Overview', 'With technical detail'], 'draft'], [END_QUESTION, [END_CHECK, END_SUMMARY, END_NONE]]]);
    expect(d.rows).toEqual([]);
    expect(d.cast).toBeNull();
  });
});

describe('itemsValid: the rules private.items_ok repeats', () => {
  it('refuses a label over SHORT_MAX and a text over LONG_MAX', () => {
    expect(itemsValid(studioById('aid')!, [['x'.repeat(SHORT_MAX + 1), 'a'], ...AID.slice(1)]).join(' ')).toMatch(/too long/);
    expect(itemsValid(studioById('aid')!, [['Before', 'x'.repeat(LONG_MAX + 1)], ...AID.slice(1)]).join(' ')).toMatch(/too long/);
    expect(itemsValid(studioById('reel')!, studioById('reel')!.items.map((r, k): StudioItem => (k === 0 ? [r[0], r[1], 'x'.repeat(LONG_MAX + 1)] : r))).join(' ')).toMatch(/too long/);
  });
  it('refuses a case row outside Brief, Deliverable and Criterion', () => {
    expect(itemsValid(studioById('case')!, [...CASE, ['Note', 'Bring coffee']]).join(' ')).toMatch(/Note: use Brief, Deliverable or Criterion/);
  });
  it('lets an explainer carry a check of exactly three questions after its steps, and counts only steps toward its minimum', () => {
    const d = studioById('explainer')!;
    expect(CHECK_SIZE).toBe(3);
    expect(itemsValid(d, [...STEPS, ...CHECK])).toEqual([]);
    expect(itemsValid(d, [...STEPS, ...CHECK.slice(0, 2)]).join(' ')).toMatch(/exactly 3 questions/);
    expect(itemsValid(d, [...STEPS.slice(0, 2), ...CHECK]).join(' ')).toMatch(/at least 3 items/);
    expect(itemsValid(d, [...STEPS, ...CHECK.slice(0, 2), { ...Q(3), o: ['a', 'b'] }] as StudioEntry[]).join(' ')).toMatch(/exactly 3 questions/);
    expect(itemsValid(d, [...Array.from({ length: 8 }, (_, k): StudioItem => ['Step ' + k, 'x']), ...CHECK]).join(' ')).toMatch(/at most 10 items/);
  });
  it('takes the most rows of a studio from ITEM_MAX, by its format', () => {
    expect(rowsMax(studioById('aid')!)).toBe(ITEM_MAX['Job aid']);
    expect(rowsMax(studioById('case')!)).toBe(12);
  });
});

// ---------- SQL in step ----------
const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.keys(migrations).sort();
function body(fn: string): string {
  const re = new RegExp('create (?:or replace )?function ' + fn.replace('.', '\\.') + '\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$');
  for (const f of files.slice().reverse()) { const m = re.exec(migrations[f]); if (m) return m[1]; }
  throw new Error('no migration defines ' + fn);
}
const quoted = (list: string) => Array.from(list.matchAll(/'([^']*)'/g), (x) => x[1]);

describe('the database repeats these rules', () => {
  it('private.item_max lists ITEM_MAX', () => {
    const rows = Array.from(body('private.item_max').matchAll(/\('([^']+)', (\d+)\)/g), (m) => [m[1], +m[2]]);
    expect(Object.fromEntries(rows)).toEqual(ITEM_MAX);
  });
  it('private.rows_ok caps first fields at SHORT_MAX and the others at LONG_MAX (fieldOk, rowFieldMax)', () => {
    const b = body('private.rows_ok');
    expect(b).toContain("char_length(e ->> 0) > " + SHORT_MAX);
    expect(b).toContain("char_length(e ->> 1) > " + LONG_MAX);
    expect(b).toContain("char_length(coalesce(e ->> 2, '')) > " + LONG_MAX);
  });
  it('private.items_ok checks the rows of exactly the available studios that make rows, and the case labels', () => {
    const b = body('private.items_ok');
    expect(b).toContain("when p_type = 'Flash cards' then private.rows_ok(p_items, private.item_max(p_type), 2)");
    const rows = /when p_type in \(([^)]*)\) then private\.rows_ok\(p_items, private\.item_max\(p_type\), 3\)/.exec(b);
    expect(quoted(rows![1])).toEqual(STUDIOS.filter((d) => d.available && !d.compact && !['explainer', 'motion', 'slides', 'podcast', 'game'].includes(d.id)).map((d) => d.format));
    expect(b).toContain("when p_type = 'Practice exam' then jsonb_array_length(p_items) between 1 and private.item_max(p_type) and not exists (select 1 from jsonb_array_elements(p_items) e where not private.question_ok(e))");
    expect(b).toContain("when p_type = 'Interactive explainer' then private.explainer_ok(p_items)");
    expect(quoted(/\(e ->> 0\) not in \(([^)]*)\)/.exec(b)![1])).toEqual(CASE_LABELS);
    expect(b).toContain('= ' + CASE_LABELS.length + ')');
  });
  it('private.case_content and private.aid_content use the same words as studioContent', () => {
    const c = body('private.case_content');
    expect(c).toContain("'" + CASE_REVIEWER + "'");
    expect(c).toContain("p_shape ->> '" + EVIDENCE_QUESTION + "'");
    CASE_LABELS.forEach((l) => expect(c).toContain("x.e ->> 0 = '" + l + "'"));
    expect(body('private.aid_content')).toContain("' · '");
  });
  it('private.carries_items is carriesItems, and every SQL site uses it', () => {
    expect(quoted(/p_type in \(([^)]*)\) or p_studio is not null/.exec(body('private.carries_items'))![1])).toEqual(ITEM_FORMATS);
    expect(body('private.publish_contribution')).toContain('private.carries_items(c.type, c.studio)');
    expect(body('private.contribution_problems')).toContain('private.carries_items(c.type, c.studio)');
    const last = files.slice().reverse().map((f) => /add constraint contributions_items_check\s+check \(([\s\S]*?)\);/.exec(migrations[f])).find(Boolean)!;
    expect(last[1]).toContain('private.carries_items(type, studio)');
  });
  it('private.case_hours is CASE_HOURS, and publishing uses it', () => {
    const b = body('private.case_hours');
    expect(b).toContain("p_shape ->> '" + LENGTH_QUESTION + "'");
    expect(Object.fromEntries(Array.from(b.matchAll(/when '([^']+)' then (\d+)/g), (m) => [m[1], +m[2]]))).toEqual(CASE_HOURS);
    expect(b).toContain('else ' + caseHours({}) + ' end');
    expect(body('private.publish_contribution')).toContain("when 'Case exercise' then private.case_hours(c.shape)");
  });
  it('the answers are in the check fingerprint and the client-name scan, questions and answers alike', () => {
    expect(body('private.check_contribution')).toContain('private.contribution_fingerprint(c.items, c.title, c.type, c.shape)');
    expect(body('private.submit_contribution')).toContain('private.contribution_fingerprint(c.items, c.title, c.type, c.shape)');
    expect(body('private.contribution_problems')).toContain("string_agg(a.key || ' ' || a.value, ' ') from jsonb_each_text(c.shape) a");
  });
  it('private.explainer_ok and private.explainer_content follow the Explainer rules: a check of CHECK_SIZE, the same words', () => {
    const ok = body('private.explainer_ok');
    expect(ok).toContain('private.rows_ok(');
    expect(ok).toContain('in (0, ' + CHECK_SIZE + ')');
    expect(ok).toContain('private.question_ok(e)');
    const c = body('private.explainer_content');
    expect(c).toContain("'style', 'Step-through'");
    [DEPTH_QUESTION, END_QUESTION].forEach((q) => expect(c).toContain("p_shape ->> '" + q + "'"));
    [END_CHECK, END_SUMMARY, END_NONE, 'Overview', 'With technical detail'].forEach((w) => expect(c).toContain("'" + w + "'"));
    const p = body('private.contribution_problems');
    [NEEDS_CHECK, UNUSED_CHECK].forEach((m) => expect(p).toContain("'" + m.replace(/'/g, "''") + "'"));
    expect(p).toContain("c.type not in ('Interactive explainer', 'Animated flow', 'Slides', 'Podcast', 'Game') or jsonb_typeof(e) = 'array'");
  });
  it('private.contribution_content publishes every format whose studio is available', () => {
    const b = body('private.contribution_content');
    STUDIOS.filter((d) => d.available).forEach((d) => [d.format, ...(d.alsoFormats ?? [])].forEach((f) => expect(b).toContain("when '" + f + "' then")));
  });
});
