// View-model of the v4 formats on the detail page (flash cards, practice exam, case exercise, teach-back, stretch
// assignment, webinar, job aid) and their library covers. Panels exist only when the learning has content (from the
// database); the study formats live in fmtStudy.ts. In View as every action is a no-op and the panels show no buttons.
// Case and Stretch go to the counsellor through the existing evidence flow (recordVals submit); Webinar completes through
// the existing classroom feedback card; Job aid completes when every item is ticked. The interactive explainer is in
// fmtExplainer.ts, a course in fmtCourse.ts, the Animated flow in fmtMotion.ts, a Presentation in fmtHorizon.ts, a deck in fmtSlides.ts, a podcast (stored or v3) in fmtPodcast.ts, a reel (studio or v3) in fmtReel.ts, a game and its runs in fmtGame.ts.
import { completedToast, contentOf, detailOf, downloadText, handedIn, saveDetail } from './fmtShared';
import { courseVals } from './fmtCourse';
import { explainerVals } from './fmtExplainer';
import { avatarVals } from './fmtAvatar';
import { gameVals } from './fmtGame';
import { flowVals } from './fmtMotion';
import { horizonVals } from './fmtHorizon';
import { podcastVals } from './fmtPodcast';
import { reelVals, seededReel } from './fmtReel';
import { slidesVals } from './fmtSlides';
import { examVals, flashVals, teachVals } from './fmtStudy';
import { MEDIA } from './data';
import { countLabel } from './logic/formats';
import { seededPodcast } from './logic/podcastContent';
import { webinarIcs } from './logic/ics';
import { fmtHours } from './logic/trajectoryView';
import { submit } from './recordVals';
import { examTrajectory } from './trajectoryVals';
import type { Item, Logic } from './model';
import type { AidContent, CaseContent, StretchContent, WebinarContent } from './types';

const numbered = (items: string[]) => items.map((t, k) => ({ n: k + 1 + '.', t }));
const toggled = (list: number[], k: number) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]).sort((a, b) => a - b);

// The case panel's content, for the learner and for the studio preview.
const caseView = (c: CaseContent, sub: string) => ({ sub, brief: c.brief, deliv: numbered(c.deliv), rubric: c.rubric.map((t) => ({ t })), reviewer: c.reviewer });
// The Case Studio's preview: the case as learners read it, with the hours it will count, without the hand-in (that needs a
// learning and the evidence flow).
export const casePreview = (c: CaseContent, hours: number) => ({ ...caseView(c, fmtHours(hours) + ' · anonymised · learners share a link, not the file'), ro: true, handed: false, submitLabel: '', note: '', submit: () => {} });

function caseVals(L: Logic, it: Item, c: CaseContent) {
  const handed = handedIn(it);
  return {
    ro: L.subject.readOnly, ...caseView(c, it.hoursLabel + ' · anonymised · share a link, not the file'),
    handed, submitLabel: it.state === 'accepted' ? 'Accepted' : handed ? 'Handed in' : 'Hand in',
    note: it.state === 'accepted' ? 'Reviewed and accepted.' : handed ? 'Sent to ' + L.counsellorFull() + ' for review.' : 'Add the link to your deliverable in the evidence below (no client names), then hand in.',
    submit: () => submit(L, it),
  };
}

function stretchVals(L: Logic, it: Item, c: StretchContent) {
  const ticked = detailOf<'stretch'>(L, it.id).checks ?? [], handed = handedIn(it), boss = L.counsellorFirst();
  return {
    ro: L.subject.readOnly, sub: it.hoursLabel + ' on the job · ' + it.source, brief: c.brief,
    checks: c.checks.map((t, k) => ({ t, on: ticked.includes(k), toggle: () => saveDetail(L, it, { checks: toggled(ticked, k) }) })),
    handed, agreeLabel: handed ? 'Sent to ' + boss : 'Agree with ' + boss,
    note: countLabel(ticked.length, c.checks.length, 'checkpoints') + ' done. ' + (handed ? L.counsellorFull() + ' has your reflection.' : L.subject.readOnly ? 'Not handed in yet.' : 'Write your reflection in the evidence below (at least 140 characters); ' + L.counsellorFull() + ' confirms the engagement and when it counts.'),
    agree: () => submit(L, it),
  };
}

