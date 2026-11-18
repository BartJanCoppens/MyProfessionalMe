// The module cards of a trajectory plan (Phase 7, "Build with AI"): what the AI proposed, labelled as a proposal, with the source each module
// rests on ("No source yet" when none), and the admin's own actions (accept, edit, move, remove, ask the AI). It only reads from the panel.
import { useState } from 'react';
import { Button, Field, Input, LinkButton, Select, Tag, Textarea } from '../ds';
import type { Tai } from '../trajectoryAiVals';
import { label } from './labelStyle';

type Card = Tai['modules'][number];
const box = { border: '1px solid #e1e5dc', borderRadius: 6, background: '#fff', padding: '10px 12px', display: 'flex', flexDirection: 'column' as const, gap: 6 };
const iconButton = { width: 28, height: 28, border: '1px solid #d5dacf', borderRadius: 4, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13, color: '#1a1d18' };

// A citation: "<bundle or file> · p. 4" or "Learning · <title>". A file opens its PDF; the quote shows on hover or focus.
function Citation({ c }: { c: Card['sources'][number] }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span tabIndex={0} role={c.open ? 'link' : undefined} onClick={c.open ?? undefined} onKeyDown={(e) => { if (c.open && e.key === 'Enter') c.open(); }}
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)}
        style={{ fontSize: 12, color: c.open ? '#0b5cad' : '#3d423b', textDecoration: c.open ? 'underline' : 'none', cursor: c.open ? 'pointer' : 'default' }}>{c.label}</span>
      {show && c.quote && <span role="note" style={{ fontSize: 11.5, color: '#5a6058', background: '#f3f5f0', borderRadius: 4, padding: '4px 8px', textWrap: 'pretty' }}>“{c.quote}”</span>}
    </span>
  );
}

function EditFields({ m }: { m: Card }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Field label="Title" size="sm"><Input size="md" maxLength={120} value={m.title} onChange={m.setTitle} /></Field>
      <Field label="Goals · one per line" size="sm"><Textarea key={m.goals.join('\n')} minHeight={72} defaultValue={m.goals.join('\n')} onBlur={m.setGoals} /></Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Hours (quarters)" size="sm"><Input size="md" type="number" step={0.25} min={0.25} max={80} key={m.hours} defaultValue={m.hours} onBlur={m.setHours} aria-label="Hours" /></Field>
        <Field label="Depth" size="sm"><Select size="md" options={m.depthOptions} value={m.depth} onChange={m.setDepth} aria-label="Depth" /></Field>
      </div>
    </div>
  );
}

function ModuleCard({ m }: { m: Card }) {
  return (
    <li style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>{m.n}. {m.title}</span>{m.accepted && <Tag tone="success">Accepted</Tag>}
      </div>
      <div style={{ fontSize: 12, color: '#5a6058' }}>{m.depthLabel} · {m.hoursLabel}</div>
      {m.goals.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{m.goals.map((g) => <li key={g}>{g}</li>)}</ul>}
      {m.material.map((x) => <div key={x.text} style={{ fontSize: 12.5 }}><span style={{ fontWeight: 500 }}>{x.text}</span>{x.reason && <span style={{ color: '#5a6058' }}>{' · ' + x.reason}</span>}</div>)}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <span style={label}>Sources</span>
        {m.sources.length ? m.sources.map((c) => <Citation key={c.key} c={c} />) : <span style={{ fontSize: 12, color: '#7a5000' }}>No source yet</span>}
      </div>
      {m.checks && <div style={{ fontSize: 12, color: '#5a6058' }}>Checks · {m.checks}</div>}
      {m.editing && m.canEdit && <EditFields m={m} />}
      {m.canEdit && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" variant={m.accepted ? 'secondary' : 'primary'} onClick={m.accept}>{m.accepted ? 'Unaccept' : 'Accept'}</Button>
          <Button size="sm" variant="secondary" onClick={m.toggleEdit}>{m.editing ? 'Done' : 'Edit'}</Button>
          <button type="button" aria-label={'Move ' + m.title + ' up'} disabled={m.noUp} onClick={m.up} style={{ ...iconButton, opacity: m.noUp ? 0.35 : 1 }}>↑</button>
          <button type="button" aria-label={'Move ' + m.title + ' down'} disabled={m.noDown} onClick={m.down} style={{ ...iconButton, opacity: m.noDown ? 0.35 : 1 }}>↓</button>
          <LinkButton tone="muted" onClick={m.remove} title={'Remove ' + m.title}>Remove</LinkButton>
          <LinkButton onClick={m.ask}>Ask the AI about this module</LinkButton>
        </div>
      )}
    </li>
  );
}

export default function PlanModules({ tai }: { tai: Tai }) {
  const fe = tai.finalExam;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={label}>Modules · {tai.modules.length}</span>
      {!tai.modules.length && <div style={{ fontSize: 12, color: '#8b918a' }}>No modules yet. Answer the AI&apos;s questions, then ask it to propose the plan.</div>}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>{tai.modules.map((m) => <ModuleCard key={m.id} m={m} />)}</ol>
      {fe && <div style={box}><div style={{ fontWeight: 600 }}>Final exam · {fe.title}</div><div style={{ fontSize: 12, color: '#5a6058' }}>{fe.hoursLabel} · {fe.reason}</div></div>}
    </div>
  );
}
