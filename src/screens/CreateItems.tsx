// Create & share: the cards or questions of a Flash cards / Practice exam contribution. ItemPanel is the New form's
// block (draft, CSV import, the list to check); ItemList shows saved items to the author and to reviewers.
// It only reads from the view-model (createItems.ts).
import { useState } from 'react';
import { Button, Textarea } from '../ds';
import type { VM } from '../model';
import { ItemRows, Problems } from './CreateShared';

type Panel = NonNullable<NonNullable<VM['create']>['itemsPanel']>;

const front = (t: string) => <span style={{ fontWeight: 500, textWrap: 'pretty' }}>{t}</span>;
const back = (t: string) => <span style={{ color: '#3d423b', textWrap: 'pretty' }}>{t}</span>;

export function ItemPanel({ p }: { p: Panel }) {
  const [csv, setCsv] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>Add the {p.noun}</div>
          <div style={{ fontSize: 12, color: '#5a6058' }}>{p.lim}. Draft them from the picked bundles, or import a CSV. You check each one before you submit.</div>
        </div>
        <Button variant="dark" size="sm" onClick={p.draft} disabled={p.busy}>{p.draftLabel}</Button>
      </div>
      <div style={{ fontSize: 12, color: '#5a6058', textWrap: 'pretty' }}>{p.csvHelp}</div>
      <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Paste CSV lines here" aria-label="CSV lines" minHeight={64} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={() => { p.importCsv(csv); setCsv(''); }} disabled={!csv.trim()}>Import CSV</Button>
        <label style={{ fontSize: 12.5, color: '#3d423b' }}>or a file <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={p.importFile} style={{ fontSize: 12 }} /></label>
      </div>
      <Problems list={p.problems} />
      {p.rows.length > 0 && <ItemRows head={p.head} note={p.note} rows={p.rows.map((r, k) => ({ cells: [front(r.front), back(r.back)], remove: r.remove, removeTitle: 'Remove item ' + (k + 1) }))} />}
    </div>
  );
}

export function ItemList({ head, rows }: { head: string; rows: { front: string; back: string }[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea' }}>
      <ItemRows head={head} rows={rows.map((r) => ({ cells: [front(r.front), back(r.back)] }))} />
    </div>
  );
}
