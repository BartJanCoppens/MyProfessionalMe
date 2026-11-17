// Studios hub (design v4, Task 13). Owner decision D1 keeps ONE studio, Flash card & Exam Studio, so the hub has one
// card. The studio is another way through the same draft as the upload form (AppState.nw), so its Draft step is the
// form's item panel and "Send for review" is the form's save and submit: nothing is written twice.
// Four steps, not the design's six: "Shape it" asks for the format (folded into step one; its other two questions,
// difficulty and a trajectory-exam link, change no AI request here) and "Produce" is voice and looks (nothing to do).
import type { Logic } from './model';
import type { NewDraft, StudioState } from './types';
import { addFirst } from './createItems';
import type { SetNw } from './createItems';
import { aiAssisted, noItems, validItems } from './logic/items';
import type { Item } from './logic/items';

export const STUDIO_FORMATS = ['Flash cards', 'Practice exam'];
export const STUDIO_STEPS = ['Idea & sources', 'Draft', 'Preview & test', 'Check & send'];
export const HUB: StudioState = { view: 'hub', step: 0 };
const HINTS = ['Say what it is about, pick the format and the knowledge it must stay within.', 'Draft it from the bundles, or import a CSV. Edit anything.',
  'Try it as a learner would. Nothing here is saved or counted.', 'Automatic checks, then the review route, then it goes to your reviewers.'];
const LABELS: Record<string, string> = { ai: 'Made with AI', scripted: 'Scripted from the bundle', csv: 'Imported from a CSV' };

// What createVals already computed for the form; the studio only arranges it.
export type StudioSrc = {
  nw: NewDraft; setNw: SetNw; allowedFormats: string[]; canCreate: boolean; busy: boolean;
  checks: { text: string; dot: string; fg: string }[]; blocked: boolean; route: { n: string; name: string; role: string }[]; policyNote: string; routeWarn: string;
  submitLabel: string; submit: () => void; saveDraft: () => void;
};

export function studioVals(L: Logic, src: StudioSrc) {
  const { nw, setNw } = src, { step } = L.state.studio;
  const formats = STUDIO_FORMATS.filter((f) => src.allowedFormats.includes(f));
  const set = (p: Partial<StudioState>) => L.setState((s) => ({ studio: { ...s.studio, ...p } }));
  const items = validItems(nw.type, nw.items?.list ?? []);
  const pick = (f: string) => (L.state.nwAiBusy ? L.say('Wait for the draft to finish') : setNw((cur) => (cur.type === f ? {} : { type: f, items: noItems() })));
  const open = () => {
    if (!src.canCreate) { L.say('Ask an admin for creation rights first'); return; }
    if (!formats.length) { L.say('Not in your creation rules'); return; }
    if (!STUDIO_FORMATS.includes(nw.type)) setNw({ type: formats[0], items: noItems() });
    set({ view: 'studio', step: 0 });
  };
  const next = () => {
    if (L.state.nwAiBusy) { L.say('Wait for the draft to finish'); return; }
    if (step === 0 && (!nw.title.trim() || !nw.take.trim())) { L.say('Add a title and the one takeaway first'); return; }
    if (step === 1 && !items.length) { L.say(addFirst(nw.type, 'draft them or import a CSV')); return; }
    set({ step: Math.min(STUDIO_STEPS.length - 1, step + 1) });
  };
  const exam = nw.type === 'Practice exam';
  return {
    cards: [{ name: 'Flash card & Exam Studio', tag: 'Decks and exam-style question banks, drafted from your knowledge bundles', out: 'Flash cards · Practice exam', time: 'about 10 min',
      disabled: !formats.length, note: formats.length ? '' : 'Not in your creation rules', open }],
    uploadLabel: 'Upload something you already made →', openUpload: () => set({ view: 'form' }),
    backLabel: '← All studios', toHub: () => set(HUB),
    steps: STUDIO_STEPS, step, stepTitle: STUDIO_STEPS[step], stepHint: HINTS[step],
    prev: () => set({ step: Math.max(0, step - 1) }), next, noPrev: step === 0, hasNext: step < STUDIO_STEPS.length - 1, nextLabel: 'Next: ' + (STUDIO_STEPS[step + 1] ?? ''),
    formats: formats.map((f) => ({ label: f, on: nw.type === f, pick: () => pick(f) })),
    // Only "Made with AI" when the items are AI's; a scripted deck says so.
    itemsLabel: aiAssisted({ ai: false, type: nw.type, items: nw.items }) ? LABELS.ai : LABELS[nw.items?.how ?? ''] ?? '',
    preview: exam ? { kind: 'questions' as const, cards: [], questions: items as Exclude<Item, [string, string]>[] }
      : { kind: 'cards' as const, cards: items as [string, string][], questions: [] },
    send: { checks: src.checks, blocked: src.blocked, route: src.route, routeEmpty: !src.route.length, policyNote: src.policyNote, routeWarn: src.routeWarn,
      label: src.submitLabel === 'Submit for review' ? 'Send for review' : src.submitLabel, run: src.submit, saveDraft: src.saveDraft, busy: src.busy },
  };
}
