// The reel panel as view-model (studios plan, Task 5.3): the one panel of every reel. A seeded v3 reel (MEDIA) becomes content
// with captions only and plays scene by scene on the shared step player; a studio reel with a rendered video plays in the
// browser's video element with its captions as a text track. Completion is the creator's check question (a right answer
// completes the reel, as before); playing to the end saves in-progress once. The Reel Studio's preview runs reelView with
// nothing saved (studioPreviews.tsx).
import { playedGuard } from './fmtShared';
import type { PlayedOpts } from './fmtShared';
import { saveProgress } from './lib/learnerStore';
import { fmtTime } from './logic/media';
import { cutPlanOf, reelCues } from './logic/reelFrame';
import type { Item, Logic } from './model';
import type { LearnState } from './logic/learner';
import type { ReelContent, ReelMedia } from './types';

// A v3 reel (MEDIA) as content: its captions as scenes of equal length, with no voice and no video.
export const seededReel = (M: ReelMedia): ReelContent => {
  const each = M.dur / M.caps.length;
  return { kind: 'reel', size: '720x1280', seconds: M.dur, video: null, burned: false, look: null, music: 'None', made: 'scripted', check: { q: M.q, opts: M.opts, a: M.a },
    scenes: M.caps.map((text, k) => ({ label: 'Scene ' + (k + 1), text, onScreen: text, start: k * each, seconds: each, words: null })) };
};

// answer: the option picked, by its written place; pick: choosing one; takeaway: the one sentence to keep, when there is one.
export type ReelOpts = PlayedOpts & { answer: number | undefined; pick: (written: number) => void; takeaway: string | null };

export function reelView(c: ReelContent, o: ReelOpts) {
  const { q, opts, a } = c.check, shift = q.length % opts.length, right = o.answer === a;
  return {
    rc: c, plan: cutPlanOf(c), cues: reelCues(c), paths: c.video ? [c.video.path] : [], takeaway: o.takeaway, q,
    sub: c.video ? (c.size === '720x1280' ? 'Vertical' : 'Square') + ' video · ' + fmtTime(c.seconds) : 'Captions only · no video',
    opts: opts.map((_, i) => {
      const k = (i + shift) % opts.length, picked = o.answer === k, ok = k === a;
      return { label: opts[k], bd: picked ? (ok ? '#86BC25' : '#9a2b22') : '#d5dacf', bg: picked ? (ok ? '#fbfdf6' : '#fff6f5') : '#fff', pick: () => o.pick(k) };
    }),
    hasFb: o.answer != null, fb: right ? 'Right. The reel is complete.' : 'Not quite. Watch the reel again and try once more.', fbColor: right ? '#3f6a0a' : '#9a2b22',
    ...playedGuard(o),
  };
}
export type ReelView = ReturnType<typeof reelView>;

// Progress saved per person and learning until the reload lands, so an end or an answer never repeats a save.
const SAVED = new Map<string, number>();
function savedOf(L: Logic, id: string) {
  const own = L.subject.data.progress[id], last = SAVED.get(L.subject.id + '|' + id);
  if (last === 100 || own?.state === 'accepted') return { state: 'accepted' as LearnState, pct: 100 };
  return own ? { state: own.state, pct: Math.max(own.pct, last || 0) } : last != null ? { state: 'in-progress' as LearnState, pct: last } : undefined;
}
function saveReel(L: Logic, id: string, patch: { state: LearnState; pct: number }, done?: string) {
  const key = L.subject.id + '|' + id; SAVED.set(key, patch.pct);
  L.persist(() => saveProgress(L.subject.id, id, patch).catch((err) => { SAVED.delete(key); throw err; }), done);
}

// The learner's reel: answers belong to the person they were made for; View as saves nothing.
export function reelVals(L: Logic, it: Item, c: ReelContent, takeaway: string | null) {
  const ro = L.subject.readOnly, answer = L.state.answersFor === L.subject.id ? L.state.answers[it.id] : undefined;
  return reelView(c, { ro, done: !!savedOf(L, it.id), takeaway, answer,
    onEnd: () => saveReel(L, it.id, { state: 'in-progress', pct: 0 }),
    pick: (k) => {
      L.setState((st) => ({ answers: { ...(st.answersFor === L.subject.id ? st.answers : {}), [it.id]: k }, answersFor: L.subject.id }));
      if (!ro && k === c.check.a && savedOf(L, it.id)?.state !== 'accepted') saveReel(L, it.id, { state: 'accepted', pct: 100 }, 'Reel complete · added to your year');
    } });
}
