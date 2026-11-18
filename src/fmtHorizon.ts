// A Presentation's panel as view-model (studios plan, Task 3.3): the .horizon file its content names, played by the
// Horizon player (src/horizon/HorizonPlayer.tsx), and completion ('media'): reaching the last slide of the route
// completes it once (detail.last). With ?motion=off or reduced motion the player fades from slide to slide. The same
// view shows the file to its author and reviewers (studioPreviews.tsx), where playing it completes nothing.
import { playedGuard, playedOpts } from './fmtShared';
import { stillMotion } from './fmtMotion';
import { deckLine } from './logic/horizonItem';
import type { Item, Logic } from './model';
import type { HorizonContent } from './types';

// ro: View as (nothing is saved); done: already played to the end; onLast: the last slide was reached.
export type HorizonOpts = { ro: boolean; still: boolean; done: boolean; onLast: () => void };

export function horizonView(c: HorizonContent, o: HorizonOpts) {
  const played = playedGuard({ ro: o.ro, done: o.done, onEnd: o.onLast });
  return {
    path: c.path, still: o.still, sub: deckLine(c) + ' · Horizon presentation',
    note: played.note, onLast: played.onEnd,
  };
}
export type HorizonView = ReturnType<typeof horizonView>;

export function horizonVals(L: Logic, it: Item, c: HorizonContent) {
  const { onEnd, ...played } = playedOpts<'horizon'>(L, it, 'Played to the last slide');
  return horizonView(c, { ...played, still: stillMotion(L), onLast: onEnd });
}
