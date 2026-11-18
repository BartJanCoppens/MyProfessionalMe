// The completion wiring Presentation, Slides and Podcast share (playedGuard): a note in View as, and an end that
// completes nothing there and nothing again once the learning was played through.
import { describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadText, playedGuard } from './fmtShared';

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

describe('downloading a file (one helper for text and blobs)', () => {
  it('clicks a link to the blob under its name and releases the link only after the browser took it', () => {
    vi.useFakeTimers();
    const click = vi.fn(), anchor = { href: '', download: '', click };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:f'), revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const blob = new Blob(['v'], { type: 'video/mp4' });
    downloadBlob('deck.mp4', blob);
    expect(create).toHaveBeenCalledWith(blob);
    expect(anchor).toMatchObject({ href: 'blob:f', download: 'deck.mp4' });
    expect(click).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000);
    expect(revoke).toHaveBeenCalledWith('blob:f');
    downloadText('a.ics', 'x', 'text/calendar');
    expect((create.mock.calls[1][0] as Blob).type).toBe('text/calendar');
    vi.useRealTimers(); vi.unstubAllGlobals(); create.mockRestore(); revoke.mockRestore();
  });
});
