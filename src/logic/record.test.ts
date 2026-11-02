// Evidence rules per format, decisions, waiting time and last activity (F2, F3).
import { describe, expect, it } from 'vitest';
import { LEARN } from '../data';
import {
  NO_EVIDENCE, completionOf, completionText, completionTodo, decisionLine, decisionsFor, evidenceNeed, evidenceProblem, evidenceRule, feedbackProblem, fieldProblem, lastActivity,
  lastActivityLabel, linkProblem, openChanges, ruleText, selfCompletes, waitingLabel, workingDaysSince,
} from './record';
import type { Decision } from './record';

const ev = (o: Partial<typeof NO_EVIDENCE> = {}) => ({ ...NO_EVIDENCE, ...o });
const long = 'x'.repeat(140);

describe('evidence rule per format (Q7, F2-a)', () => {
  it('asks a certificate of a certification, a reflection of reading and practice, nothing of the rest', () => {
    const rules = Object.fromEntries(['Certification', 'Book', 'Website', 'Mentoring', 'Coaching', 'Game', 'Micro-guide', 'Case write-up', 'Classroom', 'E-learning', 'Avatar', 'Podcast', 'Reel', 'Something new']
      .map((f) => [f, evidenceRule(f)]));
    expect(rules).toEqual({
      Certification: 'certificate', Book: 'reflection', Website: 'reflection', Mentoring: 'reflection', Coaching: 'reflection', Game: 'reflection', 'Micro-guide': 'reflection',
      'Case write-up': 'reflection', Classroom: 'none', 'E-learning': 'none', Avatar: 'none', Podcast: 'none', Reel: 'none', 'Something new': 'none',
    });
  });
  it('covers every format in the catalogue', () => {
    const formats = Array.from(new Set(LEARN.map((r) => r[4])));
    expect(formats.filter((f) => !['Certification', 'Book', 'Website', 'Mentoring', 'Coaching', 'Game', 'Classroom', 'E-learning', 'Avatar', 'Podcast', 'Reel'].includes(f))).toEqual([]);
  });
  it('accepts a certificate link or number', () => {
    expect(evidenceProblem('Certification', ev())).toBe('Add a link to your certificate or its number to submit');
    expect(evidenceProblem('Certification', ev({ link: 'https://sharepoint.example/cert.pdf' }))).toBeNull();
    expect(evidenceProblem('Certification', ev({ ref: 'AZ900-1' }))).toBeNull();
    expect(evidenceProblem('Certification', ev({ ref: '   ' }))).not.toBeNull();
  });
  it('needs a reflection of at least 140 characters, not counting spaces around it', () => {
    expect(evidenceNeed('Book', ev({ note: 'x'.repeat(139) }))).toBe('a reflection of at least 140 characters');
    expect(evidenceNeed('Book', ev({ note: '  ' + 'x'.repeat(139) + '  ' }))).not.toBeNull();
    expect(evidenceProblem('Book', ev({ note: long }))).toBeNull();
    expect(evidenceProblem('Mentoring', ev({ link: 'https://x.example' }))).toBe('Add a reflection of at least 140 characters to submit');
  });
  it('needs nothing for a classroom or e-learning, but still checks what is given', () => {
    expect(evidenceProblem('Classroom', ev())).toBeNull();
    expect(evidenceProblem('E-learning', ev({ link: 'sharepoint/cert.pdf' }))).toBe('The link must be a web address starting with https://');
  });
  it('checks links and lengths like the database', () => {
    expect(linkProblem('')).toBeNull();
    expect(linkProblem('http://x.example/a')).toBeNull();
    expect(linkProblem('https://x.example/a b')).not.toBeNull();
    expect(linkProblem('https://' + 'x'.repeat(500))).not.toBeNull();
    expect(fieldProblem(ev({ note: 'x'.repeat(2001) }))).toBe('Keep the reflection to 2000 characters');
    expect(fieldProblem(ev({ ref: 'x'.repeat(81) }))).toBe('Keep the certificate number to 80 characters');
  });
  it('explains the rule and that files are linked', () => {
    expect(ruleText('Certification', 'Sam Coach')).toBe('A certification counts once Sam Coach sees the certificate: add a link to it, or its certificate number.');
    expect(ruleText('Book', 'your counsellor')).toMatch(/^Write what you took from this book \(at least 140 characters\)\. Your counsellor reads it/);
    expect(ruleText('Classroom', 'Sam Coach')).toMatch(/^No evidence needed: Sam Coach confirms it/);
  });
});

