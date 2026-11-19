// The course player as view-model (E-learning Studio, Task 1.4): the score and the completion rules, the lesson on show, and the learner's saves.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from './data';
import { isRight } from './fmtCoursePlay';
import type { CourseAnswer } from './fmtCoursePlay';
import { courseDone, courseScore, courseView, NEW_RUN } from './fmtCourse';
import { parseFormatContent } from './lib/contentStore';
import * as learner from './lib/learnerStore';
import { flush, harness, member, person, stubWindow, withProgress } from './test/harness';
import type { CourseContent, Learn, LearningDetail } from './types';

vi.mock('./lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));

const Q = { t: 'Place of supply', q: 'Where is the VAT due?', o: ['Belgium', 'Germany, reverse charge', 'Nowhere', 'Both'], a: 1, why: 'The customer accounts for it.' };
// The design's example: six scored blocks (two checks, a sort, an exercise, a final check, a second exercise) in three lessons, and a branch that is not scored.
const lessons = [
  { title: 'Where is a service taxed?', blocks: [
    { block: 'text', id: 'b0001', h: 'Where?', t: 'Where the customer is.' },
    { block: 'sort', id: 'b0002', p: 'Sort each service.', bins: ['General rule', 'Exception'], cards: [['Advice to a German company', 0], ['Tickets for Paris', 1]] },
    { block: 'check', id: 'b0003', question: Q }] },
  { title: 'Reverse charge', blocks: [
    { block: 'exercise', id: 'b0004', q: 'VAT on 12,000 at 21 %?', a: 2520, tol: 1, unit: '€' },
    { block: 'check', id: 'b0005', question: Q }] },
  { title: 'Reporting it', blocks: [
    { block: 'branch', id: 'b0006', q: 'A private person asks for no VAT.', choices: [['Agree', 'Wrong: B2C applies.', false], ['Charge VAT', 'Right.', true]] },
    { block: 'exercise', id: 'b0007', q: 'Net of 121 at 21 %?', a: 100, tol: 0, unit: '€' },
    { block: 'check', id: 'b0008', question: Q }] },
];
const content = (rule: string, ls = lessons) => parseFormatContent({ kind: 'course', lessons: ls, rule }) as CourseContent;
const ALL_RIGHT: Record<string, CourseAnswer> = { b0002: { 0: 0, 1: 1 }, b0003: 1, b0004: { v: '2520', checked: true }, b0005: 1, b0007: { v: '100', checked: true }, b0008: 1 };
const wrong = (id: string): Record<string, CourseAnswer> => ({ ...ALL_RIGHT, [id]: id === 'b0008' ? 0 : { 0: 1, 1: 1 } });

describe('the score', () => {
  it('is 100 with every scored item right and 83 with one of six wrong; the branch is not scored', () => {
    expect(courseScore(content('score'), ALL_RIGHT)).toEqual({ scored: 6, answered: 6, right: 6, pct: 100 });
    expect(courseScore(content('score'), wrong('b0008'))).toEqual({ scored: 6, answered: 6, right: 5, pct: 83 });
  });
  it('counts what is not answered as not right, and gives no pass', () => {
    const score = courseScore(content('score'), { b0003: 1 });
    expect(score).toEqual({ scored: 6, answered: 1, right: 1, pct: 17 });
    expect(courseDone('score', [0, 1, 2], 3, score)).toBe(false);
  });
  it('reads an exercise by its digits and tolerance: 2,519 is right for 2520 ± 1, 2,518 is not, and an empty answer never is', () => {
    const at = (v: string) => courseScore(content('score'), { b0004: { v, checked: true } }).right;
    expect([at('2,519'), at('€ 2521'), at('2,518'), at(''), at('-')]).toEqual([1, 1, 0, 0, 0]);
    expect(courseScore(content('score'), { b0004: { v: '2520', checked: false } }).answered).toBe(0);
  });
  it('accepts a decimal comma: "2,5" is 2.5 (a Belgian learner\'s answer), while "2,519" stays 2519', () => {
    const rate = { block: 'exercise', id: 'b0004', q: 'Rate?', a: 2.5, tol: 0, unit: '%' } as const;
    const right = (v: string) => isRight({ ...rate, lesson: 0 }, { v, checked: true });
    expect([right('2,5'), right('2.5'), right('2,50 %'), right('25'), right('2,519')]).toEqual([true, true, true, false, false]);
  });
  it('wants every card of a sort placed right', () => {
    expect(courseScore(content('score'), { b0002: { 0: 0, 1: 1 } })).toMatchObject({ answered: 1, right: 1 });
    expect(courseScore(content('score'), { b0002: { 0: 0, 1: 0 } })).toMatchObject({ answered: 1, right: 0 });
    expect(courseScore(content('score'), { b0002: { 0: 0 } })).toMatchObject({ answered: 0, right: 0 });
  });
});

describe('completion by the creator\'s rule', () => {
  const full = courseScore(content('score'), ALL_RIGHT), low = courseScore(content('score'), { ...ALL_RIGHT, b0003: 0, b0005: 0 });
  it('seen: every lesson index is in seen', () => {
    expect([[0, 1], [0, 1, 2], [2, 0, 1]].map((s) => courseDone('seen', s, 3, low))).toEqual([false, true, true]);
  });
  it('score: every scored block answered and 80 % or more', () => {
    expect(courseDone('score', [], 3, full)).toBe(true);
    expect(courseDone('score', [], 3, low)).toBe(false);
    expect(courseDone('score', [], 3, { ...full, answered: 5 })).toBe(false);
  });
  it('both: the lessons and the score', () => {
    const seventyFive = { scored: 4, answered: 4, right: 3, pct: 75 };
    expect(courseDone('both', [0, 1, 2], 3, seventyFive)).toBe(false);
    expect(courseDone('both', [0, 1], 3, full)).toBe(false);
    expect(courseDone('both', [0, 1, 2], 3, full)).toBe(true);
  });
});

describe('the lesson on show', () => {
  const view = (run = NEW_RUN, o: Partial<Parameters<typeof courseView>[3]> = {}) =>
    courseView(content('score'), run, () => {}, { ro: false, seen: [], done: false, onProgress: () => {}, preview: false, ...o });
  it('says where the learner is and what the score is', () => {
    const v = view({ ...NEW_RUN, at: 1, answers: wrong('b0008') });
    expect(v).toMatchObject({ title: 'Reverse charge', pos: 'Lesson 2 of 3', progW: '67%', noPrev: false, noNext: false });
    expect(v.scoreLine).toBe('Score 83 % · 5 of 6 scored items right · pass mark 80 %');
    expect(view().noPrev).toBe(true);
    expect(view({ ...NEW_RUN, at: 2 }).noNext).toBe(true);
  });
  it('shows the blocks of the lesson, each with its kind', () => {
    expect(view().blocks.map((b) => [b.kind, b.name])).toEqual([['text', 'Text'], ['sort', 'Sort into groups'], ['check', 'Knowledge check']]);
  });
  it('moves with Next and Previous and passes what was seen on', () => {
    const patch = vi.fn(), onProgress = vi.fn();
    courseView(content('seen'), NEW_RUN, patch, { ro: false, seen: [], done: false, onProgress, preview: false }).next();
    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ at: 1, seen: [0, 1] }));
    expect(onProgress).toHaveBeenCalledWith([0, 1], expect.objectContaining({ scored: 6, pct: 0 }));
  });
  it('tells a learner who is viewing someone else that nothing is saved, and reports no progress', () => {
    const onProgress = vi.fn();
    const v = courseView(content('seen'), NEW_RUN, () => {}, { ro: true, seen: [], done: false, onProgress, preview: false });
    v.next();
    expect(onProgress).not.toHaveBeenCalled();
    expect(v.note).toBe('Viewing someone else: nothing here is saved or counted.');
  });
});

