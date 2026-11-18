// A Slides piece's voice-over (studios plan, Task 3.4): the one item after its slide rows that holds the clips the AI
// voice made, one per slide. A clip says which slide, the words it was made from (a clip only counts while the slide's
// talk-over still says them), the stored mp3 in the contribution's folder, its length and where its ⟨next⟩ and ⟨cue⟩
// marks fall. Mirrored by private.voice_ok in supabase/migrations/20261117300000_slides_studio.sql (slidesContent.test.ts
// compares the limits).
import type { RunMark } from './narration';
import { VOICE_ID } from '../../supabase/functions/_shared/voiceRules.ts';
import { MEDIA_PATH } from './mediaFiles';

// voice: the stock voice's provider id; one voice for the whole deck (boundClips).
export type Clip = { slide: number; text: string; voice: string; path: string; seconds: number; marks: RunMark[] };
export type VoiceItem = { kind: 'voice'; clips: Clip[] };

export const CLIPS_MAX = 14; // one per slide (private.item_max('Slides') less the place the voice-over takes)
export const CLIP_SECONDS_MAX = 180;
export const CLIP_MARKS_MAX = 50;
export const CLIP_TEXT_MAX = 600;
const CLIP_KEYS = ['slide', 'text', 'voice', 'path', 'seconds', 'marks'];

const isMark = (m: unknown) => {
  const x = m as Record<string, unknown> | null;
  return !!x && typeof x === 'object' && Object.keys(x).length === 2 && (x.kind === 'next' || x.kind === 'cue')
    && typeof x.at === 'number' && Number.isFinite(x.at) && x.at >= 0 && x.at <= CLIP_SECONDS_MAX;
};
// The stored audio of one slide, as a clip holds it and as a published slide names it: an mp3 in the media folder
// shape, its length and its marks.
export const isAudio = (a: unknown): a is { path: string; seconds: number; marks: RunMark[] } => {
  const x = a as Record<string, unknown> | null;
  return !!x && typeof x === 'object' && typeof x.path === 'string' && MEDIA_PATH.test(x.path) && x.path.endsWith('.mp3')
    && typeof x.seconds === 'number' && Number.isFinite(x.seconds) && x.seconds > 0 && x.seconds <= CLIP_SECONDS_MAX
    && Array.isArray(x.marks) && x.marks.length <= CLIP_MARKS_MAX && x.marks.every(isMark);
};
const isClip = (c: unknown): c is Clip => {
  const x = c as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const keys = Object.keys(x);
  return keys.length === CLIP_KEYS.length && CLIP_KEYS.every((k) => keys.includes(k))
    && Number.isInteger(x.slide) && (x.slide as number) >= 0 && (x.slide as number) < CLIPS_MAX
    && typeof x.text === 'string' && x.text.trim() !== '' && x.text.length <= CLIP_TEXT_MAX && typeof x.voice === 'string' && VOICE_ID.test(x.voice) && isAudio(x);
};

export function isVoiceItem(v: unknown): v is VoiceItem {
  const x = v as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).length !== 2 || x.kind !== 'voice') return false;
  const clips = x.clips;
  return Array.isArray(clips) && clips.length >= 1 && clips.length <= CLIPS_MAX && clips.every(isClip) && new Set(clips.map((c: Clip) => c.slide)).size === clips.length;
}
export const voiceOf = (items: readonly unknown[]): VoiceItem | null => (items.find(isVoiceItem) as VoiceItem | undefined) ?? null;
