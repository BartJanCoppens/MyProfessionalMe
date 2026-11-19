// What editing a course's lessons does to its blocks (E-learning Studio, Task 1.2; 1.3 adds the block edits). A block names its lesson by index from 0,
// so removing or moving a lesson row has to move its blocks too. Pure.
import { isCourseBlock } from './courseContent';
import type { CourseBlock } from './courseContent';
import type { StudioEntry } from './studios';

// A block id: "b" and ten lower-case letters or digits (BLOCK_ID).
export const blockId = (): string => 'b' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);

const rowsOf = (items: StudioEntry[]) => items.filter(Array.isArray) as StudioEntry[];
const blocksOf = (items: StudioEntry[]) => items.filter(isCourseBlock) as CourseBlock[];
// Anything that is neither a row nor a block (a course holds nothing else, but a stray entry is kept at the end).
const restOf = (items: StudioEntry[]) => items.filter((x) => !Array.isArray(x) && !isCourseBlock(x));

// Lesson k removed, with its blocks; the later lessons' blocks move up one.
export const dropLesson = (items: StudioEntry[], k: number): StudioEntry[] => [
  ...rowsOf(items).filter((_, i) => i !== k),
  ...blocksOf(items).filter((b) => b.lesson !== k).map((b) => (b.lesson > k ? { ...b, lesson: b.lesson - 1 } : b)),
  ...restOf(items),
];

// Lesson k swapped with its neighbour (by -1 or +1), blocks following; a move off either end changes nothing.
export function moveLesson(items: StudioEntry[], k: number, by: -1 | 1): StudioEntry[] {
  const rows = rowsOf(items), j = k + by;
  if (j < 0 || j >= rows.length) return items;
  [rows[k], rows[j]] = [rows[j], rows[k]];
  const to = (i: number) => (i === k ? j : i === j ? k : i);
  return [...rows, ...blocksOf(items).map((b) => ({ ...b, lesson: to(b.lesson) })), ...restOf(items)];
}

// Every lesson without blocks gets one text block of its own title and summary (the creator's words, no placeholder question).
export function seedLessons(items: StudioEntry[]): StudioEntry[] {
  const blocks = blocksOf(items);
  const seeds = rowsOf(items).flatMap((r, k): CourseBlock[] => (blocks.some((b) => b.lesson === k) ? [] : [{ block: 'text', id: blockId(), lesson: k, h: (r as string[])[1].trim(), t: ((r as string[])[2] ?? '').trim() }]));
  return seeds.length ? [...items, ...seeds] : items;
}
