// Podcasts and reels (design v3, F11): players, self-completion and what is saved for whom.
import { describe, expect, it, vi } from 'vitest';
import { harness, person, stubWindow, flush } from './test/harness';
import { saveProgress } from './lib/learnerStore';

vi.mock('./lib/learnerStore', async (orig) => ({ ...(await orig<object>()), saveProgress: vi.fn(async () => {}) }));
stubWindow();

const playing = (id: string, pos: number, owner = 'u1') => ({ media: { playing: id, owner, pos: { [id]: pos }, speed: '1' } });

describe('the reel viewer', () => {
  it('completes a reel on the right answer, once', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ state: { detailId: 'L44' } });
    h.vm().det.reel!.opts[1].pick();
    expect(saveProgress).toHaveBeenCalledWith('u1', 'L44', { state: 'accepted', pct: 100 });
    h.vm().det.reel!.opts[1].pick();
    expect(saveProgress).toHaveBeenCalledTimes(1);
  });
  it('saves nothing for a wrong answer', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ state: { detailId: 'L44' } });
    h.vm().det.reel!.opts[0].pick();
    expect(h.vm().det.reel!.fb).toBe('Not quite. Watch the reel again and try once more.');
    expect(saveProgress).not.toHaveBeenCalled();
  });
});

describe('the podcast player', () => {
  it('saves progress once per tenth and completes at 80%', () => {
    vi.mocked(saveProgress).mockClear();
    harness({ state: { detailId: 'L42', ...playing('L42', 340) } }).L().tick();
    expect(saveProgress).toHaveBeenCalledWith('u1', 'L42', { state: 'in-progress', pct: 20 });
    harness({ state: { detailId: 'L42', ...playing('L42', 1680 * 0.8) } }).L().tick();
    expect(saveProgress).toHaveBeenLastCalledWith('u1', 'L42', { state: 'accepted', pct: 100 });
  });
  it('plays but saves nothing for someone else', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ subject: person({ readOnly: true }), state: { detailId: 'L42', ...playing('L42', 1000) } });
    h.L().tick();
    expect(h.state.media.pos.L42).toBe(1000.25);
    expect(saveProgress).not.toHaveBeenCalled();
  });
  it('stops when the viewed person changes', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ subject: person({ id: 'u2' }), state: { detailId: 'L42', ...playing('L42', 340, 'u1') } });
    h.L().tick();
    expect(h.state.media).toMatchObject({ playing: null, pos: { L42: 340 } });
    expect(saveProgress).not.toHaveBeenCalled();
  });
  it('tries again after a failed save', async () => {
    vi.mocked(saveProgress).mockClear();
    vi.mocked(saveProgress).mockRejectedValueOnce(new Error('offline'));
    const state = { detailId: 'L42', ...playing('L42', 1400, 'u9') };
    harness({ subject: person({ id: 'u9' }), state }).L().tick();
    await flush();
    harness({ subject: person({ id: 'u9' }), state }).L().tick();
    expect(saveProgress).toHaveBeenCalledTimes(2);
  });
  it('carries no position or answer over to another person', () => {
    const other = harness({ subject: person({ id: 'u2', readOnly: true }), state: { detailId: 'L42', media: { playing: null, owner: 'u1', pos: { L42: 1500 }, speed: '1' } } }).vm();
    expect(other.det.pod!.time).toBe('0:00');
    const reel = harness({ subject: person({ id: 'u2' }), state: { detailId: 'L44', answers: { L44: 1 }, answersFor: 'u1' } }).vm();
    expect(reel.det.reel!.hasFb).toBe(false);
  });
});

describe('the library', () => {
  it('shows a quick-learning strip of reels with their length', () => {
    const vm = harness().vm();
    expect(vm.showReels).toBe(true);
    expect(vm.reelStrip.map((r) => r.id)).toEqual(['L44', 'L45', 'L46', 'L47']);
    expect(vm.libItems.find((i) => i.id === 'L42')!.hoursLabel).toBe('28 min');
  });
});
