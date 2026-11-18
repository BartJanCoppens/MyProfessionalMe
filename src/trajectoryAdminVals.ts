// Certification trajectories in curriculum mapping (admin, design v4): the list, the editor, mapping, warnings and the
// learner's-eye lane. Every edit updates AppState `trjs` at once and is saved shortly after (like the Knowledge library).
import type { ChangeEvent } from 'react';
import { AUD_INFO, LEARN, LEARN_BY, LEARN_META, LENSES, STAGES } from './data';
import type { Opt } from './ds';
import type { Logic } from './model';
import { createTrajectory, saveTrajectorySoon } from './lib/trajectoryStore';
import { trajectoryDeleteVals } from './trajectoryDelete';
import { countsAsEvidence } from './logic/studioContent';
import { canBeMandatory, totals } from './logic/trajectory';
import type { LearningRef, Trajectory, TrjStep } from './logic/trajectory';
import { addMap, addStep, blankTrajectory, earlierSteps, moveStep, removeStep, saveable } from './logic/trajectoryEdit';
import { adminWarnings } from './logic/trajectoryWarnings';
import { ENROL, ISSUERS, STEP_KINDS, enrolLabel, fmtHours, statusLabel, stepTitle, stones, validLabel } from './logic/trajectoryView';

type Change = ChangeEvent<HTMLInputElement | HTMLSelectElement>;
const opt = (value: string, label: string): Opt => ({ value, label });
// The yearly hours goal: the app has one fixed 80 h budget (no per-stage or per-line goal exists yet).
const YEARLY_GOAL = 80;

// Trajectories as last rendered; a scheduled save writes the latest version.
const LATEST = new Map<string, Trajectory>();
const notSaved = (L: Logic) => (m: string) => L.say(m.startsWith('Not saved') ? m : 'Not saved · ' + m);
let creating = false;

const managesMandatory = (L: Logic) => L.access.isSystem || !!L.access.isGeneral;
const hasMandatory = (t: Trajectory) => t.maps.some((m) => m[2] === 'mandatory');
export const visibleTrajectories = (L: Logic) => L.state.trjs.filter((t) => L.access.isSystem || !!L.access.isGeneral || (!!t.business_line && L.access.domains.includes(t.business_line)));
// The trajectory the editor shows: the selected one this admin sees, else the first.
export function selectedTrajectory(L: Logic): Trajectory | null {
  const visible = visibleTrajectories(L);
  return visible.find((x) => x.id === L.state.trjSel) ?? visible[0] ?? null;
}
// Coverage grid: live and draft trajectories this admin sees, mapped to the audience at the stage.
export const trajectoryCount = (L: Logic, aud: string, stage: string) => visibleTrajectories(L).filter((t) => t.status !== 'retired' && t.maps.some((m) => m[0] === aud && m[1] === stage)).length;

// Mirror of private.can_write_trajectory: the reason this admin may not write it as it is, or null.
export function refusal(L: Logic, t: Trajectory): string | null {
  if (!L.canEditLine(t.business_line)) return 'Not changed · you can only change trajectories of your own business line';
  if (t.maps.some((m) => !L.canEditAud(m[0]))) return 'Not changed · it maps audiences you cannot edit';
  if (t.status === 'live' && hasMandatory(t) && !managesMandatory(L)) return 'Not changed · a live trajectory with a mandatory map is changed by a General or System Admin';
  return null;
}

// Applies one edit to a trajectory: refused when the database would refuse it, else shown now and saved soon. Returns the result.
// `change` may run more than once (here and in the state updater), so build random or one-off values outside it.
export function patch(L: Logic, id: string, change: (t: Trajectory) => Trajectory | null): Trajectory | null {
  const cur = L.state.trjs.find((t) => t.id === id), next = cur && change(cur);
  if (!cur || !next) return null;
  const why = refusal(L, cur) || refusal(L, next);
  if (why) { L.say(why); return null; }
  L.setState((s) => ({ trjs: s.trjs.map((t) => (t.id === id ? change(t) ?? t : t)) }));
  saveTrajectorySoon(id, () => { const t = LATEST.get(id); return t && saveable(t) ? t : undefined; }, notSaved(L));
  return next;
}

async function startNew(L: Logic) {
  if (creating) return;
  creating = true;
  try {
    const { id: _id, published_at: _published, ...draft } = blankTrajectory(L.editableLines()[0] || null);
    const made = await createTrajectory(draft);
    L.setState((s) => ({ trjs: s.trjs.concat([made]), trjSel: made.id, trjStep: null }));
    L.say('New draft trajectory · add steps and map it to an audience');
  } catch (err) { notSaved(L)((err as Error).message); } finally { creating = false; }
}

