// Growth map: constellation, radar, road, clouds, domain zoom, readiness and marks (FT-MAP-*).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMAINS, LEARN, MAPS0, STAGES } from './data';
import * as learner from './lib/learnerStore';
import { harness, person, stubWindow, withProgress } from './test/harness';

vi.mock('./lib/learnerStore', () => ({
  acceptLearning: vi.fn(async () => {}), addAmbition: vi.fn(async () => ({})), addInterest: vi.fn(async () => {}), removeAmbition: vi.fn(async () => {}),
  removeInterest: vi.fn(async () => {}), saveProgress: vi.fn(async () => {}), savePrefs: vi.fn(async () => {}), loadLearner: vi.fn(),
}));

beforeEach(() => { stubWindow(); vi.clearAllMocks(); });

// The Consulting path a Consultant is measured on: everything mapped up to the next stage (Senior consultant).
const consultingPath = MAPS0.Consulting.filter((m) => STAGES.indexOf(m[1]) <= 2);
const hoursOf = (id: string) => LEARN.find((r) => r[0] === id)![6];
const ambitionLead = { id: 'a1', text: 'Lead a team', horizon: '3 years', doms: ['lead'], from: 'Assistant conversation' };
const interestData = { label: 'Data analysis', dom: 'tec' };

describe('the constellation', () => {
  it('draws nine domain hubs and one dot per learning', () => {
    const vm = harness().vm();
    expect(vm.cHubs.map((h) => h.id)).toEqual(DOMAINS.map((d) => d[0]));
    expect(vm.cNodes).toHaveLength(LEARN.length);
    expect(vm.cEdges).toHaveLength(9 + LEARN.length);
  });
  it('shows the level reached per domain on its hub', () => {
    const vm = harness({ subject: person({ data: withProgress({ L1: 'accepted' }) }) }).vm();
    expect(vm.cHubs[0]).toMatchObject({ cur: 'L3', lvl: 'Advanced · L3 → L4 at Senior consultant' });
    expect(vm.cHubs[1]).toMatchObject({ cur: 'L0', lvl: 'Not started → L3 at Senior consultant' });
  });
  it('fills a dot by its state and outlines it by its obligation', () => {
    const vm = harness({ subject: person({ data: withProgress({ L1: 'accepted', L2: ['in-progress', 50] }) }) }).vm();
    const dot = (id: string) => vm.cNodes.find((n) => n.id === id)!;
    expect(dot('L1').fill).toBe('#86BC25');
    expect(dot('L2').fill).toBe('#e0a100');
    expect(dot('L7')).toMatchObject({ fill: '#fff', sw: 2, dash: 'none' });
    expect(dot('L20')).toMatchObject({ dash: '3 2' });
    expect(dot('L3')).toMatchObject({ stroke: '#b3b8ae', sw: 1 });
  });
  it('selects a dot and dims the other domains', () => {
    const h = harness();
    h.vm().cNodes.find((n) => n.id === 'L7')!.onClick();
    expect(h.state.sel).toEqual({ type: 'node', id: 'L7', dom: 'pers' });
    const vm = h.vm();
    expect(vm.cNodes.find((n) => n.id === 'L7')!.ringOp).toBe(1);
    expect(vm.cNodes.find((n) => n.id === 'L1')!.op).toBe(0.3);
    expect(vm.dock).toMatchObject({ id: 'L7', kv: [{ k: 'Source', v: 'Internal academy' }, { k: 'Effort', v: '1.5 h' }, { k: 'Level', v: 'Practitioner · L2' }, { k: 'Deadline', v: 'None' }] });
  });
  it('selects a domain hub and summarises it in the dock', () => {
    const h = harness({ subject: person({ data: withProgress({ L1: 'accepted' }) }) });
    h.vm().cHubs[0].onClick();
    const vm = h.vm();
    expect(vm.hubDock).toMatchObject({ label: 'Job technical skills', sub: 'You are at Advanced · L3. Senior consultant in Consulting expects L4 · 1 of 4 completed' });
    expect(vm.hubDock!.items).toHaveLength(4);
    expect(vm.cHubs[0]).toMatchObject({ stroke: '#1a1d18', sw: 2 });
  });
  it('clears the selection', () => {
    const h = harness({ state: { sel: { type: 'hub', id: 'tech' } } });
    h.vm().clearSel();
    expect(h.state.sel).toBeNull();
  });
  it('adds a dot to the path from the dock', () => {
    const h = harness({ state: { sel: { type: 'node', id: 'L3', dom: 'tech' } } });
    h.vm().dock!.add();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L3', { chosen: true });
  });
});

