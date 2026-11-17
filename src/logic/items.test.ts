// Flash cards and practice exams made in Create & share: items from passages, CSV and AI, and the content they publish as.
import { describe, expect, it } from 'vitest';
import { TYPE_NAMES } from './contribution';
import { parseFormatContent } from '../lib/contentStore';
import { cardsFromPassages, itemRows, itemsCheck, itemsFromSaved, noItems, aiAssisted, parseCsv, parseDraftItems } from './items';
import type { ExamQuestion } from '../types';

const q = (n: number): ExamQuestion => ({ t: 'Rates', q: 'Question ' + n + '?', o: ['A', 'B', 'C', 'D'], a: 1, why: 'Because B.' });

describe('scripted cards from passages', () => {
  const passages = ['Groups above €750m are in scope. The minimum rate is 15%.', 'Hedge 60 to 80% of next year\'s volume through forwards.'];
  it('turns each passage into one card: a short question, the first sentence as the answer', () => {
    const cards = cardsFromPassages(passages);
    expect(cards).toHaveLength(2);
    expect(cards[0][0]).toMatch(/\?$/);
    expect(cards[0][0].length).toBeLessThan(90);
    expect(cards[0][1]).toBe('Groups above €750m are in scope.');
  });
  it('keeps at most 40 cards', () => { expect(cardsFromPassages(Array(60).fill('One fact. Two.'))).toHaveLength(40); });
});

describe('CSV import', () => {
  it('reads front,back lines with quoted fields, skipping a header and blank lines', () => {
    const r = parseCsv('Flash cards', 'front,back\n"What is Pillar Two, in short?","A 15 % minimum tax"\n\nRate,"He said ""yes"""');
    expect(r.problems).toEqual([]);
    expect(r.list).toEqual([['What is Pillar Two, in short?', 'A 15 % minimum tax'], ['Rate', 'He said "yes"']]);
  });
  it('reports bad card lines by line number and keeps the good ones', () => {
    const r = parseCsv('Flash cards', 'a,b\nonly one field\nc,d,e\n"unclosed,x\nf,g');
    expect(r.list).toEqual([['a', 'b'], ['f', 'g']]);
    expect(r.problems.map((p) => p.slice(0, 7))).toEqual(['Line 2:', 'Line 3:', 'Line 4:']);
  });
  it('reads exam lines: topic, question, four options, answer 1 to 4, why', () => {
    const r = parseCsv('Practice exam', 'Rates,Standard rate?,20 %,25 %,29 %,34 %,2,Since 2020.');
    expect(r.problems).toEqual([]);
    expect(r.list).toEqual([{ t: 'Rates', q: 'Standard rate?', o: ['20 %', '25 %', '29 %', '34 %'], a: 1, why: 'Since 2020.' }]);
  });
  it('refuses an exam answer outside 1 to 4 and short lines, naming the line', () => {
    const r = parseCsv('Practice exam', 'T,Q,a,b,c,d,5,why\nT,Q,a,b');
    expect(r.list).toEqual([]);
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toMatch(/^Line 1: .*1 to 4/);
    expect(r.problems[1]).toMatch(/^Line 2:/);
  });
  it('never throws, and says so when nothing was found', () => {
    expect(parseCsv('Flash cards', '').problems).toEqual(['No lines found']);
    expect(() => parseCsv('Practice exam', '\u0000,\n"')).not.toThrow();
  });
  it('stops at the format limit', () => {
    const r = parseCsv('Flash cards', Array.from({ length: 45 }, (_, i) => 'f' + i + ',b').join('\n'));
    expect(r.list).toHaveLength(40);
    expect(r.problems).toEqual(['Only the first 40 cards were kept']);
  });
});

describe('strict AI answers', () => {
  it('reads cards and questions out of the JSON the model returns', () => {
    expect(parseDraftItems('Flash cards', 'Sure: {"cards":[{"front":"F","back":"B"}]}')).toEqual([['F', 'B']]);
    expect(parseDraftItems('Practice exam', '{"questions":[{"t":"T","q":"Q","o":["a","b","c","d"],"a":2,"why":"W"}]}')).toEqual([{ t: 'T', q: 'Q', o: ['a', 'b', 'c', 'd'], a: 2, why: 'W' }]);
  });
  it('rejects anything malformed instead of repairing it', () => {
    ['', 'no json', '{"cards":[]}', '{"cards":[{"front":"F"}]}', '{"cards":[{"front":"F","back":""}]}', '{"cards":"x"}'].forEach((raw) => expect(parseDraftItems('Flash cards', raw)).toBeNull());
    expect(parseDraftItems('Practice exam', '{"questions":[{"t":"T","q":"Q","o":["a","b","c"],"a":0,"why":"W"}]}')).toBeNull();
    expect(parseDraftItems('Practice exam', '{"questions":[{"t":"T","q":"Q","o":["a","b","c","d"],"a":4,"why":"W"}]}')).toBeNull();
  });
});

describe('published content', () => {
  // What private.publish_contribution writes into learnings.content (checked in supabase/tests/rls.sql); it must read back.
  it('a card deck passes parseFormatContent', () => {
    expect(parseFormatContent({ kind: 'flash', total: 2, due: 2, next: '', cards: [['F', 'B'], ['F2', 'B2']] })).not.toBeNull();
  });
  it('an exam passes parseFormatContent with the questions as its bank', () => {
    expect(parseFormatContent({ kind: 'exam', bank: 3, real: 'A peer-written set, reviewed before it was published.', qs: [q(1), q(2), q(3)] })).not.toBeNull();
  });
  it('saved items are re-read strictly: a wrong shape gives none', () => {
    expect(itemsFromSaved('Flash cards', [['F', 'B']])).toEqual([['F', 'B']]);
    expect(itemsFromSaved('Flash cards', [q(1)])).toEqual([]);
    expect(itemsFromSaved('Practice exam', null)).toEqual([]);
  });
  it('shows one row per item for the form and the reviewers', () => {
    expect(itemRows('Flash cards', [['F', 'B']])).toEqual([{ front: 'F', back: 'B' }]);
    expect(itemRows('Practice exam', [q(1)])).toEqual([{ front: 'Question 1?', back: 'Answer: B · Because B.' }]);
  });
});

