// The four parts of a creation rule or review requirement as chip groups: values within a group are OR, groups AND.
import ChipGroup from './ChipGroup';

type RuleGroup = { part: string; label: string; chips: { value: string; label: string; on: boolean; toggle: () => void }[] };

export default function RuleChips({ groups, preview, problem }: { groups: RuleGroup[]; preview: string; problem?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map((g) => (
        <ChipGroup key={g.part} caps small ariaLabel={g.label} heading={g.label + ' · any of them, none picked = any'}
          chips={g.chips.map((c) => ({ key: c.value, label: c.label, on: c.on, pick: c.toggle }))} />
      ))}
      <div aria-live="polite" style={{ fontSize: 12.5, color: problem ? '#7a5000' : '#1a1d18', fontWeight: 500 }}>{problem ? problem : 'Rule: ' + preview}</div>
    </div>
  );
}
