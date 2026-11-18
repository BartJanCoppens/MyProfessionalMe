// The practice runs people shared with the signed-in person, as rows of "Waiting for you": the AI's reading with its comments, the transcript (read when it
// is opened) and the counsellor's note. Text only: a run is its words (nothing here plays or mentions a recording). A confirmed run leaves the queue.
import { Button, Input } from '../ds';
import type { VM } from '../model';
import { AvatarScoreCard, AvatarTranscript, COUNSELLOR_SCORE_NOTE } from './AvatarScoreCard';
import QueueRow from './QueueRow';

type Row = NonNullable<VM['appr']>['shared'][number];

export default function SharedRuns({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map((r) => (
        <QueueRow key={r.key} initials={r.initials} name={r.name} sub={r.sub} actions={(
          <>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.prompt}</div>
            <Input value={r.comment} onChange={r.setComment} placeholder="Your note (optional)" aria-label={'Note for ' + r.name} />
            <div style={{ fontSize: 11.5, color: '#8b918a', textAlign: 'right' }}>{r.commentCount}</div>
            <Button fullWidth onClick={r.confirm}>Confirm</Button>
          </>
        )}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.headline}</div>
          <AvatarScoreCard score={r.score} note={COUNSELLOR_SCORE_NOTE} />
          <AvatarTranscript load={r.loadTurns} />
        </QueueRow>
      ))}
    </>
  );
}
