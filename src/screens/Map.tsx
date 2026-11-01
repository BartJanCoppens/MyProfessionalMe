import type { CSSProperties } from 'react';
import { Banner, Button, DotLegend, Eyebrow, FilterChip, Hover, KeyValueList, LinkButton, PageTitle, ProgressRing, SegmentedControl, StatCard, StatusChip, Tag } from '../ds';
import type { VM } from '../model';

const card: CSSProperties = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' };
const dockHead: CSSProperties = { padding: '14px 18px', borderBottom: '1px solid #eef0ea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#fafbf8' };
// HTML labels sit over the SVG and scale with the card width (container query units).
const overlay: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none', fontSize: 'clamp(9px,1.16cqw,12.5px)' };

export default function MapScreen({ vm }: { vm: VM }) {
  return (
    <>
      <PageTitle title="Your growth map" lead={vm.mapLead} />
      {vm.noLineNote && <Banner tone="info">{vm.noLineNote}</Banner>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <SegmentedControl options={vm.viewOptions} value={vm.view} onChange={vm.setView} size="base" />
        <DotLegend items={vm.legendItems} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#5a6058', marginRight: 4 }}>{vm.cloudRowLabel}</span>
        {vm.cloudChips.map((cc) => (
          <FilterChip key={cc.key} selected={cc.on} onClick={cc.toggle}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: cc.color, flex: 'none' }} />{cc.label}<span style={{ fontWeight: 400, opacity: 0.75 }}>{cc.count}</span>
          </FilterChip>
        ))}
        <span style={{ fontSize: 12, color: '#8b918a' }}>{vm.cloudRowHint}</span>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {vm.view === 'constellation' && <Constellation vm={vm} />}
          {vm.view === 'radar' && <Radar vm={vm} />}
          {vm.view === 'road' && <Road vm={vm} />}
          <Docks vm={vm} />
        </div>
        <MapAside vm={vm} />
      </div>
    </>
  );
}

