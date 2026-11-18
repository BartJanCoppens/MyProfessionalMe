// The Avatar format (studios plan, Task 6.1) as content. An avatar is studio rows [label, text, text2]: the five character rows (Persona,
// Situation, Opening line, Reveals if asked, Hides unless probed), 1 to 4 "Learning point · N %" rows (N adding up to 100) and three quiz rows
// ("Quiz 1" to "Quiz 3": the question, then 2 to 4 options in text 2, the right one first). The quiz completes the learning (never a run).
// What the rows publish as is private.avatar_content, which avatarContent repeats for the preview; the checks are private.avatar_row_problems'
// and the Avatar part of private.contribution_problems', the texts the same. What the character reveals or hides never leaves the rows: it is
// not in the content, and no public text may repeat it (textEchoes: a window of ECHO_WINDOW characters of it, where the Game's check takes the whole text).
import { CHARACTER_LABELS, DIFFICULTIES, LANGUAGES, POINT_LABEL, RUN_MINUTES, SCORINGS, TO_WRITE, characterOf, parseLearningPoints } from '../../supabase/functions/_shared/avatarRules.ts';
import type { StockVoice } from './ai';
import { optionsOf, checkOk } from './checkRow';
import type { Check } from './contribution';
import { BAD_LOOK } from './reelContent';
import { stepsOf } from './studioRows';
import type { StudioItem } from './studioRows';
import { textEchoes } from './textEcho';
import { lookOf } from './stockLooks';
import type { StockLook } from './stockLooks';
import type { AvatarContent, QuizQ } from '../types';

export { BAD_LOOK };
export const QUESTIONS = { who: 'Who does the learner talk to?', scoring: 'How is it scored?', run: 'How long is a run?', language: 'Language', difficulty: 'Difficulty', look: 'Look', voice: 'Voice' };
const QUIZ_LABELS = ['Quiz 1', 'Quiz 2', 'Quiz 3'];
const POINTS = { min: 1, max: 4 };
export const NO_CHARACTER = 'Add the character: Persona, Situation, Opening line, Reveals if asked and Hides unless probed';
export const NO_POINTS = 'Add 1 to 4 learning points, each as “Learning point · N %”';
export const NO_QUIZ = 'Add the three quiz questions: each with 2 to 4 options, the right one first';
export const NO_RUN = 'Choose how long a run is', NO_LANGUAGE = 'Choose the language', NO_DIFFICULTY = 'Choose the difficulty', NO_SCORING = 'Choose how it is scored', NO_LOOK = 'Choose a look in Produce';
export const BAD_VOICE = 'That voice is not on the stock list';
export const ECHOED = "The scenario's public text repeats what the character keeps back";
export const weightsText = (total: number) => 'Learning point weights add up to ' + total + ' %, not 100 %';

const blank = (v: string | undefined) => !v || !v.trim();
const pointRows = (rows: StudioItem[]) => rows.filter((r) => POINT_LABEL.test(r[0]));
const isPointOrQuiz = (label: string) => POINT_LABEL.test(label) || QUIZ_LABELS.includes(label);
const minutesOf = (shape: Record<string, string>) => RUN_MINUTES.find((m) => shape[QUESTIONS.run] === m + ' minutes');
const languageOf = (shape: Record<string, string>) => Object.keys(LANGUAGES).find((l) => l === shape[QUESTIONS.language]) as AvatarContent['language'] | undefined;
const difficultyOf = (shape: Record<string, string>) => DIFFICULTIES.find((d) => d === shape[QUESTIONS.difficulty]);
const scoringOf = (shape: Record<string, string>) => SCORINGS.find((s) => s === shape[QUESTIONS.scoring]);

// The three quiz rows by their labels, as questions (options right-first); null unless there is exactly one of each, well formed.
function quizRows(rows: StudioItem[]): QuizQ[] | null {
  const found = QUIZ_LABELS.map((l) => rows.filter((r) => r[0] === l));
  return found.every((f) => f.length === 1 && checkOk(f[0])) && rows.filter((r) => QUIZ_LABELS.includes(r[0])).length === 3
    ? found.map(([r]) => ({ q: r[1].trim(), opts: optionsOf(r[2]), a: 0 })) : null;
}
// The questions as the seeded avatars' quiz has them (AVATAR_QUIZ), so one panel path serves both.
export const quizOf = (c: AvatarContent): QuizQ[] => c.quiz.map((q) => ({ q: q.q, opts: q.opts, a: q.a }));

