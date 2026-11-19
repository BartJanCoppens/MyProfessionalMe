import { describe, expect, it } from 'vitest';
import { BLOCK_ID, COURSE_CAPS, courseRowProblems, lessonsOf } from './courseContent';
import type { CourseBlock } from './courseContent';
import { addLesson, blockId, dropLesson, duplicateBlock, insertBlock, keepBlocks, missingOf, moveBlock, moveLesson, newBlock, patchBlock, removeBlock, removeLesson, renameLesson, seedLessons, setFinal } from './courseEdit';
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

describe('seedLessons with a long title', () => {
  it('clips the heading to the block cap so the seeded course stays valid', () => {
    const long = 'T'.repeat(500), out = seedLessons([['Lesson 1', long, 'S'], ['Lesson 2', 'Two', 'S']]);
    const h = (lessonsOf(out)[0].blocks[0] as { h: string }).h;
    expect(h).toHaveLength(COURSE_CAPS.heading);
    expect(courseRowProblems(out)).toEqual([]);
  });
});

describe('keepBlocks', () => {
  it('puts the blocks of the old course behind new lesson rows, for the lessons that still exist', () => {
    const out = keepBlocks(course(), [['Lesson 1', 'A', 'a'], ['Lesson 2', 'B', 'b']]);
    expect(lessonsOf(out).map((l) => [l.title, l.blocks.map((b) => b.id)])).toEqual([['A', ['b0001', 'b0002', 'b0003', 'b0004']], ['B', ['b0005']]]);
  });
  it('keeps every block when the new draft has at least as many lessons', () => {
    expect(lessonsOf(keepBlocks(course(), [...rows(), ['Lesson 4', 'D', 'd']])).flatMap((l) => l.blocks).length).toBe(6);
  });
  it('is the new rows alone when there were no blocks', () => {
    expect(keepBlocks(rows(), [['Lesson 1', 'A', 'a']])).toEqual([['Lesson 1', 'A', 'a']]);
  });
});

describe('blockId', () => {
  it('matches BLOCK_ID and differs between calls', () => {
    const made = Array.from({ length: 50 }, blockId);
    made.forEach((id) => expect(id).toMatch(BLOCK_ID));
    expect(new Set(made).size).toBe(50);
  });
});

describe('newBlock', () => {
  it('starts every kind with empty fields, and a check with four empty options and the lesson title', () => {
    expect(newBlock('check', 1, 'Two')).toMatchObject({ block: 'check', lesson: 1, fin: false, question: { t: 'Two', q: '', o: ['', '', '', ''], a: 0, why: '' } });
    expect(newBlock('text', 0)).toMatchObject({ h: '', t: '' });
    expect(newBlock('accordion', 0)).toMatchObject({ panels: [['', ''], ['', '']] });
    expect(newBlock('sort', 0)).toMatchObject({ bins: ['', ''], cards: [['', 0], ['', 1]] });
    expect(newBlock('branch', 0)).toMatchObject({ q: '', choices: [['', '', true], ['', '', false]] });
    expect(newBlock('exercise', 0)).toMatchObject({ q: '', a: 0, tol: 0, unit: '' });
    expect(newBlock('text', 0).id).toMatch(BLOCK_ID);
  });
  it('says what is missing, one thing at a time, in the creator\'s words', () => {
    expect(missingOf(newBlock('check', 0))).toBe('Write the question');
    expect(missingOf({ ...newBlock('check', 0), question: { ...Q, o: ['a', '', 'c', 'd'] } } as CourseBlock)).toBe('Write all four options');
    expect(missingOf({ ...newBlock('check', 0), question: { ...Q, why: '' } } as CourseBlock)).toBe('Say why the answer is right');
    expect(missingOf({ ...newBlock('check', 0), question: Q } as CourseBlock)).toBeNull();
    expect(missingOf(newBlock('text', 0))).toBe('Write the text');
  });
});

describe('insertBlock', () => {
  const made = newBlock('callout', 0);
  it('after the second block of lesson 1 lands third in lesson 1 and leaves lesson 2 alone', () => {
    const out = insertBlock(course(), 0, 'b0002', made);
    expect(ids(out, 0)).toEqual(['b0001', 'b0002', made.id, 'b0003', 'b0004']);
    expect(ids(out, 1)).toEqual(['b0005']);
  });
  it('without a block to follow goes at the end of the lesson', () => {
    expect(ids(insertBlock(course(), 0, null, made), 0)).toEqual(['b0001', 'b0002', 'b0003', 'b0004', made.id]);
    expect(ids(insertBlock(course(), 1, null, { ...made, lesson: 1 }), 1)).toEqual(['b0005', made.id]);
  });
  it('fills a lesson that has no blocks yet', () => {
    expect(ids(insertBlock(rows(), 2, null, { ...made, lesson: 2 }), 2)).toEqual([made.id]);
  });
});

