// The route along `next` (Horizon's levelOrder): forks depth first with the rejoin after all their routes, sections
// presented where they stand, parts no route reaches left out.
import { describe, expect, it } from 'vitest';
import { routeOf } from './route';
import type { Frame } from './types';

const f = (id: string, next: string[] = [], more: Partial<Frame> = {}): Frame => ({ id, x: 0, y: 0, next, title: id, body: '', viz: null, ...more });
const ids = (F: Frame[]) => routeOf(F).map((s) => s.frame.id);

describe('the route', () => {
  it('follows next from the first part', () => { expect(ids([f('a', ['b']), f('b', ['c']), f('c')])).toEqual(['a', 'b', 'c']); });
  it('takes a fork\'s first route first and rejoins after every route', () => {
    expect(ids([f('a', ['b', 'c']), f('b', ['d']), f('c', ['d']), f('d')])).toEqual(['a', 'b', 'c', 'd']);
  });
  it('leaves out a part no route reaches, and survives a cycle', () => {
    expect(ids([f('a', ['b']), f('b', ['a']), f('lost')])).toEqual(['a', 'b']);
  });
  it('presents a section\'s card, then its parts, then goes on', () => {
    const sec = { frames: [f('s1', ['s2']), f('s2')], theme: { canvas: 'night', canvasCustom: '#000000', slide: 'nocturne', slideCustom: '#000000' } };
    const route = routeOf([f('a', ['b'], { section: sec }), f('b')]);
    expect(route.map((s) => s.frame.id)).toEqual(['a', 's1', 's2', 'b']);
    expect(route.map((s) => s.levelKey)).toEqual(['', '/a', '/a', '']);
    expect(route[1].level.map((x) => x.id)).toEqual(['s1', 's2']);
  });
});
