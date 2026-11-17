// Which of a studio's formats the person's creation rules reach, and what the draft must change to fit one.
// Moved out of studioVals.ts (v4 Task 13) and applied to every studio's `format` and `alsoFormats`.
import type { NewDraft } from './types';
import { mayCreate } from './logic/contribution';
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
