// Create & share: the New content form (the upload form), split out of Create.tsx. Its file block is the format's:
// cards or questions (ItemPanel), a Presentation's .horizon file (HorizonUpload), or the note that files come later.
// It only reads from the view-model (createVals.ts).
import { Banner, Button, Field, Input, LinkButton, Select, Tag, Textarea } from '../ds';
import type { VM } from '../model';
import { label } from './labelStyle';
import { BundlePicker, SubmitSide } from './CreateParts';
import { ItemPanel } from './CreateItems';
import HorizonUpload from './HorizonUpload';

type CS = NonNullable<VM['create']>;
const card = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6 };

export default function NewTab({ c }: { c: CS }) {
  const nw = c.nw;
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 560px', minWidth: 0, ...card, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!c.editing && <div><LinkButton tone="muted" onClick={c.studio.toHub}>{c.studio.backLabel}</LinkButton></div>}
        {c.editing && <Banner tone="info">{c.editingNote}</Banner>}
        <div style={{ fontSize: 12.5, color: '#5a6058', textWrap: 'pretty' }}>{c.locked ? c.lockedNote : c.nwRulesText}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <Field label="Business line"><Select value={nw.line} onChange={c.nwSetLine} options={c.lineOptions} aria-label="Business line" /></Field>
          <Field label="Industry or technology"><Select value={nw.aud} onChange={c.nwSetAud} options={c.audOptions} aria-label="Industry or technology" /></Field>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontWeight: 500 }}>What are you making?</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
            {c.newTypes.map((ty) => (
              <button key={ty.label} type="button" onClick={ty.pick} aria-pressed={nw.type === ty.label}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 6, border: '1px solid ' + ty.bd, background: ty.bg, color: ty.fg, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{ty.label}</span><span style={{ fontSize: 11.5, opacity: 0.8, textWrap: 'pretty' }}>{ty.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Title" hint="Say what people will be able to do, in under 60 characters.">
          <Input value={nw.title} onChange={c.nwSetTitle} placeholder="e.g. Three questions that expose scope creep" aria-label="Title" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <Field label="Domain"><Select options={c.domainOptions} value={nw.dom} onChange={c.nwSetDom} aria-label="Domain" /></Field>
          <Field label="Level"><Select options={c.levelOptions} value={nw.lvl} onChange={c.nwSetLvl} aria-label="Level" /></Field>
          <Field label="Who it is for"><Select options={c.stageOptions} value={nw.stage} onChange={c.nwSetStage} aria-label="Who it is for" /></Field>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>Ground it in firm knowledge</div>
              <div style={{ fontSize: 12, color: '#5a6058' }}>Bundles curated by the knowledge team. The draft uses only their passages and cites every source.</div>
            </div>
            <Button variant="dark" size="sm" onClick={c.nwDraftAi} disabled={c.nwAiBusy}>{c.nwAiLabel}</Button>
          </div>
          <BundlePicker c={c} />
          {c.nwHasAi && (
            <div style={{ border: '1px dashed #86BC25', borderRadius: 6, background: '#fff', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, animation: 'pmFadeUp .3s ease-out' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={label}>Suggested outline</span><Tag tone="blue">{c.nwAiNote}</Tag></div>
              {c.nwAiOutline.map((ol) => <div key={ol.n} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><span style={{ fontWeight: 600, color: '#5a6058', flex: 'none' }}>{ol.n}</span><span style={{ textWrap: 'pretty' }}>{ol.text}</span></div>)}
              <div style={{ ...label, marginTop: 2 }}>Sources cited</div>
              {c.nwAiCites.map((ct) => <div key={ct.n} style={{ fontSize: 12, color: '#3d423b' }}><span style={{ fontWeight: 600 }}>[{ct.n}]</span> {ct.text}</div>)}
              <div style={{ fontSize: 11.5, color: '#8b918a' }}>The takeaway field was filled in. Edit it in your own words; reviewers see the cited sources.</div>
            </div>
          )}
        </div>
        <Field label="The one takeaway" hint={c.nwTakeHint}>
          <Textarea value={nw.take} onChange={c.nwSetTake} placeholder="One or two sentences. Reviewers judge the piece against this." aria-label="The one takeaway" />
        </Field>
        {c.itemsPanel ? <ItemPanel p={c.itemsPanel} /> : c.horizonPanel ? <HorizonUpload p={c.horizonPanel} /> : <div style={{ padding: 12, border: '1px dashed #cfd4c9', borderRadius: 6, fontSize: 12.5, color: '#5a6058', textWrap: 'pretty' }}>{c.nwFileText}</div>}
        {c.nwRuleWarn && <Banner tone="warning">{c.nwRuleWarn}</Banner>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={c.nwSubmit} disabled={c.nwBlocked}>{c.nwSubmitLabel}</Button>
          <Button variant="secondary" onClick={c.nwDraft} disabled={c.busy}>Save draft</Button>
          {c.editing && <LinkButton tone="muted" onClick={c.nwCancel}>Cancel</LinkButton>}
        </div>
      </div>
      <div style={{ flex: '0 1 340px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SubmitSide c={c} />
      </div>
    </div>
  );
}
