import { useRef } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Banner, Button, ChatBubble, Checkbox, Eyebrow, Field, FilterChip, Hover, Input, LinkButton, PageTitle, PillToggle, Select, StatusChip, Tabs, Tag, Textarea } from '../ds';
import type { VM } from '../model';

type KB = NonNullable<VM['kb']>;
const panel: CSSProperties = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6 };
const caps: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' };
const chk: CSSProperties = { fontSize: 12.5, gap: 8 };
const mono = 'ui-monospace,Menlo,monospace';
const pill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 4px 0 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 };
const x: CSSProperties = { width: 20, height: 20, border: 0, borderRadius: '50%', background: 'transparent', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 };

// Administration · Knowledge library (design v3): bundles of sources, RAG models and OKF files that creators draft from.
export default function KnowledgeScreen({ kb }: { kb: KB }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle title="Knowledge library" lead={kb.kbLead} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="file" multiple accept=".md,.markdown,text/markdown" ref={file} onChange={kb.kbOnImport} style={{ display: 'none' }} />
          <Button variant="secondary" onClick={() => file.current?.click()}>Import OKF files</Button>
          <Button onClick={kb.kbNew}>+ New bundle</Button>
        </div>
      </div>
      {kb.kbListMode ? <BundleList kb={kb} /> : <BundleDetail kb={kb} />}
    </>
  );
}

