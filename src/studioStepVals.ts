// The Shape, Draft and Produce steps of a generic studio, as view-model: questions and produce rows as chip choices and the
// studio's items as label/text(/text2) rows. Every answer lives on the draft (`nw.shape`, `nw.produce`, `nw.cast`, `nw.studioItems`).
import type { NewDraft } from './types';
import type { SetNw } from './createItems';
import { itemsValid } from './logic/studios';
import type { StudioDef, StudioItem } from './logic/studios';
import { STOCK_LOOKS, STOCK_VOICES } from './studioData';

type Field = 'shape' | 'produce' | 'cast';
type Choice = { label: string; on: boolean; pick: () => void };

// A group of chips for one question: choosing stores the answer under the question (or row label) on the draft.
const choices = (nw: NewDraft, setNw: SetNw, field: Field, key: string, options: string[]): { key: string; options: Choice[] } => ({
  key, options: options.map((o) => ({ label: o, on: nw[field]?.[key] === o, pick: () => setNw((cur) => ({ [field]: { ...cur[field], [key]: o } })) })),
});

// Which stock looks and voices a studio casts (no media yet: the picks are role labels and voice names).
function castPickers(def: StudioDef) {
  const looks = STOCK_LOOKS.map((l) => l.role);
  return def.cast === 'look' ? [{ key: 'Look', options: looks }] : def.cast === 'voice' ? [{ key: 'Voice', options: STOCK_VOICES }]
    : def.cast === 'voices' ? [{ key: 'Host voice', options: STOCK_VOICES }, { key: 'Guest voice', options: STOCK_VOICES }] : [];
}

export function stepVals(def: StudioDef, nw: NewDraft, setNw: SetNw) {
  const list = nw.studioItems ?? [], text2 = def.items.some((i) => i.length === 3);
  const edit = (k: number, f: 0 | 1 | 2, v: string) => setNw((cur) => ({ studioItems: (cur.studioItems ?? []).map((r, i) => (i === k ? (r.map((x, j) => (j === f ? v : x)) as StudioItem) : r)) }));
  return {
    shape: def.qs.map(([q, options]) => choices(nw, setNw, 'shape', q, options)),
    produce: def.rows.map(([row, options]) => choices(nw, setNw, 'produce', row, options)),
    cast: castPickers(def).map((p) => choices(nw, setNw, 'cast', p.key, p.options)),
    rows: list.map((r, k) => ({ label: r[0], text: r[1], text2: r[2] ?? '', edit: (f: 0 | 1 | 2, v: string) => edit(k, f, v),
      remove: () => setNw((cur) => ({ studioItems: (cur.studioItems ?? []).filter((_, i) => i !== k) })) })),
    hasText2: text2, problems: itemsValid(def, list),
    add: () => setNw((cur) => ({ studioItems: [...(cur.studioItems ?? []), text2 ? ['', '', ''] : ['', '']] as StudioItem[] })),
    // Task 1.4: "Draft with AI" for the other studios goes here (one more action in this object). Flash keeps its own draft button in the item panel.
    aiDraft: null,
    build: def.build,
  };
}
