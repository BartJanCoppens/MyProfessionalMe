// The Game format (studios plan, Task 4.2) as content: its rows (a Concept, the Rounds, at most one AI role) and the built
// game after them, what they publish as (gameContent = private.game_content), the problems the check gate reports
// (gameProblems = the Game part of private.contribution_problems) and the strict reading of a stored game.
import { describe, expect, it } from 'vitest';
import { roleOf, GAME_ROLES } from '../../supabase/functions/_shared/gameRules.ts';
import { parseFormatContent } from '../lib/contentStore';
import { STUDIOS } from '../studioData';
import type { GameItem, GameReviewStatus } from './gameContent';
import { LEADERBOARD_QUESTION, NO_ROLE, ROLE_QUESTION, gameContent, gameData, gameOf, gameProblems, isGameItem, reviewBasis } from './gameContent';
import { itemRows, itemsFromSaved, itemsText } from './items';
import { studioContent, outputProblems } from './studioContent';
import { scriptedItems, studioRequest } from './studioItems';
import { itemsValid, questionsOf, stepsOf, studioById } from './studios';
import type { StudioEntry, StudioItem } from './studios';

const def = studioById('game')!;
const ROWS = def.items as StudioItem[];
const SECRET = 'the supplier is the CFO’s brother';
const ROLE_ROW: StudioItem = ['AI role', 'The supplier’s manager, defensive and in a hurry.', SECRET];
const files = { 'index.html': '<main id="app"></main>', 'game.js': 'GameStudio.ready();' };
const item = (over: Partial<GameItem> = {}): GameItem => ({ kind: 'game', files, for: { role: NO_ROLE }, ...over });
const PASSED: GameReviewStatus = { passed: true, reasons: [], current: true };
const SHAPE = { [ROLE_QUESTION]: NO_ROLE, [LEADERBOARD_QUESTION]: 'My team only' };
const WITH_ROLE = { ...SHAPE, [ROLE_QUESTION]: 'Suspect to question' };
const problems = (items: StudioEntry[], shape: Record<string, string> = SHAPE) => gameProblems(items, shape).join(' | ');

describe('the rows of a Game', () => {
  it('are one Concept first, at least 2 Rounds and at most one AI role, nothing else', () => {
    expect(itemsValid(def, [...ROWS, ROLE_ROW])).toEqual([]);
    expect(itemsValid(def, [...ROWS, ROLE_ROW, ROLE_ROW]).join(' ')).toMatch(/at most one AI role/);
    expect(itemsValid(def, [...ROWS, ['Twist', 'x', 'y']]).join(' ')).toMatch(/Twist: use Concept, Round 1, Round 2 or AI role/);
    expect(itemsValid(def, ROWS.slice(0, 2)).join(' ')).toMatch(/Round/);
  });
  it('leave the last place of the items for the built game', () => {
    const rows: StudioItem[] = [ROWS[0], ...Array.from({ length: 9 }, (_, k): StudioItem => ['Round ' + (k + 1), 'a', 'b'])];
    expect(itemsValid(def, rows).join(' ')).toMatch(/at most 9 rows/);
    expect(itemsValid(def, rows.slice(0, 9))).toEqual([]);
  });
  it('are not mistaken for questions or rows when the built game is among the items', () => {
    const all: StudioEntry[] = [...ROWS, item()];
    expect(stepsOf(all)).toHaveLength(ROWS.length);
    expect(questionsOf(all)).toEqual([]);
    expect(itemsValid(def, all)).toEqual([]);
  });
});

describe('the built game', () => {
  it('is read strictly: exact keys (kind, files, for), the two files, a role answer; a client-sent review or made is refused', () => {
    expect(isGameItem(item())).toBe(true);
    for (const bad of [{ ...item(), extra: 1 }, { ...item(), made: 'ai' }, { ...item(), review: null }, { ...item(), review: { passed: true, reasons: [] } },
      item({ for: { role: 'Judge' } }), item({ files: { 'index.html': 'x', 'style.css': 'y' } as never }),
      item({ files: { 'index.html': 'x'.repeat(16001), 'game.js': '' } }), item({ files: { 'index.html': 'x', 'game.js': 'y'.repeat(32001) } }), null, [], 'game']) {
      expect(isGameItem(bad)).toBe(false);
    }
    expect(gameOf([...ROWS, item()])).toEqual(item());
    expect(gameOf(ROWS)).toBeNull();
  });
  it('survives a reload of a saved draft, and is shown as one line for reviewers and scanned for client names', () => {
    const all = [...ROWS, item()];
    expect(itemsFromSaved('Game', all)).toEqual(all);
    expect(itemRows('Game', all as never).at(-1)).toEqual({ front: 'Game · built by AI', back: 'Screens and logic written' });
    expect(itemRows('Game', [...ROWS, item({ files: { ...files, 'game.js': '' } })] as never).at(-1)!.back).toBe('Screens only · logic to write');
    expect(itemsText(all as never)).toEqual(expect.arrayContaining([files['index.html'], files['game.js']]));
  });
});

