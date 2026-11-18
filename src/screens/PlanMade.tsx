// The actions of a placeholder step ("being made") and of the plan's placeholders as a whole: "Draft with AI", the draft already made (with its status),
// and "Draft all N with AI" with how far it is. Read from trajectoryMadeVals.ts; nothing is shown to someone who may not change the trajectory.
import { Button } from '../ds';
import type { Tai } from '../trajectoryAiVals';
import type { madeVals } from '../trajectoryMadeVals';

type Made = ReturnType<typeof madeVals>;

export function MadeActions({ made }: { made: Made }) {
  if (!made.draft && !made.open && !made.status) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {made.draft && <Button size="sm" variant="secondary" onClick={made.draft}>{made.draftLabel}</Button>}
      {made.open && <Button size="sm" variant="secondary" onClick={made.open}>{made.openLabel}</Button>}
      {made.status && <span style={{ fontSize: 12, color: '#5a6058' }}>{made.status}</span>}
    </span>
  );
}

export function DraftAll({ draft }: { draft: NonNullable<Tai['draftAll']> }) {
  return (
    <div style={{ border: '1px solid #e1e5dc', borderRadius: 6, background: '#fff', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" disabled={!!draft.off || !!draft.progress} onClick={draft.run}>{draft.label}</Button>
        {draft.progress && <span role="status" style={{ fontSize: 12.5 }}>{draft.progress}</span>}
        {draft.off && !draft.progress && <span style={{ fontSize: 12, color: '#7a5000' }}>{draft.off}</span>}
      </div>
      <div style={{ fontSize: 12, color: '#5a6058' }}>{draft.note}</div>
    </div>
  );
}
