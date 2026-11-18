// The Avatar Studio's cast as view-model (studios plan, Task 6.6): a stock look (each says "Live video" or "Portrait only") and an optional stock voice for the portrait,
// offered only while the avatar voice is live. Both are Produce answers saved inside the draft's shape by their ids; never a face or voice of a person (S5).
import type { SetNw } from './createItems';
import type { Logic } from './model';
import { lookOf, liveVideoOf } from './logic/stockLooks';
import type { Chip } from './screens/ChipGroup';
import { liveOn } from './lib/ai';
import { NO_STOCK_VOICES, stockVoicesOf } from './studioVoicing';
import type { NewDraft } from './types';

export const VOICE_HINT = 'Speaks the portrait · optional';
export const NO_VOICE = 'No voice · the browser voice speaks';
type Group = { key: string; hint: string; chips: Chip[] };

/** The avatar voice (the portrait's) answers now. */
export const avatarVoiceOn = (L: Logic) => liveOn(L.aiOpts(), 'avatar_voice');

// The voice's choice: "No voice" or one of the active stock voices; the draft stores the voice's id ('' for none).
function voiceGroup(L: Logic, nw: NewDraft, setNw: SetNw): Group {
  const voices = stockVoicesOf(L) ?? [], chosen = nw.cast?.Voice ?? '';
  const chip = (id: string, label: string): Chip => ({ key: id || 'none', label, on: chosen === id, pick: () => setNw((cur) => ({ cast: { ...cur.cast, Voice: id } })) });
  return { key: 'Voice', hint: stockVoicesOf(L) && !voices.length ? NO_STOCK_VOICES : VOICE_HINT, chips: [chip('', NO_VOICE), ...voices.map((v) => chip(v.id, v.name))] };
}

// `look` is the studio's shared look picker (chips with the drawn portrait, keyed by the look's id); this adds what the look can do.
export function avatarCast(L: Logic, nw: NewDraft, setNw: SetNw, look: (options: string[]) => Group): Group[] {
  const looks = (L.state.stockLooks ?? []).filter((l) => l.active), group = look(looks.map((l) => l.id));
  const withVideo = { ...group, chips: group.chips.map((c) => ({ ...c, label: c.label + ' · ' + liveVideoOf(lookOf(looks, c.key)!) })) };
  return avatarVoiceOn(L) ? [withVideo, voiceGroup(L, nw, setNw)] : [withVideo];
}
