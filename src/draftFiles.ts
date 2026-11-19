// The image files a saved course stops naming (E-learning Studio, Task 2.3), removed from Storage by the one save step (createSave.saveThen, saveWithFile) and
// only after the draft that stops naming them is saved: leaving without saving keeps every file the saved draft still names. A file another block still names stays.
import type { Logic } from './model';
import type { AppState } from './types';
import { removePaths } from './lib/mediaStore';
import { orphanedImages } from './logic/courseEdit';
import type { StudioEntry } from './logic/studios';

// The items of the saved row `id` as the screen last loaded them.
export const savedItems = (s: AppState, id: string | null): StudioEntry[] => ((id && s.create?.contributions.find((c) => c.id === id)?.items) || []) as StudioEntry[];

// A failure leaves a file in Storage, never a broken course.
export function dropUnnamed(L: Logic, before: StudioEntry[], after: StudioEntry[]): void {
  const gone = orphanedImages(before, after);
  if (gone.length) removePaths(gone, true).catch(() => L.say('An image file could not be removed from storage'));
}
