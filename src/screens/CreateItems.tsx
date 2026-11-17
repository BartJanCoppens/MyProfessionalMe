// Create & share: the cards or questions of a Flash cards / Practice exam contribution. ItemPanel is the New form's
// block (draft, CSV import, the list to check); ItemList shows saved items to the author and to reviewers.
// It only reads from the view-model (createItems.ts).
import { useState } from 'react';
import { Button, LinkButton, Tag, Textarea } from '../ds';
import type { VM } from '../model';

type Panel = NonNullable<NonNullable<VM['create']>['itemsPanel']>;
const label = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase' as const, letterSpacing: '.04em' };
const row = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 10, alignItems: 'start', fontSize: 12.5, border: '1px solid #eef0ea', borderRadius: 5, padding: '6px 10px', background: '#fff' };

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
      {p.problems.map((x) => <div key={x} role="alert" style={{ fontSize: 12, color: '#7a5000' }}>{x}</div>)}
      {p.rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={label}>{p.head}</span>{p.note && <Tag tone="blue">{p.note}</Tag>}</div>
          {p.rows.map((r, k) => (
            <div key={k} style={row}>
              <span style={{ fontWeight: 500, textWrap: 'pretty' }}>{r.front}</span><span style={{ color: '#3d423b', textWrap: 'pretty' }}>{r.back}</span>
              <LinkButton tone="muted" onClick={r.remove} title={'Remove item ' + (k + 1)}>Remove</LinkButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ItemList({ head, rows }: { head: string; rows: { front: string; back: string }[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={label}>{head}</span>
      {rows.map((r, k) => (
        <div key={k} style={{ ...row, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
          <span style={{ fontWeight: 500, textWrap: 'pretty' }}>{r.front}</span><span style={{ color: '#3d423b', textWrap: 'pretty' }}>{r.back}</span>
        </div>
      ))}
    </div>
  );
}