// Published learnings only (what learners see), so a step on a draft or a learning in review is warned about.
const published = () => LEARN.filter((r) => (LEARN_META[r[0]]?.status ?? 'published') === 'published');
const learningRefs = (): Record<string, LearningRef> => Object.fromEntries(published().map((r) => [r[0], { hours: r[6], cpd: r[7], state: 'not-started' as const, pct: 0 }]));
const titleOf = (id: string) => LEARN_BY[id]?.[1] ?? id;
const learningLine = (id: string) => (LEARN_BY[id] ? LEARN_BY[id][4] + ' · ' + fmtHours(LEARN_BY[id][6]) : '');
// A case its creator said can count as trajectory evidence says so where an admin picks a step (Case Studio, Task 2.1).
const evidenceTag = (id: string) => (countsAsEvidence(LEARN_META[id]?.content) ? ' · counts as trajectory evidence' : '');
const lensOf = (aud: string) => LENSES.find((l) => l[0] === AUD_INFO[aud]?.lens);
// An option list that also holds the value in use, so a stored value outside the usual choices still shows.
const withCurrent = (options: { value: string; label: string }[], value: string, label = value) => (options.some((o) => o.value === value) ? options : [opt(value, label)].concat(options));

export function trajectoryAdminVals(L: Logic) {
  const s = L.state, visible = visibleTrajectories(L);
  s.trjs.forEach((t) => LATEST.set(t.id, t));
  const t = selectedTrajectory(L);
  const byId = learningRefs();
  const offerable = published();
  const list = visible.map((x) => {
    const tot = totals(x, byId), on = !!t && x.id === t.id;
    return {
      id: x.id, name: x.name, on, pick: () => L.setState((st) => ({ trjSel: x.id, trjStep: null, trjPanel: { ...st.trjPanel, focus: null, editing: null, confirm: false, applying: false } })), bg: on ? '#f6f9ef' : '#fff', bar: on ? 'inset 3px 0 0 #86BC25' : 'none',
      meta: [x.issuer, x.steps.length + ' steps', fmtHours(tot.tot) + (tot.cpd ? ' · ' + tot.cpd + ' CPD units' : ''), x.months + ' months'].filter(Boolean).join(' · '),
      st: x.status === 'live' ? 'accepted' : x.status === 'retired' ? 'na' : 'not-started', stLabel: statusLabel(x.status), enrolLabel: enrolLabel(x.enrol),
      auds: x.maps.length ? x.maps.map((m) => ({ color: lensOf(m[0])?.[2] ?? '#d5dacf', label: (AUD_INFO[m[0]]?.name ?? m[0]) + ' · ' + m[1] + ' · ' + (m[2] === 'mandatory' ? 'mandatory' : 'suggested') })) : [{ color: '#d5dacf', label: 'Not mapped yet' }],
    };
  });
  const liveBlocked = !managesMandatory(L) && !!t && hasMandatory(t);
  const base = {
    mapMode: s.mapMode, setMapMode: (v: string) => L.setState({ mapMode: v === 'traj' ? 'traj' : 'learn' }), isTrjMode: s.mapMode === 'traj', isLearnMode: s.mapMode !== 'traj',
    mapModeTabs: [opt('learn', 'Single learnings'), opt('traj', 'Certification trajectories · ' + visible.length)],
    mapModeHint: s.mapMode === 'traj' ? 'Build certification and accreditation journeys, then map them to audiences.' : 'Map single learnings to audiences and stages.',
    trjCount: String(visible.length), trjList: list, trjNew: () => startNew(L),
    trjStatusOptions: [opt('draft', 'Draft'), { ...opt('live', 'Live'), disabled: liveBlocked }, opt('retired', 'Retired')],
    trjAudOptions: [opt('', 'Choose an audience')].concat(Object.keys(AUD_INFO).filter((k) => L.canEditAud(k)).map((k) => opt(k, (lensOf(k)?.[1] ?? '') + ' · ' + AUD_INFO[k].name))),
    trjAud: s.trjAud, setTrjAud: (e: Change) => L.setState({ trjAud: e.target.value }),
    trjStageOptions: STAGES.map((x) => opt(x, x)), trjStage: s.trjStage, setTrjStage: (e: Change) => L.setState({ trjStage: e.target.value }),
    trjObOptions: [opt('mandatory', 'Mandatory'), opt('advised', 'Advised')],
    trjIssuerOptions: ISSUERS.map((x) => opt(x, x)), trjEnrolOptions: ENROL.map((x) => opt(x[0], x[1])),
    trjMonthOptions: [3, 6, 9, 12, 18, 24, 36].map((m) => opt(String(m), m + ' months')),
    trjValidOptions: [opt('0', 'Does not expire'), opt('12', '1 year'), opt('24', '2 years'), opt('36', '3 years')],
    trjHourOptions: [0, 0.5, 1, 2, 3, 4, 6, 8, 12, 16].map((h) => opt(String(h), h ? fmtHours(h) : 'None')),
  };
  if (!t) return { ...base, tj: null, tse: null };
  const edit = (change: (x: Trajectory) => Trajectory | null) => patch(L, t.id, change);
  const editStep = (id: string, change: (x: TrjStep) => TrjStep) => edit((x) => ({ ...x, steps: x.steps.map((st) => (st.id === id ? change(st) : st)) }));
  // The new step is made once (its id is random), so the state, the save and the selection all carry the same id.
  const add = (what: Parameters<typeof addStep>[1]) => {
    const made = addStep(t.steps, what, t.months)[t.steps.length];
    if (edit((x) => ({ ...x, steps: x.steps.concat([made]) }))) L.setState({ trjStep: made.id });
  };
  const used = new Set<string>(); t.steps.forEach((st) => { if (st.lid) used.add(st.lid); (st.opts || []).forEach((o) => used.add(o)); });
  const learnChoices = (empty: string) => [opt('', empty)].concat(offerable.filter((r) => !used.has(r[0])).map((r) => opt(r[0], r[1] + ' · ' + fmtHours(r[6]) + evidenceTag(r[0]))));
  const tot = totals(t, byId), n = t.steps.length, setField = (key: 'name' | 'credential' | 'renewal' | 'cost' | 'issuer') => (e: Change) => edit((x) => ({ ...x, [key]: e.target.value }));
  const steps = t.steps.map((st, i) => {
    const K = STEP_KINDS[st.k], sel = s.trjStep === st.id, h = totals({ ...t, steps: [st] }, byId).tot, pre = st.pre ? t.steps.findIndex((x) => x.id === st.pre) : -1;
    return {
      id: st.id, n: String(i + 1), kind: K[0], tone: K[1], title: stepTitle(st, titleOf),
      meta: [st.lid && LEARN_BY[st.lid] ? LEARN_BY[st.lid][4] + ' · ' + LEARN_BY[st.lid][5] : st.k === 'make' ? 'To create · ' + (st.fmt ?? '') : null,
        h ? (st.k === 'make' ? 'about ' + fmtHours(h) + ' (a proposal)' : fmtHours(h) + (st.k === 'elect' ? ' at least' : '')) : st.k === 'evidence' ? 'Logged on the job' : st.k === 'check' ? 'No study hours' : null,
        'by month ' + (st.win || 1), pre >= 0 ? 'after step ' + (pre + 1) : null, st.req || st.k === 'exam' ? null : 'optional'].filter(Boolean).join(' · '),
      dotBg: st.k === 'exam' ? '#1a1d18' : sel ? '#86BC25' : '#fff', dotFg: st.k === 'exam' ? '#fff' : '#1a1d18', dotBd: st.req || st.k === 'exam' ? '1.5px solid #1a1d18' : '1.5px dashed #8b918a',
      bd: sel ? '#1a1d18' : '#e1e5dc', ring: sel ? '0 0 0 3px rgba(134,188,37,.45)' : 'none', pick: () => L.setState({ trjStep: sel ? null : st.id }),
      up: () => edit((x) => ({ ...x, steps: moveStep(x.steps, st.id, -1) })), down: () => edit((x) => ({ ...x, steps: moveStep(x.steps, st.id, 1) })),
      noUp: i === 0, noDown: i === n - 1,
      remove: () => { if (edit((x) => ({ ...x, steps: removeStep(x.steps, st.id) }))) L.setState({ trjStep: null }); },
    };
  });
  const maps = t.maps.map((m, mi) => {
    const canMand = canBeMandatory(m[0]), pro = m[0].startsWith('pro:');
    return {
      color: lensOf(m[0])?.[2] ?? '#d5dacf', aud: AUD_INFO[m[0]]?.name ?? m[0], stage: m[1], canMand, noMand: !canMand, ob: m[2],
      meta: (lensOf(m[0])?.[1] ?? '') + ' · reaches about ' + (AUD_INFO[m[0]] ? L.reachAt(m[0], m[1]) : 0) + ' people · '
        + (canMand ? (m[2] === 'mandatory' ? (t.enrol === 'auto' ? 'enrolled automatically' : 'mandatory, people enrol themselves') : 'advised') : 'shown as a suggestion' + (m[0].startsWith('amb:') ? ' in their ambitions cloud' : pro ? ' in their personality cloud' : '')),
      setOb: (v: string) => edit((x) => ({ ...x, maps: x.maps.map((y, j) => (j === mi ? [y[0], y[1], v === 'mandatory' ? 'mandatory' : 'advised'] : y)) })),
      remove: () => edit((x) => ({ ...x, maps: x.maps.filter((_y, j) => j !== mi) })),
    };
  });
  const warns = (saveable(t) ? [] : ['Not saved until it has a name and a credential.']).concat(adminWarnings(t, byId, YEARLY_GOAL));
  const ySplit = tot.perYear.map((h, i) => (h ? 'Y' + (i + 1) + ' ' + fmtHours(h) : null)).filter(Boolean).join(' · ') || '0 h';
  const tj = {
    ...trajectoryDeleteVals(L, t),
    // "Build with AI": offered to someone who may write this trajectory (the database's rule, mirrored by refusal) and never in View as.
    ai: { show: !L.subject.readOnly && refusal(L, t) === null, open: s.trjPanel.open, toggle: () => L.setState((st) => ({ trjPanel: { ...st.trjPanel, open: !st.trjPanel.open } })) },
    name: t.name, cred: t.credential, issuer: t.issuer, enrol: t.enrol as string, months: String(t.months), valid: String(t.valid_months ?? 0), renew: t.renewal, cost: t.cost, status: t.status as string,
    sub: [t.issuer, enrolLabel(t.enrol), t.status === 'live' ? 'live' : t.status === 'retired' ? 'retired, hidden from new people' : 'draft, visible to admins only'].filter(Boolean).join(' · '),
    setStatus: (v: string) => edit((x) => ({ ...x, status: v === 'live' ? 'live' : v === 'retired' ? 'retired' : 'draft' })),
    setName: setField('name'), setCred: setField('credential'), setRenew: setField('renewal'), setCost: setField('cost'), setIssuer: setField('issuer'),
    setMonths: (e: Change) => edit((x) => ({ ...x, months: Number(e.target.value) })), setValid: (e: Change) => edit((x) => ({ ...x, valid_months: Number(e.target.value) || null })),
    line: t.business_line ?? '', setLine: (e: Change) => edit((x) => ({ ...x, business_line: e.target.value || null })),
    lineOptions: withCurrent(L.editableLines().map((l) => opt(l, l || 'Firm-wide')), t.business_line ?? '', t.business_line ?? 'Firm-wide'),
    setEnrol: (e: Change) => edit((x) => ({ ...x, enrol: ENROL.find((o) => o[0] === e.target.value)?.[0] ?? x.enrol })),
    issuerOptions: withCurrent(base.trjIssuerOptions, t.issuer), monthOptions: withCurrent(base.trjMonthOptions, String(t.months), t.months + ' months'),
    validOptions: withCurrent(base.trjValidOptions, String(t.valid_months ?? 0), t.valid_months + ' months'),
    stats: [{ label: 'Steps', value: String(n), sub: tot.req + ' required' }, { label: 'Study hours', value: fmtHours(tot.tot), sub: 'electives at their minimum' }, { label: 'CPD units', value: String(tot.cpd), sub: t.issuer },
      { label: 'Duration', value: t.months + ' months', sub: 'from enrolment' }, { label: 'Hours per year', value: ySplit, sub: 'what counts toward the ' + YEARLY_GOAL + ' h budget' }],
    steps, credTitle: t.credential || 'Name the credential above', hasRenew: !!t.valid_months,
    credMeta: t.issuer + ' · awarded when the counsellor accepts the exam · ' + (t.valid_months ? 'valid ' + (t.valid_months === 12 ? '1 year' : validLabel(t.valid_months)) : 'does not expire'),
    renewTitle: 'Every ' + (t.valid_months ? validLabel(t.valid_months) : ''), renewMeta: (t.renewal || 'Describe the renewal rule above') + ' · the wallet shows "Renew by" 30 days before expiry',
    learnOptions: learnChoices('Learning from the library…'), addLearn: (e: Change) => { if (e.target.value) add({ k: 'learn', lid: e.target.value }); },
    addElect: () => add({ k: 'elect' }), addEvidence: () => add({ k: 'evidence' }), addCheck: () => add({ k: 'check' }), addExam: () => add({ k: 'exam' }),
    maps, noMaps: !maps.length,
    addMap: () => {
      if (!s.trjAud) { L.say('Choose an audience first'); return; }
      const next = addMap(t, s.trjAud, s.trjStage);
      if (!next) { L.say('Already mapped to ' + AUD_INFO[s.trjAud]?.name + ' · ' + s.trjStage); return; }
      if (edit(() => next)) L.setState({ trjAud: '' });
    },
    warns: warns.map((text) => ({ text })), hasWarn: warns.length > 0, stones: stones(t, titleOf),
    previewSub: 'Dashed stones are optional. The credential ends the lane' + (t.valid_months ? '; the renewal stone appears once it is earned.' : '.'),
  };
  const sx = t.steps.find((st) => st.id === s.trjStep), si = sx ? t.steps.indexOf(sx) : -1;
  const tse = sx ? {
    open: true, n: String(si + 1), kind: STEP_KINDS[sx.k][0], isLearn: sx.k === 'learn', isText: sx.k === 'evidence' || sx.k === 'check' || sx.k === 'exam' || sx.k === 'make', isMake: sx.k === 'make', isElect: sx.k === 'elect', isExam: sx.k === 'exam', canReq: sx.k !== 'exam', req: !!sx.req,
    learnInfo: sx.k === 'learn' && LEARN_BY[sx.lid ?? ''] ? LEARN_BY[sx.lid ?? ''][1] + ' · ' + LEARN_BY[sx.lid ?? ''][4] + ' · ' + LEARN_BY[sx.lid ?? ''][5] + ' · ' + fmtHours(LEARN_BY[sx.lid ?? ''][6]) + (LEARN_BY[sx.lid ?? ''][7] ? ' · ' + LEARN_BY[sx.lid ?? ''][7] + ' CPD units' : '') : '',
    title: sx.title || '', setTitle: (e: Change) => editStep(sx.id, (x) => ({ ...x, title: e.target.value })),
    hours: String(sx.hours || 0), hourOptions: withCurrent(base.trjHourOptions, String(sx.hours || 0), fmtHours(sx.hours || 0)), setHours: (e: Change) => editStep(sx.id, (x) => ({ ...x, hours: Number(e.target.value) })),
    winOptions: withCurrent([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 21, 24, 30, 32, 36].map((m) => opt(String(m), 'By month ' + m)), String(sx.win || 1), 'By month ' + (sx.win || 1)),
    win: String(sx.win || 1), setWin: (e: Change) => editStep(sx.id, (x) => ({ ...x, win: Number(e.target.value) })),
    preOptions: [opt('', 'No prerequisite')].concat(earlierSteps(t.steps, sx.id).map((x, j) => opt(x.id, 'Step ' + (j + 1) + ' · ' + stepTitle(x, titleOf).slice(0, 40)))), pre: sx.pre ?? '',
    setPre: (e: Change) => editStep(sx.id, (x) => ({ ...x, pre: e.target.value || null })),
    toggleReq: () => editStep(sx.id, (x) => ({ ...x, req: !x.req })),
    pickOptions: [1, 2, 3].filter((p) => p <= Math.max(1, (sx.opts || []).length)).map((p) => opt(String(p), p + ' of ' + (sx.opts || []).length)), pick: String(sx.pick || 1),
    setPick: (e: Change) => editStep(sx.id, (x) => ({ ...x, pick: Number(e.target.value) })),
    opts: (sx.opts || []).map((lid, oi) => ({ title: titleOf(lid), sub: learningLine(lid), remove: () => editStep(sx.id, (x) => { const rest = (x.opts || []).filter((_o, j) => j !== oi); return { ...x, opts: rest, pick: Math.min(x.pick || 1, Math.max(1, rest.length)) }; }) })),
    optOptions: learnChoices('Add an option…'), addOpt: (e: Change) => { if (e.target.value) editStep(sx.id, (x) => ({ ...x, opts: (x.opts || []).concat([e.target.value]) })); },
    close: () => L.setState({ trjStep: null }),
  } : null;
  return { ...base, tj, tse };
}
