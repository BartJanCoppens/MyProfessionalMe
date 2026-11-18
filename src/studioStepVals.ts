// The Shape, Draft and Produce steps of a generic studio, as view-model: questions and produce rows as chip choices and the
// studio's rows as label/text(/text2). Answers live on the draft: `nw.shape`, `nw.produce`, `nw.cast`, `nw.build` and, for the
// rows, `nw.items` (the one item store, with its `how` provenance, like every format). The Explainer's check questions
// follow its rows in `nw.items`; they are shown as a block and removed as a whole. An Animated flow's drawing follows its
// rows too; editing the rows drops it (it was built from them), and the build steps show how far it got (fitBuilt). A deck's or episode's
// voice-over item follows its rows and stays through an edit (so does a built game: it reads the rows when played): a clip counts only while its slide's talk-over is what it was made from.
import type { Logic } from './model';
import type { Bundle, ExamQuestion, NewDraft } from './types';
import type { SetNw } from './createItems';
import { draftItems, studioQuery, studioSpec } from './studioDraft';
import { itemRows, noItems } from './logic/items';
import type { Item } from './logic/items';
import { fitBuilt, startBuild } from './logic/studioBuild';
import { AI_ONLY, studioProblems } from './logic/studioContent';
import { speakersOf } from './logic/podcastContent';
import { wantsVoice } from './logic/slidesContent';
import { isVoiceItem } from './logic/voiceItem';
import { isGameItem } from './logic/gameContent';
import { voiceOn } from './lib/voice';
import { STEERS, questionsOf, stepsOf } from './logic/studios';
import type { Steers, StudioDef, StudioEntry, StudioItem } from './logic/studios';
import { STOCK_LOOKS } from './studioData';
import type { Chip } from './screens/ChipGroup';
import { gameProduce } from './studioGame';
import { motionProduce } from './studioMotion';
import { podcastProduce, castKey, dropSpeakerVoice, speakerVoiceName } from './studioPodcast';
import { deckVoiceName, dropOtherVoices, slidesProduce } from './studioSlides';
import { NO_STOCK_VOICES, stockVoicesOf } from './studioVoicing';
import { BUILDS } from './studioRunners';

type Field = 'shape' | 'produce' | 'cast';

// A group of chips for one question: choosing stores the answer under the question (or row label) on the draft. A
// question that only steers AI says what it steers (honest UI).
const choices = (nw: NewDraft, setNw: SetNw, field: Field, key: string, options: string[], steers?: Steers, note = ''): { key: string; hint: string; chips: Chip[] } => ({
  key, hint: steers ? STEERS[steers] : note, chips: options.map((o) => ({ key: o, label: o, on: nw[field]?.[key] === o, pick: () => setNw((cur) => ({ [field]: { ...cur[field], [key]: o } })) })),
});

// Which stock looks and voices a studio casts. A voice is one of the active stock voices, offered once the AI voice is live: for a deck
// once the AI voice is chosen, for an episode one for each speaker of its format.
function castPickers(L: Logic, def: StudioDef, nw: NewDraft) {
  const looks = STOCK_LOOKS.map((l) => l.role), voices = stockVoicesOf(L), names = (voices ?? []).map((v) => v.name), note = voices && !voices.length ? NO_STOCK_VOICES : '';
  if (def.cast === 'voice') return wantsVoice(nw.shape ?? {}) && voiceOn(L.aiOpts()) ? [{ key: 'Voice', options: names, note }] : [];
  if (def.cast === 'voices') return voiceOn(L.aiOpts()) ? speakersOf(nw.shape ?? {}).map((speaker) => ({ key: castKey(speaker), options: names, note, speaker })) : [];
  return def.cast === 'look' ? [{ key: 'Look', options: looks }] : [];
}

// A voice choice: the voice picked, or the one the stored clips were made in; picking another drops the clips of the old one.
function voiceChoice(L: Logic, nw: NewDraft, setNw: SetNw, key: string, options: string[], note: string, current: string | undefined, drop: (cur: NewDraft, voiceId: string) => Partial<NewDraft>) {
  const g = choices({ ...nw, cast: { ...nw.cast, [key]: current ?? '' } }, setNw, 'cast', key, options, undefined, note);
  return { ...g, chips: g.chips.map((c) => ({ ...c, pick: () => { c.pick(); const v = stockVoicesOf(L)?.find((x) => x.name === c.label); if (v) setNw((cur) => drop(cur, v.voice_id)); } })) };
}

