// Studios hub and the generic studio spine (design v4 Task 13, generalised in studios Task 1.2). Every studio is data
// (STUDIOS); the steps are visibleSteps(def). A studio is another way through the same draft as the upload form
// (AppState.nw), so "Send for review" is the form's save and submit: nothing is written twice.
// Flash card & Exam Studio is compact: its Draft step is the form's item panel and it has four steps, as in v4.
import type { Logic } from './model';
import type { NewDraft, StudioState } from './types';
import { addFirst } from './createItems';
import type { SetNw } from './createItems';
import { aiAssisted, noItems, validItems } from './logic/items';
import type { Item } from './logic/items';
import type { RuleParts } from './logic/contribution';
import { studioById, visibleSteps } from './logic/studios';
import type { StudioDef } from './logic/studios';
import { STUDIOS } from './studioData';
import { fit, reachable, studioFormats } from './studioRules';
import { BUILD_RUNNERS } from './studioRunners';
import { stepVals } from './studioStepVals';

export const HUB: StudioState = { view: 'hub', step: 0 };
const HINTS: Record<string, string> = {
  'Idea & sources': 'Say what it is about, pick the format and the knowledge it must stay within.', 'Shape it': 'Answer a few questions about what you want. They steer the draft.',
  Draft: 'Draft it from the bundles, or import a CSV. Edit anything.', Produce: 'Choose how it is made and who presents it. Stock looks and voices only.',
  'Preview & test': 'Try it as a learner would. Nothing here is saved or counted.', 'Check & send': 'Automatic checks, then the review route, then it goes to your reviewers.',
};
const LABELS: Record<string, string> = { ai: 'Made with AI', scripted: 'Scripted from the bundle', csv: 'Imported from a CSV' };
const FLASH = 'flash';

// What createVals already computed for the form; the studio only arranges it.
export type StudioSrc = {
  nw: NewDraft; setNw: SetNw; rules: RuleParts[]; canCreate: boolean; busy: boolean;
  checks: { text: string; dot: string; fg: string }[]; blocked: boolean; route: { n: string; name: string; role: string }[]; policyNote: string; routeWarn: string;
  submitLabel: string; submit: () => void; saveDraft: () => void;
};

export function studioVals(L: Logic, src: StudioSrc) {
  const { nw, setNw } = src, { step, id } = L.state.studio, readOnly = L.subject.readOnly;
  const def = studioById(id ?? FLASH) ?? studioById(FLASH) ?? STUDIOS[0], flash = def.id === FLASH;
  const steps = visibleSteps(def), name = steps[step] ?? steps[0];
  const formatsOf = (d: StudioDef) => studioFormats(d).filter((f) => reachable(src.rules, nw, f));
  const formats = formatsOf(def);
  const set = (p: Partial<StudioState>) => L.setState((s) => ({ studio: { ...s.studio, ...p } }));
  const items = validItems(nw.type, nw.items?.list ?? []);
  const parts = stepVals(def, nw, setNw);
  const pick = (f: string) => (L.state.nwAiBusy ? L.say('Wait for the draft to finish') : setNw((cur) => (cur.type === f ? {} : { type: f, items: noItems(), ...fit(src.rules, cur, f) })));
  const open = (d: StudioDef) => {
    if (readOnly) return;
    if (!src.canCreate) { L.say('Ask an admin for creation rights first'); return; }
    const fs = formatsOf(d);
    if (!d.available || !fs.length) { L.say(d.available ? 'Not in your creation rules' : 'Coming in a later release'); return; }
    const f = fs.includes(nw.type) ? nw.type : fs[0];
    setNw((cur) => ({ ...(cur.type === f ? {} : { type: f, items: noItems() }), ...fit(src.rules, cur, f), ...(d.compact ? {} : { shape: {}, produce: {}, cast: {}, studioItems: [] }) }));
    set({ view: 'studio', step: 0, id: d.compact ? undefined : d.id });
  };
  const next = () => {
    if (L.state.nwAiBusy) { L.say('Wait for the draft to finish'); return; }
    if (name === 'Idea & sources' && (!nw.title.trim() || !nw.take.trim())) { L.say('Add a title and the one takeaway first'); return; }
    if (name === 'Draft' && flash && !items.length) { L.say(addFirst(nw.type, 'draft them or import a CSV')); return; }
    if (name === 'Draft' && !flash && parts.problems.length) { L.say(parts.problems[0]); return; }
    set({ step: Math.min(steps.length - 1, step + 1) });
  };
  const exam = nw.type === 'Practice exam';
  return {
    cards: STUDIOS.map((d) => ({ id: d.id, name: d.name, tag: d.tag, out: d.out, time: d.time, open: () => open(d),
      disabled: readOnly || !d.available || !formatsOf(d).length, note: !d.available ? 'Coming in a later release' : formatsOf(d).length ? '' : 'Not in your creation rules' })),
    uploadLabel: 'Upload something you already made →', openUpload: () => set({ view: 'form' }),
    backLabel: '← All studios', toHub: () => set(HUB),
    readOnly, studioName: def.name, flash, def, steps, step, stepName: name, stepTitle: name, stepHint: HINTS[name] ?? '',
    prev: () => set({ step: Math.max(0, step - 1) }), next, noPrev: step === 0, hasNext: step < steps.length - 1, nextLabel: 'Next: ' + (steps[step + 1] ?? ''),
    formats: formats.map((f) => ({ label: f, on: nw.type === f, pick: () => pick(f) })),
    ...parts, buildRunner: BUILD_RUNNERS[def.id],
    // Only "Made with AI" when the items are AI's; a scripted deck says so.
    itemsLabel: aiAssisted({ ai: false, type: nw.type, items: nw.items }) ? LABELS.ai : LABELS[nw.items?.how ?? ''] ?? '',
    preview: exam ? { kind: 'questions' as const, cards: [], questions: items as Exclude<Item, [string, string]>[] }
      : { kind: 'cards' as const, cards: items as [string, string][], questions: [] },
    send: { checks: src.checks, blocked: src.blocked || (!flash && parts.problems.length > 0), problems: flash ? [] : parts.problems, route: src.route, routeEmpty: !src.route.length, policyNote: src.policyNote, routeWarn: src.routeWarn,
      label: src.submitLabel === 'Submit for review' ? 'Send for review' : src.submitLabel, run: src.submit, saveDraft: src.saveDraft, busy: src.busy },
  };
}
