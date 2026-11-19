// What a learner does with a course block (E-learning Studio, Task 1.4): open an accordion panel, answer a knowledge check, place the items of a sort, choose
// in a scenario, calculate. It only reads the view-model (fmtCoursePlay.ts); a knowledge check is the shared question round (QuestionRound.tsx).
import { useId } from 'react';
import type { CSSProperties } from 'react';
import { Button, FilterChip, Input, LinkButton } from '../ds';
import type { Play } from '../fmtCoursePlay';
import QuestionRound from './QuestionRound';

const bold: CSSProperties = { fontWeight: 600 };
const col: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const muted: CSSProperties = { fontSize: 12.5, color: '#5a6058' };
const Verdict = ({ v }: { v: { text: string; good: boolean } }) => <div role="status" style={{ borderLeft: '3px solid ' + (v.good ? '#3f6a0a' : '#9a2b22'), padding: '4px 10px', fontSize: 12.5, color: '#3d423b' }}>{v.text}</div>;

function Accordion({ panels }: { panels: Extract<Play, { kind: 'accordion' }>['panels'] }) {
  const id = useId();
  return (
    <div>{panels.map((x, i) => (
      <div key={i} style={{ borderTop: i ? '1px solid #eef0ea' : 0, padding: '4px 0' }}>
        <button type="button" aria-expanded={x.open} aria-controls={x.open ? id + i : undefined} onClick={x.toggle} style={{ appearance: 'none', background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left', ...bold }}>{x.open ? '▾ ' : '▸ '}{x.title}</button>
        {x.open && <div id={id + i} style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{x.body}</div>}
      </div>))}</div>
  );
}

export default function CoursePlay({ p }: { p: Play }) {
  switch (p.kind) {
    case 'accordion': return <Accordion panels={p.panels} />;
    case 'check': return <div style={col}><QuestionRound r={p.round} /></div>;
    case 'sort': return (
      <div style={col}>
        <div style={bold}>{p.prompt}</div>
        {p.cards.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 160px' }}>{c.label}</span>
            {p.bins.map((bin, g) => <FilterChip key={g} selected={c.bin === g} aria-label={c.label + ': ' + bin} onClick={() => c.place(g as 0 | 1)}>{bin}</FilterChip>)}
          </div>))}
        {p.verdict ? <Verdict v={p.verdict} /> : <div style={muted}>Put every item in a group.</div>}
      </div>);
    case 'branch': return (
      <div style={col}>
        <div style={bold}>{p.q}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{p.choices.map((c, i) => <FilterChip key={i} selected={c.on} onClick={c.pick}>{c.label}</FilterChip>)}</div>
        {p.outcome && <><Verdict v={p.outcome} /><div><LinkButton onClick={p.retry}>Try another choice</LinkButton></div></>}
      </div>);
    case 'exercise': return (
      <div style={col}>
        <div style={bold}>{p.q}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 160 }}><Input aria-label={p.q} inputMode="decimal" value={p.value} onChange={(e) => p.set(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') p.check(); }} readOnly={p.checked} /></div>
          {p.unit && <span>{p.unit}</span>}
          <Button size="sm" onClick={p.check} disabled={!p.canCheck}>Check</Button>
        </div>
        {p.verdict && <><Verdict v={p.verdict} />{!p.verdict.good && <div><LinkButton onClick={p.retry}>Try again</LinkButton></div>}</>}
      </div>);
    case 'reflect': return <div style={col}><div style={bold}>{p.p}</div><div style={muted}>Think it over: your reflection is for you alone. Writing it down here is not available yet.</div></div>;
  }
}
