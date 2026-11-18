// The Game panel's view-model (studios plan, Task 4.3): the learner's game from the catalogue, View as, and what a run is allowed to touch.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from './data';
import { gameView, rowLine } from './fmtGame';
import * as store from './lib/gameStore';
import * as learner from './lib/learnerStore';
import { parseFormatContent } from './lib/contentStore';
import { harness, member, person, stubWindow, withProgress } from './test/harness';
import type { GameContent, Learn } from './types';

vi.mock('./lib/gameStore', () => ({ startRun: vi.fn(async () => 'run-1'), finishRun: vi.fn(async () => {}), leaderboard: vi.fn(async () => []), myBest: vi.fn(async () => null) }));
vi.mock('./lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));
vi.mock('./lib/recordStore', () => ({ decideLearning: vi.fn(async () => 'accepted'), loadQueue: vi.fn(async () => []) }));

const RAW = { kind: 'game', concept: 'You audit a supplier.', win: 'Find four flaws.', rounds: [{ text: 'No VAT.', answer: 'VAT missing' }, { text: 'No date.', answer: 'Date missing' }],
  role: null, leaderboard: 'My team only', files: { 'index.html': '<main></main>', 'game.js': 'GameStudio.ready();' }, made: 'ai' };
const ROW: Learn = ['L969', 'Spot the flaw', 'reg', 2, 'Game', 'Peer contribution', 0.25, 0, '', ''];
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L969 = ROW; LEARN_META.L969 = { line: null, status: 'published', content: parseFormatContent(RAW), aiMade: true }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L969; delete LEARN_META.L969; });
beforeEach(() => { stubWindow(); vi.clearAllMocks(); });

const coach = { id: 'c1', name: 'Sam Coach' };
const learnerGame = () => harness({ subject: person({ name: 'Jan Peeters', counsellor: coach, data: withProgress({}) }), state: { screen: 'detail', detailId: 'L969' } }).vm().det.gm!;

describe('the learner\'s game', () => {
  it('is on the detail page of a Game with content, and not on a seeded Game without', () => {
    expect(learnerGame()).toBeTruthy();
    expect(harness({ subject: person(), state: { screen: 'detail', detailId: 'L7' } }).vm().det.gm).toBeNull();
  });
  it('plays on a real run for this learning, as first name and initial, with the leaderboard of its choice', async () => {
    const gm = learnerGame();
    expect(gm.player).toBe('Jan P.');
    expect(gm.test).toBe(false);
    expect(gm.sub).toContain('My team only leaderboard');
    expect(await gm.start()).toBe('run-1');
    expect(store.startRun).toHaveBeenCalledWith({ learningId: 'L969' });
    await gm.board!();
    expect(store.leaderboard).toHaveBeenCalledWith('L969');
    await gm.finish('run-1', 90);
    expect(store.finishRun).toHaveBeenCalledWith('run-1', 90);
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
  it('names the reflection the counsellor accepts, as for every Game', () => {
    expect(learnerGame().completion).toBe('Log your hours and add your evidence; Sam Coach accepts the game.');
  });
  it('View as plays on no run, shows no best and says so', async () => {
    const gm = harness({ subject: person({ id: 'p2', name: 'Kim Learner', readOnly: true, counsellor: coach, data: withProgress({}) }), access: member('c1'), state: { screen: 'detail', detailId: 'L969' } }).vm().det.gm!;
    expect(gm.note).toBe('Viewing someone else: playing saves nothing');
    expect(await gm.start()).toBeNull();
    expect(store.startRun).not.toHaveBeenCalled();
    expect(gm.best).toBeNull();
  });
});

describe('gameView targets', () => {
  const content = parseFormatContent(RAW) as GameContent;
  const o = { ro: false, learningId: null, contributionId: null, player: 'Player', accepter: 'your counsellor' };
  it('a saved contribution plays on a test run, an unsaved preview on none, and neither has a leaderboard or a best', async () => {
    const saved = gameView(content, { ...o, contributionId: 'c-1' }), preview = gameView(content, o);
    expect(await saved.start()).toBe('run-1');
    expect(store.startRun).toHaveBeenCalledWith({ contributionId: 'c-1' });
    expect(await preview.start()).toBeNull();
    expect([saved.test, preview.test, saved.board, saved.best]).toEqual([true, true, null, null]);
  });
  it('no leaderboard means no board; a game with no AI role says so', () => {
    const v = gameView({ ...content, leaderboard: 'None' }, { ...o, learningId: 'L969' });
    expect(v.board).toBeNull();
    expect(v.sub).toBe('2 rounds · no AI role · no leaderboard · Made with AI');
  });
  it('a row reads name · score · time', () => { expect(rowLine({ rank: 1, name: 'Jan P.', score: 90, seconds: 90 })).toBe('Jan P. · 90 · 1:30'); });
});
