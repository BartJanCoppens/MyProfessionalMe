// Which video format this browser's MediaRecorder writes: Chrome mp4 where it can, Safari mp4, Firefox webm.
import { describe, expect, it } from 'vitest';
import { RECORDER_MIMES, extOf, pickRecorderMime } from './recorderMime';

const only = (...ok: string[]) => (m: string) => ok.includes(m);

describe('pickRecorderMime', () => {
  it('takes the first format in the list that the browser supports', () => {
    expect(pickRecorderMime(() => true)).toBe('video/mp4;codecs=avc1,mp4a');
    expect(pickRecorderMime(only('video/mp4'))).toBe('video/mp4');
    expect(pickRecorderMime(only('video/webm;codecs=vp9,opus', 'video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickRecorderMime(only('video/webm'))).toBe('video/webm');
  });
  it('gives null when nothing is supported or there is no MediaRecorder, never a guess', () => {
    expect(pickRecorderMime(() => false)).toBeNull();
    expect(pickRecorderMime(undefined)).toBeNull();
  });
  it('keeps the list in the brief', () => {
    expect(RECORDER_MIMES).toEqual(['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']);
  });
});

describe('extOf', () => {
  it('is mp4 or webm', () => {
    expect(extOf('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(extOf('video/mp4;codecs=avc1,mp4a')).toBe('mp4');
  });
});
