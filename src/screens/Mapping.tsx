import type { CSSProperties } from 'react';
import { Banner, Button, ChatBubble, FilterChip, Hover, Input, LinkButton, PageTitle, SegmentedControl, StatusChip, Tag } from '../ds';
import type { VM } from '../model';
import { STAGES } from '../data';

const card: CSSProperties = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' };
const cardHead: CSSProperties = { padding: '12px 18px', borderBottom: '1px solid #eef0ea', background: '#fafbf8' };
const label: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' };
const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const COV_COLS = 'minmax(130px,1.3fr) repeat(' + STAGES.length + ',minmax(0,1fr)) 62px';

export default function AdminMappingScreen({ vm }: { vm: VM }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle title="Curriculum mapping" lead="Map learnings to the people they are for: a business line, an industry, a technology, an ambition or a personality profile. A person's path is the stack of every audience they belong to." />
        <Button onClick={vm.publish} disabled={vm.noPending}>Publish {vm.pendingLabel}</Button>
      </div>
      <LensPicker vm={vm} />
      {/* Coverage and the learner's eye stack on the left; the copilot stays in view beside them. */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Coverage vm={vm} />
          <LearnersEye vm={vm} />
        </div>
        <Copilot vm={vm} />
      </div>
      {!vm.editable && <Banner tone="info">{vm.readOnlyNote}</Banner>}
      <Board vm={vm} />
      <SelectionDock vm={vm} />
    </>
  );
}

function LensPicker({ vm }: { vm: VM }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#5a6058' }}>Map by</span>
        <SegmentedControl options={vm.lensOptions} value={vm.mapLens} onChange={vm.setLens} size="base" />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {vm.audChips.map((ac) => (
          <FilterChip key={ac.key} selected={ac.on} onClick={ac.pick}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: vm.lensColor, flex: 'none' }} />{ac.label}<span style={{ fontWeight: 400, opacity: 0.75 }}>{ac.reach}</span>
          </FilterChip>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: '#5a6058', borderTop: '1px solid #eef0ea', paddingTop: 10 }}>
        <span style={{ flex: '1 1 320px', textWrap: 'pretty' }}><span style={{ fontWeight: 600, color: '#1a1d18' }}>Who belongs · </span>{vm.lensRule}</span>
        <span style={{ flex: '1 1 320px', textWrap: 'pretty' }}><span style={{ fontWeight: 600, color: '#1a1d18' }}>Obligation · </span>{vm.lensPolicy}</span>
      </div>
    </div>
  );
}

