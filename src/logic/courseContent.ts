// The E-learning format (E-learning Studio plan, Task 1.1): a course as studio items. The items are 2 to 12 lesson rows [label, title, summary] and, after
// them, one block object per block, each naming its lesson by index from 0 ({block, id, lesson, ...}). What the rows publish as is private.course_content,
// which courseContent repeats for the preview; the checks are private.course_row_problems' and the E-learning part of private.contribution_problems'
// (courseContent.sync.test.ts pins the caps and every sentence). A knowledge check is an exam question (isQuestion, private.question_ok).
import type { CourseContent, ExamQuestion } from '../types';
import { ITEM_MAX, fieldOk, isQuestion, readQuestions } from './items';
import { stepsOf } from './studioRows';

export const BLOCK_KINDS = ['text', 'callout', 'accordion', 'check', 'sort', 'branch', 'reflect', 'exercise'] as const;
export type BlockKind = typeof BLOCK_KINDS[number];
// The blocks that score a learner (a reflection does not): the final check and the score line count these.
export const SCORED_KINDS: readonly BlockKind[] = ['check', 'sort', 'branch', 'exercise'];
export const BLOCK_ID = /^b[0-9a-z]{4,20}$/;
export const COURSE_CAPS = { lessons: [2, 12], blocksPerLesson: 20, heading: 120, text: 4000, callout: 600, panels: [2, 8], panelTitle: 120, panelBody: 1200,
  cards: [2, 10], bin: 40, card: 160, choices: [2, 4], choice: 200, outcome: 400, prompt: 400, unit: 12, bytes: 250000 } as const;
const C = COURSE_CAPS;

type Base<K extends BlockKind> = { block: K; id: string; lesson: number };
export type TextBlock = Base<'text'> & { h: string; t: string };
export type CalloutBlock = Base<'callout'> & { t: string };
export type AccordionBlock = Base<'accordion'> & { panels: [title: string, body: string][] };
export type CheckBlock = Base<'check'> & { question: ExamQuestion; fin: boolean };
export type SortBlock = Base<'sort'> & { p: string; bins: [string, string]; cards: [label: string, bin: 0 | 1][] };
export type BranchBlock = Base<'branch'> & { q: string; choices: [label: string, outcome: string, good: boolean][] };
export type ReflectBlock = Base<'reflect'> & { p: string };
export type ExerciseBlock = Base<'exercise'> & { q: string; a: number; tol: number; unit: string };
export type CourseBlock = TextBlock | CalloutBlock | AccordionBlock | CheckBlock | SortBlock | BranchBlock | ReflectBlock | ExerciseBlock;
type WithoutLesson<T> = T extends unknown ? Omit<T, 'lesson'> : never;
export type PublicBlock = WithoutLesson<CourseBlock>;

export const isCourseBlock = (x: unknown): x is CourseBlock => !!x && typeof x === 'object' && !Array.isArray(x) && typeof (x as { block?: unknown }).block === 'string';

// What a creator chooses in Shape it: how the course completes (the pass mark is fixed) and how long it takes (its hours).
export const COMPLETION_QUESTION = 'How is completion decided?';
export const COURSE_RULES = { 'All lessons viewed': 'seen', 'Final check of 80 % or more': 'score', Both: 'both' } as const;
export type CourseRule = 'seen' | 'score' | 'both';
export const PASS_MARK = 80;
export const courseRule = (shape: Record<string, string>): CourseRule => COURSE_RULES[shape[COMPLETION_QUESTION] as keyof typeof COURSE_RULES] ?? 'seen';
export const COURSE_LENGTH = 'Length?';
export const COURSE_HOURS: Record<string, number> = { '15 min': 0.25, '30 min': 0.5, '60 min': 1 };
export const courseHours = (shape: Record<string, string>) => COURSE_HOURS[shape[COURSE_LENGTH]] ?? COURSE_HOURS['30 min'];

// The words, as private.course_row_problems and private.contribution_problems say them.
export const WORDS = {
  unknownKind: 'A block has a kind that is not known', badId: 'A block has an id that is missing or not allowed', sameId: 'Two blocks have the same id',
  noLesson: 'A block points to a lesson that does not exist', lessonsFirst: 'Put every lesson before the blocks', tooManyLessons: 'Keep at most ' + C.lessons[1] + ' lessons',
  tooBig: 'The course is too large: shorten some text', sortGroup: 'give every item a group', branchGood: 'mark at least one good choice',
  noFinalCheck: 'Add a final check (a knowledge check marked “Final check”), or choose “All lessons viewed” in Shape it', twoFinalChecks: 'Keep one final check',
};
export const KIND_NAME: Record<BlockKind, string> = { text: 'Text', callout: 'Callout', accordion: 'Accordion', check: 'Knowledge check', sort: 'Drag and sort',
  branch: 'Branching scenario', reflect: 'Reflection', exercise: 'Calculation exercise' };