describe('decisions', () => {
  const d = (o: Partial<Decision>): Decision => ({ learningId: 'L3', verdict: 'accepted', comment: '', by: 'c1', byName: 'Sam Coach', at: '2026-10-30T10:00:00Z', evidence: ev(), ...o });
  const all = [d({ verdict: 'changes', comment: 'Add an example.', at: '2026-10-29T10:00:00Z' }), d({ at: '2026-10-31T10:00:00Z' }), d({ learningId: 'L4' })];
  it('lists one learning newest first', () => {
    expect(decisionsFor(all, 'L3').map((x) => x.verdict)).toEqual(['accepted', 'changes']);
    expect(decisionsFor(undefined, 'L3')).toEqual([]);
  });
  it('has an open request for changes only while the learning is back in progress', () => {
    const back = [d({ verdict: 'changes', comment: 'Add an example.' })];
    expect(openChanges(back, 'L3', 'in-progress')?.comment).toBe('Add an example.');
    expect(openChanges(back, 'L3', 'submitted')).toBeNull();
    expect(openChanges(all, 'L3', 'in-progress')).toBeNull();
  });
  it('names who decided from the viewer\'s side', () => {
    expect(decisionLine(d({ comment: 'Well done.' }), 'u1', 'u1')).toEqual({ label: 'Accepted by Sam Coach', date: '30 Oct 2026', comment: 'Well done.', tone: 'green' });
    expect(decisionLine(d({ verdict: 'changes' }), 'u1', 'c1').label).toBe('Changes requested by you');
    expect(decisionLine(d({ verdict: 'self_completed', by: 'u1', byName: 'Robin Test' }), 'u1', 'u1').label).toBe('Completed by you · counts without acceptance');
    expect(decisionLine(d({ verdict: 'self_completed', by: 'u1', byName: 'Robin Test' }), 'u1', 'c1').label).toBe('Completed by Robin Test · counts without acceptance');
    expect(decisionLine(d({ by: null, byName: '' }), 'u1', 'u1').label).toBe('Accepted by a former colleague');
  });
});

describe('waiting and last activity (F3)', () => {
  const now = new Date('2026-11-09T12:00:00Z'); // a Monday
  it('counts working days since the submission', () => {
    expect(workingDaysSince('2026-11-06T16:00:00Z', now)).toBe(1); // Friday
    expect(workingDaysSince('2026-11-02T08:00:00Z', now)).toBe(5); // last Monday
    expect(workingDaysSince('2026-10-30T08:00:00Z', now)).toBe(6);
    expect(workingDaysSince('2026-11-09T08:00:00Z', now)).toBe(0);
    expect(workingDaysSince(null, now)).toBe(0);
  });
  it('turns amber after five working days', () => {
    expect(waitingLabel('2026-11-02T08:00:00Z', now)).toEqual({ days: 5, late: false, text: 'Submitted 2 Nov 2026 · 5 working days' });
    expect(waitingLabel('2026-10-30T08:00:00Z', now)).toMatchObject({ late: true, text: 'Submitted 30 Oct 2026 · 6 working days' });
    expect(waitingLabel('2026-11-09T08:00:00Z', now).text).toBe('Submitted 9 Nov 2026 · today');
    expect(waitingLabel(null, now).text).toBe('today');
  });
  it('labels the last activity', () => {
    expect(lastActivityLabel('2026-11-09T07:00:00Z', now)).toBe('Today');
    expect(lastActivityLabel('2026-11-08T23:00:00Z', now)).toBe('Yesterday');
    expect(lastActivityLabel('2026-11-05T10:00:00Z', now)).toBe('4 days ago');
    expect(lastActivityLabel('2026-10-19T10:00:00Z', now)).toBe('3 weeks ago');
    expect(lastActivityLabel('2026-11-02T10:00:00Z', now)).toBe('1 week ago');
    expect(lastActivityLabel('2026-08-01T10:00:00Z', now)).toBe('3 months ago');
    expect(lastActivityLabel('2025-01-01T10:00:00Z', now)).toBe('Over a year ago');
    expect(lastActivityLabel(null, now)).toBe('No activity yet');
  });
  it('takes the latest own change across the progress rows', () => {
    expect(lastActivity({ L1: { updatedAt: '2026-10-01T00:00:00Z' }, L2: { updatedAt: '2026-10-20T00:00:00Z' }, L3: {} })).toBe('2026-10-20T00:00:00Z');
    expect(lastActivity({})).toBeNull();
  });
});

