// The detail page's panels for the work formats of design v4: case exercise, stretch assignment, webinar, job aid.
// Case and stretch hand in through the evidence card (link or reflection); in View as there are no buttons or ticks to change.
import type { CSSProperties } from 'react';
import { Button, Card, Checkbox, LinkButton } from '../ds';
import type { fmtVals } from '../fmtVals';

type Det = ReturnType<typeof fmtVals>;
const caps: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' };
const foot: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid #eef0ea' };
const note: CSSProperties = { fontSize: 12.5, color: '#5a6058', textWrap: 'pretty' };
const NumberedLine = ({ n, t }: { n: string; t: string }) => <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><span style={{ fontWeight: 600, color: '#5a6058', flex: 'none' }}>{n}</span><span style={{ textWrap: 'pretty' }}>{t}</span></div>;
// A tick: changeable for the learner, a plain mark in View as.
const Tick = ({ on, ro, toggle, children }: { on: boolean; ro: boolean; toggle: () => void; children: string }) =>
  ro ? <div style={{ fontSize: 13.5 }}>{on ? '✓' : '○'} {children}</div> : <Checkbox checked={on} onChange={toggle}>{children}</Checkbox>;

export function CasePanel({ ce }: { ce: NonNullable<Det['ce']> }) {
  return (
    <Card title="The case" subtitle={ce.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, textWrap: 'pretty', maxWidth: 680 }}>{ce.brief}</p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}><div style={caps}>What you hand in</div>{ce.deliv.map((d) => <NumberedLine key={d.n} {...d} />)}</div>
          <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={caps}>How it is reviewed</div>
            {ce.rubric.map((r) => <div key={r.t} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1a1d18', flex: 'none', transform: 'translateY(-1px)' }} />{r.t}</div>)}
            <div style={{ fontSize: 12, color: '#5a6058' }}>{ce.reviewer}</div>
          </div>
        </div>
        {!ce.ro && <div style={foot}><Button onClick={ce.submit} disabled={ce.handed}>{ce.submitLabel}</Button><span style={note}>{ce.note}</span></div>}
      </div>
    </Card>
  );
}

function StretchPanel({ sa }: { sa: NonNullable<Det['sa']> }) {
  return (
    <Card title="The assignment" subtitle={sa.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, textWrap: 'pretty', maxWidth: 680 }}>{sa.brief}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><div style={caps}>Checkpoints</div>{sa.checks.map((k) => <Tick key={k.t} on={k.on} ro={sa.ro} toggle={k.toggle}>{k.t}</Tick>)}</div>
        <div style={foot}>
          {!sa.ro && <Button variant={sa.handed ? 'secondary' : 'primary'} onClick={sa.agree} disabled={sa.handed}>{sa.agreeLabel}</Button>}
          <span style={note}>{sa.note}</span>
        </div>
      </div>
    </Card>
  );
}

function WebinarPanel({ wb }: { wb: NonNullable<Det['wb']> }) {
  return (
    <Card title="Live session" subtitle={wb.sub}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 auto', width: 92, border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden', textAlign: 'center' }}>
          <div style={{ background: '#d14537', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 0' }}>{wb.mon}</div>
          <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, padding: '6px 0 0' }}>{wb.day}</div>
          <div style={{ fontSize: 11.5, color: '#5a6058', padding: '0 0 6px' }}>{wb.time}</div>
        </div>
        <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={caps}>Agenda</div>
          {wb.agenda.map((a) => <NumberedLine key={a.n} {...a} />)}
          <div style={{ fontSize: 12, color: '#5a6058' }}>{wb.speakers}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            {!wb.ro && <Button variant={wb.registered ? 'secondary' : 'primary'} onClick={wb.register}>{wb.regLabel}</Button>}
            {wb.ics && <LinkButton onClick={wb.calendar}>Add to calendar</LinkButton>}
          </div>
          <div style={{ fontSize: 12, color: '#5a6058' }}>Attending live or watching the recording both count for the hours; give your feedback below once you have seen it.</div>
        </div>
      </div>
    </Card>
  );
}

// "Download PDF" prints just this card (the browser's Save as PDF); the rule hides the rest of the page while printing.
const PRINT = '@media print { body * { visibility: hidden } .pm-print, .pm-print * { visibility: visible } .pm-print { position: absolute; left: 0; top: 0; width: 100% } }';

export function AidPanel({ ja }: { ja: NonNullable<Det['ja']> }) {
  return (
    <div className="pm-print">
      <style>{PRINT}</style>
      <Card title="Use it on your next proposal" subtitle={ja.sub}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ja.items.map((k) => <Tick key={k.t} on={k.on} ro={ja.ro} toggle={k.toggle}>{k.t}</Tick>)}
          <div style={foot}>
            <Button variant="secondary" size="sm" onClick={ja.print}>Download PDF</Button>
            {!ja.ro && <LinkButton onClick={ja.reset}>Clear ticks</LinkButton>}
            <span style={{ fontSize: 12, color: '#5a6058' }}>{ja.count}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function WorkPanels({ det }: { det: Det }) {
  return (
    <>
      {det.ce && <CasePanel ce={det.ce} />}
      {det.sa && <StretchPanel sa={det.sa} />}
      {det.wb && <WebinarPanel wb={det.wb} />}
      {det.ja && <AidPanel ja={det.ja} />}
    </>
  );
}
