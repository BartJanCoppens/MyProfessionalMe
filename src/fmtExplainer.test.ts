// The interactive explainer on the detail page (studios plan, Task 2.2): numbered steps with Prev and Next, the ending
// (a three-question check on the shared question round, or a summary card), and completion: the last step seen, and the
// check finished when there is one. Content is injected as the database would publish it.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from './data';
import { parseFormatContent } from './lib/contentStore';
import * as learner from './lib/learnerStore';
import { flush, harness, member, person, stubWindow, withProgress } from './test/harness';
import type { Learn, LearningDetail } from './types';

vi.mock('./lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));

const STEPS = [{ label: 'Supplier', text: 'Creates the invoice.' }, { label: 'Access point', text: 'Checks the format.' }, { label: 'Customer', text: 'Gets the invoice.' }];
const Q = (k: number) => ({ t: 'Peppol', q: 'Question ' + k + '?', o: ['a', 'b', 'c', 'd'], a: 1, why: 'Because b.' });
const ROWS: Record<string, [Learn, unknown]> = {
  L990: [['L990', 'How a Peppol e-invoice travels', 'reg', 2, 'Interactive explainer', 'Peer contribution', 0.25, 0, '', ''],
    { kind: 'explainer', style: 'Step-through', depth: 'Overview', steps: STEPS, end: 'A three-question check', check: [Q(0), Q(1), Q(2)] }],
  L991: [['L991', 'Peppol in short', 'reg', 2, 'Interactive explainer', 'Peer contribution', 0.25, 0, '', ''],
    { kind: 'explainer', style: 'Step-through', depth: 'With technical detail', steps: STEPS, end: 'A summary card' }],
  L992: [['L992', 'Peppol, no ending', 'reg', 2, 'Interactive explainer', 'Peer contribution', 0.25, 0, '', ''],
    { kind: 'explainer', style: 'Step-through', depth: 'Overview', steps: STEPS, end: 'Nothing' }],
  L994: [['L994', 'One step', 'reg', 2, 'Interactive explainer', 'Peer contribution', 0.25, 0, '', ''],
    { kind: 'explainer', style: 'Step-through', depth: 'Overview', steps: STEPS.slice(0, 1), end: 'Nothing' }],
  L995: [['L995', 'One step and a check', 'reg', 2, 'Interactive explainer', 'Peer contribution', 0.25, 0, '', ''],
    { kind: 'explainer', style: 'Step-through', depth: 'Overview', steps: STEPS.slice(0, 1), end: 'A three-question check', check: [Q(0), Q(1), Q(2)] }],
};
beforeAll(() => Object.values(ROWS).forEach(([row, raw]) => { LEARN.push(row); LEARN_BY[row[0]] = row; LEARN_META[row[0]] = { line: null, status: 'published', content: parseFormatContent(raw) }; }));
afterAll(() => Object.keys(ROWS).forEach((id) => { LEARN.splice(LEARN.findIndex((r) => r[0] === id), 1); delete LEARN_BY[id]; delete LEARN_META[id]; }));
beforeEach(() => { stubWindow(); vi.clearAllMocks(); });

const on = (id: string, detail?: LearningDetail, state: 'not-started' | 'accepted' = 'not-started') => {
  const data = withProgress({ [id]: state });
  if (detail) data.progress[id].detail = detail;
  return harness({ subject: person({ data }), state: { screen: 'detail', detailId: id } });
};
const ie = (h: ReturnType<typeof on>) => h.vm().det.ie!;

describe('stepping', () => {
  it('shows the numbered steps, one at a time, with Prev, Next and the pills', () => {
    const h = on('L991');
    expect(ie(h)).toMatchObject({ sub: '3 steps · With technical detail · ends with a summary card', pos: 'Step 1 of 3', noPrev: true, noNext: false, nextLabel: 'Next',
      step: { label: 'Supplier', text: 'Creates the invoice.', svg: '' } });
    expect(ie(h).pills[3]).toMatchObject({ label: 'Summary', off: true });
    expect(ie(h).pills.map((p) => [p.n, p.label, p.on])).toEqual([['1', 'Supplier', true], ['2', 'Access point', false], ['3', 'Customer', false], ['', 'Summary', false]]);
    ie(h).next();
    expect(ie(h)).toMatchObject({ pos: 'Step 2 of 3', noPrev: false, step: { label: 'Access point' } });
    ie(h).pills[2].pick();
    expect(ie(h)).toMatchObject({ pos: 'Step 3 of 3', nextLabel: 'See the summary', step: { label: 'Customer' } });
    ie(h).prev();
    expect(ie(h).step!.label).toBe('Access point');
    expect(ie(h).pills.map((p) => p.done)).toEqual([true, false, false, false]);
  });
  it('ends on the summary card: every step in one place', () => {
    const h = on('L991');
    ie(h).pills[2].pick(); ie(h).pills[3].pick();
    expect(ie(h)).toMatchObject({ pos: 'Summary', step: null, noNext: true, round: null });
    expect(ie(h).summary!.map((s) => s.n + ' ' + s.label + ' · ' + s.text)).toEqual(['1 Supplier · Creates the invoice.', '2 Access point · Checks the format.', '3 Customer · Gets the invoice.']);
  });
  it('has no ending to step to when the explainer ends with nothing', () => {
    const h = on('L992');
    ie(h).pills[2].pick();
    expect(ie(h)).toMatchObject({ noNext: true, nextLabel: 'Next' });
    expect(ie(h).pills).toHaveLength(3);
  });
});

describe('completion', () => {
  it('completes when the last step is seen, once, when there is no check', async () => {
    const h = on('L991');
    ie(h).next(); await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    ie(h).next(); await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L991', { state: 'accepted', pct: 100, detail: { last: true } });
    ie(h).prev(); ie(h).next(); await flush();
    expect(learner.saveProgress).toHaveBeenCalledTimes(1);
  });
  it('does not save again for a learner who already saw the last step', async () => {
    const h = on('L992', { last: true }, 'accepted');
    ie(h).pills[2].pick(); await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
  it('opens the check only once the last step is seen: its pill waits until then', async () => {
    const h = on('L990');
    expect(ie(h).pills[3]).toMatchObject({ label: 'Check', off: true });
    ie(h).pills[3].pick();
    expect(ie(h)).toMatchObject({ pos: 'Step 1 of 3', round: null });
    ie(h).pills[2].pick();
    expect(ie(h).pills[3].off).toBe(false);
    ie(h).pills[3].pick();
    expect(ie(h).round).not.toBeNull();
  });
  it('completes a one-step explainer when the learner says it is done', async () => {
    const h = on('L994');
    expect(ie(h)).toMatchObject({ pos: 'Step 1 of 1', nextLabel: 'Done', noNext: false });
    ie(h).next(); await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L994', { state: 'accepted', pct: 100, detail: { last: true } });
    expect(ie(h).noNext).toBe(true);
  });
  it('a one-step explainer with a check reaches the check from its step', () => {
    const h = on('L995');
    expect(ie(h)).toMatchObject({ nextLabel: 'Take the check', noNext: false });
    ie(h).next();
    expect(ie(h).round).not.toBeNull();
  });
  it('with a check, completes only when the check is finished, keeping the best score', async () => {
    const h = on('L990');
    ie(h).pills[2].pick(); await flush();
    expect(learner.saveProgress).not.toHaveBeenCalled();
    expect(ie(h).nextLabel).toBe('Take the check');
    ie(h).next();
    expect(ie(h)).toMatchObject({ pos: 'Check', step: null, round: { pos: 'Question 1 of 3', q: 'Question 0?' } });
    [1, 0, 1].forEach((k) => { ie(h).round!.opts[k].pick(); ie(h).round!.main(); ie(h).round!.main(); });
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L990', { state: 'accepted', pct: 100, detail: { last: true, best: 67 } });
    expect(ie(h)).toMatchObject({ round: null, result: { label: '2 of 3 right' } });
    ie(h).result!.restart();
    expect(ie(h).round!.pos).toBe('Question 1 of 3');
  });
});

describe('View as', () => {
  it('steps through without saving, and shows the check without answering it', async () => {
    const h = harness({ subject: person({ id: 'p2', name: 'Kim Learner', readOnly: true, data: withProgress({}) }), access: member('c1'), state: { screen: 'detail', detailId: 'L990' } });
    expect(ie(h).ro).toBe(true);
    ie(h).pills[2].pick(); ie(h).pills[3].pick(); await flush();
    expect(ie(h)).toMatchObject({ round: null, note: 'Only Kim can take the check.' });
    expect(learner.saveProgress).not.toHaveBeenCalled();
  });
});

describe('the library card', () => {
  const cover = (id: string, detail?: LearningDetail) => on(id, detail).vm().libItems.find((i) => i.id === id)!;
  it('draws the explainer cover with its steps and how it ends, then that it was seen to the end', () => {
    expect(cover('L990')).toMatchObject({ kind: 'explainer', cvExplainer: true, cvMeta: '3 steps', cvMeta2: 'Ends with a check' });
    expect(cover('L991')).toMatchObject({ cvMeta: '3 steps', cvMeta2: 'Click through' });
    expect(cover('L991', { last: true })).toMatchObject({ cvMeta2: 'Seen to the end' });
    expect(cover('L990').stepDots).toHaveLength(3);
  });
});
