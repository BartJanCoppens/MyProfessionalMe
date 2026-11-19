// The inspector's fields of one course block (E-learning Studio, Task 1.3): what a creator types for each kind, with the caps of COURSE_CAPS on the
// inputs, and the buttons that add or remove a panel, an item or a choice. Plain data for the screen; a change is a patch of the block.
import type { Opt } from './ds';
import { COURSE_CAPS as C, decimalPoint } from './logic/courseContent';
import type { CourseBlock } from './logic/courseContent';
import { LONG_MAX, SHORT_MAX } from './logic/items';

export type FieldView = { label: string; kind: 'input' | 'area' | 'select'; value: string; options?: Opt[]; max?: number; numeric?: boolean; min?: number; set: (v: string) => void };
export type MoreView = { label: string; run: () => void; off: boolean };
type Patch = (p: Partial<CourseBlock>) => void;
// note: a line under the fields. embed: what an embedded learning's inspector needs from the library (its sources and the studio that makes a new one).
type Fields = { fields: FieldView[]; more: MoreView[]; note?: string };
export type EmbedSources = { sources: Opt[]; make: () => void; makeLabel: string };

const input = (label: string, value: string, max: number, set: (v: string) => void): FieldView => ({ label, kind: 'input', value, max, set });
const area = (label: string, value: string, max: number, set: (v: string) => void): FieldView => ({ label, kind: 'area', value, max, set });
const select = (label: string, value: string, options: Opt[], set: (v: string) => void): FieldView => ({ label, kind: 'select', value, options, set });
const replaceAt = <T,>(list: T[], i: number, v: T): T[] => list.map((x, k) => (k === i ? v : x));
// A typed number, or null while the text is not one yet ("-", ""): the field keeps what was typed, the block only a finished number.
const number = (v: string, min = -Infinity): number | null => { const n = Number(decimalPoint(v)); return v.trim() !== '' && Number.isFinite(n) && n >= min ? n : null; };
const NUMBER_CHARS = 24; // the longest number a creator can type (text length, not a database cap)
const LETTERS = ['A', 'B', 'C', 'D'];

function listFields<T>(list: T[], range: readonly [number, number], noun: string, add: T, set: (l: T[]) => void): MoreView[] {
  return [{ label: 'Add ' + noun, run: () => set([...list, add]), off: list.length >= range[1] },
    { label: 'Remove the last ' + noun, run: () => set(list.slice(0, -1)), off: list.length <= range[0] }];
}

export function fieldsOf(b: CourseBlock, patch: Patch, embed?: EmbedSources): Fields {
  switch (b.block) {
    case 'text': return { fields: [input('Heading', b.h, C.heading, (h) => patch({ h })), area('Text', b.t, C.text, (t) => patch({ t }))], more: [] };
    case 'callout': return { fields: [area('Callout', b.t, C.callout, (t) => patch({ t }))], more: [] };
    case 'accordion': return {
      fields: b.panels.flatMap(([title, body], i) => [input('Panel ' + (i + 1) + ' title', title, C.panelTitle, (v) => patch({ panels: replaceAt(b.panels, i, [v, body]) })),
        area('Panel ' + (i + 1) + ' text', body, C.panelBody, (v) => patch({ panels: replaceAt(b.panels, i, [title, v]) }))]),
      more: listFields<[string, string]>(b.panels, C.panels, 'panel', ['', ''], (panels) => patch({ panels })) };
    case 'check': {
      const q = b.question, ask = (p: Partial<typeof q>) => patch({ question: { ...q, ...p } });
      return { fields: [area('Question', q.q, SHORT_MAX, (v) => ask({ q: v })),
        ...q.o.map((o, i) => input('Answer ' + LETTERS[i], o, SHORT_MAX, (v) => ask({ o: replaceAt(q.o, i, v) }))),
        select('Right answer', String(q.a), LETTERS.map((l, i) => ({ value: String(i), label: 'Answer ' + l })), (v) => ask({ a: Number(v) })),
        area('Why', q.why, LONG_MAX, (v) => ask({ why: v }))], more: [] };
    }
    case 'sort': return {
      fields: [input('Prompt', b.p, C.prompt, (p) => patch({ p })), input('Group A', b.bins[0], C.bin, (v) => patch({ bins: [v, b.bins[1]] })), input('Group B', b.bins[1], C.bin, (v) => patch({ bins: [b.bins[0], v] })),
        ...b.cards.flatMap(([label, bin], i) => [input('Item ' + (i + 1), label, C.card, (v) => patch({ cards: replaceAt(b.cards, i, [v, bin]) })),
          select('Item ' + (i + 1) + ' belongs to', String(bin), [{ value: '0', label: b.bins[0] || 'Group A' }, { value: '1', label: b.bins[1] || 'Group B' }], (v) => patch({ cards: replaceAt(b.cards, i, [label, v === '1' ? 1 : 0]) }))])],
      more: listFields<[string, 0 | 1]>(b.cards, C.cards, 'item', ['', 0], (cards) => patch({ cards })) };
    case 'branch': return {
      fields: [area('Question', b.q, C.prompt, (q) => patch({ q })),
        ...b.choices.flatMap(([label, outcome, good], i) => [input('Choice ' + (i + 1), label, C.choice, (v) => patch({ choices: replaceAt(b.choices, i, [v, outcome, good]) })),
          area('Reply to choice ' + (i + 1), outcome, C.outcome, (v) => patch({ choices: replaceAt(b.choices, i, [label, v, good]) })),
          select('Choice ' + (i + 1) + ' is', good ? 'good' : 'not', [{ value: 'good', label: 'A good choice' }, { value: 'not', label: 'Not a good choice' }], (v) => patch({ choices: replaceAt(b.choices, i, [label, outcome, v === 'good']) }))])],
      more: listFields<[string, string, boolean]>(b.choices, C.choices, 'choice', ['', '', false], (choices) => patch({ choices })) };
    case 'reflect': return { fields: [area('Prompt', b.p, C.prompt, (p) => patch({ p }))], more: [] };
    case 'embed': return { fields: [select('Source', b.learning, embed?.sources ?? [], (learning) => patch({ learning }))], more: embed ? [{ label: embed.makeLabel, run: embed.make, off: false }] : [],
      note: 'Only published learnings can be added. A new one appears here once it is published.' };
    case 'exercise': return { fields: [area('Question', b.q, C.prompt, (q) => patch({ q })),
      { ...input('Right number', String(b.a), NUMBER_CHARS, (v) => { const a = number(v); if (a !== null) patch({ a }); }), numeric: true },
      { ...input('Tolerance', String(b.tol), NUMBER_CHARS, (v) => { const tol = number(v, 0); if (tol !== null) patch({ tol }); }), numeric: true, min: 0 },
      input('Unit', b.unit, C.unit, (unit) => patch({ unit }))], more: [] };
  }
}
