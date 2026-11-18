// Reels (studios plan, Task 5.3): the seeded reels as content on the one step player, the check that completes a reel, the end
// that saves in-progress once, and what is saved for whom. There is no reel clock of its own any more.
import { describe, expect, it, vi } from 'vitest';
import { MEDIA } from './data';
import { reelView, seededReel } from './fmtReel';
import { saveProgress } from './lib/learnerStore';
import { cfg, harness, person, stubWindow } from './test/harness';
import { initState, Logic } from './model';
import type { ReelMedia } from './types';

vi.mock('./lib/learnerStore', async (orig) => ({ ...(await orig<object>()), saveProgress: vi.fn(async () => {}) }));
stubWindow();

const L44 = MEDIA.L44 as ReelMedia;
const rl = (h: ReturnType<typeof harness>) => h.vm().det.rl!;
const pick = (h: ReturnType<typeof harness>, label: string) => rl(h).opts.find((o) => o.label === label)!.pick();

describe('seededReel', () => {
  it('turns a v3 reel into three scenes of 30 s with its own question', () => {
    const c = seededReel(L44);
    expect(c.scenes).toHaveLength(3);
    expect(c.scenes.map((s) => [s.start, s.seconds])).toEqual([[0, 30], [30, 30], [60, 30]]);
    expect(c.check).toEqual({ q: L44.q, opts: L44.opts, a: L44.a });
    expect(c).toMatchObject({ video: null, made: 'scripted', seconds: 90 });
    expect(c.scenes.every((s) => s.words === null)).toBe(true);
  });
});

describe('the reel panel view-model (the seeded reels L44 to L47 keep playing)', () => {
  it('is there for every seeded reel and says it has captions only', () => {
    for (const id of ['L44', 'L45', 'L46', 'L47']) {
      const v = harness({ state: { detailId: id } }).vm().det.rl!;
      expect(v.sub).toBe('Captions only · no video');
      expect(v.rc.scenes.length).toBeGreaterThan(0);
    }
  });
  it('completes on the right answer, once', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ state: { detailId: 'L44' } });
    pick(h, L44.opts[1]);
    expect(saveProgress).toHaveBeenCalledWith('u1', 'L44', { state: 'accepted', pct: 100 });
    pick(h, L44.opts[1]);
    expect(saveProgress).toHaveBeenCalledTimes(1);
  });
  it('saves nothing for a wrong answer and says to try again', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ state: { detailId: 'L45' } });
    const M = MEDIA.L45 as ReelMedia;
    pick(h, M.opts[(M.a + 1) % M.opts.length]);
    expect(rl(h).fb).toBe('Not quite. Watch the reel again and try once more.');
    expect(saveProgress).not.toHaveBeenCalled();
  });
  it('saves nothing in View as, not even a right answer or the end', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ subject: person({ readOnly: true }), state: { detailId: 'L46' } });
    const M = MEDIA.L46 as ReelMedia;
    pick(h, M.opts[M.a]);
    rl(h).onEnd();
    expect(saveProgress).not.toHaveBeenCalled();
  });
  it('saves in-progress once when the reel is played to the end', () => {
    vi.mocked(saveProgress).mockClear();
    const h = harness({ state: { detailId: 'L47' } });
    rl(h).onEnd(); rl(h).onEnd();
    expect(saveProgress).toHaveBeenCalledTimes(1);
    expect(saveProgress).toHaveBeenCalledWith('u1', 'L47', { state: 'in-progress', pct: 0 });
  });
  it('carries no answer over to another person', () => {
    const h = harness({ subject: person({ id: 'u2', readOnly: true }), state: { detailId: 'L44', answers: { L44: 1 }, answersFor: 'u1' } });
    expect(rl(h).hasFb).toBe(false);
  });
});

describe('the check', () => {
  it('shows the options in written order rotated by the question length, display only', () => {
    const c = seededReel(L44), shift = c.check.q.length % c.check.opts.length;
    const v = reelView(c, { ro: false, done: false, onEnd: () => {}, answer: undefined, pick: () => {}, takeaway: null });
    expect(v.opts.map((o) => o.label)).toEqual(c.check.opts.map((_, i) => c.check.opts[(i + shift) % c.check.opts.length]));
  });
  it('tells which option was picked by its written place', () => {
    const picked = vi.fn(), c = seededReel(L44);
    reelView(c, { ro: false, done: false, onEnd: () => {}, answer: undefined, pick: picked, takeaway: null }).opts.find((o) => o.label === c.check.opts[0])!.pick();
    expect(picked).toHaveBeenCalledWith(0);
  });
});

describe('one clock', () => {
  it('has no media tick and no media state any more', () => {
    expect('tick' in Logic.prototype).toBe(false);
    expect(initState(cfg)).not.toHaveProperty('media');
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
