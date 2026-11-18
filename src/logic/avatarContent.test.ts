// The Avatar format (studios plan, Task 6.1) as content: its rows (the five character rows, 1 to 4 learning points, three quiz rows), what they
// publish as (avatarContent = private.avatar_content, never what the character reveals or hides), the problems the check gate reports
// (avatarProblems = the Avatar part of private.contribution_problems) and the SQL that repeats them (20261118190000_avatar_format.sql).
import { describe, expect, it } from 'vitest';
import { CHARACTER_LABELS, DIFFICULTIES, LANGUAGES, RUN_MINUTES, SCORINGS } from '../../supabase/functions/_shared/avatarRules.ts';
import { parseFormatContent } from '../lib/contentStore';
import { migrationText } from '../test/migrations';
import { studioById, itemsValid } from './studios';
import type { StudioItem } from './studios';
import { ECHO_MIN, ECHO_WINDOW } from './textEcho';
import { TO_WRITE } from '../../supabase/functions/_shared/avatarRules.ts';
import { BAD_LOOK, avatarChecks, avatarContent, avatarProblems, avatarRows, quizOf } from './avatarContent';
import type { StockLook } from './stockLooks';
import type { StockVoice } from './ai';

const def = studioById('avatar')!;
const ROWS = def.items as StudioItem[];
const LOOK: StockLook = { id: 'l1', name: 'HR director · 50s', portrait: 'p1', color: '#2f7fc1', licence: 'x', active: true };
const OFF: StockLook = { id: 'l2', name: 'Off · 60s', portrait: 'p2', color: '#112233', licence: 'x', active: false };
const VOICE: StockVoice = { id: 'v1', name: 'Narrator · warm, 40s', voice_id: 'tVoiceWarm01', language: 'en', accent: null, active: true };
const VOICE_OFF: StockVoice = { ...VOICE, id: 'v2', active: false };
const SHAPE = { 'Who does the learner talk to?': 'A colleague or junior', 'How is it scored?': 'AI scores, counsellor confirms', 'How long is a run?': '10 minutes', Language: 'Dutch', Difficulty: 'Tough', Look: 'l1', Voice: 'v1' };
const problems = (items: StudioItem[] = ROWS, shape: Record<string, string> = SHAPE) => avatarProblems(items, shape, [LOOK, OFF], [VOICE, VOICE_OFF]);
const without = (...labels: string[]) => ROWS.filter((r) => !labels.includes(r[0]));
const swap = (label: string, text: string, k = 1) => ROWS.map((r): StudioItem => (r[0] === label ? ((k === 1 ? [r[0], text, ...r.slice(2)] : [r[0], r[1], text]) as StudioItem) : r));

describe('the content of an avatar', () => {
  it('gives the character, the weighted learning points, the quiz right-first, the look and voice and the run', () => {
    const c = avatarContent(ROWS, SHAPE, [LOOK, OFF], [VOICE, VOICE_OFF])!;
    expect(c.points).toEqual([{ id: 'lp-1', text: 'Asks about her concerns before defending the numbers', weight: 30 }, { id: 'lp-2', text: 'Links the case to her goals, not to IT savings', weight: 40 },
      { id: 'lp-3', text: 'Agrees a concrete next step before time runs out', weight: 30 }]);
    expect(c.quiz).toHaveLength(3);
    expect(c).toMatchObject({ kind: 'avatar', persona: ROWS[0][1], situation: ROWS[1][1], opening: ROWS[2][1], language: 'Dutch', difficulty: 'Tough', minutes: 10, scoring: 'AI scores, counsellor confirms',
      counterpart: 'A colleague or junior', made: 'ai', look: { id: 'l1', name: 'HR director · 50s', portrait: 'p1', color: '#2f7fc1' }, voice: { id: 'v1', name: 'Narrator · warm, 40s' } });
    expect(parseFormatContent(c)).toEqual(c);
  });
  it('never holds what the character reveals or hides', () => {
    const text = JSON.stringify(avatarContent(ROWS, SHAPE, [LOOK], [VOICE]));
    expect(text).not.toContain('payroll vendor contract');
    expect(text).not.toContain('works-council members');
  });
  it('leaves out a look or voice that is not an active stock one, and is null without the character, a learning point or the quiz', () => {
    expect(avatarContent(ROWS, { ...SHAPE, Look: 'l2', Voice: 'v2' }, [LOOK, OFF], [VOICE, VOICE_OFF])).toMatchObject({ look: null, voice: null });
    expect(avatarContent(without('Persona'), SHAPE, [LOOK], [VOICE])).toBeNull();
    expect(avatarContent(without('Learning point · 30 %', 'Learning point · 40 %'), SHAPE, [LOOK], [VOICE])).toBeNull();
    expect(avatarContent(without('Quiz 3'), SHAPE, [LOOK], [VOICE])).toBeNull();
  });
  it('reads quizOf as the questions the seeded avatars have, the right option first', () => {
    const c = avatarContent(ROWS, SHAPE, [LOOK], [VOICE])!;
    expect(quizOf(c)).toEqual([{ q: ROWS[8][1], opts: ['Ask which assumption worries her most', 'Defend the numbers again', 'Offer a discount'], a: 0 }, expect.objectContaining({ a: 0 }), expect.objectContaining({ a: 0 })]);
  });
});

