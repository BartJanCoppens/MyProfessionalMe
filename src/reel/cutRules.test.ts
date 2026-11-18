// The cut's pure decisions: sizes and bitrates, what a tick does, the size cap and the time left shown to the author.
import { describe, expect, it } from 'vitest';
import { CUT_BITRATE, CUT_SIZES, VIDEO_MAX_BYTES, audioSchedule, bitrateOf, cutStep, estimateBytes, estimateProblem, sizeProblem, timeLeft } from './cutRules';
import type { Cut } from './cutRules';

describe('cut sizes', () => {
  it('has the three sizes with a bitrate each', () => {
    expect(CUT_SIZES['9:16 vertical']).toEqual({ w: 720, h: 1280 });
    expect(CUT_SIZES.slides).toEqual({ w: 1280, h: 720 });
    expect(bitrateOf({ w: 1080, h: 1080 })).toBe(CUT_BITRATE['1080x1080']);
  });
  it('keeps 90 seconds of a reel size at about 28 MB (720x1280) and 34 MB (1080x1080), a third or more under the 50 MB cap', () => {
    const mb = (s: { w: number; h: number }) => estimateBytes(s, 90) / 1024 / 1024;
    expect(mb(CUT_SIZES['9:16 vertical'])).toBeCloseTo(28.2, 0);
    expect(mb(CUT_SIZES['1:1 square'])).toBeCloseTo(33.6, 0);
    for (const s of [CUT_SIZES['9:16 vertical'], CUT_SIZES['1:1 square']]) expect(estimateBytes(s, 90)).toBeLessThan(VIDEO_MAX_BYTES * 0.7);
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

describe('estimateProblem', () => {
  const cut = (p: Partial<Cut>): Cut => ({ size: { w: 1080, h: 1080 }, seconds: 90, audio: [], music: 'None', draw: () => {}, ...p });
  it('refuses a stored cut that will not fit before anything renders, in words', () => {
    expect(estimateProblem(cut({ maxBytes: VIDEO_MAX_BYTES }))).toBeNull();
    expect(estimateProblem(cut({ maxBytes: VIDEO_MAX_BYTES, seconds: 150 }))).toBe('This video would come out at about 55.9 MB · at most 50 MB · make it shorter');
  });
  it('does not limit a download that is never stored', () => expect(estimateProblem(cut({ seconds: 900 }))).toBeNull());
});

describe('audioSchedule', () => {
  it('puts every clip and note on the one audio clock, from the base time', () => {
    const c: Cut = { size: { w: 720, h: 1280 }, seconds: 10, audio: [{ url: 'a', at: 0 }, { url: 'b', at: 4.3 }], music: 'Calm', draw: () => {} };
    const s = audioSchedule(c, 2);
    expect(s.clips).toEqual([2, 6.3]);
    expect(s.musicGain).toBe(0.15);
    expect(s.notes[0].at).toBe(2); expect(s.notes.every((n) => n.at >= 2 && n.at < 12)).toBe(true);
    expect(audioSchedule({ ...c, audio: [] }, 0).musicGain).toBe(0.35);
  });
});
