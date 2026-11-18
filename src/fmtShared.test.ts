// The completion wiring Presentation, Slides and Podcast share (playedGuard): a note in View as, and an end that
// completes nothing there and nothing again once the learning was played through.
import { describe, expect, it, vi } from 'vitest';
import { playedGuard } from './fmtShared';

describe('playedGuard', () => {
  it('passes the end on once when it counts', () => {
    const onEnd = vi.fn();
    const g = playedGuard({ ro: false, done: false, onEnd });
    expect(g.note).toBe('');
    g.onEnd();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
  it('completes nothing in View as and says so', () => {
    const onEnd = vi.fn();
    const g = playedGuard({ ro: true, done: false, onEnd });
    expect(g.note).toBe('Viewing someone else: playing it completes nothing.');
    g.onEnd();
    expect(onEnd).not.toHaveBeenCalled();
  });
  it('completes nothing again once done', () => {
    const onEnd = vi.fn();
    playedGuard({ ro: false, done: true, onEnd }).onEnd();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
