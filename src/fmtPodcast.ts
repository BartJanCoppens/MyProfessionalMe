// The podcast panel as view-model (studios plan, Task 3.5): the one player of every episode, a stored studio episode (each turn's
// audio, the chapters and the transcript) or a v3 episode (chapters on the clock, no recording), and completion: listening to the
// end completes it (media). The Podcast Studio's preview and the review views run the same view with nothing saved
// (studioPreviews.tsx).
import { playedGuard, playedOpts } from './fmtShared';
import type { PlayedOpts } from './fmtShared';
import { lengthWords } from './logic/horizonItem';
import { podcastLine } from './logic/podcastContent';
import type { Item, Logic } from './model';
import type { PodcastContent } from './types';

// ro: View as (nothing is saved); done: already listened to the end; onEnd: the last step finished; by: who made a v3 episode.
export type PodcastOpts = PlayedOpts & { by?: string };

export function podcastView(c: PodcastContent, o: PodcastOpts) {
  const stored = c.turns.length > 0;
  return {
    pc: c, stored, paths: stored ? c.turns.map((t) => t.audio!.path) : [],
    sub: stored ? podcastLine(c) + ' · AI voices · Made with AI' : lengthWords(c.seconds) + (o.by ? ' · ' + o.by : ''),
    way: stored ? 'Told by AI voices · Made with AI · the transcript is the script' : 'No recording of this episode is available in this prototype: the chapters run on a clock',
    ...playedGuard(o),
  };
}
export type PodcastView = ReturnType<typeof podcastView>;

export function podcastVals(L: Logic, it: Item, c: PodcastContent, by?: string) {
  return podcastView(c, { ...playedOpts<'podcast'>(L, it, 'Listened to the end'), by: by && by + (it.isPeer ? ' · peer-made' : '') });
}
