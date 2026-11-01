import { Avatar, Hover, LinkButton, PageTitle, StatusChip, Tabs } from '../ds';
import type { VM } from '../model';
import type { Member } from '../logic/team';

const ROSTER_COLS = 'minmax(0,2fr) minmax(0,1.6fr) 90px minmax(0,1.4fr) 70px';
const HEAT_COLS = '200px repeat(9,minmax(0,1fr))';

export default function TeamScreen({ vm, members, error = null, onRetry, onOpen }: { vm: VM; members: Member[] | null; error?: string | null; onRetry?: () => void; onOpen: (id: string) => void }) {
  const team = members ? vm.teamRows(members, onOpen) : null;
  const note = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '18px 20px', color: '#5a6058' } as const;
  return (
    <>
      <PageTitle title="Your counsellees" lead={vm.teamLead(team?.length ?? 0)} />
      <Tabs tabs={vm.teamTabs} value={vm.teamTab} onChange={vm.setTeamTab} />
      {error && <div style={note}><div style={{ fontWeight: 600, color: '#1a1d18', marginBottom: 2 }}>Your counsellees did not load</div>{error} · {onRetry && <LinkButton onClick={onRetry}>Try again</LinkButton>}</div>}
      {!team && !error && <div style={note}>Loading counsellees</div>}
      {team && !team.length && (
        <div style={note}><div style={{ fontWeight: 600, color: '#1a1d18', marginBottom: 2 }}>Nobody has {vm.who.readOnly ? vm.who.name : 'you'} as counsellor yet</div>An admin assigns counsellors in User management.</div>
      )}
      {team && team.length > 0 && vm.teamTab === 'roster' && (
        <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflowX: 'auto' }}>
          <div style={{ minWidth: 820 }}>
            <div style={{ display: 'grid', gridTemplateColumns: ROSTER_COLS, fontSize: 11.5, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e1e5dc', background: '#fafbf8' }}>
              <div style={{ padding: '10px 12px' }}>Person</div><div style={{ padding: '10px 12px' }}>Readiness for next stage</div><div style={{ padding: '10px 12px', textAlign: 'right' }}>Hours</div>
              <div style={{ padding: '10px 12px' }}>Mandatory</div><div style={{ padding: '10px 12px' }} />
            </div>
            {team!.map((p) => (
              <Hover key={p.id} hoverStyle={{ background: '#fafbf8' }} style={{ display: 'grid', gridTemplateColumns: ROSTER_COLS, alignItems: 'center', borderBottom: '1px solid #eef0ea' }}>
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar initials={p.initials} />
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{p.grade}</div></div>
                </div>
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}><div style={{ height: '100%', background: '#86BC25', width: p.barW }} /></div>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, width: 36, textAlign: 'right' }}>{p.readinessLabel}</span>
                </div>
                <div style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.hours} h</div>
                <div style={{ padding: '10px 12px' }}><StatusChip status={p.mandStatus} label={p.mandLabel} icon={p.mandIcon} /></div>
                <div style={{ padding: '10px 12px' }}><LinkButton onClick={p.open}>Open</LinkButton></div>
              </Hover>
            ))}
          </div>
        </div>
      )}
      {team && team.length > 0 && vm.teamTab === 'heat' && (
        <>
          <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflowX: 'auto' }}>
            <div style={{ minWidth: 980 }}>
              <div style={{ display: 'grid', gridTemplateColumns: HEAT_COLS, fontSize: 10, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.02em', borderBottom: '1px solid #e1e5dc', background: '#fafbf8' }}>
                <div style={{ padding: '10px 12px' }}>Level reached</div>
                {vm.domShort.map((d) => <div key={d} style={{ padding: '10px 4px', textAlign: 'center', whiteSpace: 'normal', lineHeight: 1.2, overflowWrap: 'anywhere' }}>{d}</div>)}
              </div>
              {team!.map((p) => (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: HEAT_COLS, alignItems: 'center', borderBottom: '1px solid #eef0ea' }}>
                  <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar initials={p.initials} />
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div><div style={{ fontSize: 12, color: '#8b918a' }}>{p.grade}</div></div>
                  </div>
                  {p.cells.map((c) => (
                    <div key={c.title} style={{ padding: 6 }}>
                      <div title={c.title} style={{ height: 36, borderRadius: 6, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontWeight: 600, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {c.v}{c.overdue && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e2672a' }} />}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: HEAT_COLS, alignItems: 'center', background: '#fafbf8' }}>
                <div style={{ padding: '10px 12px', fontSize: 12, color: '#5a6058' }}>Expected at next stage</div>
                {vm.heatTargets.map((t, i) => <div key={i} style={{ padding: 6, textAlign: 'center', fontSize: 12, color: '#5a6058', fontVariantNumeric: 'tabular-nums' }}>{t}</div>)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#5a6058' }}>
            <span>Shade = level reached, L0 to L5.</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e2672a' }} />Overdue mandatory item in this domain</span>
          </div>
        </>
      )}
    </>
  );
}