function Constellation({ vm }: { vm: VM }) {
  return (
    <div style={card}>
      <div style={{ position: 'relative', containerType: 'inline-size' }}>
        <svg viewBox="0 0 1080 660" width="100%" style={{ display: 'block', fontFamily: 'inherit' }}>
          <defs><clipPath id="pmMeClip"><circle cx="540" cy="330" r="28" /></clipPath></defs>
          <rect x="0" y="0" width="1080" height="660" fill="#fff" onClick={vm.clearSel} />
          {vm.cClouds.map((cl) => (
            <g key={cl.key} opacity={cl.op} style={{ pointerEvents: 'none', transition: 'opacity .15s', transformBox: 'fill-box', transformOrigin: 'center', animation: 'pmBreathe 8s ease-in-out infinite', animationDelay: cl.delay }}>
              {cl.blobs.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={b.color} />)}
            </g>
          ))}
          {vm.cEdges.map((e, i) => <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.stroke} strokeWidth={e.w} opacity={e.op} style={{ transition: 'opacity .15s' }} />)}
          {vm.cHubs.map((h) => (
            <g key={h.id} opacity={h.op} onClick={h.onClick} style={{ cursor: 'pointer', transition: 'opacity .15s', transformBox: 'fill-box', transformOrigin: 'center', animation: 'pmPop .45s cubic-bezier(.2,.7,.3,1) backwards', animationDelay: h.delay }}>
              <circle cx={h.x} cy={h.y} r="15" fill="#fff" stroke={h.stroke} strokeWidth={h.sw} />
            </g>
          ))}
          {vm.cNodes.map((n) => (
            <g key={n.id} opacity={n.op} onClick={n.onClick} style={{ cursor: 'pointer', transition: 'opacity .15s', transformBox: 'fill-box', transformOrigin: 'center', animation: 'pmPop .4s cubic-bezier(.2,.7,.3,1) backwards', animationDelay: n.delay }}>
              <circle cx={n.x} cy={n.y} r={n.ring} fill="none" stroke="rgba(134,188,37,.45)" strokeWidth="3" opacity={n.ringOp} />
              <circle cx={n.x} cy={n.y} r={n.r} fill={n.fill} stroke={n.stroke} strokeWidth={n.sw} strokeDasharray={n.dash} />
              {n.isAvatar && (
                <g style={{ transformOrigin: n.orbO, animation: 'pmSpin 7s linear infinite', animationDelay: n.orbD }}>
                  <circle cx={n.orbX} cy={n.y} r="2.6" fill="#1a1d18" stroke="#fff" strokeWidth="1" />
                </g>
              )}
              <title>{n.title}</title>
            </g>
          ))}
          <g onClick={vm.selectMe} style={{ cursor: 'pointer' }}>
            <circle cx="540" cy="330" r="41" fill="none" stroke="#86BC25" strokeWidth="1.5" style={{ pointerEvents: 'none', transformBox: 'fill-box', transformOrigin: 'center', animation: 'pmPulse 3.6s ease-out 1s infinite', opacity: 0 }} />
            <circle cx="540" cy="330" r="38" fill="none" stroke="#eef0ec" strokeWidth="5" />
            <circle cx="540" cy="330" r="38" fill="none" stroke="#86BC25" strokeWidth="5" strokeLinecap="round" transform="rotate(-90 540 330)" strokeDasharray={vm.readinessDash} style={{ animation: 'pmDraw 1.2s ease-out .2s backwards' }} />
            <circle cx="540" cy="330" r="28" fill={vm.avatarBg} />
            {vm.avatarPhoto
              ? <image href={vm.avatarPhoto} x="512" y="302" width="56" height="56" preserveAspectRatio="xMidYMid slice" clipPath="url(#pmMeClip)" />
              : <text x="540" y="330" dy="5" textAnchor="middle" fontSize="13" fontWeight="600" fill={vm.avatarFg}>{vm.avatarInitials}</text>}
            <text x="540" y="392" textAnchor="middle" fontSize="13" fontWeight="600" fill="#1a1d18">{vm.who.name}</text>
          </g>
        </svg>
        <div style={overlay}>
          <div style={{ position: 'absolute', left: '50%', top: '61.8%', transform: 'translate(-50%,-50%)', fontSize: '.88em', color: '#5a6058', whiteSpace: 'nowrap' }}>{vm.centerSub}</div>
          {vm.cClouds.map((cl) => (
            <div key={cl.key} onClick={cl.select} style={{ position: 'absolute', left: cl.lxP, top: cl.lyP, transform: 'translate(-50%,-50%)', pointerEvents: 'auto', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '2px 9px', borderRadius: 999, background: '#fff', border: '1px solid ' + cl.color, color: cl.text, fontSize: '.85em', fontWeight: 600, whiteSpace: 'nowrap', boxShadow: cl.ring }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: cl.color }} />{cl.label}
            </div>
          ))}
          {vm.cHubs.map((h) => (
            <div key={h.id}>
              <div style={{ position: 'absolute', left: h.xP, top: h.yP, transform: 'translate(-50%,-50%)', fontSize: '.85em', fontWeight: 600, color: '#1a1d18', opacity: h.op, transition: 'opacity .15s' }}>{h.cur}</div>
              <div style={{ position: 'absolute', left: h.lxP, top: h.lyP, transform: h.tf, textAlign: h.ta, maxWidth: '11em', opacity: h.op, transition: 'opacity .15s', lineHeight: 1.2 }}>
                <div style={{ fontSize: '1em', fontWeight: 600, color: '#1a1d18', textWrap: 'balance' }}>{h.label}</div>
                <div style={{ fontSize: '.88em', color: '#5a6058', textWrap: 'balance' }}>{h.lvl}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderTop: '1px solid #eef0ea', fontSize: 12, color: '#5a6058' }}>
        <span>Ring = obligation: solid ink is mandatory, dashed is advised, thin grey is your own choice. Size = level, L1 to L5. An orbiting dot marks avatar practice. Clouds = where projects, personality and ambitions pull you.</span>
        <span>Click a dot or a domain. Click the background to reset.</span>
      </div>
    </div>
  );
}

