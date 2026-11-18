// @vitest-environment jsdom
// The Slides video button on its own: the audio context is opened in the click, a stale tab's signed links are renewed before
// rendering, a part-voiced deck says it has no sound, and the download link is released.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as media from '../lib/mediaStore';
import { prepareAudio, renderCut } from '../reel/compositor';
import type { SlidesContent } from '../types';
import SlidesVideo from './SlidesVideo';

vi.mock('../lib/mediaStore', () => ({ mediaUrl: vi.fn() }));
vi.mock('../reel/compositor', () => ({ renderCut: vi.fn(), prepareAudio: vi.fn() }));

const slide = (title: string, audio = false) => ({ title, bullets: ['a'], narration: 'Some words here.', ...(audio && { audio: { path: 'p/' + title + '.mp3', seconds: 4, marks: [] } }) });
const deck = (...audio: boolean[]): SlidesContent => ({ kind: 'slides', template: 'Minimal', transitions: 'Calm', made: 'scripted', seconds: 8, slides: audio.map((a, k) => slide('s' + k, a)) });
const made = { blob: new Blob(['x']), mime: 'video/mp4', ext: 'mp4' as const, seconds: 8 };
let n = 0;

beforeEach(() => {
  vi.clearAllMocks(); n = 0;
  vi.mocked(media.mediaUrl).mockImplementation(async (p) => 'url' + ++n + ':' + p);
  vi.mocked(prepareAudio).mockReturnValue({} as never);
  vi.mocked(renderCut).mockResolvedValue(made);
  URL.createObjectURL = vi.fn(() => 'blob:v'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const press = async () => { await act(async () => {}); await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Download as video' })); }); };

describe('SlidesVideo', () => {
  it('opens the audio context in the click, before anything is awaited, and hands it to the render', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SlidesVideo content={deck(false, false)} title="Steering" />);
    await press();
    expect(prepareAudio).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prepareAudio).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(renderCut).mock.invocationCallOrder[0]);
    expect(renderCut).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ context: expect.anything() }));
    click.mockRestore();
  });
  it('renews the voice-over links before rendering, so a tab left open for hours still works', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SlidesVideo content={deck(true, true)} title="Steering" />);
    await act(async () => {});
    expect(media.mediaUrl).toHaveBeenCalledTimes(2);
    await press();
    expect(media.mediaUrl).toHaveBeenCalledTimes(4);
    const cut = vi.mocked(renderCut).mock.calls[0][0];
    expect(cut.audio.map((a) => a.url)).toEqual(['url3:p/s0.mp3', 'url4:p/s1.mp3']);
    click.mockRestore();
  });
  it('closes the audio context it opened when the cut cannot be built', async () => {
    const close = vi.fn(async () => {});
    vi.mocked(prepareAudio).mockReturnValue({ close } as never);
    render(<SlidesVideo content={deck(true)} title="Steering" />);
    await act(async () => {});
    vi.mocked(media.mediaUrl).mockRejectedValue(new Error('gone'));
    await press();
    expect(renderCut).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('says a part-voiced deck is cut without sound', async () => {
    render(<SlidesVideo content={deck(true, false)} title="Steering" />);
    await act(async () => {});
    expect(screen.getByText(/Only some slides are voiced, so this video has no sound/)).toBeTruthy();
  });
  it('releases the download link a few seconds after handing the file over', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SlidesVideo content={deck(false)} title="Steering" />);
    await press();
    expect(click).toHaveBeenCalledTimes(1); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:v');
    click.mockRestore();
  });
});