// The problems with an avatar's rows, in words (the Avatar's item schema): the character, the learning points and the quiz; the same
// reading as private.avatar_row_problems, in the same order.
export function avatarRows(rows: StudioItem[]): string[] {
  const out: string[] = [], labels = rows.map((r) => r[0]), count = (l: string) => labels.filter((x) => x === l).length;
  if (CHARACTER_LABELS.some((l) => !count(l))) out.push(NO_CHARACTER);
  out.push(...[...new Set(labels)].filter((l) => (CHARACTER_LABELS as readonly string[]).includes(l) && count(l) > 1).map((l) => l + ': use each character row once'));
  out.push(...rows.filter((r) => !blank(r[0]) && !(CHARACTER_LABELS as readonly string[]).includes(r[0]) && !isPointOrQuiz(r[0]))
    .map((r) => r[0] + ': use a character row, “Learning point · N %” or Quiz 1 to 3 as the label'));
  out.push(...rows.filter((r) => r[0] in TO_WRITE && r[1].trim() === TO_WRITE[r[0] as keyof typeof TO_WRITE]).map((r) => r[0] + ': write it, this is still the placeholder'));
  const points = pointRows(rows), total = points.reduce((n, r) => n + parseInt(POINT_LABEL.exec(r[0])![1], 10), 0);
  if (points.length < POINTS.min || points.length > POINTS.max) out.push(NO_POINTS);
  else if (total !== 100) out.push(weightsText(total));
  if (!quizRows(rows)) out.push(NO_QUIZ);
  return out;
}

// The texts learners read: the character's persona, situation and opening line, each learning point, each quiz row (question and options) and
// who the learner talks to.
const publicTexts = (rows: StudioItem[], shape: Record<string, string>) => [shape[QUESTIONS.who] ?? '',
  ...rows.flatMap((r) => (['Persona', 'Situation', 'Opening line'].includes(r[0]) || POINT_LABEL.test(r[0]) ? [r[1]] : QUIZ_LABELS.includes(r[0]) ? [r[1], r[2] ?? ''] : []))];

// What still blocks sending an avatar, in words (the Avatar part of private.contribution_problems). The rows' own problems come alone; then
// the choices. `looks` and `voices` are the stock lists as this session knows them (null: not loaded, so not judged).
export function avatarProblems(items: readonly unknown[], shape: Record<string, string>, looks: StockLook[] | null, voices: StockVoice[] | null): string[] {
  const rows = stepsOf(items), bad = avatarRows(rows);
  if (bad.length) return bad;
  const out: string[] = [], look = shape[QUESTIONS.look] ?? '', voice = shape[QUESTIONS.voice] ?? '', c = characterOf(rows)!;
  if (!minutesOf(shape)) out.push(NO_RUN);
  if (!languageOf(shape)) out.push(NO_LANGUAGE);
  if (!difficultyOf(shape)) out.push(NO_DIFFICULTY);
  if (!scoringOf(shape)) out.push(NO_SCORING);
  if (!look) out.push(NO_LOOK);
  else if (looks && !lookOf(looks, look)?.active) out.push(BAD_LOOK);
  if (voice && voices && !voices.some((v) => v.id === voice && v.active)) out.push(BAD_VOICE);
  const shown = publicTexts(rows, shape);
  if ([c.reveals, c.hides].some((h) => shown.some((t) => textEchoes(h, t, false)))) out.push(ECHOED);
  return out;
}

// The two checks the studio lists beside the automatic ones (the stock-only line is the studio's own, as the reel's captions line is).
export const avatarChecks = (items: readonly unknown[]): Check[] => {
  const rows = stepsOf(items), points = pointRows(rows), total = points.reduce((n, r) => n + parseInt(POINT_LABEL.exec(r[0])![1], 10), 0);
  return [{ ok: points.length >= POINTS.min && points.length <= POINTS.max && total === 100, text: 'Learning points add up to 100 %' },
    { ok: !!quizRows(rows), text: 'Three quiz questions · the quiz completes the learning' }];
};

// The published content; null without the character, a learning point or the quiz. Run, language, difficulty and scoring read as the first option
// until chosen (the check gate asks for them); a look or voice is kept only while it is an active stock one. The character's last two rows
// are never read here.
export function avatarContent(items: readonly unknown[], shape: Record<string, string>, looks: StockLook[], voices: StockVoice[]): AvatarContent | null {
  const rows = stepsOf(items), c = characterOf(items), points = parseLearningPoints(items), quiz = quizRows(rows);
  if (!c || !points.length || !quiz) return null;
  const l = lookOf(looks, shape[QUESTIONS.look]), v = voices.find((x) => x.id === shape[QUESTIONS.voice]);
  return { kind: 'avatar', persona: c.persona, situation: c.situation, opening: c.opening, points, quiz: quiz as AvatarContent['quiz'],
    look: l?.active ? { id: l.id, name: l.name, portrait: l.portrait, color: l.color } : null, voice: v?.active ? { id: v.id, name: v.name } : null,
    language: languageOf(shape) ?? 'English', difficulty: difficultyOf(shape) ?? DIFFICULTIES[0], minutes: minutesOf(shape) ?? RUN_MINUTES[0], scoring: scoringOf(shape) ?? SCORINGS[0],
    counterpart: (shape[QUESTIONS.who] ?? '').trim(), made: 'ai' };
}
