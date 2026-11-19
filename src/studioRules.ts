// Which of a studio's formats the person's creation rules reach, and what the draft must change to fit one.
// Moved out of studioVals.ts (v4 Task 13) and applied to every studio's `format` and `alsoFormats`.
import type { NewDraft, StudioState } from './types';
import type { StudioDef } from './logic/studios';
import { CREATE_TYPES, mayCreate } from './logic/contribution';
import { noItems } from './logic/items';
import type { RuleParts } from './logic/contribution';

// The draft's line, audience and domain for a format: unchanged when a rule already allows the combination, else those
// of the first rule that allows the format (the picker-less studio could never fix a mismatch itself).
export function fit(rules: RuleParts[], nw: NewDraft, format: string): Partial<NewDraft> {
  const attrs = (d: Partial<NewDraft>) => ({ line: (d.line ?? nw.line) || null, format, domain: d.dom ?? nw.dom, audience: (d.aud ?? nw.aud) || null });
  if (mayCreate(rules, attrs({}))) return {};
  for (const r of rules.filter((x) => !x.formats.length || x.formats.includes(format))) {
    const d: Partial<NewDraft> = { line: r.lines.length ? r.lines[0] : nw.line, aud: r.audiences[0] ?? '', dom: r.domains.length ? r.domains[0] : nw.dom };
    if (mayCreate(rules, attrs(d))) return d;
  }
  return {};
}
// The one format change, for the upload form's picker and the studios: another format starts with no items (they are another
// shape); with rules, the line, audience and domain follow to a combination that format is allowed with.
export const changeFormat = (cur: NewDraft, format: string, rules?: RuleParts[]): Partial<NewDraft> =>
  ({ ...(cur.type === format ? {} : { type: format, items: noItems() }), ...(rules ? fit(rules, cur, format) : {}) });
// A format is offered when some rule allows it with a combination the studio can reach.
export const reachable = (rules: RuleParts[], nw: NewDraft, f: string) => mayCreate(rules, { line: nw.line || null, format: f, domain: nw.dom, audience: nw.aud || null })
  || rules.some((r) => (!r.formats.length || r.formats.includes(f)) && mayCreate(rules, { line: r.lines[0] ?? nw.line, format: f, domain: r.domains[0] ?? nw.dom, audience: r.audiences[0] ?? null }));
// The upload form's format for a draft: its own when the form offers it, else the first the form offers that the rules
// reach (the form's first when none is; it then says the rules do not allow it). Studio-only formats are never kept.
export function uploadFormat(rules: RuleParts[], nw: NewDraft): string {
  const forms = CREATE_TYPES.map((t) => t[0]);
  return forms.includes(nw.type) ? nw.type : forms.find((f) => reachable(rules, nw, f)) ?? forms[0];
}
// What opening a studio on a new piece changes in the draft (a compact studio keeps its items), and the studio state it opens on.
export const freshPiece = (d: StudioDef): Partial<NewDraft> => (d.compact ? { shape: {} } : { shape: {}, produce: {}, cast: {}, build: undefined, items: noItems() });
export const studioView = (d: StudioDef): StudioState => ({ view: 'studio', step: 0, id: d.compact ? undefined : d.id, check: undefined, ask: undefined, from: undefined });
