// Flash cards and practice exams made in Create & share: the items, where they came from, CSV import, strict reading of
// an AI answer and the lines Create & share shows about them. A studio's rows are items too (StudioRow; their rules are
// itemsValid in studios.ts). The database repeats the shape rules (private.items_ok) and the caps (private.item_max).
import type { ExamQuestion } from '../types';
import type { Check } from './contribution';
import { jsonObject } from './json';

export type Card = [string, string];
// A generic studio's row is [label, text] (a Card has that shape) or [label, text, text2].
export type StudioRow = [string, string, string];
export type Item = Card | StudioRow | ExamQuestion;
export type ItemSource = 'ai' | 'scripted' | 'csv' | 'manual' | 'saved' | '';
// list: the items; how: where they came from ('ai' makes the contribution AI-assisted, see aiAssisted); note: the label shown with them;
// problems: bad CSV lines to show.
export type DraftItems = { list: Item[]; how: ItemSource; note: string; problems: string[] };

export const noItems = (): DraftItems => ({ list: [], how: '', note: '', problems: [] });
// The most items of each format: cards, exam questions and every studio's rows (the design's example counts with room to
// grow; reel and motion stay inside 90 s, podcast inside 30 min at four minutes a chapter, slides inside 15 min).
// Mirrored in private.item_max.
export const ITEM_MAX: Record<string, number> = { 'Flash cards': 40, 'Practice exam': 30, Avatar: 12, Reel: 8, Podcast: 8, Game: 10, Slides: 15, 'Animated flow': 8,
  'Interactive explainer': 10, 'Job aid': 20, 'Case exercise': 12 };
// The formats whose items are cards or exam questions, always there (the upload form's item panel); any other format's
// items are a studio's rows.
export const CARD_FORMATS = ['Flash cards', 'Practice exam'];
export const hasItems = (type: string) => CARD_FORMATS.includes(type);
// Whether a contribution carries items: the card formats always, anything made in a studio (private.carries_items).
export const carriesItems = (type: string, studio: string | null | undefined) => hasItems(type) || !!studio;
const isFlash = (type: string) => type === 'Flash cards';
export const noun = (type: string, n: number) => (isFlash(type) ? (n === 1 ? 'card' : 'cards') : type === 'Practice exam' ? (n === 1 ? 'question' : 'questions') : n === 1 ? 'item' : 'items');
export const countText = (type: string, n: number) => n + ' ' + noun(type, n);

