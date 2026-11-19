// Create & share, pieces used by more than one screen: the small uppercase label, the problem lines, and the one list of
// item rows (Flash and exam items, saved items for reviewers, and a generic studio's editable rows).
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button, LinkButton, Tag } from '../ds';
import { label } from './labelStyle';

const rowStyle = { display: 'grid', alignItems: 'start', gap: 10, fontSize: 12.5, border: '1px solid #eef0ea', borderRadius: 5, padding: '6px 10px' };

export function Problems({ list }: { list: string[] }) {
  return <>{list.map((x) => <div key={x} role="alert" style={{ fontSize: 12, color: '#7a5000' }}>{x}</div>)}</>;
}

// A question that waits for Continue or Cancel (a redraft that removes blocks, a lesson to remove); focus moves to it when it appears.
export function Confirm({ ask }: { ask: { text: string; proceed: () => void; cancel: () => void } }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div ref={ref} role="alert" tabIndex={-1} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: '#7a5000', outline: 'none' }}>
      <span>{ask.text} ·</span><Button size="sm" onClick={ask.proceed}>Continue</Button><Button size="sm" variant="secondary" onClick={ask.cancel}>Cancel</Button>
    </div>
  );
}

// One row per item: its cells (text or inputs) and, when it can be removed, a Remove link. `cols` is the cell count.
export type ItemRow = { cells: ReactNode[]; remove?: () => void; removeTitle?: string };
export function ItemRows({ head, note, rows, gap = 6 }: { head: string; note?: string; rows: ItemRow[]; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={label}>{head}</span>{note && <Tag tone="blue">{note}</Tag>}</div>
      {rows.map((r, k) => (
        <div key={k} style={{ ...rowStyle, gridTemplateColumns: 'repeat(' + r.cells.length + ',minmax(0,1fr))' + (r.remove ? ' auto' : '') }}>
          {r.cells}
          {r.remove && <LinkButton tone="muted" onClick={r.remove} title={r.removeTitle}>Remove</LinkButton>}
        </div>
      ))}
    </div>
  );
}
