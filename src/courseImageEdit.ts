// Pictures in the course editor (E-learning Studio, Task 2.3). Choosing a file saves the draft first (the one save step, createSave.saveWithFile), stores the
// file in the contribution's own folder under a name of its own (the block's id and a random part, so a replacement never overwrites a file a duplicate still
// names), and names it in the block. A file the course stops naming (a replaced image, a removed block or lesson) is removed by the save step after the save
// (draftFiles.dropUnnamed).
import type { Logic } from './model';
import { saveWithFile } from './createSave';
import { uploadMedia } from './lib/mediaStore';
import type { CourseBlock } from './logic/courseContent';
import { patchBlock } from './logic/courseEdit';
import type { Item } from './logic/items';
import { IMAGE_EXTENSIONS, IMAGE_MAX_BYTES, MEDIA_KINDS, imageProblem, mediaFileName } from './logic/mediaFiles';
import { currentList } from './studioDraft';

export const IMAGE_ACCEPT = [...new Set(IMAGE_EXTENSIONS.map((e) => MEDIA_KINDS[e].mime))].join(',');
export const IMAGE_HINT = 'PNG, JPEG or WebP, up to ' + IMAGE_MAX_BYTES / 1024 / 1024 + ' MB';

// The file as the block's image: its type and size are checked before anything is saved or stored.
export async function setCourseImage(L: Logic, blockId: string, file: File): Promise<void> {
  if (L.readOnly()) return;
  const why = imageProblem(file.name, file.size);
  if (why) { L.say(why); return; }
  const name = blockId + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 6) + '.' + mediaFileName(file.name).split('.').pop()!.toLowerCase();
  await saveWithFile(L, async (id) => patchBlock(currentList(L), blockId, { path: await uploadMedia(id, file, name) } as Partial<CourseBlock>) as Item[], {}, 'Saved as draft · the image is stored with it', 'manual');
}
