import { describe, expect, it } from 'vitest';
import { LEARN, LEARN_BY } from '../data';
import { cover, formatTiles } from './covers';

const row = (id: string) => LEARN_BY[id];

describe('cover', () => {
  it('picks the illustration from the format', () => {
    const kinds = Object.fromEntries(LEARN.map((r, i) => [r[4], cover(r, i, 'not-started', 0).kind]));
    expect(kinds).toMatchObject({ Avatar: 'avatar', Classroom: 'class', 'E-learning': 'elearn', Book: 'book', Game: 'game' });
    for (const k of Object.values(kinds)) expect(['pod', 'reel', 'avatar', 'game', 'book', 'class', 'elearn', 'mentor', 'web', 'cert']).toContain(k);
  });
  it('ticks a learning that is done or awaiting acceptance', () => {
    expect(cover(row('L1'), 0, 'accepted', 100).cvDone).toBe(true);
    expect(cover(row('L1'), 0, 'submitted', 100).cvDone).toBe(true);
    expect(cover(row('L1'), 0, 'in-progress', 40).cvDone).toBe(false);
    expect(cover(row('L1'), 0, 'not-started', 0).cvDone).toBe(false);
  });
  it('tags each card with its format and study time', () => {
    expect(cover(row('L1'), 0, 'not-started', 0).cvTag).toBe('E-learning · 6 h');
  });
  it('draws the same cover every time', () => {
    expect(cover(row('L1'), 3, 'in-progress', 50)).toEqual(cover(row('L1'), 3, 'in-progress', 50));
  });
});

describe('formatTiles', () => {
  it('counts every learning once under its format, plus All', () => {
    const tiles = formatTiles(LEARN, 'all', () => {});
    expect(tiles[0]).toMatchObject({ key: 'all', label: 'All formats', count: LEARN.length + ' learnings', swBd: 'rgba(255,255,255,.4)' });
    expect(tiles[1].swBd).toBe('#d5dacf');
    expect(tiles.slice(1).reduce((n, t) => n + parseInt(t.count, 10), 0)).toBe(LEARN.length);
  });
  it('marks the chosen format, and choosing it again clears the filter', () => {
    const picked: string[] = [];
    const tiles = formatTiles(LEARN, 'Book', (f) => picked.push(f));
    tiles.find((t) => t.key === 'Book')!.pick();
    tiles.find((t) => t.key === 'Game')!.pick();
    expect(picked).toEqual(['all', 'Game']);
    expect(tiles.filter((t) => t.on).map((t) => t.key)).toEqual(['Book']);
  });
});
