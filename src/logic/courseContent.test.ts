import { describe, expect, it } from 'vitest';
import { EMBED_FORMATS, COURSE_CAPS, courseBlockRow, courseImagePaths, embedProblems, publicBlock, COURSE_HOURS, WORDS, courseContent, courseHours, courseProblems, courseRowProblems, courseRule, decimalPoint, isCourseBlock, jsonbText, lessonsOf } from './courseContent';
import type { CourseBlock } from './courseContent';
import type { StudioEntry } from './studios';

const Q = { t: 'Place of supply', q: 'Where is the VAT due?', o: ['Belgium', 'Germany, reverse charge', 'Nowhere', 'Both'], a: 1, why: 'The customer accounts for it.' };
const lesson = (n: number, title: string): StudioEntry => ['Lesson ' + n, title, 'Summary of ' + title];
// The design's example course (EL_SEED), with four-option checks: three lessons.
const blocks = (): CourseBlock[] => [
  { block: 'text', id: 'b0001', lesson: 0, h: 'Where is a service taxed?', t: 'For services between businesses VAT is due where the customer is established.' },
  { block: 'accordion', id: 'b0002', lesson: 0, panels: [['The B2B rule', 'The customer’s country taxes it.'], ['The B2C rule', 'The supplier’s country taxes it.']] },
  { block: 'sort', id: 'b0003', lesson: 0, p: 'Sort each service.', bins: ['General rule', 'Exception'], cards: [['Strategy advice to a German company', 0], ['Tickets for a conference in Paris', 1]] },
  { block: 'check', id: 'b0004', lesson: 0, question: Q },
  { block: 'text', id: 'b0005', lesson: 1, h: '', t: 'With the reverse charge the supplier charges no VAT.' },
  { block: 'callout', id: 'b0006', lesson: 1, t: 'The invoice must show it clearly.' },
  { block: 'exercise', id: 'b0007', lesson: 1, q: 'VAT on 12,000 at 21 %?', a: 2520, tol: 1, unit: '€' },
  { block: 'text', id: 'b0008', lesson: 2, h: 'Reporting it', t: 'The return and the listing must match.' },
  { block: 'branch', id: 'b0009', lesson: 2, q: 'A private person asks for no VAT. What do you do?', choices: [['Agree', 'Wrong: B2C applies.', false], ['Charge VAT', 'Right.', true]] },
  { block: 'reflect', id: 'b0010', lesson: 2, p: 'Which of your clients would be reverse-charged?' },
  { block: 'check', id: 'b0011', lesson: 2, question: Q },
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
    expect(courseRowProblems(course([], patch('b0003', { cards: [['One', 0], ['Two']] })))).toEqual(['Lesson 1 · Sort into groups: give every item a group']);
    expect(courseRowProblems(course([], patch('b0003', { cards: [['One', 0], ['Two', 2]] })))).toEqual(['Lesson 1 · Sort into groups: give every item a group']);
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
  it('asks for a scored block (check, sort or calculation) when the rule is score or both; a branch and a reflection do not score', () => {
    const none = course([], blocks().filter((b) => !['check', 'sort', 'exercise'].includes(b.block)).map((b, k) => ({ ...b, lesson: k % 3 }) as CourseBlock));
    const wanted = 'Add a block that scores (a knowledge check, a sort or a calculation), or choose “All lessons viewed” in Shape it';
    expect(courseProblems(none, {})).toEqual([]);
    expect(courseProblems(none, { 'How is completion decided?': 'Score of 80 % or more' })).toEqual([wanted]);
    expect(courseProblems(none, { 'How is completion decided?': 'Both' })).toEqual([wanted]);
    for (const kind of ['check', 'sort', 'exercise']) {
      const one = course([], [...none.filter((b) => !Array.isArray(b)) as CourseBlock[], blocks().find((b) => b.block === kind)!].map((b) => ({ ...b, lesson: 0 }) as CourseBlock));
      expect(courseProblems(one, { 'How is completion decided?': 'Both' }), kind).toEqual(['Lesson 2 “Reverse charge” has no blocks yet', 'Lesson 3 “Reporting it” has no blocks yet']);
    }
  });
  it('takes only exercise numbers the database takes: finite and below 1e15, as courseRowProblems', () => {
    for (const bad of [Number("1e400"), Infinity, NaN, 1e15, -1e15]) expect(courseRowProblems(course([], patch('b0007', { a: bad }))), String(bad)).toHaveLength(1);
    expect(courseRowProblems(course([], patch('b0007', { tol: 1e15 })))).toHaveLength(1);
    expect(courseRowProblems(course([], patch('b0007', { a: 1e15 - 1, tol: 0 })))).toEqual([]);
    expect(COURSE_CAPS.number).toBe(1e15);
  });
  it('reads a decimal comma as a point: "2,5" and "-0,25", not "2,519"', () => {
    expect([decimalPoint('2,5'), decimalPoint(' -0,25 '), decimalPoint('2,519'), decimalPoint('1,2,3')]).toEqual(['2.5', '-0.25', '2,519', '1,2,3']);
  });
});