describe('the problems with an avatar', () => {
  it('has none for the design example with an active look and voice, and the example is valid for the studio', () => {
    expect(problems()).toEqual([]);
    expect(itemsValid(def, def.items)).toEqual([]);
  });
  it('asks for the character, the learning points and the quiz in the rows', () => {
    expect(problems(without('Hides unless probed'))).toEqual(['Add the character: Persona, Situation, Opening line, Reveals if asked and Hides unless probed']);
    expect(problems(without('Quiz 3'))).toEqual(['Add the three quiz questions: each with 2 to 4 options, the right one first']);
    expect(problems(swap('Quiz 2', 'only one', 2))).toEqual(['Add the three quiz questions: each with 2 to 4 options, the right one first']);
    expect(problems(without('Learning point · 30 %', 'Learning point · 40 %'))[0]).toBe('Add 1 to 4 learning points, each as “Learning point · N %”');
  });
  it('reports weights that do not add up to 100 with their sum', () => {
    expect(problems(ROWS.map((r): StudioItem => (r[0] === 'Learning point · 30 %' && r[1].startsWith('Agrees') ? ['Learning point · 20 %', r[1]] : r)))).toEqual(['Learning point weights add up to 90 %, not 100 %']);
  });
  it('refuses a label that is not a character row, a learning point or a quiz row, and a repeated character row', () => {
    expect(avatarRows([...ROWS, ['Note', 'x']])).toEqual(['Note: use a character row, “Learning point · N %” or Quiz 1 to 3 as the label']);
    expect(avatarRows([...ROWS, ['Persona', 'again']])).toEqual(['Persona: use each character row once']);
  });
  it('refuses an unedited "To write:" placeholder in Reveals or Hides, by its label', () => {
    const swapRow = (label: string, text: string) => ROWS.map((r): StudioItem => (r[0] === label ? [label, text] : r));
    expect(avatarRows(swapRow('Reveals if asked', TO_WRITE['Reveals if asked']))).toEqual(['Reveals if asked: write it, this is still the placeholder']);
    expect(avatarRows(swapRow('Hides unless probed', '  ' + TO_WRITE['Hides unless probed'] + ' '))).toEqual(['Hides unless probed: write it, this is still the placeholder']);
    expect(avatarRows(swapRow('Hides unless probed', TO_WRITE['Hides unless probed'] + ', and the budget is frozen'))).toEqual([]);
  });
  it('asks to choose the run, the language, the difficulty, how it is scored and a look', () => {
    expect(problems(ROWS, {})).toEqual(['Choose how long a run is', 'Choose the language', 'Choose the difficulty', 'Choose how it is scored', 'Choose a look in Produce']);
    expect(problems(ROWS, { ...SHAPE, 'How is it scored?': 'Self-assessment' })).toEqual(['Choose how it is scored']);
  });
  it('refuses a look or voice that is not on the active stock list; a voice is optional', () => {
    expect(problems(ROWS, { ...SHAPE, Look: 'l2' })).toEqual([BAD_LOOK]);
    expect(problems(ROWS, { ...SHAPE, Look: 'nope' })).toEqual([BAD_LOOK]);
    expect(problems(ROWS, { ...SHAPE, Voice: 'v2' })).toEqual(['That voice is not on the stock list']);
    const { Voice: _v, ...noVoice } = SHAPE;
    expect(problems(ROWS, noVoice)).toEqual([]);
  });
  it('does not judge the stock lists while they are not loaded', () => {
    expect(avatarProblems(ROWS, { ...SHAPE, Look: 'zz', Voice: 'zz' }, null, null)).toEqual([]);
  });
  const ECHO = "The scenario's public text repeats what the character keeps back";
  it('refuses public text that repeats what the character keeps back, case-insensitively, from 12 characters', () => {
    expect(problems(swap('Situation', 'Two works-council members already oppose it.'))).toEqual([ECHO]);
    expect(problems(swap('Opening line', 'THE CURRENT PAYROLL VENDOR is a worry.'))).toEqual([ECHO]);
    expect(problems(swap('Learning point · 40 %', 'Do not mention that the vendor contract ends in 14 months'))).toEqual([ECHO]);
    expect(problems(swap('Quiz 1', 'Does the payroll vendor contract end soon?'))).toEqual([ECHO]);
    expect(problems(ROWS.map((r): StudioItem => (r[0] === 'Quiz 1' ? ['Quiz 1', 'q?', 'Say the vendor contract ends in 14 months · No'] : r)))).toEqual([ECHO]);
    expect(problems(ROWS, { ...SHAPE, 'Who does the learner talk to?': 'Someone whose works-council members already oppose' })).toEqual([ECHO]);
  });
  it('lets 23 shared characters pass and fails 24, in any case (the window edge)', () => {
    expect(problems(swap('Situation', 'She fears TWO WORKS-COUNCIL MEMBE.'))).toEqual([]);
    expect(problems(swap('Situation', 'She fears TWO WORKS-COUNCIL MEMBER.'))).toEqual([ECHO]);
  });
  it('lets a short overlap pass and does not read the two hidden rows against themselves', () => {
    expect(problems(swap('Situation', 'She has ten minutes to hear the plan.'))).toEqual([]);
    expect(problems(swap('Hides unless probed', 'The payroll vendor contract is the thing nobody says.'))).toEqual([]);
  });
  it('lists the two checks the studio shows: the weights and the quiz', () => {
    expect(avatarChecks(ROWS).map((c) => c.ok)).toEqual([true, true]);
    expect(avatarChecks(without('Quiz 3')).map((c) => c.ok)).toEqual([true, false]);
  });
});

