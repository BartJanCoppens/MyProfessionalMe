// What a studio's rows publish as (studios plan, Task 2.1): the same fixtures as the SC cases in supabase/tests/rls.sql,
// read back by parseFormatContent, and the SQL that builds and checks them kept in step with the TypeScript rules.
import { describe, expect, it } from 'vitest';
import { parseFormatContent } from '../lib/contentStore';
import { STUDIOS } from '../studioData';
import { ITEM_MAX, LONG_MAX, SHORT_MAX } from './items';
import { CASE_REVIEWER, EVIDENCE_QUESTION, countsAsEvidence, studioContent } from './studioContent';
import { CASE_LABELS, itemsValid, rowsMax, studioById } from './studios';
import type { StudioItem } from './studios';

const AID: StudioItem[] = [['Before', 'Objectives and scope confirmed '], ['Before', 'Stakeholder map ready'], ['During', 'Agree who signs off'], ['After', 'Minutes out within 24 hours']];
const CASE: StudioItem[] = [['Brief', 'Two companies merged on 1 October.'], ['Deliverable', 'A day-100 roadmap'], ['Deliverable', 'Three decisions for the CFO'], ['Criterion', 'Realistic sequencing']];

describe('studioContent', () => {
  it('makes a job aid of one "label · text" line per row, as private.aid_content does', () => {
    const c = studioContent('Job aid', AID, {});
    expect(c).toEqual({ kind: 'aid', items: ['Before · Objectives and scope confirmed', 'Before · Stakeholder map ready', 'During · Agree who signs off', 'After · Minutes out within 24 hours'] });
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('makes a case of the brief, deliverables and criteria, reviewed by the counsellor, as private.case_content does', () => {
    const c = studioContent('Case exercise', CASE, { [EVIDENCE_QUESTION]: 'Yes', 'Who reviews it?': 'A peer' });
    expect(c).toEqual({ kind: 'case', brief: 'Two companies merged on 1 October.', deliv: ['A day-100 roadmap', 'Three decisions for the CFO'], rubric: ['Realistic sequencing'],
      reviewer: 'Reviewed by your counsellor.', evidence: true });
    expect(parseFormatContent(c)).toEqual(c);
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
    ['aid', 'case'].forEach((id) => { const d = studioById(id)!; expect(parseFormatContent(studioContent(d.format, d.items, {}))).not.toBeNull(); });
  });
  it('has no content for a format without a built studio', () => {
    expect(studioContent('Reel', [['Hook', 'x', 'y']], {})).toBeNull();
  });
  it('asks the evidence question the Case Studio asks', () => {
    expect(studioById('case')!.qs.map((q) => q[0])).toContain(EVIDENCE_QUESTION);
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
  it('private.studio_rows_ok caps labels at SHORT_MAX and texts at LONG_MAX', () => {
    const b = body('private.studio_rows_ok');
    expect(b).toContain("char_length(e ->> 0) > " + SHORT_MAX);
    expect(b).toContain("char_length(e ->> 1) > " + LONG_MAX);
    expect(b).toContain("char_length(coalesce(e ->> 2, '')) > " + LONG_MAX);
  });
  it('private.items_ok checks the rows of exactly the available studios that make rows, and the case labels', () => {
    const b = body('private.items_ok');
    const rows = /when p_type in \(([^)]*)\) then private\.studio_rows_ok/.exec(b);
    expect(quoted(rows![1])).toEqual(STUDIOS.filter((d) => d.available && !d.compact).map((d) => d.format));
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
  it('private.contribution_content publishes every format whose studio is available', () => {
    const b = body('private.contribution_content');
    STUDIOS.filter((d) => d.available).forEach((d) => [d.format, ...(d.alsoFormats ?? [])].forEach((f) => expect(b).toContain("when '" + f + "' then")));
  });
});
