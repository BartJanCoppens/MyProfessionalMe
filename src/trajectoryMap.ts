// The certification layer of My growth map (design v4): the viewed person's enrolled trajectories as threads and diamonds on the
// constellation, polygons on the radar, lanes on the road, and a dock. Geometry is in logic/certLayer.ts, drawing in screens/MapCert.tsx.
// It only reads (View as shows the viewed person's trajectories), so nothing here writes.
import { DOMAINS, TARGET } from './data';
import { certConstellation, certDockRows, certRadar, certRoadLanes } from './logic/certLayer';
import type { CertEntry, NodePos } from './logic/certLayer';
import { trajectoryProgress } from './logic/trajectory';
import type { Item, Logic } from './model';
import type { AppState } from './types';
import { context, credentialEarned, enrolmentOf, openTrajectory } from './trajectoryCtx';

// What to clear when the viewed person changes: the dock and the radar focus belong to one person.
export const certResetPatch = (s: AppState): Partial<AppState> => ({ certFocus: null, ...(s.sel?.type === 'cert' ? { sel: null } : {}) });

export function certMapVals(L: Logic, byId: Record<string, Item>, nodes: (NodePos & { id: string })[]) {
  const s = L.state, c = context(L, byId), sel = s.sel, dockOpen = sel?.type === 'cert';
  const entries: CertEntry[] = [];
  s.trjs.forEach((t) => {
    const e = enrolmentOf(c, t);
    if (e?.status === 'enrolled') entries.push({ t, e, pg: trajectoryProgress(t, e, byId), earned: credentialEarned(c, t), open: () => openTrajectory(L, t.id, 'map') });
  });
  const layer = s.certOn ? entries : [];
  const titleOf = (id: string) => byId[id]?.title ?? 'A learning that is no longer in the library';
  const pos: Record<string, NodePos> = {};
  nodes.forEach((n) => { pos[n.id] = n; });
  const dim = sel && sel.type !== 'cert' ? 0.25 : 1;
  const rows = certDockRows(layer, titleOf, L.counsellorFull());
  return {
    certChip: { on: s.certOn, count: String(entries.length), toggle: () => L.setState({ certOn: !s.certOn, sel: dockOpen ? null : s.sel }) },
    hasCert: layer.length > 0,
    cCert: certConstellation(layer, pos, dim),
    rCert: certRadar(layer, byId, DOMAINS.map((d): [string, string] => [d[0], d[1]]), L.levels, TARGET, s.certFocus, (id) => L.setState({ certFocus: id })),
    certLanes: certRoadLanes(layer, titleOf, L.counsellorFull()),
    dockCert: dockOpen && layer.length > 0, certDock: rows,
    certDockLabel: dockOpen ? 'Hide my certifications' : 'My certifications',
    certDockSub: rows.length + (rows.length === 1 ? ' trajectory' : ' trajectories') + ' · shown in gold on every view of your map · click one to open it',
    toggleCertDock: () => L.setState({ sel: dockOpen ? null : { type: 'cert' } }),
  };
}
