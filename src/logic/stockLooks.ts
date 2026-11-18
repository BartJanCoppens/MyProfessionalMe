// A stock look (public.stock_looks): a role and an age as its name, never a person's name; the key of a portrait drawn in
// code (src/reel/portraits.ts); an accent colour; and the licence of the picture. Looks are switched off, never deleted.
// The rules below repeat the table's checks (stockLooks.sync.test.ts).
import { PORTRAIT_KEYS } from '../reel/portraits';
import type { PortraitKey } from '../reel/portraits';

export type StockLook = { id: string; name: string; portrait: PortraitKey; color: string; licence: string; active: boolean };
export type StockLookForm = { name: string; portrait: PortraitKey; color: string; licence: string };

export const DRAWN_LICENCE = 'Drawn in code for MyProfessionalMe · no real person · no third-party image';
export const blankLook = (): StockLookForm => ({ name: '', portrait: PORTRAIT_KEYS[0], color: '#2f7fc1', licence: DRAWN_LICENCE });

export function stockLookProblem(f: StockLookForm): string | null {
  const name = f.name.trim(), licence = f.licence.trim();
  if (!name || name.length > 80) return 'Name the look as a role and an age, e.g. HR director · 50s';
  if (!PORTRAIT_KEYS.includes(f.portrait)) return 'Choose one of the drawn portraits';
  if (!/^#[0-9a-f]{6}$/.test(f.color.trim().toLowerCase())) return 'The colour is six hex digits, e.g. #2f7fc1';
  if (!licence || licence.length > 200) return 'Say where the picture comes from (at most 200 characters)';
  return null;
}

// The look a studio draft names (its role), among the looks offered.
export const lookOf = (looks: StockLook[] | null | undefined, name: string | undefined) => looks?.find((l) => l.name === name);