function webinarVals(L: Logic, it: Item, c: WebinarContent) {
  const registered = detailOf<'webinar'>(L, it.id).registered ?? false, ics = webinarIcs(it.title, c.when);
  return {
    ro: L.subject.readOnly, sub: c.when, mon: c.mon, day: c.day, time: c.time, speakers: c.speakers, agenda: numbered(c.agenda),
    registered, regLabel: registered ? 'I’ll attend ✓' : 'I’ll attend', register: () => saveDetail(L, it, { registered: !registered }),
    ics, calendar: () => { if (ics) downloadText(it.title + '.ics', ics, 'text/calendar'); },
  };
}

// The job aid panel over a list of ticks and where they go: the learner's progress (saved), or a studio preview's own
// state (a play-test, never saved).
export function aidView(c: AidContent, ticks: number[], setTicks: (next: number[]) => void, o: { ro: boolean; saved: boolean }) {
  return {
    ro: o.ro, sub: 'One page · ' + c.items.length + ' checks · ' + (o.saved ? 'tick them while you work; the ticks are saved with your progress' : 'tick them to try it'),
    items: c.items.map((t, k) => ({ t, on: ticks.includes(k), toggle: () => setTicks(toggled(ticks, k)) })), count: countLabel(ticks.length, c.items.length, 'ticked'),
    print: () => window.print(), reset: () => setTicks([]),
  };
}

// Every item ticked completes the learning; clearing the ticks never undoes it.
function aidVals(L: Logic, it: Item, c: AidContent) {
  const ticks = detailOf<'aid'>(L, it.id).ticks ?? [];
  return aidView(c, ticks, (next) => saveDetail(L, it, { ticks: next }, { complete: next.length > 0 && next.length === c.items.length, done: completedToast(it, 'Every item ticked') }),
    { ro: L.subject.readOnly, saved: true });
}

export function fmtVals(L: Logic, it: Item) {
  const flash = contentOf(it.id, 'flash'), exam = contentOf(it.id, 'exam'), kase = contentOf(it.id, 'case'), teach = contentOf(it.id, 'teach');
  const stretch = contentOf(it.id, 'stretch'), webinar = contentOf(it.id, 'webinar'), aid = contentOf(it.id, 'aid'), explainer = contentOf(it.id, 'explainer'), motion = contentOf(it.id, 'motion');
  const course = contentOf(it.id, 'course'), horizon = contentOf(it.id, 'horizon'), slides = contentOf(it.id, 'slides'), game = contentOf(it.id, 'game');
  // A v3 episode has no stored content: its chapters (MEDIA) play on the same player.
  const M = MEDIA[it.id], podcast = contentOf(it.id, 'podcast') ?? (M?.kind === 'pod' ? seededPodcast(M) : null);
  // A v3 reel is content too: captions as scenes, the takeaway from the catalogue. A studio reel has no takeaway of its own yet.
  const reel = contentOf(it.id, 'reel') ?? (M?.kind === 'reel' ? seededReel(M) : null);
  return {
    isFlash: !!flash, isExam: !!exam, isCase: !!kase, isTeach: !!teach, isStretch: !!stretch, isWebinar: !!webinar, isAid: !!aid,
    fl: flash && flashVals(L, it, flash), ex: exam && { ...examVals(L, it, exam), ...examTrajectory(L, it.id) }, ce: kase && caseVals(L, it, kase), tb: teach && teachVals(L, it, teach),
    sa: stretch && stretchVals(L, it, stretch), wb: webinar && webinarVals(L, it, webinar), ja: aid && aidVals(L, it, aid), ie: explainer && explainerVals(L, it, explainer),
    af: motion && flowVals(L, it, motion), hz: horizon && horizonVals(L, it, horizon), sl: slides && slidesVals(L, it, slides), pc: podcast && podcastVals(L, it, podcast, M?.kind === 'pod' ? M.by : undefined), gm: game && gameVals(L, it, game),
    rl: reel && reelVals(L, it, reel, M?.kind === 'reel' ? M.take : null), av: avatarVals(L, it), co: course && courseVals(L, it, course),
  };
}
