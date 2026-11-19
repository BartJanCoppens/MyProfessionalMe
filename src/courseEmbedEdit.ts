// The course editor's embeds (E-learning Studio, Task 2.2): the shelf groups, the published learnings a block's Source can pick, and what the check
// asks of the library. A learning is offered only when it is published, of the block's format and not a course.
import { LEARN, LEARN_BY } from './data';
import type { Opt } from './ds';
import { isPublished } from './fmtCourse';
import type { EmbedFormat } from './logic/courseContent';
import { STUDIOS } from './studioData';
import { studioFormats } from './logic/studios';

// The design's shelf (EL_SHELF), in the app's names: [format, label].
export const EMBED_SHELF: { group: string; items: [EmbedFormat, string][] }[] = [
  { group: 'From the studios', items: [['Avatar', 'Avatar conversation'], ['Reel', 'Reel'], ['Podcast', 'Podcast'], ['Game', 'Game'], ['Slides', 'Slides'], ['Animated flow', 'Animated flow'], ['Interactive explainer', 'Explainer']] },
  { group: 'Practice and reference', items: [['Flash cards', 'Flash cards'], ['Practice exam', 'Practice exam'], ['Job aid', 'Job aid'], ['Case exercise', 'Case exercise']] },
];
export const studioOfFormat = (format: string) => STUDIOS.find((d) => studioFormats(d).includes(format));
export const embedGlyph = (format: string) => studioOfFormat(format)?.glyph ?? '';

// A published learning of this format exists (what the course check asks, private.course_embed_problems).
export const embedAvailable = (learning: string, format: string) => LEARN_BY[learning]?.[4] === format && format !== 'E-learning' && isPublished(learning);

// The Source select: the published learnings of the format, newest first; the one already picked stays listed (marked) when it is gone.
export function embedSources(format: EmbedFormat, picked: string): Opt[] {
  const rows = LEARN.filter((r) => r[4] === format && isPublished(r[0])).sort((a, b) => Number(b[0].slice(1)) - Number(a[0].slice(1)));
  const gone = picked && !rows.some((r) => r[0] === picked) ? [{ value: picked, label: (LEARN_BY[picked]?.[1] ? '“' + LEARN_BY[picked][1] + '” ' : '') + '(not available)' }] : [];
  return [{ value: '', label: rows.length ? 'Pick from the library…' : 'Nothing in the library yet' }, ...gone, ...rows.map((r) => ({ value: r[0], label: r[1] }))];
}
