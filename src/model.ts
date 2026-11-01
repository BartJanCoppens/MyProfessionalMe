// View-model for MyProfessionalMe. A close port of the prototype's DCLogic class: `renderVals()` derives
// everything the screens render from AppState, and the action methods patch state the same way the prototype did.
import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from 'react';
import {
  AUD_INFO, AUD_MAPS0, BUNDLES0, LEARN_META, AUDS, AV_SWATCHES, AVATARS, BLS, CLOUD_META, DOMAINS, FILL, HEAT, IMPORT_RESULTS, KEYWORDS, LEARN, LEARN_BY, LENSES, LEVELS, MAPS0,
  OB_LABEL, OB_TONE, OUTCOMES, PROGRAM_OF, PROGRAMS, PROJECTS, SIGNALS, STAGE_FR, STAGES, STATE_LABEL, STG_SHORT, TARGET, TESTS,
} from './data';
import type { Config } from './config';
import type { Access, AppState, ChatMsg, CloudKey, Learn, LearnForm, LearnMeta, Op, Persona, Proposal, Read, Screen, Signal } from './types';
import { levelLabel, levelsByDomain, stageIndex } from './logic/learner';
import type { LearnState } from './logic/learner';
import { acceptLearning, addAmbition, addInterest, removeAmbition, removeInterest, saveProgress, savePrefs } from './lib/learnerStore';
import { photoKey } from './lib/useSubject';
import { memberSummary } from './logic/team';
import type { Member } from './logic/team';
import type { Subject } from './lib/useSubject';
import { kbVals } from './kbVals';
import { mappingChanges, publishMappings, removeLearning, saveLearning } from './lib/contentStore';
import { cover, formatTiles, lengthLabel } from './logic/covers';

const opt = (v: string, l: string) => ({ value: v, label: l });
export const ADMIN_SCREENS: Screen[] = ['adminLib', 'adminMap', 'adminKb', 'users'];
const lensOf = (aud: string) => LENSES.find((l) => l[0] === AUD_INFO[aud].lens)!;

type Evidence = { id: string; text: string; src: string };
type ChatReply = { reply: string; interests?: { label: string; domain: string }[]; ambition?: Proposal['ambition'] };

// Saves in flight (learning form, publishing); a second click while one runs does nothing.
const BUSY = new Set<string>();
// Publication status in the admin library: chip status and label.
const PUB_STATUS: Record<LearnMeta['status'], [string, string]> = { published: ['accepted', 'Published'], review: ['clarification', 'Needs review'], draft: ['not-started', 'Draft'] };

export function initState(cfg: Config): AppState {
  return {
    screen: cfg.startScreen, view: cfg.homeView, sel: null, detailId: null, origin: 'library',
    libQ: '', libOb: 'all', libLevel: '0', libFormat: 'all', libDom: 'all',
    teamTab: 'roster', adminQ: '', adminStatus: 'all', drawerOpen: false, importQ: '',
    blState: null, maps: JSON.parse(JSON.stringify({ ...MAPS0, ...AUD_MAPS0 })), pending: {}, mapSel: null, overStage: null,
    mapLens: 'bl', mapAud: null, mapStage: null, sigDone: {}, reads: {}, readBusy: false, zoom: null, libForm: null,
    bundles: BUNDLES0.map((b) => ({ ...b, sources: b.sources.slice(), models: b.models.map((m) => ({ ...m })) })), kbSel: 'B1', kbOpen: false, kbTopic: 'all', kbSearch: '', kbTagF: null, kbSort: 'recent',
    kbTab: 'overview', kbFile: 'index.md', kbModel: null, kbTestModel: null, kbTagIn: '', kbValid: null, kbEdit: false, kbAdd: { conn: 'upload', name: '', sens: 'internal' }, kbQ: '', kbBusy: false, kbHits: null, kbAnswer: '', cpInput: '', cpBusy: false, cpReply: '', cpOpsP: null,
    toast: null, noteOpen: false, myRating: '4',
    projSel: 'P2', clouds: { proj: true, pers: true, amb: true }, share: {},
    chatInput: '', chatBusy: false, proposal: null, chatFor: null, avatarEdit: null,
    chat: [],
  };
}

export type Refs = {
  toastTimer: RefObject<number | undefined>;
  drag: RefObject<string | null>;
  file: RefObject<HTMLInputElement | null>;
  chat: RefObject<HTMLDivElement | null>;
};
type SetState = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;

declare global {
  interface Window { claude?: { complete?: (req: unknown) => Promise<string> } }
}

export class Logic {
  readonly state: AppState;
  readonly props: Config;
  readonly access: Access;
  readonly refs: Refs;
  readonly setState: SetState;
  readonly subject: Subject;
  readonly reloadSubject: () => Promise<void>;
  // Level reached per domain (DOMAINS order) from the subject's accepted learnings.
  readonly levels: number[];
  readonly reloadContent: (sent?: string[]) => Promise<void>;
  constructor(state: AppState, setState: SetState, props: Config, refs: Refs, access: Access, subject: Subject, reloadSubject: () => Promise<void>, reloadContent: (sent?: string[]) => Promise<void> = async () => {}) {
    this.state = state; this.setState = setState; this.props = props; this.refs = refs; this.access = access;
    this.subject = subject; this.reloadSubject = reloadSubject; this.reloadContent = reloadContent;
    this.levels = levelsByDomain(subject.data.progress, LEARN);
  }

