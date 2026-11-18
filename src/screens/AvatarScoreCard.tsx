// A scored avatar practice, as the learner and their counsellor read it: the AI's reading of each learning point with its comment, then the transcript.
// Honest by design: the score is advice, never progress or a grade, and the AI made it ("Made with AI"). The transcript marks the lines the guardrail held.
import { useState } from 'react';
import { Tag } from '../ds';
import type { AvatarScore } from '../../supabase/functions/_shared/avatarScore.ts';
import type { AvatarTurn } from '../lib/avatarStore';
import AiMadeTag from './AiMadeTag';

/** What the learner is told about their score; the counsellor's row says the same of "what the learner said". */
export const LEARNER_SCORE_NOTE = 'Scored by AI from what you said · advice, never progress · your counsellor confirms it if you share it';
export const COUNSELLOR_SCORE_NOTE = 'Scored by AI from what the learner said · advice, never progress';
const small = { fontSize: 12, color: '#5a6058' } as const;

export function AvatarScoreCard({ score, note }: { score: Omit<AvatarScore, 'flags'>; note: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><AiMadeTag on /><span style={small}>{note}</span></div>
      {score.points.map((p) => (
        <div key={p.id} style={{ background: '#fafbf8', border: '1px solid #eef0ea', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}><b>{p.text}</b><Tag tone="neutral">{p.score + ' · ' + p.band}</Tag></div>
          <div style={{ marginTop: 3 }}>{p.comment}</div>
        </div>
      ))}
      {score.strengths.length > 0 && <div><b>Strengths</b> · {score.strengths.join(' · ')}</div>}
      {score.missed.length > 0 && <div><b>Missed</b> · {score.missed.join(' · ')}</div>}
      {score.summary && <div style={{ textWrap: 'pretty' }}>{score.summary}</div>}
    </div>
  );
}

// The turns are given, or loaded when the disclosure is first opened (a counsellor's list holds no transcripts). A held line is marked, never shown.
export function AvatarTranscript({ turns: given, load }: { turns?: AvatarTurn[]; load?: () => Promise<AvatarTurn[]> }) {
  const [turns, setTurns] = useState<AvatarTurn[] | null>(given ?? null);
  const [problem, setProblem] = useState('');
  const open = (e: { currentTarget: HTMLDetailsElement }) => {
    if (e.currentTarget.open && !turns && load) load().then(setTurns, (err) => setProblem((err as Error).message));
  };
  return (
    <details style={{ fontSize: 12.5 }} onToggle={open}>
      <summary style={{ cursor: 'pointer', color: '#2f6fa8' }}>Transcript{turns ? ' · ' + turns.length + ' lines' : ''}</summary>
      {problem && <div style={{ color: '#a33' }}>{problem}</div>}
      {!turns && !problem && <div style={small}>Loading the transcript</div>}
      <ol style={{ margin: '6px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(turns || []).map((t, k) => (
          <li key={k}>
            <b>{t.who === 'learner' ? 'Learner' : 'Character'}</b> · {t.guard ? <i>Held back by the guardrail · the character answered in role</i> : <span>{t.text}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}
