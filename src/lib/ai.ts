// One way for the app to ask AI for text. Order:
//   1. window.claude.complete, inside Claude Design;
//   2. the `ai` edge function, when this use is live (a System Admin gave it a connection with a key and a model);
//   3. otherwise null, and the caller shows its scripted reply (and says so).
// `enabled` is false with ?live=off. A failure at step 1 or 2 also returns null; nothing falls through to another source.
import { askAi } from './aiStore';
import type { AiRequest } from './aiStore';
import type { AiUseKey } from '../logic/ai';
import { USE_LIMITS } from '../../supabase/functions/_shared/aiGuard.ts';

export type { AiRequest };
export type AiSource = 'design' | 'connection';
// onError hears why a source failed (e.g. "Daily AI limit reached …"); the caller still gets null.
// cut: the answer stopped at its length limit (a file written in parts). An injected ask may answer with the text alone.
export type CompleteOpts = { enabled: boolean; live: readonly string[]; timeoutMs?: number; ask?: (use: string, req: AiRequest) => Promise<string | { text: string; cut?: boolean }>; onError?: (err: Error) => void };

declare global {
  interface Window { claude?: { complete?: (req: unknown) => Promise<string> } }
}

export const designAi = () => typeof window !== 'undefined' && typeof window.claude?.complete === 'function';
// Whether a use would be answered by AI right now (before trying).
export const canComplete = (use: AiUseKey, opts: Pick<CompleteOpts, 'enabled' | 'live'>) => opts.enabled && (designAi() || opts.live.includes(use));

const within = <T>(p: Promise<T>, ms: number) => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

// A use that writes long answers waits for the time the function allows it, plus ten seconds for the round trip.
const waitFor = (use: AiUseKey) => (USE_LIMITS[use] ? USE_LIMITS[use].timeoutMs + 10_000 : 45_000);

export async function complete(use: AiUseKey, req: AiRequest, opts: CompleteOpts): Promise<{ text: string; via: AiSource; cut: boolean } | null> {
  if (!opts.enabled) return null;
  const ms = opts.timeoutMs ?? waitFor(use);
  try {
    if (designAi()) return { text: String(await within(window.claude!.complete!(req), ms)), via: 'design', cut: false };
    if (opts.live.includes(use)) {
      const got = await within((opts.ask || askAi)(use, req), ms);
      return typeof got === 'string' ? { text: got, via: 'connection', cut: false } : { text: got.text, via: 'connection', cut: !!got.cut };
    }
  } catch (err) { opts.onError?.(err as Error); }
  return null;
}
