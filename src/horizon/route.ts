// The route a presentation is presented along (studios plan, Task 3.3). levelOrder is copied from Horizon's mindmap.ts
// (indexOut, reachFrom, levelOrder): within a level, from its first part along `next`, depth first along the first route
// of each fork, a rejoin after all its routes. A section is presented where it stands: its own card, then its parts
// in their order, then on along the level it is in (Horizon dives in and comes back out). A part no route reaches is
// not presented, as in Horizon.
import type { Frame } from './types';

const indexOut = (F: Frame[], f: Frame) => (f.next || []).map((id) => F.findIndex((g) => g.id === id)).filter((j) => j >= 0);
function reachFrom(F: Frame[], start: number): Set<number> {
  const seen = new Set<number>();
  if (!F[start]) return seen;
  const todo = [start];
  seen.add(start);
  while (todo.length) for (const j of indexOut(F, F[todo.pop()!])) if (!seen.has(j)) { seen.add(j); todo.push(j); }
  return seen;
}
export function levelOrder(F: Frame[]): number[] {
  const reach = reachFrom(F, 0), indeg = new Map<number, number>();
  reach.forEach((i) => indexOut(F, F[i]).forEach((j) => { if (reach.has(j)) indeg.set(j, (indeg.get(j) || 0) + 1); }));
  const out: number[] = [], done = new Set<number>(), stack = reach.has(0) ? [0] : [];
  while (out.length < reach.size) {
    // A cycle: take the earliest part not yet placed.
    if (!stack.length) stack.push([...reach].filter((i) => !done.has(i)).sort((a, b) => a - b)[0]);
    const i = stack.pop()!;
    if (done.has(i)) continue;
    done.add(i); out.push(i);
    const outs = indexOut(F, F[i]).filter((j) => reach.has(j) && !done.has(j));
    for (const j of outs) indeg.set(j, (indeg.get(j) || 1) - 1);
    for (const j of [...outs].reverse()) if ((indeg.get(j) || 0) <= 0) stack.push(j);
  }
  return out;
}

// One stop of the route: the slide, the level it lies in (its neighbours on the canvas) and that level's key.
export type RouteStep = { frame: Frame; level: Frame[]; levelKey: string };

export function routeOf(frames: Frame[], levelKey = ''): RouteStep[] {
  return levelOrder(frames).flatMap((i) => {
    const f = frames[i], here: RouteStep = { frame: f, level: frames, levelKey };
    return f.section ? [here, ...routeOf(f.section.frames, levelKey + '/' + f.id)] : [here];
  });
}
