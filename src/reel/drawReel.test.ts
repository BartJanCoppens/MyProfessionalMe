// The reel frame on a canvas (studios plan, Task 5.3): the on-screen text, the burned-in caption and the "Made with AI" tag.
import { describe, expect, it, vi } from 'vitest';
import type { CutPlan } from '../logic/reelFrame';
import { drawReelFrame } from './drawReel';

const plan = (over: Partial<CutPlan> = {}): CutPlan => ({ size: { w: 720, h: 1280 }, scenes: [{ start: 0, seconds: 4, onScreen: 'Hook text' }],
  captions: [{ start: 0, end: 4, text: 'Spoken words.' }], burned: true, look: { id: 'k', name: 'HR director · 50s', portrait: 'p1', color: '#2f7fc1' }, aiTag: false, ...over });

function fakeContext() {
  const texts: string[] = [];
  const ctx = { fillText: vi.fn((s: string) => { texts.push(s); }), measureText: (s: string) => ({ width: s.length * 10 }), drawImage: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), set fillStyle(_v: string) {}, set font(_v: string) {}, set textAlign(_v: string) {}, set textBaseline(_v: string) {} };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, raw: ctx };
}

describe('drawReelFrame', () => {
  it('draws the on-screen text and the burned-in caption', () => {
    const { ctx, texts } = fakeContext();
    drawReelFrame(ctx, plan(), 1, null);
    expect(texts).toContain('Hook text');
    expect(texts).toContain('Spoken words.');
  });
  it('draws no caption when it is not burned in, and no tag unless the AI made it', () => {
    const { ctx, texts } = fakeContext();
    drawReelFrame(ctx, plan({ burned: false }), 1, null);
    expect(texts).not.toContain('Spoken words.');
    expect(texts).not.toContain('Made with AI');
  });
  it('draws "Made with AI" when the plan says so', () => {
    const { ctx, texts } = fakeContext();
    drawReelFrame(ctx, plan({ aiTag: true }), 1, null);
    expect(texts).toContain('Made with AI');
  });
  it('draws the stock portrait when its image is ready', () => {
    const { ctx, raw } = fakeContext();
    drawReelFrame(ctx, plan(), 1, { complete: true, naturalWidth: 120, naturalHeight: 150 } as HTMLImageElement);
    expect(raw.drawImage).toHaveBeenCalled();
  });
});
