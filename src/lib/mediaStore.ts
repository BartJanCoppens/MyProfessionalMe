// The one adapter for media files in Supabase Storage (private bucket `media`): upload, signed URL, remove.
// Paths and size rules are in src/logic/mediaFiles.ts; row-level security on storage.objects decides who writes
// (the author while the contribution is a draft or has changes requested) and who reads (author, reviewers, and
// everyone once the published learning names the path). Nothing is public: reading is always a signed URL.
import { supabase } from './supabase';
import { MEDIA_BUCKET, MEDIA_MAX_BYTES, mediaKind, mediaPath, mediaProblem } from '../logic/mediaFiles';

type StorageError = { message: string; statusCode?: string };

// Storage's refusals, in words. A file the caller may not read looks missing to Storage, so both read the same.
const REFUSALS: [RegExp, string][] = [
  [/row-level security|unauthorized/i, 'Not allowed · files change only while your contribution is a draft or has changes requested'],
  [/maximum allowed size|too large/i, 'The file is too large · at most ' + MEDIA_MAX_BYTES / 1024 / 1024 + ' MB'],
  [/mime type|not supported/i, 'This kind of file is not accepted'],
  [/not found/i, 'This file is not there, or not open to you'],
];
const fail = (error: StorageError | null) => {
  if (error) throw new Error(REFUSALS.find(([re]) => re.test(error.message))?.[1] ?? error.message);
};
const bucket = () => supabase.storage.from(MEDIA_BUCKET);

// Uploads (or replaces) a file of the signed-in author's contribution. Returns its path, for the contribution's items.
export async function uploadMedia(contributionId: string, file: Blob, name: string): Promise<string> {
  const problem = mediaProblem(name, file.size);
  if (problem) throw new Error(problem);
  const { data } = await supabase.auth.getSession();
  const path = mediaPath(data.session?.user.id ?? '', contributionId, name);
  const { error } = await bucket().upload(path, file, { contentType: mediaKind(name)!.mime, upsert: true });
  fail(error);
  return path;
}

// A signed URL to play or download the file, valid for `seconds` (an hour by default).
export async function mediaUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, seconds);
  fail(error);
  if (!data?.signedUrl) throw new Error('This file is not there, or not open to you');
  return data.signedUrl;
}

export async function removeMedia(path: string): Promise<void> {
  const { data, error } = await bucket().remove([path]);
  fail(error);
  if (!data?.length) throw new Error('Not removed · only files of your own draft, or one with changes requested, can be removed');
}
