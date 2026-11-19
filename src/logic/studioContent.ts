// What a studio's rows publish as (studios plan, Tasks 2.1 to 2.3): the learning content the library reads
// (parseFormatContent). The database builds the same when it publishes (private.aid_content, private.case_content,
// private.explainer_content, private.motion_content); the studio's preview uses this so the creator tries exactly what
// learners will get. Pure.
import type { FormatContent } from '../types';
import { avatarContent } from './avatarContent';
import { courseContent } from './courseContent';
import type { StockVoice } from './ai';
import { ROLE_QUESTION, gameContent, gameProblems } from './gameContent';
import { GAME_ROLES } from '../../supabase/functions/_shared/gameRules.ts';
import type { GameReviewStatus } from './gameContent';
import { ALT_MAX, drawingOf } from './motionSvg';
import { podcastContent, podcastProblems } from './podcastContent';
import { CARDS_VOICE, PORTRAIT_VOICE, reelContent, reelProblems } from './reelContent';
import { AI_VOICE, PRESENTER, slidesContent, slidesProblems } from './slidesContent';
import type { StockLook } from './stockLooks';
import { itemsValid, labelledRows, questionsOf, stepsOf } from './studios';
import type { StudioDef, StudioEntry, StudioItem } from './studios';

// The Case Studio's question whose Yes makes a case count as trajectory evidence (stored as `evidence` on the content).
export const EVIDENCE_QUESTION = 'Can it count as trajectory evidence?';
// A learner hands a case in through the evidence flow, which goes to their counsellor.
export const CASE_REVIEWER = 'Reviewed by your counsellor.';
// A published case's study hours from its length answer (private.case_hours); half a day when unanswered.
export const LENGTH_QUESTION = 'How long should it take?';
export const CASE_HOURS: Record<string, number> = { '2 hours': 2, 'Half a day': 4, 'A full day': 8 };
export const caseHours = (shape: Record<string, string>) => CASE_HOURS[shape[LENGTH_QUESTION]] ?? CASE_HOURS['Half a day'];

// The Explainer Studio's answers that are published (private.explainer_content): its depth, shown with it, and how it
// ends. Unanswered or unknown answers read as an overview with a summary card. Its one style is the step-through.
export const DEPTH_QUESTION = 'Depth?';
export const DEPTHS = ['Overview', 'With technical detail'];
export const END_QUESTION = 'End with?';
export const END_CHECK = 'A three-question check', END_SUMMARY = 'A summary card', END_NONE = 'Nothing';
export const ENDINGS = [END_CHECK, END_SUMMARY, END_NONE];
const STEP_THROUGH = 'Step-through';
const answer = (shape: Record<string, string>, q: string, options: string[], none: string) => (options.includes(shape[q]) ? shape[q] : none);
export const explainerEnd = (shape: Record<string, string>) => answer(shape, END_QUESTION, ENDINGS, END_SUMMARY);
// The ending and the check agree (private.contribution_problems says the same).
export const NEEDS_CHECK = 'Ending with a three-question check needs its three questions';
// What to do about it, in the studio: depends on whether Draft with AI can run (the database names the problem only).
export const NEEDS_CHECK_AI = ': Draft with AI again (it rewrites the steps as well), or choose another ending in Shape it';
export const NEEDS_CHECK_NO_AI = ': only Draft with AI writes them and it is not switched on, so choose another ending in Shape it';
export const UNUSED_CHECK = 'The check is only shown when the explainer ends with it: remove it, or choose “A three-question check” in Shape it';
export function explainerProblems(items: StudioEntry[], shape: Record<string, string>, aiOn = true): string[] {
  const has = questionsOf(items).length > 0, wants = explainerEnd(shape) === END_CHECK;
  return wants && !has ? [NEEDS_CHECK + (aiOn ? NEEDS_CHECK_AI : NEEDS_CHECK_NO_AI)] : !wants && has ? [UNUSED_CHECK] : [];
}
// What a studio's Draft step still needs: the item rules, and for the Explainer the ending and check agreeing.
export const studioProblems = (def: StudioDef, items: StudioEntry[], shape: Record<string, string>, aiOn: boolean) =>
  [...itemsValid(def, items), ...(def.format === 'Interactive explainer' ? explainerProblems(items, shape, aiOn) : [])];
