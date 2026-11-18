// Reels (design v3, F11): the viewer, self-completion and what is saved for whom. Podcasts play on the step player (PodcastPanel.test.tsx).
import { describe, expect, it, vi } from 'vitest';
import { harness, person, stubWindow } from './test/harness';
import { saveProgress } from './lib/learnerStore';

vi.mock('./lib/learnerStore', async (orig) => ({ ...(await orig<object>()), saveProgress: vi.fn(async () => {}) }));
stubWindow();

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

describe('the reel clock', () => {
  const playing = (id: string, pos: number, owner = 'u1') => ({ media: { playing: id, owner, pos: { [id]: pos } } });
  it('plays but saves nothing for someone else', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ subject: person({ readOnly: true }), state: { detailId: 'L44', ...playing('L44', 40) } });
    h.L().tick();
    expect(h.state.media.pos.L44).toBe(40.25);
    expect(saveProgress).not.toHaveBeenCalled();
  });
  it('stops when the viewed person changes', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ subject: person({ id: 'u2' }), state: { detailId: 'L44', ...playing('L44', 40, 'u1') } });
    h.L().tick();
    expect(h.state.media).toMatchObject({ playing: null, pos: { L44: 40 } });
    expect(saveProgress).not.toHaveBeenCalled();
  });
  it('carries no position or answer over to another person', () => {
    const other = harness({ subject: person({ id: 'u2', readOnly: true }), state: { detailId: 'L44', media: { playing: null, owner: 'u1', pos: { L44: 50 } }, answers: { L44: 1 }, answersFor: 'u1' } }).vm();
    expect(other.det.reel!.hasFb).toBe(false);
    expect(other.det.reel!.w).toBe('0.0%');
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
