// Create & share (design v3): My contributions, Review for peers, New content and, for admins, Review requirements.
// A transcription of the template's CREATE & SHARE block; it only reads from the view-model (createVals.ts).
import { Banner, Button, Checkbox, Eyebrow, Hover, LinkButton, PageTitle, Select, StatusChip, Stepper, Tabs, Tag, Textarea } from '../ds';
import type { VM } from '../model';
import { label } from './labelStyle';
import { ItemList } from './CreateItems';
import NewTab from './CreateNew';
import { Hub, Studio } from './Studios';
import { SavedContent } from './studioPreviews';
import RuleChips from './RuleChips';

type CS = NonNullable<VM['create']>;
const card = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6 };

export default function CreateScreen({ c }: { c: CS }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle title="Create & share" lead={c.lead} />
        <Button onClick={c.goNew} disabled={!c.canCreate}>+ New content</Button>
      </div>
      {c.readOnly && <Banner tone="warning">{c.readOnlyNote}</Banner>}
      {c.error && <Banner tone="warning" actions={<Button size="sm" variant="secondary" onClick={c.retry}>Try again</Button>}>{c.error}</Banner>}
      {!c.canCreate && !c.loading && !c.error && <Banner tone="info" title="Ask an admin for creation rights">{c.noGrantText}</Banner>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', ...card, overflow: 'hidden' }}>
        {c.reviewSteps.map((rs) => (
          <div key={rs.n} style={{ padding: '12px 14px', borderLeft: '1px solid #eef0ea', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: rs.bg, color: rs.fg, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{rs.n}</span>
              <span style={{ fontWeight: 600 }}>{rs.name}</span>
            </div>
            <div style={{ fontSize: 12, color: '#5a6058', textWrap: 'pretty' }}>{rs.who}</div>
          </div>
        ))}
      </div>
      <Tabs tabs={c.tabs} value={c.tab} onChange={c.setTab} />
      {c.loading && <div style={{ color: '#5a6058' }}>Loading your contributions</div>}
      {!c.loading && c.tabMine && <Mine c={c} />}
      {!c.loading && c.tabReview && <ReviewTab c={c} />}
      {!c.loading && c.tabNew && (c.newView === 'hub' ? <Hub c={c} /> : c.newView === 'studio' ? <Studio c={c} /> : <NewTab c={c} />)}
      {!c.loading && c.tabRules && <Rules c={c} />}
    </>
  );
}

function ListCard({ on, bd, ring, onClick, children }: { on?: boolean; bd: string; ring: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Hover onClick={onClick} aria-current={on || undefined} hoverStyle={{ borderColor: '#b9bfb5' }}
      style={{ background: '#fff', border: '1px solid ' + bd, boxShadow: ring, borderRadius: 6, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, transition: 'box-shadow .15s' }}>
      {children}
    </Hover>
  );
}

function Outline({ outline, sources, aiTag }: { outline: string[]; sources: string[]; aiTag: string }) {
  if (!outline.length && !sources.length) return null;
  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={label}>Outline</span>{aiTag && <Tag tone="blue">{aiTag}</Tag>}</div>
      {outline.map((o, k) => <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}><span style={{ fontWeight: 600, color: '#5a6058', flex: 'none' }}>{k + 1}.</span><span style={{ textWrap: 'pretty' }}>{o}</span></div>)}
      {sources.length > 0 && <div style={{ ...label, marginTop: 2 }}>Sources cited</div>}
      {sources.map((s, k) => <div key={k} style={{ fontSize: 12, color: '#3d423b' }}><span style={{ fontWeight: 600 }}>[{k + 1}]</span> {s}</div>)}
    </div>
  );
}

