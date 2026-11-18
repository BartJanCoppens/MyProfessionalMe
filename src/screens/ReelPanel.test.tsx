// @vitest-environment jsdom
// The one reel panel (studios plan, Task 5.3): a seeded reel (L44) scene by scene on the shared step player with the canvas, a
// studio reel in the browser's video element with a captions text track, the transcript and the end told once.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MEDIA } from '../data';
import { reelView, seededReel } from '../fmtReel';
import type { ReelOpts } from '../fmtReel';
import type { ReelContent, ReelMedia } from '../types';
import ReelPanel from './ReelPanel';
import { SavedContent } from './studioPreviews';

vi.mock('../lib/mediaStore', () => ({ mediaUrl: vi.fn(async (p: string) => 'blob:' + p.split('/').pop()) }));

const opts = (o: Partial<ReelOpts> = {}): ReelOpts => ({ ro: false, done: false, onEnd: vi.fn(), answer: undefined, pick: vi.fn(), takeaway: null, ...o });
const studio = (over: Partial<ReelContent> = {}): ReelContent => ({ kind: 'reel', size: '720x1280', seconds: 52, burned: false, look: null, music: 'None', made: 'ai', check: { q: 'Which rate?', opts: ['10%', '15%'], a: 1 },
  video: { path: 'a/b/reel.webm', mime: 'video/webm' },
  scenes: [{ label: 'Hook', text: 'Pillar Two sets a floor.', onScreen: '15% floor', start: 0, seconds: 4, words: [0, 0.5, 1, 1.5, 2] }, { label: 'Close', text: 'Check your group.', onScreen: 'Check it', start: 4.3, seconds: 3, words: [0, 1, 2] }], ...over });
const panel = async (c: ReelContent, o = opts()) => { render(<ReelPanel rl={reelView(c, o)} />); await act(async () => {}); return o; };

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  URL.createObjectURL = vi.fn(() => 'blob:vtt'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('a seeded reel (L44)', () => {
  it('plays on the step player, one step a scene, with the labelled canvas and no video', async () => {
    const c = seededReel(MEDIA.L44 as ReelMedia);
    await panel(c);
    expect(screen.getByText(/Step 1 of 3/)).toBeTruthy();
    expect(screen.getByText('Captions only · no video')).toBeTruthy();
    expect(screen.getByRole('img', { name: c.scenes[0].onScreen })).toBeTruthy();
    expect(document.querySelector('video')).toBeNull();
  });
});

describe('a studio reel', () => {
  it('plays in a video element with a captions track on by default for a separate file', async () => {
    await panel(studio({ burned: false }));
    const track = document.querySelector('video track[kind=captions]') as HTMLTrackElement;
    expect(document.querySelector('video')!.hasAttribute('controls')).toBe(true);
    expect(track.hasAttribute('default')).toBe(true);
    expect(track.getAttribute('label')).toBe('Captions');
  });
  it('keeps the track off by default when the captions are burned in', async () => {
    await panel(studio({ burned: true }));
    expect(document.querySelector('video track[kind=captions]')!.hasAttribute('default')).toBe(false);
  });
  it('lists every scene in the transcript', async () => {
    await panel(studio());
    const t = screen.getByTestId('transcript').textContent!;
    expect(t).toContain('Pillar Two sets a floor.');
    expect(t).toContain('Check your group.');
    expect(t).toContain('On screen: 15% floor');
  });
  const fail = (code: number) => { const v = document.querySelector('video')!; Object.defineProperty(v, 'error', { value: { code }, configurable: true }); act(() => { fireEvent.error(v); }); };
  it('says the browser cannot play the format only for MEDIA_ERR_SRC_NOT_SUPPORTED (4)', async () => {
    await panel(studio());
    fail(4);
    expect(screen.getByRole('alert').textContent).toBe('This browser cannot play this video (WebM) · the transcript has every word');
    expect(screen.getByTestId('transcript')).toBeTruthy();
  });
  it('says the video could not be loaded for any other failure (a network or decode error is not a format problem)', async () => {
    await panel(studio());
    fail(2);
    expect(screen.getByRole('alert').textContent).toBe('The video could not be loaded · try again later · the transcript has every word');
  });
  it('shows the video again once its link changes (a failure does not stick to the next file)', async () => {
    const c = studio(), o = opts(), { rerender } = render(<ReelPanel rl={reelView(c, o)} />);
    await act(async () => {});
    fail(2);
    expect(screen.getByRole('alert')).toBeTruthy();
    rerender(<ReelPanel rl={reelView({ ...c, video: { path: 'a/b/other.webm', mime: 'video/webm' } }, o)} />);
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('video')!.getAttribute('src')).toBe('blob:other.webm');
  });
  it('tells the end once the video has played through', async () => {
    const o = await panel(studio());
    act(() => { fireEvent.ended(document.querySelector('video')!); });
    expect(o.onEnd).toHaveBeenCalledTimes(1);
  });
  it('says Square video for 1:1 and shows the takeaway only when there is one', async () => {
    await panel(studio({ size: '1080x1080' }), opts({ takeaway: 'Check it.' }));
    expect(screen.getByText('Square video · 0:52')).toBeTruthy();
    expect(screen.getByText('Check it.')).toBeTruthy();
  });
});

describe('the check', () => {
  it('reports the pick by its written place', async () => {
    const o = await panel(studio());
    fireEvent.click(screen.getByRole('button', { name: '15%' }));
    expect(o.pick).toHaveBeenCalledWith(1);
  });
});

describe('Made with AI, through the one AiMadeTag (M5)', () => {
  it('is shown on the panel when the reel was voiced or its rows were AI-drafted, and nowhere twice', async () => {
    await panel(studio({ made: 'scripted' }), opts({ ai: true }));
    expect(screen.getAllByText('Made with AI')).toHaveLength(1);
    cleanup();
    await panel(studio({ made: 'scripted' }), opts({ ai: false }));
    expect(screen.queryByText('Made with AI')).toBeNull();
  });
  it('is shown in the review view for an AI-drafted text-only reel and for a voiced one, with the reviewer note about the video', async () => {
    render(<SavedContent t={{ key: 'c1', content: studio({ made: 'scripted' }), hours: 0, still: false, drafted: true }} />);
    await act(async () => {});
    expect(screen.getAllByText('Made with AI')).toHaveLength(1);
    expect(screen.getByText("Check the video itself: the app can't verify what it shows")).toBeTruthy();
    cleanup();
    render(<SavedContent t={{ key: 'c2', content: studio({ made: 'ai' }), hours: 0, still: false }} />);
    await act(async () => {});
    expect(screen.getAllByText('Made with AI')).toHaveLength(1);
    cleanup();
    render(<SavedContent t={{ key: 'c3', content: studio({ made: 'scripted', video: null }), hours: 0, still: false }} />);
    await act(async () => {});
    expect(screen.queryByText('Made with AI')).toBeNull();
    expect(screen.queryByText(/Check the video itself/)).toBeNull();
  });
});
