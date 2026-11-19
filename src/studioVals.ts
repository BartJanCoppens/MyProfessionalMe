// Studios hub and the generic studio spine (design v4 Task 13, generalised in studios Task 1.2). Every studio is data
// (STUDIOS); the steps are visibleSteps(def). A studio is another way through the same draft as the upload form
// (AppState.nw), so "Send for review" is the form's save and submit: nothing is written twice.
// Flash card & Exam Studio is compact: its Draft step is the form's item panel and it has four steps, as in v4.
import type { Logic } from './model';
import type { AppState, Bundle, ExamQuestion, NewDraft, StudioState } from './types';
import { addFirst } from './createItems';
import type { SetNw } from './createItems';
import { aiAssisted, noItems, validItems } from './logic/items';
import type { Item } from './logic/items';
import { seedLessons } from './logic/courseEdit';
import { voiceOn } from './lib/voice';
import type { WithFile } from './studioDraft';
import type { RuleParts } from './logic/contribution';
import { itemsLabel } from './logic/provenance';
import { outputProblems, studioContent } from './logic/studioContent';
import { shownReview } from './logic/gameContent';
import { studioById, studioFormats, tooFew, visibleSteps } from './logic/studios';
import type { StudioDef, StudioEntry } from './logic/studios';
import { STUDIOS } from './studioData';
import { changeFormat, reachable, uploadFormat } from './studioRules';
import { BUILDS } from './studioRunners';
import { reelProduce } from './studioReel';
import { stepVals } from './studioStepVals';
import { stillMotion } from './fmtMotion';

export const HUB: StudioState = { view: 'hub', step: 0 };
const HINTS: Record<string, string> = {
  'Idea & sources': 'Say what it is about, pick the format and the knowledge it must stay within.', 'Shape it': 'Answer a few questions about what you want. They steer the draft.',
  Draft: 'Draft it from the bundles, or import a CSV. Edit anything.', Produce: 'Choose how it is made and who presents it. Stock looks and voices only.',
  'Preview & test': 'Try it as a learner would. Nothing here is saved or counted.', 'Check & send': 'Automatic checks, then the review route, then it goes to your reviewers.',
};
// A studio's own lead for a step, over HINTS: the E-learning Studio builds its lessons from blocks in Produce.
const STUDIO_HINTS: Record<string, Record<string, string>> = { elearn: { Produce: 'Build each lesson from blocks: text, questions and learnings from the other studios.' } };
const FLASH = 'flash';
// The studio the draft is made in, also while a saved contribution is edited in its studio; null on the upload form.
export const studioOf = (s: AppState) => (s.studio.view === 'studio' ? s.studio.id ?? FLASH : null);

// What createVals already computed for the form; the studio only arranges it.
export type StudioSrc = {
  nw: NewDraft; setNw: SetNw; bundles: Bundle[]; rules: RuleParts[]; canCreate: boolean; busy: boolean;
  checks: { text: string; dot: string; fg: string }[]; blocked: boolean; route: { n: string; name: string; role: string }[]; policyNote: string; routeWarn: string;
  submitLabel: string; submit: () => void; saveDraft: () => void; cancel: () => void; // cancel: leave an edit, back to My contributions
  checkReasons: string[] | null; runCheck: () => void; // the automatic check of the draft on screen: null when not run on it, [] when passed
  withFile: WithFile; // the one save step that stores a file with the draft (a deck's voice-over)
};

