// The certification layer on the growth map (design v4): threads, rings and credential diamonds on the constellation,
// one polygon per trajectory on the radar, a lane per trajectory on the road, and the dock rows. Pure geometry and wording.
// An entry is one of the viewed person's enrolled trajectories with its progress; `open` shows its page.
import { monthLabel, trajectoryProgress } from './trajectory';
import type { Enrolment, Trajectory } from './trajectory';
import { STEP_KINDS, stepTitle } from './trajectoryView';
import type { TitleOf } from './trajectoryView';

export type CertEntry = { t: Trajectory; e: Enrolment; pg: ReturnType<typeof trajectoryProgress>; earned: boolean; open: () => void };
export type NodePos = { x: number; y: number; r: number };

const pct = (v: number, total: number) => (v / total * 100).toFixed(2) + '%';
const fixed = (x: number, y: number) => x.toFixed(1) + ',' + y.toFixed(1);
const learningIds = (t: Trajectory) => t.steps.flatMap((st) => (st.lid ? [st.lid] : st.opts ?? []));

// The constellation sits on a 1080 x 660 canvas centred on the person.
const CX = 540, CY = 330, DIAMOND = 11;

export function certConstellation(entries: CertEntry[], pos: Record<string, NodePos>, dim: number) {
  const threads: { id: string; points: string; op: number }[] = [], rings: { id: string; x: number; y: number; r: number; op: number }[] = [];
  const creds: { id: string; x: number; y: number; points: string; filled: boolean; op: number; title: string; onClick: () => void }[] = [];
  const labels: { id: string; xP: string; yP: string; label: string; op: number; onClick: () => void }[] = [];
  entries.forEach(({ t, pg, earned, open }, k) => {
    const pts = t.steps.filter((st) => st.k === 'learn' && st.lid && pos[st.lid]).map((st) => pos[st.lid!]);
    if (!pts.length) return;
    new Set(learningIds(t)).forEach((id) => { const n = pos[id]; if (n) rings.push({ id: t.id, x: n.x, y: n.y, r: n.r + 4 + k * 3, op: dim }); });
    let mx = CX + (pts.reduce((a, p) => a + p.x, 0) / pts.length - CX) * 0.72, my = CY + (pts.reduce((a, p) => a + p.y, 0) / pts.length - CY) * 0.72;
    const dx = mx - CX, dy = my - CY, d = Math.hypot(dx, dy) || 1;
    if (d < 150) { mx = CX + dx / d * 150; my = CY + dy / d * 150; }
    if (Math.abs(mx - CX) < 250 && my > CY - 10 && my < CY + 115) my = CY + 120;
    creds.forEach((o) => { if (Math.hypot(o.x - mx, o.y - my) < 40) my += 44; });
    threads.push({ id: t.id, points: pts.map((p) => fixed(p.x, p.y)).concat(fixed(mx, my)).join(' '), op: dim });
    const z = DIAMOND;
    creds.push({
      id: t.id, x: mx, y: my, points: [mx + ',' + (my - z), (mx + z) + ',' + my, mx + ',' + (my + z), (mx - z) + ',' + my].join(' '), filled: earned, op: dim, onClick: open,
      title: (t.credential || t.name) + ' · ' + (earned ? 'credential earned' : pg.reqDone + ' of ' + pg.reqN + ' required steps') + ' · open the trajectory',
    });
    labels.push({ id: t.id, xP: pct(mx, 1080), yP: pct(my + 14, 660), label: '◆ ' + t.name, op: dim, onClick: open });
  });
  return { threads, rings, creds, labels };
}

// Radar: centre (540, 280), radius 200 for level 5, nine axes clockwise from the top.
const RX = 540, RY = 280, RR = 200;
const radarPoint = (i: number, n: number, level: number) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return fixed(RX + RR * level / 5 * Math.cos(a), RY + RR * level / 5 * Math.sin(a)); };

