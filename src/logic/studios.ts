// The ten studios (design v4+, studios plan Task 1.1): types and pure rules. The data is STUDIOS in src/studioData.ts.
// A studio's items are [label, text] or [label, text, text2] rows; what each row means depends on the studio (itemsValid).
import { STUDIOS, STUDIO_STEPS } from '../studioData';

export type StudioQuestion = [question: string, options: string[]];
export type ProduceRow = [label: string, options: string[]];
export type BuildStep = string;
export type StudioItem = [label: string, text: string] | [label: string, text: string, text2: string];
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
const caseExercise = (items: StudioItem[]) => [...need(items, 'Brief'), ...need(items, 'Deliverable'), ...need(items, 'Criterion')];

// One schema per studio on top of what every studio needs: a label and text on each row, and at least def.min rows.
const SCHEMAS: Record<string, ItemSchema> = { avatar, reel: onScreen, slides: () => [], podcast, game, motion: () => [], explainer: () => [], aid: () => [], case: caseExercise };

// The most rows a studio's items hold (the design's example counts, with room to grow; reel and motion stay inside 90 s,
// podcast inside 30 min at four minutes a chapter, slides inside 15 min).
export const ROWS_MAX: Record<string, number> = { avatar: 12, reel: 8, podcast: 8, game: 10, slides: 15, motion: 8, explainer: 10, aid: 20, case: 12 };

// The one minimum: fewer rows than the studio needs. Flash card & Exam Studio's items have their own shape and only this rule.
export const tooFew = (def: StudioDef, count: number) => count < def.min;

// The problems with a studio's items, in words; empty means valid (the shape of the contribution path's problem lists).
export function itemsValid(def: StudioDef, items: StudioItem[]): string[] {
  const blanks = items.filter((i) => blank(i[0]) || blank(i[1])).map((i) => (i[0] || 'An item') + ': text is empty');
  const few = tooFew(def, items.length) ? ['Add at least ' + def.min + ' items'] : [];
  const many = ROWS_MAX[def.id] && items.length > ROWS_MAX[def.id] ? ['Add at most ' + ROWS_MAX[def.id] + ' items'] : [];
  return [...few, ...many, ...blanks, ...(SCHEMAS[def.id] ?? (() => []))(items)];
}
