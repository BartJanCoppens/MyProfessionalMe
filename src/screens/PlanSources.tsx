// The source documents of a trajectory plan (Phase 7): the PDFs an admin added, what was read from each, and the upload. It only
// reads from the panel (sourcesPanel in trajectoryAiSources.ts). View as shows the list and nothing to change.
import { SOURCE_CAPS } from '../logic/planSources';
import { PLAN_POOL } from '../logic/planPool';
import type { SourcesPanel } from '../trajectoryAiSources';
import { ItemRows, Problems } from './CreateShared';

const UPLOAD = `PDF only, up to ${SOURCE_CAPS.bytes / 1024 / 1024} MB and ${SOURCE_CAPS.pages} pages. The text is read in your browser; scanned PDFs are not read. Upload only documents the firm may use for training (syllabi, regulations, public guidance): no client documents.`;
const POOL = `Each message sends the plan, the last messages and at most ${PLAN_POOL.passages} matching or cited passages, never a whole document.`;

export default function PlanSources({ p }: { p: SourcesPanel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8' }}>
      <ItemRows head="Source documents" rows={p.rows.map((r) => ({
        cells: [<div key="t"><div style={{ fontWeight: 500 }}>{r.title}</div><div style={{ color: '#8b918a' }}>{r.by}</div></div>,
          <div key="n" style={{ color: '#7a5000' }}>{r.notes.map((n) => <div key={n}>{n}</div>)}</div>],
        remove: r.remove, removeTitle: 'Remove ' + r.title,
      }))} />
      {!p.rows.length && <div style={{ fontSize: 12, color: '#8b918a' }}>No documents yet.</div>}
      {p.canEdit && (
        <>
          <div style={{ fontSize: 12, color: '#5a6058', textWrap: 'pretty' }}>{UPLOAD}</div>
          <label style={{ fontSize: 12.5, color: '#3d423b' }}>
            Add a PDF <input type="file" accept={p.accept} aria-label="PDF source" onChange={p.add} disabled={p.busy} style={{ fontSize: 12 }} />
          </label>
        </>
      )}
      {p.busy && <div role="status" style={{ fontSize: 12.5, color: '#5a6058' }}>Reading the document</div>}
      <Problems list={p.error ? [p.error] : []} />
      <div style={{ fontSize: 12, color: '#5a6058', textWrap: 'pretty' }}>{POOL}</div>
    </div>
  );
}
