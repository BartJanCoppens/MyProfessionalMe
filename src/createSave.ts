// Create & share writes, split out of createVals.ts: the draft on screen and how it is saved, checked, submitted, reviewed
// or removed. Every write goes through contributionStore, refuses in View as (L.readOnly()) or while another runs, and
// reloads afterwards.
import { RUBRIC } from './data';
import type { Logic } from './model';
import type { AppState, NewDraft } from './types';
import { addFirst } from './createItems';
import { aiAssisted, carriesItems, hasItems, itemsFromSaved, itemsText, noItems } from './logic/items';
import type { DraftItems, Item } from './logic/items';
import { attrsOf, checksPass, contentChecks, mayCreate, rubricComplete } from './logic/contribution';
import type { Attrs, Contribution, CreateData, Review, RuleParts } from './logic/contribution';
import { checkContribution, decideReview, loadCreate, removeDraft, saveDraft, submitContribution } from './lib/contributionStore';
import type { DraftFields } from './lib/contributionStore';
import { latestDraft, sameDraft } from './studioDraft';
import { changeFormat, uploadFormat } from './studioRules';
import { HUB, studioOf } from './studioVals';

export const first = (name: string) => name.split(/\s+/)[0] || name;
export const revKey = (r: Review) => r.contribution_id + '|' + r.step + '|' + r.slot;
const names = (list: string[]) => (list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0] || '');
const without = <T,>(o: Record<string, T>, k: string) => { const n = { ...o }; delete n[k]; return n; };