const ROW: Learn = ['L996', 'Place of supply', 'reg', 2, 'E-learning', 'Peer contribution', 0.5, 0, '', ''];
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L996 = ROW; LEARN_META.L996 = { line: null, status: 'published', content: content('both') }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L996; delete LEARN_META.L996; });
beforeEach(() => { stubWindow(); vi.clearAllMocks(); });

const on = (detail?: LearningDetail, state: 'not-started' | 'accepted' = 'not-started', readOnly = false) => {
  const data = withProgress({ L996: state });
  if (detail) data.progress.L996.detail = detail;
  const subject = readOnly ? person({ id: 'p2', name: 'Kim Learner', readOnly: true, data }) : person({ data });
  return harness({ subject, access: member('u1'), state: { screen: 'detail', detailId: 'L996' } });
};
const co = (h: ReturnType<typeof on>) => h.vm().det.co!;
type PlayOf<K extends string> = Extract<NonNullable<ReturnType<typeof co>['blocks'][number]['play']>, { kind: K }>;
const play = <K extends string>(h: ReturnType<typeof on>, kind: K) => co(h).blocks.find((b) => b.play?.kind === kind)!.play as PlayOf<K>;
const pickCheck = (h: ReturnType<typeof on>, option: number) => { play(h, 'check').round.opts[option].pick(); play(h, 'check').round.main(); };
const typeExercise = (h: ReturnType<typeof on>, v: string) => { play(h, 'exercise').set(v); play(h, 'exercise').check(); };
// The design's course answered right from start to end: lesson 1 (sort, check), lesson 2 (exercise, check), lesson 3 (branch, exercise, final check).
function playThrough(h: ReturnType<typeof on>) {
  play(h, 'sort').cards[0].place(0); play(h, 'sort').cards[1].place(1); pickCheck(h, 1); co(h).next();
  typeExercise(h, '2,520'); pickCheck(h, 1); co(h).next();
  play(h, 'branch').choices[1].pick(); typeExercise(h, '100'); pickCheck(h, 1);
}

