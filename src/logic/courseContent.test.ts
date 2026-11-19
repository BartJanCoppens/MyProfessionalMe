import { describe, expect, it } from 'vitest';
import { COURSE_CAPS, COURSE_HOURS, courseContent, courseHours, courseProblems, courseRowProblems, courseRule, isCourseBlock, lessonsOf } from './courseContent';
import type { CourseBlock } from './courseContent';
import type { StudioEntry } from './studios';

const Q = { t: 'Place of supply', q: 'Where is the VAT due?', o: ['Belgium', 'Germany, reverse charge', 'Nowhere', 'Both'], a: 1, why: 'The customer accounts for it.' };
const lesson = (n: number, title: string): StudioEntry => ['Lesson ' + n, title, 'Summary of ' + title];
// The design's example course (EL_SEED), with four-option checks: three lessons.
const blocks = (): CourseBlock[] => [
  { block: 'text', id: 'b0001', lesson: 0, h: 'Where is a service taxed?', t: 'For services between businesses VAT is due where the customer is established.' },
  { block: 'accordion', id: 'b0002', lesson: 0, panels: [['The B2B rule', 'The customer’s country taxes it.'], ['The B2C rule', 'The supplier’s country taxes it.']] },
  { block: 'sort', id: 'b0003', lesson: 0, p: 'Sort each service.', bins: ['General rule', 'Exception'], cards: [['Strategy advice to a German company', 0], ['Tickets for a conference in Paris', 1]] },
  { block: 'check', id: 'b0004', lesson: 0, question: Q, fin: false },
  { block: 'text', id: 'b0005', lesson: 1, h: '', t: 'With the reverse charge the supplier charges no VAT.' },
  { block: 'callout', id: 'b0006', lesson: 1, t: 'The invoice must show it clearly.' },
  { block: 'exercise', id: 'b0007', lesson: 1, q: 'VAT on 12,000 at 21 %?', a: 2520, tol: 1, unit: '€' },
  { block: 'text', id: 'b0008', lesson: 2, h: 'Reporting it', t: 'The return and the listing must match.' },
  { block: 'branch', id: 'b0009', lesson: 2, q: 'A private person asks for no VAT. What do you do?', choices: [['Agree', 'Wrong: B2C applies.', false], ['Charge VAT', 'Right.', true]] },
  { block: 'reflect', id: 'b0010', lesson: 2, p: 'Which of your clients would be reverse-charged?' },
  { block: 'check', id: 'b0011', lesson: 2, question: Q, fin: true },
];
const course = (extra: StudioEntry[] = [], list = blocks()): StudioEntry[] => [lesson(1, 'Where is a service taxed?'), lesson(2, 'Reverse charge'), lesson(3, 'Reporting it'), ...list, ...extra];
const without = (id: string) => blocks().filter((b) => b.id !== id);
const patch = (id: string, change: Record<string, unknown>) => blocks().map((b) => (b.id === id ? ({ ...b, ...change } as CourseBlock) : b));

describe('the design\'s example course', () => {
  it('has no problems and three lessons in its content', () => {
    expect(courseRowProblems(course())).toEqual([]);
    expect(courseProblems(course(), {})).toEqual([]);
    const c = courseContent(course(), {})!;
    expect(c.kind).toBe('course');
    expect(c.lessons.map((l) => l.title)).toEqual(['Where is a service taxed?', 'Reverse charge', 'Reporting it']);
    expect(c.lessons.map((l) => l.blocks.length)).toEqual([4, 3, 4]);
  });
  it('reads its lessons with their summaries and blocks', () => {
    const l = lessonsOf(course());
    expect(l[1]).toMatchObject({ title: 'Reverse charge', summary: 'Summary of Reverse charge' });
    expect(l.map((x) => x.blocks.length)).toEqual([4, 3, 4]);
    expect(isCourseBlock(blocks()[0])).toBe(true);
    expect(isCourseBlock(['Lesson 1', 'x'])).toBe(false);
    expect(isCourseBlock({ svg: '' })).toBe(false);
  });
  it('keeps the caps the database repeats', () => {
    expect(COURSE_CAPS).toMatchObject({ lessons: [2, 12], blocksPerLesson: 20, text: 4000, callout: 600, panelBody: 1200, bytes: 250000 });
  });
});

