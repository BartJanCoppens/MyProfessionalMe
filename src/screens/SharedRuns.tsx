// The practice runs people shared with the signed-in person, as rows of "Waiting for you": the AI's reading with its comments, the transcript, and the
// counsellor's note. Text only: a run is its words (nothing here plays or mentions a recording).
import { Avatar, Button, Input } from '../ds';
import type { VM } from '../model';
import { AvatarScoreCard, AvatarTranscript, COUNSELLOR_SCORE_NOTE } from './AvatarScoreCard';

type Row = NonNullable<VM['appr']>['shared'][number];
const box = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '16px 18px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' } as const;

export default function SharedRuns({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} style={box}>
          <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar initials={r.initials} />
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{r.sub}</div></div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.headline}</div>
            <AvatarScoreCard score={r.score} note={COUNSELLOR_SCORE_NOTE} />
            <AvatarTranscript turns={r.turns} />
          </div>
          <div style={{ flex: '0 1 280px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {r.confirmed ? (
              <div style={{ fontSize: 12.5 }}><div style={{ fontWeight: 600 }}>{r.confirmed.line}</div><div style={{ color: '#8b918a' }}>{r.confirmed.by}</div></div>
            ) : (
              <>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.prompt}</div>
                <Input value={r.comment} onChange={r.setComment} placeholder="Your note (optional)" aria-label={'Note for ' + r.name} />
                <div style={{ fontSize: 11.5, color: '#8b918a', textAlign: 'right' }}>{r.commentCount}</div>
                <Button fullWidth onClick={r.confirm}>Confirm</Button>
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
