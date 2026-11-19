// Create & share > New content: the Studios hub and the one studio D1 keeps, Flash card & Exam Studio (design v4).
// Hub of all eleven studios, the step spine (visibleSteps of the studio, see studioVals.ts), preview and send. It only reads from the view-model.
import { Banner, Button, Field, Input, LinkButton, Select, Stepper, Tag, Textarea } from '../ds';
import type { VM } from '../model';
import { BundlePicker, SubmitSide } from './CreateParts';
import { ItemPanel } from './CreateItems';
import ChipGroup from './ChipGroup';
import { Problems } from './CreateShared';
import { DraftRows, Produce, Shape } from './StudioSteps';
import { Preview } from './studioPreviews';

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
          <button key={k.id} type="button" onClick={k.open} disabled={k.disabled} style={{ appearance: 'none', font: 'inherit', textAlign: 'left', cursor: k.disabled ? 'not-allowed' : 'pointer', background: '#fff',
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
      {c.studio.formats.length > 1 && <ChipGroup heading="What are you making?" ariaLabel="Format" chips={c.studio.formats.map((f) => ({ ...f, key: f.label }))} />}
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
      <Problems list={send.problems} />
      {send.checkNote && <div style={{ fontSize: 12.5, color: '#5a6058' }}>{send.checkNote}</div>}
      {!c.studio.readOnly && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={send.check} disabled={send.checkBlocked}>{send.checkLabel}</Button>
          <Button onClick={send.run} disabled={send.blocked}>{send.label}</Button>
          <Button variant="secondary" onClick={send.saveDraft} disabled={send.busy}>Save draft</Button>
        </div>
      )}
    </>
  );
}

export function Studio({ c }: { c: CS }) {
  const st = c.studio;
  return (
    <div style={col}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <LinkButton tone="muted" onClick={st.toHub}>{st.backLabel}</LinkButton>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{st.studioName}</span>
      </div>
      {st.banner && <div role="note" style={{ fontSize: 12.5, color: '#3d423b', background: '#f3f5f0', border: '1px solid #e1e5dc', borderRadius: 6, padding: '8px 12px' }}>{st.banner}</div>}
      <Stepper steps={st.steps} current={st.step} />
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 560px', minWidth: 0, background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '18px 20px', ...col, gap: 16 }}>
          <div><div style={{ fontWeight: 600, fontSize: 15 }}>{st.stepTitle}</div><div style={{ fontSize: 12.5, color: '#5a6058' }}>{st.stepHint}</div></div>
          {st.stepName === 'Idea & sources' && <Idea c={c} />}
          {st.stepName === 'Shape it' && <Shape st={st} />}
          {st.stepName === 'Draft' && (st.flash ? c.itemsPanel && (
            <>
              <ItemPanel p={c.itemsPanel} />
              {st.itemsLabel && <div><Tag tone="blue">{st.itemsLabel}</Tag></div>}
            </>
          ) : <DraftRows st={st} />)}
          {st.stepName === 'Produce' && <Produce st={st} />}
          {st.stepName === 'Preview & test' && <Preview kind={st.def.pv} c={c} />}
          {st.stepName === 'Check & send' && <Check c={c} />}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', borderTop: '1px solid #eef0ea', paddingTop: 12 }}>
            <Button variant="secondary" size="sm" onClick={st.prev} disabled={st.noPrev}>Back</Button>
            {st.hasNext && <Button size="sm" onClick={st.next}>{st.nextLabel}</Button>}
          </div>
        </div>
        {st.stepName === 'Check & send' && <div style={{ flex: '0 1 340px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 18 }}><SubmitSide c={c} /></div>}
      </div>
    </div>
  );
}
