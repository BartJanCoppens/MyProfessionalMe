// The course player as view-model (E-learning Studio, Task 1.4), for the learner's detail page, the Studio's preview and a reviewer: the lesson on show
// with its blocks, Previous and Next, the score line and how the course completes. One block view serves the editor (mode 'edit', Task 1.3) and the player
// (mode 'play', fmtCoursePlay.ts). The learner's run lives in AppState.course; completion and progress are saved through the one detail path
// (saveDetail): the lessons seen and the best score, and the completion itself when the creator's rule is met. The preview runs the same view over its
// own state and saves nothing; View as and an accepted course save nothing either.
import { NEW_BLOCK, isAnswered, isRight, playOf } from './fmtCoursePlay';
import type { BlockPatch, BlockRun, CourseAnswer, Play } from './fmtCoursePlay';
import { NEW_ROUND } from './fmtRound';
import type { RoundState } from './fmtRound';
import { completedToast, detailOf, saveDetail } from './fmtShared';
import { COURSE_TODO } from './logic/record';
import { KIND_NAME, PASS_MARK, SCORED_KINDS } from './logic/courseContent';
import type { BlockKind, CourseBlock, CourseRule } from './logic/courseContent';
import { missingOf } from './logic/courseEdit';
import type { Item, Logic } from './model';
import type { CourseContent } from './types';

export type { BlockPatch, BlockRun, CourseAnswer, Play };
export type BlockView = { id: string; kind: BlockKind; name: string; block: CourseBlock; missing: string | null; on: boolean; pick: () => void; play: Play | null };
export type BlockMode = 'edit' | 'play';

// `on`: the block is selected in the editor; `pick` selects it. `missing` is what the creator still has to write, in their words. `play`: what a learner does with it.
export const blockView = (b: CourseBlock, mode: BlockMode, run: BlockRun | undefined, patch: (p: BlockPatch) => void, o: { ro: boolean; on?: boolean; pick?: () => void }): BlockView =>
  ({ id: b.id, kind: b.block, name: KIND_NAME[b.block], block: b, missing: mode === 'edit' ? missingOf(b) : null, on: !!o.on, pick: o.pick ?? (() => {}),
    play: mode === 'play' ? playOf(b, run ?? NEW_BLOCK, patch, o.ro) : null });

// at: the lesson on show; seen: the lessons opened this session (the saved ones come with the options); rounds: a check's round per block; best, completed and savedSeen:
// what this session already saved (the subject reloads later, so the saved detail is stale for a moment).
export type CourseRun = { at: number; seen: number[]; answers: Record<string, CourseAnswer>; rounds: Record<string, RoundState>; best?: number; completed?: boolean; savedSeen?: number[] };
export const NEW_RUN: CourseRun = { at: 0, seen: [], answers: {}, rounds: {} };
export type CourseScore = { scored: number; answered: number; right: number; pct: number };

const blocksOf = (c: CourseContent) => c.lessons.flatMap((l, k) => l.blocks.map((b) => ({ ...b, lesson: k }) as CourseBlock));
// Every scored block counts, answered or not: an unanswered one is not right.
export function courseScore(c: CourseContent, answers: Record<string, CourseAnswer>): CourseScore {
  const scored = blocksOf(c).filter((b) => SCORED_KINDS.includes(b.block)), done = scored.filter((b) => isAnswered(b, answers[b.id])), right = done.filter((b) => isRight(b, answers[b.id]));
  return { scored: scored.length, answered: done.length, right: right.length, pct: scored.length ? Math.round(100 * right.length / scored.length) : 0 };
}
// The creator's rule (private.is_self_complete lets a learner complete an E-learning; the rule is the player's).
export const courseDone = (rule: CourseRule, seen: number[], lessons: number, score: CourseScore) => {
  const all = Array.from({ length: lessons }, (_, k) => k).every((k) => seen.includes(k)), passed = score.scored > 0 && score.answered === score.scored && score.pct >= PASS_MARK;
  return rule === 'seen' ? all : rule === 'score' ? passed : all && passed;
};

// ro: View as (nothing is answered or saved); seen: the lessons saved before; done: already complete; onProgress: the lessons seen and the score, when they change.
export type CourseOpts = { ro: boolean; seen: number[]; done: boolean; onProgress: (seen: number[], score: CourseScore) => void; preview: boolean; ai?: boolean };

