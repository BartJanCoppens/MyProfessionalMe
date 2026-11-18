// @vitest-environment jsdom
// A slide frame on a canvas and the Slides video's cut: the same slides the panel plays, drawn with the compositor's one draw hook.
import { describe, expect, it, vi } from 'vitest';
import { PACE, ownSeconds } from '../logic/narration';
import type { SlidesContent } from '../types';
import { drawSlideFrame } from './drawSlide';
import { slidesCut } from './slidesCut';
import { svgImageSource } from './slideImages';

const TALK = 'A steering committee takes decisions ⟨next⟩ not updates ⟨cue⟩ every week.';
const content = (over: Partial<SlidesContent> = {}, audio = false): SlidesContent => ({ kind: 'slides', template: 'Firm template', transitions: 'Calm', made: audio ? 'ai' : 'scripted', seconds: 20,
  slides: [{ title: 'Why it matters', bullets: ['Decisions', 'Not updates', 'Weekly'], narration: TALK, ...(audio && { audio: { path: 'p/0.mp3', seconds: 6, marks: [{ kind: 'cue' as const, at: 3 }] } }) },
    { title: 'Before', bullets: ['Send the pack'], narration: 'Send the pack three days ahead.', ...(audio && { audio: { path: 'p/1.mp3', seconds: 4, marks: [] } }) }], ...over });

function fakeContext() {
  const texts: string[] = [], fills: string[] = [];
  const ctx = { fillText: (s: string) => { texts.push(s); }, measureText: (s: string) => ({ width: s.length * 10 }), drawImage: vi.fn(), fillRect: vi.fn(),
    set fillStyle(v: string) { fills.push(v); }, set font(_v: string) {}, set textAlign(_v: string) {}, set textBaseline(_v: string) {} };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, fills, raw: ctx };
}
const at = (t: number, c = content(), images = []) => { const f = fakeContext(); drawSlideFrame(f.ctx, slidesCut(c, ['u0', 'u1'], images).plan, t, images); return f; };

describe('slidesCut', () => {
  it('is a 1280 by 720 cut, one step per slide at the reading pace, with no clips without the voice', () => {
    const { cut } = slidesCut(content(), []);
    expect(cut.size).toEqual({ w: 1280, h: 720 });
    expect(cut.audio).toEqual([]); expect(cut.music).toBe('None');
    expect(cut.seconds).toBeCloseTo(ownSeconds(TALK, PACE) + ownSeconds('Send the pack three days ahead.', PACE));
  });
  it('starts each stored voice clip where its slide starts, with the clip lengths as the timeline', () => {
    const { cut } = slidesCut(content({}, true), ['u0', 'u1']);
    expect(cut.audio).toEqual([{ url: 'u0', at: 0 }, { url: 'u1', at: 6 }]);
    expect(cut.seconds).toBe(10);
  });
});

describe('drawSlideFrame', () => {
  it('draws the title, and the bullets build in at the cues (all of them when there are none)', () => {
    const early = at(1, content({}, true)), later = at(4, content({}, true));
    expect(early.texts).toContain('Why it matters');
    expect(early.texts.some((x) => x.includes('Decisions'))).toBe(true);
    expect(early.texts.some((x) => x.includes('Not updates'))).toBe(false);
    expect(later.texts.some((x) => x.includes('Not updates'))).toBe(true);
    expect(later.texts.some((x) => x.includes('Weekly'))).toBe(false);
    const own = at(0.1, content({ slides: [{ title: 'T', bullets: ['a', 'b'], narration: 'words here' }] }));
    expect(own.texts.some((x) => x.includes('b'))).toBe(true);
  });
  it('moves on to the next slide and stays on the last one at the end', () => {
    expect(at(7, content({}, true)).texts).toContain('Before');
    expect(at(99, content({}, true)).texts).toContain('Before');
  });
  it('carries the Made with AI corner tag when the deck is voiced, and none when it is captions only', () => {
    expect(at(1, content({}, true)).texts).toContain('Made with AI · voice');
    expect(at(1).texts.some((x) => x.startsWith('Made with AI'))).toBe(false);
  });
  it('shows the firm bar only on the firm template, and the still drawing when its image is ready', () => {
    expect(at(1).fills).toContain('#86BC25');
    expect(at(1, content({ template: 'Minimal' })).fills).not.toContain('#86BC25');
    const img = { complete: true, naturalWidth: 640, naturalHeight: 320 } as HTMLImageElement;
    const f = fakeContext(), c = content({ slides: [{ title: 'T', bullets: ['a'], narration: 'some words', svg: '<rect/>' }] });
    drawSlideFrame(f.ctx, slidesCut(c, [], [img]).plan, 0.1, [img]);
    expect(f.raw.drawImage).toHaveBeenCalled();
  });
});

describe('svgImageSource', () => {
  it('is a data URL of the sanitised drawing, nothing from a script', () => {
    const src = svgImageSource('<svg viewBox="0 0 640 320"><rect width="10" height="10"/><script>alert(1)</script></svg>');
    expect(src).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(src!)).toContain('<rect');
    expect(decodeURIComponent(src!)).not.toContain('script');
  });
  it('is null when nothing survives', () => expect(svgImageSource('<script>x</script>')).toBeNull());
});
