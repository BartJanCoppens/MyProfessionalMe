// What editing a course's lessons does to its blocks (E-learning Studio, Task 1.2; 1.3 adds the block edits). A block names its lesson by index from 0,
// so removing or moving a lesson row has to move its blocks too. Pure.
import { COURSE_CAPS, isCourseBlock } from './courseContent';
import type { BlockKind, CourseBlock } from './courseContent';
import type { StudioEntry } from './studios';

// A block id: "b" and ten lower-case letters or digits (BLOCK_ID).
export const blockId = (): string => 'b' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);

const rowsOf = (items: StudioEntry[]) => items.filter(Array.isArray) as StudioEntry[];
const blocksOf = (items: StudioEntry[]) => items.filter(isCourseBlock) as CourseBlock[];
// Anything that is neither a row nor a block (a course holds nothing else, but a stray entry is kept at the end).
const restOf = (items: StudioEntry[]) => items.filter((x) => !Array.isArray(x) && !isCourseBlock(x));

// A lesson label that is still the default "Lesson n" follows the lesson's place; a label the creator wrote is left alone.
const renumber = (rows: StudioEntry[]): StudioEntry[] => rows.map((r, i) => (/^Lesson \d+$/.test((r as string[])[0]) ? ['Lesson ' + (i + 1), ...(r as string[]).slice(1)] as StudioEntry : r));

// Lesson k removed, with its blocks; the later lessons' blocks move up one.
export const dropLesson = (items: StudioEntry[], k: number): StudioEntry[] => [
  ...renumber(rowsOf(items).filter((_, i) => i !== k)),
  ...blocksOf(items).filter((b) => b.lesson !== k).map((b) => (b.lesson > k ? { ...b, lesson: b.lesson - 1 } : b)),
  ...restOf(items),
];

// Lesson k swapped with its neighbour (by -1 or +1), blocks following; a move off either end changes nothing.
export function moveLesson(items: StudioEntry[], k: number, by: -1 | 1): StudioEntry[] {
  const rows = [...rowsOf(items)], j = k + by;
  if (j < 0 || j >= rows.length) return items;
  [rows[k], rows[j]] = [rows[j], rows[k]];
  const to = (i: number) => (i === k ? j : i === j ? k : i);
  return [...renumber(rows), ...blocksOf(items).map((b) => ({ ...b, lesson: to(b.lesson) })), ...restOf(items)];
}

// Every lesson without blocks gets one text block of its own title and summary (the creator's words, no placeholder question).
export function seedLessons(items: StudioEntry[]): StudioEntry[] {
  const blocks = blocksOf(items);
  const seeds = rowsOf(items).flatMap((r, k): CourseBlock[] => (blocks.some((b) => b.lesson === k) ? [] : [{ block: 'text', id: blockId(), lesson: k, h: (r as string[])[1].trim().slice(0, COURSE_CAPS.heading), t: ((r as string[])[2] ?? '').trim() }]));
  return seeds.length ? [...items, ...seeds] : items;
}

// A new draft of the lesson rows with the blocks the course already has: they stay attached, by index, to the lessons that still exist
// (the blocks of a lesson the new draft no longer has go; `droppedBlocks` counts them so the screen can say so).
export const keepBlocks = (old: StudioEntry[], drafted: StudioEntry[]): StudioEntry[] => [...drafted, ...blocksOf(old).filter((b) => b.lesson < rowsOf(drafted).length)];
export const droppedBlocks = (old: StudioEntry[], drafted: StudioEntry[]): number => blocksOf(old).filter((b) => b.lesson >= rowsOf(drafted).length).length;

// ---- The editor's edits (Task 1.3). A block's place is its place among the blocks; the blocks of one lesson keep their order.
const blockAt = (items: StudioEntry[], id: string) => items.findIndex((x) => isCourseBlock(x) && x.id === id);

// A block as the creator starts it: every field empty, so the check names what is missing (a check's topic is its lesson's title).
export function newBlock(kind: BlockKind, lesson: number, title = ''): CourseBlock {
  const base = { id: blockId(), lesson };
  switch (kind) {
    case 'text': return { ...base, block: 'text', h: '', t: '' };
    case 'callout': return { ...base, block: 'callout', t: '' };
    case 'accordion': return { ...base, block: 'accordion', panels: [['', ''], ['', '']] };
    case 'check': return { ...base, block: 'check', question: { t: title, q: '', o: ['', '', '', ''], a: 0, why: '' }, fin: false };
    case 'sort': return { ...base, block: 'sort', p: '', bins: ['', ''], cards: [['', 0], ['', 1]] };
    case 'branch': return { ...base, block: 'branch', q: '', choices: [['', '', true], ['', '', false]] };
    case 'reflect': return { ...base, block: 'reflect', p: '' };
    case 'exercise': return { ...base, block: 'exercise', q: '', a: 0, tol: 0, unit: '' };
  }
}

