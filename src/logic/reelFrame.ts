// What a reel shows at time t (studios plan, Task 5.3), as pure data: the scene, its on-screen text, the caption, the slow
// zoom and the AI tag. The canvas (src/reel/drawReel.ts) and the browser compositor draw it; the caption cues are the one
// source of the text track, the burned-in captions and the transcript timing (reelCues).
import type { ReelContent } from '../types';
import { captionCues, cueAt } from './captions';
import type { Cue } from './captions';

export type CutScene = { start: number; seconds: number; onScreen: string };
export type CutPlan = { size: { w: number; h: number }; scenes: CutScene[]; captions: Cue[] | null; burned: boolean; look: ReelContent['look']; aiTag: boolean };
export type ReelFrame = { scene: number; onScreen: string; caption: string | null; zoom: number; aiTag: boolean };

export const ZOOM_END = 1.04;

// The cues of every scene that has word timings, on the reel's clock; null when none has, or one does not match its words.
export function reelCues(c: ReelContent): Cue[] | null {
  const voiced = c.scenes.filter((s) => s.words);
  if (!voiced.length) return null;
  const per = voiced.map((s) => captionCues(s.text, s.words!, s.start, s.start + s.seconds));
  return per.every((p): p is Cue[] => p !== null) ? per.flat() : null;
}

export const cutPlanOf = (c: ReelContent): CutPlan => ({
  size: c.size === '720x1280' ? { w: 720, h: 1280 } : { w: 1080, h: 1080 },
  scenes: c.scenes.map((s) => ({ start: s.start, seconds: s.seconds, onScreen: s.onScreen })),
  captions: reelCues(c), burned: c.burned, look: c.look, aiTag: c.made === 'ai',
});

export function reelFrameAt(cut: CutPlan, t: number): ReelFrame {
  const end = cut.scenes.length ? cut.scenes[cut.scenes.length - 1].start + cut.scenes[cut.scenes.length - 1].seconds : 0;
  const at = Math.max(0, Math.min(t, end));
  const scene = Math.max(0, cut.scenes.reduce((a, s, k) => (s.start <= at ? k : a), 0)), s = cut.scenes[scene];
  const progress = s && s.seconds > 0 ? Math.min(1, Math.max(0, (at - s.start) / s.seconds)) : 0;
  return { scene, onScreen: s?.onScreen ?? '', caption: cut.burned && cut.captions ? cueAt(cut.captions, t)?.text ?? null : null, zoom: 1 + (ZOOM_END - 1) * progress, aiTag: cut.aiTag };
}
