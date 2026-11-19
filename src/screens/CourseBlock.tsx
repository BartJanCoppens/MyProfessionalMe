// One course block on screen, for the editor and the player alike (E-learning Studio). Everything a creator wrote is shown as plain text. In the editor
// the block is a button that selects it and a field still empty says what is missing; in the player the kinds a learner works (CoursePlay.tsx) answer.
import type { ReactNode } from 'react';
import { Button } from '../ds';
import type { BlockMode, BlockView, EmbedView } from '../fmtCourse';
import type { CourseBlock as Block } from '../logic/courseContent';
import CoursePlay from './CoursePlay';

const muted = { color: '#8a9086' };
const line = (v: string, empty: string): ReactNode => (v.trim() ? v : <span style={muted}>{empty}</span>);
const bold = { fontWeight: 600 } as const;

function Body({ b, mode }: { b: Block; mode: BlockMode }) {
  switch (b.block) {
    case 'text': return <>{(b.h.trim() || mode === 'edit') && <div style={{ ...bold, fontSize: 16 }}>{line(b.h, 'No heading')}</div>}<div style={{ whiteSpace: 'pre-wrap' }}>{line(b.t, 'Write the text')}</div></>;
    case 'callout': return <div style={{ borderLeft: '3px solid #3f6a0a', paddingLeft: 10, whiteSpace: 'pre-wrap' }}>{line(b.t, 'Write the callout')}</div>;
    case 'accordion': return <>{b.panels.map(([title, body], i) => <div key={i} style={{ borderTop: i ? '1px solid #eef0ea' : 0, padding: '4px 0' }}><div style={bold}>▸ {line(title, 'Panel title')}</div><div>{line(body, 'Panel text')}</div></div>)}</>;
    case 'check': return (
      <><div style={bold}>{line(b.question.q, 'Write the question')}</div>
        <ol type="A" style={{ margin: '4px 0', paddingLeft: 22 }}>{b.question.o.map((o, i) => <li key={i} style={i === b.question.a ? bold : undefined}>{line(o, 'Option')}</li>)}</ol>
        <div style={{ fontSize: 12.5, color: '#5a6058' }}>{line(b.question.why, 'Say why the answer is right')}</div></>);
    case 'sort': return (
      <><div style={bold}>{line(b.p, 'Write the prompt')}</div>
        <div style={{ display: 'flex', gap: 16 }}>{[0, 1].map((g) => <div key={g}><div style={{ fontSize: 12, ...bold }}>{line(b.bins[g], 'Group name')}</div>{b.cards.filter((c) => c[1] === g).map((c, i) => <div key={i}>{line(c[0], 'Item')}</div>)}</div>)}</div></>);
    case 'branch': return <><div style={bold}>{line(b.q, 'Write the question')}</div>{b.choices.map(([label, outcome, good], i) => <div key={i}>{good ? '✓ ' : '✗ '}{line(label, 'Choice')} <span style={{ color: '#5a6058' }}>· {line(outcome, 'Reply')}</span></div>)}</>;
    case 'reflect': return <div>{line(b.p, 'Write the prompt for the learner')}<div style={{ ...muted, fontSize: 12, marginTop: 4 }}>The learner's answer stays with the learner.</div></div>;
    case 'exercise': return <><div style={bold}>{line(b.q, 'Write the question')}</div><div style={{ fontSize: 12.5, color: '#5a6058' }}>Answer {b.a}{b.unit && ' ' + b.unit} (± {b.tol})</div></>;
  }
}

export default function CourseBlock({ b, mode }: { b: BlockView; mode: BlockMode }) {
  const body = <>{mode === 'play' && b.play ? <CoursePlay p={b.play} /> : <Body b={b.block} mode={mode} />}{mode === 'edit' && b.missing && <div role="alert" style={{ fontSize: 12, color: '#7a5000', marginTop: 4 }}>{b.missing}</div>}</>;
  const box = { width: '100%', boxSizing: 'border-box' as const, textAlign: 'left' as const, font: 'inherit', fontSize: 13.5, color: '#1a1d18', background: '#fff', borderRadius: 6, padding: '10px 12px' };
  if (mode === 'play') return <div style={{ ...box, border: '1px solid #e1e5dc' }}>{body}</div>;
  return (
    <div role="button" tabIndex={0} aria-label={'Select ' + b.name.toLowerCase()} aria-pressed={b.on} onClick={b.pick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.pick(); } }} style={{ ...box, cursor: 'pointer', border: '1px solid ' + (b.on ? '#3f6a0a' : '#e1e5dc'), boxShadow: b.on ? '0 0 0 2px #dfe9cf' : 'none' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{b.name}</div>{body}
    </div>
  );
}

// An embedded learning: its card, and, once opened, the learning's own learner panel under it (`panel`, rendered by whoever shows the course).
export function EmbedCard({ e, panel }: { e: EmbedView; panel: ReactNode }) {
  return (
    <div style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e1e5dc', background: '#fff', borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 6, background: '#eef0ec', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{e.glyph}</span>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          {e.gone ? <div style={{ fontSize: 12.5, color: '#5a6058' }}>{e.goneNote}</div> : <><div style={{ ...bold, fontSize: 13.5 }}>{e.title}</div><div style={{ fontSize: 12, color: '#5a6058' }}>{e.meta}</div></>}
        </div>
        {!e.gone && (e.isOpen ? <Button size="sm" variant="secondary" onClick={e.close}>Close</Button> : <Button size="sm" onClick={e.open}>{e.openLabel}</Button>)}
      </div>
      {e.isOpen && panel}
    </div>
  );
}
