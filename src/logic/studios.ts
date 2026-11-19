// The eleven studios (design v4+, studios plan Task 1.1): types and pure rules. The data is STUDIOS in src/studioData.ts.
// A studio's items are [label, text] or [label, text, text2] rows; what each row means depends on the studio (itemsValid).
import { STUDIOS, STUDIO_STEPS } from '../studioData';
import type { ExamQuestion } from '../types';
import { ROLE_LABEL } from '../../supabase/functions/_shared/gameRules.ts';
import { ITEM_MAX, LONG_MAX, SHORT_MAX, fieldOk, isQuestion, rowFieldMax } from './items';
import { isGameItem } from './gameContent';
import { stepsOf } from './studioRows';
import type { StudioItem } from './studioRows';
import type { GameItem } from './gameContent';
import { isDrawing } from './motionSvg';
import type { MotionDrawing } from './motionSvg';
import { ALL_SPEAKERS, CHAPTER, isChapter } from './podcastContent';
import { bulletsOf, hasWords } from './slidesContent';
import { isVoiceItem } from './voiceItem';
import type { VoiceItem } from './voiceItem';
import { isVideoItem } from './videoItem';
import type { VideoItem } from './videoItem';
import { avatarRows } from './avatarContent';
import { COURSE_CAPS, courseRowProblems, isCourseBlock } from './courseContent';
import type { CourseBlock } from './courseContent';
import { reelRows } from './reelContent';

// steers: what the answer only steers, which the studio says under it (STEERS): the AI draft ('draft'), the next AI
// draft (a Produce answer, after the Draft step: 'redraft'), the AI animation ('animation') or the AI character ('character'). Without it the answer
// changes what is published.
export type Steers = 'draft' | 'redraft' | 'animation' | 'build' | 'character';
export const STEERS: Record<Steers, string> = { draft: 'Steers the AI draft', redraft: 'Used when you draft again', animation: 'Steers the AI animation', build: 'Steers the AI build', character: 'Steers the character' };
export type StudioQuestion = [question: string, options: string[], steers?: Steers];
export type ProduceRow = [label: string, options: string[], steers?: Steers];
export type BuildStep = string;
export type { StudioItem };
// What a studio's items hold: its rows and, after them, the Explainer's three exam questions of its check or the
// Animated flow's one drawing.
export type StudioEntry = StudioItem | ExamQuestion | MotionDrawing | VoiceItem | GameItem | VideoItem | CourseBlock;
export const CHECK_SIZE = 3;
export { stepsOf };
// The rows as {label, text}, trimmed: an explainer's steps and an Animated flow's stages.
export const labelledRows = (items: StudioEntry[]) => stepsOf(items).map((i) => ({ label: i[0].trim(), text: i[1].trim() }));
export const questionsOf = (items: StudioEntry[]) => items.filter((i): i is ExamQuestion => !Array.isArray(i) && !isDrawing(i) && !isVoiceItem(i) && !isGameItem(i) && !isVideoItem(i) && !isCourseBlock(i));
// What a studio's cast is: one stock look, two voices, one voice, or nothing to cast.
export type StudioCast = 'look' | 'voices' | 'voice' | null;
// A schema reads the rows and, for a studio whose items hold more than rows (a course's blocks), every item.
export type ItemSchema = (rows: StudioItem[], items: StudioEntry[]) => string[];

export type StudioDef = {
  id: string; name: string; out: string; glyph: string; tag: string; time: string; idea: string; title: string;
  dom: string; lvl: number; qs: StudioQuestion[]; items: StudioItem[]; cast: StudioCast; rows: ProduceRow[]; build: BuildStep[] | null;
  pv: string; min: number;
  produce?: 'course'; // its Produce step has an editor of its own (the E-learning Studio's course), so the step stays without produce rows or a cast
  savesProduce?: boolean; // true: its Produce answers and cast are saved inside the draft's shape (the database reads them), not only on screen
  columns?: string[]; // what the Draft step's fields are called when label, text and text 2 mean more than that (a deck's title, bullets and talk-over)
  format: string; alsoFormats?: string[]; // the learning format(s) it produces, see contribution formats
  available: boolean; // false greys it out on the hub until its phase ships
  compact: boolean; // true: its questions and produce options change no request or output yet, so Shape and Produce are folded away (Flash, as in v4)
};