function Radar({ vm }: { vm: VM }) {
  return (
    <div style={card}>
      <div style={{ position: 'relative', containerType: 'inline-size' }}>
        <svg viewBox="0 0 1080 560" width="100%" style={{ display: 'block', fontFamily: 'inherit' }}>
          {vm.rRings.map((rg) => <polygon key={rg.label} points={rg.points} fill="none" stroke="#eef0ea" strokeWidth="1" />)}
          {vm.rAxes.map((ax) => <line key={ax.label} x1="540" y1="280" x2={ax.x} y2={ax.y} stroke="#e1e5dc" strokeWidth="1" />)}
          <defs><clipPath id="pmMeClipR"><circle cx="540" cy="280" r="13" /></clipPath></defs>
          <polygon points={vm.rTarget} fill="none" stroke="#1a1d18" strokeWidth="1.3" strokeDasharray="4 3" />
          {vm.rClouds.map((rc) => (
            <polygon key={rc.key} points={rc.points} fill={rc.color} fillOpacity={rc.fo} stroke={rc.color} strokeWidth="1.3" strokeDasharray="2 3" onClick={rc.select}
              style={{ cursor: 'pointer', transformBox: 'view-box', transformOrigin: '540px 280px', animation: 'pmGrow .8s ease-out backwards, pmSwell 9s ease-in-out infinite', animationDelay: rc.delay }} />
          ))}
          <polygon points={vm.rCur} fill="rgba(134,188,37,.14)" stroke="#86BC25" strokeWidth="2" style={{ pointerEvents: 'none', transformBox: 'view-box', transformOrigin: '540px 280px', animation: 'pmGrow .7s cubic-bezier(.2,.7,.3,1) backwards' }} />
          {vm.rDots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="4.5" fill="#86BC25" stroke="#fff" strokeWidth="1.5" style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'pmPop .35s cubic-bezier(.2,.7,.3,1) backwards', animationDelay: d.delay }} />)}
          <circle cx="540" cy="280" r="14.5" fill="#fff" stroke="#86BC25" strokeWidth="1.5" />
          <circle cx="540" cy="280" r="13" fill={vm.avatarBg} />
          {vm.avatarPhoto
            ? <image href={vm.avatarPhoto} x="527" y="267" width="26" height="26" preserveAspectRatio="xMidYMid slice" clipPath="url(#pmMeClipR)" />
            : <text x="540" y="280" dy="3.5" textAnchor="middle" fontSize="9.5" fontWeight="600" fill={vm.avatarFg}>{vm.avatarInitials}</text>}
        </svg>
        <div style={overlay}>
          {vm.rRings.map((rg) => <div key={rg.label} style={{ position: 'absolute', left: rg.lxP, top: rg.lyP, transform: 'translate(-100%,-100%)', fontSize: '.8em', color: '#8b918a' }}>{rg.label}</div>)}
          {vm.rAxes.map((ax) => (
            <div key={ax.label} style={{ position: 'absolute', left: ax.lxP, top: ax.lyP, transform: ax.tf, textAlign: ax.ta, maxWidth: '11em', lineHeight: 1.2 }}>
              <div style={{ fontSize: '1em', fontWeight: 600, color: '#1a1d18', textWrap: 'balance' }}>{ax.label}</div>
              <div style={{ fontSize: '.88em', color: '#5a6058' }}>{ax.sub}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', padding: '10px 18px', borderTop: '1px solid #eef0ea', fontSize: 12, color: '#5a6058' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 18, height: 2, background: '#86BC25' }} />Level reached today</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 18, borderTop: '1.3px dashed #1a1d18' }} />Expected at {vm.who.nextStage} · {vm.bl}</span>
        {vm.rClouds.map((rc) => (
          <span key={rc.key} onClick={rc.select} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <span style={{ width: 14, height: 10, borderRadius: 3, background: rc.wash, border: '1px dashed ' + rc.color }} />{rc.legend}
          </span>
        ))}
        <span>{vm.radarGapText}</span>
      </div>
    </div>
  );
}

const ROAD_GRID: CSSProperties = { display: 'grid', gridTemplateColumns: '190px repeat(4,minmax(0,1fr))', gap: 12 };

function Road({ vm }: { vm: VM }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 18px', borderBottom: '1px solid #eef0ea', background: '#fafbf8' }}>
        <div><div style={{ fontSize: 11.5, fontWeight: 600 }}>Behind you</div><div style={{ fontSize: 12, color: '#5a6058' }}>{vm.roadBehind}</div></div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: '#3f6a0a' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#86BC25', animation: 'pmDot 2.4s ease-in-out infinite' }} />Today · 28 Oct 2026
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 4, height: 28, background: '#1a1d18', borderRadius: 1 }} />
          <div><div style={{ fontSize: 12, fontWeight: 600 }}>{vm.who.nextStage}</div><div style={{ fontSize: 11, color: '#5a6058' }}>next promotion review</div></div>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 860 }}>
          <div style={{ ...ROAD_GRID, padding: '14px 18px 4px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#5a6058', paddingTop: 8 }}>Path</div>
            {vm.roadQuarters.map((q) => <div key={q} style={{ fontSize: 12, fontWeight: 600, borderTop: '2px solid #d5dacf', paddingTop: 6 }}>{q}</div>)}
          </div>
          {vm.roadLanes.map((ln) => (
            <div key={ln.key} style={{ ...ROAD_GRID, padding: '12px 18px', borderBottom: '1px solid #eef0ea' }}>
              <div onClick={ln.select} style={{ minWidth: 0, cursor: 'pointer', animation: 'pmFadeUp .4s ease-out backwards', animationDelay: ln.delay }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: ln.color, flex: 'none' }} /><span style={{ fontWeight: 600, lineHeight: 1.25 }}>{ln.label}</span></div>
                <div style={{ fontSize: 11.5, color: '#5a6058', marginTop: 2, paddingLeft: 17, textWrap: 'pretty' }}>{ln.sub}</div>
              </div>
              {ln.cells.map((cell, ci) => (
                <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  {cell.items.map((ri) => (
                    <Hover key={ri.id} onClick={ri.onClick} hoverStyle={{ background: '#fafbf8' }}
                      style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '8px 10px', border: '1px solid #e1e5dc', borderRadius: 6, animation: 'pmFadeUp .4s ease-out backwards', animationDelay: ri.delay }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', flex: 'none', marginTop: 3, border: ri.ringCss, background: '#fff' }} />
                      <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1.3, textWrap: 'pretty' }}>{ri.title}</div><div style={{ fontSize: 11, color: '#5a6058' }}>{ri.sub}</div></div>
                      {ri.av && <AvatarBadge initials={ri.avInit} size={22} />}
                    </Hover>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: '1px solid #eef0ea', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600 }}>In flight · {vm.inflightCount}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {vm.roadInflight.map((f) => (
            <Hover as="span" key={f.id} onClick={f.open} hoverStyle={{ background: '#f3f5f0' }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5a6058', border: '1px solid #e1e5dc', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.dot }} />{f.label}
            </Hover>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 18px', borderTop: '1px solid #eef0ea', fontSize: 12, color: '#5a6058' }}>
        The firm path holds mandatory items in the quarter of their deadline and advised items where your counsellor placed them. The other lanes come from your project evaluations, personality profiles and ambitions; an item on two lanes counts once.
      </div>
    </div>
  );
}

// An avatar-practice persona: initials on ink with a green "live" dot.
export function AvatarBadge({ initials, size, ring = '#fff' }: { initials: string; size: number; ring?: string }) {
  const dot = size >= 24 ? 9 : 8;
  return (
    <span title="Avatar practice" style={{ position: 'relative', width: size, height: size, borderRadius: '50%', background: '#1a1d18', color: '#fff', fontSize: size >= 24 ? 10 : 9.5, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      {initials}
      <span style={{ position: 'absolute', right: -2, bottom: -2, width: dot, height: dot, borderRadius: '50%', background: '#86BC25', border: '2px solid ' + ring }} />
    </span>
  );
}

function Docks({ vm }: { vm: VM }) {
  const { cloudDock, dock, hubDock } = vm;
  return (
    <>
      {cloudDock && (
        <div style={card}>
          <div style={dockHead}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: cloudDock.color, flex: 'none' }} /><span style={{ fontWeight: 600, fontSize: 16 }}>{cloudDock.title}</span></div>
              <div style={{ fontSize: 12.5, color: '#5a6058', marginTop: 2 }}>{cloudDock.sub}</div>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <LinkButton onClick={cloudDock.go}>{cloudDock.goLabel}</LinkButton>
              <LinkButton tone="muted" onClick={vm.clearSel}>Clear</LinkButton>
            </div>
          </div>
          {cloudDock.rows.map((cr, i) => (
            <div key={cr.id + i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid #eef0ea' }}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>{cr.src}</div><div style={{ textWrap: 'pretty' }}>{cr.text}</div></div>
              <div onClick={cr.open} style={{ minWidth: 0, cursor: 'pointer' }}><div style={{ fontWeight: 500 }}>{cr.title}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{cr.meta}</div></div>
              <div>
                {cr.canAdd ? <Button variant="secondary" size="sm" onClick={cr.add}>+ Add</Button> : <StatusChip status={cr.state} label={cr.stateLabel} icon={cr.stateIcon} />}
              </div>
            </div>
          ))}
        </div>
      )}
      {dock && (
        <div style={card}>
          <div style={dockHead}>
            <div style={{ minWidth: 0 }}>
              <Eyebrow>{dock.domLabel} · {dock.format}</Eyebrow>
              <div style={{ fontWeight: 600, fontSize: 16, marginTop: 2 }}>{dock.title}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tag tone={dock.obTone}>{dock.obLabel}</Tag>
              <StatusChip status={dock.state} label={dock.stateLabel} icon={dock.stateIcon} />
            </div>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>Why this is on your path</div>
              <p style={{ margin: '4px 0 0', textWrap: 'pretty', maxWidth: 620 }}>{dock.why}</p>
            </div>
            <div style={{ flex: '0 1 260px', minWidth: 0 }}><KeyValueList rows={dock.kv} labelWidth={90} /></div>
          </div>
          <div style={{ padding: '12px 18px 16px', borderTop: '1px solid #eef0ea', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button onClick={dock.open}>Open learning →</Button>
            {dock.ob === 'open' && <Button variant="secondary" onClick={dock.add}>+ Add to my path</Button>}
            <LinkButton tone="muted" onClick={vm.clearSel}>Clear</LinkButton>
          </div>
        </div>
      )}
      {hubDock && (
        <div style={card}>
          <div style={dockHead}>
            <div><div style={{ fontWeight: 600, fontSize: 16 }}>{hubDock.label}</div><div style={{ fontSize: 12.5, color: '#5a6058' }}>{hubDock.sub}</div></div>
            <LinkButton tone="muted" onClick={vm.clearSel}>Clear</LinkButton>
          </div>
          {hubDock.items.map((it) => (
            <Hover key={it.id} onClick={it.open} hoverStyle={{ background: '#fafbf8' }}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 12, alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid #eef0ea', cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{it.title}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{it.meta}</div></div>
              <Tag tone={it.obTone}>{it.obLabel}</Tag>
              <StatusChip status={it.state} label={it.stateLabel} icon={it.stateIcon} />
            </Hover>
          ))}
        </div>
      )}
    </>
  );
}

function MapAside({ vm }: { vm: VM }) {
  return (
    <div style={{ flex: '0 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ProgressRing value={vm.readinessFrac} size={64} />
          <div><div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{vm.readiness}%</div><div style={{ fontSize: 12, color: '#5a6058' }}>ready for {vm.who.nextStage} in {vm.bl}</div></div>
        </div>
        <div style={{ fontSize: 12.5, color: '#5a6058', textWrap: 'pretty' }}>{vm.readinessText}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatCard label="Hours this year" value={vm.hoursYear} unit="of 80 h" />
        <StatCard label="CPD units · ACCA" value={vm.cpdYear} unit="of 20" sub="due 31 Dec 2026" />
      </div>
      <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Next on your path</div>
        {vm.nextUp.map((nu) => (
          <div key={nu.id} onClick={nu.open} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', paddingTop: 10, borderTop: '1px solid #eef0ea' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: nu.dot, flex: 'none', marginTop: 6 }} />
            <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 500 }}>{nu.title}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{nu.meta}</div></div>
          </div>
        ))}
      </div>
      {vm.showStreak && vm.marks.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Marks</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {vm.marks.map((m) => <Tag key={m} tone="bundle">{m}</Tag>)}
          </div>
          <div style={{ fontSize: 12, color: '#8b918a' }}>Marks are yours only. Your counsellor sees hours and levels, not marks.</div>
        </div>
      )}
    </div>
  );
}
