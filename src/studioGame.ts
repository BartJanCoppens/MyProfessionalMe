// Game Studio (studios plan, Task 4.4): its build runner and what its Produce step shows. The four build steps: "Writing the game
// content" checks the rows and writes nothing (no AI); "Building the screens" and "Writing the game logic" have the AI write index.html
// and game.js through the one AI path (use studio_game), each in at most MAX_PARTS parts when an answer is cut, and scan each file
// before it is kept; "Checking against the house rules" saves the game with the draft and asks the `ai` function for the review.
// The verdict is the server's: the browser only names the contribution, and the game item holds {kind, files, for}, never a review
// or a maker. Without the AI use there is no scripted game, and the studio says so.
import type { Logic } from './model';
import type { NewDraft } from './types';
import { latestDraft, sameDraft } from './studioDraft';
import type { BuildCtx, SetNw } from './studioDraft';
import { reviewGame } from './lib/aiStore';
import { loadGameReview } from './lib/gameStore';
import { MAX_PARTS, joinContinuation } from './logic/continuation';
import { GAME_FILE_MAX, scanGameFiles } from './logic/gameScan';
import { gameData, gameOf, reviewBasis, reviewProblem, roleAnswer, shownReview, NO_ROLE } from './logic/gameContent';
import type { GameItem } from './logic/gameContent';
import { logicRequest, screensRequest } from './logic/gamePrompt';
import type { GameBrief } from './logic/gamePrompt';
import { noItems } from './logic/items';
import type { Item } from './logic/items';
import { madeLabel } from './logic/provenance';
import type { BuildRunner } from './logic/studioBuild';
import { itemsValid, stepsOf, studioById } from './logic/studios';
import type { StudioEntry } from './logic/studios';
import { roleOf } from '../supabase/functions/_shared/gameRules.ts';

const USE = 'studio_game';
export type { BuildCtx };
export const NO_AI = 'Game Studio needs AI to build: a System Admin switches on Studio game build';
export const TOO_LONG_SCREENS = 'The screens are too long · try a simpler game';
export const TOO_LONG_LOGIC = 'The game logic is too long · try a simpler game';
export const UNUSABLE = 'AI did not return usable code · retry this step';

const listOf = (nw: NewDraft) => (nw.items?.list ?? []) as StudioEntry[];

// What the build knows of the game: the rows, the answers that steer it and who the AI plays (never what it knows).
export function briefOf(nw: NewDraft): GameBrief {
  const list = listOf(nw), shape = nw.shape ?? {}, kind = roleAnswer(shape);
  return { ...gameData(list), title: nw.title, player: shape['What does the player do?'] ?? 'not chosen', look: nw.produce?.Look ?? 'not chosen', timer: nw.produce?.Timer ?? 'not chosen',
    role: kind === NO_ROLE ? null : { kind, about: roleOf(list)?.about ?? '' } };
}

// One file written in parts: each answer that was cut is continued, at most MAX_PARTS answers, and the file stays within its limit.
async function inParts(L: Logic, name: 'index.html' | 'game.js', ask: (soFar: string) => ReturnType<typeof screensRequest>, tooLong: string): Promise<string> {
  let soFar = '';
  for (let part = 1; part <= MAX_PARTS; part++) {
    const got = await L.viaAi(USE, ask(soFar), (text, cut) => ({ text, cut }));
    if (!got) throw new Error(UNUSABLE);
    soFar = joinContinuation(soFar, got.text);
    if (soFar.length > GAME_FILE_MAX[name]) throw new Error(tooLong);
    if (!got.cut) return soFar;
  }
  throw new Error(tooLong);
}

// The rows, then the built game: the one writer of the game item. A new build starts the review again (the server's hash changes).
function putGame(setNw: SetNw, files: GameItem['files'], role: string) {
  setNw((cur) => {
    const rows = stepsOf(listOf(cur)), game: GameItem = { kind: 'game', files, for: { role } };
    return { items: { ...(cur.items ?? noItems()), list: [...rows, game] as Item[] }, gameReview: null };
  });
}

// How many build steps the draft shows done: none without a built game, the screens, the logic, and the review once this session
// read a passed verdict for these files (the server holds it; a reloaded draft shows the logic done until the review step runs again).
export function gameBuilt(list: StudioEntry[], shape: Record<string, string>, nw?: NewDraft): number {
  const game = gameOf(list);
  if (!game) return 0;
  if (!game.files['game.js']) return 2;
  const review = nw && shownReview({ ...nw, shape, items: { ...(nw.items ?? noItems()), list: list as Item[] } });
  return review?.passed && review.current ? 4 : 3;
}

