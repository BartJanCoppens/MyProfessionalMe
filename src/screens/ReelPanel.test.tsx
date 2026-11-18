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
  it('says so when the browser cannot play a WebM video', async () => {
    await panel(studio());
    act(() => { fireEvent.error(document.querySelector('video')!); });
    expect(screen.getByRole('alert').textContent).toBe('This browser cannot play this video (WebM) · the transcript has every word');
    expect(screen.getByTestId('transcript')).toBeTruthy();
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
