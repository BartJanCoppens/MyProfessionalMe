// Studio step "Preview & test": try the draft the way a learner meets it (flip the cards, answer the questions).
// A play-test keeps its state here only: it is never saved, never rated, never counted as progress.
import { useState } from 'react';
import { Button, Card, LinkButton } from '../ds';
import { NEW_ROUND, roundView } from '../fmtRound';
import type { RoundState } from '../fmtRound';
import { examVerdict } from '../logic/formats';
import type { ExamQuestion } from '../types';
import QuestionRound from './QuestionRound';

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

// The questions as a round (fmtRound.ts) with its state here only.
function Questions({ questions }: { questions: ExamQuestion[] }) {
  const [d, setD] = useState<RoundState>(NEW_ROUND);
  if (!questions.length) return <div style={{ fontSize: 12.5, color: '#5a6058' }}>No questions to try yet.</div>;
  const r = roundView(questions, d, (p) => setD((cur) => ({ ...cur, ...p })), { locked: () => false, finishLabel: 'See the score', onFinish: () => {} });
  if (r.finished && r.score) {
    return <div style={box}><div style={{ fontSize: 22, fontWeight: 600 }}>{r.score.pct} %</div><div style={{ fontSize: 12.5 }}>{examVerdict(r.score.pct)}</div><div><LinkButton onClick={r.restart}>Try another round</LinkButton></div></div>;
  }
  return <div style={box}><QuestionRound r={r} /></div>;
}

export default function StudioPlayTest({ preview }: { preview: { kind: 'cards' | 'questions'; cards: [string, string][]; questions: ExamQuestion[] } }) {
  return (
    <Card title={preview.kind === 'cards' ? 'Try the deck' : 'Try the exam'} subtitle="A play-test: it is not saved and does not count as progress.">
      {preview.kind === 'cards' ? <Cards cards={preview.cards} /> : <Questions questions={preview.questions} />}
    </Card>
  );
}
