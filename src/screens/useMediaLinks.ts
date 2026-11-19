// The signed links of a piece's stored media files (a deck's voice-overs, an episode's turns, a course's pictures), in order: null while they load, or why they
// could not be opened.
import { useEffect, useState } from 'react';
import { mediaUrl } from '../lib/mediaStore';

export function useMediaLinks(paths: string[]): { urls: string[] } | { error: string } | null {
  const key = paths.join('|'), [got, setGot] = useState<{ key: string; urls?: string[]; error?: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    let on = true;
    Promise.all(key.split('|').map((p) => mediaUrl(p))).then((urls) => on && setGot({ key, urls }), (e: Error) => on && setGot({ key, error: e.message }));
    return () => { on = false; };
  }, [key]);
  if (!key) return { urls: [] };
  if (!got || got.key !== key) return null;
  return got.urls ? { urls: got.urls } : { error: got.error ?? 'The file could not be opened' };
}