describe('the learner\'s course', () => {
  it('shows the course on the detail page, from the saved seen lessons', () => {
    const h = on({ seen: [0] });
    expect(co(h)).toMatchObject({ pos: 'Lesson 1 of 3', preview: false, ro: false });
    expect(co(h).ruleLine).toBe('To complete: see every lesson and score 80 % or more on the scored items · 1 of 3 lessons seen · 0 of 6 scored items right');
  });
  it('saves the lessons seen as the learner moves on, once each new lesson is opened', async () => {
    const h = on();
    co(h).next();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L996', { detail: { seen: [0, 1] } });
    expect(learner.saveProgress).toHaveBeenCalledTimes(1);
    expect(co(h).pos).toBe('Lesson 2 of 3');
  });
  it('saves nothing in View as, and answers nothing', async () => {
    const h = on(undefined, 'not-started', true);
    play(h, 'sort').cards[0].place(0);
    co(h).next();
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(co(h)).toMatchObject({ ro: true, pos: 'Lesson 2 of 3', scoreLine: 'Score 0 % · 0 of 6 scored items right · pass mark 80 %' });
    expect(co(h).ruleLine).toContain('0 of 6 scored items right');
  });
  it('does not save again once accepted', async () => {
    const h = on({ seen: [0, 1, 2], best: 100 }, 'accepted');
    playThrough(h);
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(co(h).ruleLine).toBe('Complete.');
  });
  it('completes when the lessons are seen and the score is 80 % or more, with the toast', async () => {
    const h = on();
    playThrough(h);
    await flush();
    expect(learner.saveProgress).toHaveBeenLastCalledWith('u1', 'L996', { state: 'accepted', pct: 100, detail: { seen: [0, 1, 2], best: 100 } });
    expect(h.lastToast()).toBe('Course finished · “Place of supply” counts toward your hours and levels');
  });
  it('Try again clears the answer: the score drops until the check is answered again', () => {
    const h = on();
    pickCheck(h, 1);
    expect(co(h).scoreLine).toBe('Score 17 % · 1 of 6 scored items right · pass mark 80 %');
    play(h, 'check').round.main();
    expect(co(h).scoreLine).toBe('Score 0 % · 0 of 6 scored items right · pass mark 80 %');
    pickCheck(h, 0);
    expect(play(h, 'check').round).toMatchObject({ hasFb: true, fbHead: 'Not quite.', mainLabel: 'Try again' });
  });
  it('does not lower the best score or complete twice when a second save comes before the subject reloads', async () => {
    const h = on();
    playThrough(h);
    await flush();
    const saves = vi.mocked(learner.saveProgress).mock.calls.length;
    play(h, 'check').round.main(); // Try again
    pickCheck(h, 0); // 83 %, every item answered: lower than the 100 % already saved (the subject has not reloaded)
    await flush();
    expect(vi.mocked(learner.saveProgress).mock.calls.length).toBe(saves);
    expect(h.toasts().filter((t) => t.startsWith('Course finished'))).toHaveLength(1);
  });
  it('saves a best score only once every scored item is answered', async () => {
    const h = on();
    play(h, 'sort').cards[0].place(0); play(h, 'sort').cards[1].place(1); pickCheck(h, 1); // 2 of 6 answered
    co(h).next();
    await flush();
    expect(learner.saveProgress).toHaveBeenLastCalledWith('u1', 'L996', { detail: { seen: [0, 1] } });
  });
  it('keeps the highest best score when a lower one comes', async () => {
    const h = on({ seen: [0], best: 83 });
    pickCheck(h, 1); // 17 %, below the best: nothing to save
    await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    co(h).next(); // a new lesson: saved with the best kept
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L996', { detail: { seen: [0, 1], best: 83 } });
  });
});
