// The Shape, Draft and Produce steps of a generic studio, as view-model: questions and produce rows as chip choices and the
// studio's rows as label/text(/text2). Answers live on the draft: `nw.shape`, `nw.produce`, `nw.cast`, `nw.build` and, for the
// rows, `nw.items` (the one item store, with its `how` provenance, like every format).
import type { NewDraft } from './types';
import type { SetNw } from './createItems';
import { noItems } from './logic/items';
import type { StudioRow } from './logic/items';
import { startBuild } from './logic/studioBuild';
import { itemsValid } from './logic/studios';
import type { StudioDef, StudioItem } from './logic/studios';
import { STOCK_LOOKS, STOCK_VOICES } from './studioData';
import type { Chip } from './screens/ChipGroup';

type Field = 'shape' | 'produce' | 'cast';

// A group of chips for one question: choosing stores the answer under the question (or row label) on the draft.
const choices = (nw: NewDraft, setNw: SetNw, field: Field, key: string, options: string[]): { key: string; chips: Chip[] } => ({
  key, chips: options.map((o) => ({ key: o, label: o, on: nw[field]?.[key] === o, pick: () => setNw((cur) => ({ [field]: { ...cur[field], [key]: o } })) })),
});

// Which stock looks and voices a studio casts (no media yet: the picks are role labels and voice names).
function castPickers(def: StudioDef) {
  const looks = STOCK_LOOKS.map((l) => l.role);
  return def.cast === 'look' ? [{ key: 'Look', options: looks }] : def.cast === 'voice' ? [{ key: 'Voice', options: STOCK_VOICES }]
    : def.cast === 'voices' ? [{ key: 'Host voice', options: STOCK_VOICES }, { key: 'Guest voice', options: STOCK_VOICES }] : [];
}

export function stepVals(def: StudioDef, nw: NewDraft, setNw: SetNw) {
  const list = (nw.items?.list ?? []) as StudioItem[], text2 = def.items.some((i) => i.length === 3);
  // Editing keeps the items' provenance; a hand-made list says 'manual'.
  const change = (f: (rows: StudioItem[]) => StudioItem[]) => setNw((cur) => { const it = cur.items ?? noItems();
    return { items: { ...it, list: f(it.list as StudioItem[]) as StudioRow[], how: it.how || 'manual', problems: [] } }; });
  return {
    shape: def.qs.map(([q, options]) => choices(nw, setNw, 'shape', q, options)),
    produce: def.rows.map(([row, options]) => choices(nw, setNw, 'produce', row, options)),
    cast: castPickers(def).map((p) => choices(nw, setNw, 'cast', p.key, p.options)),
    rows: list.map((r, k) => ({ label: r[0], text: r[1], text2: r[2] ?? '',
      edit: (f: 0 | 1 | 2, v: string) => change((rows) => rows.map((x, i) => (i === k ? (x.map((y, j) => (j === f ? v : y)) as StudioItem) : x))),
      remove: () => change((rows) => rows.filter((_, i) => i !== k)) })),
    hasText2: text2, problems: itemsValid(def, list),
    add: () => change((rows) => [...rows, (text2 ? ['', '', ''] : ['', '']) as StudioItem]),
    // Task 1.4: "Draft with AI" for the other studios goes here (one more action in this object). Flash keeps its own draft button in the item panel.
    aiDraft: null,
    build: def.build ? { steps: nw.build ?? startBuild(def.build), set: (b: NonNullable<NewDraft['build']>) => setNw({ build: b }) } : null,
  };
}
