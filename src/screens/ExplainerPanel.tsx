// The interactive explainer's panel (studios plan, Task 2.2), for the learner on the detail page and as the Explainer
// Studio's preview: numbered steps to click or walk with Prev and Next, then the three-question check or the summary card.
// It only reads the view-model (fmtExplainer.ts); a step's drawing reaches the page only through SafeSvg.
import type { CSSProperties } from 'react';
import { Button, Card, LinkButton } from '../ds';
import type { ExplainerView } from '../fmtExplainer';
import QuestionRound from './QuestionRound';
import SafeSvg from './SafeSvg';

const col: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const box: CSSProperties = { border: '1px solid #e1e5dc', borderRadius: 8, padding: 16, minHeight: 110, display: 'flex', flexDirection: 'column', gap: 8, animation: 'pmFadeUp .3s ease-out' };
const pill = (on: boolean, done: boolean): CSSProperties => ({ appearance: 'none', font: 'inherit', cursor: 'pointer', border: '1.5px solid #1a1d18', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600,
  background: on ? '#1a1d18' : done ? '#86BC25' : '#fff', color: on ? '#fff' : '#1a1d18' });

function Ending({ ie }: { ie: ExplainerView }) {
  return (
    <div style={box}>
      {ie.round && <QuestionRound r={ie.round} />}
      {ie.result && <><div style={{ fontWeight: 600, fontSize: 16 }}>{ie.result.label}</div><div><LinkButton onClick={ie.result.restart}>Try the check again</LinkButton></div></>}
      {ie.note && <div style={{ fontSize: 12.5, color: '#5a6058' }}>{ie.note}</div>}
      {ie.summary && (
        <>
          <div style={{ fontWeight: 700, fontSize: 16 }}>In short</div>
          {ie.summary.map((s) => <div key={s.n} style={{ display: 'flex', gap: 8, fontSize: 13 }}><span style={{ fontWeight: 600, color: '#5a6058', flex: 'none' }}>{s.n}.</span><span style={{ textWrap: 'pretty' }}><b>{s.label}</b> · {s.text}</span></div>)}
        </>
      )}
    </div>
  );
}

export default function ExplainerPanel({ ie }: { ie: ExplainerView }) {
  return (
    <Card title="Step through it" subtitle={ie.sub}>
      <div style={col}>
        <div role="group" aria-label="Steps" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          {ie.pills.map((p, k) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {k > 0 && <span aria-hidden="true" style={{ color: '#86BC25', fontWeight: 700 }}>→</span>}
              <button type="button" onClick={p.pick} disabled={p.off} title={p.off ? 'Go through to the last step first' : undefined} aria-current={p.on ? 'step' : undefined} style={{ ...pill(p.on, p.done), opacity: p.off ? 0.45 : 1, cursor: p.off ? 'default' : 'pointer' }}>{p.n ? p.n + ' · ' + p.label : p.label}</button>
            </span>
          ))}
        </div>
        {ie.step ? (
          <div style={box}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{ie.step.label}</div>
            <div style={{ fontSize: 13, textWrap: 'pretty' }}>{ie.step.text}</div>
            {/* A fixed drawing area, as Horizon draws its visuals. */}
            <SafeSvg svg={ie.step.svg} label={ie.step.label} />
          </div>
        ) : <Ending ie={ie} />}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={ie.prev} disabled={ie.noPrev}>‹ Previous</Button>
          <Button size="sm" onClick={ie.next} disabled={ie.noNext}>{ie.nextLabel} ›</Button>
          <span style={{ fontSize: 12, color: '#5a6058', fontVariantNumeric: 'tabular-nums' }}>{ie.pos}</span>
        </div>
      </div>
    </Card>
  );
}
