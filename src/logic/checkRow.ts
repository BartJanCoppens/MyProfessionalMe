// A check row: the question in text, and in text 2 two to four options split on " · ", the right one first (the Reel's Check, the Avatar's
// Quiz rows). private.reel_options and private.check_row_ok repeat these rules.
import type { QuizQ } from '../types';
import type { StudioItem } from './studioRows';

export const CHECK_OPTIONS = { min: 2, max: 4 };
export const optionsOf = (text2: string | undefined) => (text2 ?? '').split(/\s*·\s*/).map((o) => o.trim());
export const checkOk = (r: StudioItem) => { const o = optionsOf(r[2]); return o.length >= CHECK_OPTIONS.min && o.length <= CHECK_OPTIONS.max && o.every(Boolean); };
// A check is stored with the right option first, so it is shown rotated by this many places (the question's length: steady for one question, different between
// questions); the option shown at place i is the written one at (i + shift) % n.
export const shiftOf = (question: string, n: number) => question.length % n;
// The question as it is shown: the options rotated, `a` the place of the right one.
export function rotated(q: QuizQ): QuizQ {
  const n = q.opts.length, shift = shiftOf(q.q, n);
  return { q: q.q, opts: q.opts.map((_, i) => q.opts[(i + shift) % n]), a: (q.a - shift + n) % n };
}