// What a block still needs, first thing first, in the creator's words (null when its fields are all filled). The check of the course says it again at submit.
export function missingOf(b: CourseBlock): string | null {
  const empty = (v: string) => !v.trim(), none = (vs: string[]) => vs.some(empty);
  switch (b.block) {
    case 'text': return empty(b.t) ? 'Write the text' : null;
    case 'callout': return empty(b.t) ? 'Write the callout' : null;
    case 'accordion': return none(b.panels.flat()) ? 'Give every panel a title and a text' : null;
    case 'check': return empty(b.question.q) ? 'Write the question' : none(b.question.o) ? 'Write all four options' : empty(b.question.why) ? 'Say why the answer is right' : null;
    case 'sort': return empty(b.p) ? 'Write the prompt' : none(b.bins) ? 'Name both groups' : none(b.cards.map((c) => c[0])) ? 'Give every item a label' : null;
    case 'branch': return empty(b.q) ? 'Write the question' : none(b.choices.flatMap((c) => [c[0], c[1]])) ? 'Give every choice a label and a reply' : b.choices.some((c) => c[2]) ? null : 'Mark at least one good choice';
    case 'reflect': return empty(b.p) ? 'Write the prompt for the learner' : null;
    case 'exercise': return empty(b.q) ? 'Write the question' : null;
  }
}

// `block` goes after block `after` of the lesson, else at the end of the lesson.
export function insertBlock(items: StudioEntry[], lesson: number, after: string | null, block: CourseBlock): StudioEntry[] {
  const last = items.reduce((at, x, i) => (isCourseBlock(x) && x.lesson === lesson ? i : at), -1);
  const i = after ? blockAt(items, after) : -1, from = i >= 0 ? i : last;
  const at = from >= 0 ? from + 1 : items.length;
  return [...items.slice(0, at), block, ...items.slice(at)];
}

// A block swapped with its neighbour in the same lesson; at either end of the lesson nothing changes.
export function moveBlock(items: StudioEntry[], id: string, by: -1 | 1): StudioEntry[] {
  const i = blockAt(items, id), lesson = (items[i] as CourseBlock | undefined)?.lesson;
  let j = i + by;
  while (j >= 0 && j < items.length && !(isCourseBlock(items[j]) && (items[j] as CourseBlock).lesson === lesson)) j += by;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const out = [...items];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// A copy right after its original, with an id of its own (the copy of a final check is not final: a course keeps one).
export function duplicateBlock(items: StudioEntry[], id: string): StudioEntry[] {
  const i = blockAt(items, id);
  if (i < 0) return items;
  const copy = structuredClone(items[i]) as CourseBlock;
  copy.id = blockId();
  if (copy.block === 'check') copy.fin = false;
  return [...items.slice(0, i + 1), copy, ...items.slice(i + 1)];
}

export const removeBlock = (items: StudioEntry[], id: string): StudioEntry[] => items.filter((x) => !(isCourseBlock(x) && x.id === id));
export const patchBlock = (items: StudioEntry[], id: string, patch: Partial<CourseBlock>): StudioEntry[] =>
  items.map((x) => (isCourseBlock(x) && x.id === id ? ({ ...x, ...patch } as CourseBlock) : x));

// One final check in a course: marking a check final unmarks the others.
export const setFinal = (items: StudioEntry[], id: string, fin: boolean): StudioEntry[] =>
  items.map((x) => (isCourseBlock(x) && x.block === 'check' ? { ...x, fin: x.id === id ? fin : fin ? false : x.fin } : x));

// Lessons: a new one at the end (up to the cap), a new title (blocks stay), and removing one (never below two lessons).
export const addLesson = (items: StudioEntry[]): StudioEntry[] => {
  const n = rowsOf(items).length;
  return n >= COURSE_CAPS.lessons[1] ? items : [...rowsOf(items), ['Lesson ' + (n + 1), 'New lesson', ''] as StudioEntry, ...items.filter((x) => !Array.isArray(x))];
};
export const renameLesson = (items: StudioEntry[], k: number, title: string): StudioEntry[] => {
  let n = -1;
  return items.map((x) => (Array.isArray(x) && ++n === k ? ([x[0], title, ...x.slice(2)] as StudioEntry) : x));
};
export const removeLesson = (items: StudioEntry[], k: number): StudioEntry[] => (rowsOf(items).length <= COURSE_CAPS.lessons[0] ? items : dropLesson(items, k));
