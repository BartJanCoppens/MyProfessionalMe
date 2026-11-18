// The Game format (studios plan, Task 4.2): a game's rows (one Concept, the Rounds, at most one AI role) and, after them, the
// one built game item {kind, files, for, review, made}: its two files, the AI role answer it was built for, the house-rules
// review of this build (null until it ran) and who made it. The database repeats these rules (private.game_item_ok,
// private.game_ok, private.game_content and the Game part of private.contribution_problems).
import { roleOf, GAME_ROLES, ROLE_LABEL } from '../../supabase/functions/_shared/gameRules.ts';
import type { GameContent, GameData } from '../types';
import { FILE_NAMES, GAME_FILE_MAX, scanGameFiles } from './gameScan';
import { stepsOf } from './studioRows';
import type { StudioEntry } from './studios';

export const ROLE_QUESTION = 'Does the AI play a role?';
export const NO_ROLE = 'No AI role';
export const ROLES: string[] = [...GAME_ROLES, NO_ROLE];
export const LEADERBOARD_QUESTION = 'Leaderboard?';
export const LEADERBOARDS: GameContent['leaderboard'][] = ['Firm-wide', 'My team only', 'None'];
export const REASONS_MAX = 10, REASON_MAX = 300;
export const BUILD_FIRST = 'Build the game in Produce first';
export const ROLE_MISSING = 'Add the AI role: who it plays and what it knows';
export const ROLE_UNUSED = 'Remove the AI role row, or choose a role in Shape it';
export const ROLE_CHANGED = 'You changed the AI role after the build · build the game again';
export const ECHOED = "The game's code repeats what the AI role hides";
export const ECHOED_TEXT = "The game's text repeats what the AI role hides";
export const GAME_LAST = 'The built game must come after the rows · build the game again';
export const NOT_PASSED = 'The house-rules check has not passed';
// A hidden text shorter than this is too common to look for in the code.
const ECHO_MIN = 12;

export type GameReview = { passed: boolean; reasons: string[] };
export type GameItem = { kind: 'game'; files: { 'index.html': string; 'game.js': string }; for: { role: string }; review: GameReview | null; made: 'ai' };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keysAre = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).length === keys.length && keys.every((k) => k in x);
const isReview = (r: unknown): r is GameReview => isObject(r) && keysAre(r, ['passed', 'reasons']) && typeof r.passed === 'boolean'
  && Array.isArray(r.reasons) && r.reasons.length <= REASONS_MAX && r.reasons.every((x) => typeof x === 'string' && x.length <= REASON_MAX);

export function isGameItem(v: unknown): v is GameItem {
  if (!isObject(v) || !keysAre(v, ['kind', 'files', 'for', 'review', 'made']) || v.kind !== 'game' || v.made !== 'ai') return false;
  const { files, for: built } = v;
  return isObject(files) && keysAre(files, FILE_NAMES) && FILE_NAMES.every((n) => typeof files[n] === 'string' && (files[n] as string).length <= GAME_FILE_MAX[n])
    && isObject(built) && keysAre(built, ['role']) && typeof built.role === 'string' && ROLES.includes(built.role) && (v.review === null || isReview(v.review));
}
export const gameOf = (items: readonly unknown[]): GameItem | null => (items.find(isGameItem) as GameItem | undefined) ?? null;

const rowsOf = (items: StudioEntry[]) => stepsOf(items).map((i) => ({ label: i[0], text: i[1].trim(), text2: (i[2] ?? '').trim() }));
const ROUND = /^Round \d+$/;
/** What getData() gives the game: the Concept's setup and win condition and each Round's text and answer. */
export function gameData(items: StudioEntry[]): GameData {
  const rows = rowsOf(items), concept = rows.find((r) => r.label === 'Concept');
  return { concept: concept?.text ?? '', win: concept?.text2 ?? '', rounds: rows.filter((r) => ROUND.test(r.label)).map((r) => ({ text: r.text, answer: r.text2 })) };
}

// The role answer in "Shape it": one of the three roles, else none.
export const roleAnswer = (shape: Record<string, string>) => (ROLES.includes(shape[ROLE_QUESTION]) ? shape[ROLE_QUESTION] : NO_ROLE);

/** What a game publishes as; none until the game is built. The role's second text, what it knows, is never copied. */
export function gameContent(items: StudioEntry[], shape: Record<string, string>): GameContent | null {
  const game = gameOf(items), answer = roleAnswer(shape);
  if (!game) return null;
  return { kind: 'game', ...gameData(items), made: 'ai', files: game.files,
    role: answer === NO_ROLE ? null : { kind: answer as NonNullable<GameContent['role']>['kind'], about: roleOf(items)?.about ?? '' },
    leaderboard: LEADERBOARDS.includes(shape[LEADERBOARD_QUESTION] as GameContent['leaderboard']) ? shape[LEADERBOARD_QUESTION] as GameContent['leaderboard'] : LEADERBOARDS[0] };
}

// Case-insensitive containment. JavaScript's toLowerCase and Postgres' lower() can differ for a few Unicode letters (decisions.md).
const hasIn = (text: string, part: string) => text.toLowerCase().includes(part.toLowerCase());

/** What stops a game being sent (the Game part of private.contribution_problems, in the same order and words). */
export function gameProblems(items: StudioEntry[], shape: Record<string, string>): string[] {
  const game = gameOf(items), answer = roleAnswer(shape), role = roleOf(items);
  const roleRow = answer !== NO_ROLE && !role ? [ROLE_MISSING] : answer === NO_ROLE && role ? [ROLE_UNUSED] : [];
  if (!game) return [...roleRow, BUILD_FIRST];
  const misplaced = items.indexOf(game) < items.findLastIndex((i) => Array.isArray(i));
  const echoed = !!role && role.knows.length >= ECHO_MIN && Object.values(game.files).some((text) => hasIn(text, role.knows));
  // The published texts (concept, win, rounds, who the AI plays) must not carry it either; the role's own text 2 is the one place it lives.
  const leaked = !!role && role.knows.length >= ECHO_MIN && rowsOf(items).some((r) => hasIn(r.text, role.knows) || (r.label !== ROLE_LABEL && hasIn(r.text2, role.knows)));
  return [...(misplaced ? [GAME_LAST] : []), ...roleRow, ...scanGameFiles(game.files),
    ...(game.review?.passed ? [] : [NOT_PASSED + (game.review?.reasons[0] ? ': ' + game.review.reasons[0] : '')]),
    ...(game.for.role === answer ? [] : [ROLE_CHANGED]), ...(echoed ? [ECHOED] : []), ...(leaked ? [ECHOED_TEXT] : [])];
}
