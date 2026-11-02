import { describe, expect, it } from 'vitest';
import { LEARN_BY, MEDIA } from '../data';
import type { PodMedia, ReelMedia } from '../types';
import { fmtTime, podSave, podView, reelView, startPos, step } from './media';

const pod = MEDIA.L42 as PodMedia, reel = MEDIA.L44 as ReelMedia;
const idle = { playing: null, pos: {}, speed: '1' };

describe('podView', () => {
  it('starts at zero without NaN', () => {
    expect(podView(pod, 0, false)).toMatchObject({ time: '0:00', left: '−28:00', w: '0.0%', playIcon: '▶', playTitle: 'Play' });
  });
  it('marks the chapter being played', () => {
    expect(podView(pod, 600, true).chapters.map((c) => c.fw)).toEqual([400, 600, 400]);
    expect(podView(pod, 600, true).playIcon).toBe('❚❚');
  });
});

describe('step', () => {
  it('plays podcasts at the chosen speed and reels at normal speed', () => {
    expect(step({ playing: 'L42', pos: { L42: 10 }, speed: '2' }).pos.L42).toBe(10.5);
    expect(step({ playing: 'L44', pos: { L44: 10 }, speed: '2' }).pos.L44).toBe(10.25);
  });
  it('stops at the end instead of running past it', () => {
    const m = step({ playing: 'L44', pos: { L44: reel.dur - 0.1 }, speed: '1' });
    expect(m).toMatchObject({ playing: null, pos: { L44: reel.dur } });
  });
  it('changes nothing when nothing plays', () => {
    expect(step(idle)).toBe(idle);
  });
});

describe('startPos', () => {
  it('resumes a podcast from saved progress and restarts a finished one', () => {
    expect(startPos(pod, undefined, 50)).toBe(pod.dur / 2);
    expect(startPos(pod, pod.dur, 50)).toBe(0);
    expect(startPos(reel, undefined, 100)).toBe(0);
  });
});

describe('podSave', () => {
  it('saves progress once per tenth and completes at 80%', () => {
    expect(podSave(pod.dur * 0.05, pod.dur, undefined)).toBeNull();
    expect(podSave(pod.dur * 0.12, pod.dur, undefined)).toEqual({ state: 'in-progress', pct: 12 });
    expect(podSave(pod.dur * 0.15, pod.dur, { state: 'in-progress', pct: 12 })).toBeNull();
    expect(podSave(pod.dur * 0.8, pod.dur, { state: 'in-progress', pct: 70 })).toEqual({ state: 'accepted', pct: 100 });
    expect(podSave(pod.dur, pod.dur, { state: 'accepted', pct: 100 })).toBeNull();
  });
});

describe('reelView', () => {
  it('shows the title before playing, then the caption for the moment', () => {
    expect(reelView(reel, 0, false, undefined, 'Title').caption).toBe('Title');
    expect(reelView(reel, reel.dur - 1, true, undefined, 'Title').caption).toBe(reel.caps[reel.caps.length - 1]);
    expect(reelView(reel, reel.dur, false, undefined, 'Title').playIcon).toBe('↻');
  });
  it('marks a right and a wrong answer', () => {
    const right = reelView(reel, 0, false, reel.a, 'T');
    expect(right).toMatchObject({ hasFb: true, fb: 'Right. The reel is complete.' });
    expect(right.opts[reel.a].bd).toBe('#86BC25');
    expect(reelView(reel, 0, false, (reel.a + 1) % reel.opts.length, 'T').fb).toBe('Not quite. Watch the reel again and try once more.');
  });
});

describe('self-completing media', () => {
  it('belongs to podcast and reel learnings only, which complete themselves in the database by format', () => {
    for (const id of Object.keys(MEDIA)) expect(['Podcast', 'Reel']).toContain(LEARN_BY[id]?.[4]);
  });
  it('formats times as m:ss', () => {
    expect(fmtTime(605)).toBe('10:05');
  });
});