describe('switching views', () => {
  it('offers constellation, radar and road, and clears the selection', () => {
    const h = harness({ state: { sel: { type: 'hub', id: 'tech' } } });
    expect(h.vm().viewOptions.map((o) => o.value)).toEqual(['constellation', 'radar', 'road']);
    h.vm().setView('road');
    expect(h.state).toMatchObject({ view: 'road', sel: null });
  });
  it('opens the radar from the centre of the map', () => {
    const h = harness();
    h.vm().selectMe();
    expect(h.state).toMatchObject({ view: 'radar', sel: null });
  });
  it('labels the cloud row by view', () => {
    expect(harness().vm().cloudRowLabel).toBe('Learning clouds');
    expect(harness({ state: { view: 'road' } }).vm().cloudRowLabel).toBe('Paths');
  });
});

describe('the radar', () => {
  it('names every domain as a large gap for a newcomer', () => {
    const vm = harness().vm();
    expect(vm.rRings).toHaveLength(5);
    expect(vm.rAxes.map((a) => a.label)).toEqual(DOMAINS.map((d) => d[1]));
    expect(vm.radarGapText).toBe('Largest gaps: ' + DOMAINS.map((d) => d[1]).join(', ') + ' · 0 of 9 domains already at the Senior consultant level');
  });
  it('drops a domain from the gaps once it is within one level', () => {
    const vm = harness({ subject: person({ data: withProgress({ L1: 'accepted' }) }) }).vm();
    expect(vm.radarGapText).not.toContain('Job technical skills');
    expect(vm.rAxes[0].sub).toBe('L3 of L4');
  });
  it('counts domains already at the next-stage level', () => {
    const vm = harness({ subject: person({ data: withProgress({ L3: 'accepted' }) }) }).vm();
    expect(vm.radarGapText).toMatch(/· 1 of 9 domains already at the Senior consultant level$/);
  });
  it('draws one polygon per visible cloud and selects a cloud', () => {
    const h = harness();
    expect(h.vm().rClouds.map((c) => c.key)).toEqual(['proj', 'pers', 'amb']);
    h.vm().rClouds[2].select();
    expect(h.state.sel).toEqual({ type: 'cloud', id: 'amb' });
  });
});

