import { describe, expect, it } from 'vitest';
import { LEARN_BY, MEDIA } from '../data';
import { fmtTime } from './media';

describe('self-completing media', () => {
  it('belongs to podcast (chapters of the v3 episodes, played on the step player) and reel learnings only, which complete themselves in the database by format', () => {
    for (const id of Object.keys(MEDIA)) expect(['Podcast', 'Reel']).toContain(LEARN_BY[id]?.[4]);
  });
  it('formats times as m:ss', () => {
    expect(fmtTime(605)).toBe('10:05');
  });
});
