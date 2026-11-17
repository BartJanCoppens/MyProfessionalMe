// The Shape, Draft and Produce steps of a generic studio, as view-model: questions and produce rows as chip choices and the
// studio's rows as label/text(/text2). Answers live on the draft: `nw.shape`, `nw.produce`, `nw.cast`, `nw.build` and, for the
// rows, `nw.items` (the one item store, with its `how` provenance, like every format). The Explainer's check questions
// follow its rows in `nw.items`; they are shown as a block and removed as a whole. An Animated flow's drawing follows its
// rows too; editing the rows drops it (it was built from them), and the build steps show how far it got (fitBuilt).
import type { Logic } from './model';
import type { Bundle, ExamQuestion, NewDraft } from './types';
import type { SetNw } from './createItems';
import { draftItems, studioQuery, studioSpec } from './studioDraft';
import { itemRows, noItems } from './logic/items';
import type { Item } from './logic/items';
import { fitBuilt, startBuild } from './logic/studioBuild';
import { AI_ONLY, studioProblems } from './logic/studioContent';
import { questionsOf, stepsOf } from './logic/studios';
import type { StudioDef, StudioEntry, StudioItem } from './logic/studios';
import { STOCK_LOOKS, STOCK_VOICES } from './studioData';
import type { Chip } from './screens/ChipGroup';
import { motionProduce } from './studioMotion';
import { BUILDS } from './studioRunners';

type Field = 'shape' | 'produce' | 'cast';

// A group of chips for one question: choosing stores the answer under the question (or row label) on the draft. A
// question that only steers the AI draft says so (honest UI).
const STEERS = 'Steers the AI draft';
const choices = (nw: NewDraft, setNw: SetNw, field: Field, key: string, options: string[], steersAi = false, note = ''): { key: string; hint: string; chips: Chip[] } => ({
  key, hint: steersAi ? STEERS : note, chips: options.map((o) => ({ key: o, label: o, on: nw[field]?.[key] === o, pick: () => setNw((cur) => ({ [field]: { ...cur[field], [key]: o } })) })),
});

// Which stock looks and voices a studio casts (no media yet: the picks are role labels and voice names).
function castPickers(def: StudioDef) {
  const looks = STOCK_LOOKS.map((l) => l.role);
  return def.cast === 'look' ? [{ key: 'Look', options: looks }] : def.cast === 'voice' ? [{ key: 'Voice', options: STOCK_VOICES }]
    : def.cast === 'voices' ? [{ key: 'Host voice', options: STOCK_VOICES }, { key: 'Guest voice', options: STOCK_VOICES }] : [];
}

// A question's options, without the ones only Draft with AI delivers while it cannot run (and why), but never hiding the
// answer already chosen.
function offered(aiOn: boolean, q: string, options: string[], chosen: string | undefined) {
  const only = AI_ONLY[q], cut = !!only && !aiOn;
  return { options: cut ? options.filter((o) => !only.options.includes(o) || o === chosen) : options, note: cut ? only.why : '' };
}

// The build steps as stored on the draft, fitted to the studio's own output when it has a runner that makes one.
function built(def: StudioDef, nw: NewDraft, list: StudioEntry[]) {
  const steps = nw.build ?? startBuild(def.build ?? []), b = BUILDS[def.id];
  return b ? fitBuilt(steps, b.built(list)) : steps;
}

export function stepVals(L: Logic, def: StudioDef, nw: NewDraft, setNw: SetNw, bundles: Bundle[]) {
  const list = (nw.items?.list ?? []) as StudioEntry[], text2 = def.items.some((i) => i.length === 3), check = questionsOf(list), aiOn = L.aiCan('studio_draft');
  // Editing the rows keeps the items' provenance and any check after them; a hand-made list says 'manual'.
  const change = (f: (rows: StudioItem[], check: ExamQuestion[]) => StudioEntry[]) => setNw((cur) => { const it = cur.items ?? noItems(), all = it.list as StudioEntry[];
    return { items: { ...it, list: f(stepsOf(all), questionsOf(all)) as Item[], how: it.how || 'manual', problems: [] } }; });
  return {
    shape: def.qs.map(([q, options, steers]) => { const o = offered(aiOn, q, options, nw.shape?.[q]); return choices(nw, setNw, 'shape', q, o.options, steers, o.note); }),
    produce: def.rows.map(([row, options, steers]) => choices(nw, setNw, 'produce', row, options, steers)),
    cast: castPickers(def).map((p) => choices(nw, setNw, 'cast', p.key, p.options)),
    rows: stepsOf(list).map((r, k) => ({ label: r[0], text: r[1], text2: r[2] ?? '',
      edit: (f: 0 | 1 | 2, v: string) => change((rows, q) => [...rows.map((x, i) => (i === k ? (x.map((y, j) => (j === f ? v : y)) as StudioItem) : x)), ...q]),
      remove: () => change((rows, q) => [...rows.filter((_, i) => i !== k), ...q]) })),
    check: check.length ? { head: 'Check · ' + check.length + ' questions · with the right answer', rows: itemRows('Practice exam', check), remove: () => change((rows) => rows) } : null,
    hasText2: text2, problems: studioProblems(def, list, nw.shape ?? {}, aiOn),
    add: () => change((rows, q) => [...rows, (text2 ? ['', '', ''] : ['', '']) as StudioItem, ...q]),
    // "Draft with AI" (the one pipeline in studioDraft.ts). Flash keeps its own draft button in the item panel and does not use this.
    aiDraft: { label: L.state.nwAiBusy ? 'Drafting' : 'Draft with AI', busy: L.state.nwAiBusy,
      run: () => draftItems(L, nw, bundles, setNw, studioQuery(nw), studioSpec(def, nw)) },
    build: def.build ? { steps: built(def, nw, list), set: (b: NonNullable<NewDraft['build']>) => setNw({ build: b }) } : null,
    motion: def.id === 'motion' ? motionProduce(L, nw, setNw) : null,
  };
}
