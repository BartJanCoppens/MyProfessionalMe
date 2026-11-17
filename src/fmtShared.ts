// Shared by the v4 format panels (fmtStudy.ts, fmtVals.ts): the catalogue content, the saved per-format detail, the
// session draft kept in AppState.fmt (per subject and learning, like the avatar quiz) and saving through Logic.persist().
import { LEARN_META } from './data';
import { saveProgress } from './lib/learnerStore';
import type { Item, Logic } from './model';
import type { DetailOf, FmtDraft, FormatContent, LearningDetail } from './types';

export const first = (name: string) => name.split(/[\s.@]+/)[0] || name;

// The content of a learning when it is of this kind; null otherwise (a panel then renders nothing extra).
export function contentOf<K extends FormatContent['kind']>(id: string, kind: K): Extract<FormatContent, { kind: K }> | null {
  const c = LEARN_META[id]?.content;
  return c && c.kind === kind ? (c as Extract<FormatContent, { kind: K }>) : null;
}
export const detailOf = <K extends keyof DetailOf>(L: Logic, id: string) => (L.subject.data.progress[id]?.detail ?? {}) as Partial<DetailOf[K]>;

const draftKey = (L: Logic, id: string) => L.subject.id + '|' + id;
const blank = (key: string): FmtDraft => ({ key, flip: false, queue: null, at: 0, again: 0, good: 0, due: null, qAt: 0, pick: null, checked: false, picks: {}, text: null, busy: false, res: null });
export const draftOf = (L: Logic, id: string) => (L.state.fmt && L.state.fmt.key === draftKey(L, id) ? L.state.fmt : blank(draftKey(L, id)));
export function patchDraft(L: Logic, id: string, p: Partial<FmtDraft>) {
  const key = draftKey(L, id);
  L.setState((s) => ({ fmt: { ...(s.fmt && s.fmt.key === key ? s.fmt : blank(key)), ...p } }));
}

// Saves the whole detail (save_learning replaces it). With `complete`, the learning also completes, as a mark does
// (state accepted, 100 %); refused in View as, like every learner write.
export function saveDetail(L: Logic, it: Item, detail: LearningDetail, opts: { complete?: boolean; done?: string } = {}) {
  const finish = !!opts.complete && it.state !== 'accepted';
  L.persist(() => saveProgress(L.subject.id, it.id, { ...(finish && { state: 'accepted' as const, pct: 100 }), detail }), finish ? opts.done : undefined);
}
export const handedIn = (it: Item) => it.state === 'submitted' || it.state === 'accepted';
export const completedToast = (it: Item, what: string) => what + ' · “' + it.title + '” counts toward your hours and levels';

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