// Text limits, mirrored in private.items_ok: fronts, questions, options and topics; backs and explanations.
export const SHORT_MAX = 300;
export const LONG_MAX = 600;
// The one field rule: text, not blank, within its cap. A row's first field (a front or a label) is short, the rest long
// (private.rows_ok).
export const fieldOk = (max: number) => (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= max;
export const rowFieldMax = (k: number) => (k === 0 ? SHORT_MAX : LONG_MAX);
const isCard = (v: unknown): v is Card => Array.isArray(v) && v.length === 2 && v.every((x, k) => fieldOk(rowFieldMax(k))(x));
const isQuestion = (v: unknown): v is ExamQuestion => {
  const x = v as Record<string, unknown> | null;
  return !!x && typeof x === 'object' && fieldOk(SHORT_MAX)(x.t) && fieldOk(SHORT_MAX)(x.q) && fieldOk(LONG_MAX)(x.why) && Array.isArray(x.o) && x.o.length === 4 && x.o.every(fieldOk(SHORT_MAX))
    && Number.isInteger(x.a) && (x.a as number) >= 0 && (x.a as number) < 4;
};
const isRow = (v: unknown): v is StudioRow => Array.isArray(v) && (v.length === 2 || v.length === 3) && v.every((x) => typeof x === 'string');
const isItem = (type: string) => (isFlash(type) ? isCard : type === 'Practice exam' ? isQuestion : isRow);

// The first sentence of a passage, and its first n words without a trailing punctuation mark; shared by the scripted drafts.
export const firstSentence = (p: string) => p.trim().split(/(?<=[.!?])\s+/)[0];
export const leadWords = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(' ').replace(/[.,;:!?]+$/, '');
// A creator's or passage's text inside a data block of an AI request; a marker inside it cannot close the block.
export const marked = (t: string, max = 600) => '<<<' + t.replace(/[<>]{3,}/g, ' ').slice(0, max) + '>>>';

// Scripted cards: each passage becomes one card, a short question about its opening words and the first sentence as the answer.
export function cardsFromPassages(passages: string[]): Card[] {
  return passages.map((p) => p.trim()).filter(Boolean).slice(0, ITEM_MAX['Flash cards']).map((p) => {
    const sentence = firstSentence(p).slice(0, 200);
    return ['What do you need to know about “' + leadWords(sentence, 6) + '”?', sentence];
  });
}

// One CSV line to fields, quotes allowed ("a, b", "say ""hi"""); null when a quote is left open.
function fieldsOf(line: string): string[] | null {
  const out: string[] = []; let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) { if (ch !== '"') cur += ch; else if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
    else if (ch === '"' && cur.trim() === '') { inQuotes = true; cur = ''; }
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  return inQuotes ? null : out.concat(cur.trim());
}
const TOO_LONG = ': a field is too long (up to ' + SHORT_MAX + ' characters, ' + LONG_MAX + ' for answers and explanations)';
const PROBLEMS_SHOWN = 10;
const EXAM_FORM = 'expected topic, question, four options, answer (1 to 4) and why';

// Cards: front,back. Exam: topic,question,option1..4,answer index (1-4),why. A header line is skipped; bad lines are
// reported by line number and never stop the import.
export function parseCsv(type: string, raw: string): { list: Item[]; problems: string[] } {
  const list: Item[] = [], problems: string[] = [], flash = isFlash(type);
  const lines = String(raw).replace(/^\uFEFF/, '').split(/\r?\n/);
  let seen = false;
  lines.forEach((line, k) => {
    if (!line.trim()) return;
    const f = fieldsOf(line), n = k + 1, first = !seen;
    seen = true;
    if (!f) { problems.push('Line ' + n + ': a quote is not closed'); return; }
    if (first && f[0].toLowerCase() === (flash ? 'front' : 'topic')) return;
    if (flash) {
      if (f.length !== 2 || !f.every(Boolean)) problems.push('Line ' + n + ': expected front,back');
      else if (!isCard(f)) problems.push('Line ' + n + TOO_LONG);
      else list.push([f[0], f[1]]);
      return;
    }
    if (f.length !== 8 || f.some((x) => !x)) { problems.push('Line ' + n + ': ' + EXAM_FORM); return; }
    const a = /^[1-4]$/.test(f[6]) ? +f[6] - 1 : -1;
    const item = { t: f[0], q: f[1], o: f.slice(2, 6), a, why: f[7] };
    if (a < 0) problems.push('Line ' + n + ': the answer must be a number from 1 to 4');
    else if (!isQuestion(item)) problems.push('Line ' + n + TOO_LONG);
    else list.push(item);
  });
  const max = ITEM_MAX[type];
  if (list.length > max) { list.length = max; problems.push('Only the first ' + max + ' ' + noun(type, max) + ' were kept'); }
  if (!list.length && !problems.length) problems.push('No lines found');
  if (problems.length > PROBLEMS_SHOWN + 1) problems.splice(PROBLEMS_SHOWN, problems.length, 'and ' + (problems.length - PROBLEMS_SHOWN) + ' more');
  return { list, problems };
}

// The JSON an AI answer must hold: {"cards":[{front,back}]} or {"questions":[{t,q,o,a,why}]}, with a 0-based answer.
// Anything malformed is null, never repaired.
export function parseDraftItems(type: string, raw: string): Item[] | null {
  const r = jsonObject(raw) as Record<string, unknown> | null;
  const rows = r && (isFlash(type) ? r.cards : r.questions);
  if (!Array.isArray(rows) || !rows.length) return null;
  const items = isFlash(type) ? rows.map((c) => (c && typeof c.front === 'string' && typeof c.back === 'string' ? [c.front.trim(), c.back.trim()] : null)) : rows;
  if (!items.every(isItem(type))) return null;
  const clean = isFlash(type) ? items as Item[]
    : (items as ExamQuestion[]).map((x) => ({ t: x.t.trim(), q: x.q.trim(), o: x.o.map((o) => o.trim()), a: x.a, why: x.why.trim() }));
  return clean.slice(0, ITEM_MAX[type]);
}

// Items stored on a contribution, read again strictly: a wrong shape gives none.
export function itemsFromSaved(type: string, raw: unknown): Item[] {
  return Array.isArray(raw) && raw.every(isItem(type)) ? (raw as Item[]) : [];
}

// One row per item for the form and for reviewers.
// The well-formed items only: a stray item of the other format is left out, never a crash.
export const validItems = (type: string, list: Item[]): Item[] => list.filter(isItem(type));
export function itemRows(type: string, list: Item[]): { front: string; back: string }[] {
  return validItems(type, list).map((x) => (type === 'Practice exam' ? { front: (x as ExamQuestion).q, back: 'Answer: ' + (x as ExamQuestion).o[(x as ExamQuestion).a] + ' · ' + (x as ExamQuestion).why }
    : { front: (x as StudioRow)[0], back: (x as StudioRow).slice(1).filter(Boolean).join(' · ') }));
}
// Saved as AI-assisted when the outline was drafted by AI or the items were, in any studio; scripted and manual items never are.
export const aiAssisted = (nw: { ai: boolean; items?: DraftItems }) => nw.ai || nw.items?.how === 'ai';
// Every text of the items, for the client-name check.
export const itemsText = (list: Item[]): string[] => list.flatMap((x) => (Array.isArray(x) ? x : [x.t, x.q, ...(x.o || []), x.why]));

export function itemsCheck(type: string, d: DraftItems): Check {
  const n = d.list.length, what = countText(type, n);
  if (!n) return { ok: false, text: 'Generate with AI or import a CSV' };
  return { ok: true, text: what + (d.how === 'csv' ? ' imported from a CSV' : d.how === 'saved' ? ' saved' : ' drafted from the bundle') + ' · check each one' };
}