describe('the checklist line', () => {
  const d = (how: 'ai' | 'scripted' | 'csv' | 'saved' | '', n: number) => ({ ...noItems(), how, list: Array.from({ length: n }, () => ['f', 'b'] as [string, string]) });
  it('says how many cards were drafted from the bundle', () => {
    expect(itemsCheck('Flash cards', d('scripted', 6))).toEqual({ ok: true, text: '6 cards drafted from the bundle · check each one' });
    expect(itemsCheck('Flash cards', d('ai', 1))).toEqual({ ok: true, text: '1 card drafted from the bundle · check each one' });
  });
  it('says imported for a CSV, and asks for items when there are none', () => {
    expect(itemsCheck('Flash cards', d('csv', 3)).text).toBe('3 cards imported from a CSV · check each one');
    expect(itemsCheck('Flash cards', d('', 0))).toEqual({ ok: false, text: 'Generate with AI or import a CSV' });
    expect(itemsCheck('Practice exam', { ...noItems(), how: 'ai', list: [q(1), q(2)] }).text).toBe('2 questions drafted from the bundle · check each one');
  });
});

describe('hardening', () => {
  const long = (n: number) => 'x'.repeat(n);
  it('caps texts: front, question, option and topic at 300, back and why at 600', () => {
    expect(parseDraftItems('Flash cards', JSON.stringify({ cards: [{ front: long(300), back: long(600) }] }))).not.toBeNull();
    expect(parseDraftItems('Flash cards', JSON.stringify({ cards: [{ front: long(301), back: 'b' }] }))).toBeNull();
    expect(parseDraftItems('Flash cards', JSON.stringify({ cards: [{ front: 'f', back: long(601) }] }))).toBeNull();
    const qn = (o: object) => JSON.stringify({ questions: [{ t: 'T', q: 'Q', o: ['a', 'b', 'c', 'd'], a: 0, why: 'W', ...o }] });
    expect(parseDraftItems('Practice exam', qn({ o: ['a', 'b', 'c', long(301)] }))).toBeNull();
    expect(parseDraftItems('Practice exam', qn({ why: long(601) }))).toBeNull();
    expect(parseDraftItems('Practice exam', qn({ t: long(301) }))).toBeNull();
  });
  it('reports CSV lines over the cap by line number', () => {
    const r = parseCsv('Flash cards', 'a,b\n' + long(301) + ',b\nc,' + long(601));
    expect(r.list).toEqual([['a', 'b']]);
    expect(r.problems.map((p) => p.slice(0, 7))).toEqual(['Line 2:', 'Line 3:']);
  });
  it('accepts a quote after leading spaces, strips a BOM before the header and caps the problem list', () => {
    expect(parseCsv('Flash cards', '\uFEFFfront,back\n  "a, b",c').list).toEqual([['a, b', 'c']]);
    const r = parseCsv('Flash cards', Array(15).fill('bad').join('\n'));
    expect(r.problems).toHaveLength(11);
    expect(r.problems[10]).toBe('and 5 more');
  });
  it('rebuilds exam questions with only the known keys, trimmed', () => {
    const out = parseDraftItems('Practice exam', '{"questions":[{"t":" T ","q":"Q","o":["a","b","c","d"],"a":0,"why":"W","extra":1}]}');
    expect(out).toEqual([{ t: 'T', q: 'Q', o: ['a', 'b', 'c', 'd'], a: 0, why: 'W' }]);
  });
  it('skips malformed rows instead of throwing', () => {
    expect(itemRows('Practice exam', [['card', 'in an exam'] as never, q(1)])).toHaveLength(1);
    expect(itemRows('Flash cards', [q(1) as never, ['F', 'B']])).toEqual([{ front: 'F', back: 'B' }]);
  });
  it('derives AI assistance from the outline flag or AI-drafted items', () => {
    const d = (how: 'ai' | 'scripted' | 'csv' | 'manual' | 'saved' | '') => ({ ...noItems(), how });
    expect(aiAssisted({ ai: false, type: 'Flash cards', items: d('ai') })).toBe(true);
    expect(aiAssisted({ ai: false, type: 'Flash cards', items: d('scripted') })).toBe(false);
    expect(aiAssisted({ ai: true, type: 'Flash cards', items: d('scripted') })).toBe(true);
    expect(aiAssisted({ ai: false, type: 'Reel', items: d('ai') })).toBe(false);
  });
});

const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
describe('format lists', () => {
  it('the creation-rule and contribution checks in SQL list every format Create & share offers', () => {
    const sql = Object.entries(migrations).find(([file]) => file.endsWith('_flash_and_exam_contributions.sql'))![1];
    const lists = sql.match(/array\[[^\]]*\]/g) || [];
    expect(lists).toHaveLength(2);
    lists.forEach((l) => TYPE_NAMES.forEach((name) => expect(l).toContain("'" + name + "'")));
    expect(sql.match(/check \(type in \([^)]*\)\)/)![0]).toBe("check (type in (" + TYPE_NAMES.map((n) => "'" + n + "'").join(', ') + "))");
    expect(TYPE_NAMES).toEqual(expect.arrayContaining(['Flash cards', 'Practice exam']));
  });
});
