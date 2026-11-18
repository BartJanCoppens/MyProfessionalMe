// @vitest-environment jsdom
// Game Studio (studios plan, Task 4.4) through the shared spine: the four build steps with a real runner (the rows checked with no AI,
// index.html and game.js written in parts through the one AI path and scanned, the game saved and its house-rules review asked of the
// server). The verdict is the server's: the browser only names the contribution, and reads the answer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as aiStore from './lib/aiStore';
import * as store from './lib/contributionStore';
import * as gameStore from './lib/gameStore';
import { continueText } from './logic/continuation';
import { emptyParts } from './logic/contribution';
import type { CreateData } from './logic/contribution';
import { GAME_LAST, NO_ROLE, ROLE_QUESTION, gameOf, reviewBasis } from './logic/gameContent';
import type { GameItem, GameReviewStatus } from './logic/gameContent';
import { retryStep, runBuild } from './logic/studioBuild';
import { studioById } from './logic/studios';
import type { StudioEntry, StudioItem } from './logic/studios';
import { flush, harness, member, person, stubWindow } from './test/harness';
import { NO_AI, TOO_LONG_SCREENS, gameBuilt } from './studioGame';
import type { NewDraft } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async (_f: unknown, id?: string | null) => id ?? 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
}));
vi.mock('./lib/aiStore', async (orig) => ({ ...(await orig<typeof import('./lib/aiStore')>()), askAi: vi.fn(), reviewGame: vi.fn() }));
vi.mock('./lib/gameStore', () => ({ loadGameReview: vi.fn(async () => null), startRun: vi.fn(), finishRun: vi.fn(), leaderboard: vi.fn(async () => []), myBest: vi.fn(async () => null) }));

const def = studioById('game')!;
const ROWS = def.items as StudioItem[];
const HTML = '<!-- ids: app --><main id="app"></main>', JS = 'GameStudio.ready();';
const PASSED: GameReviewStatus = { passed: true, reasons: [], current: true };
const nwOf = (o: Partial<NewDraft> = {}): NewDraft => ({ line: 'Consulting', aud: '', type: 'Game', title: 'Invoice detective', dom: 'reg', lvl: '2', stage: 'Analyst', take: 'Spot the flaw.', outline: [], sources: [], ai: false, aiNote: '', ...o });
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 });
const PRODUCE = 3; // Idea & sources, Shape it, Draft, Produce
const answers = (...texts: { text: string; cut?: boolean }[]) => { const q = [...texts]; vi.mocked(aiStore.askAi).mockImplementation(async () => { const a = q.shift(); if (!a) throw new Error('no more answers'); return { text: a.text, cut: !!a.cut }; }); };

