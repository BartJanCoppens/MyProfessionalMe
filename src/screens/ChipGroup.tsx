// The one group of chips: a heading and FilterChips, for a single choice (a studio's question, a format) or several (a
// creation rule's values) - what a click does is the caller's `pick`. In View as (readOnly) it shows the picks as text.
// hint: a line under the heading (a studio question that only steers the AI draft).
import { FilterChip } from '../ds';
import { label } from './labelStyle';

export type Chip = { key: string; label: string; on: boolean; pick: () => void; image?: string };
type Props = { heading: string; hint?: string; ariaLabel?: string; chips: Chip[]; caps?: boolean; small?: boolean; readOnly?: boolean };

export default function ChipGroup({ heading, hint, ariaLabel = heading, chips, caps, small, readOnly }: Props) {
  const picked = chips.filter((c) => c.on).map((c) => c.label).join(', ');
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', flexDirection: 'column', gap: small ? 6 : 8 }}>
      <div style={caps ? label : { fontWeight: 500 }}>{heading}</div>
      {hint && <div style={{ fontSize: 12, color: '#5a6058' }}>{hint}</div>}
      {readOnly ? <div style={{ fontSize: 12.5, color: '#3d423b' }}>{picked || 'Not chosen'}</div> : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((c) => <FilterChip key={c.key} selected={c.on} onClick={c.pick} style={small ? { height: 26, fontSize: 12 } : undefined}>{c.image && <img src={c.image} alt="" width={16} height={20} style={{ borderRadius: 3, background: '#e1e5dc' }} />}{c.label}</FilterChip>)}
        </div>
      )}
    </div>
  );
}
