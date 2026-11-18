// The video item of a Reel (studios plan, Task 5.5): the cut the browser made, the last item of a studio reel after its rows and its
// voice-over. `made` says what the cut was made from, so a later edit shows up as a stale cut (videoCurrent in reelContent.ts):
// the rows, the paths of the voice clips, the stock look, the format, the captions and the music. Mirrored by private.video_ok and
// private.reel_made_ok in supabase/migrations/20261118180000_reel_studio.sql (reelContent.test.ts compares the lists and limits).
import { MEDIA_PATH } from './mediaFiles';

export const FORMATS = ['9:16 vertical', '1:1 square'] as const;
export const CAPTION_MODES = ['Burned in', 'Separate file'] as const;
export const MUSICS = ['None', 'Calm', 'Upbeat'] as const;
// The size of each format, as stored (the compositor's own sizes are src/reel/cutRules.ts CUT_SIZES).
export const SIZE_OF = { '9:16 vertical': '720x1280', '1:1 square': '1080x1080' } as const;
export const MIME_OF_EXT = { mp4: 'video/mp4', webm: 'video/webm' } as const;
export const VIDEO_SECONDS_MAX = 90;
export const VIDEO_ROWS_MAX = 8;
export const VIDEO_CLIPS_MAX = 7;

export type CutMade = { rows: string[][]; clips: string[]; look: string | null; format: (typeof FORMATS)[number]; captions: (typeof CAPTION_MODES)[number]; music: (typeof MUSICS)[number] };
export type VideoItem = { kind: 'video'; path: string; seconds: number; size: '720x1280' | '1080x1080'; mime: 'video/mp4' | 'video/webm'; made: CutMade };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const exactly = (x: Record<string, unknown>, keys: string[]) => Object.keys(x).length === keys.length && keys.every((k) => k in x);
const isStrings = (v: unknown, min: number, max: number) => Array.isArray(v) && v.length >= min && v.length <= max && v.every((s) => typeof s === 'string');

export function isCutMade(m: unknown, size: string): m is CutMade {
  const x = m as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || Array.isArray(x) || !exactly(x, ['rows', 'clips', 'look', 'format', 'captions', 'music'])) return false;
  const rows = x.rows, clips = x.clips;
  return Array.isArray(rows) && rows.length >= 1 && rows.length <= VIDEO_ROWS_MAX && rows.every((r) => isStrings(r, 2, 3))
    && Array.isArray(clips) && clips.length <= VIDEO_CLIPS_MAX && clips.every((c) => typeof c === 'string' && MEDIA_PATH.test(c) && c.endsWith('.mp3'))
    && (x.look === null || (typeof x.look === 'string' && UUID.test(x.look)))
    && (FORMATS as readonly unknown[]).includes(x.format) && SIZE_OF[x.format as keyof typeof SIZE_OF] === size
    && (CAPTION_MODES as readonly unknown[]).includes(x.captions) && (MUSICS as readonly unknown[]).includes(x.music);
}

export function isVideoItem(v: unknown): v is VideoItem {
  const x = v as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || Array.isArray(x) || !exactly(x, ['kind', 'path', 'seconds', 'size', 'mime', 'made']) || x.kind !== 'video') return false;
  const path = x.path, ext = typeof path === 'string' ? path.slice(path.lastIndexOf('.') + 1) : '';
  return typeof path === 'string' && MEDIA_PATH.test(path) && MIME_OF_EXT[ext as keyof typeof MIME_OF_EXT] === x.mime
    && typeof x.seconds === 'number' && Number.isFinite(x.seconds) && x.seconds > 0 && x.seconds <= VIDEO_SECONDS_MAX
    && (x.size === '720x1280' || x.size === '1080x1080') && isCutMade(x.made, x.size);
}
export const videoOf = (items: readonly unknown[]): VideoItem | null => (items.find(isVideoItem) as VideoItem | undefined) ?? null;