// Saves the game with the draft, then has the server review it: a passed verdict it already holds for these files is reused.
// Saves the game with the draft, then has the server review it: a passed verdict it already holds for these files is reused. The rows,
// title and answers are read from the newest state when the save runs (L.latest), so what the creator edited during the build is kept.
async function reviewed(ctx: BuildCtx, game: GameItem) {
  let id = '', saved: { list: StudioEntry[]; nw: NewDraft } | null = null;
  const stored = await ctx.withFile(async (i) => {
    id = i;
    const now = latestDraft(ctx.L).nw, list = [...stepsOf(listOf(now)), game] as StudioEntry[];
    saved = { list, nw: now };
    return list as Item[];
  }, 'Saved as draft · the game is stored with it', ctx.nw.items?.how ?? '');
  if (!stored || !saved) throw new Error('The game could not be saved · try again');
  const { list, nw } = saved as { list: StudioEntry[]; nw: NewDraft };
  const held = await loadGameReview(id);
  const status = held?.current && held.passed ? held : { ...(await reviewGame(id)), current: true };
  ctx.setNw({ gameReview: status, gameReviewFor: reviewBasis(nw.title, list, nw.shape ?? {}) });
  if (!status.passed) throw new Error(status.reasons[0] ?? 'The house-rules check did not pass');
}

export function gameRunner(ctx: BuildCtx): BuildRunner {
  const { L, nw } = ctx, def = studioById('game')!, brief = briefOf(nw), role = roleAnswer(nw.shape ?? {});
  const files = { 'index.html': '', 'game.js': '' };
  // What the build writes to the screen goes only to the draft it was started on; once the creator moved on it is kept in `files` and saved to its own draft.
  const setNw: SetNw = (p) => { if (sameDraft(L.state, L.latest().state)) ctx.setNw(p); };
  // The files as the steps leave them; a step run alone (a retry, a reloaded draft) starts from the saved game.
  const have = () => { if (!files['index.html']) Object.assign(files, gameOf(listOf(nw))?.files ?? {}); };
  const steps = [
    async () => { const bad = itemsValid(def, listOf(nw))[0]; if (bad) throw new Error(bad); },
    async () => {
      if (!L.aiCan(USE)) throw new Error(NO_AI);
      const html = await inParts(L, 'index.html', (soFar) => screensRequest(brief, soFar), TOO_LONG_SCREENS);
      const bad = scanGameFiles({ 'index.html': html })[0];
      if (bad) throw new Error(bad);
      files['index.html'] = html; files['game.js'] = '';
      putGame(setNw, { ...files }, role);
    },
    async () => {
      have();
      if (!L.aiCan(USE)) throw new Error(NO_AI);
      const js = await inParts(L, 'game.js', (soFar) => logicRequest(brief, files['index.html'], soFar), TOO_LONG_LOGIC);
      const bad = scanGameFiles({ 'index.html': files['index.html'], 'game.js': js })[0];
      if (bad) throw new Error(bad);
      files['game.js'] = js;
      putGame(setNw, { ...files }, role);
    },
    async () => {
      // The review runs on the server: inside Claude Design alone there is no connection to run it on.
      const live = L.aiOpts();
      if (!live.enabled || !live.live.includes(USE)) throw new Error(NO_AI);
      have();
      if (!files['game.js']) throw new Error('Write the game logic first');
      await reviewed({ ...ctx, setNw }, { kind: 'game', files: { ...files }, for: { role } });
    },
  ];
  return async (_name, index) => {
    if (L.readOnly()) throw new Error('Only the creator can build it');
    await steps[index]();
  };
}

// The Produce step's part for the game: who made the code, why it cannot be built, what the server said of the review, and building again.
export function gameProduce(L: Logic, nw: NewDraft, setNw: SetNw) {
  const built = !!gameOf(listOf(nw)), review = shownReview(nw), problem = review === undefined ? '' : reviewProblem(review)[0] ?? '';
  return {
    // problem: what is wrong with the verdict ('' when passed or not known), the one reading the Produce line and the preview note share.
    problem, made: built ? madeLabel('ai') : '', note: L.aiCan(USE) ? '' : NO_AI, review: review === undefined ? '' : problem || 'The house-rules check passed on this version',
    restart: () => setNw((cur) => ({ items: { ...(cur.items ?? noItems()), list: stepsOf(listOf(cur)) as Item[] }, build: undefined, gameReview: undefined, gameReviewFor: undefined })),
  };
}
