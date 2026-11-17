// @vitest-environment jsdom
// The Animated flow in the library (studios plan, Task 2.3): its card, like every format's, says what it is and whether
// it was played to the end or its text version read. The panel itself is tested in screens/AnimatedFlowPanel.test.tsx.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from './data';
import { parseFormatContent } from './lib/contentStore';
import { harness, person, withProgress } from './test/harness';
import type { Learn, LearningDetail } from './types';

vi.mock('./lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));

const ROW: Learn = ['L995', 'Order-to-cash', 'corp', 1, 'Animated flow', 'Peer contribution', 0.025, 0, '', ''];
const CONTENT = { kind: 'motion', stages: [{ label: 'Order', text: 'a' }, { label: 'Deliver', text: 'b' }, { label: 'Collect', text: 'c' }], svg: '<svg/>', alt: 'Three stages.', seconds: 45, made: 'ai' };
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L995 = ROW; LEARN_META.L995 = { line: null, status: 'published', content: parseFormatContent(CONTENT) }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L995; delete LEARN_META.L995; });

const cover = (detail?: LearningDetail) => {
  const data = withProgress({ L995: 'not-started' });
  if (detail) data.progress.L995.detail = detail;
  return harness({ subject: person({ data }), state: { screen: 'detail', detailId: 'L995' } }).vm().libItems.find((i) => i.id === 'L995')!;
};

describe('the library card', () => {
  it('draws the flow cover with its stages, length and maker, then that it was played or read', () => {
    expect(cover()).toMatchObject({ kind: 'flow', cvMeta: '3 stages · 45 s', cvMeta2: 'Made with AI' });
    expect(cover().stepDots).toHaveLength(3);
    expect(cover({ played: true })).toMatchObject({ cvMeta2: 'Played to the end' });
    expect(cover({ read: true })).toMatchObject({ cvMeta2: 'Text version read' });
  });
});
