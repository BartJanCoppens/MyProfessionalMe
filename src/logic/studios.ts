// The ten studios (design v4+, studios plan Task 1.1): types and pure rules. The data is STUDIOS in src/studioData.ts.
// A studio's items are [label, text] or [label, text, text2] rows; what each row means depends on the studio (itemsValid).
import { STUDIOS, STUDIO_STEPS } from '../studioData';
import type { ExamQuestion } from '../types';
import { ITEM_MAX, LONG_MAX, SHORT_MAX, fieldOk, isQuestion, rowFieldMax } from './items';
import { isDrawing } from './motionSvg';
import type { MotionDrawing } from './motionSvg';

// steersAi: the answer only steers the AI draft (the studio says so); without it the answer changes what is published.
export type StudioQuestion = [question: string, options: string[], steersAi?: boolean];
export type ProduceRow = [label: string, options: string[], steersAi?: boolean];
export type BuildStep = string;
export type StudioItem = [label: string, text: string] | [label: string, text: string, text2: string];
// What a studio's items hold: its rows and, after them, the Explainer's three exam questions of its check or the
// Animated flow's one drawing.
export type StudioEntry = StudioItem | ExamQuestion | MotionDrawing;
export const CHECK_SIZE = 3;
export const stepsOf = (items: StudioEntry[]) => items.filter((i): i is StudioItem => Array.isArray(i));
// The rows as {label, text}, trimmed: an explainer's steps and an Animated flow's stages.
export const labelledRows = (items: StudioEntry[]) => stepsOf(items).map((i) => ({ label: i[0].trim(), text: i[1].trim() }));
export const questionsOf = (items: StudioEntry[]) => items.filter((i): i is ExamQuestion => !Array.isArray(i) && !isDrawing(i));
// What a studio's cast is: one stock look, two voices, one voice, or nothing to cast.
export type StudioCast = 'look' | 'voices' | 'voice' | null;
export type ItemSchema = (items: StudioItem[]) => string[];

export type StudioDef = {
  id: string; name: string; out: string; glyph: string; tag: string; time: string; idea: string; title: string;
  dom: string; lvl: number; qs: StudioQuestion[]; items: StudioItem[]; cast: StudioCast; rows: ProduceRow[]; build: BuildStep[] | null;
  pv: string; min: number;
  format: string; alsoFormats?: string[]; // the learning format(s) it produces, see contribution formats
  available: boolean; // false greys it out on the hub until its phase ships
  compact: boolean; // true: its questions and produce options change no request or output yet, so Shape and Produce are folded away (Flash, as in v4)
};

export const studioById = (id: string): StudioDef | undefined => STUDIOS.find((s) => s.id === id);
// The learning format(s) a studio makes: its format, then alsoFormats.
export const studioFormats = (def: StudioDef) => [def.format, ...(def.alsoFormats ?? [])];

export function visibleSteps(def: StudioDef): string[] {
  const dropShape = def.compact || !def.qs.length, dropProduce = def.compact || (!def.rows.length && !def.cast);
  return STUDIO_STEPS.filter((s) => !(s === 'Shape it' && dropShape) && !(s === 'Produce' && dropProduce));
}

const blank = (v: string | undefined) => !v || !v.trim();
const MINUTES = /^Chapter \d+ · (\d+):([0-5]\d)$/;
const seconds = (label: string) => { const m = MINUTES.exec(label); return m ? +m[1] * 60 + +m[2] : -1; };
const labelled = (items: StudioItem[], label: string) => items.filter((i) => i[0] === label);
const need = (items: StudioItem[], label: string, atLeast = 1) => (labelled(items, label).length >= atLeast ? [] : ['Add ' + (atLeast > 1 ? 'at least ' + atLeast + ' ' : 'a ') + label]);

function avatar(items: StudioItem[]): string[] {
  const points = items.filter((i) => /^Learning point · \d+ %$/.test(i[0]));
  const total = points.reduce((n, i) => n + parseInt(i[0].replace(/\D+/, ''), 10), 0);
  return [...['Persona', 'Situation', 'Opening line', 'Reveals if asked', 'Hides unless probed'].flatMap((l) => need(items, l)),
    ...(points.length ? [] : ['Add at least one Learning point']), ...(points.length && total !== 100 ? ['Learning point weights add up to ' + total + ' %, not 100 %'] : [])];
}
const onScreen = (items: StudioItem[]) => items.filter((i) => blank(i[2])).map((i) => i[0] + ': add on-screen text');
function podcast(items: StudioItem[]): string[] {
  const secs = items.map((i) => seconds(i[0]));
  const bad = items.filter((_, k) => secs[k] < 0 || (k > 0 && secs[k] <= secs[k - 1]));
  return [...bad.map((i) => i[0] + ': needs a timestamp after the previous chapter, like “Chapter 2 · 4:30”'), ...items.filter((i) => blank(i[2])).map((i) => i[0] + ': add what is said')];
}
const game = (items: StudioItem[]) => [...(items[0]?.[0] === 'Concept' && labelled(items, 'Concept').length === 1 ? [] : ['Start with exactly one Concept']),
  ...(items.filter((i) => /^Round \d+$/.test(i[0])).length >= 2 ? [] : ['Add at least 2 Round items'])];
// A case's rows, each at least once and nothing else (private.items_ok repeats them).
export const CASE_LABELS = ['Brief', 'Deliverable', 'Criterion'];
const caseExercise = (items: StudioItem[]) => [...CASE_LABELS.flatMap((l) => need(items, l)),
  ...items.filter((i) => !blank(i[0]) && !CASE_LABELS.includes(i[0])).map((i) => i[0] + ': use Brief, Deliverable or Criterion as the label')];

// An Animated flow's drawing takes the last place of its items, so its stages leave one free (private.motion_ok).
const STAGES_MAX = ITEM_MAX['Animated flow'] - 1;
const motion = (items: StudioItem[]) => (items.length > STAGES_MAX ? ['Keep at most ' + STAGES_MAX + ' stages: the animation takes the last place'] : []);

// One schema per studio on top of what every studio needs: a label and text on each row, and at least def.min rows.
const SCHEMAS: Record<string, ItemSchema> = { avatar, reel: onScreen, slides: () => [], podcast, game, motion, explainer: () => [], aid: () => [], case: caseExercise };

// The most rows a studio's items hold: its format's ITEM_MAX (one table for cards, questions and rows).
export const rowsMax = (def: StudioDef) => ITEM_MAX[def.format];

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
  const few = tooFew(def, rows.length) ? ['Add at least ' + def.min + ' items'] : [];
  const max = rowsMax(def), many = max && items.length > max ? ['Add at most ' + max + ' items'] : [];
  const check = questions.length && (questions.length !== CHECK_SIZE || !questions.every(isQuestion)) ? ['The check needs exactly ' + CHECK_SIZE + ' questions: draft it again or remove it'] : [];
  return [...few, ...many, ...blanks, ...long, ...check, ...(SCHEMAS[def.id] ?? (() => []))(rows)];
}
