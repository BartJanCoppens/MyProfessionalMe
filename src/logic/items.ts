// Flash cards and practice exams made in Create & share: the items, where they came from, CSV import, strict reading of
// an AI answer and the lines Create & share shows about them. The database repeats the shape rules (private.items_ok).
import type { ExamQuestion } from '../types';
import type { Check } from './contribution';

export type Card = [string, string];
export type Item = Card | ExamQuestion;
export type ItemSource = 'ai' | 'scripted' | 'csv' | 'manual' | 'saved' | '';
// list: the items; how: where they came from ('ai' makes the contribution AI-assisted, see aiAssisted); note: the label shown with them;
// problems: bad CSV lines to show.
export type DraftItems = { list: Item[]; how: ItemSource; note: string; problems: string[] };

export const noItems = (): DraftItems => ({ list: [], how: '', note: '', problems: [] });
export const ITEM_MAX: Record<string, number> = { 'Flash cards': 40, 'Practice exam': 30 };
export const hasItems = (type: string) => type in ITEM_MAX;
const isFlash = (type: string) => type === 'Flash cards';
const noun = (type: string, n: number) => (isFlash(type) ? (n === 1 ? 'card' : 'cards') : n === 1 ? 'question' : 'questions');
export const countText = (type: string, n: number) => n + ' ' + noun(type, n);

// Text limits, mirrored in private.items_ok: fronts, questions, options and topics; backs and explanations.
export const SHORT_MAX = 300;
export const LONG_MAX = 600;
const text = (max: number) => (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= max;
const isCard = (v: unknown): v is Card => Array.isArray(v) && v.length === 2 && text(SHORT_MAX)(v[0]) && text(LONG_MAX)(v[1]);
const isQuestion = (v: unknown): v is ExamQuestion => {
  const x = v as Record<string, unknown> | null;
  return !!x && typeof x === 'object' && text(SHORT_MAX)(x.t) && text(SHORT_MAX)(x.q) && text(LONG_MAX)(x.why) && Array.isArray(x.o) && x.o.length === 4 && x.o.every(text(SHORT_MAX))
    && Number.isInteger(x.a) && (x.a as number) >= 0 && (x.a as number) < 4;
};
const isItem = (type: string) => (isFlash(type) ? isCard : isQuestion);

// Scripted cards: each passage becomes one card, a short question about its opening words and the first sentence as the answer.
export function cardsFromPassages(passages: string[]): Card[] {
  return passages.map((p) => p.trim()).filter(Boolean).slice(0, ITEM_MAX['Flash cards']).map((p) => {
    const sentence = p.split(/(?<=[.!?])\s+/)[0].slice(0, 200), lead = sentence.split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?]+$/, '');
    return ['What do you need to know about “' + lead + '”?', sentence];
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
  let r: Record<string, unknown> | null = null;
  try { const m = String(raw).match(/\{[\s\S]*\}/); r = m ? JSON.parse(m[0]) : null; } catch { return null; }
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
  return hasItems(type) && Array.isArray(raw) && raw.every(isItem(type)) ? (raw as Item[]) : [];
}

// One row per item for the form and for reviewers.
// The well-formed items only: a stray item of the other format is left out, never a crash.
export const validItems = (type: string, list: Item[]): Item[] => (hasItems(type) ? list.filter(isItem(type)) : []);
export function itemRows(type: string, list: Item[]): { front: string; back: string }[] {
  return validItems(type, list).map((x) => (isFlash(type) ? { front: (x as Card)[0], back: (x as Card)[1] }
    : { front: (x as ExamQuestion).q, back: 'Answer: ' + (x as ExamQuestion).o[(x as ExamQuestion).a] + ' · ' + (x as ExamQuestion).why }));
}
// Saved as AI-assisted when the outline was drafted by AI or the items were.
export const aiAssisted = (nw: { ai: boolean; type: string; items?: DraftItems }) => nw.ai || (hasItems(nw.type) && nw.items?.how === 'ai');
// Every text of the items, for the client-name check.
export const itemsText = (list: Item[]): string[] => list.flatMap((x) => (Array.isArray(x) ? x : [x.t, x.q, ...(x.o || []), x.why]));

export function itemsCheck(type: string, d: DraftItems): Check {
  const n = d.list.length, what = countText(type, n);
  if (!n) return { ok: false, text: 'Generate with AI or import a CSV' };
  return { ok: true, text: what + (d.how === 'csv' ? ' imported from a CSV' : d.how === 'saved' ? ' saved' : ' drafted from the bundle') + ' · check each one' };
}
