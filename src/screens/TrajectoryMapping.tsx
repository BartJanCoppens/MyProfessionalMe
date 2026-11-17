// Admin trajectory editor, second part: who gets it (audience and stage mappings), the warnings and the learner's-eye lane.
import type { CSSProperties } from 'react';
import { Button, LinkButton, SegmentedControl, Select, Tag } from '../ds';
import type { VM } from '../model';

const card: CSSProperties = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' };
const cardHead: CSSProperties = { padding: '12px 18px', borderBottom: '1px solid #eef0ea', background: '#fafbf8' };

export function TrajectoryAudiences({ vm }: { vm: VM }) {
  const tj = vm.tj!;
  return (
    <div style={card}>
      <div style={cardHead}><div style={{ fontWeight: 600 }}>Who gets it</div><div style={{ fontSize: 12, color: '#5a6058' }}>The same audiences and stages as single learnings. Each mapping shows as ◆ on the coverage grid.</div></div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tj.maps.map((tm, i) => (
          <div key={tm.aud + tm.stage + i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 18px', borderBottom: '1px solid #eef0ea' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: tm.color, flex: 'none' }} />
            <div style={{ flex: '1 1 240px', minWidth: 0 }}><div style={{ fontWeight: 600 }}>{tm.aud} · {tm.stage}</div><div style={{ fontSize: 11.5, color: '#5a6058' }}>{tm.meta}</div></div>
            {tm.canMand && <SegmentedControl options={vm.trjObOptions} value={tm.ob} onChange={tm.setOb} size="md" />}
            {tm.noMand && <Tag tone="muted">Suggested only</Tag>}
            <LinkButton tone="muted" onClick={tm.remove}>Remove</LinkButton>
          </div>
        ))}
        {tj.noMaps && <div style={{ padding: '12px 18px', borderBottom: '1px solid #eef0ea', fontSize: 12.5, color: '#5a6058' }}>Not mapped yet. Nobody sees this trajectory.</div>}
        <div style={{ padding: '12px 18px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}><Select size="md" aria-label="Audience" options={vm.trjAudOptions} value={vm.trjAud} onChange={vm.setTrjAud} /></div>
          <div style={{ flex: '0 1 200px', minWidth: 160 }}><Select size="md" aria-label="Stage" options={vm.trjStageOptions} value={vm.trjStage} onChange={vm.setTrjStage} /></div>
          <Button size="sm" onClick={tj.addMap}>Map</Button>
        </div>
        {tj.hasWarn && (
          <div style={{ padding: '0 18px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tj.warns.map((tw) => (
              <div key={tw.text} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, color: '#3d423b', background: '#fdf7e6', border: '1px solid #f0dca3', borderRadius: 5, padding: '7px 10px' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e0a100', flex: 'none', transform: 'translateY(-1px)' }} /><span style={{ textWrap: 'pretty' }}>{tw.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TrajectoryLane({ vm }: { vm: VM }) {
  const tj = vm.tj!;
  return (
    <div style={card}>
      <div style={cardHead}><div style={{ fontWeight: 600 }}>Learner's eye · the lane on My growth map</div><div style={{ fontSize: 12, color: '#5a6058' }}>{tj.previewSub}</div></div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', padding: 18, minWidth: 'max-content' }}>
          {tj.stones.map((sn) => (
            <div key={sn.mark + sn.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 116, position: 'relative' }}>
              <span aria-hidden="true" style={{ position: 'absolute', top: 11, left: '50%', width: '100%', height: 2, background: sn.line }} />
              <span aria-hidden="true" style={{ position: 'relative', width: 24, height: 24, borderRadius: sn.radius, background: sn.bg, border: sn.bd, color: sn.fg, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{sn.mark}</span>
              <span style={{ fontSize: 11.5, textAlign: 'center', lineHeight: 1.25, color: '#3d423b', padding: '0 6px', textWrap: 'balance' }}>{sn.label}</span>
              <span style={{ fontSize: 11, color: '#6b716a' }}>{sn.when}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
