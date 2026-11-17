// Industries & technologies of one person: the ind and tec audiences as toggle chips for whoever may set them (the
// counsellor, the person's Domain Admins, General and System Admins), plain chips for everyone else and in View as.
// One change at a time; the caller writes, reloads and says what happened.
import { useRef, useState } from 'react';
import { FilterChip, Tag } from '../ds';
import { MEMBERSHIP_AUDIENCES } from '../logic/membership';
import type { MembershipVm } from '../membershipVals';

const label = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em', marginRight: 4 } as const;

export default function Membership({ v }: { v: MembershipVm }) {
  // The ref guards a second click in the same tick; the state dims the chip being saved.
  const sending = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (key: string, on: boolean) => {
    if (sending.current) return;
    sending.current = true; setBusy(key);
    try { await v.toggle(key, on); } finally { sending.current = false; setBusy(null); }
  };
  const mine = MEMBERSHIP_AUDIENCES.filter((a) => v.audiences?.includes(a.key));
  return (
    <div role="group" aria-label={'Industries & technologies of ' + v.name} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={label}>Industries & technologies</span>
      {!v.audiences ? <span style={{ fontSize: 12.5, color: '#8b918a' }}>Did not load</span>
        : v.canEdit ? MEMBERSHIP_AUDIENCES.map((a) => {
          const on = v.audiences!.includes(a.key);
          return <FilterChip key={a.key} selected={on} onClick={() => toggle(a.key, !on)} style={{ height: 26, fontSize: 12, opacity: busy === a.key ? 0.6 : 1 }}>{a.name}</FilterChip>;
        })
        : mine.length ? mine.map((a) => <Tag key={a.key} tone="muted">{a.name}</Tag>) : <span style={{ fontSize: 12.5, color: '#8b918a' }}>None set</span>}
    </div>
  );
}
