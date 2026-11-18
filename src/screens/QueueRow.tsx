// One row of "Waiting for you": who it is from, the body to read on the left, and what the person can do on the right. Submissions and shared practice runs
// are both rows of this one shell.
import type { ReactNode } from 'react';
import { Avatar } from '../ds';

const box = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '16px 18px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' } as const;

export default function QueueRow({ initials, name, sub, children, actions }: { initials: string; name: string; sub: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div style={box}>
      <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar initials={initials} />
          <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{name}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{sub}</div></div>
        </div>
        {children}
      </div>
      <div style={{ flex: '0 1 280px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>{actions}</div>
    </div>
  );
}
