// What a studio's rows publish as (studios plan, Task 2.1): the learning content the library reads (parseFormatContent).
// The database builds the same when it publishes (private.aid_content, private.case_content); the studio's preview uses
// this so the creator tries exactly what learners will get. Pure.
import type { FormatContent } from '../types';
import type { StudioItem } from './studios';

// The Case Studio's question whose Yes makes a case count as trajectory evidence (stored as `evidence` on the content).
export const EVIDENCE_QUESTION = 'Can it count as trajectory evidence?';
// A learner hands a case in through the evidence flow, which goes to their counsellor.
export const CASE_REVIEWER = 'Reviewed by your counsellor.';
// A published case's study hours from its length answer (private.case_hours); half a day when unanswered.
export const LENGTH_QUESTION = 'How long should it take?';
export const CASE_HOURS: Record<string, number> = { '2 hours': 2, 'Half a day': 4, 'A full day': 8 };
export const caseHours = (shape: Record<string, string>) => CASE_HOURS[shape[LENGTH_QUESTION]] ?? CASE_HOURS['Half a day'];

const texts = (items: StudioItem[], label: string) => items.filter((i) => i[0] === label).map((i) => i[1].trim());
const BUILDERS: Record<string, (items: StudioItem[], shape: Record<string, string>) => FormatContent> = {
  'Job aid': (items) => ({ kind: 'aid', items: items.map((i) => i[0].trim() + ' · ' + i[1].trim()) }),
  'Case exercise': (items, shape) => ({ kind: 'case', brief: texts(items, 'Brief').join(' '), deliv: texts(items, 'Deliverable'), rubric: texts(items, 'Criterion'),
    reviewer: CASE_REVIEWER, evidence: shape[EVIDENCE_QUESTION] === 'Yes' }),
};

// The content of a format's rows and "Shape it" answers; null for a format no built studio publishes rows for.
export function studioContent(format: string, items: StudioItem[], shape: Record<string, string>): FormatContent | null {
  const build = BUILDERS[format];
  return build ? build(items, shape) : null;
}

// Whether a learning's content is a case its creator said can count as trajectory evidence.
export const countsAsEvidence = (c: FormatContent | null | undefined) => c?.kind === 'case' && c.evidence === true;
