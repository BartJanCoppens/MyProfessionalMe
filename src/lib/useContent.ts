import { useCallback, useEffect, useState } from 'react';
import { setCatalogue } from '../data';
import { loadContent } from './contentStore';
import type { Content } from './contentStore';

// Loads the learning catalogue, curriculum mappings and knowledge bundles once per session. Loading also fills LEARN.
export function useContent() {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { const c = await loadContent(); setCatalogue(c.learnings); setContent(c); return c; }, []);
  useEffect(() => {
    let live = true;
    loadContent().then((c) => { if (live) { setCatalogue(c.learnings); setContent(c); } }, (err) => { if (live) setError((err as Error).message); });
    return () => { live = false; };
  }, []);
  const retry = () => { setError(null); reload().catch((err) => setError((err as Error).message)); };
  return { content, error, retry, reload };
}
