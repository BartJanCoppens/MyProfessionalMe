// Create & share writes, split out of createVals.ts: the draft on screen and how it is saved, checked, submitted, reviewed
// or removed. Every write goes through contributionStore, refuses in View as (L.readOnly()) or while another runs, and
// reloads afterwards.
import { RUBRIC } from './data';
import type { Logic } from './model';
import type { AppState, NewDraft } from './types';
import { addFirst } from './createItems';
import { aiAssisted, hasItems, itemsFromSaved, itemsText, noItems } from './logic/items';
import { MAKEABLE_FORMATS, attrsOf, checksPass, contentChecks, mayCreate, rubricComplete } from './logic/contribution';
import type { Attrs, Contribution, CreateData, Review, RuleParts } from './logic/contribution';
import { checkContribution, decideReview, loadCreate, removeDraft, saveDraft, submitContribution } from './lib/contributionStore';
import type { DraftFields } from './lib/contributionStore';
import { HUB, studioOf } from './studioVals';

export const first = (name: string) => name.split(/\s+/)[0] || name;
export const revKey = (r: Review) => r.contribution_id + '|' + r.step + '|' + r.slot;
const names = (list: string[]) => (list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0] || '');
const without = <T,>(o: Record<string, T>, k: string) => { const n = { ...o }; delete n[k]; return n; };

// A fresh form that one of the person's rules allows: the first rule's first values, the person's own line when the
// rule leaves lines open.
export function blankDraft(rules: RuleParts[] | null, myLine: string | null): NewDraft {
  const r = rules && rules[0];
  const line = !r ? myLine || '' : r.lines.length ? (myLine && r.lines.includes(myLine) ? myLine : r.lines[0]) : myLine || 'Consulting';
  return { line, aud: r?.audiences[0] || '', type: r?.formats.find((f) => MAKEABLE_FORMATS.includes(f)) ?? MAKEABLE_FORMATS[0], title: '', dom: r?.domains[0] || 'prof', lvl: '2', stage: 'Senior consultant', take: '',
    outline: [], sources: [], ai: false, aiNote: '', items: noItems() };
}
export const attrsOfDraft = (nw: NewDraft): Attrs => ({ line: nw.line || null, format: nw.type, domain: nw.dom, audience: nw.aud || null });
// The form as it applies. Once submitted, line, format, domain and audience stay as they were (the database refuses a change).
export function effective(s: AppState): NewDraft {
  const ed = submittedEdit(s);
  return ed ? { ...s.nw, line: ed.business_line || '', aud: ed.audience || '', type: ed.type, dom: ed.domain } : s.nw;
}
// The person's own line, for the default and the bundles they may use (none while viewing someone else).
export const myLine = (L: Logic) => (L.subject.readOnly ? null : L.subject.businessLine);
export function submittedEdit(s: AppState) {
  const ed = s.editing ? s.create?.contributions.find((c) => c.id === s.editing) : null;
  return ed && ed.status !== 'draft' ? ed : null;
}
const fieldsOf = (nw: NewDraft, bundles: string[]): DraftFields => {
  return { business_line: nw.line || null, audience: nw.aud || null, type: nw.type, title: nw.title.trim().slice(0, 120), domain: nw.dom, level: +nw.lvl, audience_stage: nw.stage,
    takeaway: nw.take.trim().slice(0, 400), outline: nw.outline.join('\n'), sources: nw.sources, ai_assisted: aiAssisted(nw), bundle_ids: bundles,
    items: hasItems(nw.type) ? nw.items?.list ?? [] : null };
};
// The row to save: a new draft made in a studio says which (only on insert; the database keeps it).
const rowOf = (nw: NewDraft, bundles: string[], studio: string | null, id: string | null): DraftFields => (id || !studio ? fieldsOf(nw, bundles) : { ...fieldsOf(nw, bundles), studio });
// What a studio's automatic check was run on: the saved fields of the draft; a result counts while they are unchanged.
export const checkKey = (nw: NewDraft, bundles: string[]) => JSON.stringify(fieldsOf(nw, bundles));
export const draftOf = (c: Contribution): NewDraft => ({ line: c.business_line || '', aud: c.audience || '', type: c.type, title: c.title, dom: c.domain, lvl: String(c.level), stage: c.audience_stage, take: c.takeaway,
  outline: c.outline ? c.outline.split('\n') : [], sources: c.sources || [], ai: c.ai_assisted && !hasItems(c.type), aiNote: c.ai_assisted ? 'AI-assisted draft' : c.outline ? 'Scripted outline from the passages' : '',
  items: hasItems(c.type) ? { ...noItems(), list: itemsFromSaved(c.type, c.items), how: c.ai_assisted ? 'ai' : 'saved' } : noItems() });