describe('what a Game publishes as', () => {
  const content = gameContent([...ROWS, ROLE_ROW, item({ for: { role: 'Suspect to question' } })], WITH_ROLE);
  it('is the concept, the win, each round with its answer, the role, the leaderboard and the two files', () => {
    expect(content).toEqual({ kind: 'game', made: 'ai', leaderboard: 'My team only', files,
      concept: 'You audit a supplier suspected of a fake-invoice scheme. Every invoice hides one flaw.', win: 'Win: find four flaws before the supplier’s manager leaves',
      rounds: [{ text: 'Invoice 2026-031 shows the supplier’s name and address, but no VAT number.', answer: 'Supplier VAT number missing' },
        { text: 'Invoice 2026-032 carries the delivery date but no invoice date.', answer: 'Invoice date missing' }, { text: 'Two invoices carry the same number, 2026-033.', answer: 'Invoice number not unique' },
        { text: 'A book is invoiced at 21 % VAT.', answer: 'Wrong rate: books are taxed at 6 %' }],
      role: { kind: 'Suspect to question', about: 'The supplier’s manager, defensive and in a hurry.' } });
  });
  it('never carries what the AI role knows', () => {
    expect(JSON.stringify(content)).not.toContain(SECRET);
    expect(content && 'knows' in (content.role ?? {})).toBe(false);
  });
  it('is stale on screen, as on the server, when only what the AI role knows or the takeaway changes (reviewBasis)', () => {
    const all = [...ROWS, ROLE_ROW, item({ for: { role: 'Suspect to question' } })] as StudioEntry[], basis = (items: StudioEntry[], take = 'Spot the flaw.') => reviewBasis('T', items, WITH_ROLE, take);
    expect(basis(all)).toBe(basis([...all]));
    expect(basis([...ROWS, ['AI role', ROLE_ROW[1], 'another secret text'], all[all.length - 1]] as StudioEntry[])).not.toBe(basis(all));
    expect(basis(all, 'Another takeaway.')).not.toBe(basis(all));
    expect(JSON.parse(basis(all))).toEqual(expect.arrayContaining([SECRET, 'Spot the flaw.']));
  });
  it('is what getData gives the game, and is read back by the library', () => {
    expect(gameData([...ROWS])).toEqual({ concept: content!.concept, win: content!.win, rounds: content!.rounds });
    expect(parseFormatContent(JSON.parse(JSON.stringify(content)))).toEqual(content);
    expect(studioContent('Game', [...ROWS, item()], SHAPE)).toMatchObject({ kind: 'game', role: null, leaderboard: 'My team only' });
  });
  it('is none until the game is built; no role without a role answer; Firm-wide when the leaderboard is unanswered', () => {
    expect(gameContent(ROWS, SHAPE)).toBeNull();
    expect(gameContent([...ROWS, ROLE_ROW, item()], SHAPE)!.role).toBeNull();
    expect(gameContent([...ROWS, item()], {})!.leaderboard).toBe('Firm-wide');
  });
  it('is refused by the library when malformed', () => {
    for (const bad of [{ ...content, made: 'scripted' }, { ...content, rounds: [] }, { ...content, leaderboard: 'Everyone' }, { ...content, role: { kind: 'Judge', about: 'x' } },
      { ...content, files: { 'index.html': 'x' } }, { ...content, concept: ' ' }]) expect(parseFormatContent(bad)).toBeNull();
  });
});