// Where each credential takes you: the person's levels, raised by every domain level the trajectory's learnings reach.
export function certRadar(entries: CertEntry[], learning: Record<string, { dom: string; lvl: number } | undefined>, domains: [string, string][], cur: number[], target: number[], focusId: string | null, select: (id: string) => void = () => {}) {
  const focused = entries.some((x) => x.t.id === focusId) ? focusId : entries[0]?.t.id;
  return entries.map(({ t }) => {
    const lv = cur.slice();
    learningIds(t).forEach((id) => { const L = learning[id], i = L ? domains.findIndex((d) => d[0] === L.dom) : -1; if (L && i >= 0) lv[i] = Math.max(lv[i], L.lvl); });
    const lifts = domains.map((d, i) => (lv[i] > cur[i] ? d[1] + ' to L' + lv[i] + (lv[i] >= target[i] && cur[i] < target[i] ? ' (gap closed)' : '') : null)).filter(Boolean) as string[];
    const focus = t.id === focused;
    return {
      id: t.id, points: domains.map((_d, i) => radarPoint(i, domains.length, lv[i])).join(' '), focus, fo: focus ? 0.12 : 0, sw: focus ? 2 : 1.2, op: focus ? 1 : 0.4, fw: focus ? 600 : 400, swA: focus ? '.25' : '.08',
      legend: '◆ ' + t.name + (lifts.length ? ' lifts ' + lifts.join(', ') : ' adds no new level'), title: 'After ' + (t.credential || t.name) + ': ' + (lifts.join(', ') || 'no new level'), select: () => select(t.id),
    };
  });
}

// The road's four quarters start in Oct 2026, as the road's own columns do.
const ROAD_START = 2026 * 12 + 9;
const quarterOf = (month: number) => Math.max(0, Math.min(3, Math.floor((month - ROAD_START) / 3)));

type RoadItem = { id: string; av: boolean; avInit: string; title: string; sub: string; ringCss: string; onClick: () => void };

export function certRoadLanes(entries: CertEntry[], titleOf: TitleOf, counsellor: string) {
  return entries.filter((x) => !x.pg.complete).map(({ t, e, pg, open }) => {
    const cells = [0, 1, 2, 3].map(() => ({ items: [] as RoadItem[] }));
    t.steps.forEach((st, i) => {
      const r = pg.steps[i];
      if (r.state === 'done' || r.missing) return;
      const due = e.start_month + (st.win || 1);
      const when = r.locked ? 'after step ' + (t.steps.findIndex((x) => x.id === st.pre) + 1) : r.state === 'progress' ? 'in progress' + (r.pct ? ' · ' + r.pct + '%' : '')
        : r.state === 'booked' || (r.state === 'submitted' && st.k === 'exam') ? 'booked' : r.state === 'submitted' ? 'with ' + counsellor : 'by ' + monthLabel(due);
      const late = due - ROAD_START >= 12 && (r.locked || r.state !== 'open') ? ' · ' + monthLabel(due) : '';
      cells[quarterOf(due)].items.push({ id: t.id + ':' + st.id, av: false, avInit: '', title: stepTitle(st, titleOf), onClick: open, sub: STEP_KINDS[st.k][0] + ' · ' + when + late,
        ringCss: st.req || st.k === 'exam' ? '2px solid #e0a100' : '1.5px dashed #e0a100' });
    });
    const credAt = e.start_month + t.months;
    cells[quarterOf(credAt)].items.push({ id: t.id + ':credential', av: false, avInit: '', title: '◆ ' + (t.credential || t.name), sub: 'Credential · ' + monthLabel(credAt), ringCss: '2px solid #7a5000', onClick: open });
    return { key: 'cert-' + t.id, label: '◆ ' + t.name, sub: pg.reqDone + ' of ' + pg.reqN + ' required steps · credential by ' + monthLabel(credAt), color: '#e0a100', cells, select: open };
  });
}

export function certDockRows(entries: CertEntry[], titleOf: TitleOf, counsellor: string) {
  return entries.map(({ t, e, pg, earned, open }) => ({
    id: t.id, name: '◆ ' + t.name, sub: (t.credential || t.issuer) + ' · expected ' + monthLabel(e.start_month + t.months),
    barW: Math.round(pg.reqDone / Math.max(1, pg.reqN) * 100) + '%', prog: pg.reqDone + ' of ' + pg.reqN + ' required steps', open,
    next: earned ? 'Credential earned' : pg.complete ? 'All steps done' : pg.next >= 0 ? 'Next: ' + stepTitle(t.steps[pg.next], titleOf) : 'Waiting on ' + counsellor + ' or a prerequisite',
  }));
}