// ---------- writes ----------

const busy = (L: Logic) => L.readOnly() || L.state.createBusy;
async function reloaded(L: Logic) { return loadCreate(L.access.userId); }
function failed(L: Logic, err: unknown, patch: (st: AppState) => Partial<AppState> = () => ({})) {
  L.setState((st) => ({ createBusy: false, ...patch(st) })); L.say((err as Error).message); L.reloadCreate();
}
function doneText(status: string, d: CreateData, id: string, again: boolean) {
  const c = d.contributions.find((x) => x.id === id);
  if (status === 'published') return 'Published · “' + (c?.title || '') + '” is in the library now';
  if (status === 'draft') return 'Saved as draft · only you can see it';
  const who = d.reviews.filter((r) => r.contribution_id === id && r.verdict === 'pending').map((r) => r.reviewer_name);
  return (again ? 'Resubmitted · ' + names(who) + ' review' + (who.length > 1 ? '' : 's') + ' the new version' : 'Submitted · ' + names(who) + ' review' + (who.length > 1 ? '' : 's') + ' it first');
}
async function afterPublish(L: Logic, status: string) { if (status === 'published') await L.reloadContent(); }
// A studio contribution passes the automatic check on what was saved, then is submitted (the database refuses it otherwise).
async function submitChecked(id: string, studio: string | null | undefined) {
  const r = studio ? await checkContribution(id) : null;
  if (r && !r.passed) throw new Error(r.reasons[0]);
  return submitContribution(id);
}

// The one save step of the upload form and the studios: refused in View as, while busy or outside the creation rules;
// otherwise the draft on screen is saved (an edited or already checked draft is the same row, a new studio draft says
// its studio) and next runs on it. keep(id) is the state to keep when anything fails after the save started.
type Saved = { s: AppState; nw: NewDraft; studio: string | null; id: string };
async function saveThen(L: Logic, next: (x: Saved) => Promise<void>, keep: (id: string | null) => (st: AppState) => Partial<AppState>) {
  if (busy(L)) return;
  const s = L.state, nw = effective(s), rules = s.create?.rules || [], studio = studioOf(s);
  if (!rules.length) { L.say('Ask an admin for creation rights first'); return; }
  if (!mayCreate(rules, attrsOfDraft(nw))) { L.say('Not allowed by your creation rules'); return; }
  let id = s.editing ?? nw.savedId ?? null;
  L.setState({ createBusy: true });
  try {
    id = await saveDraft(rowOf(nw, s.nwKb, studio, id), id);
    await next({ s, nw, studio, id });
  } catch (err) { failed(L, err, keep(id)); }
}

// Save the New form as a draft, or save and submit it. A draft that saved before a refused submit is edited next time, never duplicated.
export async function saveForm(L: Logic, submit: boolean) {
  if (busy(L)) return;
  const nw = effective(L.state);
  if (submit && hasItems(nw.type) && !nw.items?.list.length) { L.say(addFirst(nw.type, 'generate them with AI or import a CSV')); return; }
  if (submit && !checksPass(contentChecks({ title: nw.title, takeaway: nw.take, outline: nw.outline, sources: nw.sources, items: itemsText(nw.items?.list ?? []) }))) { L.say('Clear the open checks first'); return; }
  await saveThen(L, async ({ s, studio, id }) => {
    const ed = s.editing ? s.create?.contributions.find((c) => c.id === s.editing) : null;
    const status = submit ? await submitChecked(id, studio ?? ed?.studio) : 'draft', d = await reloaded(L);
    L.setState((st) => ({ create: d, createError: null, createBusy: false, createTab: 'mine', contribSel: id, editing: null, nw: blankDraft(d.rules, myLine(L)), nwKb: [], nwKbQ: '', revChecks: st.revChecks, studio: HUB }));
    L.say(doneText(status, d, id, ed?.status === 'changes'));
    await afterPublish(L, status);
  }, (id) => () => ({ editing: id }));
}