describe('the road', () => {
  it('lays the firm path over four quarters, mandatory first, a dated item in its quarter', () => {
    const vm = harness().vm();
    const firm = vm.roadLanes[0];
    expect(firm).toMatchObject({ key: 'firm', label: 'Firm path to Senior consultant', sub: consultingPath.length + ' learnings · mandatory and advised' });
    expect(vm.roadQuarters).toEqual(['Q4 2026', 'Q1 2027', 'Q2 2027', 'Q3 2027']);
    expect(firm.cells.map((c) => c.items.map((i) => i.id))).toEqual([['L1', 'L17', 'L24', 'L8', 'L20'], ['L7', 'L30', 'L11', 'L23'], ['L10', 'L2', 'L13', 'L31'], ['L16', 'L5', 'L19']]);
    expect(firm.cells[0].items[1]).toMatchObject({ title: 'GDPR for consultants', sub: 'Due 30 Nov 2026 · 1.5 h', ringCss: '2px solid #1a1d18' });
    expect(firm.cells[0].items[3].ringCss).toBe('1.5px dashed #1a1d18');
  });
  it('lists work in flight and what is behind', () => {
    const vm = harness({ subject: person({ data: withProgress({ L1: 'accepted', L2: ['in-progress', 25], L3: 'submitted' }) }) }).vm();
    expect(vm.inflightCount).toBe(2);
    expect(vm.roadInflight.map((r) => r.label)).toEqual(['Value-chain cost modelling in Excel · In progress · 25%', 'Target operating model casebook · Awaiting counsellor']);
    expect(vm.roadBehind).toBe('1 completed · 6 h accepted so far');
    expect(vm.roadLanes[0].cells.flatMap((c) => c.items.map((i) => i.id))).not.toContain('L1');
  });
  it('adds a lane per visible cloud, placed by level', () => {
    const vm = harness({ subject: person({ data: withProgress({}, { ambitions: [ambitionLead], interests: [interestData] }) }) }).vm();
    const amb = vm.roadLanes.find((l) => l.key === 'amb')!;
    expect(amb).toMatchObject({ label: 'Ambition path', sub: '2 learnings · 15 h · your ambitions and interests' });
    expect(amb.cells.map((c) => c.items.map((i) => i.id))).toEqual([['L28'], [], ['L26'], []]);
  });
  it('selects a cloud lane, and the firm lane clears the selection', () => {
    const h = harness({ state: { view: 'road' } });
    h.vm().roadLanes[3].select();
    expect(h.state.sel).toEqual({ type: 'cloud', id: 'amb' });
    h.vm().roadLanes[0].select();
    expect(h.state.sel).toBeNull();
  });
});

describe('learning clouds', () => {
  it('are empty for a newcomer but all switched on', () => {
    const vm = harness().vm();
    expect(vm.cloudChips.map((c) => [c.key, c.on, c.count])).toEqual([['proj', true, '0'], ['pers', true, '0'], ['amb', true, '0']]);
  });
  it('pull in the highest-level open learning of each ambition and interest domain', () => {
    const vm = harness({ subject: person({ data: withProgress({}, { ambitions: [ambitionLead], interests: [interestData] }) }) }).vm();
    expect(vm.cloudChips[2].count).toBe('2');
    const amb = vm.cClouds.find((c) => c.key === 'amb')!;
    expect(amb.blobs).toHaveLength(2);
  });
  it('use the learnings an ambition names, and skip unknown ids', () => {
    const named = { ...ambitionLead, ids: ['L5', 'L999'] };
    const vm = harness({ subject: person({ data: withProgress({}, { ambitions: [named] }) }) }).vm();
    expect(vm.cloudChips[2].count).toBe('1');
  });
  it('explain themselves in a dock when selected', () => {
    const h = harness({ subject: person({ data: withProgress({}, { ambitions: [ambitionLead], interests: [interestData] }) }), state: { sel: { type: 'cloud', id: 'amb' } } });
    const dock = h.vm().cloudDock!;
    expect(dock).toMatchObject({ title: 'Toward your ambitions', sub: '2 learnings across 2 domains', goLabel: 'Open ambitions →' });
    expect(dock.rows.map((r) => [r.id, r.src, r.canAdd])).toEqual([['L28', 'Ambition · Lead a team', true], ['L26', 'Interest · Data analysis', true]]);
    expect(dock.rows[1].text).toBe('Matches an interest you named.');
    dock.rows[0].add();
    expect(learner.saveProgress).toHaveBeenCalledWith('u1', 'L28', { chosen: true });
    dock.go();
    expect(h.state.screen).toBe('profile');
  });
  it('mark a chosen learning that has not started as on my path', () => {
    const data = withProgress({ L28: ['not-started', 0, true] }, { ambitions: [{ ...ambitionLead, ids: ['L28'] }] });
    const dock = harness({ subject: person({ data }), state: { sel: { type: 'cloud', id: 'amb' } } }).vm().cloudDock!;
    expect(dock.rows[0]).toMatchObject({ stateLabel: 'On my path', canAdd: false });
  });
  it('switch off from the chip and drop a selection on that cloud', () => {
    const h = harness({ state: { sel: { type: 'cloud', id: 'amb' } } });
    h.vm().cloudChips[2].toggle();
    expect(h.state.clouds).toEqual({ proj: true, pers: true, amb: false });
    expect(h.state.sel).toBeNull();
    expect(h.vm().cClouds.map((c) => c.key)).toEqual(['proj', 'pers']);
  });
  it('select and deselect from the cloud label', () => {
    const h = harness();
    h.vm().cClouds[0].select();
    expect(h.state.sel).toEqual({ type: 'cloud', id: 'proj' });
    h.vm().cClouds[0].select();
    expect(h.state.sel).toBeNull();
  });
});

