// The certification layer of My growth map, drawn in gold: pieces Map.tsx includes in the constellation, radar, road row and docks.
// All values come from the view-model (trajectoryMap.ts); a click only opens a trajectory or moves the radar focus.
import type { CSSProperties } from 'react';
import { FilterChip, Hover, LinkButton } from '../ds';
import type { VM } from '../model';

const GOLD = '#a87900';
const fade: CSSProperties = { pointerEvents: 'none', transition: 'opacity .15s' };

// The chip beside the cloud chips: switches the whole layer on or off.
export function CertChip({ vm }: { vm: VM }) {
  return (
    <FilterChip selected={vm.certChip.on} onClick={vm.certChip.toggle}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#e0a100', flex: 'none' }} />Certifications<span style={{ fontWeight: 400, opacity: 0.75 }}>{vm.certChip.count}</span>
    </FilterChip>
  );
}

export function CertDockLink({ vm }: { vm: VM }) {
  return vm.hasCert ? <LinkButton onClick={vm.toggleCertDock}>◆ {vm.certDockLabel}</LinkButton> : null;
}

// Constellation, under the learning nodes: one dashed thread per trajectory.
export function CertThreads({ vm }: { vm: VM }) {
  return <>{vm.cCert.threads.map((th) => <polyline key={th.id} data-cert="thread" points={th.points} fill="none" stroke={GOLD} strokeWidth="1.6" strokeDasharray="5 4" strokeLinejoin="round" opacity={th.op} style={fade} />)}</>;
}

// Constellation, over the nodes: a ring on each learning, and the credential diamond (filled once the credential is confirmed).
export function CertMarks({ vm }: { vm: VM }) {
  return (
    <>
      {vm.cCert.rings.map((rg, i) => <circle key={rg.id + i} data-cert="ring" cx={rg.x} cy={rg.y} r={rg.r} fill="none" stroke={GOLD} strokeWidth="1.6" opacity={rg.op} style={fade} />)}
      {vm.cCert.creds.map((cd) => (
        <g key={cd.id} data-cert="credential" onClick={cd.onClick} opacity={cd.op} style={{ cursor: 'pointer', transition: 'opacity .15s', transformBox: 'fill-box', transformOrigin: 'center', animation: 'pmPop .45s cubic-bezier(.2,.7,.3,1) .6s backwards' }}>
          <polygon points={cd.points} fill={cd.filled ? '#e0a100' : '#fdf3dc'} stroke={GOLD} strokeWidth="1.8" />
          <title>{cd.title}</title>
        </g>
      ))}
    </>
  );
}

// Constellation, in the HTML overlay: the label under each diamond.
export function CertLabels({ vm }: { vm: VM }) {
  return (
    <>
      {vm.cCert.labels.map((lb) => (
        <button key={lb.id} type="button" onClick={lb.onClick}
          style={{ position: 'absolute', left: lb.xP, top: lb.yP, transform: 'translate(-50%,0)', pointerEvents: 'auto', cursor: 'pointer', padding: '1px 8px', borderRadius: 999, background: '#fff', border: '1px solid #e0a100', color: '#7a5000',
            fontFamily: 'inherit', fontSize: '.82em', fontWeight: 600, whiteSpace: 'nowrap', opacity: lb.op, transition: 'opacity .15s' }}>{lb.label}</button>
      ))}
    </>
  );
}

// Radar: where each credential would take the levels.
export function CertPolygons({ vm }: { vm: VM }) {
  return (
    <>
      {vm.rCert.map((rk) => (
        <polygon key={rk.id} data-cert="radar" points={rk.points} fill="#e0a100" fillOpacity={rk.fo} stroke={GOLD} strokeWidth={rk.sw} opacity={rk.op} strokeLinejoin="round" onClick={rk.select}
          style={{ cursor: 'pointer', transition: 'opacity .15s', transformBox: 'view-box', transformOrigin: '540px 280px', animation: 'pmGrow .8s ease-out .3s backwards' }}><title>{rk.title}</title></polygon>
      ))}
    </>
  );
}

export function CertLegend({ vm }: { vm: VM }) {
  return (
    <>
      {vm.rCert.map((rk) => (
        <button key={rk.id} type="button" onClick={rk.select} aria-pressed={rk.focus}
          style={{ appearance: 'none', border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: 12, color: '#3d423b', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: rk.fw }}>
          <span style={{ width: 14, height: 10, borderRadius: 3, background: 'rgba(224,161,0,' + rk.swA + ')', border: '1.5px solid ' + GOLD }} />{rk.legend}
        </button>
      ))}
    </>
  );
}

export function CertDock({ vm }: { vm: VM }) {
  if (!vm.dockCert) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef0ea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#fafbf8' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span aria-hidden="true" style={{ color: '#7a5000', fontWeight: 600 }}>◆</span><span style={{ fontWeight: 600, fontSize: 16 }}>Your certification trajectories</span></div>
          <div style={{ fontSize: 12.5, color: '#5a6058' }}>{vm.certDockSub}</div>
        </div>
        <LinkButton tone="muted" onClick={vm.clearSel}>Clear</LinkButton>
      </div>
      {vm.certDock.map((ck) => (
        <Hover as="button" type="button" key={ck.id} onClick={ck.open} hoverStyle={{ background: '#fafbf8' }}
          style={{ appearance: 'none', width: '100%', border: 0, borderBottom: '1px solid #eef0ea', background: '#fff', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', padding: '10px 18px',
            display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(120px,1fr) minmax(0,1.2fr) auto', gap: 14, alignItems: 'center' }}>
          <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600 }}>{ck.name}</span><span style={{ display: 'block', fontSize: 12, color: '#5a6058' }}>{ck.sub}</span></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ display: 'block', height: 5, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: ck.barW, background: '#86BC25' }} /></span>
            <span style={{ fontSize: 11.5, color: '#5a6058' }}>{ck.prog}</span>
          </span>
          <span style={{ fontSize: 12.5, color: '#3d423b', textWrap: 'pretty' }}>{ck.next}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#4c7a10' }}>Open →</span>
        </Hover>
      ))}
    </div>
  );
}