export async function submitSaved(L: Logic, c: Contribution) {
  if (busy(L)) return;
  const items = itemsFromSaved(c.type, c.items);
  if (hasItems(c.type) && !items.length) { L.say(addFirst(c.type, 'edit it first')); return; }
  const bad = contentChecks({ title: c.title, takeaway: c.takeaway, outline: c.outline.split('\n'), sources: c.sources, items: itemsText(items) }).find((x) => !x.ok);
  if (bad) { L.say(bad.text + ' · edit it first'); return; }
  if (!mayCreate(L.state.create?.rules || [], attrsOf(c))) { L.say('Not allowed by your creation rules · ask an admin'); return; }
  L.setState({ createBusy: true });
  try {
    const status = await submitChecked(c.id, c.studio), d = await reloaded(L);
    L.setState({ create: d, createError: null, createBusy: false, contribSel: c.id });
    L.say(doneText(status, d, c.id, c.status === 'changes'));
    await afterPublish(L, status);
  } catch (err) { failed(L, err); }
}

// Check & send in a studio: save the draft, then run the automatic check on it. The result counts while the draft on
// screen is what was checked (checkKey).
export async function runCheck(L: Logic) {
  if (!studioOf(L.state)) return;
  await saveThen(L, async ({ s, nw, id }) => {
    const r = await checkContribution(id), d = await reloaded(L), key = checkKey(nw, s.nwKb);
    L.setState((st) => ({ create: d, createError: null, createBusy: false, nw: { ...st.nw, savedId: id }, studio: { ...st.studio, check: { key, reasons: r.reasons } } }));
    L.say(r.passed ? 'Automatic check passed · send it for review' : 'Saved as draft · fix what the check found');
  }, (id) => (st) => (id ? { nw: { ...st.nw, savedId: id } } : {}));
}

export async function deleteDraft(L: Logic, c: Contribution) {
  if (busy(L)) return;
  L.setState({ createBusy: true });
  try {
    await removeDraft(c.id); const d = await reloaded(L);
    L.setState({ create: d, createBusy: false, contribSel: null });
    L.say('Draft deleted');
  } catch (err) { failed(L, err); }
}

export async function decide(L: Logic, c: Contribution, r: Review, verdict: 'approved' | 'changes') {
  const key = revKey(r), chk = RUBRIC.map((_, k) => !!(L.state.revChecks[key] || [])[k]), com = (L.state.revComment[key] || '').trim();
  if (verdict === 'approved' && !rubricComplete(chk)) { L.say('Tick all four criteria to approve, or request changes'); return; }
  if (verdict === 'changes' && !com) { L.say('Add a comment so ' + first(c.author_name) + ' knows what to change'); return; }
  if (busy(L)) return;
  L.setState({ createBusy: true });
  try {
    const status = await decideReview(c.id, verdict, chk, com), d = await reloaded(L);
    L.setState((st) => ({ create: d, createBusy: false, revChecks: without(st.revChecks, key), revComment: without(st.revComment, key) }));
    L.say(verdict === 'changes' ? 'Changes requested · ' + first(c.author_name) + ' sees your comment in Create & share'
      : status === 'published' ? 'Approved and published · “' + c.title + '” is in the library now' : 'Approved · ' + first(c.author_name) + ' sees it in Create & share');
    await afterPublish(L, status);
  } catch (err) { failed(L, err); }
}

export async function writePolicy(L: Logic, write: () => Promise<void>, done: string) {
  if (busy(L)) return;
  L.setState({ createBusy: true });
  try { await write(); const d = await reloaded(L); L.setState({ create: d, createBusy: false }); L.say(done); } catch (err) { failed(L, err); }
}
