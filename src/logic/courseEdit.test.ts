import { describe, expect, it } from 'vitest';
import { BLOCK_ID, lessonsOf } from './courseContent';
import type { CourseBlock } from './courseContent';
import { blockId, dropLesson, moveLesson, seedLessons } from './courseEdit';
import type { StudioEntry } from './studios';

const Q = { t: 'Place', q: 'Where?', o: ['a', 'b', 'c', 'd'], a: 1, why: 'Because.' };
const text = (id: string, lesson: number): CourseBlock => ({ block: 'text', id, lesson, h: 'H ' + id, t: 'Words ' + id });
const rows = (): StudioEntry[] => [['Lesson 1', 'One', 'First'], ['Lesson 2', 'Two', 'Second'], ['Lesson 3', 'Three', 'Third']];
const course = (): StudioEntry[] => [...rows(), text('b0001', 0), text('b0002', 0), text('b0003', 0), { block: 'check', id: 'b0004', lesson: 0, question: Q, fin: false },
  text('b0005', 1), text('b0006', 2)];
const ids = (items: StudioEntry[], lesson: number) => lessonsOf(items)[lesson].blocks.map((b) => b.id);

describe('dropLesson', () => {
  it('removes lesson 1 of 3 with its 4 blocks and moves the later blocks up one lesson', () => {
    const out = dropLesson(course(), 0);
    expect(out.filter(Array.isArray)).toHaveLength(2);
    expect(out.filter((x) => !Array.isArray(x))).toHaveLength(2);
    expect(lessonsOf(out).map((l) => l.title)).toEqual(['Two', 'Three']);
    expect(ids(out, 0)).toEqual(['b0005']);
    expect(ids(out, 1)).toEqual(['b0006']);
    expect((out.find((b) => !Array.isArray(b) && (b as CourseBlock).id === 'b0005') as CourseBlock).lesson).toBe(0);
  });
  it('keeps the earlier lessons\' blocks where they are when a later lesson goes', () => {
    const out = dropLesson(course(), 1);
    expect(lessonsOf(out).map((l) => l.title)).toEqual(['One', 'Three']);
    expect(ids(out, 0)).toEqual(['b0001', 'b0002', 'b0003', 'b0004']);
    expect(ids(out, 1)).toEqual(['b0006']);
  });
});

describe('moveLesson', () => {
  it('moves a lesson down and its blocks follow it', () => {
    const out = moveLesson(course(), 0, 1);
    expect(lessonsOf(out).map((l) => l.title)).toEqual(['Two', 'One', 'Three']);
    expect(ids(out, 0)).toEqual(['b0005']);
    expect(ids(out, 1)).toEqual(['b0001', 'b0002', 'b0003', 'b0004']);
    expect(ids(out, 2)).toEqual(['b0006']);
  });
  it('moves a lesson up, and ignores a move off either end', () => {
    expect(lessonsOf(moveLesson(course(), 2, -1)).map((l) => l.title)).toEqual(['One', 'Three', 'Two']);
    expect(ids(moveLesson(course(), 2, -1), 1)).toEqual(['b0006']);
    expect(moveLesson(course(), 0, -1)).toEqual(course());
    expect(moveLesson(course(), 2, 1)).toEqual(course());
  });
});

describe('seedLessons', () => {
  it('gives a lesson without blocks one text block of its title and summary, and leaves the others', () => {
    const out = seedLessons([...rows(), text('b0001', 0)]);
    expect(ids(out, 0)).toEqual(['b0001']);
    const seeded = lessonsOf(out)[1].blocks;
    expect(seeded).toHaveLength(1);
    expect(seeded[0]).toMatchObject({ block: 'text', lesson: 1, h: 'Two', t: 'Second' });
    expect(seeded[0].id).toMatch(BLOCK_ID);
    expect(lessonsOf(out)[2].blocks[0]).toMatchObject({ h: 'Three', t: 'Third' });
  });
  it('returns the same items when every lesson has blocks', () => {
    const full = [...rows(), text('b0001', 0), text('b0002', 1), text('b0003', 2)];
    expect(seedLessons(full)).toEqual(full);
  });
});

describe('blockId', () => {
  it('matches BLOCK_ID and differs between calls', () => {
    const made = Array.from({ length: 50 }, blockId);
    made.forEach((id) => expect(id).toMatch(BLOCK_ID));
    expect(new Set(made).size).toBe(50);
  });
});
