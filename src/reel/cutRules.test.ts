// The cut's pure decisions: sizes and bitrates, what a tick does, the size cap and the time left shown to the author.
import { describe, expect, it } from 'vitest';
import { CUT_BITRATE, CUT_SIZES, VIDEO_MAX_BYTES, bitrateOf, cutStep, sizeProblem, timeLeft } from './cutRules';

describe('cut sizes', () => {
  it('has the three sizes with a bitrate each', () => {
    expect(CUT_SIZES['9:16 vertical']).toEqual({ w: 720, h: 1280 });
    expect(CUT_SIZES.slides).toEqual({ w: 1280, h: 720 });
    expect(bitrateOf({ w: 1080, h: 1080 })).toBe(CUT_BITRATE['1080x1080']);
  });
  it('keeps 90 seconds of every size at about 34 MB or less, well under the 50 MB cap (video plus 128 kbit/s audio)', () => {
    for (const s of Object.values(CUT_SIZES)) expect(((bitrateOf(s) + 128_000) * 90) / 8 / 1024 / 1024).toBeLessThan(34);
  });
});

describe('cutStep', () => {
  it('keeps going, ends at the length, and gives way to a hidden tab or a cancel first', () => {
    expect(cutStep({ t: 3, seconds: 10, hidden: false, aborted: false })).toBe('go');
    expect(cutStep({ t: 10, seconds: 10, hidden: false, aborted: false })).toBe('done');
    expect(cutStep({ t: 10, seconds: 10, hidden: true, aborted: false })).toBe('hidden');
    expect(cutStep({ t: 3, seconds: 10, hidden: true, aborted: true })).toBe('cancelled');
  });
});

describe('sizeProblem and timeLeft', () => {
  it('names a video over the cap with its size, and accepts one at it', () => {
    expect(sizeProblem(VIDEO_MAX_BYTES)).toBeNull();
    expect(sizeProblem(51 * 1024 * 1024)).toBe('The video came out at 51.0 MB · at most 50 MB · make it shorter');
  });
  it('is the length still to run, as m:ss', () => {
    expect(timeLeft(90, 42)).toBe('0:52');
    expect(timeLeft(90, 0)).toBe('1:30');
    expect(timeLeft(90, 100)).toBe('0:00');
  });
});
