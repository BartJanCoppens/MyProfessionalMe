// Create & share > New content: the Studios hub and the one studio D1 keeps, Flash card & Exam Studio (design v4).
// Hub, six-step spine (four steps here, see studioVals.ts), play-test and send. It only reads from the view-model.
import { Banner, Button, Field, Input, LinkButton, Select, Stepper, Tag, Textarea } from '../ds';
import type { VM } from '../model';
import { BundlePicker, SubmitSide } from './CreateParts';
import { ItemPanel } from './CreateItems';
import StudioPlayTest from './StudioPlayTest';

type CS = NonNullable<VM['create']>;
const col = { display: 'flex', flexDirection: 'column' as const, gap: 14 };

export function Hub({ c }: { c: CS }) {
  const st = c.studio;
  return (
    <div style={col}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Studios</div>
        <LinkButton onClick={st.openUpload}>{st.uploadLabel}</LinkButton>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,340px))', gap: 12 }}>
        {st.cards.map((k) => (
          <button key={k.name} type="button" onClick={k.open} disabled={k.disabled} style={{ appearance: 'none', font: 'inherit', textAlign: 'left', cursor: k.disabled ? 'not-allowed' : 'pointer', background: '#fff',
            border: '1px solid #e1e5dc', borderRadius: 6, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, color: k.disabled ? '#8b918a' : '#1a1d18' }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{k.name}</span>
            <span style={{ fontSize: 12.5, color: '#5a6058', textWrap: 'pretty' }}>{k.tag}</span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Tag tone="muted">{k.out}</Tag><Tag tone="muted">{k.time}</Tag></span>
            {k.note && <span style={{ fontSize: 12, color: '#7a5000' }}>{k.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Idea({ c }: { c: CS }) {
  const nw = c.nw;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontWeight: 500 }}>What are you making?</span>
        <div role="group" aria-label="Format" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {c.studio.formats.map((f) => (
            <button key={f.label} type="button" onClick={f.pick} aria-pressed={f.on} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid ' + (f.on ? '#1a1d18' : '#d5dacf'), background: f.on ? '#1a1d18' : '#fff',
              color: f.on ? '#fff' : '#1a1d18', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13 }}>{f.label}</button>
          ))}
        </div>
      </div>
      <Field label="Title" hint="Say what people will be able to do, in under 60 characters.">
        <Input value={nw.title} onChange={c.nwSetTitle} placeholder="e.g. Belgian VAT invoice essentials" aria-label="Title" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <Field label="Domain"><Select options={c.domainOptions} value={nw.dom} onChange={c.nwSetDom} aria-label="Domain" /></Field>
        <Field label="Level"><Select options={c.levelOptions} value={nw.lvl} onChange={c.nwSetLvl} aria-label="Level" /></Field>
        <Field label="Who it is for"><Select options={c.stageOptions} value={nw.stage} onChange={c.nwSetStage} aria-label="Who it is for" /></Field>
      </div>
      <Field label="The one takeaway" hint={c.nwTakeHint}>
        <Textarea value={nw.take} onChange={c.nwSetTake} placeholder="One or two sentences. Reviewers judge the piece against this." aria-label="The one takeaway" />
      </Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8' }}>
        <div style={{ fontWeight: 500 }}>Ground it in firm knowledge</div>
        <div style={{ fontSize: 12, color: '#5a6058' }}>Bundles curated by the knowledge team. The draft uses only their passages.</div>
        <BundlePicker c={c} />
      </div>
    </>
  );
}

function Check({ c }: { c: CS }) {
  const send = c.studio.send;
  return (
    <>
      {c.nwRuleWarn && <Banner tone="warning">{c.nwRuleWarn}</Banner>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={send.run} disabled={send.blocked}>{send.label}</Button>
        <Button variant="secondary" onClick={send.saveDraft} disabled={send.busy}>Save draft</Button>
      </div>
    </>
  );
}

export function Studio({ c }: { c: CS }) {
  const st = c.studio;
  return (
    <div style={col}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <LinkButton tone="muted" onClick={st.toHub}>{st.backLabel}</LinkButton>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{st.cards[0].name}</span>
      </div>
      <Stepper steps={st.steps} current={st.step} />
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 560px', minWidth: 0, background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '18px 20px', ...col, gap: 16 }}>
          <div><div style={{ fontWeight: 600, fontSize: 15 }}>{st.stepTitle}</div><div style={{ fontSize: 12.5, color: '#5a6058' }}>{st.stepHint}</div></div>
          {st.step === 0 && <Idea c={c} />}
          {st.step === 1 && c.itemsPanel && (
            <>
              <ItemPanel p={c.itemsPanel} />
              {st.itemsLabel && <div><Tag tone="blue">{st.itemsLabel}</Tag></div>}
            </>
          )}
          {st.step === 2 && <StudioPlayTest preview={st.preview} />}
          {st.step === 3 && <Check c={c} />}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', borderTop: '1px solid #eef0ea', paddingTop: 12 }}>
            <Button variant="secondary" size="sm" onClick={st.prev} disabled={st.noPrev}>Back</Button>
            {st.hasNext && <Button size="sm" onClick={st.next}>{st.nextLabel}</Button>}
          </div>
        </div>
        {st.step === 3 && <div style={{ flex: '0 1 340px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 18 }}><SubmitSide c={c} /></div>}
      </div>
    </div>
  );
}