export function courseView(c: CourseContent, run: CourseRun, patch: (p: Partial<CourseRun>) => void, o: CourseOpts) {
  const n = c.lessons.length, at = Math.min(Math.max(run.at, 0), n - 1), score = courseScore(c, run.answers);
  const seenWith = (...more: number[]) => [...new Set([...o.seen, ...run.seen, ...more])].sort((a, b) => a - b);
  const report = (seen: number[], s: CourseScore) => { if (!o.ro && !o.done) o.onProgress(seen, s); };
  const go = (k: number) => { const to = Math.min(Math.max(k, 0), n - 1), seen = seenWith(at, to); patch({ at: to, seen }); report(seen, score); };
  const blockPatch = (id: string) => (p: BlockPatch) => {
    const { [id]: _gone, ...rest } = run.answers, answers = p.answer === undefined ? run.answers : p.answer === null ? rest : { ...run.answers, [id]: p.answer };
    patch({ answers, ...(p.round && { rounds: { ...run.rounds, [id]: { ...(run.rounds[id] ?? NEW_ROUND), ...p.round } } }) });
    if (p.answer !== undefined) report(seenWith(at), courseScore(c, answers));
  };
  const lessonsSeen = seenWith(at).length, parts = [c.rule !== 'score' && lessonsSeen + ' of ' + n + ' lessons seen', c.rule !== 'seen' && score.right + ' of ' + score.scored + ' scored items right'].filter(Boolean);
  return {
    ro: o.ro, preview: o.preview, ai: !!o.ai, title: c.lessons[at].title, pos: 'Lesson ' + (at + 1) + ' of ' + n, progW: Math.round(100 * (at + 1) / n) + '%',
    sub: n + ' lessons' + (o.preview ? '' : ' · counts toward your hours and trajectory steps'),
    blocks: c.lessons[at].blocks.map((b) => blockView({ ...b, lesson: at } as CourseBlock, 'play', { answer: run.answers[b.id], round: run.rounds[b.id] ?? NEW_ROUND }, blockPatch(b.id), { ro: o.ro })),
    prev: () => go(at - 1), next: () => go(at + 1), noPrev: at === 0, noNext: at === n - 1,
    scoreLine: score.scored ? 'Score ' + score.pct + ' % · ' + score.right + ' of ' + score.scored + ' scored items right' + (c.rule === 'seen' ? '' : ' · pass mark ' + PASS_MARK + ' %') : '',
    ruleLine: o.done ? 'Complete.' : 'To complete: ' + COURSE_TODO[c.rule] + ' · ' + parts.join(' · '),
    note: o.ro ? 'Viewing someone else: nothing here is saved or counted.' : '',
  };
}
export type CourseView = ReturnType<typeof courseView>;

// The learner's course: the run is kept per subject and learning (so View as never shows another person's answers); the lessons seen and the best
// score are saved as they change, and the learning completes when the creator's rule is met.
export function courseVals(L: Logic, it: Item, c: CourseContent) {
  const key = L.subject.id + '|' + it.id, saved = detailOf<'course'>(L, it.id), kept = L.state.course;
  const patch = (p: Partial<CourseRun>) => L.setState((s) => ({ course: { ...(s.course && s.course.key === key ? s.course : { ...NEW_RUN, key }), ...p } }));
  // A best score is a full attempt (every scored item answered) and never goes down; the high-water mark of this session is read from the latest state.
  const onProgress = (seen: number[], score: CourseScore) => {
    const now = L.latest().state.course, run = now && now.key === key ? now : { ...NEW_RUN, key };
    const known = [...(saved.seen ?? []), ...(run.savedSeen ?? [])], prior = Math.max(run.best ?? -1, saved.best ?? -1), full = score.scored > 0 && score.answered === score.scored;
    const best = full ? Math.max(prior, score.pct) : prior < 0 ? undefined : prior, complete = !run.completed && courseDone(c.rule, seen, c.lessons.length, score);
    if (!complete && seen.every((k) => known.includes(k)) && best === (prior < 0 ? undefined : prior)) return;
    patch({ best, completed: run.completed || complete, savedSeen: seen });
    saveDetail(L, it, { seen, ...(best !== undefined && { best }) }, { complete, done: completedToast(it, 'Course finished') });
  };
  const run = kept && kept.key === key ? kept : { ...NEW_RUN, key };
  return courseView(c, run, patch, { ro: L.subject.readOnly, seen: saved.seen ?? [], done: it.state === 'accepted', onProgress, preview: false });
}
