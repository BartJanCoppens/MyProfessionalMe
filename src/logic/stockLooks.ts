// A stock look (public.stock_looks): a role and an age as its name, never a person's name; the key of a portrait drawn in
// code (src/reel/portraits.ts); an accent colour; and the licence of the picture. Looks are switched off, never deleted.
// The rules below repeat the table's checks (stockLooks.sync.test.ts).
import { PORTRAIT_KEYS } from '../reel/portraits';
import type { PortraitKey } from '../reel/portraits';
import { UUID } from '../../supabase/functions/_shared/aiGuard.ts';

// heygen_avatar_id / heygen_voice_id: a HeyGen stock avatar (and its HeyGen voice) for the live video; a look without an avatar id is "Portrait only".
export type StockLook = { id: string; name: string; portrait: PortraitKey; color: string; licence: string; active: boolean; heygen_avatar_id?: string | null; heygen_voice_id?: string | null };
// id: set when the form edits a look's HeyGen ids (the one drawer adds and edits).
export type StockLookForm = { id?: string; name: string; portrait: PortraitKey; color: string; licence: string; heygen_avatar_id: string; heygen_voice_id: string };
export const HEYGEN_LICENCE = 'HeyGen stock avatar · no real colleague';
export const liveVideoOf = (l: Pick<StockLook, 'heygen_avatar_id'>) => (l.heygen_avatar_id ? 'Live video' : 'Portrait only');

export const DRAWN_LICENCE = 'Drawn in code for MyProfessionalMe · no real person · no third-party image';
export const blankLook = (): StockLookForm => ({ name: '', portrait: PORTRAIT_KEYS[0], color: '#2f7fc1', licence: DRAWN_LICENCE, heygen_avatar_id: '', heygen_voice_id: '' });

export function stockLookProblem(f: StockLookForm): string | null {
  const name = f.name.trim(), licence = f.licence.trim();
  if (!name || name.length > 80) return 'Name the look as a role and an age, e.g. HR director · 50s';
  if (!PORTRAIT_KEYS.includes(f.portrait)) return 'Choose one of the drawn portraits';
  if (!/^#[0-9a-f]{6}$/.test(f.color.trim().toLowerCase())) return 'The colour is six hex digits, e.g. #2f7fc1';
  if (!licence || licence.length > 200) return 'Say where the picture comes from (at most 200 characters)';
  const avatar = f.heygen_avatar_id.trim(), voice = f.heygen_voice_id.trim();
  if (avatar && !UUID.test(avatar)) return 'The HeyGen avatar id is a uuid, as the LiveAvatar library shows it';
  if (voice && !UUID.test(voice)) return 'The HeyGen voice id is a uuid, as the LiveAvatar library shows it';
  if (voice && !avatar) return 'A HeyGen voice goes with a HeyGen avatar id';
  return null;
}

// The look a studio draft names: a draft stores the look's id, so a rename keeps the pick.
export const lookOf = (looks: StockLook[] | null | undefined, id: string | undefined) => looks?.find((l) => l.id === id);
