// An embedded learning (E-learning Studio, Task 2.1): a course block that plays a published learning through that format's own learner panel. The embed's
// view, the panel's view-model over the embedded learning (embedVals), and what completing it saves: the embedded learning's own progress, never the course's.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN, LEARN_BY, LEARN_META } from './data';
import { embedVals } from './courseEmbed';
import { courseView, NEW_RUN } from './fmtCourse';
import type { CourseRun, EmbedView } from './fmtCourse';
import * as learner from './lib/learnerStore';
import { flush, harness, stubWindow } from './test/harness';
import type { CourseContent, EmbedBlock, Learn } from './types';

vi.mock('./lib/learnerStore', () => ({
  addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));

const embed = (id: string, format: EmbedBlock['format'], learning: string): EmbedBlock => ({ block: 'embed', id, format, learning });
const COURSE = { kind: 'course', rule: 'seen', lessons: [{ title: 'Lesson one', blocks: [embed('b0001', 'Reel', 'L47'), embed('b0002', 'Avatar', 'L38'), embed('b0003', 'Reel', 'L44')] }, { title: 'Lesson two', blocks: [{ block: 'text', id: 'b0004', h: '', t: 'x' }] }] } as CourseContent;
const ROW: Learn = ['L995', 'The course', 'reg', 2, 'E-learning', 'Peer contribution', 0.5, 0, '', ''];
beforeAll(() => { LEARN.push(ROW); LEARN_BY.L995 = ROW; LEARN_META.L995 = { line: null, status: 'published', content: COURSE }; });
afterAll(() => { LEARN.splice(LEARN.indexOf(ROW), 1); delete LEARN_BY.L995; delete LEARN_META.L995; delete LEARN_META.L47; delete LEARN_META.L44; });
beforeEach(() => { stubWindow(); vi.clearAllMocks(); delete LEARN_META.L47; delete LEARN_META.L44; });

describe('embedVals', () => {
  it('gives a published reel its panel view-model (det.rl) and the learning itself', () => {
    const v = embedVals(harness().L(), 'L47');
    expect(v?.item.id).toBe('L47');
    expect(v?.det.rl).toBeTruthy();
  });
  it('is null for an unpublished, a missing and an E-learning learning', () => {
    LEARN_META.L47 = { line: null, status: 'draft' };
    const L = harness().L();
    expect(embedVals(L, 'L47')).toBeNull();
    expect(embedVals(L, 'L000')).toBeNull();
    expect(embedVals(L, 'L995')).toBeNull();
  });
  it('completes the embedded reel on the reel\'s own learning id, and saves nothing for the course', async () => {
    const h = harness({ state: { screen: 'detail', detailId: 'L995' } });
    embedVals(h.L(), 'L47')!.det.rl!.onEnd();
    await flush();
    expect(learner.saveProgress).toHaveBeenCalledTimes(1);
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L47', { state: 'in-progress', pct: 0 });
    expect(h.vm().det.co!.ruleLine).toContain('1 of 2 lessons seen');
  });
});

describe('the embed in the player', () => {
  const embeds = (h: ReturnType<typeof harness>) => h.vm().det.co!.blocks as unknown as EmbedView[];
  const on = () => harness({ state: { screen: 'detail', detailId: 'L995', origin: 'map' } });
  it('shows the studio\'s glyph, the learning\'s title and its format and length', () => {
    const [reel, avatar] = embeds(on());
    expect(reel).toMatchObject({ kind: 'embed', format: 'Reel', glyph: '▶', title: 'Scope creep: spot it in the SOW', openLabel: 'Open', gone: false, isOpen: false });
    expect(reel.meta).toMatch(/^Reel · /);
    expect(avatar).toMatchObject({ format: 'Avatar', openLabel: 'Start the conversation' });
  });
  it('opens an embedded reel inline: one embed is open at a time', () => {
    const patch = vi.fn(), run: CourseRun = { ...NEW_RUN, open: 'b0003' };
    const v = courseView(COURSE, run, patch, { ro: false, seen: [], done: false, onProgress: () => {}, preview: true });
    const [first, , third] = v.blocks as unknown as EmbedView[];
    expect(third.isOpen).toBe(true);
    first.open();
    expect(patch).toHaveBeenCalledWith({ open: 'b0001' });
    third.close();
    expect(patch).toHaveBeenCalledWith({ open: undefined });
  });
  it('opens an avatar on its own page with the course to come back to', () => {
    const h = on(), avatar = embeds(h)[1];
    avatar.open();
    expect(h.state).toMatchObject({ screen: 'detail', detailId: 'L38', origin: 'map', backTo: 'L995' });
    expect(h.vm().backLabel).toBe('← Back to the course');
    h.vm().goBack();
    expect(h.state).toMatchObject({ screen: 'detail', detailId: 'L995', origin: 'map', backTo: null });
  });
  it('says a retired learning is no longer available and offers no way to open it', () => {
    LEARN_META.L44 = { line: null, status: 'review' };
    const third = embeds(on())[2];
    expect(third).toMatchObject({ gone: true, goneNote: 'This learning is no longer available' });
  });
});