describe('the rules of every block, in words', () => {
  it('a block that points to a lesson that does not exist', () => {
    expect(courseRowProblems([lesson(1, 'A'), lesson(2, 'B'), ...patch('b0001', { lesson: 3 })])).toContain('A block points to a lesson that does not exist');
    expect(courseRowProblems(course([], patch('b0001', { lesson: -1 })))).toContain('A block points to a lesson that does not exist');
    expect(courseRowProblems(course([], patch('b0001', { lesson: 0.5 })))).toContain('A block points to a lesson that does not exist');
  });
  it('a duplicate id, a missing id and an unknown kind', () => {
    expect(courseRowProblems(course([], patch('b0002', { id: 'b0001' })))).toContain('Two blocks have the same id');
    expect(courseRowProblems(course([], patch('b0002', { id: 'X-1' })))).toContain('A block has an id that is missing or not allowed');
    expect(courseRowProblems(course([{ block: 'script', id: 'b9999', lesson: 0 } as never]))).toContain('A block has a kind that is not known');
  });
  it('more than 20 blocks in one lesson', () => {
    const many: CourseBlock[] = Array.from({ length: 21 }, (_, k) => ({ block: 'callout', id: 'bx' + String(1000 + k), lesson: 0, t: 'Note ' + k }));
    expect(courseRowProblems(course(many))).toContain('Lesson 1 has more than 20 blocks');
    expect(courseRowProblems(course(many.slice(0, 16)))).toEqual([]);
  });
  it('a knowledge check, a sort and a branch say what is missing', () => {
    expect(courseRowProblems(course([], patch('b0004', { question: { ...Q, o: ['a', 'b', 'c'] } })))).toEqual(['Lesson 1 · Knowledge check: give four options, the right answer and why']);
    expect(courseRowProblems(course([], patch('b0003', { cards: [['One', 0], ['Two']] })))).toEqual(['Lesson 1 · Drag and sort: give every item a group']);
    expect(courseRowProblems(course([], patch('b0003', { cards: [['One', 0], ['Two', 2]] })))).toEqual(['Lesson 1 · Drag and sort: give every item a group']);
    expect(courseRowProblems(course([], patch('b0009', { choices: [['Agree', 'Wrong.', false], ['Charge', 'Wrong too.', false]] })))).toEqual(['Lesson 3 · Branching scenario: mark at least one good choice']);
  });
  it('an exercise with a negative tolerance, an empty text and a short accordion', () => {
    expect(courseRowProblems(course([], patch('b0007', { tol: -1 })))).toEqual(['Lesson 2 · Calculation exercise: give a question, the right number, the tolerance (0 or more) and a unit of up to 12 characters']);
    expect(courseRowProblems(course([], patch('b0006', { t: '  ' })))).toEqual(['Lesson 2 · Callout: write the callout, up to 600 characters']);
    expect(courseRowProblems(course([], patch('b0002', { panels: [['One', 'x']] })))).toEqual(['Lesson 1 · Accordion: give 2 to 8 panels, each with a title and a text']);
    expect(courseRowProblems(course([], patch('b0010', { p: '' })))).toEqual(['Lesson 3 · Reflection: write the prompt for the learner, up to 400 characters']);
    expect(courseRowProblems(course([], patch('b0001', { t: 'x'.repeat(4001) })))).toEqual(['Lesson 1 · Text: keep the heading to 120 characters and write the text, up to 4000']);
  });
  it('keeps at most 12 lessons and the lessons before the blocks', () => {
    const lessons = Array.from({ length: 13 }, (_, k) => lesson(k + 1, 'L' + k));
    expect(courseRowProblems(lessons)).toContain('Keep at most 12 lessons');
    expect(courseRowProblems([lesson(1, 'A'), ...blocks().slice(0, 1), lesson(2, 'B')])).toContain('Put every lesson before the blocks');
  });
});

describe('what still blocks sending a course', () => {
  it('names a lesson that has no blocks', () => {
    expect(courseProblems(course([], without('b0005').filter((b) => b.lesson !== 1)), {})).toEqual(['Lesson 2 “Reverse charge” has no blocks yet']);
  });
  it('asks for a final check when the rule is score or both, and for only one', () => {
    const none = course([], patch('b0011', { fin: false }));
    const wanted = 'Add a final check (a knowledge check marked “Final check”), or choose “All lessons viewed” in Shape it';
    expect(courseProblems(none, {})).toEqual([]);
    expect(courseProblems(none, { 'How is completion decided?': 'Final check of 80 % or more' })).toEqual([wanted]);
    expect(courseProblems(none, { 'How is completion decided?': 'Both' })).toEqual([wanted]);
    const two = course([], patch('b0004', { fin: true }));
    expect(courseProblems(two, {})).toEqual(['Keep one final check']);
    expect(courseProblems(two, { 'How is completion decided?': 'Both' })).toEqual(['Keep one final check']);
  });
});

describe('completion, hours and content', () => {
  it('reads the creator\'s choices, with defaults when unanswered', () => {
    expect(courseRule({})).toBe('seen');
    expect(courseRule({ 'How is completion decided?': 'All lessons viewed' })).toBe('seen');
    expect(courseRule({ 'How is completion decided?': 'Final check of 80 % or more' })).toBe('score');
    expect(courseRule({ 'How is completion decided?': 'Both' })).toBe('both');
    expect(courseHours({ 'Length?': '60 min' })).toBe(1);
    expect(courseHours({})).toBe(0.5);
    expect(COURSE_HOURS).toEqual({ '15 min': 0.25, '30 min': 0.5, '60 min': 1 });
  });
  it('publishes the lessons and blocks without the lesson index, the summaries or unknown keys', () => {
    const c = courseContent(course([], patch('b0006', { t: ' Padded. ', extra: 'x' })), { 'How is completion decided?': 'Both' })!;
    expect(c.rule).toBe('both');
    const first = c.lessons[0].blocks[0] as unknown as Record<string, unknown>;
    expect(first).toEqual({ block: 'text', id: 'b0001', h: 'Where is a service taxed?', t: 'For services between businesses VAT is due where the customer is established.' });
    expect(c.lessons[1].blocks[1]).toEqual({ block: 'callout', id: 'b0006', t: 'Padded.' });
    expect(JSON.stringify(c)).not.toContain('Summary of');
    expect(JSON.stringify(c)).not.toContain('"lesson"');
  });
  it('is nothing while the rows have problems', () => {
    expect(courseContent(course([], patch('b0007', { tol: -1 })), {})).toBeNull();
    expect(courseContent([lesson(1, 'A')], {})).toBeNull();
  });
});
