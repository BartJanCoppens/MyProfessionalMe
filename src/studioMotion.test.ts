// @vitest-environment jsdom
// Motion Studio (studios plan, Task 2.3) through the shared spine: the three build steps with a real runner (the scripted
// layout, then one AI call that animates it or the scripted animation without AI, then the text alternative), a failed
// step retried alone, the drawing kept in the items and dropped when the stages change, and nothing sent without the
// animation and its text alternative (Review Focus 1).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as aiStore from './lib/aiStore';
import * as store from './lib/contributionStore';
import { emptyParts } from './logic/contribution';
import type { CreateData } from './logic/contribution';
import { aiAssisted } from './logic/items';
import { MOTION_SYSTEM } from './logic/motionPrompt';
import { MADE_LABEL, SVG_MAX, motionLayout, textAlternative } from './logic/motionSvg';
import type { MotionDrawing } from './logic/motionSvg';
import { retryStep, runBuild } from './logic/studioBuild';
import { ALT_NEEDED, BUILD_FIRST, LENGTH_CHANGED, MOTION_LENGTH } from './logic/studioContent';
import type { StudioEntry, StudioItem } from './logic/studios';
import { flush, harness, member, person, stubWindow } from './test/harness';
import { NO_AI, SCRIPTED_INSTEAD } from './studioMotion';
import type { NewDraft } from './types';

vi.mock('./lib/contributionStore', () => ({
  loadCreate: vi.fn(), saveDraft: vi.fn(async (_f: unknown, id?: string | null) => id ?? 'new1'), removeDraft: vi.fn(async () => {}), submitContribution: vi.fn(async () => 'review'),
  checkContribution: vi.fn(async () => ({ passed: true, reasons: [] })), decideReview: vi.fn(async () => 'review'), savePolicy: vi.fn(async () => {}), removePolicy: vi.fn(async () => {}),
}));

vi.mock('./lib/aiStore', async (orig) => ({ ...(await orig<typeof import('./lib/aiStore')>()), askAi: vi.fn() }));

const STAGES: StudioItem[] = [['Order', 'The customer orders.'], ['Deliver', 'Goods leave.'], ['Collect', 'Payment arrives.']];
const STAGE_OBJ = STAGES.map(([label, text]) => ({ label, text }));
const AI_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><circle r="6" style="fill:var(--tc-green, #86BC25)"><animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite"/></circle></svg>';
const nwOf = (o: Partial<NewDraft> = {}): NewDraft => ({ line: 'Consulting', aud: '', type: 'Animated flow', title: 'Order-to-cash', dom: 'corp', lvl: '1', stage: 'Analyst',
  take: 'Cash follows the order.', outline: [], sources: [], ai: false, aiNote: '', ...o });
const data = (): CreateData => ({ contributions: [], reviews: [], rules: [{ id: 1, user_id: 'u1', ...emptyParts(), lines: ['Consulting'] }], policies: [], peers: 3 });
const PRODUCE = 2; // Idea & sources, Shape it, Draft, Produce
// live: AI inside Claude Design; uses: the uses a System Admin switched on (the ai edge function, aiStore.askAi).
const open = (o: { list?: StudioEntry[]; shape?: Record<string, string>; live?: boolean; uses?: string[]; step?: number; ai?: () => Promise<string> } = {}) => {
  const complete = vi.fn(o.ai ?? (async () => AI_SVG));
  stubWindow(o.live ? { claude: { complete } } : {});
  const h = harness({ access: member('u1'), subject: person(), config: { liveAssistant: !!o.live || !!o.uses },
    state: { screen: 'create', create: data(), createTab: 'new', nwKb: ['B1'], aiLive: o.uses ?? (o.live ? ['studio_motion'] : []), studio: { view: 'studio', step: o.step ?? PRODUCE + 1, id: 'motion' },
      nw: nwOf({ shape: o.shape ?? { [MOTION_LENGTH]: '20 s' }, items: { list: (o.list ?? STAGES) as never, how: 'manual', problems: [], note: '' } }) } });
  vi.mocked(store.loadCreate).mockImplementation(async () => h.state.create!);
  const st = () => h.vm().create!.studio;
  const build = () => runBuild(st().build!.steps, st().buildRunner!, st().build!.set);
  const drawing = () => (h.state.nw.items!.list as StudioEntry[]).find((x) => !Array.isArray(x) && 'svg' in x) as MotionDrawing | undefined;
  const statuses = () => st().build!.steps.map((s) => s.status);
  return Object.assign(h, { st, build, drawing, statuses, complete });
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('the Motion Studio\'s AI use', () => {
  it('animates through its own use studio_motion, whose instruction asks for one SVG', async () => {
    vi.mocked(aiStore.askAi).mockResolvedValue(AI_SVG);
    const h = open({ uses: ['studio_motion'] });
    expect(h.st().motion).toMatchObject({ note: '' });
    await h.build();
    expect(aiStore.askAi).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiStore.askAi).mock.calls[0][0]).toBe('studio_motion');
    expect(h.drawing()).toMatchObject({ svg: AI_SVG, made: 'ai' });
  });
  it('says its Style and Pace steer the AI animation', () => {
    expect(open().st().produce.map((g) => [g.key, g.hint])).toEqual([['Style', 'Steers the AI animation'], ['Pace', 'Steers the AI animation']]);
  });
  it('is scripted when only the studio drafts (studio_draft) are switched on', async () => {
    const h = open({ uses: ['studio_draft'] });
    expect(h.st().motion).toMatchObject({ note: NO_AI });
    await h.build();
    expect(aiStore.askAi).not.toHaveBeenCalled();
    expect(h.drawing()).toMatchObject({ made: 'scripted' });
  });
});