describe('what the check gate reports for a Game (gameProblems)', () => {
  const ALL: StudioEntry[] = [...ROWS, item()];
  it('is nothing for a built game that passed, with no role', () => expect(gameProblems(ALL, SHAPE, PASSED)).toEqual([]));
  it('asks to build the game first', () => expect(problems(ROWS)).toBe('Build the game in Produce first'));
  it('reports the scan problems verbatim', () => {
    expect(problems([...ROWS, item({ files: { ...files, 'game.js': 'fetch("x")' } })])).toBe('game.js contacts another website (fetch()');
  });
  it('wants the server\'s passed review of these files, and says why when it has not passed or is out of date', () => {
    const say = (r: GameReviewStatus | null | undefined) => gameProblems(ALL, SHAPE, r).join(' | ');
    expect(say(null)).toBe('The house-rules check has not passed');
    expect(say({ passed: false, reasons: ['No way to lose', 'x'], current: true })).toBe('The house-rules check has not passed: No way to lose');
    expect(say({ passed: true, reasons: [], current: false })).toBe('Run the house-rules check again');
    expect(say({ passed: false, reasons: ['No way to lose'], current: false })).toBe('Run the house-rules check again');
    expect(say(PASSED)).toBe('');
    expect(say(undefined)).toBe(''); // not known in this session: the server's check reads it
  });
  it('wants the role chosen now to be the role the game was built for', () => {
    expect(problems([...ROWS, ROLE_ROW, item({ for: { role: 'Opponent' } })], WITH_ROLE)).toBe('You changed the AI role after the build · build the game again');
  });
  it('wants an AI role row exactly when a role is chosen', () => {
    expect(problems([...ROWS, item({ for: { role: 'Suspect to question' } })], WITH_ROLE)).toBe('Add the AI role: who it plays and what it knows');
    expect(problems([...ROWS, ROLE_ROW, item()])).toBe('Remove the AI role row, or choose a role in Shape it');
  });
  it('refuses code that repeats what the AI role hides (12 characters or more, any case)', () => {
    const built = (js: string) => [...ROWS, ROLE_ROW, item({ for: { role: 'Suspect to question' }, files: { ...files, 'game.js': js } })];
    expect(problems(built('const s = "THE SUPPLIER IS THE CFO’S BROTHER";'), WITH_ROLE)).toBe("The game's code repeats what the AI role hides");
    expect(problems(built('const s = "innocent";'), WITH_ROLE)).toBe('');
    const short: StudioItem = ['AI role', 'A manager.', 'a short one'];
    expect(problems([...ROWS, short, item({ for: { role: 'Opponent' }, files: { ...files, 'game.js': 'a short one' } })], { ...SHAPE, [ROLE_QUESTION]: 'Opponent' })).toBe('');
  });
  it('refuses text that repeats what the AI role hides in the rounds, the concept or the role itself', () => {
    const leak = (rows: StudioItem[]) => problems([...rows, ROLE_ROW, item({ for: { role: 'Suspect to question' } })], WITH_ROLE);
    const ECHO = 'The game\'s text repeats what the AI role hides';
    expect(leak([ROWS[0], ['Round 1', 'Ask: ' + SECRET.toUpperCase(), 'x'], ROWS[2]])).toBe(ECHO);
    expect(leak([ROWS[0], ROWS[1], ['Round 2', 'x', 'so ' + SECRET]])).toBe(ECHO);
    expect(leak([['Concept', SECRET + '!', 'win'], ROWS[1], ROWS[2]])).toBe(ECHO);
    expect(problems([...ROWS, ['AI role', 'Plays: ' + SECRET, SECRET], item({ for: { role: 'Suspect to question' } })], WITH_ROLE)).toBe(ECHO);
    expect(leak(ROWS)).toBe('');
  });
  it('wants the built game after the rows', () => {
    expect(problems([item(), ...ROWS])).toBe('The built game must come after the rows · build the game again');
    expect(gameProblems([...ROWS, item()], SHAPE, PASSED)).toEqual([]);
  });
  it('is the Produce problem list of a Game studio piece', () => expect(outputProblems(def, ROWS, SHAPE, true, null)).toEqual(['Build the game in Produce first']));
});

describe('the AI role row', () => {
  it('is read by one function: who it plays and what it knows, trimmed; none without the row', () => {
    expect(roleOf([...ROWS, [' AI role'.trim(), ' who ', ' secret ']])).toEqual({ about: 'who', knows: 'secret' });
    expect(roleOf([...ROWS, ['AI role', 'who']])).toEqual({ about: 'who', knows: '' });
    expect(roleOf(ROWS)).toBeNull();
    expect(GAME_ROLES).toEqual(['Game master', 'Opponent', 'Suspect to question']);
    expect(def.qs.find((q) => q[0] === ROLE_QUESTION)![1]).toEqual([...GAME_ROLES, NO_ROLE]);
    expect(def.qs.find((q) => q[0] === LEADERBOARD_QUESTION)![1]).toEqual(['Firm-wide', 'My team only', 'None']);
  });
  it('is named in the layout the AI is asked for, so a drafted game has it', () => {
    const nw = { title: 't', take: 'x', shape: { [ROLE_QUESTION]: 'Opponent' }, produce: {} } as never;
    expect(studioRequest(def, nw, ['a passage']).messages[0].content).toContain('AI role');
    expect(scriptedItems(def, nw, ['A passage.'])).toBeNull();
    expect(STUDIOS.find((s) => s.id === 'game')!.available).toBe(true);
  });
});