export const studioById = (id: string): StudioDef | undefined => STUDIOS.find((s) => s.id === id);
// The learning format(s) a studio makes: its format, then alsoFormats.
export const studioFormats = (def: StudioDef) => [def.format, ...(def.alsoFormats ?? [])];

export function visibleSteps(def: StudioDef): string[] {
  const dropShape = def.compact || !def.qs.length, dropProduce = def.compact || (!def.rows.length && !def.cast && !def.produce);
  return STUDIO_STEPS.filter((s) => !(s === 'Shape it' && dropShape) && !(s === 'Produce' && dropProduce));
}

const blank = (v: string | undefined) => !v || !v.trim();
const labelled = (items: StudioItem[], label: string) => items.filter((i) => i[0] === label);
const need = (items: StudioItem[], label: string, atLeast = 1) => (labelled(items, label).length >= atLeast ? [] : ['Add ' + (atLeast > 1 ? 'at least ' + atLeast + ' ' : 'a ') + label]);

// A slide has bullets and a talk-over; its voice-over takes the last place of the items, so the slides leave one free (private.slides_ok).
const SLIDES_MAX = ITEM_MAX.Slides - 1;
const slides = (items: StudioItem[]) => [...items.filter((i) => !bulletsOf(i[1]).length).map((i) => i[0] + ': add at least one bullet'), ...items.filter((i) => !hasWords(i[2])).map((i) => i[0] + ': add the talk-over (marks are not spoken words)'),
  ...(items.length > SLIDES_MAX ? ['Keep at most ' + SLIDES_MAX + ' slides: the voice-over takes the last place'] : [])];
// A script: chapter rows ("Chapter N · m:ss", numbered from 1, the times rising from 0:00) and turn rows (a speaker, then the
// words), starting with a chapter that has at least one turn; its voice-over takes the last place of the items, so the rows leave
// one free (private.script_ok and private.podcast_ok repeat these rules).
const PODCAST_MAX = ITEM_MAX.Podcast - 1;
const secondsOf = (label: string) => { const m = CHAPTER.exec(label); return m ? +m[2] * 60 + +m[3] : -1; };
function podcast(items: StudioItem[]): string[] {
  const out: string[] = [];
  let chapters = 0, previous = -1, lines = 0;
  const closed = (label: string) => { if (label && !lines) out.push(label + ': has no lines yet, add what is said'); };
  let last = '';
  items.forEach((i, k) => {
    if (isChapter(i[0])) {
      closed(last); last = i[0]; lines = 0; chapters++;
      if (+CHAPTER.exec(i[0])![1] !== chapters) out.push(i[0] + ': Number the chapters 1, 2, 3 in order');
      if (secondsOf(i[0]) <= previous || (chapters === 1 && secondsOf(i[0]) !== 0)) out.push(i[0] + ': needs a timestamp after the previous chapter, like “Chapter 2 · 4:30” (the first is 0:00)');
      previous = secondsOf(i[0]);
    } else if (i[0].startsWith('Chapter')) out.push(i[0] + ': needs a timestamp after the previous chapter, like “Chapter 2 · 4:30”');
    else {
      if (!k) out.push('Start with a chapter, like “Chapter 1 · 0:00”');
      if (!ALL_SPEAKERS.includes(i[0])) out.push(i[0] + ' is not a speaker: use Host, Guest or Co-host');
      if (!hasWords(i[1])) out.push(i[0] + ': add what is said (marks are not spoken words)');
      lines++;
    }
  });
  closed(last);
  const speakers = new Set(items.filter((i) => !isChapter(i[0]) && ALL_SPEAKERS.includes(i[0])).map((i) => i[0]));
  return [...out, ...(speakers.size > 2 ? ['Use at most two speakers in a script'] : []), ...(items.length > PODCAST_MAX ? ['Keep at most ' + PODCAST_MAX + ' rows: the voice-over takes the last place'] : [])];
}
// A game: one Concept first, at least 2 Rounds, at most one AI role and nothing else; its built game takes the last place of the
// items, so the rows leave one free (private.game_ok repeats these rules).
const GAME_MAX = ITEM_MAX.Game - 1;
const GAME_LABEL = /^Round \d+$/;
const game = (items: StudioItem[]) => [...(items[0]?.[0] === 'Concept' && labelled(items, 'Concept').length === 1 ? [] : ['Start with exactly one Concept']),
  ...(items.filter((i) => GAME_LABEL.test(i[0])).length >= 2 ? [] : ['Add at least 2 Round items']),
  ...(labelled(items, ROLE_LABEL).length > 1 ? ['Use at most one AI role row'] : []),
  ...items.filter((i) => !blank(i[0]) && i[0] !== 'Concept' && i[0] !== ROLE_LABEL && !GAME_LABEL.test(i[0])).map((i) => i[0] + ': use Concept, Round 1, Round 2 or AI role as the label'),
  ...(items.length > GAME_MAX ? ['Keep at most ' + GAME_MAX + ' rows: the built game takes the last place'] : [])];
