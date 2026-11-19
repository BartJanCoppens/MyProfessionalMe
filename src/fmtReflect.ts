// A reflect block's text in a course (E-learning Studio, Task 1.5). Reflections are private to the learner: only the signed-in person's own are loaded and
// saved, kept in AppState.reflections by `learning|block`; in View as nothing is loaded or shown, in the Studio's preview and a reviewer's view nothing is saved.
import type { Reflection } from './fmtCoursePlay';
import { REFLECTION_MAX, loadReflections, saveReflectionSoon } from './lib/reflectionStore';
import type { Item, Logic } from './model';

const MINE = 'Only you can read this', SAVED = 'Saved · only you can read this';
export const PRIVATE_IN_VIEW_AS = 'Reflections are private: nothing is shown in View as';
export const PREVIEW_REFLECTION: Reflection = { shown: true, readOnly: true, value: () => '', set: () => {}, note: () => 'Preview: not saved' };
const VIEW_AS: Reflection = { shown: false, readOnly: true, value: () => '', set: () => {}, note: () => PRIVATE_IN_VIEW_AS };

export function reflectionOf(L: Logic, it: Item): Reflection {
  if (L.subject.readOnly) return VIEW_AS;
  const key = (id: string) => it.id + '|' + id, texts = L.state.reflections, saved = L.state.reflectionsSaved;
  const set = (id: string, text: string) => {
    const t = text.slice(0, REFLECTION_MAX);
    L.setState((s) => ({ reflections: { ...s.reflections, [key(id)]: t } }));
    saveReflectionSoon(it.id, id, t, (m) => L.latest().say('Reflection not saved · ' + m), 800, () => L.latest().setState((s) => ({ reflectionsSaved: { ...s.reflectionsSaved, [key(id)]: t } })));
  };
  return { shown: true, readOnly: false, value: (id) => texts[key(id)] ?? '', set, note: (id) => (texts[key(id)] ?? '') !== '' && saved[key(id)] === texts[key(id)] ? SAVED : MINE };
}

// This person's reflections in a course load once, when its panel opens (a text typed meanwhile is kept).
export async function ensureReflections(L: Logic, learningId: string): Promise<void> {
  if (L.latest().subject.readOnly || Object.keys(L.latest().state.reflectionsSaved).some((k) => k.startsWith(learningId + '|'))) return;
  try {
    const loaded = await loadReflections(learningId), withKey = Object.fromEntries(Object.entries(loaded).map(([b, t]) => [learningId + '|' + b, t]));
    L.latest().setState((s) => ({ reflections: { ...withKey, ...s.reflections }, reflectionsSaved: { ...withKey, ...s.reflectionsSaved } }));
  } catch (err) { L.latest().say('Reflections did not load · ' + (err as Error).message); }
}