// The Motion Studio's "Length?" is the animation's length in seconds (private.motion_content); 45 s when unanswered.
export const MOTION_LENGTH = 'Length?';
export const MOTION_SECONDS: Record<string, number> = { '20 s': 20, '45 s': 45, '90 s': 90 };
export const motionSeconds = (shape: Record<string, string>) => MOTION_SECONDS[shape[MOTION_LENGTH]] ?? MOTION_SECONDS['45 s'];
// What an Animated flow needs after its Draft step: the animated drawing and its text alternative (private.drawing_ok).
export const BUILD_FIRST = 'Build the animation in Produce';
export const LENGTH_CHANGED = 'The length changed after the animation was built: build it again in Produce';
export const ALT_NEEDED = 'Write the text alternative in Produce: learners who cannot watch the animation read it';
// The drawing, when it is animated for the length chosen now (it is timed for the length it was built for).
export const animatedFor = (items: StudioEntry[], shape: Record<string, string>) => {
  const d = drawingOf(items);
  return d && d.made !== 'layout' && d.seconds === motionSeconds(shape) ? d : null;
};
export function motionProblems(items: StudioEntry[], shape: Record<string, string>): string[] {
  const d = drawingOf(items);
  if (!d || d.made === 'layout') return [BUILD_FIRST];
  if (!animatedFor(items, shape)) return [LENGTH_CHANGED];
  return !d.alt.trim() ? [ALT_NEEDED] : d.alt.length > ALT_MAX ? ['Keep the text alternative to at most ' + ALT_MAX + ' characters'] : [];
}
// What the Produce step still has to make before a studio piece can be sent: the Motion Studio's animation, the voice-over of the
// Slides Studio and the Podcast Studio, the Game Studio's built game and its review (voiceOn: the AI voice can be used now, which words the reason) and a length within the limit.
export const outputProblems = (def: StudioDef, items: StudioEntry[], shape: Record<string, string>, voiceOn = true, review?: GameReviewStatus | null, looks?: StockLook[] | null) =>
  (def.format === 'Animated flow' ? motionProblems(items, shape) : def.format === 'Slides' ? slidesProblems(items, shape, voiceOn)
    : def.format === 'Podcast' ? podcastProblems(items, shape, voiceOn) : def.format === 'Game' ? gameProblems(items, shape, review)
      : def.format === 'Reel' ? reelProblems(items, shape, { voiceOn, looks: looks ?? null, cut: true }) : []);

// Answers only Draft with AI (or, for the voice, the live AI voice, and for a game's roles the live AI role) can deliver (question to answers): offered only while it can run,
// with the reason otherwise; an answer already chosen stays on screen, with the reason.
export const AI_ONLY: Record<string, { options: string[]; why: string; needs: 'draft' | 'voice' | 'role'; hint?: string }> = {
  [END_QUESTION]: { options: [END_CHECK], why: 'A three-question check is written by Draft with AI, which is not switched on', needs: 'draft' },
  [ROLE_QUESTION]: { options: [...GAME_ROLES], why: 'The AI role is not switched on · only "No AI role" can be chosen until a System Admin gives it a connection', needs: 'role', hint: 'What the AI knows is not a safe place for a real secret or personal data: a persistent player can get the AI to repeat it. Write fictional facts only.' },
  [PRESENTER]: { options: [AI_VOICE, PORTRAIT_VOICE, CARDS_VOICE], why: 'The AI voice is not switched on · only the option without a voice can be chosen until a System Admin gives it a connection (a deck\'s talk-over can still be heard in the browser voice in Produce, never stored)', needs: 'voice' },
};

const texts = (items: StudioItem[], label: string) => items.filter((i) => i[0] === label).map((i) => i[1].trim());
// What a builder may need besides the rows and answers: the stock looks (a reel joins its look), the stock voices (an avatar's voice) and, for a draft not saved yet, the Produce answers
// and cast it previews from (an avatar's look and voice are Produce answers too, and the saved draft keeps them in its shape).
export type ContentExtra = { looks?: StockLook[]; voices?: StockVoice[]; draft?: { produce?: Record<string, string>; cast?: Record<string, string> } };
const BUILDERS: Record<string, (items: StudioEntry[], shape: Record<string, string>, extra?: ContentExtra) => FormatContent | null> = {
  Avatar: (items, shape, x) => avatarContent(items, { ...shape, ...x?.draft?.produce, ...x?.draft?.cast }, x?.looks ?? [], x?.voices ?? []),
  Slides: slidesContent,
  Reel: (items, shape, x) => reelContent(items, shape, x?.looks ?? [], x?.draft),
  Podcast: (items) => podcastContent(items),
  'E-learning': courseContent,
  Game: gameContent,
  'Job aid': (items) => ({ kind: 'aid', items: stepsOf(items).map((i) => i[0].trim() + ' · ' + i[1].trim()) }),
  'Case exercise': (entries, shape) => { const items = stepsOf(entries);
    return { kind: 'case', brief: texts(items, 'Brief').join(' '), deliv: texts(items, 'Deliverable'), rubric: texts(items, 'Criterion'), reviewer: CASE_REVIEWER, evidence: shape[EVIDENCE_QUESTION] === 'Yes' }; },
  'Interactive explainer': (items, shape) => {
    const end = explainerEnd(shape), check = questionsOf(items);
    return { kind: 'explainer', style: STEP_THROUGH, depth: answer(shape, DEPTH_QUESTION, DEPTHS, DEPTHS[0]), end,
      steps: labelledRows(items), ...(end === END_CHECK && check.length ? { check } : {}) };
  },
  // None until the drawing is animated for the chosen length; it plays for the length it was built for.
  'Animated flow': (items, shape) => {
    const d = animatedFor(items, shape);
    return d && d.made !== 'layout' ? { kind: 'motion', stages: labelledRows(items), svg: d.svg, alt: d.alt.trim(), seconds: d.seconds, made: d.made } : null;
  },
};

// The content of a format's rows and "Shape it" answers; null for a format no built studio publishes rows for (or an
// Animated flow not animated yet).
export function studioContent(format: string, items: StudioEntry[], shape: Record<string, string>, extra?: ContentExtra): FormatContent | null {
  const build = BUILDERS[format];
  return build ? build(items, shape, extra) : null;
}

// Whether a learning's content is a case its creator said can count as trajectory evidence.
export const countsAsEvidence = (c: FormatContent | null | undefined) => c?.kind === 'case' && c.evidence === true;