describe('moveBlock', () => {
  it('moves a block within its lesson and never past it', () => {
    expect(ids(moveBlock(course(), 'b0002', -1), 0)).toEqual(['b0002', 'b0001', 'b0003', 'b0004']);
    expect(ids(moveBlock(course(), 'b0003', 1), 0)).toEqual(['b0001', 'b0002', 'b0004', 'b0003']);
  });
  it('up on a lesson\'s first block, and down on its last, change nothing', () => {
    expect(moveBlock(course(), 'b0001', -1)).toEqual(course());
    expect(moveBlock(course(), 'b0005', -1)).toEqual(course());
    expect(moveBlock(course(), 'b0005', 1)).toEqual(course());
  });
});

describe('duplicateBlock, removeBlock, patchBlock', () => {
  it('a copy lands after its original with a new unique id', () => {
    const out = duplicateBlock(course(), 'b0002');
    const copy = ids(out, 0)[2];
    expect(ids(out, 0).slice(0, 2)).toEqual(['b0001', 'b0002']);
    expect(copy).not.toBe('b0002');
    expect(copy).toMatch(BLOCK_ID);
    expect(new Set(ids(out, 0)).size).toBe(5);
    expect(courseRowProblems(out)).toEqual([]);
  });
  it('removes one block and patches one block', () => {
    expect(ids(removeBlock(course(), 'b0002'), 0)).toEqual(['b0001', 'b0003', 'b0004']);
    const out = patchBlock(course(), 'b0001', { h: 'New' } as Partial<CourseBlock>);
    expect(lessonsOf(out)[0].blocks[0]).toMatchObject({ id: 'b0001', h: 'New', t: 'Words b0001' });
  });
  it('a patch of a check\'s option 3 keeps the others', () => {
    const out = patchBlock(course(), 'b0004', { question: { ...Q, o: ['a', 'b', 'changed', 'd'] } } as Partial<CourseBlock>);
    expect((lessonsOf(out)[0].blocks[3] as { question: typeof Q }).question).toEqual({ ...Q, o: ['a', 'b', 'changed', 'd'] });
  });
});

describe('setFinal', () => {
  const two = (): StudioEntry[] => [...rows(), { block: 'check', id: 'b0001', lesson: 0, question: Q, fin: true }, { block: 'check', id: 'b0002', lesson: 1, question: Q, fin: false }];
  it('makes one check the final check and unmarks the other', () => {
    const out = lessonsOf(setFinal(two(), 'b0002', true)).flatMap((l) => l.blocks.map((b) => (b as { fin: boolean }).fin));
    expect(out).toEqual([false, true]);
  });
});

describe('lessons', () => {
  it('addLesson adds the default row, up to 12 lessons', () => {
    expect(addLesson(rows()).filter(Array.isArray)[3]).toEqual(['Lesson 4', 'New lesson', '']);
    const twelve = Array.from({ length: 12 }, (_, k) => ['Lesson ' + (k + 1), 'T', '']) as StudioEntry[];
    expect(addLesson(twelve)).toEqual(twelve);
  });
  it('renameLesson changes the title and keeps the blocks', () => {
    const out = renameLesson(course(), 1, 'Second');
    expect(lessonsOf(out).map((l) => l.title)).toEqual(['One', 'Second', 'Three']);
    expect(ids(out, 1)).toEqual(['b0005']);
  });
  it('removeLesson refuses to go below two lessons', () => {
    const two = [...rows().slice(0, 2), text('b0001', 0)];
    expect(removeLesson(two, 0)).toEqual(two);
    expect(removeLesson(course(), 0).filter(Array.isArray)).toHaveLength(2);
  });
  it('renumbers default labels after a removal or a move, and leaves the creator\'s own labels', () => {
    const own: StudioEntry[] = [['Lesson 1', 'One', ''], ['Week two', 'Two', ''], ['Lesson 3', 'Three', '']];
    expect(removeLesson(own, 0).filter(Array.isArray).map((r) => (r as string[])[0])).toEqual(['Week two', 'Lesson 2']);
    expect(moveLesson(rows(), 0, 1).filter(Array.isArray).map((r) => (r as string[])[0])).toEqual(['Lesson 1', 'Lesson 2', 'Lesson 3']);
    expect(dropLesson(rows(), 0).filter(Array.isArray).map((r) => (r as string[])[0])).toEqual(['Lesson 1', 'Lesson 2']);
  });
});
