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
import { lookOf } from './logic/stockLooks';
import { portraitUrl } from './reel/portraits';
import type { Chip } from './screens/ChipGroup';
import { gameProduce } from './studioGame';
import { motionProduce } from './studioMotion';
import { podcastProduce, castKey, dropSpeakerVoice, speakerVoiceName } from './studioPodcast';
import { PORTRAIT_VOICE, PRESENTER, wantsVoice as reelVoiced } from './logic/reelContent';
import { reelVoiceName } from './studioReel';
import { deckVoiceName, dropOtherVoices, slidesProduce } from './studioSlides';
import { NO_STOCK_VOICES, stockVoicesOf } from './studioVoicing';
import { BUILDS } from './studioRunners';

type Field = 'shape' | 'produce' | 'cast';

// A group of chips for one question: choosing stores the answer under the question (or row label) on the draft. A
// question that only steers AI says what it steers (honest UI).
const choices = (nw: NewDraft, setNw: SetNw, field: Field, key: string, options: string[], steers?: Steers, note = ''): { key: string; hint: string; chips: Chip[] } => ({
  key, hint: steers ? STEERS[steers] : note, chips: options.map((o) => ({ key: o, label: o, on: nw[field]?.[key] === o, pick: () => setNw((cur) => ({ [field]: { ...cur[field], [key]: o } })) })),
});

// What a Produce row says under its question when it changes what is published or made (the reel's captions and music).
const PRODUCE_NOTES: Record<string, string> = { 'reel:Captions': 'Burned in also draws them on the video · both publish the text track and the transcript', 'reel:Music': 'Made in code · a short loop, no recording' };
const NO_STOCK_LOOKS = 'No stock looks are offered yet. A General Admin adds them on the AI connections page.';
// Which stock looks and voices a studio casts. A look is one of the active stock looks. A voice is one of the active stock voices, offered once the AI voice is live: for a deck
// once the AI voice is chosen, for an episode one for each speaker of its format.
function castPickers(L: Logic, def: StudioDef, nw: NewDraft) {
  const looks = (L.state.stockLooks ?? []).filter((l) => l.active).map((l) => l.id), voices = stockVoicesOf(L), names = (voices ?? []).map((v) => v.name), note = voices && !voices.length ? NO_STOCK_VOICES : '';
  if (def.cast === 'voice') return wantsVoice(nw.shape ?? {}) && voiceOn(L.aiOpts()) ? [{ key: 'Voice', options: names, note }] : [];
  // A reel casts a voice once the AI voice is chosen and live, and a stock look only for the stock presenter.
  if (def.id === 'reel') return [...(reelVoiced(nw.shape ?? {}) && voiceOn(L.aiOpts()) ? [{ key: 'Voice', options: names, note }] : []), ...(nw.shape?.[PRESENTER] === PORTRAIT_VOICE ? [{ key: 'Look', options: looks, note: L.state.stockLooks && !looks.length ? NO_STOCK_LOOKS : '' }] : [])];
  if (def.cast === 'voices') return voiceOn(L.aiOpts()) ? speakersOf(nw.shape ?? {}).map((speaker) => ({ key: castKey(speaker), options: names, note, speaker })) : [];
  return def.cast === 'look' ? [{ key: 'Look', options: looks, note: L.state.stockLooks && !looks.length ? NO_STOCK_LOOKS : '' }] : [];
}

// A look choice: the active stock looks, each with its drawn portrait next to the role; the draft stores the look's id.
function lookChoice(L: Logic, nw: NewDraft, setNw: SetNw, key: string, options: string[], note = '') {
  const g = choices(nw, setNw, 'cast', key, options, undefined, note);
  return { ...g, chips: g.chips.map((c) => { const look = lookOf(L.state.stockLooks, c.key)!; return { ...c, label: look.name, image: portraitUrl(look.portrait) }; }) };
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
  const steps = nw.build ?? startBuild(def.build ?? []), b = BUILDS[def.id], fit = b ? fitBuilt(steps, b.built(list, nw.shape ?? {}, nw)) : steps;
  // A reel told by text and music only has no voice to make: its second step says so.
  return def.id === 'reel' && !reelVoiced(nw.shape ?? {}) ? fit.map((s, k) => (k === 1 ? { ...s, name: NO_VOICE_STEP } : s)) : fit;
}
const NO_VOICE_STEP = 'No voice · text and music only';

export function stepVals(L: Logic, def: StudioDef, nw: NewDraft, setNw: SetNw, bundles: Bundle[]) {
  const list = (nw.items?.list ?? []) as StudioEntry[], text2 = def.items.some((i) => i.length === 3), check = questionsOf(list), aiOn = L.aiCan('studio_draft'), on = { draft: aiOn, voice: voiceOn(L.aiOpts()), role: L.aiCan('game_role') };
  // Editing the rows keeps the items' provenance and any check after them; a hand-made list says 'manual'.
  const change = (f: (rows: StudioItem[], check: ExamQuestion[]) => StudioEntry[]) => setNw((cur) => { const it = cur.items ?? noItems(), all = it.list as StudioEntry[];
    return { items: { ...it, list: [...f(stepsOf(all), questionsOf(all)), ...all.filter((x) => isVoiceItem(x) || isGameItem(x))] as Item[], how: it.how || 'manual', problems: [] } }; });
  return {
    shape: def.qs.map(([q, options, steers]) => { const o = offered(on, q, options, nw.shape?.[q]); return choices(nw, setNw, 'shape', q, o.options, steers, o.note); }),
    produce: def.rows.map(([row, options, steers]) => choices(nw, setNw, 'produce', row, options, steers, PRODUCE_NOTES[def.id + ':' + row])),
    cast: castPickers(L, def, nw).map((p) => ('speaker' in p ? voiceChoice(L, nw, setNw, p.key, p.options, p.note, speakerVoiceName(L, nw, p.speaker), (cur, id) => dropSpeakerVoice(cur, p.speaker, id))
      : p.key === 'Voice' ? voiceChoice(L, nw, setNw, p.key, p.options, 'note' in p ? p.note : '', def.id === 'reel' ? reelVoiceName(L, nw) : deckVoiceName(L, nw), dropOtherVoices) : lookChoice(L, nw, setNw, p.key, p.options, p.note))),
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