describe('building an Animated flow with AI', () => {
  it('draws the layout, animates it in one AI call and writes the text alternative from the stages', async () => {
    const h = open({ live: true });
    expect(h.st().steps).toEqual(['Idea & sources', 'Shape it', 'Draft', 'Produce', 'Preview & test', 'Check & send']);
    expect(h.statuses()).toEqual(['todo', 'todo', 'todo']);
    await h.build();
    expect(h.statuses()).toEqual(['done', 'done', 'done']);
    expect(h.complete).toHaveBeenCalledTimes(1);
    const req = (h.complete.mock.calls[0] as unknown[])[0] as { system: string; messages: { content: string }[] };
    expect(req.system).toBe(MOTION_SYSTEM);
    expect(req.messages[0].content).toContain(motionLayout(STAGE_OBJ, 20, false));
    expect(h.drawing()).toEqual({ svg: AI_SVG, alt: textAlternative(STAGE_OBJ), made: 'ai', seconds: 20 });
    expect(h.st().motion).toMatchObject({ made: MADE_LABEL.ai, note: '' });
    expect(h.st().content).toMatchObject({ kind: 'motion', svg: AI_SVG, seconds: 20, made: 'ai' });
    expect(aiAssisted(h.state.nw)).toBe(true);
    expect(h.st().send.problems).toEqual([]);
  });
  it('fails the animating step on an unusable answer, keeps the layout, and retries that step alone', async () => {
    let answer = 'Sure! Here is your flow.';
    const h = open({ live: true, ai: async () => answer });
    await h.build();
    expect(h.statuses()).toEqual(['done', 'failed', 'todo']);
    expect(h.st().build!.steps[1].error).toBe('AI did not return a usable animation · retry this step');
    expect(h.drawing()).toMatchObject({ made: 'layout', alt: '' });
    expect(h.st().content).toBeNull();
    expect(h.st().send.problems).toEqual([BUILD_FIRST]);
    answer = AI_SVG;
    await retryStep(h.st().build!.steps, 1, h.st().buildRunner!, h.st().build!.set);
    expect(h.statuses()).toEqual(['done', 'done', 'todo']);
    expect(h.complete).toHaveBeenCalledTimes(2);
    await h.build();
    expect(h.statuses()).toEqual(['done', 'done', 'done']);
    expect(h.complete).toHaveBeenCalledTimes(2);
  });
  it('offers the scripted flow instead, by choice and labelled, only after the AI step failed', async () => {
    const h = open({ live: true, ai: async () => 'No.' });
    expect(h.st().motion!.scripted).toBeNull();
    await h.build();
    expect(h.drawing()).toMatchObject({ made: 'layout' });
    expect(h.st().motion!.scripted!.label).toBe(SCRIPTED_INSTEAD);
    h.st().motion!.scripted!.run();
    expect(h.drawing()).toEqual({ svg: motionLayout(STAGE_OBJ, 20, true), alt: textAlternative(STAGE_OBJ), made: 'scripted', seconds: 20 });
    expect(h.statuses()).toEqual(['done', 'done', 'done']);
    expect(h.st().motion!.made).toBe(MADE_LABEL.scripted);
    expect(h.st().motion!.scripted).toBeNull();
    expect(h.complete).toHaveBeenCalledTimes(1);
  });
  it('refuses an oversized drawing', async () => {
    const h = open({ live: true, ai: async () => AI_SVG.replace('</svg>', '<rect width="1" height="1"/>'.repeat(SVG_MAX / 28) + '</svg>') });
    await h.build();
    expect(h.statuses()).toEqual(['done', 'failed', 'todo']);
  });
});