describe('domain zoom', () => {
  it('marks the current level and the next-stage target on the rings', () => {
    const vm = harness({ subject: person({ data: withProgress({ L1: 'accepted' }) }), state: { zoom: 'tech' } }).vm();
    const zm = vm.zm!;
    expect(zm.levelText).toBe('L3 Advanced → L4');
    expect(zm.levelSub).toBe('1 level to go for Senior consultant');
    expect(zm.rings.map((r) => r.label)).toEqual(['L5', 'L4 · target', 'L3 · now', 'L2', 'L1']);
    expect(zm.rings[1].dash).toBe('4 3');
    expect(zm.band).not.toBeNull();
    expect(zm.hoursText).toBe('6 h of 40 h · 4 learnings');
    expect(zm.hoursW).toBe('15.0%');
    expect(vm.cHint).toMatch(/^Rings are levels L1/);
  });
  it('says when a domain is at target', () => {
    expect(harness({ subject: person({ data: withProgress({ L3: 'accepted' }) }), state: { zoom: 'tech' } }).vm().zm!.levelSub).toBe('At target for Senior consultant');
  });
  it('suggests the next learning: in progress first, then mandatory', () => {
    const zm = harness({ subject: person({ data: withProgress({ L3: ['in-progress', 10] }) }), state: { zoom: 'tech' } }).vm().zm!;
    expect(zm.nextTitle).toBe('Target operating model casebook');
    const fresh = harness({ state: { zoom: 'reg' } }).vm().zm!;
    expect(fresh.nextTitle).toBe('Independence & ethics annual');
    expect(fresh.nextSub).toBe('Mandatory · L1 · 1 h →');
  });
  it('names the due date of a dated next item', () => {
    const zm = harness({ subject: person({ data: withProgress({ L16: 'accepted' }) }), state: { zoom: 'reg' } }).vm().zm!;
    expect(zm.nextSub).toBe('Mandatory · L2 · 1.5 h · due 30 Nov 2026 →');
  });
  it('points to the library once everything in the domain is done', () => {
    const h = harness({ subject: person({ data: withProgress({ L1: 'accepted', L2: 'accepted', L3: 'accepted', L4: 'submitted' }) }), state: { zoom: 'tech' } });
    const zm = h.vm().zm!;
    expect(zm).toMatchObject({ nextTitle: 'Everything here is done', nextSub: 'Pick a stretch item in the library' });
    zm.nextOpen();
    expect(h.state.screen).toBe('library');
  });
  it('shows which clouds pull on the domain', () => {
    expect(harness({ state: { zoom: 'tec' } }).vm().zm!.pulls).toEqual([{ label: 'Firm path only', color: '#d5dacf', text: '#5a6058' }]);
    const zm = harness({ subject: person({ data: withProgress({}, { interests: [interestData] }) }), state: { zoom: 'tec' } }).vm().zm!;
    expect(zm.pulls.map((p) => p.label)).toEqual(['Ambitions']);
    expect(zm.clouds).toHaveLength(1);
  });
  it('selects a learning in the zoom and selects it off again', () => {
    const h = harness({ state: { zoom: 'tech' } });
    h.vm().zm!.nodes.find((n) => n.id === 'L1')!.onClick();
    expect(h.state.sel).toEqual({ type: 'node', id: 'L1', dom: 'tech' });
    h.vm().zm!.nodes.find((n) => n.id === 'L1')!.onClick();
    expect(h.state.sel).toBeNull();
  });
  it('falls back to the first domain for an unknown zoom key', () => {
    expect(harness({ state: { zoom: 'nope' } }).vm().zm!.name).toBe('Job technical skills');
  });
});

