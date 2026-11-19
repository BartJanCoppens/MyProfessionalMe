// Media files in the private `media` bucket (Studios Phase 3): which files the app uploads, how large each kind may be,
// and the one path shape <author id>/<contribution id>/<file>. The bucket (size limit, types) and private.media_path_ok
// in supabase/migrations/20261117270000_media_storage.sql repeat these rules; mediaFiles.test.ts keeps them in step.
// A published learning names a file by a "path" member anywhere in its content, e.g. { audio: { path } }.
import { UUID, UUID_PART } from '../../supabase/functions/_shared/aiGuard.ts';

export const MEDIA_BUCKET = 'media';
const MB = 1024 * 1024;
export const MEDIA_MAX_BYTES = 50 * MB; // the bucket's file size limit
export const IMAGE_MAX_BYTES = 5 * MB; // a picture in a course: the bucket already lists image/png, image/jpeg and image/webp, never svg (it can carry script)

export type MediaKind = { label: string; mime: string; maxBytes: number };
// By file extension. A .horizon presentation is JSON; narration and podcasts are audio, a rendered reel is video (the Reel Studio's cut), a course shows images.
export const MEDIA_KINDS: Record<string, MediaKind> = {
  horizon: { label: 'A Horizon presentation', mime: 'application/json', maxBytes: 50 * MB },
  mp3: { label: 'An audio file', mime: 'audio/mpeg', maxBytes: 25 * MB },
  m4a: { label: 'An audio file', mime: 'audio/mp4', maxBytes: 25 * MB },
  mp4: { label: 'A video', mime: 'video/mp4', maxBytes: 50 * MB },
  webm: { label: 'A video', mime: 'video/webm', maxBytes: 50 * MB },
  png: { label: 'An image', mime: 'image/png', maxBytes: IMAGE_MAX_BYTES },
  jpg: { label: 'An image', mime: 'image/jpeg', maxBytes: IMAGE_MAX_BYTES },
  jpeg: { label: 'An image', mime: 'image/jpeg', maxBytes: IMAGE_MAX_BYTES },
  webp: { label: 'An image', mime: 'image/webp', maxBytes: IMAGE_MAX_BYTES },
};
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;

// The documents an admin adds as sources of a trajectory plan (Phase 7). Not a contribution file: MEDIA_KINDS takes no PDF.
export const SOURCE_KINDS: Record<string, MediaKind> = { pdf: { label: 'A PDF', mime: 'application/pdf', maxBytes: 20 * MB } };

const FILE = '[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}';
export const MEDIA_PATH = new RegExp('^' + UUID_PART + '/' + UUID_PART + '/' + FILE + '$');
const NAME_MAX = 100;

// A file name the path accepts: other characters become '-', no leading dot, at most 100 characters with the extension kept.
export function mediaFileName(name: string): string {
  const safe = name.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^\.+/, '');
  if (safe.length <= NAME_MAX) return safe;
  const dot = safe.lastIndexOf('.'), ext = dot > 0 && safe.length - dot <= 10 ? safe.slice(dot) : '';
  return safe.slice(0, NAME_MAX - ext.length) + ext;
}

export const mediaKind = (name: string): MediaKind | undefined => {
  const safe = mediaFileName(name), dot = safe.lastIndexOf('.');
  return dot > 0 ? MEDIA_KINDS[safe.slice(dot + 1).toLowerCase()] : undefined;
};

// Why a file cannot be uploaded, in words, or null.
export function mediaProblem(name: string, bytes: number): string | null {
  const kind = mediaKind(name);
  if (!kind) {
    const exts = Object.keys(MEDIA_KINDS).map((k) => '.' + k);
    return 'Only ' + exts.slice(0, -1).join(', ') + ' and ' + exts[exts.length - 1] + ' files can be added';
  }
  if (bytes <= 0) return 'The file is empty';
  if (bytes > kind.maxBytes) return kind.label + ' is at most ' + kind.maxBytes / MB + ' MB · this one is ' + (bytes / MB).toFixed(1) + ' MB';
  return null;
}

// Why a file cannot be added as an image, or null: the extension must be an image's, then the kind's size rules.
export function imageProblem(name: string, bytes: number): string | null {
  const dot = mediaFileName(name).lastIndexOf('.'), ext = dot > 0 ? mediaFileName(name).slice(dot + 1).toLowerCase() : '';
  if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) return 'Only ' + IMAGE_EXTENSIONS.slice(0, -1).map((e) => '.' + e).join(', ') + ' and .' + IMAGE_EXTENSIONS[IMAGE_EXTENSIONS.length - 1] + ' images can be added';
  return mediaProblem(name, bytes);
}

// Why a source document cannot be added, in words, or null.
export function sourceProblem(name: string, bytes: number): string | null {
  const kind = SOURCE_KINDS.pdf;
  if (!/\.pdf$/i.test(name.trim())) return 'Only .pdf files can be added as sources';
  if (bytes <= 0) return 'The file is empty';
  if (bytes > kind.maxBytes) return kind.label + ' is at most ' + kind.maxBytes / MB + ' MB · this one is ' + (bytes / MB).toFixed(1) + ' MB';
  return null;
}

// The one place a contribution's folder and a media path are built.
export function mediaFolder(userId: string, contributionId: string): string {
  if (!UUID.test(userId)) throw new Error('Sign in again to add files');
  if (!UUID.test(contributionId)) throw new Error('Save the contribution before adding files');
  return userId + '/' + contributionId;
}
export function mediaPath(userId: string, contributionId: string, name: string): string {
  const path = mediaFolder(userId, contributionId) + '/' + mediaFileName(name);
  if (!MEDIA_PATH.test(path)) throw new Error('Give the file a name');
  return path;
}