describe('building without AI', () => {
  it('animates the scripted flow of boxes and arrows, says so and says why, and calls no AI', async () => {
    const h = open();
    expect(h.st().motion!.note).toBe('AI is not switched on, so the build animates a scripted flow of boxes and arrows from your stages.');
    await h.build();
    expect(h.statuses()).toEqual(['done', 'done', 'done']);
    expect(h.drawing()).toEqual({ svg: motionLayout(STAGE_OBJ, 20, true), alt: textAlternative(STAGE_OBJ), made: 'scripted', seconds: 20 });
    expect(h.st().motion!.made).toBe(MADE_LABEL.scripted);
    expect(aiAssisted(h.state.nw)).toBe(false);
    expect(h.st().content).toMatchObject({ kind: 'motion', made: 'scripted' });
  });
});

describe('the text alternative and the stages', () => {
  const built: MotionDrawing = { svg: AI_SVG, alt: 'Three stages.', made: 'ai', seconds: 20 };
  it('is edited in Produce; without one nothing is checked or sent', async () => {
    const h = open({ list: [...STAGES, built] });
    expect(h.statuses()).toEqual(['done', 'done', 'done']);
    expect(h.st().motion!.alt!.value).toBe('Three stages.');
    h.st().motion!.alt!.set('');
    expect(h.drawing()).toMatchObject({ alt: '', made: 'ai', svg: AI_SVG });
    expect(h.st().send.problems).toEqual([ALT_NEEDED]);
    expect(h.st().send.blocked).toBe(true);
    expect(h.statuses()).toEqual(['done', 'done', 'todo']);
    h.st().send.check(); await flush();
    expect(store.checkContribution).not.toHaveBeenCalled();
    expect(h.lastToast()).toBe(ALT_NEEDED);
  });
  it('offers no text alternative to edit before the flow is animated', () => {
    expect(open().st().motion!.alt).toBeNull();
    expect(open({ list: [...STAGES, { ...built, made: 'layout', alt: '' }] }).st().motion!.alt).toBeNull();
  });
  it('drops the drawing and starts the build over when a stage changes', () => {
    const h = open({ list: [...STAGES, built] });
    h.st().rows[0].edit(1, 'The customer orders online.');
    expect(h.drawing()).toBeUndefined();
    expect(h.statuses()).toEqual(['todo', 'todo', 'todo']);
    expect(h.st().send.problems).toEqual([BUILD_FIRST]);
  });
  it('is built for its length: changing "Length?" afterwards asks for a new build and shows no preview', async () => {
    const h = open();
    await h.build();
    expect(h.st().content).toMatchObject({ seconds: 20 });
    h.st().shape.find((g) => g.key === MOTION_LENGTH)!.chips.find((c) => c.label === '90 s')!.pick();
    expect(h.statuses()).toEqual(['todo', 'todo', 'todo']);
    expect(h.st().content).toBeNull();
    expect(h.st().send.problems).toEqual([LENGTH_CHANGED]);
    expect(h.st().previewNote).toBe(LENGTH_CHANGED);
    await h.build();
    expect(h.drawing()).toMatchObject({ seconds: 90, made: 'scripted' });
    expect(h.st().content).toMatchObject({ seconds: 90 });
    expect(h.st().send.problems).toEqual([]);
  });
  it('drops a drawing built for the old length rather than finish it for the new one', async () => {
    const h = open();
    const runner = h.st().buildRunner!, steps = h.st().build!.steps;
    await runner(steps[0].name, 0);
    h.st().shape.find((g) => g.key === MOTION_LENGTH)!.chips.find((c) => c.label === '90 s')!.pick();
    await runner(steps[1].name, 1);
    expect(h.drawing()).toMatchObject({ made: 'layout', seconds: 20 });
  });
  it('builds it again from the start on request', () => {
    const h = open({ list: [...STAGES, built] });
    h.st().motion!.restart();
    expect(h.drawing()).toBeUndefined();
    expect(h.state.nw.items!.list).toEqual(STAGES);
    expect(h.statuses()).toEqual(['todo', 'todo', 'todo']);
  });
  it('saves the stages and the drawing as the items, with the answers', async () => {
    const h = open({ list: [...STAGES, built] });
    h.st().send.check(); await flush(10);
    expect(store.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ type: 'Animated flow', studio: 'motion', items: [...STAGES, built], shape: { [MOTION_LENGTH]: '20 s' }, ai_assisted: true }), null);
  });
  it('builds nothing in View as', async () => {
    const h = open({ live: true });
    h.subject.readOnly = true;
    await h.build();
    expect(h.statuses()[0]).toBe('failed');
    expect(h.drawing()).toBeUndefined();
  });
});