// A fresh form that one of the person's rules allows: the first rule's first values, the person's own line when the
// rule leaves lines open, and the first upload-form format the rules allow (a studio sets its own when it opens).
export const newKey = () => Math.random().toString(36).slice(2);
export function blankDraft(rules: RuleParts[] | null, myLine: string | null): NewDraft {
  const r = rules && rules[0];
  const line = !r ? myLine || '' : r.lines.length ? (myLine && r.lines.includes(myLine) ? myLine : r.lines[0]) : myLine || 'Consulting';
  const base: NewDraft = { line, aud: r?.audiences[0] || '', type: '', title: '', dom: r?.domains[0] || 'prof', lvl: '2', stage: 'Senior consultant', take: '',
    outline: [], sources: [], ai: false, aiNote: '', items: noItems(), key: newKey() };
  return { ...base, ...changeFormat(base, uploadFormat(rules ?? [], base), rules ?? undefined) };
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
// The studio the draft on screen belongs to: the open studio, or the one the contribution being edited or continued was
// made in; null for the upload form.
const draftStudio = (s: AppState) => studioOf(s) ?? s.create?.contributions.find((c) => c.id === (s.editing ?? s.nw.savedId))?.studio ?? null;
// The draft as a row. Items go with the card formats and with every studio draft (its rows), the "Shape it" answers with
// a studio draft that has any; the upload form's other formats save neither.
const fieldsOf = (nw: NewDraft, bundles: string[], studio: string | null): DraftFields => {
  const shape = studio && nw.shape && Object.keys(nw.shape).length ? nw.shape : null;
  return { business_line: nw.line || null, audience: nw.aud || null, type: nw.type, title: nw.title.trim().slice(0, 120), domain: nw.dom, level: +nw.lvl, audience_stage: nw.stage,
    takeaway: nw.take.trim().slice(0, 400), outline: nw.outline.join('\n'), sources: nw.sources, ai_assisted: aiAssisted(nw), bundle_ids: bundles,
    items: carriesItems(nw.type, studio) ? nw.items?.list ?? [] : null, shape };
};
// The row to save: a new draft made in a studio says which (only on insert; the database keeps it).
const rowOf = (nw: NewDraft, bundles: string[], studio: string | null, id: string | null): DraftFields => (id || !studio ? fieldsOf(nw, bundles, studio) : { ...fieldsOf(nw, bundles, studio), studio });
// What a studio's automatic check was run on: the saved fields of the draft; a result counts while they are unchanged.
export const checkKey = (nw: NewDraft, bundles: string[], studio: string | null) => JSON.stringify(fieldsOf(nw, bundles, studio));
// A saved contribution back on screen, with its items (AI-assisted then means AI-made items) and its answers.
export function draftOf(c: Contribution): NewDraft {
  const list = itemsFromSaved(c.type, c.items), withItems = carriesItems(c.type, c.studio);
  return { line: c.business_line || '', aud: c.audience || '', type: c.type, title: c.title, dom: c.domain, lvl: String(c.level), stage: c.audience_stage, take: c.takeaway,
    outline: c.outline ? c.outline.split('\n') : [], sources: c.sources || [], ai: c.ai_assisted && !withItems, aiNote: c.ai_assisted ? 'AI-assisted draft' : c.outline ? 'Scripted outline from the passages' : '',
    items: withItems ? { ...noItems(), list, how: c.ai_assisted ? 'ai' : 'saved' } : noItems(), ...(c.shape && { shape: c.shape }) };
}

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
// its studio) and next runs on it; true when next completed, false when it was refused or failed (said in a toast). keep(id)
// is the state to keep when anything fails after the save started; patch changes the draft as it is saved.
type Saved = { s: AppState; nw: NewDraft; studio: string | null; id: string };
async function saveThen(L: Logic, next: (x: Saved) => Promise<void>, keep: (id: string | null) => (st: AppState) => Partial<AppState>, patch: Partial<NewDraft> = {}): Promise<boolean> {
  if (busy(L)) return false;
  const s = latestDraft(L), nw = { ...effective(s), ...patch }, rules = s.create?.rules || [], studio = draftStudio(s);
  if (!rules.length) { L.say('Ask an admin for creation rights first'); return false; }
  if (!mayCreate(rules, attrsOfDraft(nw))) { L.say('Not allowed by your creation rules'); return false; }
  let id = s.editing ?? nw.savedId ?? null;
  L.setState({ createBusy: true });
  try {
    id = await saveDraft(rowOf(nw, s.nwKb, studio, id), id);
    await next({ s, nw, studio, id });
    return true;
  } catch (err) { failed(L, err, (st) => (sameDraft(s, st) ? keep(id)(st) : {})); return false; }
}

// A file the draft names (a Presentation's .horizon file, a deck's voice-over): the draft is saved (the one save step, with
// `patch`), the file stored in its folder through `attach` once it has an id, and the items `attach` returns saved with
// it, with their provenance (`how`: saved unless the caller says where the items came from). True when it all landed.
export async function saveWithFile(L: Logic, attach: (id: string) => Promise<Item[]>, patch: Partial<NewDraft>, done: string, how: DraftItems['how'] = 'saved'): Promise<boolean> {
  return saveThen(L, async ({ s, nw, studio, id }) => {
    const items: DraftItems = { ...noItems(), list: await attach(id), how };
    await saveDraft(rowOf({ ...nw, items }, s.nwKb, studio, id), id);
    const d = await reloaded(L);
    // The creator may have moved on while a long job ran: the build is saved to its own draft, and the screen is left as it is.
    const here = sameDraft(s, L.latest().state);
    L.setState((st) => ({ create: d, createError: null, createBusy: false, ...(sameDraft(s, st) ? { nw: { ...st.nw, ...patch, items, savedId: id } } : {}) }));
    L.say(here ? done : 'The build finished after you left this draft · it was saved to “' + (nw.title || 'untitled') + '”');
  }, (id) => (st) => (id ? { nw: { ...st.nw, ...patch, savedId: id } } : {}), patch);
}

// Save the New form as a draft, or save and submit it. A draft that saved before a refused submit is edited next time, never duplicated.
export async function saveForm(L: Logic, submit: boolean) {
  if (busy(L)) return;
  const nw = effective(L.state);
  if (submit && hasItems(nw.type) && !nw.items?.list.length) { L.say(addFirst(nw.type, 'generate them with AI or import a CSV')); return; }
  if (submit && nw.type === 'Presentation' && !nw.items?.list.length) { L.say('Add the .horizon file first'); return; }
  if (submit && !checksPass(contentChecks({ title: nw.title, takeaway: nw.take, outline: nw.outline, sources: nw.sources, items: itemsText(nw.items?.list ?? []) }))) { L.say('Clear the open checks first'); return; }
  await saveThen(L, async ({ s, studio, id }) => {
    const ed = s.editing ? s.create?.contributions.find((c) => c.id === s.editing) : null;
    const status = submit ? await submitChecked(id, studio) : 'draft', d = await reloaded(L);
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
  await saveThen(L, async ({ s, nw, studio, id }) => {
    const r = await checkContribution(id), d = await reloaded(L), key = checkKey(nw, s.nwKb, studio);
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
