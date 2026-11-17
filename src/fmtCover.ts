// The library cover lines of the v4 formats (cvMeta, cvMeta2 and the little bars), from the catalogue content and what
// this person has saved. The flags follow the format, so a cover is drawn even before its content has loaded.
import { LEARN_META } from './data';
import { detailOf, handedIn } from './fmtShared';
import { countLabel, dueCards } from './logic/formats';
import type { Item, Logic } from './model';

const KIND: Record<string, string> = { 'Flash cards': 'flash', 'Practice exam': 'exam', 'Case exercise': 'case', 'Teach-back': 'teach', 'Stretch assignment': 'stretch', Webinar: 'webinar', 'Job aid': 'aid', 'Interactive explainer': 'explainer' };
type Lines = { cvMeta: string; cvMeta2: string; exBars: { w: string; c: string }[]; aidRows: { bg: string }[]; stepDots: { bg: string }[] };

function lines(L: Logic, it: Item): Partial<Lines> {
  const c = LEARN_META[it.id]?.content, done = it.state === 'accepted';
  switch (c?.kind) {
    case 'flash': {
      const due = detailOf<'flash'>(L, it.id).due;
      return { cvMeta: c.cards.length + ' cards', cvMeta2: done ? 'All reviewed' : (due ? dueCards(c, { due }, new Date()).length : c.due) + ' due today' };
    }
    case 'exam': {
      const best = detailOf<'exam'>(L, it.id).best;
      return { cvMeta: best != null ? best + '%' : c.bank + ' Q', cvMeta2: best != null ? 'Best score' : 'Not taken yet', exBars: c.qs.map(() => ({ w: (best ?? 20) + '%', c: best != null ? '#86BC25' : 'rgba(255,255,255,.35)' })) };
    }
    case 'case': return { cvMeta: c.deliv.length + ' deliverables', cvMeta2: handedIn(it) ? 'Handed in' : 'Reviewed by your counsellor' };
    case 'teach': {
      const score = detailOf<'teach'>(L, it.id).score;
      return { cvMeta: 'Explain it back', cvMeta2: score != null ? 'Score ' + score + ' of ' + c.crit.length : 'Feedback on your answer' };
    }
    case 'stretch': return { cvMeta: countLabel((detailOf<'stretch'>(L, it.id).checks ?? []).length, c.checks.length, 'checkpoints'), cvMeta2: handedIn(it) ? 'Agreed with ' + L.counsellorFirst() : 'On the job' };
    case 'webinar': return { cvMeta: c.day + ' ' + c.mon.charAt(0) + c.mon.slice(1).toLowerCase() + ' · ' + c.time, cvMeta2: detailOf<'webinar'>(L, it.id).registered ? 'You plan to attend' : 'Live, then recorded' };
    case 'aid': {
      const lit = Math.round((detailOf<'aid'>(L, it.id).ticks ?? []).length / c.items.length * 5);
      return { cvMeta: c.items.length + '-point checklist', cvMeta2: 'One page · PDF', aidRows: [0, 1, 2, 3, 4].map((k) => ({ bg: k < lit ? '#86BC25' : '#fff' })) };
    }
    case 'explainer': {
      const seen = !!detailOf<'explainer'>(L, it.id).last;
      return { cvMeta: c.steps.length + ' steps', cvMeta2: seen ? 'Seen to the end' : c.check ? 'Ends with a check' : 'Click through',
        stepDots: c.steps.slice(0, 6).map((_, k) => ({ bg: seen || k === 0 ? '#86BC25' : '#fff' })) };
    }
    default: return {};
  }
}

export function fmtCover(L: Logic, it: Item) {
  const kind = KIND[it.format];
  return {
    cvFlash: kind === 'flash', cvExam: kind === 'exam', cvCase: kind === 'case', cvTeach: kind === 'teach', cvStretch: kind === 'stretch', cvWebinar: kind === 'webinar', cvAid: kind === 'aid', cvExplainer: kind === 'explainer',
    ...(kind ? lines(L, it) : {}),
  };
}
