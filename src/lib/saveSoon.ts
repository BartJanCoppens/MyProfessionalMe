// The debounce of a store that saves edits in bursts (trajectories, trajectory plans). One timer per key; a scheduled save reads
// the value as it is when the timer fires, so the last edit wins, and each key writes one at a time, in order (inOrder, shared
// with the bundles). The key is the row's id, prefixed when two kinds of row share ids (a plan is keyed `plan:<trajectory id>`).
import { inOrder } from './contentStore';

type Held = { handle: number; run: () => void; wait: number };
const timers = new Map<string, Held>();

function schedule(key: string, run: () => void, wait: number) {
  clearTimeout(timers.get(key)?.handle);
  timers.set(key, { handle: window.setTimeout(() => { timers.delete(key); run(); }, wait), run, wait });
}

// Writes `latest()` after `wait` ms of quiet (nothing when it gives undefined); a failure goes to onError.
export function saveSoon<T>(key: string, latest: () => T | undefined, write: (value: T) => Promise<void>, onError: (message: string) => void, wait = 600) {
  schedule(key, () => { const value = latest(); if (value !== undefined) inOrder(key, () => write(value)).catch((err) => onError((err as Error).message)); }, wait);
}

// Before a delete: the pending save is held back (never written after the row is gone) and a write already running finishes first.
export async function whileDeleting(key: string, remove: () => Promise<{ error: string | null }>): Promise<{ error: string | null }> {
  const held = timers.get(key);
  clearTimeout(held?.handle);
  timers.delete(key);
  let result: { error: string | null } = { error: null };
  await inOrder(key, async () => { result = await remove(); });
  // A refused delete leaves the row, so the held-back save is scheduled again: an edit the screen shows is not lost.
  if (result.error && held && !timers.has(key)) schedule(key, held.run, held.wait);
  return result;
}

// Drops a pending save (the value it would write is being replaced by a write the caller makes itself).
export function cancelSoon(key: string) {
  clearTimeout(timers.get(key)?.handle);
  timers.delete(key);
}