describe('completion per learning type (owner, 2 Nov 2026)', () => {
  it('completes podcasts, reels, e-learnings, classrooms and avatar practice without a counsellor; the rest by acceptance', () => {
    const kinds = Object.fromEntries(['Podcast', 'Reel', 'E-learning', 'Classroom', 'Avatar', 'Certification', 'Book', 'Website', 'Mentoring', 'Game', 'Micro-guide', 'Case write-up', 'Something new']
      .map((f) => [f, completionOf(f)]));
    expect(kinds).toEqual({
      Podcast: 'media', Reel: 'media', 'E-learning': 'mark', Classroom: 'feedback', Avatar: 'quiz', Certification: 'acceptance', Book: 'acceptance', Website: 'acceptance',
      Mentoring: 'acceptance', Game: 'acceptance', 'Micro-guide': 'acceptance', 'Case write-up': 'acceptance', 'Something new': 'acceptance',
    });
    expect(['Podcast', 'Reel', 'E-learning', 'Classroom', 'Avatar'].every(selfCompletes)).toBe(true);
    expect(selfCompletes('Certification')).toBe(false);
  });
  it('checks the classroom feedback: a rating 1 to 5 and at least 40 characters on what you will apply', () => {
    const apply = 'I will open every workshop with the issue tree.';
    expect(feedbackProblem(null, apply)).toBe('Rate the session from 1 to 5');
    expect(feedbackProblem(0, apply)).toBe('Rate the session from 1 to 5');
    expect(feedbackProblem(6, apply)).toBe('Rate the session from 1 to 5');
    expect(feedbackProblem(4, 'Good day.')).toBe('Say what you will apply (at least 40 characters)');
    expect(feedbackProblem(4, ' '.repeat(50) + 'x'.repeat(39))).toBe('Say what you will apply (at least 40 characters)');
    expect(feedbackProblem(4, 'x'.repeat(2001))).toBe('Keep it to 2000 characters');
    expect(feedbackProblem(1, apply)).toBeNull();
    expect(feedbackProblem(5, 'x'.repeat(40))).toBeNull();
  });
  it('says what completes each type, and what is left once the hours are logged', () => {
    expect(completionText('Podcast', 'Sam Coach')).toBe('Listening to 80% completes it. It counts right away; no acceptance needed.');
    expect(completionText('Reel', 'Sam Coach')).toBe('A right answer to the question completes it. It counts right away; no acceptance needed.');
    expect(completionText('E-learning', 'Sam Coach')).toBe('Mark it as completed when you have finished the course. It counts right away; no acceptance needed.');
    expect(completionText('Classroom', 'Sam Coach')).toBe('It completes when the faculty registers your attendance, or when you give your feedback on the session. No acceptance needed.');
    expect(completionText('Avatar', 'Sam Coach')).toBe('After your practice session, three right answers in the evaluation quiz complete it. No acceptance needed.');
    expect(completionText('Certification', 'Sam Coach')).toBe('Log your hours and add your evidence; Sam Coach accepts the certification.');
    expect(completionText('Something new', 'Sam Coach')).toBe('Log your hours, then Sam Coach accepts the something new.');
    expect(['E-learning', 'Classroom', 'Avatar', 'Podcast', 'Reel', 'Book'].map(completionTodo)).toEqual(['mark it as completed', 'give your feedback', 'take the evaluation quiz', 'listen to it', 'answer the question', '']);
  });
  it('labels attendance and a completion with feedback in the acceptance record', () => {
    const base: Decision = { learningId: 'L10', verdict: 'attended', comment: '', by: 'a1', byName: 'Pat Admin', at: '2026-11-02T10:00:00Z', evidence: NO_EVIDENCE };
    expect(decisionLine(base, 'u1', 'u1')).toMatchObject({ label: 'Attendance registered by Pat Admin · counts without acceptance', tone: 'green' });
    expect(decisionLine(base, 'u1', 'a1').label).toBe('Attendance registered by you · counts without acceptance');
    expect(decisionLine({ ...base, verdict: 'self_completed', by: 'u1', byName: 'Robin Test', rating: 4 }, 'u1', 'u1').label).toBe('Completed by you with feedback · rated 4 of 5 · counts without acceptance');
  });
});
