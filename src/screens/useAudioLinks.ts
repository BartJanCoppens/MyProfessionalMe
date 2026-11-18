// The signed links of a piece's stored audio (a deck's slides, an episode's turns), in order: null while they load, or why they
// could not be opened.
import { useEffect, useState } from 'react';
import { mediaUrl } from '../lib/mediaStore';

export function useAudioLinks(paths: string[]): { urls: string[] } | { error: string } | null {
  const key = paths.join('|'), [got, setGot] = useState<{ key: string; urls?: string[]; error?: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    let on = true;
    Promise.all(key.split('|').map((p) => mediaUrl(p))).then((urls) => on && setGot({ key, urls }), (e: Error) => on && setGot({ key, error: e.message }));
    return () => { on = false; };
  }, [key]);
  if (!key) return { urls: [] };
  if (!got || got.key !== key) return null;
  return got.urls ? { urls: got.urls } : { error: got.error ?? 'The voice-over could not be opened' };
}
