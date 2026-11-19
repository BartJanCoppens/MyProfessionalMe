// The question on screen in a round of multiple-choice questions (fmtRound.ts): the position and topic, the options as
// radio buttons, the explanation once checked, and the one main button (a course's knowledge check, one question without a position, shows it too). The
// practice exam, the explainer's check and the Flash studio's play-test show it.
import { Button, Tag } from '../ds';
import type { Round } from '../fmtRound';

export default function QuestionRound({ r }: { r: Round }) {
  return (
    <>
      {(r.pos || r.topic) && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12, color: '#5a6058' }}><span>{r.pos}</span>{r.topic && <Tag tone="muted">{r.topic}</Tag>}</div>}
      <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35, textWrap: 'pretty' }}>{r.q}</div>
      <div role="radiogroup" aria-label="Answer options" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {r.opts.map((o) => (
          <button key={o.label} type="button" role="radio" aria-checked={o.on} onClick={o.pick} style={{ appearance: 'none', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 6, border: '1px solid ' + o.bd, background: o.bg, width: '100%' }}>
            <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', border: '1.5px solid ' + o.markBd, background: o.markBg, color: o.markFg, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{o.mark}</span>
            <span style={{ textWrap: 'pretty' }}>{o.label}</span>
          </button>
        ))}
      </div>
      {r.hasFb && <div style={{ borderLeft: '3px solid ' + r.fbColor, padding: '6px 10px', fontSize: 12.5, color: '#3d423b', textWrap: 'pretty' }}><span style={{ fontWeight: 600, color: r.fbColor }}>{r.fbHead} </span>{r.why}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Button size="sm" onClick={r.main} disabled={r.mainOff}>{r.mainLabel}</Button><span style={{ fontSize: 12, color: '#5a6058' }}>{r.hint}</span></div>
    </>
  );
}
