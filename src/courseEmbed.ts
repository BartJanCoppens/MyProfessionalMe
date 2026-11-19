// An embedded learning's panel view-model (E-learning Studio, Task 2.1): the learner's own view of a published learning of another studio, built exactly as
// the learning's detail page builds it (fmtVals), so playing it inside a course finishes, saves and counts on that learning's own rules and hours. The
// embed's card and its open state are in fmtCourse.ts (embedView).
import { embeddedRow } from './fmtCourse';
import { fmtVals } from './fmtVals';
import type { Item, Logic } from './model';

// null when the learning is missing, no longer published, or a course (a course never plays inside a course).
export function embedVals(L: Logic, learningId: string): { item: Item; det: ReturnType<typeof fmtVals> } | null {
  const row = embeddedRow(learningId);
  if (!row) return null;
  const item = L.item(row);
  return { item, det: fmtVals(L, item) };
}