export const SHAPE_RULE: Record<BlockKind, string> = {
  text: 'keep the heading to 120 characters and write the text, up to 4000', callout: 'write the callout, up to 600 characters',
  accordion: 'give 2 to 8 panels, each with a title and a text', check: 'give four options, the right answer and why',
  sort: 'give a prompt, two group names and 2 to 10 items', branch: 'give a question and 2 to 4 choices, each with its reply and whether it is good',
  reflect: 'write the prompt for the learner, up to 400 characters', exercise: 'give a question, the right number, the tolerance (0 or more) and a unit of up to 12 characters',
};

type Raw = Record<string, any>;
const within = (v: unknown, [min, max]: readonly [number, number]): v is unknown[] => Array.isArray(v) && v.length >= min && v.length <= max;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sortShape = (b: Raw) => fieldOk(C.prompt)(b.p) && within(b.bins, [2, 2]) && b.bins.every(fieldOk(C.bin)) && within(b.cards, C.cards)
  && b.cards.every((c: unknown) => Array.isArray(c) && fieldOk(C.card)(c[0]));
const branchShape = (b: Raw) => fieldOk(C.prompt)(b.q) && within(b.choices, C.choices) && b.choices.every((c: unknown) => Array.isArray(c) && c.length === 3
  && fieldOk(C.choice)(c[0]) && fieldOk(C.outcome)(c[1]) && typeof c[2] === 'boolean');
const SHAPE_OK: Record<BlockKind, (b: Raw) => boolean> = {
  text: (b) => typeof b.h === 'string' && b.h.length <= C.heading && fieldOk(C.text)(b.t),
  callout: (b) => fieldOk(C.callout)(b.t),
  accordion: (b) => within(b.panels, C.panels) && b.panels.every((p: unknown) => Array.isArray(p) && p.length === 2 && fieldOk(C.panelTitle)(p[0]) && fieldOk(C.panelBody)(p[1])),
  check: (b) => isQuestion(b.question) && typeof b.fin === 'boolean',
  sort: sortShape, branch: branchShape,
  reflect: (b) => fieldOk(C.prompt)(b.p),
  exercise: (b) => fieldOk(C.prompt)(b.q) && num(b.a) && num(b.tol) && b.tol >= 0 && typeof b.unit === 'string' && b.unit.length <= C.unit,
};
// What is wrong with a block's own fields, or null: a sort wants every card in group 0 or 1, a branch at least one good choice.
function shapeProblem(b: Raw): string | null {
  const kind = b.block as BlockKind;
  if (!SHAPE_OK[kind](b)) return SHAPE_RULE[kind];
  if (kind === 'sort' && !b.cards.every((c: unknown[]) => c.length === 2 && (c[1] === 0 || c[1] === 1))) return WORDS.sortGroup;
  return kind === 'branch' && !b.choices.some((c: unknown[]) => c[2] === true) ? WORDS.branchGood : null;
}
// The first problem with one block of a course of `lessons` lessons, in words, or null.
export function blockProblem(block: unknown, lessons: number): string | null {
  const b = block as Raw;
  if (!isCourseBlock(b) || !(BLOCK_KINDS as readonly string[]).includes(b.block)) return WORDS.unknownKind;
  if (typeof b.id !== 'string' || !BLOCK_ID.test(b.id)) return WORDS.badId;
  if (!Number.isInteger(b.lesson) || b.lesson < 0 || b.lesson >= lessons) return WORDS.noLesson;
  const rule = shapeProblem(b);
  return rule ? 'Lesson ' + (b.lesson + 1) + ' · ' + KIND_NAME[b.block] + ': ' + rule : null;
}

// The lessons of a course's items with their blocks (a block pointing nowhere belongs to none).
export function lessonsOf(items: readonly unknown[]): { title: string; summary: string; blocks: CourseBlock[] }[] {
  const blocks = items.filter(isCourseBlock);
  return stepsOf(items).map((r, k) => ({ title: r[1], summary: r[2] ?? '', blocks: blocks.filter((b) => b.lesson === k) }));
}

// The items as the database counts them: jsonb::text puts a space after every ":" and "," outside strings, which JSON.stringify leaves out, so a course
// that passes here never fails the cap at submit (private.course_ok measures octet_length(p_items::text)).
export const jsonbText = (v: unknown): string => (Array.isArray(v) ? '[' + v.map(jsonbText).join(', ') + ']'
  : v && typeof v === 'object' ? '{' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => JSON.stringify(k) + ': ' + jsonbText(x)).join(', ') + '}' : JSON.stringify(v));

