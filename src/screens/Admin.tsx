import { Banner, Button, Drawer, Field, Hover, Input, LinkButton, PageTitle, SegmentedControl, Select, StatusChip, Tag, Textarea } from '../ds';
import type { VM } from '../model';

const LIB_COLS = 'minmax(0,2.4fr) 120px minmax(0,1.2fr) 100px minmax(0,1.8fr) 130px 60px';
const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

export function AdminLibraryScreen({ vm }: { vm: VM }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle title="Learning library" lead={vm.adminLead} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="secondary" onClick={vm.syncNow}>Sync programs</Button>
          <Button onClick={vm.openDrawer}>+ Add learning</Button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        {vm.programs.map((pg) => (
          <div key={pg.name} style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: pg.dot, flex: 'none' }} /><span style={{ fontWeight: 600, ...ellipsis }}>{pg.name}</span></div>
            <div style={{ fontSize: 12, color: '#5a6058' }}>{pg.count} learnings · {pg.sync}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', maxWidth: 320 }}><Input placeholder="Search the library" value={vm.adminQ} onChange={vm.setAdminQ} /></div>
        <SegmentedControl options={vm.pubOptions} value={vm.adminStatus} onChange={vm.setAdminStatus} size="lg" />
      </div>
      <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflowX: 'auto' }}>
        <div style={{ minWidth: 960 }}>
          <div style={{ display: 'grid', gridTemplateColumns: LIB_COLS, fontSize: 11.5, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e1e5dc', background: '#fafbf8' }}>
            <div style={{ padding: '10px 12px' }}>Learning</div><div style={{ padding: '10px 12px' }}>Level</div><div style={{ padding: '10px 12px' }}>Source</div><div style={{ padding: '10px 12px', textAlign: 'right' }}>Effort</div>
            <div style={{ padding: '10px 12px' }}>On paths</div><div style={{ padding: '10px 12px' }}>Status</div><div style={{ padding: '10px 12px' }} />
          </div>
          {vm.adminRows.map((r) => (
            <Hover key={r.id} hoverStyle={{ background: '#fafbf8' }} style={{ display: 'grid', gridTemplateColumns: LIB_COLS, alignItems: 'center', borderBottom: '1px solid #eef0ea' }}>
              <div style={{ padding: '9px 12px', minWidth: 0 }}><div style={{ fontWeight: 500, ...ellipsis }}>{r.title}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{r.domLabel} · {r.format}</div></div>
              <div style={{ padding: '9px 12px', fontSize: 12.5 }}>{r.lvlLabel}</div>
              <div style={{ padding: '9px 12px' }}><Tag tone="source">{r.source}</Tag></div>
              <div style={{ padding: '9px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>{r.effort}</div>
              <div style={{ padding: '9px 12px', fontSize: 12.5, color: '#5a6058', ...ellipsis }}>{r.paths}</div>
              <div style={{ padding: '9px 12px' }}><StatusChip status={r.pubStatus} label={r.pubLabel} /></div>
              <div style={{ padding: '9px 12px' }}><LinkButton onClick={r.edit}>Edit</LinkButton></div>
            </Hover>
          ))}
        </div>
      </div>
    </>
  );
}

export function AdminMappingScreen({ vm }: { vm: VM }) {
  const ms = vm.ms;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle title="Curriculum mapping" lead="Drag a learning onto a career stage to put it on everyone's path at that stage. Mandatory items need Learning Council sign-off before they publish; advised items publish at once." />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <SegmentedControl options={vm.blOptions} value={vm.bl} onChange={vm.setBl} size="base" />
          <Button onClick={vm.publish} disabled={vm.noPending}>Publish {vm.pendingLabel}</Button>
        </div>
      </div>
      <Banner tone="info">Changes here reach every {vm.bl} profile at the mapped stage, including Lena Mertens' map in this prototype. Switch to “My growth map” after a drop to see the effect.</Banner>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 240px', background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden', position: 'sticky', top: 78 }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #eef0ea', background: '#fafbf8' }}>
            <div style={{ fontWeight: 600 }}>Not on a {vm.bl} path</div><div style={{ fontSize: 12, color: '#5a6058' }}>{vm.paletteCount} learnings · drag to a stage</div>
          </div>
          <div onDragOver={vm.paletteOver} onDrop={vm.paletteDrop} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, maxHeight: '60vh', overflow: 'auto', minHeight: 120 }}>
            {vm.palette.map((pi) => (
              <Hover key={pi.id} draggable onDragStart={pi.onDragStart} hoverStyle={{ borderColor: '#86BC25' }}
                style={{ border: '1px solid #c8cdc3', borderRadius: 5, background: '#f7f7f5', padding: '6px 9px', cursor: 'grab', minHeight: 38 }}>
                <div style={{ fontWeight: 500, fontSize: 12, ...ellipsis }}>{pi.title}</div>
                <div style={{ fontSize: 10.5, color: '#8b918a', ...ellipsis }}>{pi.sub}</div>
              </Hover>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(176px,1fr))', gap: 10, minWidth: 920 }}>
            {vm.stageCols.map((sc) => (
              <div key={sc.name} onDragOver={sc.onDragOver} onDragLeave={sc.onDragLeave} onDrop={sc.onDrop}
                style={{ background: sc.bg, border: '1px ' + sc.bdStyle + ' ' + sc.bd, borderRadius: 6, display: 'flex', flexDirection: 'column', minHeight: 420, transition: 'border-color .15s' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #eef0ea' }}><div style={{ fontWeight: 600 }}>{sc.name}</div><div style={{ fontSize: 11.5, color: '#5a6058' }}>{sc.summary}</div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, flex: 1 }}>
                  {sc.items.map((mi) => (
                    <Hover key={mi.id} draggable onDragStart={mi.onDragStart} onClick={mi.onClick} hoverStyle={{ borderColor: '#86BC25' }}
                      style={{ position: 'relative', border: mi.border, borderRadius: 5, background: mi.bg, padding: '5px 9px', cursor: 'pointer', boxShadow: mi.shadow, opacity: mi.op, transition: 'opacity .15s,box-shadow .15s' }}>
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
      {ms && (
        <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef0ea', background: '#fafbf8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div><div style={{ fontWeight: 600, fontSize: 16 }}>{ms.title}</div><div style={{ fontSize: 12.5, color: '#5a6058' }}>{ms.sub}</div></div>
            <SegmentedControl options={vm.obSetOptions} value={ms.ob} onChange={ms.setOb} size="md" />
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>Who this touches</div>
              <p style={{ margin: '4px 0 0', textWrap: 'pretty' }}>{ms.touch}</p>
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <StatusChip status="not-started" label={ms.ns} />
                <StatusChip status="in-progress" label={ms.ip} />
                <StatusChip status="accepted" icon="check" label={ms.dn} />
              </div>
            </div>
            <div style={{ flex: '0 1 300px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>Rule</div>
              <p style={{ margin: '4px 0 0' }}>{ms.rulePlain}</p>
              <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11.5, color: '#5a6058', marginTop: 4 }}>{ms.ruleExpr}</div>
            </div>
          </div>
          <div style={{ padding: '12px 18px 16px', borderTop: '1px solid #eef0ea', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={ms.remove}>Remove from path</Button>
            <LinkButton onClick={ms.openLib}>Open in library →</LinkButton>
            <LinkButton tone="muted" onClick={vm.clearMapSel}>Clear</LinkButton>
          </div>
        </div>
      )}
    </>
  );
}

export function AddLearningDrawer({ vm }: { vm: VM }) {
  const section = { border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' } as const;
  const sectionHead = { padding: '12px 14px', background: '#fafbf8', borderBottom: '1px solid #eef0ea', fontWeight: 600 } as const;
  return (
    <Drawer title="Add a learning" subtitle="Import from a connected program first; describe it yourself if it is not there." onClose={vm.closeDrawer} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={section}>
          <div style={sectionHead}>1 · Import from a program</div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 8 }}>
              <Select options={vm.programOptions} />
              <Input placeholder="Search the program catalogue" value={vm.importQ} onChange={vm.setImportQ} />
            </div>
            {vm.importResults.map((ir) => (
              <div key={ir.title} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid #eef0ea' }}>
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{ir.title}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{ir.sub}</div></div>
                <Button variant="secondary" size="sm" onClick={ir.import}>Import</Button>
              </div>
            ))}
          </div>
        </div>
        <div style={section}>
          <div style={sectionHead}>2 · Or describe it yourself</div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Title"><Input placeholder="e.g. Negotiating scope with procurement" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Domain"><Select options={vm.domainOptions} /></Field>
              <Field label="Level"><Select options={vm.levelOnlyOptions} /></Field>
              <Field label="Format"><Select options={vm.formatOnlyOptions} /></Field>
              <Field label="Source"><Input placeholder="Publisher or provider" /></Field>
              <Field label="Effort" hint="Hours, decimals allowed"><Input placeholder="4" /></Field>
              <Field label="CPD units" hint="Leave empty if none"><Input placeholder="0" /></Field>
            </div>
            <Field label="Why we recommend it" hint="Shown on every path it lands on. Plain language, two sentences."><Textarea rows={3} /></Field>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="lg" onClick={vm.saveDraft}>Save as draft</Button>
          <Button size="lg" variant="secondary" onClick={vm.closeDrawer}>Cancel</Button>
          <span style={{ fontSize: 12, color: '#8b918a' }}>Drafts are visible to admins only until published.</span>
        </div>
      </div>
    </Drawer>
  );
}