// A case's rows, each at least once and nothing else (private.items_ok repeats them).
export const CASE_LABELS = ['Brief', 'Deliverable', 'Criterion'];
const caseExercise = (items: StudioItem[]) => [...CASE_LABELS.flatMap((l) => need(items, l)),
  ...items.filter((i) => !blank(i[0]) && !CASE_LABELS.includes(i[0])).map((i) => i[0] + ': use Brief, Deliverable or Criterion as the label')];

// An Animated flow's drawing takes the last place of its items, so its stages leave one free (private.motion_ok).
const STAGES_MAX = ITEM_MAX['Animated flow'] - 1;
const motion = (items: StudioItem[]) => (items.length > STAGES_MAX ? ['Keep at most ' + STAGES_MAX + ' stages: the animation takes the last place'] : []);

// One schema per studio on top of what every studio needs: a label and text on each row, and at least def.min rows.
const SCHEMAS: Record<string, ItemSchema> = { avatar: avatarRows, reel: reelRows, slides, podcast, game, motion, explainer: () => [], aid: () => [], case: caseExercise, elearn: (_rows, items) => courseRowProblems(items) };

// The most rows a studio's items hold: its format's ITEM_MAX (one table for cards, questions and rows).
export const rowsMax = (def: StudioDef) => ITEM_MAX[def.format];
// The most rows (lessons, for a course) a draft of the studio may have: a course's 252 items are mostly blocks.
export const rowCap = (def: StudioDef) => (def.produce === 'course' ? COURSE_CAPS.lessons[1] : rowsMax(def));

// The one minimum: fewer rows than the studio needs. Flash card & Exam Studio's items have their own shape and only this rule.
export const tooFew = (def: StudioDef, count: number) => count < def.min;

// The problems with a studio's items, in words; empty means valid (the shape of the contribution path's problem lists).
// Labels up to SHORT_MAX and texts up to LONG_MAX characters, as private.rows_ok. The rows count toward the minimum, every
// item toward the maximum; a check holds exactly CHECK_SIZE well-formed questions (private.explainer_ok).
export function itemsValid(def: StudioDef, items: StudioEntry[]): string[] {
  const rows = stepsOf(items), questions = questionsOf(items);
  const blanks = rows.filter((i) => blank(i[0]) || blank(i[1])).map((i) => (i[0] || 'An item') + ': text is empty');
  // A field that has text but breaks the field rule is too long (blank ones are reported above).
  const long = rows.filter((i) => i.some((v, k) => !!v?.trim() && !fieldOk(rowFieldMax(k))(v)))
    .map((i) => i[0].slice(0, 40) + ': too long (labels up to ' + SHORT_MAX + ' characters, texts up to ' + LONG_MAX + ')');
  const few = tooFew(def, rows.length) ? ['Add at least ' + def.min + (def.produce === 'course' ? ' lessons' : ' items')] : [];
  const max = rowsMax(def), many = max && items.length > max ? ['Add at most ' + max + ' items'] : [];
  const check = questions.length && (questions.length !== CHECK_SIZE || !questions.every(isQuestion)) ? ['The check needs exactly ' + CHECK_SIZE + ' questions: draft it again or remove it'] : [];
  return [...few, ...many, ...blanks, ...long, ...check, ...(SCHEMAS[def.id] ?? (() => []))(rows, items)];
}
