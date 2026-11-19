// Pictures in the course editor (E-learning Studio, Task 2.3). Choosing a file saves the draft first (the one save step, createSave.saveWithFile), stores the
// file in the contribution's own folder under a name made from the block's id, and names it in the block. An image the course no longer names (a replaced
// file, a removed block or lesson) is removed from Storage, and never before the course that stops naming it is saved.
import type { Logic } from './model';
import { saveWithFile } from './createSave';
import { removePaths, uploadMedia } from './lib/mediaStore';
import type { CourseBlock } from './logic/courseContent';
import { orphanedImages, patchBlock } from './logic/courseEdit';
import type { Item } from './logic/items';
import { IMAGE_EXTENSIONS, IMAGE_MAX_BYTES, MEDIA_KINDS, imageProblem, mediaFileName } from './logic/mediaFiles';
import type { StudioEntry } from './logic/studios';
import { currentList } from './studioDraft';

export const IMAGE_ACCEPT = [...new Set(IMAGE_EXTENSIONS.map((e) => MEDIA_KINDS[e].mime))].join(',');
export const IMAGE_HINT = 'PNG, JPEG or WebP, up to ' + IMAGE_MAX_BYTES / 1024 / 1024 + ' MB';

// Removes image files nothing names any more; a failure leaves a file in Storage, never a broken course.
export function dropImages(L: Logic, paths: string[]): void {
  if (paths.length) removePaths(paths, true).catch(() => L.say('An image file could not be removed from storage'));
}

// The file as the block's image: its type and size are checked before anything is saved or stored.
export async function setCourseImage(L: Logic, blockId: string, file: File): Promise<void> {
  if (L.readOnly()) return;
  const why = imageProblem(file.name, file.size);
  if (why) { L.say(why); return; }
  const name = blockId + '.' + mediaFileName(file.name).split('.').pop()!.toLowerCase();
  let before: StudioEntry[] = [], after: StudioEntry[] = [];
  const saved = await saveWithFile(L, async (id) => {
    const path = await uploadMedia(id, file, name);
    before = currentList(L);
    after = patchBlock(before, blockId, { path } as Partial<CourseBlock>);
    return after as Item[];
  }, {}, 'Saved as draft · the image is stored with it', 'manual');
  if (saved) dropImages(L, orphanedImages(before, after));
}
