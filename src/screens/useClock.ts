// The one playback clock for panels that play on their own: the Animated flow and the narration step player. It keeps
// where it is and whether it runs, ticking every 200 ms from the wall clock; what it drives (an SVG's SMIL clock, an
// audio element) follows through the hooks. Podcasts and reels run on the app's media tick instead (Logic.tick).
// The hooks of the latest render are called, so an end is told to the view-model of that moment.
import { useEffect, useRef, useState } from 'react';

const TICK_MS = 200;
export type ClockHooks = { onSeek?: (t: number) => void; onPlay?: () => void; onPause?: () => void; onEnd: () => void };

export function useClock(seconds: number, start: number, hooks: ClockHooks) {
  const timer = useRef<number | null>(null), latest = useRef(hooks);
  useEffect(() => { latest.current = hooks; });
  const [t, setT] = useState(start), [playing, setPlaying] = useState(false);
  const halt = () => { if (timer.current !== null) window.clearInterval(timer.current); timer.current = null; };
  useEffect(() => halt, []);
  const seek = (v: number) => { latest.current.onSeek?.(v); setT(v); };
  const pause = () => { halt(); latest.current.onPause?.(); setPlaying(false); };
  const play = (from: number) => {
    halt(); seek(from); latest.current.onPlay?.(); setPlaying(true);
    const since = Date.now();
    timer.current = window.setInterval(() => {
      const now = from + (Date.now() - since) / 1000;
      if (now < seconds) { setT(now); return; }
      pause(); seek(seconds); latest.current.onEnd();
    }, TICK_MS);
  };
  return { t, playing, pause, play: () => play(t >= seconds ? 0 : t), replay: () => play(0),
    scrub: (v: number) => { if (playing) play(v); else { latest.current.onPause?.(); seek(v); } } };
}