function BundleList({ kb }: { kb: KB }) {
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      <div style={{ ...panel, flex: '0 0 240px', padding: 8, position: 'sticky', top: 78, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ ...caps, padding: '6px 8px 4px' }}>Topics</div>
        {kb.kbTree.map((tn) => (
          <Hover key={tn.key} onClick={tn.pick} hoverStyle={{ background: '#f3f5f0' }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px 6px ' + tn.pad, borderRadius: 4, cursor: 'pointer', background: tn.bg, fontWeight: tn.fw, fontSize: tn.fs, color: '#1a1d18' }}>
            <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tn.label}</span>
            <span style={{ fontSize: 11.5, color: '#8b918a', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{tn.count}</span>
          </Hover>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px', maxWidth: 360 }}><Input placeholder="Search bundles, tags, concepts" value={kb.kbSearch} onChange={kb.kbSetSearch} /></div>
          <Select options={kb.kbSortOptions} value={kb.kbSort} onChange={kb.kbSetSort} />
          <span style={{ fontSize: 12.5, color: '#5a6058' }}>{kb.kbResultText}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {kb.kbTagChips.map((tc) => <FilterChip key={tc.label} selected={tc.on} onClick={tc.pick}># {tc.label}<span style={{ fontWeight: 400, opacity: 0.7 }}>{tc.count}</span></FilterChip>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
          {kb.kbCards.map((kc) => (
            <Hover key={kc.id} onClick={kc.open} hoverStyle={{ borderColor: '#b9bfb5', transform: 'translateY(-2px)' }}
              style={{ ...panel, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer', transition: 'transform .15s,border-color .15s', animation: 'pmFadeUp .35s ease-out backwards', animationDelay: kc.delay }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
                <StatusChip status={kc.st} label={kc.stLabel} icon={kc.stIcon} />
                <div style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}><Eyebrow tone="muted" size={11}>{kc.topic}</Eyebrow></div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.25 }}>{kc.name}</div>
              <div style={{ fontSize: 12.5, color: '#5a6058', textWrap: 'pretty', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{kc.desc}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{kc.tags.map((tg) => <span key={tg} style={{ fontSize: 11.5, fontWeight: 500, padding: '2px 8px', borderRadius: 999, background: '#f3f5f0', color: '#3d423b' }}># {tg}</span>)}</div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 6, borderTop: '1px solid #eef0ea', paddingTop: 9 }}>
                {kc.stats.map((ks) => <div key={ks.k}><div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{ks.v}</div><div style={{ fontSize: 11, color: '#8b918a' }}>{ks.k}</div></div>)}
              </div>
            </Hover>
          ))}
        </div>
      </div>
    </div>
  );
}

function BundleDetail({ kb }: { kb: KB }) {
  const s = kb.kbs;
  return (
    <>
      <div><LinkButton onClick={kb.kbBack}>← All bundles</LinkButton></div>
      <div style={{ ...panel, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', display: 'flex', gap: 14, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Eyebrow>{s.topicPath}</Eyebrow>
            {s.editing ? (
              <>
                <Input value={s.name} onChange={s.setName} placeholder="Bundle name" />
                <Textarea value={s.descRaw} onChange={s.setDesc} placeholder="What this bundle covers and when creators should use it" rows={3} />
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: 22, lineHeight: 1.2 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: '#5a6058', textWrap: 'pretty', maxWidth: 680 }}>{s.desc}</div>
              </>
            )}
            <div style={{ fontSize: 12, color: '#8b918a' }}>{s.owner}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <StatusChip status={s.st} label={s.stLabel} icon={s.stIcon} />
            <Button variant="secondary" size="sm" onClick={s.toggleEdit}>{s.editLabel}</Button>
            <Button variant="secondary" size="sm" onClick={s.reindex}>Re-index</Button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', borderTop: '1px solid #eef0ea' }}>
          {s.facts.map((kf) => <div key={kf.k} style={{ padding: '10px 20px', borderRight: '1px solid #eef0ea', minWidth: 0 }}><div style={{ fontSize: 11.5, color: '#8b918a' }}>{kf.k}</div><div style={{ fontWeight: 600, fontSize: 15 }}>{kf.v}</div></div>)}
        </div>
      </div>
      {!s.editable && <Banner tone="info">{s.readOnlyNote}</Banner>}
      <Tabs tabs={kb.kbTabs} value={kb.kbTab} onChange={kb.kbSetTab} />
      {kb.kbTab === 'overview' && <Overview kb={kb} />}
      {kb.kbTab === 'sources' && <Sources kb={kb} />}
      {kb.kbTab === 'models' && <Models kb={kb} />}
      {kb.kbTab === 'files' && <Files kb={kb} />}
      {kb.kbTab === 'test' && <TestRetrieval kb={kb} />}
    </>
  );
}

function Overview({ kb }: { kb: KB }) {
  const s = kb.kbs;
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ ...panel, flex: '1 1 420px', minWidth: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><div style={{ fontWeight: 600 }}>Classification</div><div style={{ fontSize: 12, color: '#5a6058' }}>One primary topic decides where the bundle sits in the library. Secondary topics make it findable from other branches.</div></div>
        <Field label="Primary topic" size="sm"><Select size="md" options={kb.kbTopicOptions} value={s.topic} onChange={s.setTopic} /></Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>Also filed under</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {s.topics2.map((t2) => (
              <span key={t2.key} style={{ ...pill, border: '1px solid #d5dacf' }}>{t2.label}
                <Hover as="button" type="button" onClick={t2.remove} hoverStyle={{ background: '#f3f5f0', color: '#1a1d18' }} style={{ ...x, color: '#8b918a' }}>×</Hover>
              </span>
            ))}
            <Select size="md" options={kb.kbTopic2Options} value="" onChange={s.addTopic2} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
          <Field label="Business line" size="sm" hint="Its Domain Admins edit it; firm-wide bundles are edited by a General or System Admin.">
            {s.editable ? <Select size="md" options={s.lineOptions} value={s.line} onChange={s.setLine} /> : <div style={{ fontWeight: 500, padding: '6px 0' }}>{s.line || 'Firm-wide'}</div>}
          </Field>
          <Field label="Who can use it" size="sm"><Select size="md" options={kb.kbAccessOptions} value={s.access} onChange={s.setAccess} /></Field>
          <Field label="Flag sources older than" size="sm"><Select size="md" options={kb.kbFreshOptions} value={s.fresh} onChange={s.setFresh} /></Field>
        </div>
        <Checkbox checked style={chk}>Client-confidential and licensed sources are never retrieved</Checkbox>
      </div>
      <div style={{ ...panel, flex: '1 1 380px', minWidth: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><div style={{ fontWeight: 600 }}>Tags</div><div style={{ fontSize: 12, color: '#5a6058' }}>Tags travel with the bundle into every OKF file and help creators find it. Suggestions come from terms that recur in the indexed passages.</div></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {s.tags.map((tg) => (
            <span key={tg.label} style={{ ...pill, background: '#1a1d18', color: '#fff', animation: 'pmPop .25s ease-out' }}># {tg.label}
              <Hover as="button" type="button" onClick={tg.remove} title="Remove tag" hoverStyle={{ background: '#2b2f29', color: '#fff' }} style={{ ...x, color: '#a9b0a5' }}>×</Hover>
            </span>
          ))}
          {s.noTags && <span style={{ fontSize: 12.5, color: '#8b918a' }}>No tags yet.</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><Input value={kb.kbTagIn} onChange={kb.kbSetTagIn} onKeyDown={kb.kbTagKey} placeholder="Add a tag and press Enter" /></div>
          <Button variant="secondary" size="lg" onClick={kb.kbAddTag}>Add</Button>
        </div>
        {s.sugg.length > 0 && (
          <>
            <div style={caps}>Suggested from content</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {s.sugg.map((sg) => (
                <Hover key={sg.label} as="button" type="button" onClick={sg.add} hoverStyle={{ background: '#f1f8e4' }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 999, border: '1px dashed #86BC25', background: '#fbfdf6', color: '#3f6a0a', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  + {sg.label}<span style={{ fontWeight: 400, color: '#5a6058' }}>{sg.conf}</span>
                </Hover>
              ))}
            </div>
          </>
        )}
        <div style={{ ...caps, marginTop: 4 }}>Concepts in this bundle</div>
        <div>
          {s.concepts.map((co) => (
            <Hover key={co.key} onClick={co.open} hoverStyle={{ background: '#fafbf8' }} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: '1px solid #eef0ea', cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{co.title}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{co.desc}</div></div>
              <span style={{ fontSize: 11.5, color: '#5a6058', whiteSpace: 'nowrap' }}>{co.type}</span>
            </Hover>
          ))}
        </div>
      </div>
    </div>
  );
}

const SRC_COLS = 'minmax(0,1fr) 110px 70px 80px 140px 24px';

function Sources({ kb }: { kb: KB }) {
  const s = kb.kbs;
  return (
    <div style={{ ...panel, overflow: 'hidden' }}>
      <div style={{ padding: '4px 20px 6px' }}>
        <div style={{ ...caps, display: 'grid', gridTemplateColumns: SRC_COLS, gap: 10, padding: '8px 0' }}><span>Source</span><span>Type</span><span style={{ textAlign: 'right' }}>Passages</span><span>Synced</span><span>Sensitivity</span><span /></div>
        {s.sources.map((sr) => (
          <div key={sr.key} style={{ display: 'grid', gridTemplateColumns: SRC_COLS, gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid #eef0ea', opacity: sr.op, animation: 'pmFadeUp .3s ease-out backwards' }}>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sr.name}</div><div style={{ fontSize: 11.5, color: sr.noteFg }}>{sr.note}</div></div>
            <span style={{ fontSize: 12, color: '#5a6058' }}>{sr.type}</span>
            <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{sr.chunks}</span>
            <span style={{ fontSize: 12, color: '#5a6058' }}>{sr.synced}</span>
            <Tag tone={sr.tone}>{sr.sens}</Tag>
            <Hover as="button" type="button" onClick={sr.remove} title="Remove source" hoverStyle={{ background: '#f3f5f0', color: '#1a1d18' }} style={{ ...x, width: 22, height: 22, color: '#8b918a', fontFamily: 'inherit', fontSize: 15 }}>×</Hover>
          </div>
        ))}
        {!s.sources.length && <div style={{ padding: '14px 0', borderTop: '1px solid #eef0ea', color: '#8b918a' }}>No sources yet. Add one below or import OKF files.</div>}
      </div>
      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #eef0ea', background: '#fafbf8', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span style={{ fontWeight: 500 }}>Add a source</span><PillToggle options={kb.kbConnOptions} value={kb.kbAdd.conn} onChange={kb.kbSetConn} size="xs" /></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}><Input value={kb.kbAdd.name} onChange={kb.kbSetAddName} placeholder={kb.kbAddPh} /></div>
          <Select options={kb.kbSensOptions} value={kb.kbAdd.sens} onChange={kb.kbSetSens} />
          <Button size="lg" onClick={kb.kbAddSource}>Add</Button>
        </div>
      </div>
    </div>
  );
}

function Models({ kb }: { kb: KB }) {
  const km = kb.km;
  const sel = (label: string, options: { value: string; label: string }[], value: string, on: (e: ChangeEvent<HTMLSelectElement>) => void) =>
    <Field label={label} size="sm"><Select size="md" options={options} value={value} onChange={on} /></Field>;
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '0 1 280px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {kb.kbModels.map((md) => (
          <Hover key={md.id} onClick={md.open} hoverStyle={{ borderColor: '#b9bfb5' }}
            style={{ background: '#fff', border: '1px solid ' + md.bd, borderRadius: 6, boxShadow: md.ring, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, transition: 'box-shadow .15s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><span style={{ fontWeight: 600 }}>{md.name}</span>{md.def && <Tag tone="green">Default</Tag>}</div>
            <div style={{ fontSize: 12, color: '#5a6058' }}>{md.sub}</div>
          </Hover>
        ))}
        <Button variant="secondary" onClick={kb.kbNewModel}>+ New RAG model</Button>
      </div>
      <div style={{ ...panel, flex: '1 1 520px', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eef0ea', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}><Input value={km.name} onChange={km.setName} /></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {km.notDef && <Button variant="secondary" size="sm" onClick={km.makeDef}>Set as default</Button>}
            <LinkButton onClick={km.dup}>Duplicate</LinkButton>
            <LinkButton tone="muted" onClick={km.del}>Delete</LinkButton>
          </div>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={caps}>Retrieval</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
            {sel('Embedding model', kb.kbEmbedOptions, km.embed, km.set.embed)}
            {sel('Chunk size', kb.kbChunkOptions, km.chunk, km.set.chunk)}
            {sel('Chunk overlap', kb.kbOverlapOptions, km.overlap, km.set.overlap)}
            {sel('Passages per answer', kb.kbTopkOptions, km.topk, km.set.topk)}
            {sel('Similarity threshold', kb.kbThreshOptions, km.thresh, km.set.thresh)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ fontWeight: 500 }}>Hybrid search</span><span style={{ color: '#5a6058', fontVariantNumeric: 'tabular-nums' }}>{km.hybridText}</span></div>
            <input type="range" min={0} max={100} step={10} value={km.hybrid} onChange={km.setHybrid} style={{ width: '100%', accentColor: '#86BC25' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8b918a' }}><span>Meaning (vector)</span><span>Exact words (keyword)</span></div>
          </div>
          <Checkbox checked={km.rerank} onChange={km.setRerank} style={chk}>Re-rank passages before generation</Checkbox>
          <div style={{ ...caps, marginTop: 4 }}>Generation</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
            {sel('Generation model', kb.kbGenOptions, km.gen, km.set.gen)}
            {sel('Temperature', kb.kbTempOptions, km.temp, km.set.temp)}
            {sel('Citations required', kb.kbCiteOptions, km.cite, km.set.cite)}
          </div>
          <div style={{ fontSize: 12.5, color: '#3d423b', background: '#fafbf8', border: '1px solid #eef0ea', borderRadius: 6, padding: '10px 12px', textWrap: 'pretty' }}>{km.summary}</div>
        </div>
      </div>
    </div>
  );
}

function Files({ kb }: { kb: KB }) {
  const fv = kb.kbFileView;
  return (
    <div style={{ ...panel, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea', background: '#fafbf8', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{kb.kbOkfRoot}</div><div style={{ fontSize: 12, color: '#5a6058' }}>Open Knowledge Format v0.2 · markdown files with YAML frontmatter · generated from this bundle and kept in sync</div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" size="sm" onClick={kb.kbValidate}>Validate</Button><Button size="sm" onClick={kb.kbDownload}>Download .tar</Button></div>
      </div>
      {kb.kbHasValid && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #eef0ea', display: 'flex', flexDirection: 'column', gap: 5, animation: 'pmFadeUp .3s ease-out' }}>
          {kb.kbValidRows.map((vr, i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: vr.dot, flex: 'none', marginTop: 6 }} /><span style={{ color: vr.fg, textWrap: 'pretty' }}>{vr.text}</span></div>)}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 420 }}>
        <div style={{ flex: '0 1 270px', minWidth: 230, borderRight: '1px solid #eef0ea', padding: 8, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {kb.kbTreeFiles.map((fl) => (
            <Hover key={fl.key} onClick={fl.open} hoverStyle={{ background: fl.hover }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px 5px ' + fl.pad, borderRadius: 4, cursor: fl.cursor, background: fl.bg, fontFamily: mono, fontSize: 12, color: fl.fg, fontWeight: fl.fw }}>
              <span style={{ width: 12, textAlign: 'center', color: '#8b918a', flex: 'none' }}>{fl.icon}</span><span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fl.name}</span>
            </Hover>
          ))}
        </div>
        <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #eef0ea', display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: mono, fontSize: 12, color: '#5a6058' }}><span>{fv.path}</span><span>type: {fv.type}</span></div>
          <pre style={{ margin: 0, padding: '12px 14px', background: '#f3f5f0', borderBottom: '1px solid #eef0ea', fontFamily: mono, fontSize: 12, lineHeight: 1.55, color: '#3f6a0a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fv.front}</pre>
          <pre style={{ margin: 0, padding: '12px 14px', fontFamily: mono, fontSize: 12, lineHeight: 1.55, color: '#1a1d18', whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{fv.body}</pre>
        </div>
      </div>
    </div>
  );
}

function TestRetrieval({ kb }: { kb: KB }) {
  return (
    <div style={{ ...panel, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #eef0ea', background: '#171a16', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 22, height: 22, borderRadius: 5, background: '#86BC25', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10180a' }} /></span>
          <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>Test retrieval</div><div style={{ fontSize: 11.5, color: '#a9b0a5' }}>{kb.kbTestSub}</div></div>
        </div>
        <div style={{ width: 220 }}><Select size="md" options={kb.kbTestModelOptions} value={kb.kbTestModelId} onChange={kb.kbSetTestModel} /></div>
      </div>
      <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{kb.kbPrompts.map((kp) => <FilterChip key={kp.label} onClick={kp.send}>{kp.label}</FilterChip>)}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><Input value={kb.kbQ} onChange={kb.kbSetQ} onKeyDown={kb.kbKey} placeholder="Ask what a creator would ask" /></div>
          <Button size="lg" onClick={kb.kbAsk} disabled={kb.kbBusy}>Ask</Button>
        </div>
        {kb.kbHasHits && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={caps}>Retrieved · {kb.kbHitCount}</div>
            {kb.kbHits.map((kh) => (
              <div key={kh.n} style={{ display: 'grid', gridTemplateColumns: '26px minmax(0,1fr) 90px', gap: 10, alignItems: 'start', padding: '8px 10px', border: '1px solid #eef0ea', borderRadius: 6, animation: 'pmFadeUp .3s ease-out backwards', animationDelay: kh.delay }}>
                <span style={{ fontWeight: 600, color: '#5a6058' }}>[{kh.n}]</span>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, textWrap: 'pretty' }}>{kh.text}</div><div style={{ fontSize: 11.5, color: '#8b918a', marginTop: 2 }}>{kh.src}</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: '#5a6058' }}>{kh.score}</span>
                  <div style={{ width: 80, height: 5, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}><div style={{ height: '100%', width: kh.w, background: '#86BC25' }} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
        {kb.kbBusy && <ChatBubble role="assistant"><span style={{ color: '#8b918a' }}>Drafting from the passages</span></ChatBubble>}
        {kb.kbAnswer && <ChatBubble role="assistant">{kb.kbAnswer}</ChatBubble>}
        {kb.kbAnswer && <div style={{ fontSize: 11.5, color: '#8b918a' }}>{kb.kbAnswerNote}</div>}
        {kb.kbNoHits && <Banner tone="warning">{kb.kbNoHitText}</Banner>}
      </div>
    </div>
  );
}