export function studioVals(L: Logic, src: StudioSrc) {
  const { nw, setNw } = src, { step, id } = L.state.studio, readOnly = L.subject.readOnly;
  const def = studioById(id ?? FLASH) ?? studioById(FLASH) ?? STUDIOS[0], flash = def.id === FLASH;
  const steps = visibleSteps(def), name = steps[step] ?? steps[0];
  const formatsOf = (d: StudioDef) => studioFormats(d).filter((f) => reachable(src.rules, nw, f));
  const formats = formatsOf(def);
  // A question waiting in the studio (remove a lesson, redraft) belongs to the step it was asked in: a new step drops it.
  const set = (p: Partial<StudioState>) => L.setState((s) => ({ studio: { ...s.studio, ...(p.step !== undefined && p.step !== s.studio.step && { ask: undefined }), ...p } }));
  const items = validItems(nw.type, nw.items?.list ?? []);
  const parts = stepVals(L, def, nw, setNw, src.bundles);
  const pick = (f: string) => (L.state.nwAiBusy ? L.say('Wait for the draft to finish') : setNw((cur) => changeFormat(cur, f, src.rules)));
  // Why a studio cannot be opened, once per card; '' when it can.
  const reason = (d: StudioDef) => (!d.available ? 'Coming in a later release' : formatsOf(d).length ? '' : 'Not in your creation rules');
  const open = (d: StudioDef, note: string) => {
    if (readOnly) return;
    if (!src.canCreate) { L.say('Ask an admin for creation rights first'); return; }
    if (note) { L.say(note); return; }
    const fs = formatsOf(d);
    const f = fs.includes(nw.type) ? nw.type : fs[0];
    // Reopening the studio a saved draft was made in continues it; another studio starts a new piece in a new row.
    const savedIn = nw.savedId ? L.state.create?.contributions.find((c) => c.id === nw.savedId)?.studio : null;
    const keep = !!savedIn && savedIn === d.id, other = !!savedIn && savedIn !== d.id;
    const fresh = keep ? {} : d.compact ? { shape: {} } : { shape: {}, produce: {}, cast: {}, build: undefined, items: noItems() };
    setNw((cur) => ({ ...changeFormat(cur, f, src.rules), ...fresh, ...(other && { savedId: undefined }) }));
    set({ view: 'studio', step: 0, id: d.compact ? undefined : d.id, check: undefined, ask: undefined });
  };
  // What the Draft step still needs: a generic studio's item schema; Flash's cards or questions have their own shape, so only
  // the studio's minimum, worded as in the design ("Draft at least 4 items in step 2").
  const problems = !flash ? parts.problems : tooFew(def, items.length) ? ['Draft at least ' + def.min + ' items in step ' + (steps.indexOf('Draft') + 1)] : [];
  // What the Produce step still has to make (the Motion Studio's animation and its text alternative): blocks the check, not the Draft step.
  const unsent = [...problems, ...outputProblems(def, (nw.items?.list ?? []) as StudioEntry[], nw.shape ?? {}, voiceOn(L.aiOpts()), shownReview(nw), L.state.stockLooks)];
  // Server reasons the checks above already show (a client name) are not listed twice.
  const reasons = (src.checkReasons ?? []).filter((r) => !src.checks.some((c) => c.text === r));
  const next = () => {
    if (L.state.nwAiBusy) { L.say('Wait for the draft to finish'); return; }
    if (name === 'Idea & sources' && (!nw.title.trim() || !nw.take.trim())) { L.say('Add a title and the one takeaway first'); return; }
    if (name === 'Draft' && flash && !items.length) { L.say(addFirst(nw.type, 'draft them or import a CSV')); return; }
    if (name === 'Draft' && problems.length) { L.say(problems[0]); return; }
    // A course's lessons each get a first block when it moves on to Produce.
    if (name === 'Draft' && def.produce === 'course') setNw((cur) => (cur.items ? { items: { ...cur.items, list: seedLessons(cur.items.list as StudioEntry[]) as Item[] } } : {}));
    set({ step: Math.min(steps.length - 1, step + 1) });
  };
  const exam = nw.type === 'Practice exam', passed = !!src.checkReasons && !src.checkReasons.length;
  return {
    cards: STUDIOS.map((d) => { const note = reason(d); return { id: d.id, name: d.name, tag: d.tag, out: d.out, time: d.time, open: () => open(d, note), disabled: readOnly || !!note, note }; }),
    uploadLabel: 'Upload something you already made →',
    // The upload form opens on a format it offers (never a studio-only one), the first the rules allow.
    openUpload: () => { setNw((cur) => { const f = uploadFormat(src.rules, cur); return f === cur.type ? {} : changeFormat(cur, f, src.rules); }); set({ view: 'form' }); },
    // An edit opened in its studio leaves the way the form's Cancel does.
    backLabel: L.state.editing ? '← My contributions' : '← All studios', toHub: () => (L.state.editing ? src.cancel() : set(HUB)),
    readOnly, studioName: def.name, flash, def, steps, step, stepName: name, stepTitle: name, stepHint: STUDIO_HINTS[def.id]?.[name] ?? HINTS[name] ?? '',
    prev: () => set({ step: Math.max(0, step - 1) }), next, noPrev: step === 0, hasNext: step < steps.length - 1, nextLabel: 'Next: ' + (steps[step + 1] ?? ''),
    formats: formats.map((f) => ({ label: f, on: nw.type === f, pick: () => pick(f) })),
    ...parts, buildRunner: BUILDS[def.id]?.runner({ L, nw, setNw, withFile: src.withFile }),
    // The Reel's final cut runs on the screen's host (progress, Cancel), so the screen builds its runner from this.
    reel: def.id === 'reel' ? reelProduce({ L, nw, setNw, withFile: src.withFile }) : null,
    // Only "Made with AI" when the items are AI's; a scripted deck says so.
    itemsLabel: itemsLabel(nw.items?.how),
    preview: exam ? { kind: 'questions' as const, cards: [], questions: items as ExamQuestion[] }
      : { kind: 'cards' as const, cards: items as [string, string][], questions: [] },
    // Any other studio previews the content publishing makes of its rows (studioContent), once they are valid.
    content: flash || parts.problems.length ? null : studioContent(nw.type, items as StudioEntry[], nw.shape ?? {}, { looks: L.state.stockLooks ?? [], voices: L.state.stockVoices ?? [], draft: { produce: nw.produce, cast: nw.cast } }),
    looks: L.state.stockLooks, // an avatar's preview says whether its look has live video
    // A game's preview says so when the server's verdict on it is missing, failed or out of date.
    reviewNote: parts.game?.problem ?? '',
    // Why there is nothing to preview yet.
    still: stillMotion(L), // the Animated flow's preview holds its last frame with motion off
    drafted: aiAssisted(nw), // the rows were AI-drafted: a reel's panel says "Made with AI"
    ai: L.aiOpts(), // a game's play-test asks the AI role only while it is live
    previewNote: parts.problems.length ? 'Fix the items in the Draft step first; the preview shows them as learners will.' : unsent[0] ?? '',
    // Send for review opens once the automatic check (check_contribution) passed on the draft on screen.
    send: { checks: src.checks, blocked: src.blocked || unsent.length > 0 || !passed, problems: [...unsent, ...reasons],
      route: src.route, routeEmpty: !src.route.length, policyNote: src.policyNote, routeWarn: src.routeWarn,
      label: src.submitLabel === 'Submit for review' ? 'Send for review' : src.submitLabel, run: src.submit, saveDraft: src.saveDraft, busy: src.busy,
      // The server is asked once the studio itself sees nothing left to fix.
      check: () => (unsent.length ? L.say(unsent[0]) : src.runCheck()), checkBlocked: src.busy || unsent.length > 0, checkLabel: 'Run the automatic check',
      checkNote: !src.checkReasons ? 'Saves your draft and checks it on the server. Send for review opens when it passes.' : passed ? 'The automatic check passed on this version.' : '' },
  };
}
