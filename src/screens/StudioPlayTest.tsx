// Studio step "Preview & test": try the draft the way a learner meets it (flip the cards, answer the questions).
// A play-test keeps its state here only: it is never saved, never rated, never counted as progress.
import { useState } from 'react';
import { Button, Card, LinkButton } from '../ds';
import { examScore, examVerdict } from '../logic/formats';
import type { ExamQuestion } from '../types';

const box = { display: 'flex', flexDirection: 'column' as const, gap: 12 };

function Cards({ cards }: { cards: [string, string][] }) {
  const [at, setAt] = useState(0), [flip, setFlip] = useState(false);
  const card = cards[at];
  if (!card) return <div style={{ fontSize: 12.5, color: '#5a6058' }}>No cards to try yet.</div>;
  const last = at + 1 >= cards.length;
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5a6058' }}><span>{at + 1} / {cards.length}</span><span>{flip ? 'Answer' : 'Question'}</span></div>
      <button type="button" onClick={() => setFlip(!flip)} aria-label="Flip the card" style={{ appearance: 'none', font: 'inherit', cursor: 'pointer', minHeight: 130, borderRadius: 8, padding: 16, textAlign: 'center', fontSize: 16, fontWeight: 500,
        border: '1px solid ' + (flip ? '#c9e39a' : '#1a1d18'), background: flip ? '#f6f9ef' : '#fff', color: '#1a1d18', textWrap: 'pretty' }}>{flip ? card[1] : card[0]}</button>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button size="sm" variant="secondary" onClick={() => { setAt(last ? 0 : at + 1); setFlip(false); }}>{last ? 'Start again' : 'Next card'}</Button>
        <span style={{ fontSize: 12, color: '#5a6058' }}>Flip the card, then move on. Nothing is rated.</span>
      </div>
    </div>
  );
}

function Questions({ questions }: { questions: ExamQuestion[] }) {
  const [at, setAt] = useState(0), [pick, setPick] = useState<number | null>(null), [checked, setChecked] = useState(false), [picks, setPicks] = useState<Record<number, number>>({});
  const reset = () => { setAt(0); setPick(null); setChecked(false); setPicks({}); };
  if (!questions.length) return <div style={{ fontSize: 12.5, color: '#5a6058' }}>No questions to try yet.</div>;
  if (at >= questions.length) {
    const score = examScore(questions, picks);
    return <div style={box}><div style={{ fontSize: 22, fontWeight: 600 }}>{score.pct} %</div><div style={{ fontSize: 12.5 }}>{examVerdict(score.pct)}</div><div><LinkButton onClick={reset}>Try another round</LinkButton></div></div>;
  }
  const q = questions[at], right = checked && pick === q.a;
  const main = () => {
    if (!checked) { if (pick !== null) { setChecked(true); setPicks({ ...picks, [at]: pick }); } return; }
    setAt(at + 1); setPick(null); setChecked(false);
  };
  return (
    <div style={box}>
      <div style={{ fontSize: 12, color: '#5a6058' }}>Question {at + 1} of {questions.length} · {q.t}</div>
      <div style={{ fontWeight: 600, fontSize: 15, textWrap: 'pretty' }}>{q.q}</div>
      <div role="radiogroup" aria-label="Answer options" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {q.o.map((label, k) => (
          <button key={k} type="button" role="radio" aria-checked={pick === k} onClick={() => { if (!checked) setPick(k); }} style={{ appearance: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer', padding: '8px 12px', borderRadius: 6,
            border: '1px solid ' + (checked && k === q.a ? '#86BC25' : pick === k ? '#1a1d18' : '#e1e5dc'), background: checked && k === q.a ? '#f6f9ef' : '#fff', color: '#1a1d18' }}>{label}</button>
        ))}
      </div>
      {checked && <div style={{ borderLeft: '3px solid ' + (right ? '#3f6a0a' : '#9a2b22'), padding: '6px 10px', fontSize: 12.5 }}><b>{right ? 'Correct. ' : 'Not quite. '}</b>{q.why}</div>}
      <div><Button size="sm" onClick={main} disabled={!checked && pick === null}>{checked ? (at + 1 >= questions.length ? 'See the score' : 'Next question') : 'Check answer'}</Button></div>
    </div>
  );
}

export default function StudioPlayTest({ preview }: { preview: { kind: 'cards' | 'questions'; cards: [string, string][]; questions: ExamQuestion[] } }) {
  return (
    <Card title={preview.kind === 'cards' ? 'Try the deck' : 'Try the exam'} subtitle="A play-test: it is not saved and does not count as progress.">
      {preview.kind === 'cards' ? <Cards cards={preview.cards} /> : <Questions questions={preview.questions} />}
    </Card>
  );
}