describe('completion, hours and content', () => {
  it('reads the creator\'s choices, with defaults when unanswered', () => {
    expect(courseRule({})).toBe('seen');
    expect(courseRule({ 'How is completion decided?': 'All lessons viewed' })).toBe('seen');
    expect(courseRule({ 'How is completion decided?': 'Score of 80 % or more' })).toBe('score');
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

describe('the size cap counts the database\'s jsonb spacing', () => {
  // 12 lessons of 5 text blocks; the last block's text is padded to hit a total of `size` bytes as jsonb::text.
  const big = (size: number): StudioEntry[] => {
    const lessons = Array.from({ length: 12 }, (_, k) => lesson(k + 1, 'Lesson title ' + k));
    const list: CourseBlock[] = Array.from({ length: 60 }, (_, i) => ({ block: 'text', id: 'b' + String(1000 + i), lesson: i % 12, h: 'H', t: 'x'.repeat(3500) }));
    const items = [...lessons, ...list] as StudioEntry[];
    const gap = size - new TextEncoder().encode(jsonbText(items)).length;
    (list[59] as { t: string }).t += 'y'.repeat(gap);
    return items;
  };
  it('accepts a course of exactly 250,000 bytes as jsonb text and reports one byte more', () => {
    expect(new TextEncoder().encode(jsonbText(big(250000))).length).toBe(250000);
    expect(courseRowProblems(big(250000))).not.toContain(WORDS.tooBig);
    expect(courseRowProblems(big(250001))).toContain(WORDS.tooBig);
  });
  it('reports a course that JSON.stringify counts under the cap but jsonb counts over it', () => {
    const items = big(250000);
    const shorter = new TextEncoder().encode(JSON.stringify(items)).length;
    expect(shorter).toBeLessThan(250000);
    expect(courseRowProblems(big(250100))).toContain(WORDS.tooBig);
  });
  it('spaces objects and arrays as jsonb does', () => {
    expect(jsonbText({ a: [1, 'x,y'], b: { c: true, d: null } })).toBe('{"a": [1, "x,y"], "b": {"c": true, "d": null}}');
  });
});

describe('embedded learnings', () => {
  const embed = (learning: string, format = 'Reel', lesson = 1): CourseBlock => ({ block: 'embed', id: 'b0090', lesson, format: format as never, learning });
  const base = (): StudioEntry[] => [lesson(1, 'One'), lesson(2, 'Two')];
  it('accepts an embed with no learning yet, a learning id and every embed format, and refuses a format or id outside them', () => {
    EMBED_FORMATS.forEach((f) => expect(courseRowProblems([...base(), embed('L12', f)])).toEqual([]));
    expect(courseRowProblems([...base(), embed('')])).toEqual([]);
    expect(courseRowProblems([...base(), embed('LEE1')])).toEqual(['Lesson 2 · Embedded learning: pick one of the formats and a learning from the library']);
    expect(courseRowProblems([...base(), embed('L1', 'E-learning')])).toHaveLength(1);
  });
  it('asks to pick the learning when the source is empty, and says one that is not available without naming it', () => {
    expect(embedProblems([...base(), embed('')], () => true)).toEqual(['Lesson 2 · Reel: pick the learning from the library']);
    expect(embedProblems([...base(), embed('L7')], () => false)).toEqual(['Lesson 2 · Reel: the learning picked is not available: pick another']);
    expect(embedProblems([...base(), embed('L7')], () => true)).toEqual([]);
  });
  it('publishes an embed as format and learning, without its lesson', () => {
    expect(publicBlock(embed('L7') as CourseBlock)).toEqual({ block: 'embed', id: 'b0090', format: 'Reel', learning: 'L7' });
  });
});


describe('images and hotspots', () => {
  const PATH = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/b0001.png';
  const image = (change: Record<string, unknown> = {}): CourseBlock => ({ block: 'image', id: 'b0080', lesson: 1, path: PATH, alt: 'An invoice with the VAT line', cap: 'A Belgian invoice', ...change } as CourseBlock);
  const hotspot = (change: Record<string, unknown> = {}): CourseBlock => ({ block: 'hotspot', id: 'b0081', lesson: 1, path: PATH, alt: 'An invoice', cap: '', spots: [[30, 40, 'VAT number', 'The supplier'], [65, 60.5, 'Amount', 'Zero']], ...change } as CourseBlock);
  const base = (): StudioEntry[] => [lesson(1, 'One'), lesson(2, 'Two'), { block: 'text', id: 'b0079', lesson: 0, h: '', t: 'First.' } as CourseBlock];
  it('accepts an image with its stored file, alt text and caption, and one not added yet', () => {
    expect(courseRowProblems([...base(), image(), hotspot()])).toEqual([]);
    expect(courseRowProblems([...base(), image({ path: '', alt: '', cap: '' })])).toEqual([]);
  });
  it('refuses a path that is not a stored image (another folder shape, svg, a URL), and text over the caps', () => {
    for (const path of ['b0001.png', PATH.replace('.png', '.svg'), PATH.replace('.png', '.PNG'), 'https://x.test/a.png', PATH + '/../x.png']) {
      expect(courseRowProblems([...base(), image({ path })]), path).toEqual(['Lesson 2 · Image: add a .png, .jpg, .jpeg or .webp image, alt text up to 600 characters and a caption up to 200']);
    }
    for (const p of ['png', 'jpg', 'jpeg', 'webp']) expect(courseRowProblems([...base(), image({ path: PATH.replace('png', p) })]), p).toEqual([]);
    expect(courseRowProblems([...base(), image({ alt: 'x'.repeat(601) })])).toHaveLength(1);
    expect(courseRowProblems([...base(), image({ alt: 'x'.repeat(600), cap: 'y'.repeat(201) })])).toHaveLength(1);
    expect(courseRowProblems([...base(), image({ alt: 'x'.repeat(600), cap: 'y'.repeat(200) })])).toEqual([]);
  });
  it('asks to add the image and to write the alt text, in the words of the database', () => {
    expect(courseProblems([...base(), image({ path: '' })], {})).toEqual(['Lesson 2 · Image: add the image']);
    expect(courseProblems([...base(), image({ alt: '  ' })], {})).toEqual(['Lesson 2 · Image: write the alt text (read aloud by screen readers)']);
    expect(courseProblems([...base(), hotspot({ path: '', alt: '' })], {})).toEqual(['Lesson 2 · Hotspot image: add the image', 'Lesson 2 · Hotspot image: write the alt text (read aloud by screen readers)']);
    expect(courseProblems([...base(), image(), hotspot()], {})).toEqual([]);
  });
  it('a hotspot needs 2 to 8 points, each inside the image (0 to 100 %) with a title and a text', () => {
    const rule = 'Lesson 2 · Hotspot image: give 2 to 8 points, each placed on the image (0 to 100 %) with a title and a text';
    expect(courseRowProblems([...base(), hotspot({ spots: [[10, 10, 'A', 'a']] })])).toEqual([rule]);
    expect(courseRowProblems([...base(), hotspot({ spots: Array.from({ length: 9 }, (_, k) => [k, k, 'T' + k, 't'])})])).toEqual([rule]);
    expect(courseRowProblems([...base(), hotspot({ spots: Array.from({ length: 8 }, (_, k) => [k * 10, 100, 'T' + k, 't'])})])).toEqual([]);
    expect(courseRowProblems([...base(), hotspot({ spots: [[120, 10, 'A', 'a'], [10, 10, 'B', 'b']] })])).toEqual([rule]);
    expect(courseRowProblems([...base(), hotspot({ spots: [[-1, 10, 'A', 'a'], [10, 10, 'B', 'b']] })])).toEqual([rule]);
    expect(courseRowProblems([...base(), hotspot({ spots: [[10, 100.1, 'A', 'a'], [10, 10, 'B', 'b']] })])).toEqual([rule]);
    expect(courseRowProblems([...base(), hotspot({ spots: [['10', 10, 'A', 'a'], [10, 10, 'B', 'b']] })])).toEqual([rule]);
    expect(courseRowProblems([...base(), hotspot({ spots: [[NaN, 10, 'A', 'a'], [10, 10, 'B', 'b']] })])).toEqual([rule]);
    expect(courseRowProblems([...base(), hotspot({ spots: [[0, 0, '', 'a'], [10, 10, 'B', 'b']] })])).toEqual([rule]);
    expect(courseRowProblems([...base(), hotspot({ spots: [[0, 0, 'A', ' '], [10, 10, 'B', 'b']] })])).toEqual([rule]);
  });
  it('lists the image files a course names, in order, leaving out a block with no file yet', () => {
    const other = PATH.replace('b0001', 'b0002');
    expect(courseImagePaths([...base(), image(), image({ id: 'b0082', path: '' }), hotspot({ path: other })])).toEqual([PATH, other]);
    expect(courseImagePaths(course())).toEqual([]);
  });
  it('publishes the file, trimmed alt text and caption, without the lesson; points keep their numbers', () => {
    expect(publicBlock(image({ alt: ' Alt ', cap: ' Cap ' }) as CourseBlock)).toEqual({ block: 'image', id: 'b0080', path: PATH, alt: 'Alt', cap: 'Cap' });
    expect(publicBlock(hotspot({ spots: [[30, 40.5, ' T ', ' x ']] }) as CourseBlock)).toEqual({ block: 'hotspot', id: 'b0081', path: PATH, alt: 'An invoice', cap: '', spots: [[30, 40.5, 'T', 'x']] });
  });
  it('shows a reviewer the alt text of an image first, never its file path', () => {
    expect(courseBlockRow(image())).toEqual({ front: 'Lesson 2 · Image', back: 'An invoice with the VAT line' });
  });
});
