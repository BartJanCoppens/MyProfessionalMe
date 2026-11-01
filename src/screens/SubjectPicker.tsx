import { useState } from 'react';
import { Drawer, Hover, Input } from '../ds';

type Option = { id: string; label: string };

// "View as": admins choose whose growth map, library and profile the app shows. Viewing someone else is read-only.
export default function SubjectPicker({ options, current, onSelect, onClose }: { options: Option[]; current: string; onSelect: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Drawer title="View as" subtitle="Show the app as another person sees it. Their data stays read-only for you." onClose={onClose} width={420}>
      <Input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' }}>
        {shown.map((o) => {
          const on = o.id === current;
          return (
            <Hover key={o.id} as="button" type="button" onClick={() => { onSelect(o.id); onClose(); }} hoverStyle={{ background: on ? '#eef7dc' : '#fafbf8' }}
              style={{ textAlign: 'left', padding: '10px 14px', border: 0, borderBottom: '1px solid #eef0ea', background: on ? '#eef7dc' : '#fff', color: '#1a1d18',
                fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 600 : 500, cursor: 'pointer' }}>
              {o.label}
            </Hover>
          );
        })}
        {!shown.length && <div style={{ padding: '12px 14px', color: '#5a6058' }}>Nobody matches.</div>}
      </div>
    </Drawer>
  );
}
