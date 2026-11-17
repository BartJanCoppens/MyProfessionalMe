// Admin: certification trajectories in curriculum mapping (design v4). The list, the trajectory's settings, its steps and
// the step editor. Who gets it, the warnings and the learner's-eye lane are in TrajectoryMapping.tsx.
import type { CSSProperties } from 'react';
import { Button, Checkbox, Field, Input, LinkButton, SegmentedControl, Select, StatusChip, Tag } from '../ds';
import type { VM } from '../model';
import { TrajectoryAudiences, TrajectoryLane } from './TrajectoryMapping';

const card: CSSProperties = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' };
const cardHead: CSSProperties = { padding: '12px 18px', borderBottom: '1px solid #eef0ea', background: '#fafbf8' };
const label: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' };
const diamond = (size: number, radius: number, font: number): CSSProperties => ({ width: size, height: size, flex: 'none', borderRadius: radius, background: '#fdf3dc', border: '1px solid #f0dca3', color: '#7a5000', fontSize: font, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' });
const iconButton: CSSProperties = { width: 28, height: 28, border: '1px solid #d5dacf', borderRadius: 4, background: '#fff', cursor: 'pointer', font: 'inherit', fontSize: 13, color: '#1a1d18', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

export default function TrajectoryEditor({ vm }: { vm: VM }) {
  return (
    <>
      <div style={{ ...card, padding: '14px 18px', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: '#5a6058' }}>
        <span style={{ flex: '1 1 320px', textWrap: 'pretty' }}><span style={{ fontWeight: 600, color: '#1a1d18' }}>What a trajectory is · </span>An ordered set of learnings, evidence, a counsellor sign-off and an exam that ends in a credential. You map it to an audience and a stage, like any learning.</span>
        <span style={{ flex: '1 1 320px', textWrap: 'pretty' }}><span style={{ fontWeight: 600, color: '#1a1d18' }}>Obligation · </span>Only business-line audiences can be mandatory or auto-enrolled; every other audience only gets a suggestion. A General or System Admin sets a trajectory with a mandatory map live.</span>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TrajectoryList vm={vm} />
        {vm.tj ? <TrajectoryBody vm={vm} /> : (
          <div style={{ flex: '999 1 600px', minWidth: 0, ...card, padding: '18px', color: '#5a6058' }}>No trajectory yet. Use + New to start a draft.</div>
        )}
      </div>
    </>
  );
}

function TrajectoryList({ vm }: { vm: VM }) {
  return (
    <div style={{ ...card, flex: '1 1 300px', maxWidth: 380, minWidth: 280 }}>
      <div style={{ ...cardHead, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>Trajectories · {vm.trjCount}</div><div style={{ fontSize: 12, color: '#5a6058' }}>Certifications and accreditations</div></div>
        <Button size="sm" variant="secondary" onClick={vm.trjNew}>+ New</Button>
      </div>
      {vm.trjList.map((tl) => (
        <button key={tl.id} type="button" onClick={tl.pick} aria-pressed={tl.on}
          style={{ appearance: 'none', display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: '12px 18px', border: 0, borderTop: '1px solid #eef0ea', boxShadow: tl.bar, background: tl.bg, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span aria-hidden="true" style={diamond(22, 5, 11)}>◆</span><span style={{ fontWeight: 600, lineHeight: 1.25, flex: 1, minWidth: 0 }}>{tl.name}</span></span>
          <span style={{ fontSize: 12, color: '#5a6058' }}>{tl.meta}</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><StatusChip status={tl.st} label={tl.stLabel} /><Tag tone="muted">{tl.enrolLabel}</Tag></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {tl.auds.map((ta) => <span key={ta.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#3d423b' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: ta.color, flex: 'none' }} />{ta.label}</span>)}
          </span>
        </button>
      ))}
    </div>
  );
}

function TrajectoryBody({ vm }: { vm: VM }) {
  const tj = vm.tj!;
  return (
    <div style={{ flex: '999 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={card}>
        <div style={{ ...cardHead, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span aria-hidden="true" style={diamond(36, 8, 16)}>◆</span>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 16 }}>{tj.name}</div><div style={{ fontSize: 12.5, color: '#5a6058' }}>{tj.sub}</div></div>
          </div>
          <SegmentedControl options={vm.trjStatusOptions} value={tj.status} onChange={tj.setStatus} size="md" />
        </div>
        <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          <Field label="Trajectory name" size="sm"><Input size="md" value={tj.name} onChange={tj.setName} /></Field>
          <Field label="Credential awarded" size="sm"><Input size="md" value={tj.cred} placeholder="e.g. Certified tax adviser" onChange={tj.setCred} /></Field>
          <Field label="Issuing body" size="sm"><Select size="md" options={tj.issuerOptions} value={tj.issuer} onChange={tj.setIssuer} /></Field>
          <Field label="How people enter" size="sm"><Select size="md" options={vm.trjEnrolOptions} value={tj.enrol} onChange={tj.setEnrol} /></Field>
          <Field label="Expected duration" size="sm"><Select size="md" options={tj.monthOptions} value={tj.months} onChange={tj.setMonths} /></Field>
          <Field label="Credential valid for" size="sm"><Select size="md" options={tj.validOptions} value={tj.valid} onChange={tj.setValid} /></Field>
          <Field label="Renewal rule" size="sm"><Input size="md" value={tj.renew} placeholder="e.g. Free online renewal assessment" onChange={tj.setRenew} /></Field>
          <Field label="Cost and sponsorship" size="sm"><Input size="md" value={tj.cost} placeholder="e.g. Exam fee paid by the firm" onChange={tj.setCost} /></Field>
        </div>
        <div style={{ borderTop: '1px solid #eef0ea', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))' }}>
          {tj.stats.map((st) => (
            <div key={st.label} style={{ padding: '12px 18px', borderRight: '1px solid #eef0ea', minWidth: 0 }}>
              <div style={label}>{st.label}</div><div style={{ fontWeight: 600, fontSize: 15, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{st.value}</div><div style={{ fontSize: 11.5, color: '#5a6058' }}>{st.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <Steps vm={vm} />
      <TrajectoryAudiences vm={vm} />
      <TrajectoryLane vm={vm} />
    </div>
  );
}

const lineStyle = { flex: 1, width: 2, background: '#e1e5dc', marginTop: 4 } as const;
const rail = { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none', width: 28 } as const;

function Steps({ vm }: { vm: VM }) {
  const tj = vm.tj!;
  return (
    <div style={card}>
      <div style={cardHead}><div style={{ fontWeight: 600 }}>Steps</div><div style={{ fontSize: 12, color: '#5a6058' }}>In order. Click a step to edit its window, prerequisite and whether it is required. The credential and recertification follow from the settings above.</div></div>
      <ol style={{ listStyle: 'none', margin: 0, padding: '8px 18px 6px' }}>
        {tj.steps.map((ts) => (
          <li key={ts.id} style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            <div aria-hidden="true" style={rail}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: ts.dotBg, color: ts.dotFg, border: ts.dotBd, fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 12 }}>{ts.n}</span>
              <span style={lineStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 0, margin: '4px 0', border: '1px solid ' + ts.bd, boxShadow: ts.ring, borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', flexWrap: 'wrap' }}>
              <button type="button" onClick={ts.pick} style={{ appearance: 'none', border: 0, background: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', flex: '1 1 260px', minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Tag tone={ts.tone}>{ts.kind}</Tag><span style={{ fontWeight: 600, lineHeight: 1.3 }}>{ts.title}</span></span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#5a6058', marginTop: 3 }}>{ts.meta}</span>
              </button>
              <span style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 'none' }}>
                <button type="button" aria-label={'Move step ' + ts.n + ' up'} onClick={ts.up} disabled={ts.noUp} style={{ ...iconButton, opacity: ts.upOp }}>↑</button>
                <button type="button" aria-label={'Move step ' + ts.n + ' down'} onClick={ts.down} disabled={ts.noDown} style={{ ...iconButton, opacity: ts.downOp }}>↓</button>
                <button type="button" aria-label={'Remove step ' + ts.n} onClick={ts.remove} style={iconButton}>×</button>
              </span>
            </div>
          </li>
        ))}
        <li style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          <div aria-hidden="true" style={rail}>
            <span style={{ width: 26, height: 26, borderRadius: 6, background: '#fdf3dc', color: '#7a5000', border: '1px solid #e0a100', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 12 }}>◆</span>
            {tj.hasRenew && <span style={{ flex: 1, width: 0, borderLeft: '2px dashed #e1e5dc', marginTop: 4 }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, margin: '4px 0', border: '1px solid #f0dca3', borderRadius: 6, background: '#fdf7e6', padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Tag tone="warning">Credential</Tag><span style={{ fontWeight: 600 }}>{tj.credTitle}</span></div>
            <div style={{ fontSize: 11.5, color: '#5a6058', marginTop: 3 }}>{tj.credMeta}</div>
          </div>
        </li>
        {tj.hasRenew && (
          <li style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            <div aria-hidden="true" style={rail}><span style={{ width: 26, height: 26, borderRadius: '50%', background: '#fff', color: '#5a6058', border: '1.5px dashed #b9bfb5', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 12 }}>↻</span></div>
            <div style={{ flex: 1, minWidth: 0, margin: '4px 0', border: '1px dashed #d5dacf', borderRadius: 6, background: '#fff', padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Tag tone="muted">Recertification</Tag><span style={{ fontWeight: 600 }}>{tj.renewTitle}</span></div>
              <div style={{ fontSize: 11.5, color: '#5a6058', marginTop: 3 }}>{tj.renewMeta}</div>
            </div>
          </li>
        )}
      </ol>
      <div style={{ borderTop: '1px solid #eef0ea', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ ...label, textTransform: 'none', letterSpacing: 0, fontSize: 12, marginRight: 2 }}>Add a step</span>
        <div style={{ flex: '0 1 280px', minWidth: 200 }}><Select size="md" aria-label="Add a learning from the library" options={tj.learnOptions} value="" onChange={tj.addLearn} /></div>
        <Button size="sm" variant="secondary" onClick={tj.addElect}>+ Electives</Button>
        <Button size="sm" variant="secondary" onClick={tj.addEvidence}>+ Evidence</Button>
        <Button size="sm" variant="secondary" onClick={tj.addCheck}>+ Counsellor sign-off</Button>
        <Button size="sm" variant="secondary" onClick={tj.addExam}>+ Exam</Button>
      </div>
      <StepEditor vm={vm} />
    </div>
  );
}

function StepEditor({ vm }: { vm: VM }) {
  const se = vm.tse;
  if (!se) return null;
  return (
    <div style={{ borderTop: '1px solid #e1e5dc', background: '#fafbf8', padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><div style={{ fontWeight: 600 }}>Step {se.n} · {se.kind}</div><LinkButton tone="muted" onClick={se.close}>Close</LinkButton></div>
      {se.isLearn && <div style={{ fontSize: 12.5, color: '#3d423b' }}>{se.learnInfo}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
        {se.isText && <Field label="What the step is" size="sm"><Input size="md" value={se.title} onChange={se.setTitle} /></Field>}
        {se.isText && <Field label="Study hours" size="sm"><Select size="md" options={se.hourOptions} value={se.hours} onChange={se.setHours} /></Field>}
        {se.isElect && <Field label="Learners choose" size="sm"><Select size="md" options={se.pickOptions} value={se.pick} onChange={se.setPick} /></Field>}
        <Field label="Target" size="sm"><Select size="md" options={se.winOptions} value={se.win} onChange={se.setWin} /></Field>
        <Field label="Only after" size="sm"><Select size="md" options={se.preOptions} value={se.pre} onChange={se.setPre} /></Field>
      </div>
      {se.isElect && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={label}>Options</div>
          {se.opts.map((eo) => (
            <div key={eo.title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid #e1e5dc', borderRadius: 5, background: '#fff', padding: '6px 10px' }}>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{eo.title}</div><div style={{ fontSize: 11.5, color: '#5a6058' }}>{eo.sub}</div></div>
              <LinkButton tone="muted" onClick={eo.remove}>Remove</LinkButton>
            </div>
          ))}
          <div style={{ maxWidth: 320 }}><Select size="md" aria-label="Add an option" options={se.optOptions} value="" onChange={se.addOpt} /></div>
        </div>
      )}
      {se.canReq && <Checkbox checked={se.req} onChange={se.toggleReq}>Required to earn the credential</Checkbox>}
      {se.isExam && <div style={{ fontSize: 12, color: '#5a6058' }}>An exam is always required. Set “Only after” so nobody books it before the learnings are done.</div>}
    </div>
  );
}
