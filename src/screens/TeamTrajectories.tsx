// Counsellor view, tab "Certifications": what waits for the counsellor (start requests, evidence and sign-offs) and
// every counsellee's progress on their trajectories. Reads from the view-model (teamTrjVals.ts).
import { Avatar, Button, StatusChip, Tag, Textarea } from '../ds';
import type { teamTrjVals } from '../teamTrjVals';

type Vals = ReturnType<typeof teamTrjVals>;
const box = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6 } as const;
const COLS = 'minmax(0,1.6fr) minmax(0,1.6fr) minmax(0,1.4fr) minmax(0,1.6fr) minmax(0,1.1fr)';
const head = { padding: '10px 12px' } as const;

export default function TeamTrajectories({ v }: { v: Vals }) {
  return (
    <>
      {v.notLoaded.length > 0 && <div style={{ ...box, padding: '12px 18px', color: '#5a6058' }}>{v.notLoaded.map((n) => 'Certifications did not load for ' + n + '.').join(' ')}</div>}
      <div style={{ ...box, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #eef0ea', background: '#fafbf8' }}>
          <div style={{ fontWeight: 600 }}>Waiting for you · {v.approvalCount}</div>
          <div style={{ fontSize: 12, color: '#5a6058' }}>Requests to start a trajectory that needs your approval, and evidence that needs your sign-off.{!v.canDecide && ' You are viewing as someone else: decisions are made from your own account.'}</div>
        </div>
        {v.approvals.map((a) => (
          <div key={a.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', padding: '12px 18px', borderBottom: '1px solid #eef0ea' }}>
            <Avatar initials={a.initials} />
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><span style={{ fontWeight: 600 }}>{a.name}</span><Tag tone="muted">{a.kind}</Tag><span style={{ fontSize: 12, color: '#5a6058' }}>◆ {a.trj}</span></div>
              <div style={{ fontSize: 12.5, color: '#3d423b', marginTop: 2, textWrap: 'pretty' }}>{a.text}</div>
              {a.proof && (
                <div style={{ marginTop: 6, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {a.proof.note && <div style={{ whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{a.proof.note}</div>}
                  {a.proof.link && (/^https?:\/\//.test(a.proof.link) ? <a href={a.proof.link} target="_blank" rel="noopener noreferrer" style={{ color: '#2f6fa8', overflowWrap: 'anywhere' }}>{a.proof.link}</a> : <div style={{ overflowWrap: 'anywhere' }}>{a.proof.link}</div>)}
                  {a.proof.ref && <div style={{ color: '#5a6058' }}>Certificate number · {a.proof.ref}</div>}
                  {!a.proof.note && !a.proof.link && !a.proof.ref && <div style={{ color: '#5a6058' }}>No proof attached</div>}
                </div>
              )}
            </div>
            {a.approve && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', flex: a.talkForm ? '0 1 300px' : 'none', minWidth: a.talkForm ? 240 : 0 }}>
                {a.talkForm && (
                  <>
                    <Textarea minHeight={64} value={a.talkForm.text} onChange={(e) => a.talkForm!.set(e.target.value)} maxLength={a.talkForm.max}
                      placeholder="What to talk about (at least 10 characters)" aria-label={'What to talk about with ' + a.name} />
                    <div style={{ fontSize: 11.5, color: '#8b918a', textAlign: 'right' }}>{a.talkForm.count}</div>
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {a.talkForm ? (
                    <>
                      <Button size="sm" variant="secondary" onClick={a.talkForm.cancel}>Cancel</Button>
                      <Button size="sm" variant="secondary" disabled={!a.talkForm.ok} onClick={a.talkForm.send}>{a.talkForm.sendLabel}</Button>
                    </>
                  ) : a.talk && <Button size="sm" variant="secondary" onClick={a.talk}>Talk first</Button>}
                  <Button size="sm" onClick={a.approve}>{a.approveLabel}</Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {v.noApprovals && <div style={{ padding: '12px 18px', fontSize: 12.5, color: '#5a6058' }}>Nothing waiting. New requests show up here.</div>}
      </div>
      <div style={{ ...box, overflowX: 'auto' }}>
        <div style={{ minWidth: 820 }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, fontSize: 11.5, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e1e5dc', background: '#fafbf8' }}>
            <div style={head}>Person</div><div style={head}>Trajectory</div><div style={head}>Progress</div><div style={head}>Next step</div><div style={head}>Status</div>
          </div>
          {v.teamTrj.map((r) => (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', borderBottom: '1px solid #eef0ea' }}>
              <div style={{ ...head, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><Avatar initials={r.initials} /><div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 12, color: '#6b716a' }}>{r.grade}</div></div></div>
              <div style={{ ...head, minWidth: 0 }}><div style={{ fontWeight: 500 }}>◆ {r.trj}</div><div style={{ fontSize: 12, color: '#6b716a' }}>{r.issuer}</div></div>
              <div style={{ ...head, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ display: 'block', height: 5, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: r.barW, background: '#86BC25' }} /></span>
                <span style={{ fontSize: 11.5, color: '#5a6058' }}>{r.prog}</span>
              </div>
              <div style={{ ...head, color: '#3d423b', textWrap: 'pretty' }}>{r.next}</div>
              <div style={head}><StatusChip status={r.st} label={r.stLabel} /></div>
            </div>
          ))}
          {!v.teamTrj.length && <div style={{ padding: '12px 18px', fontSize: 12.5, color: '#5a6058' }}>Nobody on your team is on a certification trajectory yet.</div>}
        </div>
      </div>
    </>
  );
}
