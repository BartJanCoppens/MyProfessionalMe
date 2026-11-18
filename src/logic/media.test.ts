import { describe, expect, it } from 'vitest';
import { LEARN_BY, MEDIA } from '../data';
import type { ReelMedia } from '../types';
import { fmtTime, reelView, startPos, step } from './media';

const reel = MEDIA.L44 as ReelMedia;
const idle = { playing: null, pos: {} };

describe('step', () => {
  it('plays a reel at normal speed', () => {
    expect(step({ playing: 'L44', pos: { L44: 10 } }).pos.L44).toBe(10.25);
  });
  it('stops at the end instead of running past it', () => {
    const m = step({ playing: 'L44', pos: { L44: reel.dur - 0.1 } });
    expect(m).toMatchObject({ playing: null, pos: { L44: reel.dur } });
  });
  it('changes nothing when nothing plays', () => {
    expect(step(idle)).toBe(idle);
  });
});

describe('startPos', () => {
  it('starts a reel at the beginning and restarts a finished one', () => {
    expect(startPos(reel, undefined)).toBe(0);
    expect(startPos(reel, 30)).toBe(30);
    expect(startPos(reel, reel.dur)).toBe(0);
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
  it('belongs to podcast (chapters of the v3 episodes, played on the step player) and reel learnings only, which complete themselves in the database by format', () => {
    for (const id of Object.keys(MEDIA)) expect(['Podcast', 'Reel']).toContain(LEARN_BY[id]?.[4]);
  });
  it('formats times as m:ss', () => {
    expect(fmtTime(605)).toBe('10:05');
  });
});