describe('the SQL that repeats these rules (20261118190000_avatar_format.sql)', () => {
  const sql = migrationText('20261118190000_avatar_format.sql');
  it('has the cap, the five labels, the run, the scorings, the languages and the difficulties', () => {
    expect(sql).toContain("private.item_max('Avatar')");
    for (const l of CHARACTER_LABELS) expect(sql).toContain("'" + l + "'");
    for (const m of RUN_MINUTES) expect(sql).toContain("'" + m + " minutes'");
    for (const s of SCORINGS) expect(sql).toContain("'" + s + "'");
    for (const l of Object.keys(LANGUAGES)) expect(sql).toContain("'" + l + "'");
    for (const d of DIFFICULTIES) expect(sql).toContain("'" + d + "'");
    expect(sql).toContain('between 1 and 4');
    expect(sql).toContain("'Quiz 1', 'Quiz 2', 'Quiz 3'");
  });
  it('has every problem text', () => {
    for (const t of ['Add the character: Persona, Situation, Opening line, Reveals if asked and Hides unless probed', 'Learning point weights add up to %s %%, not 100 %%',
      'Add the three quiz questions: each with 2 to 4 options, the right one first', 'Choose how long a run is', 'Choose the language', 'Choose the difficulty', 'Choose how it is scored',
      'Choose a look in Produce', BAD_LOOK, 'That voice is not on the stock list', "The scenario''s public text repeats what the character keeps back",
      'Add 1 to 4 learning points, each as “Learning point · N %”', ': use each character row once', 'use a character row, “Learning point · N %” or Quiz 1 to 3 as the label']) expect(sql).toContain(t);
  });
  it('has the two placeholder texts and the placeholder problem', () => {
    for (const t of Object.values(TO_WRITE)) expect(sql).toContain("'" + t + "'");
    expect(sql).toContain(': write it, this is still the placeholder');
  });
  it('has the one echo helper with the same constants as textEcho.ts, and avatar_echo calls it', () => {
    const fn = /create function private\.text_echoes\([\s\S]*?\n\$\$;/.exec(sql)![0];
    expect(fn).toContain('>= ' + ECHO_MIN);
    expect(fn).toContain('least(' + ECHO_WINDOW + ',');
    expect(fn).toMatch(/lower\(/);
    expect(/create function private\.avatar_echo\([\s\S]*?\n\$\$;/.exec(sql)![0]).toContain('private.text_echoes(');
  });
  it('has the Game calling the same helper in whole mode', () => {
    expect(sql).toContain("private.text_echoes(v_knows, v_game -> 'files' ->> 'index.html', true)");
  });
  it('gives no table, policy or grant, and never selects what the character reveals or hides into the content', () => {
    expect(sql).not.toMatch(/create table|create policy|grant /i);
    const content = /create function private\.avatar_content\([\s\S]*?\n\$\$;/.exec(sql)![0];
    expect(content).not.toContain('Reveals if asked');
    expect(content).not.toContain('Hides unless probed');
  });
});