// The problems with a course's blocks and structure, in words (the E-learning item schema): the same reading as private.course_row_problems, in the same order.
// The lessons' own rows (a blank title, a long summary) are the generic row rules of itemsValid; how many lessons there are is the studio's minimum.
export function courseRowProblems(items: readonly unknown[]): string[] {
  const lessons = stepsOf(items).length, blocks = items.filter((i) => !Array.isArray(i)), out: string[] = [];
  const first = items.findIndex((i) => !Array.isArray(i));
  if (lessons > C.lessons[1]) out.push(WORDS.tooManyLessons);
  if (first >= 0 && items.slice(first).some(Array.isArray)) out.push(WORDS.lessonsFirst);
  blocks.forEach((b) => { const p = blockProblem(b, lessons); if (p) out.push(p); });
  const ids = blocks.map((b) => (b as Raw)?.id).filter((id) => typeof id === 'string' && BLOCK_ID.test(id));
  if (new Set(ids).size < ids.length) out.push(WORDS.sameId);
  for (let k = 0; k < lessons; k++) {
    if (blocks.filter((b) => (b as Raw)?.lesson === k).length > C.blocksPerLesson) out.push('Lesson ' + (k + 1) + ' has more than ' + C.blocksPerLesson + ' blocks');
  }
  if (new TextEncoder().encode(jsonbText(items)).length > C.bytes) out.push(WORDS.tooBig);
  return [...new Set(out)];
}

// What still blocks sending a course (the E-learning part of private.contribution_problems): a lesson without blocks, the final check the completion rule needs, only one.
export function courseProblems(items: readonly unknown[], shape: Record<string, string>): string[] {
  const out = lessonsOf(items).flatMap((l, k) => (l.blocks.length ? [] : ['Lesson ' + (k + 1) + ' “' + l.title.trim() + '” has no blocks yet']));
  const finals = items.filter((b) => isCourseBlock(b) && b.block === 'check' && b.fin).length;
  if (finals === 0 && courseRule(shape) !== 'seen') out.push(WORDS.noFinalCheck);
  if (finals > 1) out.push(WORDS.twoFinalChecks);
  return out;
}

// A block as learners get it: its known fields, trimmed, without the lesson index.
export function publicBlock(b: CourseBlock): PublicBlock {
  const t = (s: string) => s.trim();
  switch (b.block) {
    case 'text': return { block: 'text', id: b.id, h: t(b.h), t: t(b.t) };
    case 'callout': return { block: 'callout', id: b.id, t: t(b.t) };
    case 'accordion': return { block: 'accordion', id: b.id, panels: b.panels.map(([a, c]) => [t(a), t(c)]) };
    case 'check': return { block: 'check', id: b.id, question: readQuestions([b.question])![0], fin: b.fin };
    case 'sort': return { block: 'sort', id: b.id, p: t(b.p), bins: [t(b.bins[0]), t(b.bins[1])], cards: b.cards.map(([l, g]) => [t(l), g]) };
    case 'branch': return { block: 'branch', id: b.id, q: t(b.q), choices: b.choices.map(([l, o, g]) => [t(l), t(o), g]) };
    case 'reflect': return { block: 'reflect', id: b.id, p: t(b.p) };
    case 'exercise': return { block: 'exercise', id: b.id, q: t(b.q), a: b.a, tol: b.tol, unit: b.unit.trim() };
  }
}

// The published content (private.course_content); null while the rows have problems or there are not 2 to 12 lessons. Summaries are not published.
export function courseContent(items: readonly unknown[], shape: Record<string, string>): CourseContent | null {
  const lessons = lessonsOf(items);
  if (courseRowProblems(items).length || lessons.length < C.lessons[0] || lessons.length > C.lessons[1] || ITEM_MAX['E-learning'] < items.length) return null;
  return { kind: 'course', lessons: lessons.map((l) => ({ title: l.title.trim(), blocks: l.blocks.map(publicBlock) })), rule: courseRule(shape) };
}

// Every text of a block, for the client-name check (the database scans the items as text).
const stringsOf = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(stringsOf) : v && typeof v === 'object' ? Object.values(v).flatMap(stringsOf) : []);
export const blockTexts = (b: CourseBlock): string[] => stringsOf({ ...b, block: undefined, id: undefined });
// One line for a reviewer: where the block is and what it says first.
export const courseBlockRow = (b: CourseBlock): { front: string; back: string } =>
  ({ front: 'Lesson ' + (b.lesson + 1) + ' · ' + KIND_NAME[b.block], back: (blockTexts(b)[0] ?? '').slice(0, 120) });
