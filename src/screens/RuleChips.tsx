// The four parts of a creation rule or review requirement as chip groups: values within a group are OR, groups AND.
import { FilterChip } from '../ds';

export type ChipGroup = { part: string; label: string; chips: { value: string; label: string; on: boolean; toggle: () => void }[] };

export default function RuleChips({ groups, preview, problem }: { groups: ChipGroup[]; preview: string; problem?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map((g) => (
        <div key={g.part} role="group" aria-label={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>{g.label} · any of them, none picked = any</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {g.chips.map((c) => <FilterChip key={c.value} selected={c.on} onClick={c.toggle} style={{ height: 26, fontSize: 12 }}>{c.label}</FilterChip>)}
          </div>
        </div>
      ))}
      <div aria-live="polite" style={{ fontSize: 12.5, color: problem ? '#7a5000' : '#1a1d18', fontWeight: 500 }}>{problem ? problem : 'Rule: ' + preview}</div>
    </div>
  );
}