  // Viewing someone else is read-only; returns true (and says so) when a write must not happen.
  readOnly() {
    if (!this.subject.readOnly) return false;
    this.say('Viewing ' + this.subject.name + ' · read-only');
    return true;
  }
  // Saves to Supabase, then reloads the subject; failures surface as a toast.
  async persist(write: () => Promise<unknown>, done?: string) {
    if (this.readOnly()) return;
    try { await write(); await this.reloadSubject(); if (done) this.say(done); } catch (err) { this.say((err as Error).message); }
  }
  myStage() { return stageIndex(this.subject.stage); }
  // A counsellor or an admin who manages the viewed person may accept their submitted learning.
  canAccept(state: string) {
    const s = this.subject;
    return s.readOnly && state === 'submitted'
      && (s.counsellor?.id === this.access.userId || this.access.isSystem || (!!s.businessLine && this.access.domains.includes(s.businessLine)));
  }
  accept(learningId: string, title: string) {
    acceptLearning(this.subject.id, learningId).then(this.reloadSubject)
      .then(() => this.say('Accepted · “' + title + '” now counts toward ' + this.subject.name.split(' ')[0] + '’s levels'))
      .catch((err) => this.say((err as Error).message));
  }
  // The chat and proposal shown are the viewed person's own; another person's conversation never carries over.
  myChat() { return this.state.chatFor === this.subject.id ? this.state.chat : []; }
  // The stage whose expectations apply: the next one, or Partner itself at the top.
  nextStage() { return STAGES[Math.min(this.myStage() + 1, STAGES.length - 1)]; }
  atTop() { return this.myStage() === STAGES.length - 1; }
  // How copy names the viewed person's counsellor.
  counsellorFull() { return this.subject.counsellor?.name || 'your counsellor'; }
  counsellorFirst() { return this.subject.counsellor ? this.subject.counsellor.name.split(' ')[0] : 'your counsellor'; }
  avatar() {
    const e = this.state.avatarEdit && this.state.avatarEdit.userId === this.subject.id ? this.state.avatarEdit : null;
    const fallback = this.subject.name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    return {
      initials: e?.initials ?? (this.subject.data.prefs.initials || fallback),
      bg: e?.bg ?? (this.subject.data.prefs.color || '#1a1d18'),
      photo: e && e.photo !== undefined ? e.photo : this.subject.photo,
    };
  }
  setAvatar(patch: { initials?: string; bg?: string; photo?: string | null }) {
    if (this.readOnly()) return;
    const id = this.subject.id;
    this.setState((st) => ({ avatarEdit: { ...(st.avatarEdit && st.avatarEdit.userId === id ? st.avatarEdit : {}), ...patch, userId: id } }));
    if (patch.photo !== undefined) {
      try { if (patch.photo) localStorage.setItem(photoKey(id), patch.photo); else localStorage.removeItem(photoKey(id)); } catch { this.say('Photo too large to keep after reload'); }
    }
    if (patch.initials !== undefined || patch.bg !== undefined) {
      savePrefs(id, { initials: patch.initials, color: patch.bg }).catch((err) => this.say((err as Error).message));
    }
  }
  onAvatarFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      const s = 160, c = document.createElement('canvas'); c.width = c.height = s; const k = Math.max(s / img.width, s / img.height), w = img.width * k, h = img.height * k;
      c.getContext('2d')!.drawImage(img, (s - w) / 2, (s - h) / 2, w, h); URL.revokeObjectURL(url); this.setAvatar({ photo: c.toDataURL('image/jpeg', 0.85) });
      this.say('Avatar updated · it now sits in the middle of your growth map');
    };
    img.src = url;
  }
  bl() { return this.state.blState || this.subject.businessLine || this.props.businessLine || 'Consulting'; }
  say(msg: string) {
    clearTimeout(this.refs.toastTimer.current); this.setState({ toast: msg });
    this.refs.toastTimer.current = window.setTimeout(() => this.setState({ toast: null }), 2800);
  }
  mapping(id: string) { const m = this.state.maps[this.bl()].find((x) => x[0] === id); return m ? { stage: m[1], ob: m[2], si: STAGES.indexOf(m[1]) } : null; }
  obFor(id: string) {
    const m = this.mapping(id);
    if (m && m.si <= this.myStage() + 1) return m.ob;
    return this.subject.data.progress[id]?.chosen ? 'chosen' : 'open';
  }
  item(row: Learn) {
    const [id, title, dom, lvl, format, source, hours, cpd, due, why] = row;
    const own = this.subject.data.progress[id];
    const state: LearnState = own?.state || 'not-started'; const pct = state === 'accepted' || state === 'submitted' ? 100 : own?.pct || 0;
    const ob = this.obFor(id); const m = this.mapping(id); const di = DOMAINS.findIndex((d) => d[0] === dom);
    const hasDue = ob === 'mandatory' && !!due; const dueSoon = due === '30 Nov 2026';
    const hoursLabel = lengthLabel(row);
    return {
      id, title, dom, di, domLabel: DOMAINS[di][1], lvl, lvlLabel: LEVELS[lvl - 1] + ' · L' + lvl, format, source, hours, hoursLabel,
      isAvatar: format === 'Avatar', avInit: AVATARS[id] ? AVATARS[id].initials : '', avWith: AVATARS[id] ? 'Practise with ' + AVATARS[id].persona + ' · ' + AVATARS[id].role : '', cpd, state, pct,
      stateLabel: state === 'in-progress' ? 'In progress · ' + pct + '%' : state === 'submitted' ? 'Awaiting ' + (this.subject.counsellor ? this.counsellorFirst() : 'counsellor') : STATE_LABEL[state], stateIcon: state === 'accepted' ? 'check' : 'dot',
      ob, obTone: OB_TONE[ob], obLabel: OB_LABEL[ob], isMandatory: ob === 'mandatory', due, hasDue,
      dueLabel: hasDue ? 'Due ' + due : (m && m.si <= this.myStage() + 1 ? 'By ' + m.stage + ' stage' : ''), dueColor: hasDue ? (dueSoon ? '#9a3d0c' : '#7a5000') : '#8b918a',
      meta: source + ' · ' + hoursLabel + ' · ' + LEVELS[lvl - 1] + ' · L' + lvl + (cpd ? ' · ' + cpd + ' CPD' : ''),
      why: why || (m ? (ob === 'mandatory' ? 'Mandatory' : ob === 'advised' ? 'Advised' : 'Mapped') + ' for the ' + m.stage + ' stage in ' + this.bl() + '. ' : '')
        + (ob === 'open' ? 'Not on any ' + this.bl() + ' path at your stage. Add it if it serves where you want to go; it still counts toward your hours and levels.' : 'Your counsellor can tell you how it fits your next engagement.'),
      stage: m ? m.stage : null, mapped: m,
      open: () => this.openDetail(id, (['map', 'projects', 'profile'] as Screen[]).includes(this.state.screen) ? this.state.screen : 'library'),
    };
  }
  items() { return LEARN.map((r, i) => { const it = this.item(r); return { ...it, ...cover(r, i, it.state, it.pct) }; }); }
  openDetail(id: string, origin?: Screen) { this.setState({ screen: 'detail', detailId: id, origin: origin || 'library', noteOpen: false }); window.scrollTo(0, 0); }
  go(screen: Screen) { this.setState({ screen: (ADMIN_SCREENS.includes(screen) && !this.isAdmin()) || (screen === 'users' && !this.canManageUsers()) ? 'map' : screen, sel: null, mapSel: null }); window.scrollTo(0, 0); }
  // User management: System Admins and Domain Admins. A General Admin edits content only.
  canManageUsers() { return this.access.isSystem || this.access.domains.length > 0; }
  isAdmin() { return this.access.isSystem || !!this.access.isGeneral || this.access.domains.length > 0; }
  // Content of a business line: its Domain Admins, General and System Admins. Firm-wide content (no line) only the latter two.
  canEditLine(line: string | null | undefined) { return this.access.isSystem || !!this.access.isGeneral || (!!line && this.access.domains.includes(line)); }
  // Lines this person may give a learning or bundle; '' is firm-wide.
  editableLines() { return (this.access.isSystem || this.access.isGeneral ? [''] : []).concat(BLS.filter((b) => this.canEditLine(b))); }
  lineName(line: string | null | undefined) { return line || 'Firm-wide'; }
  whoEdits(line: string | null | undefined) { return line ? line + ' Domain Admins or a General Admin edit it' : 'a General or System Admin edits it'; }
  blankForm(): LearnForm { return { id: null, title: '', domain: 'prof', level: '2', format: 'E-learning', source: '', hours: '', cpd: '', why: '', line: this.editableLines()[0] ?? '', status: 'draft' }; }
  formFor(r: Learn): LearnForm {
    const m = LEARN_META[r[0]] || { line: null, status: 'published' };
    return { id: r[0], title: r[1], domain: r[2], level: String(r[3]), format: r[4], source: r[5], hours: String(r[6]), cpd: r[7] ? String(r[7]) : '', why: r[9], line: m.line || '', status: m.status };
  }
  // Audiences this learning is mapped to that this admin cannot edit: removing it or making it a draft would change their paths.
  foreignAudiences(id: string) { return Object.keys(this.state.maps).filter((a) => this.state.maps[a].some((m) => m[0] === id) && !this.canEditAud(a)).map((a) => AUD_INFO[a]?.name || a); }
  async saveLearningForm(status: LearnMeta['status']) {
    const f = this.state.libForm; if (!f || BUSY.has('learning')) return;
    const hours = Number(f.hours.replace(',', '.')), cpd = Number((f.cpd || '0').replace(',', '.'));
    if (!f.title.trim()) { this.say('Give the learning a title'); return; }
    if (!(hours > 0)) { this.say('Effort must be a number of hours above zero'); return; }
    if (!(cpd >= 0)) { this.say('CPD units must be a number'); return; }
    const foreign = f.id && status === 'draft' ? this.foreignAudiences(f.id) : [];
    if (foreign.length) { this.say('Still mapped for ' + foreign.join(', ') + ' · ask their admins to unmap it before it becomes a draft'); return; }
    const old = f.id ? LEARN_BY[f.id] : null;
    BUSY.add('learning');
    try {
      await saveLearning({ title: f.title.trim(), domain: f.domain, level: +f.level, format: f.format, source: f.source.trim(), hours, cpd, due: old ? old[8] : '', why: f.why.trim(), business_line: f.line || null, status }, f.id || undefined);
      await this.reloadContent();
      this.setState({ drawerOpen: false, libForm: null });
      this.say((status === 'draft' ? 'Saved as draft · visible to admins only' : status === 'review' ? 'Saved · marked as needing review' : 'Published · learners see it in the library') + ' · ' + this.lineName(f.line || null));
    } catch (err) { this.say((err as Error).message); }
    finally { BUSY.delete('learning'); }
  }
  async removeLearningForm() {
    const f = this.state.libForm; if (!f?.id || BUSY.has('learning')) return;
    const foreign = this.foreignAudiences(f.id);
    if (foreign.length) { this.say('Still mapped for ' + foreign.join(', ') + ' · ask their admins to unmap it before you remove it'); return; }
    BUSY.add('learning');
    try { await removeLearning(f.id); await this.reloadContent(); this.setState({ drawerOpen: false, libForm: null }); this.say('Removed “' + f.title + '” and its curriculum mappings'); }
    catch (err) { this.say((err as Error).message); }
    finally { BUSY.delete('learning'); }
  }
  async publish() {
    const sent = Object.keys(this.state.pending), ch = mappingChanges(this.state.maps, this.state.pending), n = ch.upserts.length + ch.deletes.length;
    if (!n || BUSY.has('publish')) return;
    BUSY.add('publish');
    try { await publishMappings(ch); await this.reloadContent(sent); this.say('Published · ' + n + ' change' + (n > 1 ? 's' : '') + ' now live on every map they reach'); }
    catch (err) { this.say((err as Error).message); }
    finally { BUSY.delete('publish'); }
  }
  // System Admins edit every audience; Domain Admins only the business-line audiences they administer.
  canEditAud(aud: string) { return AUD_INFO[aud]?.lens === 'bl' ? this.canEditLine(aud) : this.access.isSystem || !!this.access.isGeneral; }
  progressHours(it: Item) { return it.state === 'accepted' || it.state === 'submitted' ? it.hours : it.state === 'in-progress' ? it.hours * it.pct / 100 : 0; }
  readiness(items: Item[]) {
    const rel = items.filter((it) => it.mapped && it.mapped.si <= this.myStage() + 1 && (it.ob === 'mandatory' || it.ob === 'advised'));
    const tot = rel.reduce((a, it) => a + it.hours, 0), done = rel.reduce((a, it) => a + this.progressHours(it), 0);
    return tot ? Math.round(100 * done / tot) : 0;
  }
  polar(cx: number, cy: number, rx: number, ry: number, i: number, n: number) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return { a, x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }; }
  anchorFor(a: number) { const c = Math.cos(a); return c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'; }
  pct(v: number, total: number) { return (v / total * 100).toFixed(2) + '%'; }
  tfFor(anchor: string) { return anchor === 'start' ? 'translate(0,-50%)' : anchor === 'end' ? 'translate(-100%,-50%)' : 'translate(-50%,-50%)'; }
  taFor(anchor: string): 'left' | 'right' | 'center' { return anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center'; }

  clouds(items: Item[], byId: Record<string, Item>) {
    const s = this.state;
    const mk = (key: CloudKey, evidence: Evidence[]) => {
      const w: Record<string, number> = {}, ids: string[] = [];
      evidence.forEach((e) => { const it = byId[e.id]; if (!it) return; w[it.dom] = (w[it.dom] || 0) + 1; if (!ids.includes(e.id)) ids.push(e.id); });
      return { key, w, ids, evidence: evidence.filter((e) => byId[e.id]), on: !!s.clouds[key], ...CLOUD_META[key] };
    };
    const proj: Evidence[] = []; PROJECTS.forEach((p) => p.advice.forEach((a) => proj.push({ id: a[0], text: a[1], src: p.client + ' · ' + p.lead })));
    const pers: Evidence[] = []; TESTS.forEach((t) => t.sugg.forEach((x) => pers.push({ id: x[0], text: x[1], src: t.name })));
    const amb: Evidence[] = [], seen = new Set<string>();
    const pick = (doms: string[]) => doms.map((d) => items.filter((x) => x.dom === d && x.state !== 'accepted' && x.ob !== 'mandatory' && !seen.has(x.id)).sort((a, b) => b.lvl - a.lvl)[0]).filter(Boolean).map((x) => x.id);
    this.subject.data.ambitions.forEach((a) => (a.ids || pick(a.doms)).forEach((id) => { if (seen.has(id) || !byId[id]) return; seen.add(id); amb.push({ id, src: 'Ambition · ' + a.text, text: 'Builds ' + byId[id].domLabel.toLowerCase() + ', which this ambition depends on.' }); }));
    this.subject.data.interests.forEach((i) => (i.ids || pick([i.dom])).forEach((id) => { if (seen.has(id) || !byId[id]) return; seen.add(id); amb.push({ id, src: 'Interest · ' + i.label, text: 'Matches an interest you named.' }); }));
    return [mk('proj', proj), mk('pers', pers), mk('amb', amb)];
  }
  // One domain up close (design v3): rings are levels L1–L5, green is the person's level now, dashed the next stage's target.
  zoomVals(items: Item[], clouds: Cloud[]) {
    const s = this.state, i = Math.max(0, DOMAINS.findIndex((d) => d[0] === s.zoom)), d = DOMAINS[i], sel = s.sel, cur = this.levels[i], tgt = TARGET[i];
    const list = items.filter((it) => it.dom === d[0]), R = (k: number) => 52 + k * 43, RX = (k: number) => R(k) * 1.55;
    const hub = this.polar(540, 330, 272, 186, i, 9);
    const rings = [5, 4, 3, 2, 1].map((k) => ({ k, rx: RX(k), ry: R(k), stroke: k === tgt ? '#1a1d18' : k === cur ? '#86BC25' : '#e1e5dc', sw: k === tgt || k === cur ? 1.5 : 1, dash: k === tgt && k !== cur ? '4 3' : 'none',
      lyP: this.pct(330 - R(k), 660), label: 'L' + k + (k === cur ? ' · now' : k === tgt ? ' · target' : ''), lw: k === cur || k === tgt ? 600 : 500, lc: k === cur ? '#3f6a0a' : k === tgt ? '#1a1d18' : '#8b918a' }));
    const nodes: { id: string; x: number; y: number; lxP: string; lyP: string; tf: string; ta: 'left' | 'right' | 'center'; title: string; full: string; sub: string; ringOp: number; fill: string; stroke: string; sw: number; dash: string; op: number; delay: string; isAvatar: boolean; orbX: number; orbO: string; onClick: () => void }[] = [];
    [1, 2, 3, 4, 5].forEach((k) => {
      const lv = list.filter((it) => it.lvl === k), m = lv.length;
      lv.forEach((it, j) => {
        const a = (-66 + 312 * (j + 0.5 + (k % 2 ? 0.22 : -0.22) * (m > 1 ? 1 : 0)) / m) * Math.PI / 180, x = 540 + RX(k) * Math.cos(a), y = 330 + R(k) * Math.sin(a), off = m > 3 && j % 2 ? 40 : 17;
        const lx = 540 + (RX(k) + off) * Math.cos(a), ly = 330 + (R(k) + off) * Math.sin(a), anchor = this.anchorFor(a), isSel = !!sel && sel.type === 'node' && sel.id === it.id;
        nodes.push({ id: it.id, x, y, lxP: this.pct(lx, 1080), lyP: this.pct(ly, 660), tf: this.tfFor(anchor), ta: this.taFor(anchor), title: it.title, full: it.title + ' · ' + it.meta, sub: it.format + ' · ' + it.hoursLabel + ' · ' + it.obLabel,
          ringOp: isSel ? 1 : 0, fill: FILL[it.state], stroke: it.ob === 'chosen' ? '#4c7a10' : it.ob === 'open' ? '#b3b8ae' : '#1a1d18', sw: it.ob === 'mandatory' ? 2.2 : it.ob === 'open' ? 1 : 1.5, dash: it.ob === 'advised' ? '3 2' : 'none',
          op: !sel || sel.type !== 'node' || isSel ? 1 : 0.35, delay: (120 + nodes.length * 45) + 'ms', isAvatar: it.isAvatar, orbX: x + 15, orbO: x + 'px ' + y + 'px', onClick: () => this.setState({ sel: isSel ? null : { type: 'node', id: it.id, dom: d[0] } }) });
      });
    });
    const done = list.reduce((a, it) => a + this.progressHours(it), 0), tot = list.reduce((a, it) => a + it.hours, 0);
    const pulls = clouds.filter((c) => c.on && c.w[d[0]]);
    const rank = (it: Item) => (it.ob === 'mandatory' ? 0 : it.ob === 'advised' ? 1 : pulls.some((c) => c.ids.includes(it.id)) ? 2 : it.ob === 'chosen' ? 3 : 4);
    const nx = list.filter((it) => it.state !== 'accepted' && it.state !== 'submitted').sort((a, b) => Number(b.state === 'in-progress') - Number(a.state === 'in-progress') || rank(a) - rank(b) || a.lvl - b.lvl)[0];
    const fmtH = (h: number) => (h % 1 ? h.toFixed(1) : h) + ' h', stage = this.nextStage();
    return {
      name: d[1], cur: 'L' + cur, origin: this.pct(hub.x, 1080) + ' ' + this.pct(hub.y, 660), band: cur ? { rx: RX(cur), ry: R(cur) } : null,
      clouds: pulls.map((c, k) => ({ key: c.key, x: 540 + (k - (pulls.length - 1) / 2) * 120, y: 330, rx: RX(5) * (0.55 + 0.1 * Math.min(3, c.w[d[0]])), ry: R(5) * (0.55 + 0.1 * Math.min(3, c.w[d[0]])), color: c.color, delay: (-2.7 * k) + 's' })),
      rings, nodes, levelText: (cur ? 'L' + cur + ' ' + LEVELS[cur - 1] : 'Not started') + ' → L' + tgt,
      levelSub: tgt > cur ? (tgt - cur) + ' level' + (tgt - cur > 1 ? 's' : '') + ' to go for ' + stage : 'At target for ' + stage,
      hoursText: fmtH(Math.round(done * 10) / 10) + ' of ' + fmtH(Math.round(tot * 10) / 10) + ' · ' + list.length + ' learnings', hoursW: (tot ? done / tot * 100 : 0).toFixed(1) + '%',
      pulls: pulls.length ? pulls.map((c) => ({ label: c.label, color: c.color, text: c.text })) : [{ label: 'Firm path only', color: '#d5dacf', text: '#5a6058' }],
      nextTitle: nx ? nx.title : 'Everything here is done', nextSub: nx ? nx.obLabel + ' · L' + nx.lvl + ' · ' + nx.hoursLabel + (nx.hasDue ? ' · due ' + nx.due : '') + ' →' : 'Pick a stretch item in the library',
      nextOpen: nx ? nx.open : () => this.go('library'),
      prev: () => this.setState({ zoom: DOMAINS[(i + 8) % 9][0], sel: null }), next: () => this.setState({ zoom: DOMAINS[(i + 1) % 9][0], sel: null }),
    };
  }
  constellation(items: Item[], clouds: Cloud[]) {
    const cx = 540, cy = 330, rx = 272, ry = 186, sel = this.state.sel;
    const cs = sel && sel.type === 'cloud' ? clouds.find((x) => x.key === sel.id) : null;
    const edges: { x1: number; y1: number; x2: number; y2: number; stroke: string; w: number; op: number }[] = [];
    const hubs: { delay: string; id: string; x: number; y: number; xP: string; yP: string; lxP: string; lyP: string; tf: string; ta: 'left' | 'right' | 'center'; label: string; cur: string; lvl: string; stroke: string; sw: number; op: number; onClick: () => void; zoom: () => void; zoomTitle: string }[] = [];
    const nodes: { delay: string; isAvatar: boolean; orbX: number; orbO: string; orbD: string; id: string; x: number; y: number; r: number; ring: number; ringOp: number; fill: string; stroke: string; sw: number; dash: string; op: number; title: string; onClick: () => void }[] = [];
    DOMAINS.forEach((d, i) => {
      const p = this.polar(cx, cy, rx, ry, i, 9);
      const list = items.filter((it) => it.dom === d[0]);
      const hubRel = !sel || (sel.type === 'hub' && sel.id === d[0]) || (sel.type === 'node' && sel.dom === d[0]) || !!(cs && cs.w[d[0]]);
      const hubSel = !!sel && sel.type === 'hub' && sel.id === d[0];
      edges.push({ x1: cx, y1: cy, x2: p.x, y2: p.y, stroke: sel && hubRel ? '#4c7a10' : '#b3b8ae', w: sel && hubRel ? 2 : 1.3, op: hubRel ? 1 : 0.15 });
      const n = list.length;
      list.forEach((it, j) => {
        const ang = p.a + (j - (n - 1) / 2) * 0.46; const rad = n > 3 ? 56 + (j % 2) * 24 : 62;
        const x = p.x + rad * Math.cos(ang), y = p.y + rad * Math.sin(ang);
        const isSel = !!sel && sel.type === 'node' && sel.id === it.id;
        const rel = !sel || hubSel || isSel || !!(cs && cs.ids.includes(it.id));
        edges.push({ x1: p.x, y1: p.y, x2: x, y2: y, stroke: isSel ? '#4c7a10' : '#c8cdc3', w: isSel ? 2 : 1, op: rel ? 1 : 0.15 });
        const r = 4.5 + it.lvl * 1.4;
        nodes.push({
          delay: (i * 70 + 180 + j * 30) + 'ms', isAvatar: it.isAvatar, orbX: x + r + 4.5, orbO: x + 'px ' + y + 'px', orbD: (-(i + j) * 0.7) + 's', id: it.id, x, y, r, ring: r + 3, ringOp: isSel ? 1 : 0, fill: FILL[it.state],
          stroke: it.ob === 'mandatory' ? '#1a1d18' : it.ob === 'advised' ? '#1a1d18' : it.ob === 'chosen' ? '#4c7a10' : '#b3b8ae',
          sw: it.ob === 'mandatory' ? 2 : it.ob === 'advised' ? 1.3 : 1, dash: it.ob === 'advised' ? '3 2' : 'none',
          op: rel ? 1 : 0.3, title: it.title + ' · ' + it.meta, onClick: () => this.setState({ sel: { type: 'node', id: it.id, dom: d[0] } }),
        });
      });
      const lx = p.x + 96 * Math.cos(p.a), ly = p.y + 96 * Math.sin(p.a); const anchor = this.anchorFor(p.a);
      hubs.push({
        delay: (i * 70) + 'ms', id: d[0], x: p.x, y: p.y, xP: this.pct(p.x, 1080), yP: this.pct(p.y, 660), lxP: this.pct(lx, 1080), lyP: this.pct(ly, 660), tf: this.tfFor(anchor), ta: this.taFor(anchor),
        label: d[1], cur: 'L' + this.levels[i], lvl: levelLabel(this.levels[i]) + ' → L' + TARGET[i] + ' at ' + this.nextStage(),
        stroke: hubSel ? '#1a1d18' : '#c8cdc3', sw: hubSel ? 2 : 1.3, op: hubRel ? 1 : 0.3, onClick: () => this.setState({ sel: { type: 'hub', id: d[0] } }),
        zoom: () => this.setState({ zoom: d[0], sel: null }), zoomTitle: 'Zoom into ' + d[1],
      });
    });
    const cl = clouds.filter((x) => x.on).map((x) => {
      const blobs = Object.keys(x.w).map((dk) => { const p = this.polar(cx, cy, rx, ry, DOMAINS.findIndex((d) => d[0] === dk), 9); return { x: p.x + 30 * Math.cos(p.a), y: p.y + 30 * Math.sin(p.a), r: 46 + 14 * Math.min(x.w[dk], 3), color: x.color }; });
      const a = this.polar(cx, cy, rx * x.frac, ry * x.frac, x.anchor, 9); const isSel = !!cs && cs.key === x.key;
      return {
        delay: (-2.7 * clouds.indexOf(x)) + 's', key: x.key, color: x.color, text: x.text, label: x.label, blobs, op: isSel ? 0.24 : sel ? 0.06 : 0.13,
        lxP: this.pct(a.x, 1080), lyP: this.pct(a.y, 660), ring: isSel ? '0 0 0 3px rgba(134,188,37,.45)' : 'none',
        select: () => this.setState({ sel: isSel ? null : { type: 'cloud', id: x.key } }),
      };
    });
    return { edges, hubs, nodes, clouds: cl };
  }
  radar(clouds: Cloud[]) {
    const cx = 540, cy = 280, R = 200;
    const pt = (i: number, v: number) => { const p = this.polar(0, 0, 1, 1, i, 9); return [cx + R * v / 5 * Math.cos(p.a), cy + R * v / 5 * Math.sin(p.a)]; };
    const rings = [1, 2, 3, 4, 5].map((k) => ({ points: DOMAINS.map((_d, i) => pt(i, k).join(',')).join(' '), lxP: this.pct(cx - 6, 1080), lyP: this.pct(cy - R * k / 5 - 2, 560), label: 'L' + k }));
    const axes = DOMAINS.map((d, i) => {
      const p = this.polar(cx, cy, R, R, i, 9); const l = this.polar(cx, cy, R + 26, R + 26, i, 9); const anchor = this.anchorFor(p.a);
      return { x: p.x, y: p.y, lxP: this.pct(l.x, 1080), lyP: this.pct(l.y + 6, 560), tf: this.tfFor(anchor), ta: this.taFor(anchor), label: d[1], sub: 'L' + this.levels[i] + ' of L' + TARGET[i] };
    });
    const cur = DOMAINS.map((_d, i) => pt(i, this.levels[i])), tgt = DOMAINS.map((_d, i) => pt(i, TARGET[i]));
    const gaps = DOMAINS.map((_d, i) => TARGET[i] - this.levels[i]); const big = gaps.map((g, i) => [g, i]).filter((x) => x[0] >= 2).map((x) => DOMAINS[x[1]][1]);
    const sel = this.state.sel;
    const rc = clouds.filter((x) => x.on).map((x, k) => ({
      key: x.key, delay: (0.25 + k * 0.12) + 's, ' + (1.2 + k * 1.5) + 's', color: x.color, wash: x.wash, fo: sel && sel.type === 'cloud' && sel.id === x.key ? 0.22 : 0.08, legend: x.long,
      points: DOMAINS.map((d, i) => pt(i, Math.min(5, this.levels[i] + (x.w[d[0]] ? Math.min(2, x.w[d[0]]) : 0))).join(',')).join(' '),
      select: () => this.setState({ sel: { type: 'cloud', id: x.key } }),
    }));
    return {
      clouds: rc, rings, axes, cur: cur.map((p) => p.join(',')).join(' '), target: tgt.map((p) => p.join(',')).join(' '), dots: cur.map((p, k) => ({ x: p[0], y: p[1], delay: (450 + k * 45) + 'ms' })),
      gapText: 'Largest gaps: ' + (big.length ? big.join(', ') : 'none') + ' · ' + gaps.filter((g) => g <= 0).length + ' of 9 domains already at the ' + this.nextStage() + ' level',
    };
  }
  road(items: Item[], clouds: Cloud[]) {
    const DUE_Q: Record<string, number> = { '30 Nov 2026': 0, 'Jan 2027': 1, 'Mar 2027': 1, 'Jun 2027': 2 };
    type RoadItem = { id: string; av: boolean; avInit: string; title: string; sub: string; ringCss: string; onClick: () => void; delay?: string };
    const cols = ['Q4 2026', 'Q1 2027', 'Q2 2027', 'Q3 2027'].map((label) => ({ label, items: [] as RoadItem[], count: '' }));
    const upcoming = items.filter((it) => it.state !== 'accepted' && it.state !== 'submitted' && it.state !== 'in-progress' && (it.ob === 'mandatory' || it.ob === 'advised'))
      .sort((a, b) => (a.ob === 'mandatory' ? 0 : 1) - (b.ob === 'mandatory' ? 0 : 1));
    let free = 0;
    upcoming.forEach((it) => {
      const q = it.hasDue ? DUE_Q[it.due] : (free++ % 4);
      cols[q].items.push({ id: it.id, av: it.isAvatar, avInit: it.avInit, title: it.title, sub: (it.hasDue ? 'Due ' + it.due : 'Advised · ' + it.stage) + ' · ' + it.hoursLabel, ringCss: it.ob === 'mandatory' ? '2px solid #1a1d18' : '1.5px dashed #1a1d18', onClick: it.open });
    });
    cols.forEach((c) => { c.count = c.items.length ? c.items.length + (c.items.length === 1 ? ' item' : ' items') : 'nothing due'; });
    const firmIds = upcoming.map((it) => it.id), byId: Record<string, Item> = {}; items.forEach((it) => { byId[it.id] = it; });
    const quarters = cols.map((c) => c.label);
    const lanes: { key: string; label: string; sub: string; color: string; cells: { items: RoadItem[] }[]; select: () => void; delay?: string }[] = [
      { key: 'firm', label: 'Firm path to ' + this.nextStage(), sub: upcoming.length + ' learnings · mandatory and advised', color: '#1a1d18', cells: cols.map((c) => ({ items: c.items })), select: () => this.setState({ sel: null }) },
    ];
    clouds.filter((x) => x.on).forEach((x) => {
      const cells = quarters.map(() => ({ items: [] as RoadItem[] }));
      const list = x.ids.map((id) => byId[id]).filter((it) => it && it.state !== 'accepted' && it.state !== 'submitted')
        .sort((a, b) => Number(b.state === 'in-progress') - Number(a.state === 'in-progress') || a.lvl - b.lvl);
      list.forEach((it, k) => {
        const q = it.state === 'in-progress' ? 0 : it.hasDue ? DUE_Q[it.due] : Math.min(3, Math.floor(k * 4 / list.length));
        cells[q].items.push({ id: it.id, av: it.isAvatar, avInit: it.avInit, title: it.title, sub: (it.state === 'in-progress' ? it.stateLabel : it.obLabel) + ' · ' + it.hoursLabel + (firmIds.includes(it.id) ? ' · also on firm path' : ''), ringCss: '1.5px dashed ' + x.color, onClick: it.open });
      });
      lanes.push({ key: x.key, label: x.laneLabel, sub: list.length + ' learnings · ' + Math.round(list.reduce((a, it) => a + it.hours, 0)) + ' h · ' + x.laneSub, color: x.color, cells, select: () => this.setState({ sel: { type: 'cloud', id: x.key } }) });
    });
    const inflight = items.filter((it) => it.state === 'in-progress' || it.state === 'submitted');
    const done = items.filter((it) => it.state === 'accepted');
    lanes.forEach((ln, li) => { ln.delay = (li * 110) + 'ms'; ln.cells.forEach((c, q) => c.items.forEach((it, k) => { it.delay = (li * 110 + q * 60 + k * 35 + 60) + 'ms'; })); });
    return {
      lanes, quarters, cols, inflight: inflight.map((it) => ({ id: it.id, label: it.title + ' · ' + it.stateLabel, dot: FILL[it.state], open: it.open })),
      behind: done.length + ' completed · ' + Math.round(done.reduce((a, it) => a + it.hours, 0)) + ' h since Jan 2026', inflightCount: inflight.length,
    };
  }

  renderVals() {
    const s = this.state, bl = this.bl(), items = this.items(), av = this.avatar();
    const byId: Record<string, Item> = {}; items.forEach((it) => { byId[it.id] = it; });
    const readiness = this.readiness(items);
    const hoursYear = Math.round(items.reduce((a, it) => a + this.progressHours(it), 0));
    const cpdYear = items.filter((it) => it.state === 'accepted').reduce((a, it) => a + it.cpd, 0);
    const clouds = this.clouds(items, byId);
    const c = this.constellation(items, clouds), r = this.radar(clouds), rd = this.road(items, clouds);
    const nextUp = items.filter((it) => it.state !== 'accepted' && it.state !== 'submitted' && (it.ob === 'mandatory' || it.ob === 'advised' || it.ob === 'chosen'))
      .sort((a, b) => (a.ob === 'mandatory' ? 0 : 1) - (b.ob === 'mandatory' ? 0 : 1) || Number(b.state === 'in-progress') - Number(a.state === 'in-progress')).slice(0, 4)
      .map((it) => ({ id: it.id, title: it.title, meta: (it.hasDue ? 'Due ' + it.due : it.obLabel) + ' · ' + it.stateLabel + ' · ' + it.hoursLabel, dot: it.ob === 'mandatory' ? '#1a1d18' : it.ob === 'advised' ? '#2f7fc1' : '#86BC25', open: it.open }));

    // library
    const q = s.libQ.toLowerCase();
    const libItems = items.filter((it) => (!q || (it.title + ' ' + it.source + ' ' + it.domLabel).toLowerCase().includes(q)) && (s.libOb === 'all' || it.ob === s.libOb)
      && (s.libLevel === '0' || it.lvl === +s.libLevel) && (s.libFormat === 'all' || it.format === s.libFormat) && (s.libDom === 'all' || it.dom === s.libDom));
    const domChips = [{ key: 'all', label: 'All domains', on: s.libDom === 'all', onClick: () => this.setState({ libDom: 'all' }) }]
      .concat(DOMAINS.map((d) => ({ key: d[0], label: d[1], on: s.libDom === d[0], onClick: () => this.setState({ libDom: d[0] }) })));
    const formats = Array.from(new Set(LEARN.map((l) => l[4])));

    // detail
    const d0 = byId[s.detailId || ''] || items[0];
    const myLvl = this.levels[d0.di];
    const sugg: { src: string; text: string; color: string }[] = [];
    clouds.forEach((cl) => cl.evidence.forEach((e) => { if (e.id === d0.id) sugg.push({ src: e.src, text: e.text, color: cl.color }); }));
    let paths = BLS.map((b) => { const m = s.maps[b].find((x) => x[0] === d0.id); return m ? { bl: b, stage: m[1], ob: OB_LABEL[m[2]] } : null; })
      .filter((x): x is { bl: string; stage: string; ob: string } => !!x);
    if (!paths.length) paths = [{ bl: 'No path', stage: 'open to everyone', ob: '' }];
    const det = {
      ...d0,
      outcomes: OUTCOMES[d0.dom].map((t) => ({ t })),
      levelSub: LEVELS[d0.lvl - 1] + ' · L' + d0.lvl + ' in ' + d0.domLabel + '. You are at L' + myLvl + '; ' + this.nextStage() + ' expects L' + TARGET[d0.di] + '.',
      ladder: LEVELS.map((lab, i) => {
        const n = i + 1; const isThis = n === d0.lvl, mine = n <= myLvl, tgt = n === TARGET[d0.di];
        return { n, label: lab, note: isThis ? 'This learning' : tgt ? this.nextStage() : mine ? 'Reached' : '', bg: isThis ? '#1a1d18' : mine ? '#eef7dc' : '#fff', fg: isThis ? '#fff' : mine ? '#3f6a0a' : '#8b918a', bd: isThis ? '#1a1d18' : tgt ? '#1a1d18' : mine ? '#c9e39a' : '#e1e5dc' };
      }),
      // Ratings and notes come from colleagues once they are stored; none are seeded.
      rating: 'No ratings or notes yet', notes: [] as { initials: string; who: string; text: string }[],
      frac: d0.pct / 100, hoursDone: (Math.round(d0.hours * d0.pct / 100 * 10) / 10) + ' h', hoursText: 'logged of ' + d0.hoursLabel,
      kv: [{ k: 'Format', v: d0.format }, { k: 'Source', v: d0.source }, { k: 'Effort', v: d0.hoursLabel }, { k: 'Level', v: d0.lvlLabel }, { k: 'CPD units', v: d0.cpd ? d0.cpd + ' · ACCA, ITAA' : 'None' }, { k: 'Deadline', v: d0.hasDue ? d0.due : 'None set' }, { k: 'Counts toward', v: d0.domLabel + ' · hours' }],
      canAdd: d0.ob === 'open', canLog: d0.state === 'not-started' || d0.state === 'in-progress',
      canAsk: d0.state === 'in-progress',
      approvalNote: d0.ob === 'mandatory' ? 'Mandatory items complete only after ' + this.counsellorFull() + ' accepts your evidence.' : d0.ob === 'open' ? 'Open items need no approval. Adding one tells ' + this.counsellorFull() + ' what you are curious about.' : 'Completion is logged automatically by ' + d0.source + ' where connected.',
      canAcceptIt: this.canAccept(d0.state), paths, sugg, hasSugg: sugg.length > 0, suggSub: 'Your evaluations, profiles and ambitions point here',
      av: AVATARS[d0.id] ? (() => {
        const AV = AVATARS[d0.id]; const best = AV.skills.map((_sk, k) => Math.max(0, ...AV.attempts.map((a) => a[1][k])));
        return {
          persona: AV.persona, role: AV.role, initials: AV.initials, brief: AV.brief, sub: AV.attempts.length ? AV.attempts.length + ' of 3 runs used · best run counts' : 'No runs yet · 3 runs available',
          skills: AV.skills.map((sk, k) => ({ name: sk, w: (best[k] / 5 * 100) + '%', val: best[k] ? best[k] + ' / 5' : '—', color: best[k] >= AV.target ? '#86BC25' : '#e0a100', tgt: (AV.target / 5 * 100) + '%' })),
          hasRuns: AV.attempts.length > 0, runs: AV.attempts.slice().reverse().map((a) => ({ date: a[0], scores: AV.skills.map((sk, k) => sk + ' ' + a[1][k]).join(' · '), note: a[2] })),
          start: () => this.say('Prototype: opens the avatar studio · voice or text, about 10 minutes · the run stays private until you share it'),
          share: () => this.say('Best run shared with ' + this.counsellorFull() + ' · they see scores and the transcript, not the recording'),
        };
      })() : null,
    };
    if (d0.ob === 'open' && det.hasSugg) det.why = det.sugg[0].text + ' Suggested by ' + det.sugg[0].src + '. Not on a ' + bl + ' path at your stage; it counts toward your hours and levels once added.';


    // admin library
    const aq = s.adminQ.toLowerCase();
    const adminRows = items.filter((it) => (!aq || (it.title + ' ' + it.source).toLowerCase().includes(aq)) && (s.adminStatus === 'all' || PUB_STATUS[LEARN_META[it.id]?.status || 'published'][1] === s.adminStatus))
      .map((it) => {
        const ps = BLS.map((b) => { const m = s.maps[b].find((x) => x[0] === it.id); return m ? b + ' · ' + m[1] : null; }).filter(Boolean);
        return { ...it, effort: it.hoursLabel + (it.cpd ? ' · ' + it.cpd + ' CPD' : ''), paths: ps.length ? ps.join(' · ') : 'Not on a path', pubStatus: PUB_STATUS[LEARN_META[it.id]?.status || 'published'][0], pubLabel: PUB_STATUS[LEARN_META[it.id]?.status || 'published'][1] + (LEARN_META[it.id]?.line ? ' · ' + LEARN_META[it.id].line : ''),
          edit: () => (this.canEditLine(LEARN_META[it.id]?.line) ? this.setState({ drawerOpen: true, libForm: this.formFor(LEARN_BY[it.id]) }) : this.say(this.lineName(LEARN_META[it.id]?.line) + ' learning · ' + this.whoEdits(LEARN_META[it.id]?.line))) };
      });
    const programs = PROGRAMS.map((p) => ({ name: p[0], sync: p[1], dot: p[2], count: LEARN.filter((l) => PROGRAM_OF[l[5]] === p[0]).length }));

    const pendingN = Object.keys(s.pending).length;
    const cur = this.curriculum(items, byId);

    const sel = s.sel;
    const csel = sel && sel.type === 'cloud' ? clouds.find((x) => x.key === sel.id) || null : null;
    const advRow = (id: string, text: string, src: string) => {
      const it = byId[id];
      return { id, src, text, title: it.title, meta: it.domLabel + ' · L' + it.lvl + ' · ' + it.hoursLabel, open: it.open, canAdd: it.ob === 'open', noAdd: it.ob !== 'open', add: () => this.addToPath(id),
        state: it.state, stateLabel: it.ob === 'chosen' && it.state === 'not-started' ? 'On my path' : it.stateLabel, stateIcon: it.stateIcon };
    };
    const cloudDock = csel ? { color: csel.color, title: csel.long, sub: csel.ids.length + ' learnings across ' + Object.keys(csel.w).length + ' domains', go: () => this.go(csel.screen), goLabel: csel.goLabel, rows: csel.evidence.map((e) => advRow(e.id, e.text, e.src)) } : null;
    const cloudChips = clouds.map((cl) => ({
      key: cl.key, label: cl.label, color: cl.color, on: cl.on, count: String(cl.ids.length),
      toggle: () => this.setState({ clouds: Object.assign({}, s.clouds, { [cl.key]: !cl.on }), sel: csel && csel.key === cl.key ? null : s.sel }),
    }));
    const scaleL = ['Developing', 'Meets', 'Exceeds'];
    const p0 = PROJECTS.find((p) => p.id === s.projSel) || PROJECTS[0] || null;
    const projList = PROJECTS.map((p) => {
      const on = p.id === p0?.id;
      return { id: p.id, client: p.client, period: p.period, name: p.name, role: p.role, st: p.dims ? 'accepted' : 'in-progress', stLabel: p.dims ? p.overall.replace(' expectations', '') : 'Evaluation pending', stIcon: p.dims ? 'check' : 'dot',
        bd: on ? '#1a1d18' : '#e1e5dc', ring: on ? '0 0 0 3px rgba(134,188,37,.45)' : 'none', open: () => this.setState({ projSel: p.id }) };
    });
    const pr = !p0 ? null : {
      client: p0.client, period: p0.period, name: p0.name, summary: p0.summary, evaluated: !!p0.dims, pending: !p0.dims,
      kv: [{ k: 'Role', v: p0.role }, { k: 'Hours', v: p0.hours + ' h charged' }, { k: 'Lead', v: p0.lead }, { k: 'Evaluator', v: p0.evaluator }],
      evalSub: p0.dims ? p0.overall + ' · ' + p0.evalDate : '', evaluator: p0.evaluator, evalDate: p0.evalDate,
      evInit: p0.lead.split(' ').filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join('').slice(0, 2), quote: p0.quote,
      dims: (p0.dims || []).map((d) => ({ name: d[0], comment: d[2], scale: scaleL.map((l, k) => ({ label: l, bg: k === d[1] ? '#1a1d18' : '#f3f5f0', fg: k === d[1] ? '#fff' : '#8b918a' })) })),
      adviceSub: p0.advice.length + ' items · they feed the projects cloud on your map', advice: p0.advice.map((a) => advRow(a[0], a[1], p0.client)),
      pendingText: 'Evaluation requested from ' + p0.lead + ' on 24 Oct 2026. Its advice joins your projects cloud once it is submitted.',
    };
    const tests = TESTS.map((t) => ({
      id: t.id, name: t.name, provider: t.provider, date: t.date, headline: t.headline, reading: t.reading,
      bars: t.bars.map((b) => ({ label: b[0], w: b[1] + '%', val: b[1] + t.unit, color: b[2] || '#5a6058' })),
      sugg: t.sugg.map((x) => ({ id: x[0], title: byId[x[0]].title, text: x[1], open: byId[x[0]].open })),
      share: s.share[t.id],
      setShare: (v: string) => { this.setState((st) => ({ share: Object.assign({}, st.share, { [t.id]: v }) })); this.say(v === 'counsellor' ? t.name + ' result shared with ' + this.counsellorFull() : t.name + ' result is now visible to you only'); },
    }));
    const domName = (k: string) => (DOMAINS.find((d) => d[0] === k) || [k, k])[1];
    const ambitions = this.subject.data.ambitions.map((a) => ({ id: a.id, text: a.text, meta: [a.horizon, a.from].filter(Boolean).join(' · '), doms: a.doms.map((d) => ({ key: d, label: domName(d) })), remove: () => this.persist(() => removeAmbition(a.id), 'Ambition removed') }));
    const interests = this.subject.data.interests.map((i) => ({ label: i.label, dom: domName(i.dom), remove: () => this.persist(() => removeInterest(this.subject.id, i.label), 'Interest removed') }));
    const pp = s.chatFor === this.subject.id ? s.proposal : null;
    const proposalItems = pp ? (pp.ambition ? [{ kind: 'Ambition', text: pp.ambition.text + ' · ' + (pp.ambition.horizon || '3 years') }] : []).concat(pp.interests.map((i) => ({ kind: 'Interest', text: i.label + ' · ' + domName(i.domain) }))) : [];
    const titles: Record<Screen, [string, string]> = {
      projects: ['Me · Projects & evaluations', 'Projects & evaluations'], profile: ['Me · My profile', 'My profile'], map: ['Me · ' + [this.subject.stage, bl].filter(Boolean).join(' · '), 'My growth map'], library: ['Me · Library', 'Library'],
      detail: ['Me · Library · ' + d0.domLabel, d0.title], team: ['Counsellor · counsellees', 'My team'], adminLib: ['Administration · Learning library', 'Learning library'], adminKb: ['Administration · Knowledge library', 'Knowledge library'], adminMap: ['Administration · Curriculum mapping · ' + bl, 'Curriculum mapping'], users: ['Administration · User management', 'User management'],
    };
    const hubDock = sel && sel.type === 'hub' ? (() => {
      const di = DOMAINS.findIndex((d) => d[0] === sel.id); const list = items.filter((it) => it.dom === sel.id);
      return { label: DOMAINS[di][1], sub: 'You are at ' + levelLabel(this.levels[di]) + '. ' + this.nextStage() + ' in ' + bl + ' expects L' + TARGET[di] + ' · ' + list.filter((it) => it.state === 'accepted').length + ' of ' + list.length + ' completed', items: list };
    })() : null;
    const dockIt = sel && sel.type === 'node' ? byId[sel.id] : null;
    const dock = dockIt ? { ...dockIt, kv: [{ k: 'Source', v: dockIt.source }, { k: 'Effort', v: dockIt.hoursLabel }, { k: 'Level', v: dockIt.lvlLabel }, { k: 'Deadline', v: dockIt.hasDue ? dockIt.due : 'None' }], add: () => this.addToPath(dockIt.id) } : null;

    return {
      who: {
        name: this.subject.name, readOnly: this.subject.readOnly,
        roleLine: [this.subject.stage, this.subject.businessLine || 'No business line yet'].filter(Boolean).join(' · '),
        nextStage: this.nextStage(),
        readinessLine: this.atTop() ? this.nextStage() + ' · top of the career path' : readiness + '% ready for ' + this.nextStage(),
        counsellorLine: this.subject.counsellor ? 'Counsellor: ' + this.subject.counsellor.name : 'No counsellor',
      },
      bl, readiness, readinessW: readiness + '%', readinessFrac: readiness / 100, readinessDash: (readiness / 100 * 2 * Math.PI * 38) + ' ' + (2 * Math.PI * 38),
      readinessText: 'Readiness counts hours on mandatory and advised items up to the ' + this.nextStage() + ' stage in ' + bl + '. Your own choices count toward levels and hours, not readiness.',
      centerSub: this.atTop() ? this.nextStage() + ' · top of the career path' : (this.subject.stage || STAGES[0]) + ' → ' + this.nextStage() + ' · ' + readiness + '% ready', hoursYear, cpdYear, hoursChip: hoursYear + ' of 80 h this year',
      noLineNote: this.subject.businessLine ? '' : (this.subject.readOnly ? this.subject.name + ' has' : 'You have') + ' no business line yet, so mandatory and advised items are shown for ' + bl + '. An admin sets the line in User management.',
      mapLead: 'You sit in the middle. The nine domains around you hold every learning the firm knows about; your ' + bl + ' affiliation decides which ones are mandatory, your counsellor advises some, the rest is yours to choose. Clouds show where your projects, personality and ambitions pull you.',
      crumb: titles[s.screen][0], headerTitle: titles[s.screen][1], screen: s.screen,
      navMap: s.screen === 'map' || (s.screen === 'detail' && s.origin === 'map'), navLib: s.screen === 'library' || (s.screen === 'detail' && s.origin === 'library'), navTeam: s.screen === 'team', navAdminLib: s.screen === 'adminLib', navAdminMap: s.screen === 'adminMap' || (s.screen === 'detail' && s.origin === 'adminMap'), navUsers: s.screen === 'users', showAdmin: this.isAdmin(), canManageUsers: this.canManageUsers(), goUsers: () => this.go('users'),
      navProj: s.screen === 'projects' || (s.screen === 'detail' && s.origin === 'projects'), navProfile: s.screen === 'profile' || (s.screen === 'detail' && s.origin === 'profile'),
      goMap: () => this.go('map'), goLibrary: () => this.go('library'), goTeam: () => this.go('team'), goAdminLib: () => this.go('adminLib'), goAdminMap: () => this.go('adminMap'), goProj: () => this.go('projects'), goProfile: () => this.go('profile'),
      goBack: () => this.go(s.origin), backLabel: s.origin === 'projects' ? '← Back to projects' : s.origin === 'profile' ? '← Back to my profile' : s.origin === 'map' ? '← Back to my growth map' : s.origin === 'adminMap' ? '← Back to curriculum mapping' : '← Back to library',
      libCount: String(LEARN.length), projCount: String(PROJECTS.length), pendingLabel: pendingN ? pendingN + ' pending' : '', noPending: pendingN === 0,
      toastHelp: () => this.say(this.subject.counsellor ? 'Prototype: opens a message to ' + this.counsellorFull() + ', your counsellor' : 'No counsellor yet · an admin can assign one in User management'),
      askLabel: this.subject.counsellor ? 'Ask ' + this.counsellorFirst() : 'Ask your counsellor',
      counsellorFirst: this.counsellorFirst(),
      // map
      view: s.view, setView: (v: string) => this.setState({ view: v as AppState['view'], sel: null }), viewOptions: [opt('constellation', 'Constellation'), opt('radar', 'Radar'), opt('road', 'Road')],
      legendItems: [{ status: 'accepted' as const, label: 'Completed' }, { status: 'in-progress' as const, label: 'In progress' }, { status: 'submitted' as const, label: 'Awaiting ' + (this.subject.counsellor ? this.counsellorFirst() : 'counsellor') }, { color: '#fff', label: 'Not started' }],
      cEdges: c.edges, cHubs: c.hubs, cNodes: c.nodes, cClouds: c.clouds, isZoom: !!s.zoom, zm: s.zoom ? this.zoomVals(items, clouds) : null, zoomOut: () => this.setState({ zoom: null, sel: null }),
      cHint: s.zoom ? 'Rings are levels L1 (inner) to L5: green is your level now, dashed is the level needed for ' + this.nextStage() + '. Click a learning for details.' : 'Click a dot or a domain. Press + or double-click a domain to zoom in.', clearSel: () => this.setState({ sel: null }), selectMe: () => this.setState({ sel: null, view: 'radar' }),
      rRings: r.rings, rAxes: r.axes, rCur: r.cur, rTarget: r.target, rDots: r.dots, rClouds: r.clouds, radarGapText: r.gapText,
      roadLanes: rd.lanes, roadQuarters: rd.quarters, roadInflight: rd.inflight, roadBehind: rd.behind, inflightCount: rd.inflightCount,
      cloudChips, cloudRowLabel: s.view === 'road' ? 'Paths' : 'Learning clouds', cloudRowHint: s.view === 'road' ? 'Each cloud adds its own lane next to the firm path.' : 'Click a cloud label to see what put it there.',
      cloudDock, dock, hubDock, nextUp, showStreak: this.props.showMarks !== false,
      // Earned marks only; private to the person.
      marks: [this.levels.every((l) => l > 0) ? 'All nine domains touched' : '', items.some((it) => it.state === 'accepted' && it.format === 'Certification') ? 'First certification' : ''].filter(Boolean),
      ...kbVals(this),
      // library
      libLead: LEARN.length + ' learnings across nine domains · 6 connected programs · levels L1 Foundation to L5 Thought leader', libQ: s.libQ, setLibQ: (e: ChangeEvent<HTMLInputElement>) => this.setState({ libQ: e.target.value }),
      obOptions: [opt('all', 'All'), opt('mandatory', 'Mandatory'), opt('advised', 'Advised'), opt('chosen', 'Chosen'), opt('open', 'Open')], libOb: s.libOb, setLibOb: (v: string) => this.setState({ libOb: v }),
      levelOptions: [opt('0', 'Any level')].concat(LEVELS.map((l, i) => opt(String(i + 1), 'L' + (i + 1) + ' · ' + l))), libLevel: s.libLevel, setLibLevel: (e: ChangeEvent<HTMLSelectElement>) => this.setState({ libLevel: e.target.value }),
      fmtTiles: formatTiles(LEARN, s.libFormat, (f) => this.setState({ libFormat: f })),
      libEmpty: libItems.length === 0, clearLibFilters: () => this.setState({ libQ: '', libOb: 'all', libLevel: '0', libFormat: 'all', libDom: 'all' }),
      domChips, libItems, libResultText: libItems.length + ' of ' + LEARN.length + ' learnings' + (s.libOb === 'mandatory' ? ' · mandatory for ' + bl + ' up to the ' + this.nextStage() + ' stage' : ''),
      // detail
      det, noteOpen: s.noteOpen, toggleNote: () => this.setState({ noteOpen: !s.noteOpen }), saveNote: () => { this.setState({ noteOpen: false }); this.say('Note posted · visible to colleagues on this learning'); },
      ratingOptions: [1, 2, 3, 4, 5].map((n) => opt(String(n), String(n))), myRating: s.myRating, setRating: (v: string) => this.setState({ myRating: v }),
      acceptIt: () => this.accept(d0.id, d0.title), addToPath: () => this.addToPath(d0.id), logHours: () => this.logHours(d0),
      askApprove: () => this.persist(() => saveProgress(this.subject.id, d0.id, { state: 'submitted', pct: 100 }), 'Sent to ' + this.counsellorFull() + ' · they see your evidence and the hours you logged'),
      // projects & profile
      projLead: PROJECTS.length + ' engagements since Sep 2025 · ' + PROJECTS.filter((p) => p.dims).length + ' evaluated · synced from staffing and the performance tool. Advice from each evaluation lands in the projects cloud on your map.',
      projList, pr, requestEval: () => this.say('Prototype: sends an evaluation request through the performance tool · the evaluator is reminded after 10 days'),
      profLead: 'Profiles, ambitions and interests are yours. You decide what your counsellor sees. None of this counts toward readiness; it shapes the clouds and paths on your map.',
      tests, shareOptions: [opt('me', 'Only me'), opt('counsellor', this.subject.counsellor ? this.counsellorFirst() : 'Counsellor')], addTest: () => this.say('Prototype: upload a report or enter results · Four Colours, MBTI, Big Five, DISC, Belbin team roles, Hogan'),
      ambitions, interests,
      chat: ([{ role: 'assistant', text: this.greeting() }] as ChatMsg[]).concat(this.myChat()), chatBusy: s.chatBusy, chatInput: s.chatInput, setChatInput: (e: ChangeEvent<HTMLInputElement>) => this.setState({ chatInput: e.target.value }),
      chatKey: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') this.send(s.chatInput); }, sendChat: () => this.send(s.chatInput),
      chatPrompts: ['Where could I be in five years?', 'I enjoyed the energy client most', 'What do my evaluations say?'].map((l) => ({ label: l, send: () => this.send(l) })),
      chatSub: (this.props.liveAssistant === false || !window.claude?.complete ? 'Scripted assistant' : 'AI assistant') + ' · reads your projects and profiles · saves nothing until you confirm',
      hasProposal: !!pp, proposalItems, saveProposal: () => this.saveProposal(), dropProposal: () => this.setState({ proposal: null }),
      // team
      teamLead: (n: number) => (n === 0 ? 'Nobody names ' : n === 1 ? 'One person names ' : n + ' people name ') + (this.subject.readOnly ? this.subject.name : 'you') + ' as counsellor. Readiness is measured against each person\'s next stage in their business line; mandatory items are the ones the firm chases.',
      // Rows for the counsellor screen, from real counsellees; opening one shows their app read-only.
      teamRows: (members: Member[], open: (id: string) => void) => members.map((m) => {
        const t = memberSummary(m, s.maps, new Date());
        const initials = m.name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
        return {
          id: m.id, initials, name: m.name, grade: [m.stage || 'No stage', m.businessLine || 'No line'].join(' · '), readinessLabel: t.readiness + '%', barW: t.readiness + '%', hours: t.hours,
          mandStatus: t.overdue ? 'clarification' : 'accepted', mandLabel: t.overdue ? t.overdue + ' overdue' : 'On track', mandIcon: t.overdue ? 'dot' : 'check',
          cells: t.levels.map((v, i) => ({ v: 'L' + v, bg: HEAT[v], fg: v >= 4 ? '#fff' : v >= 2 ? '#1a1d18' : '#5a6058', overdue: t.overdueDomains.includes(DOMAINS[i][0]), title: DOMAINS[i][1] + ' · L' + v })),
          open: () => open(m.id),
        };
      }),
      teamTabs: [opt('roster', 'Roster'), opt('heat', 'Levels by domain')], teamTab: s.teamTab, setTeamTab: (v: string) => this.setState({ teamTab: v }),
      domShort: DOMAINS.map((d) => d[2]), heatTargets: [2, 2, 2, 3, 2, 2, 1, 2, 2].map((v) => 'L' + v),
      // admin library
      adminLead: LEARN.length + ' learnings · 6 connected programs · 3 need attention · last sync 28 Oct 2026 07:10', programs, adminQ: s.adminQ, setAdminQ: (e: ChangeEvent<HTMLInputElement>) => this.setState({ adminQ: e.target.value }),
      pubOptions: [opt('all', 'All'), opt('Published', 'Published'), opt('Needs review', 'Needs review'), opt('Draft', 'Draft')], adminStatus: s.adminStatus, setAdminStatus: (v: string) => this.setState({ adminStatus: v }), adminRows,
      syncNow: () => this.say('Sync started · Internal academy, Coursera / edX and Microsoft Learn · usually under a minute'),
      drawerOpen: s.drawerOpen, openDrawer: () => (this.editableLines().length ? this.setState({ drawerOpen: true, libForm: this.blankForm() }) : this.say('Only admins add learnings')), closeDrawer: () => this.setState({ drawerOpen: false, libForm: null }),
      programOptions: PROGRAMS.map((p) => opt(p[0], p[0])), importQ: s.importQ, setImportQ: (e: ChangeEvent<HTMLInputElement>) => this.setState({ importQ: e.target.value }),
      importResults: IMPORT_RESULTS.filter((ir) => !s.importQ || ir[0].toLowerCase().includes(s.importQ.toLowerCase())).map((ir) => ({ title: ir[0], sub: ir[1], import: () => {
        // "Coursera · 6 h · Professional skills" fills the form below; the admin checks it and saves.
        const [src, eff, dom] = ir[1].split(' · '), d = DOMAINS.find((x) => x[1] === dom);
        this.setState((st) => ({ libForm: { ...(st.libForm || this.blankForm()), title: ir[0], source: src || '', hours: (eff || '').replace(/[^0-9.,]/g, ''), domain: d ? d[0] : (st.libForm || this.blankForm()).domain } }));
      } })),
      domainOptions: DOMAINS.map((d) => opt(d[0], d[1])), levelOnlyOptions: LEVELS.map((l, i) => opt(String(i + 1), 'L' + (i + 1) + ' · ' + l)), formatOnlyOptions: formats.map((f) => opt(f, f)),
      lf: s.libForm, lfTitle: s.libForm?.id ? 'Edit learning' : 'Add a learning',
      lfSet: Object.fromEntries((['title', 'domain', 'level', 'format', 'source', 'hours', 'cpd', 'why', 'line'] as const).map((k) => [k, (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { const v = e.target.value; this.setState((st) => ({ libForm: st.libForm && { ...st.libForm, [k]: v } })); }])) as Record<'title' | 'domain' | 'level' | 'format' | 'source' | 'hours' | 'cpd' | 'why' | 'line', (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void>,
      lineOptions: this.editableLines().map((l) => opt(l, l ? l + ' only' : 'Firm-wide · all business lines')),
      saveDraft: () => this.saveLearningForm('draft'), saveReview: () => this.saveLearningForm('review'), savePublish: () => this.saveLearningForm('published'), removeLearning: () => this.removeLearningForm(),
      // admin mapping
      publish: () => this.publish(),
      obSetOptions: [opt('mandatory', 'Mandatory'), opt('advised', 'Advised')],
      ...cur,
      toast: s.toast,
      motionAttr: this.props.motion === false ? 'off' : 'on',
      // avatar
      avatarBg: av.bg, avatarFg: (AV_SWATCHES.find((w) => w[0] === av.bg) || AV_SWATCHES[0])[1], avatarInitials: av.initials, avatarPhoto: av.photo,
      avatarSwatches: AV_SWATCHES.map((w) => ({ bg: w[0], label: w[2], ring: av.bg === w[0] ? '0 0 0 2px #1a1d18' : '0 0 0 1px #d5dacf', pick: () => this.setAvatar({ bg: w[0] }) })),
      setInitials: (e: ChangeEvent<HTMLInputElement>) => this.setAvatar({ initials: (e.target.value || '').toUpperCase().slice(0, 2) }),
      pickAvatarFile: () => this.refs.file.current && this.refs.file.current.click(), onAvatarFile: (e: ChangeEvent<HTMLInputElement>) => this.onAvatarFile(e),
      uploadLabel: av.photo ? 'Change photo' : 'Upload a photo', removePhoto: () => this.setAvatar({ photo: null }),
    };
  }

  addToPath(id: string) {
    if (this.subject.data.progress[id]?.chosen) return;
    this.persist(() => saveProgress(this.subject.id, id, { chosen: true }), 'Added to your path · it now shows on your map with a green ring');
  }
  logHours(it: Item) {
    const np = Math.min(100, Math.round(it.pct + 100 / it.hours));
    this.persist(() => saveProgress(this.subject.id, it.id, { state: np >= 100 ? 'submitted' : 'in-progress', pct: np }),
      np >= 100 ? 'All hours logged · sent to ' + this.counsellorFull() + ' for acceptance' : '1 hour logged · ' + np + '% of ' + it.hoursLabel);
  }
  greeting() {
    const a = this.subject.data.ambitions.length, i = this.subject.data.interests.length;
    const plural = (n: number, w: string) => n + ' ' + w + (n === 1 ? '' : 's');
    return 'I help you put your interests and ambitions into words. Nothing is saved until you confirm it. '
      + (a || i ? 'You have ' + plural(a, 'ambition') + ' and ' + plural(i, 'interest') + ' on file. ' : '')
      + 'What kind of work gave you the most energy this year?';
  }
  sysPrompt() {
    const who = this.subject;
    return 'You are the growth assistant inside MyProfessionalMe, the learning platform of a consulting, audit, tax and legal firm. You talk with ' + who.name + ', ' + (who.stage || 'a professional') + ' in ' + this.bl() + '. Help them put their interests and ambitions into words. Plain, warm, matter-of-fact English. At most 70 words. One question at a time. No emoji, no exclamation marks, no lists.\n'
      + 'Known ambitions: ' + (who.data.ambitions.map((a) => a.text + ' (' + a.horizon + ')').join('; ') || 'none yet') + '.\nKnown interests: ' + (who.data.interests.map((i) => i.label).join(', ') || 'none yet') + '.\n'
      + 'Domain codes: ' + DOMAINS.map((d) => d[0] + '=' + d[1]).join(', ') + '.\n'
      + 'Reply ONLY with JSON: {"reply": string, "interests": [{"label": string, "domain": code}], "ambition": null or {"text": string, "horizon": "1 year"|"3 years"|"5 years", "domains": [codes]}}. Propose an interest or ambition only when they clearly stated it in their last message and it is not already known; otherwise use [] and null. Interest labels are short noun phrases; ambitions start with a verb.';
  }
  scripted(text: string): ChatReply {
    const t = text.toLowerCase();
    if (t.includes('five years') || t.includes('5 years')) return { reply: 'Picture a normal week five years from now: which clients, which kind of work, and how much of it is leading others? Your answer is a good start for an ambition.', interests: [], ambition: null };
    if (t.includes('evaluation')) return { reply: 'No project evaluations are on file yet. Once the performance tool is connected I can summarise the themes they repeat. Meanwhile, what feedback from your last project do you remember most?', interests: [], ambition: null };
    if (t.includes('energy')) return { reply: 'Energy-transition work is a clear direction. Shall I save it as an ambition for the next three years? It pulls Industry & market, Regulations and Technology into your ambitions cloud.', interests: [], ambition: { text: 'Work mainly with energy-transition clients', horizon: '3 years', domains: ['ind', 'reg', 'tec'] } };
    const k = KEYWORDS.find((x) => t.includes(x[0]) && !this.subject.data.interests.some((i) => i.label === x[1]));
    if (k) return { reply: 'That sounds like a real interest. I can save “' + k[1] + '” to your profile; it adds ' + (DOMAINS.find((d) => d[0] === k[2]) || [])[1] + ' to your ambitions cloud. What draws you to it?', interests: [{ label: k[1], domain: k[2] }], ambition: null };
    return { reply: 'Noted. What part of that would you want more of next year: the analysis, the client conversation, or leading the team?', interests: [], ambition: null };
  }
  async send(raw: string) {
    const text = (raw || '').trim(); if (!text || this.state.chatBusy || this.readOnly()) return;
    const chat: ChatMsg[] = this.myChat().concat([{ role: 'user', text }]);
    this.setState({ chat, chatFor: this.subject.id, chatInput: '', chatBusy: true, proposal: null });
    let res: ChatReply | null = null;
    if (this.props.liveAssistant !== false && window.claude?.complete) {
      try {
        const out = await window.claude.complete({ system: this.sysPrompt(), messages: chat.map((m) => ({ role: m.role, content: m.text })), max_tokens: 600 });
        const m = String(out).match(/\{[\s\S]*\}/); if (m) res = JSON.parse(m[0]);
      } catch { res = null; }
    }
    if (!res || !res.reply) res = this.scripted(text);
    const reply = res.reply;
    const ints = (res.interests || []).filter((i) => i && i.label && DOMAINS.some((d) => d[0] === i.domain));
    const amb = res.ambition && res.ambition.text ? res.ambition : null;
    // functional update: this.state is stale after the await
    this.setState((st) => ({ chat: st.chat.concat([{ role: 'assistant', text: reply }]), chatBusy: false, proposal: ints.length || amb ? { interests: ints, ambition: amb } : null }));
  }
  saveProposal() {
    const p = this.state.proposal; if (!p || this.state.chatFor !== this.subject.id) return;
    const id = this.subject.id, known = this.subject.data.interests;
    const amb = p.ambition;
    const fresh = p.interests.filter((i) => !known.some((x) => x.label.toLowerCase() === i.label.toLowerCase()));
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    this.persist(async () => {
      if (amb) await addAmbition(id, { text: amb.text, horizon: amb.horizon || '3 years', doms: (amb.domains || []).filter((d) => DOMAINS.some((x) => x[0] === d)), from: 'Assistant conversation · ' + today });
      for (const i of fresh) await addInterest(id, { label: i.label, dom: i.domain });
      this.setState((st) => ({ proposal: null, clouds: { ...st.clouds, amb: true } }));
    }, 'Saved to your profile · the ambitions cloud on your growth map now reflects it');
  }

  // ---------- curriculum mapping (audiences per lens) ----------

  applyOps(all: Op[], msg?: string) {
    const ops = all.filter((o) => this.canEditAud(o.aud));
    if (ops.length < all.length) {
      const outside = Array.from(new Set(all.filter((o) => !this.canEditAud(o.aud)).map((o) => AUD_INFO[o.aud].name)));
      this.say('Outside your domain: ' + outside.join(', ') + (ops.length ? ' · the rest was applied' : ''));
      if (!ops.length) return;
      msg = undefined;
    }
    const maps = Object.assign({}, this.state.maps), pending = Object.assign({}, this.state.pending);
    ops.forEach((o) => {
      const cur = maps[o.aud] || []; const ex = cur.find((m) => m[0] === o.lid); let arr = cur.filter((m) => m[0] !== o.lid);
      const canMand = lensOf(o.aud)[3];
      if (o.op === 'add') arr = arr.concat([[o.lid, o.stage!, canMand ? (o.ob || 'advised') : 'advised']]);
      if (o.op === 'setOb') arr = arr.concat([[o.lid, ex ? ex[1] : o.stage!, canMand ? o.ob! : 'advised']]);
      maps[o.aud] = arr; pending[o.aud + '|' + o.lid] = true;
    });
    this.setState({ maps, pending }); if (msg) this.say(msg);
  }
  sigValid(g: Signal) { const cur = (this.state.maps[g.op.aud] || []).find((m) => m[0] === g.op.lid); return g.op.op === 'add' ? !cur : g.op.op === 'remove' ? !!cur : !!(cur && cur[2] !== g.op.ob); }
  reachAt(k: string, st?: string) { return Math.round(AUD_INFO[k].reach * STAGE_FR[Math.max(0, STAGES.indexOf(st || ''))]); }
  // The viewed person as a learner's-eye persona: their business line only, until other audiences are recorded per person.
  mePersona(): Persona {
    return ['me', this.subject.name.split(' ')[0], this.subject.name, this.subject.stage || STAGES[0], { bl: this.subject.businessLine, ind: null, tec: null, amb: null, pro: null }];
  }
  // Everything one person receives at their stage, stacked across the audiences they belong to. Duplicates count once.
  stack(p: Persona) {
    const s = this.state, st = p[3], seen: Record<string, string[]> = {};
    const layers: { lens: string; color: string; key: string; aud: string; n: number; h: number; titles: string[] }[] = [];
    let tot = 0, mand = 0;
    LENSES.forEach((L) => {
      const key = L[0] === 'bl' ? (p[4].bl || this.bl()) : p[4][L[0]]; if (!key || !AUD_INFO[key]) return; const list = (s.maps[key] || []).filter((m) => m[1] === st); let h = 0, n = 0; const titles: string[] = [];
      list.forEach((m) => {
        const it = LEARN_BY[m[0]]; if (!it) return; if (seen[m[0]]) { seen[m[0]].push(AUD_INFO[key].name); return; }
        seen[m[0]] = [AUD_INFO[key].name]; h += it[6]; n++; titles.push(it[1] + (L[3] && m[2] === 'mandatory' ? ' (mandatory)' : '')); if (L[3] && m[2] === 'mandatory') mand += it[6];
      });
      tot += h; layers.push({ lens: L[1], color: L[2], key, aud: AUD_INFO[key].name, n, h, titles });
    });
    const dups = Object.keys(seen).filter((k) => seen[k].length > 1).map((k) => ({ lid: k, title: LEARN_BY[k][1], via: seen[k] }));
    return { layers, tot, mand, dups };
  }
  scriptedRead(P: Persona, st: Stack): Read {
    if (st.mand > 40) return { text: 'This is more mandatory learning than my year allows: ' + Math.round(st.mand) + ' hours before I choose anything myself. I would rush the mandatory items and quietly skip the rest.', fix: 'Make one mandatory item in the industry layer advised, or move it to the next stage.' };
    if (st.dups.length) return { text: 'Most of this fits where I am, but ' + st.dups[0].title + ' turns up twice and makes the plan look heavier than it is. I would wonder whether anyone looked at it as a whole.', fix: 'Remove ' + st.dups[0].title + ' from ' + st.dups[0].via[1] + '; ' + st.dups[0].via[0] + ' already covers it.' };
    const empty = st.layers.find((l) => !l.n);
    if (st.tot < 20) return { text: 'There is very little here for me yet. It reads like a starter list rather than a path toward anything I said I wanted.', fix: empty ? 'Map at least one learning to ' + empty.aud + ' at ' + P[3] + '.' : 'Add one stretch item at ' + P[3] + '.' };
    return { text: 'This looks like a plan I can finish. The business-line items set the floor and the rest follows what I asked for' + (empty ? ', although nothing reflects my ' + empty.lens.toLowerCase() + ' yet.' : '.'), fix: empty ? 'Map one learning to ' + empty.aud + ' at ' + P[3] + '.' : 'No change needed; check again after the next evaluation round.' };
  }
  async readAs(P: Persona, st: Stack) {
    if (this.state.readBusy) return; this.setState({ readBusy: true });
    let res: Read | null = null;
    if (this.props.liveAssistant !== false && window.claude?.complete) {
      try {
        const lines = st.layers.map((l) => l.lens + ' (' + l.aud + '): ' + (l.titles.length ? l.titles.join(', ') : 'nothing')).join('\n');
        const raw = await window.claude.complete({ messages: [{ role: 'user', content: 'You are ' + P[2] + ', ' + P[3] + ' at a consulting, audit, tax and legal firm. This is the learning your firm has lined up for you this year, stacked from every audience you belong to:\n' + lines + '\nTotal ' + Math.round(st.tot) + ' h of an 80 h budget; mandatory ' + Math.round(st.mand) + ' h of a 40 h budget. Arrives twice: ' + (st.dups.map((d) => d.title).join(', ') || 'none') + '.\nReply ONLY with JSON {"text": your honest first-person reaction, 2 sentences, at most 45 words, plain, no emoji, no exclamation marks, "fix": one concrete change for the curriculum team, at most 25 words, naming the audience and the learning}.' }], max_tokens: 300 });
        const m = String(raw).match(/\{[\s\S]*\}/); if (m) res = JSON.parse(m[0]);
      } catch { res = null; }
    }
    if (!res || !res.text) res = this.scriptedRead(P, st);
    const read = res;
    // functional update: this.state is stale after the await
    this.setState((s) => ({ readBusy: false, reads: { ...s.reads, [P[0]]: read } }));
  }
  validOps(ops?: Op[]) {
    return (ops || []).filter((o) => o && AUD_INFO[o.aud] && LEARN_BY[o.lid] && ['add', 'remove', 'setOb'].includes(o.op) && (o.op === 'remove' || STAGES.includes(o.stage || '') || o.op === 'setOb'))
      .map((o) => ({ ...o, ob: o.ob === 'mandatory' && lensOf(o.aud)[3] ? 'mandatory' : 'advised' })).slice(0, 5);
  }
  scriptedCp(text: string): { reply: string; ops: Op[] } {
    const t = text.toLowerCase(), maps = this.state.maps, has = (k: string, id: string) => (maps[k] || []).some((m) => m[0] === id);
    if (/twice|overlap|duplic|double/.test(t)) {
      const hits: string[] = [];
      STAGES.forEach((st) => LEARN.forEach((r) => { const ks = Object.keys(maps).filter((k) => AUD_INFO[k] && (maps[k] || []).some((m) => m[0] === r[0] && m[1] === st)); if (ks.length > 1) hits.push(r[1] + ' at ' + st + ' (' + ks.map((k) => AUD_INFO[k].name).join(', ') + ')'); }));
      return { reply: hits.length ? 'These arrive twice for anyone in both audiences: ' + hits.slice(0, 3).join('; ') + '. Business-line mappings already reach everyone, so the narrower copy can usually go.' : 'Nothing arrives twice at the same stage right now.', ops: has('ind:whole', 'L2') ? [{ op: 'remove', aud: 'ind:whole', lid: 'L2' }] : [] };
    }
    if (/business dev|bizdev|sell/.test(t)) return { reply: 'A starter path for people who want to win work: scope negotiation and workshop facilitation at Senior consultant, data storytelling one stage earlier. All suggested, since ambitions never create obligations.', ops: ([{ op: 'add', aud: 'amb:bizdev', lid: 'L32', stage: 'Senior consultant' }, { op: 'add', aud: 'amb:bizdev', lid: 'L33', stage: 'Senior consultant' }, { op: 'add', aud: 'amb:bizdev', lid: 'L37', stage: 'Consultant' }] as Op[]).filter((o) => !has('amb:bizdev', o.lid)) };
    if (/energy/.test(t)) return { reply: 'Energy & utilities seniors have sector strategy and the regulation item, but nothing on negotiation, while 23 of 41 evaluations mention procurement reopening scope. I would add scope negotiation as advised.', ops: has('ind:energy', 'L32') ? [] : [{ op: 'add', aud: 'ind:energy', lid: 'L32', stage: 'Senior consultant', ob: 'advised' }] };
    if (/public|lighter|light/.test(t)) return { reply: 'Public sector has no mappings yet, so analysts there only receive the business-line path. A light start is one advised item on reading annual accounts; nothing mandatory.', ops: has('ind:public', 'L31') ? [] : [{ op: 'add', aud: 'ind:public', lid: 'L31', stage: 'Analyst', ob: 'advised' }] };
    return { reply: 'I can add, remove or re-weight learnings for any audience. Name the audience and the stage, for example “Energy & utilities seniors” or “people with a people-leader ambition”.', ops: [] };
  }
  async askCp(raw: string) {
    const text = (raw || '').trim(); if (!text || this.state.cpBusy) return;
    this.setState({ cpBusy: true, cpInput: '', cpReply: '', cpOpsP: null });
    let res: { reply: string; ops?: Op[] } | null = null;
    if (this.props.liveAssistant !== false && window.claude?.complete) {
      try {
        const s = this.state;
        const sys = 'You are the curriculum copilot of a consulting, audit, tax and legal firm. Learnings are mapped to audiences at career stages. Audiences (key = name): ' + Object.keys(AUD_INFO).map((k) => k + ' = ' + AUD_INFO[k].name + ' (' + lensOf(k)[1] + ', ' + AUD_INFO[k].reach + ' people)').join('; ') + '. Stages: ' + STAGES.join(', ') + '. Ambition and Profile audiences can only be advised, never mandatory.\nLearnings: ' + LEARN.map((r) => r[0] + ' ' + r[1] + ' (' + r[2] + ', L' + r[3] + ', ' + r[6] + ' h)').join('; ') + '.\nCurrent mappings: ' + Object.keys(s.maps).filter((k) => AUD_INFO[k] && s.maps[k].length).map((k) => k + ': ' + s.maps[k].map((m) => m[0] + '@' + m[1] + '/' + m[2]).join(' ')).join(' | ') + '.\nYearly budget: 80 h total, 40 h mandatory.\nReply ONLY with JSON {"reply": string, at most 60 words, plain matter-of-fact English, no emoji, "ops": [{"op": "add"|"remove"|"setOb", "aud": key, "lid": id, "stage": stage, "ob": "mandatory"|"advised"}]}. Propose at most 4 ops and only when the request asks for a change.';
        const out = await window.claude.complete({ system: sys, messages: [{ role: 'user', content: text }], max_tokens: 700 });
        const m = String(out).match(/\{[\s\S]*\}/); if (m) res = JSON.parse(m[0]);
      } catch { res = null; }
    }
    if (!res || !res.reply) res = this.scriptedCp(text);
    this.setState({ cpBusy: false, cpReply: res.reply, cpOpsP: this.validOps(res.ops) });
  }
  // Mappings whose learning this viewer can see (drafts are hidden from those who cannot edit them).
  visibleMaps() { return Object.fromEntries(Object.entries(this.state.maps).map(([k, v]) => [k, v.filter((m) => LEARN_BY[m[0]])])); }
  curriculum(items: Item[], byId: Record<string, Item>) {
    const s = this.state, lens = s.mapLens, L = LENSES.find((l) => l[0] === lens)!, auds = AUDS[lens];
    const maps = this.visibleMaps();
    const ownLine = this.access.isSystem || this.access.domains.includes(this.bl()) ? this.bl() : this.access.domains[0] || this.bl();
    const audKey = s.mapAud && AUD_INFO[s.mapAud] && AUD_INFO[s.mapAud].lens === lens ? s.mapAud : (lens === 'bl' ? ownLine : auds[0][0]);
    const editable = this.canEditAud(audKey);
    const ai = AUD_INFO[audKey], canMand = L[3], map = maps[audKey] || [], mappedIds = map.map((m) => m[0]);
    const sigOpen = SIGNALS.filter((g) => !s.sigDone[g.id] && this.sigValid(g) && this.canEditAud(g.op.aud));
    const pick = (k: string, st?: string) => () => this.setState({ mapAud: k, mapStage: st || null, mapSel: null });
    const covRows = auds.map((a) => {
      const sig = sigOpen.filter((g) => g.op.aud === a[0]).length;
      return {
        key: a[0], name: a[1], reach: a[2] + ' people', rowBg: a[0] === audKey ? '#f3f5f0' : 'transparent', hasSig: sig > 0, sig: String(sig), pick: pick(a[0]),
        cells: STAGES.map((st) => {
          const list = (maps[a[0]] || []).filter((m) => m[1] === st); const h = list.reduce((x, m) => x + byId[m[0]].hours, 0); const nm = canMand ? list.filter((m) => m[2] === 'mandatory').length : 0;
          const on = a[0] === audKey && s.mapStage === st; const k = Math.min(list.length, 4);
          return {
            stage: st, label: list.length ? String(list.length) : '—', sub: list.length ? Math.round(h) + ' h' : '', bg: list.length ? 'rgba(134,188,37,' + (0.14 + k * 0.14).toFixed(2) + ')' : '#fafbf8',
            fg: list.length ? '#10180a' : '#b3b8ae', bd: on ? '#1a1d18' : '#eef0ea', ring: on ? '0 0 0 3px rgba(134,188,37,.45)' : 'none',
            tip: a[1] + ' · ' + st + ' · ' + list.length + ' learnings' + (nm ? ' · ' + nm + ' mandatory' : '') + ' · ' + this.reachAt(a[0], st) + ' people', pick: pick(a[0], st),
          };
        }),
      };
    });
    const mkDrag = (lid: string) => (e: DragEvent) => { this.refs.drag.current = lid; try { e.dataTransfer.setData('text/plain', lid); e.dataTransfer.effectAllowed = 'move'; } catch { /* ignore */ } };
    const palette = items.filter((it) => !mappedIds.includes(it.id)).map((it) => ({ id: it.id, title: it.title, sub: it.domLabel + ' · L' + it.lvl + ' · ' + it.hoursLabel, onDragStart: mkDrag(it.id) }));
    const dropA = (lid: string, st: string) => {
      const c = map.find((m) => m[0] === lid); this.refs.drag.current = null;
      if (c && c[1] === st) { this.setState({ overStage: null }); return; }
      this.applyOps([{ op: 'add', aud: audKey, lid, stage: st, ob: c ? c[2] : 'advised' }], 'Mapped to ' + ai.name + ' · ' + st + ' · publish to apply'); this.setState({ overStage: null });
    };
    const otherAuds = (lid: string) => Object.keys(maps).filter((k) => AUD_INFO[k] && k !== audKey && maps[k].some((x) => x[0] === lid));
    const stageCols = STAGES.map((st) => {
      const list = map.filter((m) => m[1] === st); const mand = list.filter((m) => m[2] === 'mandatory').length; const hrs = list.reduce((a, m) => a + byId[m[0]].hours, 0); const over = s.overStage === st;
      return {
        name: st, summary: list.length + ' learnings' + (canMand ? ' · ' + mand + ' mandatory' : '') + ' · ' + Math.round(hrs) + ' h · ' + this.reachAt(audKey, st) + ' people',
        bg: over ? '#fbfdf6' : '#fff', bd: over ? '#86BC25' : '#e1e5dc', bdStyle: over ? 'dashed' : 'solid', ring: s.mapStage === st ? '0 0 0 3px rgba(134,188,37,.45)' : 'none',
        items: list.map((m) => {
          const it = byId[m[0]]; const isSel = s.mapSel === m[0]; const dim = !!s.mapSel && !isSel && !!byId[s.mapSel] && byId[s.mapSel].dom !== it.dom; const also = otherAuds(m[0]).length; const isMand = canMand && m[2] === 'mandatory';
          return {
            id: it.id, title: it.title, sub: it.domLabel + ' · L' + it.lvl + ' · ' + it.hoursLabel + (also ? ' · +' + also + ' audience' + (also > 1 ? 's' : '') : ''), isMand, pending: !!s.pending[audKey + '|' + m[0]], bg: isMand ? '#f7f7f5' : '#fff',
            border: isSel ? '2px solid #1a1d18' : canMand ? '1px solid #c8cdc3' : '1px dashed ' + L[2], shadow: isSel ? '0 0 0 3px rgba(134,188,37,.45)' : 'none', op: dim ? 0.45 : 1, onDragStart: mkDrag(it.id),
            onClick: () => this.setState({ mapSel: isSel ? null : m[0] }),
          };
        }),
        onDragOver: (e: DragEvent) => { e.preventDefault(); if (this.state.overStage !== st) this.setState({ overStage: st }); },
        onDragLeave: () => { if (this.state.overStage === st) this.setState({ overStage: null }); },
        onDrop: (e: DragEvent) => { e.preventDefault(); const lid = this.refs.drag.current || e.dataTransfer.getData('text/plain'); if (lid) dropA(lid, st); },
      };
    });
    const msM = s.mapSel ? map.find((m) => m[0] === s.mapSel) : null; const msIt = msM ? byId[msM[0]] : null;
    const ms = msM && msIt ? {
      title: msIt.title, sub: L[1] + ' · ' + ai.name + ' · ' + msM[1] + ' · ' + msIt.domLabel + ' · ' + msIt.lvlLabel + ' · ' + msIt.hoursLabel, ob: msM[2], canMand,
      setOb: (v: string) => this.applyOps([{ op: 'setOb', aud: audKey, lid: msM[0], stage: msM[1], ob: v }], 'Now ' + v + ' for ' + ai.name + ' · publish to apply'),
      touch: canMand
        ? 'Reaches ' + this.reachAt(audKey, msM[1]) + ' people at ' + msM[1] + ' in ' + ai.name + '. ' + (msM[2] === 'mandatory' ? 'It joins their mandatory items and counts toward readiness.' : 'Advised items appear dashed on their maps; nobody is chased.')
        : 'Reaches up to ' + this.reachAt(audKey, msM[1]) + ' people at ' + msM[1] + ' who ' + (lens === 'amb' ? 'saved this ambition' : 'shared this profile') + '. It shows in their ' + (lens === 'amb' ? 'ambitions' : 'personality') + ' cloud as a suggestion and never counts toward readiness.',
      also: (() => {
        const r = otherAuds(msM[0]).map((k) => { const m = maps[k].find((x) => x[0] === msM[0])!; const Lk = lensOf(k); return { color: Lk[2], text: Lk[1] + ' · ' + AUD_INFO[k].name + ' · ' + m[1] + ' · ' + (Lk[3] ? m[2] : 'suggested') }; });
        return r.length ? r : [{ color: '#d5dacf', text: 'No other audience' }];
      })(),
      rulePlain: L[1] + ' is ' + ai.name + ' and stage is ' + msM[1] + ' → ' + (canMand ? (msM[2] === 'mandatory' ? 'mandatory before the next promotion review' : 'advised, no deadline') : 'suggested in their cloud, never required'),
      ruleExpr: L[6] + ' == "' + ai.name + '" && stage == "' + msM[1] + '" → ' + (canMand ? msM[2] : 'suggest') + '(' + msM[0] + ')',
      remove: () => { this.applyOps([{ op: 'remove', aud: audKey, lid: msM[0] }], 'Removed from ' + ai.name + ' · publish to apply'); this.setState({ mapSel: null }); },
      openLib: () => this.openDetail(msM[0], 'adminMap'),
    } : null;
    const me = this.mePersona(); const mine = this.stack(me);
    const sigCards = sigOpen.map((g, i) => {
      const it = byId[g.op.lid], an = AUD_INFO[g.op.aud].name, reach = this.reachAt(g.op.aud, g.op.stage);
      return {
        id: g.id, kind: g.kind, st: g.st, where: lensOf(g.op.aud)[1] + ' · ' + an + (g.op.stage ? ' · ' + g.op.stage : ''), delay: (i * 60) + 'ms', hasQuote: !!g.quote, quote: g.quote,
        title: g.op.op === 'add' ? 'Add “' + it.title + '”' : g.op.op === 'remove' ? 'Remove “' + it.title + '”' : 'Make “' + it.title + '” ' + g.op.ob,
        evidence: g.evidence.replace('{mand}', String(Math.round(mine.mand))),
        impact: g.op.op === 'remove' ? 'Removes a duplicate for ' + reach + ' people' : g.op.op === 'setOb' ? 'Frees ' + it.hours + ' mandatory h for ' + reach + ' people' : 'Reaches ' + reach + ' people · +' + it.hours + ' h each',
        apply: () => {
          this.applyOps([g.op], 'Applied · ' + an + ' · publish to apply');
          this.setState((st) => ({ sigDone: { ...st.sigDone, [g.id]: true }, mapLens: AUD_INFO[g.op.aud].lens, mapAud: g.op.aud, mapStage: g.op.stage || null, mapSel: null }));
        },
        dismiss: () => this.setState((st) => ({ sigDone: { ...st.sigDone, [g.id]: true } })),
      };
    });
    const P = me; const stk = this.stack(P); const scale = Math.max(80, stk.tot);
    const pz = {
      name: P[2], stage: P[3], tags: stk.layers.map((l) => ({ key: l.lens, label: l.aud, color: l.color })),
      segs: stk.layers.filter((l) => l.h > 0).map((l) => ({ key: l.lens, w: (l.h / scale * 100).toFixed(2) + '%', color: l.color, tip: l.lens + ' · ' + l.aud + ' · ' + Math.round(l.h) + ' h' })),
      budgetX: 'calc(' + (80 / scale * 100).toFixed(2) + '% - 1px)', totLabel: Math.round(stk.tot) + ' h of 80 h', totFg: stk.tot > 80 ? '#9a2b22' : '#1a1d18',
      mandLabel: Math.round(stk.mand) + ' h of 40 h budget', mandW: Math.min(100, stk.mand / 40 * 100).toFixed(1) + '%', mandColor: stk.mand > 40 ? '#9a2b22' : '#1a1d18', mandFg: stk.mand > 40 ? '#9a2b22' : '#1a1d18',
      layers: stk.layers.map((l) => ({ key: l.lens, lens: l.lens, color: l.color, aud: l.aud, meta: l.n ? l.n + ' learning' + (l.n > 1 ? 's' : '') + ' · ' + Math.round(l.h) + ' h' : 'Nothing at ' + P[3] })),
      hasDup: stk.dups.length > 0, dupText: stk.dups.map((d) => d.title + ' via ' + d.via.join(' and ')).join('; ') + '. Counted once.',
    };
    const rd = s.reads[P[0]];
    const cpOpsP = s.cpOpsP || [];
    const cpOps = cpOpsP.map((o) => ({
      verb: o.op === 'add' ? 'Add' : o.op === 'remove' ? 'Remove' : 'Make ' + o.ob,
      text: '“' + LEARN_BY[o.lid][1] + '” ' + (o.op === 'remove' ? 'from ' : '→ ') + AUD_INFO[o.aud].name + (o.stage && o.op !== 'remove' ? ' · ' + o.stage : '') + (o.op === 'add' ? ' · ' + o.ob : ''),
    }));
    return {
      editable, readOnlyNote: editable ? '' : 'Read-only: you administer ' + this.access.domains.join(', ') + '. Only a System Admin edits ' + ai.name + '.',
      mapLens: lens, lensOptions: LENSES.map((l) => opt(l[0], l[1])), setLens: (v: string) => this.setState({ mapLens: v, mapAud: null, mapStage: null, mapSel: null }),
      lensLabel: L[1], lensColor: L[2], lensRule: L[4], lensPolicy: L[5], audName: ai.name, audSummary: map.length + ' learnings · ' + ai.reach + ' people',
      audChips: auds.map((a) => ({ key: a[0], label: a[1], reach: String(a[2]), on: a[0] === audKey, pick: pick(a[0]) })),
      stageShort: STG_SHORT, covRows,
      palette, paletteCount: palette.length, paletteOver: (e: DragEvent) => e.preventDefault(),
      paletteDrop: (e: DragEvent) => {
        e.preventDefault(); const lid = this.refs.drag.current || e.dataTransfer.getData('text/plain'); this.refs.drag.current = null;
        if (lid && mappedIds.includes(lid)) this.applyOps([{ op: 'remove', aud: audKey, lid }], 'Removed from ' + ai.name + ' · publish to apply');
      },
      stageCols, ms, clearMapSel: () => this.setState({ mapSel: null }),
      sigCards, sigCount: String(sigCards.length), noSig: sigCards.length === 0,
      cpInput: s.cpInput, setCpInput: (e: ChangeEvent<HTMLInputElement>) => this.setState({ cpInput: e.target.value }),
      cpKey: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') this.askCp(s.cpInput); }, cpSend: () => this.askCp(s.cpInput), cpBusy: s.cpBusy,
      cpHasReply: !!s.cpReply, cpReply: s.cpReply, cpHasOps: cpOps.length > 0, cpOps,
      cpApply: () => { const n = cpOpsP.length; this.applyOps(cpOpsP, n + ' change' + (n > 1 ? 's' : '') + ' applied · publish to apply'); this.setState({ cpOpsP: null }); }, cpDrop: () => this.setState({ cpOpsP: null }),
      cpPrompts: ['What do Energy seniors still miss?', 'Where does a learning arrive twice?', 'Draft a path for the Business developer ambition'].map((l) => ({ label: l, send: () => this.askCp(l) })),
      pz,
      readAs: () => this.readAs(P, stk), readBusy: s.readBusy, readLabel: s.readBusy ? 'Reading the stack' : 'Read it as ' + P[1], read: rd || null, readHead: 'As ' + P[2] + ' would read it',
    };
  }
}

export type Item = ReturnType<Logic['item']>;
export type Cloud = ReturnType<Logic['clouds']>[number];
export type VM = ReturnType<Logic['renderVals']>;
type Stack = ReturnType<Logic['stack']>;