// A question's options, without the ones only Draft with AI (or the live AI voice) delivers while it cannot run (and why), but
// never hiding the answer already chosen.
function offered(on: Record<'draft' | 'voice' | 'role', boolean>, q: string, options: string[], chosen: string | undefined) {
  const only = AI_ONLY[q], cut = !!only && !on[only.needs];
  return { options: cut ? options.filter((o) => !only.options.includes(o) || o === chosen) : options, note: cut ? only.why : only?.hint ?? '' };
}

// The build steps as stored on the draft, fitted to the studio's own output when it has a runner that makes one.
function built(def: StudioDef, nw: NewDraft, list: StudioEntry[]) {
  const steps = nw.build ?? startBuild(def.build ?? []), b = BUILDS[def.id];
  return b ? fitBuilt(steps, b.built(list, nw.shape ?? {}, nw)) : steps;
}

export function stepVals(L: Logic, def: StudioDef, nw: NewDraft, setNw: SetNw, bundles: Bundle[]) {
  const list = (nw.items?.list ?? []) as StudioEntry[], text2 = def.items.some((i) => i.length === 3), check = questionsOf(list), aiOn = L.aiCan('studio_draft'), on = { draft: aiOn, voice: voiceOn(L.aiOpts()), role: L.aiCan('game_role') };
  // Editing the rows keeps the items' provenance and any check after them; a hand-made list says 'manual'.
  const change = (f: (rows: StudioItem[], check: ExamQuestion[]) => StudioEntry[]) => setNw((cur) => { const it = cur.items ?? noItems(), all = it.list as StudioEntry[];
    return { items: { ...it, list: [...f(stepsOf(all), questionsOf(all)), ...all.filter((x) => isVoiceItem(x) || isGameItem(x))] as Item[], how: it.how || 'manual', problems: [] } }; });
  return {
    shape: def.qs.map(([q, options, steers]) => { const o = offered(on, q, options, nw.shape?.[q]); return choices(nw, setNw, 'shape', q, o.options, steers, o.note); }),
    produce: def.rows.map(([row, options, steers]) => choices(nw, setNw, 'produce', row, options, steers)),
    cast: castPickers(L, def, nw).map((p) => ('speaker' in p ? voiceChoice(L, nw, setNw, p.key, p.options, p.note, speakerVoiceName(L, nw, p.speaker), (cur, id) => dropSpeakerVoice(cur, p.speaker, id))
      : p.key === 'Voice' ? voiceChoice(L, nw, setNw, p.key, p.options, 'note' in p ? p.note : '', deckVoiceName(L, nw), dropOtherVoices) : choices(nw, setNw, 'cast', p.key, p.options))),
    rows: stepsOf(list).map((r, k) => ({ label: r[0], text: r[1], text2: r[2] ?? '',
      edit: (f: 0 | 1 | 2, v: string) => change((rows, q) => [...rows.map((x, i) => (i === k ? (x.map((y, j) => (j === f ? v : y)) as StudioItem) : x)), ...q]),
      remove: () => change((rows, q) => [...rows.filter((_, i) => i !== k), ...q]) })),
    check: check.length ? { head: 'Check · ' + check.length + ' questions · with the right answer', rows: itemRows('Practice exam', check), remove: () => change((rows) => rows) } : null,
    hasText2: text2, columns: def.columns ?? null, problems: studioProblems(def, list, nw.shape ?? {}, aiOn),
    add: () => change((rows, q) => [...rows, (text2 ? ['', '', ''] : ['', '']) as StudioItem, ...q]),
    // "Draft with AI" (the one pipeline in studioDraft.ts). Flash keeps its own draft button in the item panel and does not use this.
    aiDraft: { label: L.state.nwAiBusy ? 'Drafting' : 'Draft with AI', busy: L.state.nwAiBusy,
      run: () => draftItems(L, nw, bundles, setNw, studioQuery(nw), studioSpec(def, nw)) },
    build: def.build ? { steps: built(def, nw, list), set: (b: NonNullable<NewDraft['build']>) => setNw({ build: b }) } : null,
    motion: def.id === 'motion' ? motionProduce(L, nw, setNw) : null,
    slides: def.id === 'slides' ? slidesProduce({ L, nw }) : null,
    podcast: def.id === 'podcast' ? podcastProduce({ L, nw }) : null,
    game: def.id === 'game' ? gameProduce(L, nw, setNw) : null,
  };
}
