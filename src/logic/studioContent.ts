// What a studio's rows publish as (studios plan, Tasks 2.1 and 2.2): the learning content the library reads
// (parseFormatContent). The database builds the same when it publishes (private.aid_content, private.case_content,
// private.explainer_content); the studio's preview uses this so the creator tries exactly what learners will get. Pure.
import type { FormatContent } from '../types';
import { questionsOf, stepsOf } from './studios';
import type { StudioEntry, StudioItem } from './studios';

// The Case Studio's question whose Yes makes a case count as trajectory evidence (stored as `evidence` on the content).
export const EVIDENCE_QUESTION = 'Can it count as trajectory evidence?';
// A learner hands a case in through the evidence flow, which goes to their counsellor.
export const CASE_REVIEWER = 'Reviewed by your counsellor.';
// A published case's study hours from its length answer (private.case_hours); half a day when unanswered.
export const LENGTH_QUESTION = 'How long should it take?';
export const CASE_HOURS: Record<string, number> = { '2 hours': 2, 'Half a day': 4, 'A full day': 8 };
export const caseHours = (shape: Record<string, string>) => CASE_HOURS[shape[LENGTH_QUESTION]] ?? CASE_HOURS['Half a day'];

// The Explainer Studio's answers that are published (private.explainer_content): its depth, shown with it, and how it
// ends. Unanswered or unknown answers read as an overview with a summary card. Its one style is the step-through.
export const DEPTH_QUESTION = 'Depth?';
export const DEPTHS = ['Overview', 'With technical detail'];
export const END_QUESTION = 'End with?';
export const END_CHECK = 'A three-question check', END_SUMMARY = 'A summary card', END_NONE = 'Nothing';
export const ENDINGS = [END_CHECK, END_SUMMARY, END_NONE];
const STEP_THROUGH = 'Step-through';
const answer = (shape: Record<string, string>, q: string, options: string[], none: string) => (options.includes(shape[q]) ? shape[q] : none);
export const explainerEnd = (shape: Record<string, string>) => answer(shape, END_QUESTION, ENDINGS, END_SUMMARY);
// The ending and the check agree (private.contribution_problems says the same).
export const NEEDS_CHECK = 'Ending with a three-question check needs its questions: draft them with AI, or choose another ending in Shape it';
export const UNUSED_CHECK = 'The check is only shown when the explainer ends with it: remove it, or choose “A three-question check” in Shape it';
export function explainerProblems(items: StudioEntry[], shape: Record<string, string>): string[] {
  const has = questionsOf(items).length > 0, wants = explainerEnd(shape) === END_CHECK;
  return wants && !has ? [NEEDS_CHECK] : !wants && has ? [UNUSED_CHECK] : [];
}

const texts = (items: StudioItem[], label: string) => items.filter((i) => i[0] === label).map((i) => i[1].trim());
const BUILDERS: Record<string, (items: StudioEntry[], shape: Record<string, string>) => FormatContent> = {
  'Job aid': (items) => ({ kind: 'aid', items: stepsOf(items).map((i) => i[0].trim() + ' · ' + i[1].trim()) }),
  'Case exercise': (entries, shape) => { const items = stepsOf(entries);
    return { kind: 'case', brief: texts(items, 'Brief').join(' '), deliv: texts(items, 'Deliverable'), rubric: texts(items, 'Criterion'), reviewer: CASE_REVIEWER, evidence: shape[EVIDENCE_QUESTION] === 'Yes' }; },
  'Interactive explainer': (items, shape) => {
    const end = explainerEnd(shape), check = questionsOf(items);
    return { kind: 'explainer', style: STEP_THROUGH, depth: answer(shape, DEPTH_QUESTION, DEPTHS, DEPTHS[0]), end,
      steps: stepsOf(items).map((i) => ({ label: i[0].trim(), text: i[1].trim() })), ...(end === END_CHECK && check.length ? { check } : {}) };
  },
};

// The content of a format's rows and "Shape it" answers; null for a format no built studio publishes rows for.
export function studioContent(format: string, items: StudioEntry[], shape: Record<string, string>): FormatContent | null {
  const build = BUILDERS[format];
  return build ? build(items, shape) : null;
}

// Whether a learning's content is a case its creator said can count as trajectory evidence.
export const countsAsEvidence = (c: FormatContent | null | undefined) => c?.kind === 'case' && c.evidence === true;
