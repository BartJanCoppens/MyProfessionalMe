// Waiting for you (F3): every submission the signed-in person decides on, with its evidence and the person's last
// activity. Accept, or request changes with a comment, right here; "Open" shows the learning in the person's app.
import { Avatar, Button, Input, LinkButton, PageTitle, Tag } from '../ds';
import type { VM } from '../model';

type Appr = NonNullable<VM['appr']>;
const box = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6 } as const;

export default function ApprovalsScreen({ appr, onOpen }: { appr: Appr; onOpen: (userId: string, learningId: string) => void }) {
  const note = { ...box, padding: '18px 20px', color: '#5a6058' } as const;
  return (
    <>
      <PageTitle title="Waiting for you" lead={appr.lead} />
      {appr.error && <div style={note}><div style={{ fontWeight: 600, color: '#1a1d18', marginBottom: 2 }}>The approvals did not load</div>{appr.error} · <LinkButton onClick={appr.retry}>Try again</LinkButton></div>}
      {appr.loading && <div style={note}>Loading what waits for you</div>}
      {appr.empty && <div style={note}><div style={{ fontWeight: 600, color: '#1a1d18', marginBottom: 2 }}>Nothing waits for you</div>Submissions of your counsellees appear here, and for admins those of people without a counsellor.</div>}
      {appr.rows.map((r) => (
        <div key={r.key} style={{ ...box, padding: '16px 18px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Avatar initials={r.initials} />
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{r.sub}</div></div>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4, fontSize: 12, color: '#5a6058' }}>
                <span>{r.format}</span><Tag tone={r.late ? 'amber' : 'neutral'}>{r.waited}</Tag>
              </div>
            </div>
            <div style={{ background: '#fafbf8', border: '1px solid #eef0ea', borderRadius: 6, padding: '10px 12px', fontSize: 12.5 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>Evidence</div>
              {r.evidence.none ? <div style={{ color: '#5a6058' }}>{r.evidence.none}</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.evidence.note && <div style={{ whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{r.evidence.note}</div>}
                  {r.evidence.link && <a href={r.evidence.link} target="_blank" rel="noopener noreferrer" style={{ color: '#2f6fa8', overflowWrap: 'anywhere' }}>{r.evidence.link}</a>}
                  {r.evidence.ref && <div style={{ color: '#5a6058' }}>Certificate number · {r.evidence.ref}</div>}
                </div>
              )}
            </div>
          </div>
          <div style={{ flex: '0 1 280px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Input value={r.comment} onChange={r.setComment} placeholder="Comment (required to request changes)" aria-label={'Comment for ' + r.name} />
            <div style={{ fontSize: 11.5, color: '#8b918a', textAlign: 'right' }}>{r.commentCount}</div>
            <Button fullWidth onClick={r.accept}>Accept</Button>
            <Button variant="secondary" fullWidth onClick={r.sendBack}>Request changes</Button>
            <LinkButton onClick={() => onOpen(r.userId, r.learningId)}>{r.openLabel}</LinkButton>
          </div>
        </div>
      ))}
    </>
  );
}
