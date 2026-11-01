import { Avatar, Banner, Button, Card, Eyebrow, Hover, KeyValueList, PageTitle, StatusChip } from '../ds';
import type { VM } from '../model';

export default function ProjectsScreen({ vm }: { vm: VM }) {
  const pr = vm.pr;
  const dimGrid = { display: 'grid', gridTemplateColumns: 'minmax(0,140px) 240px minmax(0,1fr)', gap: 14 } as const;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle title="Projects & evaluations" lead={vm.projLead} />
        <Button variant="secondary" onClick={vm.requestEval}>Request an evaluation</Button>
      </div>
      {!pr ? (
        <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '22px 22px', color: '#5a6058', textWrap: 'pretty' }}>
          <div style={{ fontWeight: 600, color: '#1a1d18', marginBottom: 2 }}>No evaluations yet</div>
          Project evaluations appear here once the performance tool is connected. Their advice then feeds the projects cloud on your growth map.
        </div>
      ) : (
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vm.projList.map((pj) => (
            <Hover key={pj.id} onClick={pj.open} hoverStyle={{ borderColor: '#b9bfb5' }}
              style={{ background: '#fff', border: '1px solid ' + pj.bd, boxShadow: pj.ring, borderRadius: 6, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, transition: 'box-shadow .15s' }}>
              <div style={{ fontSize: 11.5, color: '#8b918a' }}>{pj.client} · {pj.period}</div>
              <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25 }}>{pj.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#5a6058' }}>{pj.role}</span>
                <StatusChip status={pj.st} label={pj.stLabel} icon={pj.stIcon} />
              </div>
            </Hover>
          ))}
        </div>
        <div style={{ flex: '1 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '18px 20px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0, flex: '1 1 300px' }}>
              <Eyebrow>{pr.client} · {pr.period}</Eyebrow>
              <div style={{ fontWeight: 600, fontSize: 22, lineHeight: 1.2, marginTop: 4 }}>{pr.name}</div>
              <p style={{ margin: '6px 0 0', color: '#5a6058', textWrap: 'pretty', maxWidth: 560 }}>{pr.summary}</p>
            </div>
            <div style={{ flex: '0 1 280px', minWidth: 0 }}><KeyValueList rows={pr.kv} labelWidth={80} /></div>
          </div>
          {pr.pending && <Banner tone="info">{pr.pendingText}</Banner>}
          {pr.evaluated && (
            <>
              <Card title="Evaluation" subtitle={pr.evalSub}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ ...dimGrid, fontSize: 11, fontWeight: 600, color: '#8b918a', textTransform: 'uppercase', letterSpacing: '.04em', paddingBottom: 8 }}><span>Dimension</span><span>Rating</span><span>Comment</span></div>
                  {pr.dims.map((dm) => (
                    <div key={dm.name} style={{ ...dimGrid, alignItems: 'center', padding: '9px 0', borderTop: '1px solid #eef0ea' }}>
                      <span style={{ fontWeight: 500 }}>{dm.name}</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 3 }}>
                        {dm.scale.map((sv) => (
                          <div key={sv.label} style={{ height: 24, borderRadius: 4, background: sv.bg, color: sv.fg, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{sv.label}</div>
                        ))}
                      </div>
                      <span style={{ fontSize: 12.5, color: '#5a6058', textWrap: 'pretty' }}>{dm.comment}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid #eef0ea', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Avatar initials={pr.evInit} />
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: '#8b918a' }}>{pr.evaluator} · {pr.evalDate}</div><div style={{ textWrap: 'pretty' }}>“{pr.quote}”</div></div>
                  </div>
                </div>
              </Card>
              <Card title="Learning & growth advice" subtitle={pr.adviceSub}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {pr.advice.map((av) => (
                    <div key={av.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eef0ea' }}>
                      <div style={{ textWrap: 'pretty' }}>{av.text}</div>
                      <div onClick={av.open} style={{ cursor: 'pointer', minWidth: 0 }}><div style={{ fontWeight: 500 }}>{av.title}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{av.meta}</div></div>
                      <div>
                        {av.canAdd ? <Button variant="secondary" size="sm" onClick={av.add}>+ Add</Button> : <StatusChip status={av.state} label={av.stateLabel} icon={av.stateIcon} />}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
      )}
    </>
  );
}