function Mine({ c }: { c: CS }) {
  const cs = c.cs;
  if (c.noMine) return <div style={{ ...card, padding: '18px 20px', color: '#5a6058' }}>{c.noMineText}</div>;
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '0 1 320px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.contribList.map((cb) => (
          <ListCard key={cb.id} bd={cb.bd} ring={cb.ring} onClick={cb.open}>
            <div style={{ fontSize: 11.5, color: '#8b918a' }}>{cb.type} · {cb.date}</div>
            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25, textWrap: 'pretty' }}>{cb.title}</div>
            <div><StatusChip status={cb.st} label={cb.stLabel} icon={cb.stIcon as 'dot' | 'check'} /></div>
          </ListCard>
        ))}
      </div>
      {cs && (
        <div style={{ flex: '1 1 560px', minWidth: 0, ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef0ea', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <Eyebrow>{cs.eyebrow}</Eyebrow>
                <div style={{ fontWeight: 600, fontSize: 20, lineHeight: 1.2, marginTop: 4, textWrap: 'pretty' }}>{cs.title}</div>
                <div style={{ fontSize: 12.5, color: '#5a6058', marginTop: 2 }}>{cs.date}</div>
              </div>
              <StatusChip status={cs.st} label={cs.stLabel} icon={cs.stIcon as 'dot' | 'check'} />
            </div>
            <Stepper steps={cs.stages} current={cs.stage} />
          </div>
          {cs.hasTake && <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea' }}><div style={label}>Takeaway</div><p style={{ margin: '4px 0 0', textWrap: 'pretty' }}>{cs.takeaway}</p></div>}
          <Outline outline={cs.outline} sources={cs.sources} aiTag={cs.aiTag} />
          <ItemList head={cs.itemsHead} rows={cs.itemRows} />
          <ItemList head={cs.answersHead} rows={cs.answerRows} />
          <SavedContent t={cs.asLearner} />
          {cs.hasRevs && (
            <div style={{ padding: '4px 20px 8px', borderBottom: '1px solid #eef0ea' }}>
              {cs.revs.map((rv) => (
                <div key={rv.key} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,170px) auto minmax(0,1fr)', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid #eef0ea' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: rv.avBg, color: '#fff', fontSize: 10.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{rv.init}</span>
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 12.5 }}>{rv.name}</div><div style={{ fontSize: 11.5, color: '#8b918a' }}>{rv.role}</div></div>
                  <StatusChip status={rv.st} label={rv.stLabel} icon={rv.stIcon as 'dot' | 'check'} />
                  <div style={{ fontSize: 12.5, color: '#3d423b', textWrap: 'pretty' }}>{rv.comment}<span style={{ color: '#8b918a' }}>{rv.date}</span></div>
                </div>
              ))}
            </div>
          )}
          {cs.isDraft && <div style={{ padding: '14px 20px', borderBottom: '1px solid #eef0ea', fontSize: 12.5, color: '#5a6058', textWrap: 'pretty' }}>{cs.draftNote}</div>}
          {cs.isPub && <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea', fontSize: 12.5, color: '#5a6058' }}>{cs.pubNote}</div>}
          {(cs.mainLabel || cs.secondLabel || cs.thirdLabel) && (
            <div style={{ padding: '12px 20px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {cs.mainLabel && <Button variant={cs.mainVariant as 'primary' | 'secondary'} onClick={cs.main} disabled={c.busy}>{cs.mainLabel}</Button>}
              {cs.secondLabel && <LinkButton tone="muted" onClick={cs.second}>{cs.secondLabel}</LinkButton>}
              {cs.thirdLabel && <LinkButton tone="muted" onClick={cs.third}>{cs.thirdLabel}</LinkButton>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewTab({ c }: { c: CS }) {
  const rs = c.rs;
  if (c.noRev) return <div style={{ ...card, padding: '18px 20px', color: '#5a6058' }}>{c.noRevText}</div>;
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '0 1 320px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {c.revList.map((rq) => (
          <ListCard key={rq.key} bd={rq.bd} ring={rq.ring} onClick={rq.open}>
            <div style={{ fontSize: 11.5, color: '#8b918a' }}>{rq.type} · {rq.author}</div>
            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25, textWrap: 'pretty' }}>{rq.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#5a6058' }}>{rq.due}</span>
              <StatusChip status={rq.st} label={rq.stLabel} icon={rq.stIcon as 'dot' | 'check'} />
            </div>
          </ListCard>
        ))}
      </div>
      {rs && (
        <div style={{ flex: '1 1 560px', minWidth: 0, ...card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef0ea', display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a1d18', color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{rs.ai}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow>{rs.eyebrow}</Eyebrow>
              <div style={{ fontWeight: 600, fontSize: 20, lineHeight: 1.2, marginTop: 4, textWrap: 'pretty' }}>{rs.title}</div>
              <div style={{ fontSize: 12.5, color: '#5a6058', marginTop: 2 }}>{rs.meta}</div>
            </div>
          </div>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea' }}><div style={label}>Author's takeaway</div><p style={{ margin: '4px 0 0', textWrap: 'pretty' }}>{rs.takeaway}</p></div>
          <Outline outline={rs.outline} sources={rs.sources} aiTag={rs.aiTag} />
          <ItemList head={rs.itemsHead} rows={rs.itemRows} />
          <ItemList head={rs.answersHead} rows={rs.answerRows} />
          <SavedContent t={rs.asLearner} />
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={label}>Automatic checks</div>
            {rs.checks.map((ck) => <div key={ck.text} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: ck.dot, flex: 'none' }} /><span style={{ color: ck.fg }}>{ck.text}</span></div>)}
            <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>{rs.fileNote}</div>
          </div>
          {rs.open && (
            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={label}>Your review · all four must hold to approve</div>
              {rs.rubric.map((rb) => <Checkbox key={rb.label} checked={rb.on} onChange={rb.toggle}>{rb.label}</Checkbox>)}
              <Textarea placeholder="What should the author keep, change or cut? Use time stamps for audio and video." value={rs.comment} onChange={rs.setComment} minHeight={76} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button onClick={rs.approve} disabled={!rs.canApprove}>Approve</Button>
                <Button variant="secondary" onClick={rs.changes} disabled={c.busy}>Request changes</Button>
                <span style={{ fontSize: 12, color: '#8b918a' }}>{rs.next}</span>
              </div>
            </div>
          )}
          {rs.closed && <div style={{ padding: '14px 20px' }}><Banner tone={rs.bannerTone as 'success' | 'warning'}>{rs.doneText}</Banner></div>}
        </div>
      )}
    </div>
  );
}

function Rules({ c }: { c: CS }) {
  const pf = c.polForm;
  return (
    <div style={{ ...card, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12.5, color: '#5a6058', textWrap: 'pretty' }}>{c.rulesLead}</div>
      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.defaultPolicy}</div>
      {c.policyRows.map((p) => (
        <div key={p.key} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid #eef0ea' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}><div style={{ fontWeight: 600 }}>{p.label}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{p.summary}</div></div>
          {p.editable ? (
            <>
              <div style={{ width: 130 }}><Select size="md" value={p.peers} onChange={(e) => p.setPeers(e.target.value)} options={c.peerOptions} aria-label={'Peers for ' + p.label} /></div>
              <Checkbox checked={p.expert} onChange={p.setExpert}>Expert</Checkbox>
              <Checkbox checked={p.quality} onChange={p.setQuality}>Quality &amp; risk</Checkbox>
              <LinkButton tone="muted" onClick={p.remove}>Remove</LinkButton>
            </>
          ) : <Tag tone="muted">Set by another admin</Tag>}
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0 0', borderTop: '1px solid #eef0ea' }}>
        <div style={{ fontWeight: 600 }}>Add a review requirement</div>
        <RuleChips groups={c.polGroups} preview={c.polPreview} problem={c.polProblem} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 130 }}><Select size="md" value={pf.peers} onChange={(e) => c.polSet({ peers: e.target.value })} options={c.peerOptions} aria-label="Peers" /></div>
          <Checkbox checked={pf.expert} onChange={(v) => c.polSet({ expert: v })}>Expert</Checkbox>
          <Checkbox checked={pf.quality} onChange={(v) => c.polSet({ quality: v })}>Quality &amp; risk</Checkbox>
          <Button size="sm" onClick={c.polAdd} disabled={c.busy || !!c.polProblem}>Add requirement</Button>
        </div>
      </div>
    </div>
  );
}