const open = (o: { list?: StudioEntry[]; shape?: Record<string, string>; uses?: string[]; readOnly?: boolean } = {}) => {
  stubWindow({});
  const h = harness({ access: member('u1'), subject: person({ readOnly: !!o.readOnly }), config: { liveAssistant: true },
    state: { screen: 'create', create: data(), createTab: 'new', nwKb: ['B1'], aiLive: o.uses ?? ['studio_game'], studio: { view: 'studio', step: PRODUCE, id: 'game' },
      nw: nwOf({ shape: o.shape ?? { [ROLE_QUESTION]: NO_ROLE }, produce: { Look: 'Film noir', Timer: '60 s per round' }, items: { list: (o.list ?? ROWS) as never, how: 'manual', problems: [], note: '' } }) } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  const st = () => h.vm().create!.studio;
  const build = () => runBuild(st().build!.steps, st().buildRunner!, st().build!.set);
  const game = () => gameOf(h.state.nw.items!.list as StudioEntry[]);
  const statuses = () => st().build!.steps.map((s) => s.status);
  return Object.assign(h, { st, build, game, statuses });
};
const calls = () => vi.mocked(aiStore.askAi).mock.calls;

beforeEach(() => { vi.clearAllMocks(); vi.mocked(gameStore.loadGameReview).mockResolvedValue(null); vi.mocked(aiStore.reviewGame).mockResolvedValue({ passed: true, reasons: [] }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('the four build steps', () => {
  it('are the design\'s, and step 1 checks the rows with no AI call', async () => {
    const h = open();
    expect(h.st().build!.steps.map((s) => s.name)).toEqual(['Writing the game content · from your rounds · no AI', 'Building the screens', 'Writing the game logic', 'Checking against the house rules']);
    await h.st().buildRunner!('Writing the game content', 0);
    expect(calls()).toHaveLength(0);
    await expect(open({ list: ROWS.slice(0, 2) }).st().buildRunner!('x', 0)).rejects.toThrow(/Add at least|Round/);
  });
  it('write index.html, then game.js, scan them, save the game and ask the server for the review, which passes', async () => {
    answers({ text: HTML }, { text: JS });
    vi.mocked(gameStore.loadGameReview).mockResolvedValue(null);
    const h = open();
    await h.build(); await flush();
    expect(h.statuses()).toEqual(['done', 'done', 'done', 'done']);
    expect(h.game()).toEqual({ kind: 'game', files: { 'index.html': HTML, 'game.js': JS }, for: { role: NO_ROLE } });
    expect(vi.mocked(aiStore.reviewGame).mock.calls).toEqual([['new1']]); // only the contribution: the server reads the files itself
    expect(h.state.nw.gameReview).toEqual({ passed: true, reasons: [], current: true });
    expect(calls().map((c) => c[0])).toEqual(['studio_game', 'studio_game']);
    expect(h.state.nw.items!.list.at(-1)).toBe(h.game());
  });
  it('save the finished game before the review is asked, so the server reviews what is stored', async () => {
    answers({ text: HTML }, { text: JS });
    const h = open(); await h.build(); await flush();
    const saved = vi.mocked(store.saveDraft).mock.calls.map((c) => (c[0] as { items: StudioEntry[] }).items);
    expect(gameOf(saved.at(-1)!)).toMatchObject({ files: { 'index.html': HTML, 'game.js': JS } });
    expect(vi.mocked(store.saveDraft).mock.invocationCallOrder.at(-1)!).toBeLessThan(vi.mocked(aiStore.reviewGame).mock.invocationCallOrder[0]);
  });
  it('never write a review or a maker into the game item', async () => {
    answers({ text: HTML }, { text: JS });
    const h = open(); await h.build(); await flush();
    expect(Object.keys(h.game()!).sort()).toEqual(['files', 'for', 'kind']);
  });
  it('keep the game for the role chosen now', async () => {
    answers({ text: HTML }, { text: JS });
    const h = open({ shape: { [ROLE_QUESTION]: 'Opponent' }, list: [...ROWS, ['AI role', 'A manager.', 'Hides the ledger.']] });
    await h.build(); await flush();
    expect((h.game() as GameItem).for.role).toBe('Opponent');
  });
  it('join a cut answer with the next part, asked with what is written so far', async () => {
    answers({ text: '<!-- ids: app --><main', cut: true }, { text: ' id="app"></main>' }, { text: JS });
    const h = open(); await h.build(); await flush();
    expect(h.game()!.files['index.html']).toBe('<!-- ids: app --><main id="app"></main>');
    expect(calls()[1][1].messages[0].content).toContain(continueText('<!-- ids: app --><main'));
  });
  it('fail a fifth part with "too long · try a simpler game", and store nothing', async () => {
    answers(...Array.from({ length: 4 }, () => ({ text: '<p>x</p>', cut: true })));
    const h = open(); await h.build(); await flush();
    expect(h.statuses()).toEqual(['todo', 'failed', 'todo', 'todo']); // the rows step shows done only with a built game (gameBuilt)
    expect(h.st().build!.steps[1].error).toBe(TOO_LONG_SCREENS);
    expect(calls()).toHaveLength(4);
    expect(h.game()).toBeNull();
  });
  it('fail a scan problem with its text, and store nothing', async () => {
    answers({ text: HTML }, { text: 'fetch("x")' });
    const h = open(); await h.build(); await flush();
    expect(h.st().build!.steps[2].error).toBe('game.js contacts another website (fetch()');
    expect(h.game()).toMatchObject({ files: { 'index.html': HTML, 'game.js': '' } }); // the screens passed their own scan and were kept
    expect(vi.mocked(aiStore.reviewGame)).not.toHaveBeenCalled();
    answers({ text: '<script src="x.js"></script>' });
    const h2 = open(); await h2.build(); await flush();
    expect(h2.st().build!.steps[1].error).toMatch(/index.html loads code from elsewhere/);
    expect(h2.game()).toBeNull();
  });
  it('retry only the step that failed', async () => {
    answers({ text: HTML }, { text: 'fetch("x")' });
    const h = open(); await h.build(); await flush();
    answers({ text: JS });
    await retryStep(h.st().build!.steps, 2, h.st().buildRunner!, h.st().build!.set); await flush();
    expect(h.statuses().slice(0, 3)).toEqual(['done', 'done', 'done']);
    expect(calls()).toHaveLength(3);
  });
});

describe('the house-rules review', () => {
  const built = (js = JS) => { answers({ text: HTML }, { text: js }); const h = open(); return h; };
  it('fails the step with the first reason when it did not pass, and says so on the draft', async () => {
    vi.mocked(aiStore.reviewGame).mockResolvedValue({ passed: false, reasons: ['Round 2 names a real company', 'x'] });
    const h = built(); await h.build(); await flush();
    expect(h.statuses()).toEqual(['done', 'done', 'done', 'failed']);
    expect(h.st().build!.steps[3].error).toBe('Round 2 names a real company');
    expect(h.state.nw.gameReview).toEqual({ passed: false, reasons: ['Round 2 names a real company', 'x'], current: true });
    expect(h.st().reviewNote).toBe('The house-rules check has not passed: Round 2 names a real company');
  });
  it('fails the step with the server\'s words when the review was not usable', async () => {
    vi.mocked(aiStore.reviewGame).mockRejectedValue(new Error('AI did not return a usable review · retry this step'));
    const h = built(); await h.build(); await flush();
    expect(h.st().build!.steps[3]).toMatchObject({ status: 'failed', error: 'AI did not return a usable review · retry this step' });
  });
  it('is not asked again when the server already holds a passed review for these files', async () => {
    vi.mocked(gameStore.loadGameReview).mockResolvedValue(PASSED);
    const h = built(); await h.build(); await flush();
    expect(vi.mocked(aiStore.reviewGame)).not.toHaveBeenCalled();
    expect(h.statuses()[3]).toBe('done');
  });
  it('is asked again after a review that failed, on the same files (a retry)', async () => {
    vi.mocked(gameStore.loadGameReview).mockResolvedValue({ passed: false, reasons: ['No'], current: true });
    const h = built(); await h.build(); await flush();
    expect(vi.mocked(aiStore.reviewGame)).toHaveBeenCalledTimes(1);
  });
  it('needs the server\'s AI: inside Claude Design alone nothing can review, and it says so', async () => {
    stubWindow({ claude: { complete: vi.fn(async () => HTML) } });
    const h = open({ uses: [] });
    stubWindow({ claude: { complete: vi.fn(async () => HTML) } });
    await h.build(); await flush();
    expect(h.st().build!.steps.map((s) => s.status)).toContain('failed');
    expect(vi.mocked(aiStore.reviewGame)).not.toHaveBeenCalled();
  });
});

describe('what the draft shows after the server passed the review', () => {
  const passed = async () => { answers({ text: HTML }, { text: JS }); const h = open(); await h.build(); await flush(); expect(h.statuses()[3]).toBe('done'); return h; };
  const stale = (h: Awaited<ReturnType<typeof passed>>) => { expect(h.statuses()[3]).toBe('todo'); expect(h.st().game!.review).toBe('Run the house-rules check again'); expect(h.st().reviewNote).toBe('Run the house-rules check again'); };
  it('says passed on this version while nothing the review read has changed', async () => {
    const h = await passed();
    expect(h.st().game!.review).toBe('The house-rules check passed on this version');
    expect(h.st().reviewNote).toBe('');
  });
  it('goes stale when a row, the title or a Shape answer the review read is edited (as the server\'s hash will say)', async () => {
    const edits: ((h: Awaited<ReturnType<typeof passed>>) => void)[] = [
      (h) => h.st().rows[1].edit(1, 'Round one, now naming a real company'), (h) => h.st().rows[0].edit(2, 'A new win condition'),
      (h) => h.L().setState({ nw: { ...h.state.nw, title: 'Another title' } }), (h) => h.st().shape.find((g) => g.key === 'Leaderboard?')!.chips[2].pick(),
    ];
    for (const edit of edits) { const h = await passed(); edit(h); stale(h); }
  });
  it('stays passed through an edit the review did not read (the AI role\'s hidden text, a Produce choice)', async () => {
    const h = await passed();
    h.st().produce[0].chips[1].pick();
    expect(h.st().game!.review).toBe('The house-rules check passed on this version');
    expect(h.statuses()[3]).toBe('done');
  });
});

describe('the game is saved without overwriting rows edited during the build', () => {
  it('saves the rows as they are when the review step runs, with the built game after them', async () => {
    const h = open();
    let first = true;
    vi.mocked(aiStore.askAi).mockImplementation(async () => { if (!first) h.st().rows[1].edit(1, 'Edited during the build'); const out = first ? HTML : JS; first = false; return { text: out, cut: false }; });
    await h.build(); await flush();
    const saved = vi.mocked(store.saveDraft).mock.calls.at(-1)![0] as { items: StudioEntry[] };
    expect(saved.items[1]).toEqual(['Round 1', 'Edited during the build', ROWS[1][2]]);
    expect(gameOf(saved.items)).not.toBeNull();
    expect((h.state.nw.items!.list as StudioEntry[])[1]).toEqual(['Round 1', 'Edited during the build', ROWS[1][2]]);
  });
});

describe('the review is held to the same gate as every AI call', () => {
  it('does not run with ?live=off, even when the use is live', async () => {
    const h = open({ uses: ['studio_game'] });
    stubWindow({});
    const off = harness({ access: member('u1'), subject: person(), config: { liveAssistant: false }, state: { ...h.state, aiLive: ['studio_game'] } });
    await expect(off.vm().create!.studio.buildRunner!('x', 3)).rejects.toThrow(NO_AI);
    expect(vi.mocked(aiStore.reviewGame)).not.toHaveBeenCalled();
  });
});

describe('without AI, or as someone else', () => {
  it('there is no scripted game: it says Game Studio needs AI, and calls nothing', async () => {
    const h = open({ uses: [] }); await h.build(); await flush();
    expect(h.st().build!.steps[1]).toMatchObject({ status: 'failed', error: NO_AI });
    expect(NO_AI).toBe('Game Studio needs AI to build: a System Admin switches on Studio game build');
    expect(calls()).toHaveLength(0);
    expect(h.game()).toBeNull();
  });
  it('View as: only the creator can build it', async () => {
    const h = open({ readOnly: true });
    await expect(h.st().buildRunner!('x', 0)).rejects.toThrow('Only the creator can build it');
    expect(calls()).toHaveLength(0);
  });
});

describe('gameBuilt: how many steps the draft shows done', () => {
  const rows = ROWS as StudioEntry[];
  const item = (js: string): GameItem => ({ kind: 'game', files: { 'index.html': HTML, 'game.js': js }, for: { role: NO_ROLE } });
  it('is none without a game, two with the screens, three with the logic, four once the server\'s review passed on these files', () => {
    expect(gameBuilt(rows, {})).toBe(0);
    expect(gameBuilt([...rows, item('')], {})).toBe(2);
    expect(gameBuilt([...rows, item(JS)], {})).toBe(3);
    const all = [...rows, item(JS)], reviewed = (r: GameReviewStatus) => nwOf({ gameReview: r, gameReviewFor: reviewBasis('Invoice detective', all, {}) });
    expect(gameBuilt(all, {}, reviewed(PASSED))).toBe(4);
    expect(gameBuilt(all, {}, reviewed({ ...PASSED, current: false }))).toBe(3);
    expect(gameBuilt(all, {}, reviewed({ passed: false, reasons: ['x'], current: true }))).toBe(3);
    expect(gameBuilt(all, {}, nwOf({ gameReview: PASSED, gameReviewFor: 'an older basis' }))).toBe(3); // something the review read was edited since
    expect(GAME_LAST).toMatch(/after the rows/);
  });
});
