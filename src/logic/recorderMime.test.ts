// Which video format this browser's MediaRecorder writes: Chrome mp4 where it can, Safari mp4, Firefox webm.
import { describe, expect, it } from 'vitest';
import { RECORDER_MIMES, extOf, pickRecorderMime } from './recorderMime';

const H264 = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
const only = (...ok: string[]) => (m: string) => ok.includes(m);

describe('pickRecorderMime', () => {
  it('takes the first format in the list that the browser supports', () => {
    expect(pickRecorderMime(() => true)).toBe(H264);
    expect(pickRecorderMime(only('video/webm;codecs=vp9,opus', 'video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickRecorderMime(only('video/webm'))).toBe('video/webm');
  });
  it('gives null when nothing is supported or there is no MediaRecorder, never a guess', () => {
    expect(pickRecorderMime(() => false)).toBeNull();
    expect(pickRecorderMime(undefined)).toBeNull();
  });
  it('puts H.264/AAC first, so MP4 always means a file Safari and iPhone play', () => {
    expect(RECORDER_MIMES[0]).toBe(H264);
  });
  it('never offers a codec-less MP4, which a browser may fill with VP9/Opus; that browser gets webm, labelled as such', () => {
    expect(RECORDER_MIMES).not.toContain('video/mp4');
    expect(pickRecorderMime(only('video/mp4', 'video/webm'))).toBe('video/webm');
    expect(extOf(pickRecorderMime(only('video/mp4', 'video/webm'))!)).toBe('webm');
  });
});

describe('extOf', () => {
  it('is mp4 or webm', () => {
    expect(extOf('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(extOf(H264)).toBe('mp4');
  });
});
