// The learner's certification trajectory page and the library's trajectory cards (design v4). Reads from VM only
// (trajectoryVals.ts); actions are absent in View as.
import type { ReactNode } from 'react';
import { Button, Eyebrow, Input, KeyValueList, LinkButton, ProgressRing, StatusChip, Tag, Textarea } from '../ds';
import type { VM } from '../model';

type Tv = NonNullable<VM['tv']>;
type StepVm = Tv['steps'][number];
const box = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6 } as const;
const head = { padding: '12px 18px', borderBottom: '1px solid #eef0ea', background: '#fafbf8' } as const;
const small = { fontSize: 12, color: '#5a6058' } as const;
const Label = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5a6058' }}>{children}</span>;

export function LibraryTrajectories({ vm }: { vm: VM }) {
  if (!vm.hasLibTrj) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><span style={{ fontWeight: 600, fontSize: 14 }}>Certification trajectories</span><span style={small}>{vm.libTrjSub}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
        {vm.libTrj.map((lt) => (
          <button key={lt.id} type="button" onClick={lt.open} style={{ appearance: 'none', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', background: '#fff', border: '1px solid ' + lt.bd, borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span aria-hidden="true" style={{ width: 22, height: 22, flex: 'none', borderRadius: 5, background: '#fdf3dc', border: '1px solid #f0dca3', color: '#7a5000', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>◆</span>
              <span style={{ fontWeight: 600, lineHeight: 1.25 }}>{lt.name}</span>
            </span>
            <span style={{ fontSize: 12, color: '#3d423b' }}>{lt.sub}</span>
            <span style={{ fontSize: 11.5, color: '#6b716a' }}>{lt.meta}</span>
            {lt.hasBar && <span style={{ display: 'block', height: 5, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: lt.barW, background: '#86BC25' }} /></span>}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: lt.stColor }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: lt.dot, flex: 'none' }} />{lt.status}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepAction({ a }: { a: NonNullable<StepVm['act']> }) {
  const f = a.form;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {f && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 240px' }}><Label>{f.showRef ? 'Certificate link' : 'Link to the evidence'}</Label><Input size="md" value={f.link} onChange={(e) => f.set('link', e.target.value)} placeholder="https://" maxLength={500} /></label>
          {f.showRef && <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 160px' }}><Label>or certificate number</Label><Input size="md" value={f.ref} onChange={(e) => f.set('ref', e.target.value)} maxLength={80} /></label>}
          {f.showNote && <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 100%' }}><Label>or a note</Label><Textarea minHeight={48} value={f.note} onChange={(e) => f.set('note', e.target.value)} maxLength={2000} /></label>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><Button size="sm" variant={a.variant} onClick={a.run}>{a.label}</Button><span style={small}>{a.hint}</span></div>
    </div>
  );
}

function Step({ vs }: { vs: StepVm }) {
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
      <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none', width: 28 }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: vs.cBg, color: vs.cFg, border: vs.cBd, fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 12 }}>{vs.mark}</span>
        <span style={{ flex: 1, width: 2, background: vs.lineBg, marginTop: 4 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, margin: '4px 0', border: '1px solid #e1e5dc', borderRadius: 6, background: vs.bg, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, opacity: vs.op }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Tag tone={vs.tone}>{vs.kind}</Tag><span style={{ fontWeight: 600, lineHeight: 1.3 }}>{vs.title}</span></div>
            <div style={{ fontSize: 11.5, color: '#5a6058', marginTop: 3 }}>{vs.meta}</div>
          </div>
          <StatusChip status={vs.st} label={vs.stLabel} />
        </div>
        {vs.opts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {vs.opts.map((vo) => (
              <div key={vo.title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid #eef0ea', borderRadius: 5, padding: '6px 10px', background: '#fff' }}>
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{vo.title}</div><div style={{ fontSize: 11.5, color: '#5a6058' }}>{vo.sub}</div></div>
                <LinkButton onClick={vo.open}>Open</LinkButton>
              </div>
            ))}
          </div>
        )}
        {vs.act && <StepAction a={vs.act} />}
        {vs.lockText && <div style={small}>{vs.lockText}</div>}
      </div>
    </li>
  );
}

export default function TrajectoryScreen({ vm }: { vm: VM }) {
  const tv = vm.tv!;
  return (
    <>
      <div><LinkButton onClick={vm.trjBack}>{vm.trjBackLabel}</LinkButton></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: 44, height: 44, flex: 'none', borderRadius: 8, background: '#fdf3dc', border: '1px solid #f0dca3', color: '#7a5000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>◆</span>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>Certification trajectory · {tv.issuer}</Eyebrow>
            <h1 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 600, lineHeight: 1.2, textWrap: 'pretty' }}>{tv.name}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><Tag tone={tv.obTone}>{tv.obLabel}</Tag><StatusChip status={tv.st} label={tv.stLabel} size="md" /></div>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ ...box, overflow: 'hidden' }}>
            <div style={head}><div style={{ fontWeight: 600 }}>Your steps</div><div style={small}>{tv.stepsSub}</div></div>
            <ol style={{ listStyle: 'none', margin: 0, padding: '8px 18px 6px' }}>
              {tv.steps.map((vs) => <Step key={vs.id} vs={vs} />)}
              <li style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none', width: 28 }}><span style={{ width: 26, height: 26, borderRadius: 6, background: tv.credBg, color: tv.credFg, border: '1px solid #e0a100', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 12 }}>◆</span></div>
                <div style={{ flex: 1, minWidth: 0, margin: '4px 0', border: '1px solid #f0dca3', borderRadius: 6, background: '#fdf7e6', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Tag tone="warning">Credential</Tag><span style={{ fontWeight: 600 }}>{tv.cred}</span></div>
                  <div style={{ fontSize: 11.5, color: '#5a6058', marginTop: 3 }}>{tv.credMeta}</div>
                </div>
              </li>
            </ol>
          </div>
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ ...box, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <ProgressRing value={tv.frac} size={64} />
              <div><div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{tv.progLabel}</div><div style={small}>{tv.progSub}</div></div>
            </div>
            <div style={{ fontSize: 12.5, color: '#3d423b', textWrap: 'pretty' }}>{tv.callout}</div>
            {tv.primary && <Button fullWidth onClick={tv.primary.run}>{tv.primary.label}</Button>}
            {tv.secondary && <div><LinkButton tone="muted" onClick={tv.secondary.run}>{tv.secondary.label}</LinkButton></div>}
          </div>
          <div style={{ ...box, overflow: 'hidden' }}>
            <div style={head}><div style={{ fontWeight: 600 }}>About this credential</div></div>
            <div style={{ padding: '12px 18px 14px' }}><KeyValueList rows={tv.kv} labelWidth={104} /></div>
          </div>
        </div>
      </div>
    </>
  );
}