describe('readiness, hours and next up', () => {
  it('counts hours on mandatory and advised items up to the next stage', () => {
    const total = consultingPath.reduce((a, m) => a + hoursOf(m[0]), 0);
    expect(total).toBe(78);
    const vm = harness({ subject: person({ data: withProgress({ L10: 'accepted' }) }) }).vm();
    expect(vm.readiness).toBe(Math.round(100 * 14 / 78));
    expect(vm.readinessW).toBe('18%');
    expect(vm.who.readinessLine).toBe('18% ready for Senior consultant');
    expect(vm.centerSub).toBe('Consultant → Senior consultant · 18% ready');
  });
  it('does not count my own choices toward readiness', () => {
    expect(harness({ subject: person({ data: withProgress({ L3: 'accepted' }) }) }).vm().readiness).toBe(0);
  });
  it('adds accepted, submitted and partly done hours to the year', () => {
    const vm = harness({ subject: person({ data: withProgress({ L1: 'accepted', L2: ['in-progress', 50], L3: 'submitted', L5: 'accepted' }) }) }).vm();
    expect(vm.hoursYear).toBe(6 + 4 + 10 + 12);
    expect(vm.hoursChip).toBe('32 of 80 h this year');
    expect(vm.cpdYear).toBe(6);
  });
  it('lists four next items, mandatory first', () => {
    const vm = harness().vm();
    expect(vm.nextUp.map((n) => n.id)).toEqual(['L1', 'L7', 'L10', 'L16']);
    expect(vm.nextUp[0]).toMatchObject({ meta: 'Mandatory · Not started · 6 h', dot: '#1a1d18' });
  });
  it('puts work in progress ahead among mandatory items', () => {
    const vm = harness({ subject: person({ data: withProgress({ L24: ['in-progress', 30] }) }) }).vm();
    expect(vm.nextUp[0].id).toBe('L24');
  });
});

describe('marks', () => {
  it('earn "All nine domains touched" with an accepted learning in every domain', () => {
    const one = Object.fromEntries(DOMAINS.map((d) => [LEARN.find((r) => r[2] === d[0])![0], 'accepted' as const]));
    expect(harness({ subject: person({ data: withProgress(one) }) }).vm().marks).toContain('All nine domains touched');
  });
  it('are hidden when the marks prop is off', () => {
    expect(harness({ config: { showMarks: false } }).vm().showStreak).toBe(false);
    expect(harness().vm().showStreak).toBe(true);
  });
});

describe('map copy', () => {
  it('names the counsellor in the legend, or says counsellor', () => {
    expect(harness().vm().legendItems[2].label).toBe('Awaiting counsellor');
    expect(harness({ subject: person({ counsellor: { id: 'c1', name: 'Sam Coach' } }) }).vm().legendItems[2].label).toBe('Awaiting Sam');
  });
  it('explains the hint outside zoom', () => {
    expect(harness().vm().cHint).toBe('Click a dot or a domain. Press + or double-click a domain to zoom in.');
  });
  it('tells a viewer that the person they view has no line', () => {
    const vm = harness({ subject: person({ businessLine: null, readOnly: true }) }).vm();
    expect(vm.noLineNote).toBe('Robin Test has no business line yet, so mandatory and advised items are shown for Consulting. An admin sets the line in User management.');
  });
});