function Coverage({ vm }: { vm: VM }) {
  return (
    <div style={card}>
      <div style={cardHead}>
        <div style={{ fontWeight: 600 }}>Coverage · {vm.lensLabel}</div>
        <div style={{ fontSize: 12, color: '#5a6058' }}>Learnings and hours per stage. A dash is a gap. Signals are evaluation themes the copilot found that no mapping covers yet. Click a cell to edit it below.</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 620, padding: '6px 12px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COV_COLS, gap: 4, fontSize: 11, fontWeight: 600, color: '#8b918a', textTransform: 'uppercase', letterSpacing: '.04em', padding: '6px 0' }}>
            <span>Audience</span>
            {vm.stageShort.map((sh) => <span key={sh} style={{ textAlign: 'center' }}>{sh}</span>)}
            <span style={{ textAlign: 'right' }}>Signals</span>
          </div>
          {vm.covRows.map((cr) => (
            <div key={cr.key} style={{ display: 'grid', gridTemplateColumns: COV_COLS, gap: 4, alignItems: 'center', padding: '3px 0' }}>
              <div onClick={cr.pick} style={{ minWidth: 0, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, background: cr.rowBg }}>
                <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.2 }}>{cr.name}</div><div style={{ fontSize: 11, color: '#8b918a' }}>{cr.reach}</div>
              </div>
              {cr.cells.map((cc) => (
                <Hover key={cc.stage} onClick={cc.pick} title={cc.tip} hoverStyle={{ borderColor: '#1a1d18' }}
                  style={{ height: 38, borderRadius: 5, background: cc.bg, border: '1px solid ' + cc.bd, boxShadow: cc.ring, color: cc.fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, transition: 'box-shadow .15s' }}>
                  {cc.label}<span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8 }}>{cc.sub}</span>
                </Hover>
              ))}
              <div style={{ textAlign: 'right' }}>
                {cr.hasSig && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#9a5b00' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e0a100' }} />{cr.sig}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Copilot({ vm }: { vm: VM }) {
  return (
    <div style={{ ...card, flex: '0 1 420px', minWidth: 320, display: 'flex', flexDirection: 'column', position: 'sticky', top: 78, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #eef0ea', background: '#171a16', color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 22, height: 22, borderRadius: 5, background: '#86BC25', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10180a' }} /></span>
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>Curriculum copilot</div><div style={{ fontSize: 11.5, color: '#a9b0a5' }}>Reads anonymised evaluations, staffing and shared profiles. Proposes; you decide.</div></div>
      </div>
      <div style={{ ...label, padding: '10px 18px 4px' }}>Found in the data · {vm.sigCount}</div>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 430, overflow: 'auto' }}>
        {vm.sigCards.map((sg) => (
          <div key={sg.id} style={{ padding: '10px 18px 12px', borderTop: '1px solid #eef0ea', display: 'flex', flexDirection: 'column', gap: 6, animation: 'pmFadeUp .35s ease-out backwards', animationDelay: sg.delay }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><StatusChip status={sg.st} label={sg.kind} />{sg.example && <Tag tone="muted">Example signal</Tag>}<span style={{ fontSize: 11.5, color: '#8b918a' }}>{sg.where}</span></div>
            <div style={{ fontWeight: 600, lineHeight: 1.3, textWrap: 'pretty' }}>{sg.title}</div>
            <div style={{ fontSize: 12.5, color: '#3d423b', textWrap: 'pretty' }}>{sg.evidence}</div>
            {sg.hasQuote && <div style={{ fontSize: 12, color: '#5a6058', borderLeft: '2px solid #d5dacf', paddingLeft: 8, textWrap: 'pretty' }}>{sg.quote}</div>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ fontSize: 11.5, color: '#5a6058' }}>{sg.impact}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <LinkButton tone="muted" onClick={sg.dismiss}>Dismiss</LinkButton>
                <Button size="sm" onClick={sg.apply}>Apply</Button>
              </div>
            </div>
          </div>
        ))}
        {vm.noSig && <div style={{ padding: '14px 18px', borderTop: '1px solid #eef0ea', fontSize: 12.5, color: '#5a6058' }}>Nothing open. New evaluations are read every night.</div>}
      </div>
      <div style={{ borderTop: '1px solid #e1e5dc', padding: '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: '#fafbf8' }}>
        <div style={label}>Ask in plain words</div>
        {vm.cpHasReply && (
          <>
            <ChatBubble role="assistant">{vm.cpReply}</ChatBubble>
            {vm.cpHasOps && (
              <div style={{ border: '1px dashed #86BC25', borderRadius: 6, background: '#fbfdf6', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {vm.cpOps.map((op) => (
                  <div key={op.verb + op.text} style={{ fontSize: 12.5, display: 'flex', gap: 8 }}><span style={{ fontWeight: 600, color: '#3f6a0a', flex: 'none' }}>{op.verb}</span><span style={{ textWrap: 'pretty' }}>{op.text}</span></div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" onClick={vm.cpApply}>Apply all</Button>
                  <Button size="sm" variant="secondary" onClick={vm.cpDrop}>Discard</Button>
                </div>
              </div>
            )}
          </>
        )}
        {vm.cpBusy && <ChatBubble role="assistant"><span style={{ color: '#8b918a' }}>Reading the curriculum</span></ChatBubble>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {vm.cpPrompts.map((cp) => <FilterChip key={cp.label} onClick={cp.send}>{cp.label}</FilterChip>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><Input placeholder="e.g. Give Public sector analysts a lighter start" value={vm.cpInput} onChange={vm.setCpInput} onKeyDown={vm.cpKey} /></div>
          <Button size="lg" onClick={vm.cpSend} disabled={vm.cpBusy}>Ask</Button>
        </div>
      </div>
    </div>
  );
}

function LearnersEye({ vm }: { vm: VM }) {
  const pz = vm.pz;
  return (
    <div style={card}>
      <div style={{ ...cardHead, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>Learner's eye</div><div style={{ fontSize: 12, color: '#5a6058' }}>What one person receives this year once every audience they belong to is stacked. Duplicates count once.</div></div>
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>{pz.name}</span><span style={{ color: '#5a6058' }}>· {pz.stage}</span>
            {pz.tags.map((pt) => (
              <Tag key={pt.key} tone="muted"><span style={{ width: 7, height: 7, borderRadius: '50%', background: pt.color, display: 'inline-block', marginRight: 5 }} />{pt.label}</Tag>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ fontWeight: 600 }}>All learning</span><span style={{ fontVariantNumeric: 'tabular-nums', color: pz.totFg }}>{pz.totLabel}</span></div>
            <div style={{ position: 'relative', height: 16, borderRadius: 4, background: '#f3f5f0', display: 'flex', overflow: 'hidden' }}>
              {pz.segs.map((sgm) => <div key={sgm.key} title={sgm.tip} style={{ height: '100%', width: sgm.w, background: sgm.color, borderRight: '1px solid #fff', transition: 'width .3s' }} />)}
              <div style={{ position: 'absolute', top: -2, bottom: -2, left: pz.budgetX, width: 2, background: '#1a1d18' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}><span style={{ fontWeight: 600 }}>Mandatory</span><span style={{ fontVariantNumeric: 'tabular-nums', color: pz.mandFg }}>{pz.mandLabel}</span></div>
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: '#f3f5f0', overflow: 'hidden' }}><div style={{ height: '100%', width: pz.mandW, background: pz.mandColor, transition: 'width .3s' }} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
            {pz.layers.map((ly) => (
              <div key={ly.key} style={{ border: '1px solid #eef0ea', borderRadius: 5, padding: '8px 10px', minWidth: 0 }}>
                <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: ly.color }} />{ly.lens}</div>
                <div style={{ fontWeight: 600, fontSize: 12.5, marginTop: 2 }}>{ly.aud}</div>
                <div style={{ fontSize: 11.5, color: '#5a6058' }}>{ly.meta}</div>
              </div>
            ))}
          </div>
          {pz.hasDup && <div style={{ fontSize: 12.5, color: '#3d423b', textWrap: 'pretty' }}><span style={{ fontWeight: 600 }}>Arrives twice · </span>{pz.dupText}</div>}
        </div>
        <div style={{ flex: '0 1 340px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="dark" onClick={vm.readAs} disabled={vm.readBusy}>{vm.readLabel}</Button>
          {vm.read ? (
            <div style={{ border: '1px solid #e1e5dc', borderRadius: 6, padding: '10px 12px', background: '#fafbf8', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={label}>{vm.readHead}</div>
              <div style={{ textWrap: 'pretty' }}>“{vm.read.text}”</div>
              <div style={{ fontSize: 12, color: '#5a6058', textWrap: 'pretty' }}>Copilot suggests: {vm.read.fix}</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>The copilot reads the stack as this person would, in their words, and names the one change that would help most.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Board({ vm }: { vm: VM }) {
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      <div style={{ ...card, flex: '0 0 240px', position: 'sticky', top: 78 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #eef0ea', background: '#fafbf8' }}>
          <div style={{ fontWeight: 600 }}>Not mapped to {vm.audName}</div><div style={{ fontSize: 12, color: '#5a6058' }}>{vm.paletteCount} learnings · drag to a stage</div>
        </div>
        <div onDragOver={vm.paletteOver} onDrop={vm.paletteDrop} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, maxHeight: '60vh', overflow: 'auto', minHeight: 120 }}>
          {vm.palette.map((pi) => (
            <Hover key={pi.id} draggable={vm.editable} onDragStart={pi.onDragStart} hoverStyle={{ borderColor: '#86BC25' }}
              style={{ border: '1px solid #c8cdc3', borderRadius: 5, background: '#f7f7f5', padding: '6px 9px', cursor: vm.editable ? 'grab' : 'default', minHeight: 38 }}>
              <div style={{ fontWeight: 500, fontSize: 12, ...ellipsis }}>{pi.title}</div>
              <div style={{ fontSize: 10.5, color: '#8b918a', ...ellipsis }}>{pi.sub}</div>
            </Hover>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: vm.lensColor }} /><span style={{ fontWeight: 600 }}>{vm.lensLabel} · {vm.audName}</span><span style={{ fontSize: 12, color: '#5a6058' }}>{vm.audSummary}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + STAGES.length + ',minmax(176px,1fr))', gap: 10, minWidth: STAGES.length * 186 }}>
          {vm.stageCols.map((sc) => (
            <div key={sc.name} onDragOver={sc.onDragOver} onDragLeave={sc.onDragLeave} onDrop={sc.onDrop}
              style={{ background: sc.bg, border: '1px ' + sc.bdStyle + ' ' + sc.bd, boxShadow: sc.ring, borderRadius: 6, display: 'flex', flexDirection: 'column', minHeight: 360, transition: 'border-color .15s,box-shadow .15s' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #eef0ea' }}><div style={{ fontWeight: 600 }}>{sc.name}</div><div style={{ fontSize: 11.5, color: '#5a6058' }}>{sc.summary}</div></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, flex: 1 }}>
                {sc.items.map((mi) => (
                  <Hover key={mi.id} draggable={vm.editable} onDragStart={mi.onDragStart} onClick={mi.onClick} hoverStyle={{ borderColor: '#86BC25' }}
                    style={{ position: 'relative', border: mi.border, borderRadius: 5, background: mi.bg, padding: '5px 9px', cursor: 'pointer', boxShadow: mi.shadow, opacity: mi.op,
                      transition: 'opacity .15s,box-shadow .15s', animation: 'pmFadeUp .3s ease-out backwards' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      {mi.isMand && (
                        <svg width="11" height="11" viewBox="0 0 16 16" style={{ flex: 'none' }}>
                          <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="#1a1d18" strokeWidth="1.6" />
                          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="#1a1d18" strokeWidth="1.6" />
                        </svg>
                      )}
                      <span style={{ fontWeight: 500, fontSize: 12, ...ellipsis }}>{mi.title}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: '#8b918a', ...ellipsis }}>{mi.sub}</div>
                    {mi.pending && <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: '50%', background: '#e0a100' }} />}
                  </Hover>
                ))}
                <div style={{ border: '1px dashed #cfd4c9', borderRadius: 5, padding: 8, textAlign: 'center', fontSize: 11.5, color: '#8b918a', marginTop: 'auto' }}>Drop here</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SelectionDock({ vm }: { vm: VM }) {
  const ms = vm.ms;
  if (!ms) return null;
  const head = { fontSize: 12, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' } as const;
  return (
    <div style={card}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef0ea', background: '#fafbf8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div><div style={{ fontWeight: 600, fontSize: 16 }}>{ms.title}</div><div style={{ fontSize: 12.5, color: '#5a6058' }}>{ms.sub}</div></div>
        {!ms.canMand ? <Tag tone="muted">Suggested only</Tag> : vm.editable ? <SegmentedControl options={vm.obSetOptions} value={ms.ob} onChange={ms.setOb} size="md" /> : <Tag tone="muted">{ms.ob}</Tag>}
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={head}>Who this touches</div>
          <p style={{ margin: '4px 0 0', textWrap: 'pretty' }}>{ms.touch}</p>
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={head}>Also mapped to</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {ms.also.map((al) => <div key={al.text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: al.color }} />{al.text}</div>)}
          </div>
        </div>
        <div style={{ flex: '0 1 300px', minWidth: 0 }}>
          <div style={head}>Rule</div>
          <p style={{ margin: '4px 0 0' }}>{ms.rulePlain}</p>
          <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11.5, color: '#5a6058', marginTop: 4 }}>{ms.ruleExpr}</div>
        </div>
      </div>
      <div style={{ padding: '12px 18px 16px', borderTop: '1px solid #eef0ea', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {vm.editable && <Button variant="secondary" onClick={ms.remove}>Remove from {vm.audName}</Button>}
        <LinkButton onClick={ms.openLib}>Open in library →</LinkButton>
        <LinkButton tone="muted" onClick={vm.clearMapSel}>Clear</LinkButton>
      </div>
    </div>
  );
}
