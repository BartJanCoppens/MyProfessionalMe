// The one adapter for media files in Supabase Storage (private bucket `media`): upload, signed URL, read as text, remove.
// Paths and size rules are in src/logic/mediaFiles.ts; row-level security on storage.objects decides who writes
// (the author while the contribution is a draft or has changes requested) and who reads (author, reviewers, and
// everyone once the published learning names the path). Nothing is public: reading is always a signed URL.
import { supabase } from './supabase';
import { MEDIA_BUCKET, MEDIA_MAX_BYTES, mediaFolder, mediaKind, mediaPath, mediaProblem } from '../logic/mediaFiles';

type StorageError = { message: string; statusCode?: string };
type Refusals = [RegExp, string][];

const NOT_ALLOWED = 'Not allowed · files change only while your contribution is a draft or has changes requested';
const NOT_THERE = 'This file is not there, or not open to you';
const NOT_REMOVED = 'Not removed · only files of your own draft, or one with changes requested, can be removed';
// Storage's refusals in words, per call. Storage answers a file the caller may not read as missing.
const UPLOAD: Refusals = [
  [/row-level security|unauthorized/i, NOT_ALLOWED],
  [/maximum allowed size|payload too large/i, 'The file is too large · at most ' + MEDIA_MAX_BYTES / 1024 / 1024 + ' MB'],
  [/mime type \S+ is not supported/i, 'This kind of file is not accepted'],
];
const READ: Refusals = [[/not found|row-level security|unauthorized/i, NOT_THERE]];
const REMOVE: Refusals = [[/row-level security|unauthorized/i, NOT_REMOVED]];
const fail = (error: StorageError | null, refusals: Refusals) => {
  if (error) throw new Error(refusals.find(([re]) => re.test(error.message))?.[1] ?? error.message);
};
const bucket = () => supabase.storage.from(MEDIA_BUCKET);
const signedInId = async () => (await supabase.auth.getSession()).data.session?.user.id ?? '';

// Uploads (or replaces) a file of the signed-in author's contribution. Returns its path, for the contribution's items.
export async function uploadMedia(contributionId: string, file: Blob, name: string): Promise<string> {
  const problem = mediaProblem(name, file.size);
  if (problem) throw new Error(problem);
  const path = mediaPath(await signedInId(), contributionId, name);
  const { error } = await bucket().upload(path, file, { contentType: mediaKind(name)!.mime, upsert: true });
  fail(error, UPLOAD);
  return path;
}

// A signed URL to play or download the file, valid for `seconds` (an hour by default).
export async function mediaUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, seconds);
  fail(error, READ);
  if (!data?.signedUrl) throw new Error(NOT_THERE);
  return data.signedUrl;
}

// A file's text (a .horizon presentation), downloaded once through a signed URL valid for a minute.
export async function mediaText(path: string): Promise<string> {
  const url = await mediaUrl(path, 60);
  let res: Response;
  try { res = await fetch(url); } catch { throw new Error('The file could not be downloaded · check your connection and try again'); }
  if (!res.ok) throw new Error(NOT_THERE);
  return res.text();
}

// Removes every path or throws: Storage skips a file the caller may not remove instead of refusing.
async function removePaths(paths: string[]) {
  const { data, error } = await bucket().remove(paths);
  fail(error, REMOVE);
  if ((data?.length ?? 0) < paths.length) throw new Error(NOT_REMOVED);
}

export const removeMedia = (path: string) => removePaths([path]);

// Removes all files of one of the signed-in author's contributions (before its draft is deleted).
// A contribution holds a few files; 1000 is Storage's page size and far above any studio's count.
export async function removeContributionMedia(contributionId: string): Promise<void> {
  const folder = mediaFolder(await signedInId(), contributionId);
  const { data, error } = await bucket().list(folder, { limit: 1000 });
  fail(error, REMOVE);
  const paths = (data || []).map((f) => folder + '/' + f.name);
  if (paths.length) await removePaths(paths);
}
