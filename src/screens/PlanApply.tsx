// Apply, at the end of the "Build with AI" panel (Phase 7): the button, the reason it is off, and the confirmation that says what will be added
// and skipped. It only reads from tai.apply (trajectoryApply.ts).
import { Button, LinkButton } from '../ds';
import type { Tai } from '../trajectoryAiVals';
import { label } from './labelStyle';

export default function PlanApply({ a }: { a: Tai['apply'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #e1e5dc', paddingTop: 12 }}>
      {!a.open && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" onClick={a.ask} disabled={!!a.off}>{a.label}</Button>
          {a.off && <span style={{ fontSize: 12, color: '#5a6058' }}>{a.off}</span>}
        </div>
      )}
      {a.open && (
        <div role="group" aria-label="Apply the accepted modules" style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fff', padding: '10px 12px' }}>
          <span style={label}>Steps to add · {a.added.length}</span>
          {!a.added.length && <div style={{ fontSize: 12.5, color: '#5a6058' }}>Nothing new to add.</div>}
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{a.added.map((x, i) => <li key={i}>{x}</li>)}</ul>
          {a.skipped.length > 0 && (
            <>
              <span style={label}>Skipped · {a.skipped.length}</span>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#7a5000' }}>{a.skipped.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
          <div style={{ fontSize: 12, color: '#5a6058' }}>{a.note}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button size="sm" onClick={a.run}>{a.added.length ? 'Add ' + a.added.length + (a.added.length === 1 ? ' step' : ' steps') : 'Close'}</Button>
            <LinkButton tone="muted" onClick={a.cancel}>Cancel</LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}
