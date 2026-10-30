// View-model for MyProfessionalMe. A close port of the prototype's DCLogic class: `renderVals()` derives
// everything the screens render from AppState, and the action methods patch state the same way the prototype did.
import type { ChangeEvent, DragEvent, KeyboardEvent, RefObject } from 'react';
import {
  AMB0, AV_SWATCHES, BLS, CLOUD_META, CUR, DOMAINS, FILL, HEAT, IMPORT_RESULTS, INT0, KEYWORDS, LEARN, LEVELS, MAPS0, MY_STAGE, OB_LABEL, OB_TONE,
  OUTCOMES, PROGRAM_OF, PROGRAMS, PROJECTS, PUB, STAGES, STATE_LABEL, TARGET, TEAM, TESTS,
} from './data';
import type { Config } from './config';
import type { AppState, AvatarState, ChatMsg, CloudKey, Learn, Proposal, Screen } from './types';

const AVATAR_KEY = 'mpm-avatar';
const opt = (v: string, l: string) => ({ value: v, label: l });

type Evidence = { id: string; text: string; src: string };
type ChatReply = { reply: string; interests?: { label: string; domain: string }[]; ambition?: Proposal['ambition'] };

export function initState(cfg: Config): AppState {
  let avatar: AvatarState = { initials: 'LM', bg: '#1a1d18', photo: null };
  try { avatar = Object.assign(avatar, JSON.parse(localStorage.getItem(AVATAR_KEY) || '{}')); } catch { /* keep default */ }
  return {
    screen: cfg.startScreen, view: cfg.homeView, sel: null, detailId: null, origin: 'library',
    chosen: ['L9', 'L14', 'L26'], states: {}, pcts: {},
    libQ: '', libOb: 'all', libLevel: '0', libFormat: 'all', libDom: 'all',
    teamTab: 'roster', adminQ: '', adminStatus: 'all', drawerOpen: false, importQ: '',
    blState: null, maps: JSON.parse(JSON.stringify(MAPS0)), pending: {}, mapSel: null, overStage: null,
    toast: null, noteOpen: false, myRating: '4',
    projSel: 'P2', clouds: { proj: true, pers: true, amb: true }, share: { T1: 'thomas', T2: 'me', T3: 'thomas' },
    ambitions: AMB0.slice(), interests: INT0.slice(), chatInput: '', chatBusy: false, proposal: null,
    avatar,
    chat: [{ role: 'assistant', text: 'I help you put your interests and ambitions into words. Nothing is saved until you confirm it. You have two ambitions and three interests on file. What kind of work gave you the most energy this year?' }],
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
  readonly refs: Refs;
  readonly setState: SetState;
  constructor(state: AppState, setState: SetState, props: Config, refs: Refs) {
    this.state = state; this.setState = setState; this.props = props; this.refs = refs;
  }

  setAvatar(patch: Partial<AvatarState>) {
    const avatar = Object.assign({}, this.state.avatar, patch); this.setState({ avatar });
    try { localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar)); } catch { this.say('Photo too large to keep after reload'); }
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
  bl() { return this.state.blState || this.props.businessLine || 'Consulting'; }
  say(msg: string) {
    clearTimeout(this.refs.toastTimer.current); this.setState({ toast: msg });
    this.refs.toastTimer.current = window.setTimeout(() => this.setState({ toast: null }), 2800);
  }
  mapping(id: string) { const m = this.state.maps[this.bl()].find((x) => x[0] === id); return m ? { stage: m[1], ob: m[2], si: STAGES.indexOf(m[1]) } : null; }
  obFor(id: string) {
    const m = this.mapping(id);
    if (m && m.si <= MY_STAGE + 1) return m.ob;
    return this.state.chosen.includes(id) ? 'chosen' : 'open';
  }
  item(row: Learn) {
    const [id, title, dom, lvl, format, source, hours, cpd, state0, pct0, due, why] = row;
    const state = this.state.states[id] || state0; const pct = this.state.pcts[id] != null ? this.state.pcts[id] : (state === 'accepted' || state === 'submitted' ? 100 : pct0);
    const ob = this.obFor(id); const m = this.mapping(id); const di = DOMAINS.findIndex((d) => d[0] === dom);
    const hasDue = ob === 'mandatory' && !!due; const dueSoon = due === '30 Nov 2026';
    const hoursLabel = (hours % 1 ? hours.toFixed(1) : hours) + ' h';
    return {
      id, title, dom, di, domLabel: DOMAINS[di][1], lvl, lvlLabel: LEVELS[lvl - 1] + ' · L' + lvl, format, source, hours, hoursLabel, cpd, state, pct,
      stateLabel: state === 'in-progress' ? 'In progress · ' + pct + '%' : STATE_LABEL[state], stateIcon: state === 'accepted' ? 'check' : 'dot',
      ob, obTone: OB_TONE[ob], obLabel: OB_LABEL[ob], isMandatory: ob === 'mandatory', due, hasDue,
      dueLabel: hasDue ? 'Due ' + due : (m && m.si <= MY_STAGE + 1 ? 'By ' + m.stage + ' stage' : ''), dueColor: hasDue ? (dueSoon ? '#9a3d0c' : '#7a5000') : '#8b918a',
      meta: source + ' · ' + hoursLabel + ' · ' + LEVELS[lvl - 1] + ' · L' + lvl + (cpd ? ' · ' + cpd + ' CPD' : ''),
      why: why || (m ? (ob === 'mandatory' ? 'Mandatory' : ob === 'advised' ? 'Advised' : 'Mapped') + ' for the ' + m.stage + ' stage in ' + this.bl() + '. ' : '')
        + (ob === 'open' ? 'Not on any ' + this.bl() + ' path at your stage. Add it if it serves where you want to go; it still counts toward your hours and levels.' : 'Thomas can tell you how it fits your next engagement.'),
      stage: m ? m.stage : null, mapped: m,
      open: () => this.openDetail(id, (['map', 'projects', 'profile'] as Screen[]).includes(this.state.screen) ? this.state.screen : 'library'),
    };
  }
  items() { return LEARN.map((r) => this.item(r)); }
  openDetail(id: string, origin?: Screen) { this.setState({ screen: 'detail', detailId: id, origin: origin || 'library', noteOpen: false }); window.scrollTo(0, 0); }
  go(screen: Screen) { this.setState({ screen, sel: null, mapSel: null }); window.scrollTo(0, 0); }
  progressHours(it: Item) { return it.state === 'accepted' || it.state === 'submitted' ? it.hours : it.state === 'in-progress' ? it.hours * it.pct / 100 : 0; }
  readiness(items: Item[]) {
    const rel = items.filter((it) => it.mapped && it.mapped.si <= MY_STAGE + 1 && (it.ob === 'mandatory' || it.ob === 'advised'));
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
    s.ambitions.forEach((a) => (a.ids || pick(a.doms)).forEach((id) => { if (seen.has(id) || !byId[id]) return; seen.add(id); amb.push({ id, src: 'Ambition · ' + a.text, text: 'Builds ' + byId[id].domLabel.toLowerCase() + ', which this ambition depends on.' }); }));
    s.interests.forEach((i) => (i.ids || pick([i.dom])).forEach((id) => { if (seen.has(id) || !byId[id]) return; seen.add(id); amb.push({ id, src: 'Interest · ' + i.label, text: 'Matches an interest you named.' }); }));
    return [mk('proj', proj), mk('pers', pers), mk('amb', amb)];
  }
  constellation(items: Item[], clouds: Cloud[]) {
    const cx = 540, cy = 330, rx = 272, ry = 186, sel = this.state.sel;
    const cs = sel && sel.type === 'cloud' ? clouds.find((x) => x.key === sel.id) : null;
    const edges: { x1: number; y1: number; x2: number; y2: number; stroke: string; w: number; op: number }[] = [];
    const hubs: { delay: string; id: string; x: number; y: number; xP: string; yP: string; lxP: string; lyP: string; tf: string; ta: 'left' | 'right' | 'center'; label: string; cur: string; lvl: string; stroke: string; sw: number; op: number; onClick: () => void }[] = [];
    const nodes: { delay: string; id: string; x: number; y: number; r: number; ring: number; ringOp: number; fill: string; stroke: string; sw: number; dash: string; op: number; title: string; onClick: () => void }[] = [];
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
          delay: (i * 70 + 180 + j * 30) + 'ms', id: it.id, x, y, r, ring: r + 3, ringOp: isSel ? 1 : 0, fill: FILL[it.state],
          stroke: it.ob === 'mandatory' ? '#1a1d18' : it.ob === 'advised' ? '#1a1d18' : it.ob === 'chosen' ? '#4c7a10' : '#b3b8ae',
          sw: it.ob === 'mandatory' ? 2 : it.ob === 'advised' ? 1.3 : 1, dash: it.ob === 'advised' ? '3 2' : 'none',
          op: rel ? 1 : 0.3, title: it.title + ' · ' + it.meta, onClick: () => this.setState({ sel: { type: 'node', id: it.id, dom: d[0] } }),
        });
      });
      const lx = p.x + 96 * Math.cos(p.a), ly = p.y + 96 * Math.sin(p.a); const anchor = this.anchorFor(p.a);
      hubs.push({
        delay: (i * 70) + 'ms', id: d[0], x: p.x, y: p.y, xP: this.pct(p.x, 1080), yP: this.pct(p.y, 660), lxP: this.pct(lx, 1080), lyP: this.pct(ly, 660), tf: this.tfFor(anchor), ta: this.taFor(anchor),
        label: d[1], cur: 'L' + CUR[i], lvl: LEVELS[CUR[i] - 1] + ' → L' + TARGET[i] + ' at Manager',
        stroke: hubSel ? '#1a1d18' : '#c8cdc3', sw: hubSel ? 2 : 1.3, op: hubRel ? 1 : 0.3, onClick: () => this.setState({ sel: { type: 'hub', id: d[0] } }),
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
      return { x: p.x, y: p.y, lxP: this.pct(l.x, 1080), lyP: this.pct(l.y + 6, 560), tf: this.tfFor(anchor), ta: this.taFor(anchor), label: d[1], sub: 'L' + CUR[i] + ' of L' + TARGET[i] };
    });
    const cur = DOMAINS.map((_d, i) => pt(i, CUR[i])), tgt = DOMAINS.map((_d, i) => pt(i, TARGET[i]));
    const gaps = DOMAINS.map((_d, i) => TARGET[i] - CUR[i]); const big = gaps.map((g, i) => [g, i]).filter((x) => x[0] >= 2).map((x) => DOMAINS[x[1]][1]);
    const sel = this.state.sel;
    const rc = clouds.filter((x) => x.on).map((x, k) => ({
      key: x.key, delay: (0.25 + k * 0.12) + 's, ' + (1.2 + k * 1.5) + 's', color: x.color, wash: x.wash, fo: sel && sel.type === 'cloud' && sel.id === x.key ? 0.22 : 0.08, legend: x.long,
      points: DOMAINS.map((d, i) => pt(i, Math.min(5, CUR[i] + (x.w[d[0]] ? Math.min(2, x.w[d[0]]) : 0))).join(',')).join(' '),
      select: () => this.setState({ sel: { type: 'cloud', id: x.key } }),
    }));
    return {
      clouds: rc, rings, axes, cur: cur.map((p) => p.join(',')).join(' '), target: tgt.map((p) => p.join(',')).join(' '), dots: cur.map((p, k) => ({ x: p[0], y: p[1], delay: (450 + k * 45) + 'ms' })),
      gapText: 'Largest gaps: ' + (big.length ? big.join(', ') : 'none') + ' · ' + gaps.filter((g) => g <= 0).length + ' of 9 domains already at the Manager level',
    };
  }
  road(items: Item[], clouds: Cloud[]) {
    const DUE_Q: Record<string, number> = { '30 Nov 2026': 0, 'Jan 2027': 1, 'Mar 2027': 1, 'Jun 2027': 2 };
    type RoadItem = { id: string; title: string; sub: string; ringCss: string; onClick: () => void; delay?: string };
    const cols = ['Q4 2026', 'Q1 2027', 'Q2 2027', 'Q3 2027'].map((label) => ({ label, items: [] as RoadItem[], count: '' }));
    const upcoming = items.filter((it) => it.state !== 'accepted' && it.state !== 'submitted' && it.state !== 'in-progress' && (it.ob === 'mandatory' || it.ob === 'advised'))
      .sort((a, b) => (a.ob === 'mandatory' ? 0 : 1) - (b.ob === 'mandatory' ? 0 : 1));
    let free = 0;
    upcoming.forEach((it) => {
      const q = it.hasDue ? DUE_Q[it.due] : (free++ % 4);
      cols[q].items.push({ id: it.id, title: it.title, sub: (it.hasDue ? 'Due ' + it.due : 'Advised · ' + it.stage) + ' · ' + it.hoursLabel, ringCss: it.ob === 'mandatory' ? '2px solid #1a1d18' : '1.5px dashed #1a1d18', onClick: it.open });
    });
    cols.forEach((c) => { c.count = c.items.length ? c.items.length + (c.items.length === 1 ? ' item' : ' items') : 'nothing due'; });
    const firmIds = upcoming.map((it) => it.id), byId: Record<string, Item> = {}; items.forEach((it) => { byId[it.id] = it; });
    const quarters = cols.map((c) => c.label);
    const lanes: { key: string; label: string; sub: string; color: string; cells: { items: RoadItem[] }[]; select: () => void; delay?: string }[] = [
      { key: 'firm', label: 'Firm path to Manager', sub: upcoming.length + ' learnings · mandatory and advised · review Sep 2027', color: '#1a1d18', cells: cols.map((c) => ({ items: c.items })), select: () => this.setState({ sel: null }) },
    ];
    clouds.filter((x) => x.on).forEach((x) => {
      const cells = quarters.map(() => ({ items: [] as RoadItem[] }));
      const list = x.ids.map((id) => byId[id]).filter((it) => it && it.state !== 'accepted' && it.state !== 'submitted')
        .sort((a, b) => Number(b.state === 'in-progress') - Number(a.state === 'in-progress') || a.lvl - b.lvl);
      list.forEach((it, k) => {
        const q = it.state === 'in-progress' ? 0 : it.hasDue ? DUE_Q[it.due] : Math.min(3, Math.floor(k * 4 / list.length));
        cells[q].items.push({ id: it.id, title: it.title, sub: (it.state === 'in-progress' ? it.stateLabel : it.obLabel) + ' · ' + it.hoursLabel + (firmIds.includes(it.id) ? ' · also on firm path' : ''), ringCss: '1.5px dashed ' + x.color, onClick: it.open });
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
    const s = this.state, bl = this.bl(), items = this.items();
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
    const myLvl = CUR[d0.di];
    const sugg: { src: string; text: string; color: string }[] = [];
    clouds.forEach((cl) => cl.evidence.forEach((e) => { if (e.id === d0.id) sugg.push({ src: e.src, text: e.text, color: cl.color }); }));
    let paths = BLS.map((b) => { const m = s.maps[b].find((x) => x[0] === d0.id); return m ? { bl: b, stage: m[1], ob: OB_LABEL[m[2]] } : null; })
      .filter((x): x is { bl: string; stage: string; ob: string } => !!x);
    if (!paths.length) paths = [{ bl: 'No path', stage: 'open to everyone', ob: '' }];
    const det = {
      ...d0,
      outcomes: OUTCOMES[d0.dom].map((t) => ({ t })),
      levelSub: LEVELS[d0.lvl - 1] + ' · L' + d0.lvl + ' in ' + d0.domLabel + '. You are at L' + myLvl + '; Manager expects L' + TARGET[d0.di] + '.',
      ladder: LEVELS.map((lab, i) => {
        const n = i + 1; const isThis = n === d0.lvl, mine = n <= myLvl, tgt = n === TARGET[d0.di];
        return { n, label: lab, note: isThis ? 'This learning' : tgt ? 'Manager' : mine ? 'Reached' : '', bg: isThis ? '#1a1d18' : mine ? '#eef7dc' : '#fff', fg: isThis ? '#fff' : mine ? '#3f6a0a' : '#8b918a', bd: isThis ? '#1a1d18' : tgt ? '#1a1d18' : mine ? '#c9e39a' : '#e1e5dc' };
      }),
      rating: 'Rated 4.6 by 38 colleagues · 2 notes',
      notes: [
        { initials: 'YD', who: 'Yusuf Demir · Consultant · 2 Oct 2026', text: 'Dense but worth it. Do the exercises on a live client file rather than the sample data.' },
        { initials: 'TD', who: 'Thomas De Smet · Senior manager · 19 Aug 2026', text: 'If you did the classroom version as a Consultant, skip the first module and go straight to the case.' },
      ],
      frac: d0.pct / 100, hoursDone: (Math.round(d0.hours * d0.pct / 100 * 10) / 10) + ' h', hoursText: 'logged of ' + d0.hoursLabel,
      kv: [{ k: 'Format', v: d0.format }, { k: 'Source', v: d0.source }, { k: 'Effort', v: d0.hoursLabel }, { k: 'Level', v: d0.lvlLabel }, { k: 'CPD units', v: d0.cpd ? d0.cpd + ' · ACCA, ITAA' : 'None' }, { k: 'Deadline', v: d0.hasDue ? d0.due : 'None set' }, { k: 'Counts toward', v: d0.domLabel + ' · hours' }],
      canAdd: d0.ob === 'open', canLog: d0.state === 'not-started' || d0.state === 'in-progress',
      canAsk: d0.state === 'in-progress',
      approvalNote: d0.ob === 'mandatory' ? 'Mandatory items complete only after Thomas accepts your evidence.' : d0.ob === 'open' ? 'Open items need no approval. Adding one tells Thomas what you are curious about.' : 'Completion is logged automatically by ' + d0.source + ' where connected.',
      paths, sugg, hasSugg: sugg.length > 0, suggSub: 'Your evaluations, profiles and ambitions point here',
    };
    if (d0.ob === 'open' && det.hasSugg) det.why = det.sugg[0].text + ' Suggested by ' + det.sugg[0].src + '. Not on a ' + bl + ' path at your stage; it counts toward your hours and levels once added.';

    // team
    const team = TEAM.map((p) => {
      const [initials, name, grade, ready, hours, overdue, lv, last] = p;
      return {
        initials, name, grade, readiness: ready, readinessLabel: ready + '%', barW: ready + '%', hours, last,
        mandStatus: overdue ? 'clarification' : 'accepted', mandLabel: overdue ? overdue + ' overdue' : 'On track', mandIcon: overdue ? 'dot' : 'check',
        cells: lv.map((v, i) => ({ v: 'L' + v, bg: HEAT[v], fg: v >= 4 ? '#fff' : v >= 2 ? '#1a1d18' : '#5a6058', overdue: overdue > 0 && i === 5, title: DOMAINS[i][1] + ' · L' + v })),
        open: () => this.say('Prototype: opens ' + name.split(' ')[0] + '’s growth map in counsellor mode · read-only, with your notes'),
      };
    });
    const teamOverdue = TEAM.filter((p) => p[5] > 0).length;

    // admin library
    const aq = s.adminQ.toLowerCase();
    const adminRows = items.filter((it) => (!aq || (it.title + ' ' + it.source).toLowerCase().includes(aq)) && (s.adminStatus === 'all' || (PUB[it.id] ? PUB[it.id][1] : 'Published') === s.adminStatus))
      .map((it) => {
        const ps = BLS.map((b) => { const m = s.maps[b].find((x) => x[0] === it.id); return m ? b + ' · ' + m[1] : null; }).filter(Boolean);
        return { ...it, effort: it.hoursLabel + (it.cpd ? ' · ' + it.cpd + ' CPD' : ''), paths: ps.length ? ps.join(' · ') : 'Not on a path', pubStatus: PUB[it.id] ? PUB[it.id][0] : 'accepted', pubLabel: PUB[it.id] ? PUB[it.id][1] : 'Published',
          edit: () => this.say('Prototype: edit form opens for “' + it.title + '” · changes are logged with your name and time') };
      });
    const programs = PROGRAMS.map((p) => ({ name: p[0], sync: p[1], dot: p[2], count: LEARN.filter((l) => PROGRAM_OF[l[5]] === p[0]).length }));

    // admin mapping
    const map = s.maps[bl]; const mappedIds = map.map((m) => m[0]);
    const mkDrag = (lid: string) => (e: DragEvent) => { this.refs.drag.current = lid; try { e.dataTransfer.setData('text/plain', lid); e.dataTransfer.effectAllowed = 'move'; } catch { /* ignore */ } };
    const palette = items.filter((it) => !mappedIds.includes(it.id)).map((it) => ({ id: it.id, title: it.title, sub: it.domLabel + ' · L' + it.lvl + ' · ' + it.hoursLabel, onDragStart: mkDrag(it.id) }));
    const headcount: Record<string, number> = { Analyst: 96, Consultant: 128, 'Senior consultant': 142, Manager: 88, 'Senior manager': 54 };
    const stageCols = STAGES.map((st) => {
      const list = map.filter((m) => m[1] === st); const mand = list.filter((m) => m[2] === 'mandatory').length; const hrs = list.reduce((a, m) => a + byId[m[0]].hours, 0);
      const over = s.overStage === st;
      return {
        name: st, summary: list.length + ' learnings · ' + mand + ' mandatory · ' + Math.round(hrs) + ' h', bg: over ? '#fbfdf6' : '#fff', bd: over ? '#86BC25' : '#e1e5dc', bdStyle: over ? 'dashed' : 'solid',
        items: list.map((m) => {
          const it = byId[m[0]]; const isSel = s.mapSel === m[0]; const dim = !!s.mapSel && !isSel && byId[s.mapSel].dom !== it.dom;
          return {
            id: it.id, title: it.title, sub: it.domLabel + ' · L' + it.lvl + ' · ' + it.hoursLabel, isMand: m[2] === 'mandatory', pending: !!s.pending[m[0]], bg: m[2] === 'mandatory' ? '#f7f7f5' : '#fff',
            border: (isSel ? '2px solid #1a1d18' : '1px solid #c8cdc3'), shadow: isSel ? '0 0 0 3px rgba(134,188,37,.45)' : 'none', op: dim ? 0.45 : 1, onDragStart: mkDrag(it.id),
            onClick: () => this.setState({ mapSel: isSel ? null : m[0] }),
          };
        }),
        onDragOver: (e: DragEvent) => { e.preventDefault(); if (s.overStage !== st) this.setState({ overStage: st }); },
        onDragLeave: () => { if (s.overStage === st) this.setState({ overStage: null }); },
        onDrop: (e: DragEvent) => { e.preventDefault(); const lid = this.refs.drag.current || e.dataTransfer.getData('text/plain'); if (!lid) return; this.dropOn(lid, st); },
      };
    });
    const msM = s.mapSel ? map.find((m) => m[0] === s.mapSel) : null; const msIt = msM ? byId[msM[0]] : null;
    const ms = msM && msIt ? {
      title: msIt.title, sub: bl + ' · ' + msM[1] + ' stage · ' + msIt.domLabel + ' · ' + msIt.lvlLabel + ' · ' + msIt.hoursLabel, ob: msM[2],
      setOb: (v: string) => this.setMapping(msM[0], msM[1], v),
      touch: 'Touches ' + headcount[msM[1]] + ' people at ' + msM[1] + ' in ' + bl + (msM[2] === 'mandatory' ? ', plus everyone above who has not completed it yet.' : '. Advised items appear dashed on their maps; nobody is chased.'),
      ns: Math.round(headcount[msM[1]] * 0.27) + ' not started', ip: Math.round(headcount[msM[1]] * 0.43) + ' in flight', dn: Math.round(headcount[msM[1]] * 0.30) + ' done',
      rulePlain: 'Business line is ' + bl + ' and stage is ' + msM[1] + (msM[2] === 'mandatory' ? ' → mandatory before the next promotion review' : ' → advised, no deadline'),
      ruleExpr: 'bl == "' + bl + '" && stage >= "' + msM[1] + '" → ' + msM[2] + '(' + msM[0] + ')',
      remove: () => {
        const maps = Object.assign({}, s.maps); maps[bl] = map.filter((m) => m[0] !== msM[0]); const pending = Object.assign({}, s.pending); pending[msM[0]] = true;
        this.setState({ maps, pending, mapSel: null }); this.say('Removed from the ' + msM[1] + ' path · publish to apply');
      },
      openLib: () => this.openDetail(msM[0], 'adminMap'),
    } : null;
    const pendingN = Object.keys(s.pending).length;

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
    const p0 = PROJECTS.find((p) => p.id === s.projSel) || PROJECTS[0];
    const projList = PROJECTS.map((p) => {
      const on = p.id === p0.id;
      return { id: p.id, client: p.client, period: p.period, name: p.name, role: p.role, st: p.dims ? 'accepted' : 'in-progress', stLabel: p.dims ? p.overall.replace(' expectations', '') : 'Evaluation pending', stIcon: p.dims ? 'check' : 'dot',
        bd: on ? '#1a1d18' : '#e1e5dc', ring: on ? '0 0 0 3px rgba(134,188,37,.45)' : 'none', open: () => this.setState({ projSel: p.id }) };
    });
    const pr = {
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
      setShare: (v: string) => { this.setState((st) => ({ share: Object.assign({}, st.share, { [t.id]: v }) })); this.say(v === 'thomas' ? t.name + ' result shared with Thomas De Smet' : t.name + ' result is now visible to you only'); },
    }));
    const domName = (k: string) => (DOMAINS.find((d) => d[0] === k) || [k, k])[1];
    const ambitions = s.ambitions.map((a) => ({ id: a.id, text: a.text, meta: a.horizon + ' · ' + a.from, doms: a.doms.map((d) => ({ key: d, label: domName(d) })), remove: () => this.setState((st) => ({ ambitions: st.ambitions.filter((x) => x.id !== a.id) })) }));
    const interests = s.interests.map((i) => ({ label: i.label, dom: domName(i.dom), remove: () => this.setState((st) => ({ interests: st.interests.filter((x) => x.label !== i.label) })) }));
    const pp = s.proposal;
    const proposalItems = pp ? (pp.ambition ? [{ kind: 'Ambition', text: pp.ambition.text + ' · ' + (pp.ambition.horizon || '3 years') }] : []).concat(pp.interests.map((i) => ({ kind: 'Interest', text: i.label + ' · ' + domName(i.domain) }))) : [];
    const titles: Record<Screen, [string, string]> = {
      projects: ['Me · Projects & evaluations', 'Projects & evaluations'], profile: ['Me · My profile', 'My profile'], map: ['Me · Senior consultant · ' + bl, 'My growth map'], library: ['Me · Library', 'Library'],
      detail: ['Me · Library · ' + d0.domLabel, d0.title], team: ['Counsellor · 6 counsellees', 'My team'], adminLib: ['Administration · Learning library', 'Learning library'], adminMap: ['Administration · Curriculum mapping · ' + bl, 'Curriculum mapping'],
    };
    const hubDock = sel && sel.type === 'hub' ? (() => {
      const di = DOMAINS.findIndex((d) => d[0] === sel.id); const list = items.filter((it) => it.dom === sel.id);
      return { label: DOMAINS[di][1], sub: 'You are at ' + LEVELS[CUR[di] - 1] + ' · L' + CUR[di] + '. Manager in ' + bl + ' expects L' + TARGET[di] + ' · ' + list.filter((it) => it.state === 'accepted').length + ' of ' + list.length + ' completed', items: list };
    })() : null;
    const dockIt = sel && sel.type === 'node' ? byId[sel.id] : null;
    const dock = dockIt ? { ...dockIt, kv: [{ k: 'Source', v: dockIt.source }, { k: 'Effort', v: dockIt.hoursLabel }, { k: 'Level', v: dockIt.lvlLabel }, { k: 'Deadline', v: dockIt.hasDue ? dockIt.due : 'None' }], add: () => this.addToPath(dockIt.id) } : null;

    return {
      bl, readiness, readinessW: readiness + '%', readinessFrac: readiness / 100, readinessDash: (readiness / 100 * 2 * Math.PI * 38) + ' ' + (2 * Math.PI * 38),
      readinessText: 'Readiness counts hours on mandatory and advised items up to the Manager stage in ' + bl + '. Your own choices count toward levels and hours, not readiness.',
      centerSub: 'Senior consultant → Manager · ' + readiness + '% ready', hoursYear, cpdYear, hoursChip: hoursYear + ' of 80 h this year',
      mapLead: 'You sit in the middle. The nine domains around you hold every learning the firm knows about; your ' + bl + ' affiliation decides which ones are mandatory, Thomas advises some, the rest is yours to choose. Clouds show where your projects, personality and ambitions pull you.',
      crumb: titles[s.screen][0], headerTitle: titles[s.screen][1], screen: s.screen,
      navMap: s.screen === 'map' || (s.screen === 'detail' && s.origin === 'map'), navLib: s.screen === 'library' || (s.screen === 'detail' && s.origin === 'library'), navTeam: s.screen === 'team', navAdminLib: s.screen === 'adminLib', navAdminMap: s.screen === 'adminMap' || (s.screen === 'detail' && s.origin === 'adminMap'),
      navProj: s.screen === 'projects' || (s.screen === 'detail' && s.origin === 'projects'), navProfile: s.screen === 'profile' || (s.screen === 'detail' && s.origin === 'profile'),
      goMap: () => this.go('map'), goLibrary: () => this.go('library'), goTeam: () => this.go('team'), goAdminLib: () => this.go('adminLib'), goAdminMap: () => this.go('adminMap'), goProj: () => this.go('projects'), goProfile: () => this.go('profile'),
      goBack: () => this.go(s.origin), backLabel: s.origin === 'projects' ? '← Back to projects' : s.origin === 'profile' ? '← Back to my profile' : s.origin === 'map' ? '← Back to my growth map' : s.origin === 'adminMap' ? '← Back to curriculum mapping' : '← Back to library',
      libCount: String(LEARN.length), projCount: String(PROJECTS.length), teamOverdue, pendingLabel: pendingN ? pendingN + ' pending' : '', noPending: pendingN === 0,
      toastHelp: () => this.say('Prototype: opens a message to Thomas De Smet, your counsellor · he answers within two working days'),
      // map
      view: s.view, setView: (v: string) => this.setState({ view: v as AppState['view'], sel: null }), viewOptions: [opt('constellation', 'Constellation'), opt('radar', 'Radar'), opt('road', 'Road')],
      legendItems: [{ status: 'accepted' as const, label: 'Completed' }, { status: 'in-progress' as const, label: 'In progress' }, { status: 'submitted' as const, label: 'Awaiting Thomas' }, { color: '#fff', label: 'Not started' }],
      cEdges: c.edges, cHubs: c.hubs, cNodes: c.nodes, cClouds: c.clouds, clearSel: () => this.setState({ sel: null }), selectMe: () => this.setState({ sel: null, view: 'radar' }),
      rRings: r.rings, rAxes: r.axes, rCur: r.cur, rTarget: r.target, rDots: r.dots, rClouds: r.clouds, radarGapText: r.gapText,
      roadLanes: rd.lanes, roadQuarters: rd.quarters, roadInflight: rd.inflight, roadBehind: rd.behind, inflightCount: rd.inflightCount,
      cloudChips, cloudRowLabel: s.view === 'road' ? 'Paths' : 'Learning clouds', cloudRowHint: s.view === 'road' ? 'Each cloud adds its own lane next to the firm path.' : 'Click a cloud label to see what put it there.',
      cloudDock, dock, hubDock, nextUp, showStreak: this.props.showMarks !== false,
      // library
      libLead: LEARN.length + ' learnings across nine domains · 6 connected programs · levels L1 Foundation to L5 Thought leader', libQ: s.libQ, setLibQ: (e: ChangeEvent<HTMLInputElement>) => this.setState({ libQ: e.target.value }),
      obOptions: [opt('all', 'All'), opt('mandatory', 'Mandatory'), opt('advised', 'Advised'), opt('chosen', 'Chosen'), opt('open', 'Open')], libOb: s.libOb, setLibOb: (v: string) => this.setState({ libOb: v }),
      levelOptions: [opt('0', 'Any level')].concat(LEVELS.map((l, i) => opt(String(i + 1), 'L' + (i + 1) + ' · ' + l))), libLevel: s.libLevel, setLibLevel: (e: ChangeEvent<HTMLSelectElement>) => this.setState({ libLevel: e.target.value }),
      formatOptions: [opt('all', 'Any format')].concat(formats.map((f) => opt(f, f))), libFormat: s.libFormat, setLibFormat: (e: ChangeEvent<HTMLSelectElement>) => this.setState({ libFormat: e.target.value }),
      domChips, libItems, libResultText: libItems.length + ' of ' + LEARN.length + ' learnings' + (s.libOb === 'mandatory' ? ' · mandatory for ' + bl + ' up to the Manager stage' : ''),
      // detail
      det, noteOpen: s.noteOpen, toggleNote: () => this.setState({ noteOpen: !s.noteOpen }), saveNote: () => { this.setState({ noteOpen: false }); this.say('Note posted · visible to colleagues on this learning'); },
      ratingOptions: [1, 2, 3, 4, 5].map((n) => opt(String(n), String(n))), myRating: s.myRating, setRating: (v: string) => this.setState({ myRating: v }),
      addToPath: () => this.addToPath(d0.id), logHours: () => this.logHours(d0),
      askApprove: () => { const states = Object.assign({}, s.states); states[d0.id] = 'submitted'; this.setState({ states }); this.say('Sent to Thomas De Smet · he sees your evidence and the hours you logged'); },
      // projects & profile
      projLead: PROJECTS.length + ' engagements since Sep 2025 · ' + PROJECTS.filter((p) => p.dims).length + ' evaluated · synced from staffing and the performance tool. Advice from each evaluation lands in the projects cloud on your map.',
      projList, pr, requestEval: () => this.say('Prototype: sends an evaluation request through the performance tool · the evaluator is reminded after 10 days'),
      profLead: 'Profiles, ambitions and interests are yours. You decide what Thomas sees. None of this counts toward readiness; it shapes the clouds and paths on your map.',
      tests, shareOptions: [opt('me', 'Only me'), opt('thomas', 'Thomas')], addTest: () => this.say('Prototype: upload a report or enter results · Four Colours, MBTI, Big Five, DISC, Belbin team roles, Hogan'),
      ambitions, interests,
      chat: s.chat, chatBusy: s.chatBusy, chatInput: s.chatInput, setChatInput: (e: ChangeEvent<HTMLInputElement>) => this.setState({ chatInput: e.target.value }),
      chatKey: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') this.send(s.chatInput); }, sendChat: () => this.send(s.chatInput),
      chatPrompts: ['Where could I be in five years?', 'I enjoyed the energy client most', 'What do my evaluations say?'].map((l) => ({ label: l, send: () => this.send(l) })),
      chatSub: (this.props.liveAssistant === false || !window.claude?.complete ? 'Scripted assistant' : 'AI assistant') + ' · reads your projects and profiles · saves nothing until you confirm',
      hasProposal: !!pp, proposalItems, saveProposal: () => this.saveProposal(), dropProposal: () => this.setState({ proposal: null }),
      // team
      teamLead: 'Six people name you as counsellor. Readiness is measured against the next stage in ' + bl + '; mandatory items are the ones the firm chases.',
      teamTabs: [opt('roster', 'Roster'), opt('heat', 'Levels by domain')], teamTab: s.teamTab, setTeamTab: (v: string) => this.setState({ teamTab: v }), team,
      domShort: DOMAINS.map((d) => d[2]), heatTargets: [2, 2, 2, 3, 2, 2, 1, 2, 2].map((v) => 'L' + v),
      // admin library
      adminLead: LEARN.length + ' learnings · 6 connected programs · 3 need attention · last sync 28 Oct 2026 07:10', programs, adminQ: s.adminQ, setAdminQ: (e: ChangeEvent<HTMLInputElement>) => this.setState({ adminQ: e.target.value }),
      pubOptions: [opt('all', 'All'), opt('Published', 'Published'), opt('Needs review', 'Needs review'), opt('Draft', 'Draft')], adminStatus: s.adminStatus, setAdminStatus: (v: string) => this.setState({ adminStatus: v }), adminRows,
      syncNow: () => this.say('Sync started · Internal academy, Coursera / edX and Microsoft Learn · usually under a minute'),
      drawerOpen: s.drawerOpen, openDrawer: () => this.setState({ drawerOpen: true }), closeDrawer: () => this.setState({ drawerOpen: false }),
      programOptions: PROGRAMS.map((p) => opt(p[0], p[0])), importQ: s.importQ, setImportQ: (e: ChangeEvent<HTMLInputElement>) => this.setState({ importQ: e.target.value }),
      importResults: IMPORT_RESULTS.filter((ir) => !s.importQ || ir[0].toLowerCase().includes(s.importQ.toLowerCase())).map((ir) => ({ title: ir[0], sub: ir[1], import: () => { this.setState({ drawerOpen: false }); this.say('Imported “' + ir[0] + '” as a draft · map it to a path to publish'); } })),
      domainOptions: DOMAINS.map((d) => opt(d[0], d[1])), levelOnlyOptions: LEVELS.map((l, i) => opt(String(i + 1), 'L' + (i + 1) + ' · ' + l)), formatOnlyOptions: formats.map((f) => opt(f, f)),
      saveDraft: () => { this.setState({ drawerOpen: false }); this.say('Saved as draft · visible to admins only'); },
      // admin mapping
      blOptions: BLS.map((b) => opt(b, b)), setBl: (v: string) => this.setState({ blState: v, mapSel: null }),
      publish: () => { this.setState({ pending: {} }); this.say('Published · ' + pendingN + ' change' + (pendingN > 1 ? 's' : '') + ' now live on every ' + bl + ' map'); },
      paletteCount: palette.length, palette, paletteOver: (e: DragEvent) => e.preventDefault(),
      paletteDrop: (e: DragEvent) => { e.preventDefault(); const lid = this.refs.drag.current || e.dataTransfer.getData('text/plain'); if (lid) this.unmap(lid); },
      stageCols, ms, obSetOptions: [opt('mandatory', 'Mandatory'), opt('advised', 'Advised')], clearMapSel: () => this.setState({ mapSel: null }),
      toast: s.toast,
      motionAttr: this.props.motion === false ? 'off' : 'on',
      // avatar
      avatarBg: s.avatar.bg, avatarFg: (AV_SWATCHES.find((w) => w[0] === s.avatar.bg) || AV_SWATCHES[0])[1], avatarInitials: s.avatar.initials || '', avatarPhoto: s.avatar.photo,
      avatarSwatches: AV_SWATCHES.map((w) => ({ bg: w[0], label: w[2], ring: s.avatar.bg === w[0] ? '0 0 0 2px #1a1d18' : '0 0 0 1px #d5dacf', pick: () => this.setAvatar({ bg: w[0] }) })),
      setInitials: (e: ChangeEvent<HTMLInputElement>) => this.setAvatar({ initials: (e.target.value || '').toUpperCase().slice(0, 2) }),
      pickAvatarFile: () => this.refs.file.current && this.refs.file.current.click(), onAvatarFile: (e: ChangeEvent<HTMLInputElement>) => this.onAvatarFile(e),
      uploadLabel: s.avatar.photo ? 'Change photo' : 'Upload a photo', removePhoto: () => this.setAvatar({ photo: null }),
    };
  }

  addToPath(id: string) { if (this.state.chosen.includes(id)) return; this.setState({ chosen: this.state.chosen.concat([id]) }); this.say('Added to your path · it now shows on your map with a green ring'); }
  logHours(it: Item) {
    const states = Object.assign({}, this.state.states), pcts = Object.assign({}, this.state.pcts); const np = Math.min(100, Math.round(it.pct + 100 / it.hours));
    pcts[it.id] = np; states[it.id] = np >= 100 ? 'submitted' : 'in-progress'; this.setState({ states, pcts });
    this.say(np >= 100 ? 'All hours logged · sent to Thomas for acceptance' : '1 hour logged · ' + np + '% of ' + it.hoursLabel);
  }
  setMapping(lid: string, stage: string, ob: string) {
    const bl = this.bl(); const maps = Object.assign({}, this.state.maps); maps[bl] = maps[bl].filter((m) => m[0] !== lid).concat([[lid, stage, ob]]);
    const pending = Object.assign({}, this.state.pending); pending[lid] = true; this.setState({ maps, pending, overStage: null });
  }
  dropOn(lid: string, stage: string) {
    const cur = this.mapping(lid); if (cur && cur.stage === stage) { this.setState({ overStage: null }); return; }
    this.setMapping(lid, stage, cur ? cur.ob : 'advised'); this.refs.drag.current = null;
    this.say((cur ? 'Moved' : 'Added') + ' to the ' + stage + ' path in ' + this.bl() + ' as ' + (cur ? cur.ob : 'advised') + ' · publish to apply');
  }
  unmap(lid: string) {
    const cur = this.mapping(lid); if (!cur) return; const bl = this.bl(); const maps = Object.assign({}, this.state.maps); maps[bl] = maps[bl].filter((m) => m[0] !== lid);
    const pending = Object.assign({}, this.state.pending); pending[lid] = true; this.setState({ maps, pending, overStage: null, mapSel: null }); this.refs.drag.current = null;
    this.say('Removed from the ' + cur.stage + ' path · publish to apply');
  }
  sysPrompt() {
    const s = this.state;
    return 'You are the growth assistant inside MyProfessionalMe, the learning platform of a consulting, advisory, tax and legal firm. You talk with Lena Mertens, senior consultant in ' + this.bl() + ', Brussels, aiming for Manager at the Sep 2027 review. Help her put her interests and ambitions into words. Plain, warm, matter-of-fact English. At most 70 words. One question at a time. No emoji, no exclamation marks, no lists.\n'
      + 'Known ambitions: ' + s.ambitions.map((a) => a.text + ' (' + a.horizon + ')').join('; ') + '.\nKnown interests: ' + s.interests.map((i) => i.label).join(', ') + '.\n'
      + 'Personality: Four Colours cool blue then earth green; MBTI INTJ; Big Five high openness and conscientiousness, low extraversion.\n'
      + 'Project feedback: ' + PROJECTS.filter((p) => p.dims).map((p) => p.client + ' (' + p.lead + '): ' + p.quote).join(' ') + '\n'
      + 'Domain codes: ' + DOMAINS.map((d) => d[0] + '=' + d[1]).join(', ') + '.\n'
      + 'Reply ONLY with JSON: {"reply": string, "interests": [{"label": string, "domain": code}], "ambition": null or {"text": string, "horizon": "1 year"|"3 years"|"5 years", "domains": [codes]}}. Propose an interest or ambition only when Lena clearly stated it in her last message and it is not already known; otherwise use [] and null. Interest labels are short noun phrases; ambitions start with a verb.';
  }
  scripted(text: string): ChatReply {
    const t = text.toLowerCase();
    if (t.includes('five years') || t.includes('5 years')) return { reply: 'Two directions fit what is on file: leading sustainability transformations for industrial clients, or running operating-model programmes as a manager. Which would you rather be known for in 2031, and what would a normal week look like?', interests: [], ambition: null };
    if (t.includes('evaluation')) return { reply: 'Three evaluations repeat two themes: delegate earlier, and get involved in scoping and pricing. Thomas and Inès both point to proposal work; Karel asked you to get closer to the data yourself. Which of those do you want to get better at, rather than feel told to?', interests: [], ambition: null };
    if (t.includes('energy')) return { reply: 'Brabant Energy is also where Inès rated your problem solving highest. Shall I save this as an ambition for the next three years? It pulls Industry & market, Regulations and Technology into your ambitions cloud.', interests: [], ambition: { text: 'Work mainly with energy-transition clients', horizon: '3 years', domains: ['ind', 'reg', 'tec'] } };
    const k = KEYWORDS.find((x) => t.includes(x[0]) && !this.state.interests.some((i) => i.label === x[1]));
    if (k) return { reply: 'That sounds like a real interest. I can save “' + k[1] + '” to your profile; it adds ' + (DOMAINS.find((d) => d[0] === k[2]) || [])[1] + ' to your ambitions cloud. What draws you to it?', interests: [{ label: k[1], domain: k[2] }], ambition: null };
    return { reply: 'Noted. What part of that would you want more of next year: the analysis, the client conversation, or leading the team?', interests: [], ambition: null };
  }
  async send(raw: string) {
    const text = (raw || '').trim(); if (!text || this.state.chatBusy) return;
    const chat: ChatMsg[] = this.state.chat.concat([{ role: 'user', text }]);
    this.setState({ chat, chatInput: '', chatBusy: true, proposal: null });
    let res: ChatReply | null = null;
    if (this.props.liveAssistant !== false && window.claude?.complete) {
      try {
        const out = await window.claude.complete({ system: this.sysPrompt(), messages: chat.slice(1).map((m) => ({ role: m.role, content: m.text })), max_tokens: 600 });
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
    const p = this.state.proposal; if (!p) return;
    const ambitions = p.ambition ? this.state.ambitions.concat([{ id: 'A' + Date.now(), text: p.ambition.text, horizon: p.ambition.horizon || '3 years', doms: (p.ambition.domains || []).filter((d) => DOMAINS.some((x) => x[0] === d)), from: 'Assistant conversation · 29 Oct 2026' }]) : this.state.ambitions;
    const interests = this.state.interests.concat(p.interests.filter((i) => !this.state.interests.some((x) => x.label.toLowerCase() === i.label.toLowerCase())).map((i) => ({ label: i.label, dom: i.domain })));
    this.setState({ ambitions, interests, proposal: null, clouds: Object.assign({}, this.state.clouds, { amb: true }) });
    this.say('Saved to your profile · the ambitions cloud on your growth map now reflects it');
  }
}

export type Item = ReturnType<Logic['item']>;
export type Cloud = ReturnType<Logic['clouds']>[number];
export type VM = ReturnType<Logic['renderVals']>;
