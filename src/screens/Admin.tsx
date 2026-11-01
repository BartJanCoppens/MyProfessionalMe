import { Button, Drawer, Field, Hover, Input, LinkButton, PageTitle, SegmentedControl, Select, StatusChip, Tag, Textarea } from '../ds';
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

export function AddLearningDrawer({ vm }: { vm: VM }) {
  const f = vm.lf, set = vm.lfSet;
  if (!f) return null;
  const section = { border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' } as const;
  const sectionHead = { padding: '12px 14px', background: '#fafbf8', borderBottom: '1px solid #eef0ea', fontWeight: 600 } as const;
  return (
    <Drawer title={vm.lfTitle} subtitle={f.id ? 'Changes reach every path this learning is on.' : 'Import from a connected program first; describe it yourself if it is not there.'} onClose={vm.closeDrawer} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!f.id && <div style={section}>
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
        </div>}
        <div style={section}>
          <div style={sectionHead}>{f.id ? 'Details' : '2 · Or describe it yourself'}</div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Title"><Input placeholder="e.g. Negotiating scope with procurement" value={f.title} onChange={set.title} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Domain"><Select options={vm.domainOptions} value={f.domain} onChange={set.domain} /></Field>
              <Field label="Level"><Select options={vm.levelOnlyOptions} value={f.level} onChange={set.level} /></Field>
              <Field label="Format"><Select options={vm.formatOnlyOptions} value={f.format} onChange={set.format} /></Field>
              <Field label="Source"><Input placeholder="Publisher or provider" value={f.source} onChange={set.source} /></Field>
              <Field label="Effort" hint="Hours, decimals allowed"><Input placeholder="4" inputMode="decimal" value={f.hours} onChange={set.hours} /></Field>
              <Field label="CPD units" hint="Leave empty if none"><Input placeholder="0" inputMode="decimal" value={f.cpd} onChange={set.cpd} /></Field>
            </div>
            <Field label="Why we recommend it" hint="Shown on every path it lands on. Plain language, two sentences."><Textarea rows={3} value={f.why} onChange={set.why} /></Field>
            <Field label="Available to" hint="A business line's learning is edited by its Domain Admins; firm-wide learning by a General or System Admin. Curriculum mapping decides who it is mandatory or advised for."><Select options={vm.lineOptions} value={f.line} onChange={set.line} /></Field>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="lg" onClick={vm.savePublish}>Publish</Button>
          <Button size="lg" variant="secondary" onClick={vm.saveDraft}>Save as draft</Button>
          <LinkButton onClick={vm.saveReview}>Mark for review</LinkButton>
          <div style={{ flex: 1 }} />
          {f.id && <LinkButton tone="muted" onClick={vm.removeLearning}>Remove</LinkButton>}
          <LinkButton tone="muted" onClick={vm.closeDrawer}>Cancel</LinkButton>
        </div>
        <div style={{ fontSize: 12, color: '#8b918a', marginTop: -8 }}>Drafts are visible to admins only until published.
        </div>
      </div>
    </Drawer>
  );
}
