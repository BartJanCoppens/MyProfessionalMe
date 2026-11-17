// Create & share, parts shared by the upload form and the Flash card & Exam Studio: the knowledge-bundle picker and
// the two side cards (automatic checks, who will review it). They only read from the view-model (createVals.ts).
import { Banner, Button, Input } from '../ds';
import type { VM } from '../model';

type CS = NonNullable<VM['create']>;
const label = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase' as const, letterSpacing: '.04em' };
const card = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6 };

export function BundlePicker({ c }: { c: CS }) {
  return (
    <>
      {/* Picked bundles as chips; the rest is found, not listed: there may be hundreds. */}
      <div role="group" aria-label="Picked bundles" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {c.nwKbPicked.map((pb) => (
          <span key={pb.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 4px 0 12px', borderRadius: 999, background: '#1a1d18', color: '#fff', fontSize: 12.5, fontWeight: 600, maxWidth: '100%' }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pb.label}<span style={{ fontWeight: 400, opacity: 0.75 }}>{' · ' + pb.meta}</span></span>
            <button type="button" aria-label={'Remove ' + pb.label} onClick={pb.remove} style={{ width: 22, height: 22, border: 0, borderRadius: 999, background: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, flex: 'none' }}>×</button>
          </span>
        ))}
        {!c.nwKbPicked.length && <span style={{ fontSize: 12, color: '#8b918a' }}>No bundle picked yet.</span>}
      </div>
      <Input value={c.nwKbQuery} onChange={c.nwKbSetQuery} placeholder={'Search ' + c.nwKbCount + ' by name, description or tag'} aria-label="Search knowledge bundles" />
      {c.nwKbEmpty ? <span style={{ fontSize: 12, color: '#8b918a' }}>{c.nwKbEmpty}</span> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={label}>{c.nwKbFoundTitle}</div>
          <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6 }}>
            {c.nwKbFound.map((fb, i) => (
              <div key={fb.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid #eef0ea' : 0 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{fb.label}<span style={{ fontWeight: 400, color: '#8b918a' }}>{' · ' + fb.meta}</span></div>
                  <div style={{ fontSize: 12, color: '#5a6058', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fb.desc}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={fb.add} aria-label={'Add ' + fb.label}>+ Add</Button>
              </div>
            ))}
          </div>
          {c.nwKbMore && <div style={{ fontSize: 11.5, color: '#8b918a' }}>{c.nwKbMore}</div>}
        </div>
      )}
    </>
  );
}

export function SubmitSide({ c }: { c: CS }) {
  return (
    <>
      <div style={{ ...card, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 600 }}>Before you submit</div>
        {c.nwChecks.map((nc) => <div key={nc.text} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: nc.dot, flex: 'none', marginTop: 6 }} /><span style={{ color: nc.fg, textWrap: 'pretty' }}>{nc.text}</span></div>)}
      </div>
      <div style={{ ...card, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 600 }}>Who will review it</div>
          <div style={{ fontSize: 12, color: '#5a6058' }}>Assigned when you submit. Peers come from your business line; never you, your counsellor or people you counsel. Names appear after you submit.</div>
        </div>
        {c.nwRoute.map((nr) => (
          <div key={nr.n} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#f3f5f0', color: '#3d423b', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{nr.n}</span>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 12.5 }}>{nr.name}</div><div style={{ fontSize: 11.5, color: '#8b918a' }}>{nr.role}</div></div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: '#5a6058' }}>{c.nwPolicyNote}</div>
        {c.nwRouteEmpty && <div style={{ fontSize: 12.5, color: '#3d423b' }}>No review required for this combination: it is published as soon as you submit and the checks pass.</div>}
        {c.nwRouteWarn && <Banner tone="warning">{c.nwRouteWarn}</Banner>}
      </div>
    </>
  );
}
