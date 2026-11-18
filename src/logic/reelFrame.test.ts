// What a reel shows at time t (studios plan, Task 5.3): the scene, its on-screen text, the caption, the slow zoom and the AI tag.
import { describe, expect, it } from 'vitest';
import type { ReelContent } from '../types';
import { cutPlanOf, reelCues, reelFrameAt } from './reelFrame';
import type { CutPlan } from './reelFrame';

const plan = (over: Partial<CutPlan> = {}): CutPlan => ({
  size: { w: 720, h: 1280 }, scenes: [{ start: 0, seconds: 4.3, onScreen: 'Hook' }, { start: 4.3, seconds: 5, onScreen: 'Point' }],
  captions: [{ start: 0, end: 2, text: 'Hello there.' }, { start: 2, end: 4.3, text: 'Second line.' }], burned: true, look: null, aiTag: false, ...over });

describe('reelFrameAt', () => {
  it('shows the Hook on-screen text at t = 0', () => {
    expect(reelFrameAt(plan(), 0)).toMatchObject({ scene: 0, onScreen: 'Hook' });
  });
  it('moves to the next scene where it starts', () => {
    expect(reelFrameAt(plan(), 4.31)).toMatchObject({ scene: 1, onScreen: 'Point' });
  });
  it('zooms from 1 to 1.04 across a scene', () => {
    expect(reelFrameAt(plan(), 0).zoom).toBe(1);
    expect(reelFrameAt(plan(), 9.3).zoom).toBeCloseTo(1.04, 5);
  });
  it('shows the cue at t as the caption, and none when captions are not burned in', () => {
    expect(reelFrameAt(plan(), 2.5).caption).toBe('Second line.');
    expect(reelFrameAt(plan({ burned: false }), 2.5).caption).toBeNull();
    expect(reelFrameAt(plan({ captions: null }), 2.5).caption).toBeNull();
  });
  it('carries the AI tag', () => {
    expect(reelFrameAt(plan({ aiTag: true }), 0).aiTag).toBe(true);
  });
});

const scene = (start: number, seconds: number, text: string, words: number[] | null) => ({ label: 'S', text, onScreen: text, start, seconds, words });
const reel = (scenes: ReelContent['scenes']): ReelContent => ({ kind: 'reel', size: '1080x1080', seconds: 8, scenes, video: null, burned: true, look: null, music: 'None', check: { q: 'q', opts: ['a', 'b'], a: 0 }, made: 'ai' });

describe('reelCues', () => {
  it('runs the cues per scene, offset by the scene start', () => {
    const cues = reelCues(reel([scene(0, 4, 'One two.', [0, 1]), scene(4, 4, 'Three four.', [0, 1])]));
    expect(cues!.map((c) => c.text)).toEqual(['One two.', 'Three four.']);
    expect(cues![1].start).toBe(4);
  });
  it('gives null for a reel with no word timings', () => {
    expect(reelCues(reel([scene(0, 4, 'One two.', null)]))).toBeNull();
  });
  it('gives null when a scene timing does not match its words', () => {
    expect(reelCues(reel([scene(0, 4, 'One two.', [0])]))).toBeNull();
  });
});

describe('cutPlanOf', () => {
  it('reads the size, the captions and the AI tag from the content', () => {
    const p = cutPlanOf(reel([scene(0, 4, 'One two.', [0, 1])]));
    expect(p).toMatchObject({ size: { w: 1080, h: 1080 }, burned: true, aiTag: true });
    expect(p.captions).toHaveLength(1);
  });
});

describe('the reel sizes are written once', () => {
  it('reads the cut size from the stored size', async () => {
    const { dimensions, SIZE_OF } = await import('./videoItem');
    expect(dimensions(SIZE_OF['9:16 vertical'])).toEqual({ w: 720, h: 1280 });
    expect(dimensions(SIZE_OF['1:1 square'])).toEqual({ w: 1080, h: 1080 });
  });
});
