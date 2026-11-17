// Certification trajectories for the learner (design v4): library cards, the trajectory page, the credentials wallet and the
// practice exam's link. The page is in trajectoryPage.ts, the wallet in walletVals.ts, what they share in trajectoryCtx.ts.
import { AUD_INFO } from './data';
import { relevantMap, totals, trajectoryProgress } from './logic/trajectory';
import { enrolLabel, fmtHours } from './logic/trajectoryView';
import type { Item, Logic } from './model';
import type { AppState, Screen } from './types';
import { context, enrolmentOf, mineOf, openTrajectory, visibleTo } from './trajectoryCtx';
import type { Ctx } from './trajectoryCtx';
import { trajectoryPage } from './trajectoryPage';
import { walletVals } from './walletVals';

const BACK: Partial<Record<Screen, string>> = { map: '← Back to my growth map', profile: '← Back to my profile', library: '← Back to library' };

function libraryCards(c: Ctx) {
  const rank = (t: ReturnType<typeof visibleTo>[number]) => (enrolmentOf(c, t) ? 0 : relevantMap(t, [c.L.bl()], c.person.stage) ?? relevantMap(t, [c.L.bl()]) ? 1 : 2);
  const visible = visibleTo(c);
  const cards = visible.slice().sort((a, b) => rank(a) - rank(b)).map((t) => {
    const e = enrolmentOf(c, t), m = relevantMap(t, [c.L.bl()], c.person.stage) ?? relevantMap(t, [c.L.bl()]), pg = trajectoryProgress(t, e, c.byId), tot = totals(t, c.byId);
    const status = e ? (e.status === 'requested' ? 'Waiting for ' + c.boss + ' to approve' : pg.complete ? 'Credential earned' : 'Enrolled · ' + pg.reqDone + ' of ' + pg.reqN + ' required steps')
      : m ? 'For you · via ' + (AUD_INFO[m[0]]?.name ?? m[0]) : 'For ' + (t.maps.map((x) => AUD_INFO[x[0]]?.name ?? x[0]).join(', ') || 'nobody yet');
    return {
      id: t.id, name: t.name, sub: t.issuer + ' · ' + (t.credential || 'credential to be named'),
      meta: t.steps.length + ' steps · ' + fmtHours(tot.tot) + ' over ' + t.months + ' months · ' + enrolLabel(t.enrol).toLowerCase(),
      status, stColor: e ? '#3f6a0a' : m ? '#1d5a8a' : '#5a6058', dot: e ? '#86BC25' : m ? '#2f7fc1' : '#a0a69d', bd: e ? '#86BC25' : '#e1e5dc',
      hasBar: e?.status === 'enrolled', barW: Math.round(pg.reqDone / Math.max(1, pg.reqN) * 100) + '%', open: () => openTrajectory(c.L, t.id, 'library'),
    };
  });
  const issuers = Array.from(new Set(visible.map((t) => t.issuer))).join(', ');
  return { libTrj: cards, hasLibTrj: cards.length > 0, libTrjSub: cards.length + ' open · each ends in a credential from ' + issuers + ' · ' + visible.filter((t) => enrolmentOf(c, t)).length + ' yours' };
}

// The practice exam's link: the first live trajectory (or one the person is enrolled in) that includes this learning.
export function examTrajectory(L: Logic, learningId: string) {
  const enrols = mineOf(L)?.enrols ?? {};
  const t = L.state.trjs.find((x) => (x.status === 'live' || !!enrols[x.id]) && x.steps.some((st) => st.lid === learningId || !!st.opts?.includes(learningId)));
  return { hasTrj: !!t, trjText: t ? 'Part of ' + t.name + '.' : '', openTrj: t ? () => openTrajectory(L, t.id, 'library') : null };
}

export function trajectoryVals(L: Logic, byId: Record<string, Item>) {
  const c = context(L, byId), s = L.state, t = s.trjs.find((x) => x.id === s.trjView);
  return {
    ...libraryCards(c), ...walletVals(c),
    isTrjPage: s.screen === 'trajectory' && !!t, tv: t ? trajectoryPage(c, t) : null,
    trjBack: () => L.go(s.trjOrigin), trjBackLabel: BACK[s.trjOrigin] ?? BACK.library!,
    trjTitle: t ? t.name : 'Certification trajectory',
  };
}

// The screen the sidebar highlights: a trajectory (or a learning opened from one) belongs to where the trajectory was opened.
export function navScreen(s: AppState): Screen {
  if (s.screen === 'trajectory' || (s.screen === 'detail' && s.origin === 'trajectory')) return s.trjOrigin;
  return s.screen === 'detail' ? s.origin : s.screen;
}
