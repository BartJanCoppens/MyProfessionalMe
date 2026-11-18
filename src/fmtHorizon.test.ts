// @vitest-environment jsdom
// A Presentation in the library (studios plan, Task 3.3): its card says how many slides and whether it was played to
// the end; its panel plays the file; reaching the last slide completes it once ('media'), never in View as.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from './data';
import { parseFormatContent } from './lib/contentStore';
import * as learner from './lib/learnerStore';
import { flush, harness, person, withProgress } from './test/harness';
import type { Learn, LearningDetail } from './types';

vi.mock('./lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));

const PATH = '0f8fad5b-d9cb-469f-a165-70867728950e/7c9e6679-7425-40de-944b-e07fc1f90ae7/presentation.horizon';
const ROW: Learn = ['L996', 'Garden tour', 'prof', 1, 'Presentation', 'Peer contribution', 0.25, 0, '', ''];
const CONTENT = { kind: 'horizon', path: PATH, title: 'Garden tour', slides: 3, seconds: 0 };
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L996 = ROW; LEARN_META.L996 = { line: null, status: 'published', content: parseFormatContent(CONTENT) }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L996; delete LEARN_META.L996; });
beforeEach(() => { vi.clearAllMocks(); });

const open = (o: { detail?: LearningDetail; state?: 'not-started' | 'accepted'; readOnly?: boolean; motion?: boolean } = {}) => {
  const data = withProgress({ L996: o.state ?? 'not-started' });
  if (o.detail) data.progress.L996.detail = o.detail;
  return harness({ subject: person({ data, ...(o.readOnly ? { id: 'u9', name: 'Other Person', readOnly: true } : {}) }), state: { screen: 'detail', detailId: 'L996' }, config: { motion: o.motion ?? true } });
};
const card = (o: Parameters<typeof open>[0] = {}) => open(o).vm().libItems.find((i) => i.id === 'L996')!;

describe('the library card', () => {
  it('draws the deck cover with its slides, then that it was played to the end', () => {
    expect(card()).toMatchObject({ kind: 'deck', cvMeta: '3 slides', cvMeta2: 'At your own pace' });
    expect(card().stepDots).toHaveLength(3);
    expect(card({ detail: { last: true } })).toMatchObject({ cvMeta2: 'Played to the end' });
  });
});

describe('the panel', () => {
  it('plays the file named in the content, with motion as the app has it', () => {
    expect(open().vm().det.hz).toMatchObject({ path: PATH, sub: '3 slides · Horizon presentation', still: false, note: '' });
    expect(open({ motion: false }).vm().det.hz).toMatchObject({ still: true });
  });
  it('completes the learning when the last slide is reached, once', async () => {
    const h = open();
    h.vm().det.hz!.onLast();
    await flush(10);
    expect(vi.mocked(learner.saveProgress)).toHaveBeenCalledWith(expect.anything(), 'L996', { state: 'accepted', pct: 100, detail: { last: true } });
    expect(h.lastToast()).toMatch(/^Played to the last slide · “Garden tour” counts toward your hours/);
    vi.mocked(learner.saveProgress).mockClear();
    open({ state: 'accepted', detail: { last: true } }).vm().det.hz!.onLast();
    await flush(10);
    expect(vi.mocked(learner.saveProgress)).not.toHaveBeenCalled();
  });
  it('saves nothing in View as, and says so', async () => {
    const hz = open({ readOnly: true }).vm().det.hz!;
    expect(hz.note).toBe('Viewing someone else: playing it completes nothing.');
    hz.onLast();
    await flush(10);
    expect(vi.mocked(learner.saveProgress)).not.toHaveBeenCalled();
  });
});
