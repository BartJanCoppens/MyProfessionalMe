// View-model of the v4 formats on the detail page (flash cards, practice exam, case exercise, teach-back, stretch
// assignment, webinar, job aid) and their library covers. Panels exist only when the learning has content (from the
// database); the study formats live in fmtStudy.ts. In View as every action is a no-op and the panels show no buttons.
// Case and Stretch go to the counsellor through the existing evidence flow (recordVals submit); Webinar completes through
// the existing classroom feedback card; Job aid completes when every item is ticked.
import { completedToast, contentOf, detailOf, downloadText, handedIn, saveDetail } from './fmtShared';
import { examVals, flashVals, teachVals } from './fmtStudy';
import { countLabel } from './logic/formats';
import { webinarIcs } from './logic/ics';
import { submit } from './recordVals';
import { examTrajectory } from './trajectoryVals';
import type { Item, Logic } from './model';
import type { AidContent, CaseContent, StretchContent, WebinarContent } from './types';

const numbered = (items: string[]) => items.map((t, k) => ({ n: k + 1 + '.', t }));
const toggled = (list: number[], k: number) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]).sort((a, b) => a - b);

function caseVals(L: Logic, it: Item, c: CaseContent) {
  const handed = handedIn(it);
  return {
    ro: L.subject.readOnly, sub: it.hoursLabel + ' · anonymised · share a link, not the file', brief: c.brief, deliv: numbered(c.deliv), rubric: c.rubric.map((t) => ({ t })), reviewer: c.reviewer,
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

function aidVals(L: Logic, it: Item, c: AidContent) {
  const ticks = detailOf<'aid'>(L, it.id).ticks ?? [];
  const tick = (k: number) => { const next = toggled(ticks, k); saveDetail(L, it, { ticks: next }, { complete: next.length === c.items.length, done: completedToast(it, 'Every item ticked') }); };
  return {
    ro: L.subject.readOnly, sub: 'One page · ' + c.items.length + ' checks · tick them while you work; the ticks are saved with your progress',
    items: c.items.map((t, k) => ({ t, on: ticks.includes(k), toggle: () => tick(k) })), count: countLabel(ticks.length, c.items.length, 'ticked'),
    print: () => window.print(), reset: () => saveDetail(L, it, { ticks: [] }),
  };
}

export function fmtVals(L: Logic, it: Item) {
  const flash = contentOf(it.id, 'flash'), exam = contentOf(it.id, 'exam'), kase = contentOf(it.id, 'case'), teach = contentOf(it.id, 'teach');
  const stretch = contentOf(it.id, 'stretch'), webinar = contentOf(it.id, 'webinar'), aid = contentOf(it.id, 'aid');
  return {
    isFlash: !!flash, isExam: !!exam, isCase: !!kase, isTeach: !!teach, isStretch: !!stretch, isWebinar: !!webinar, isAid: !!aid,
    fl: flash && flashVals(L, it, flash), ex: exam && { ...examVals(L, it, exam), ...examTrajectory(L, it.id) }, ce: kase && caseVals(L, it, kase), tb: teach && teachVals(L, it, teach),
    sa: stretch && stretchVals(L, it, stretch), wb: webinar && webinarVals(L, it, webinar), ja: aid && aidVals(L, it, aid),
  };
}
