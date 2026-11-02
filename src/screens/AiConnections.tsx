// Administration · AI connections (System Admins): the providers' connections with their keys (shown as a hint only),
// and every place the app uses AI with the connection and model that serve it. Reads only from the view-model (aiVals).
import { Banner, Button, Drawer, Field, Hover, Input, LinkButton, PageTitle, PillToggle, Select, StatusChip, Tag, Textarea } from '../ds';
import type { VM } from '../model';

type AiVM = NonNullable<VM['ai']>;
const caps = { fontSize: 11.5, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' } as const;
const card = { background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6 } as const;
const USE_COLS = 'minmax(0,2.4fr) minmax(0,1.5fr) 200px 190px 110px';
const onOff = [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }];

export default function AiConnectionsScreen({ ai }: { ai: AiVM }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle title="AI connections" lead={ai.lead} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {ai.summary && <span style={{ fontSize: 12.5, color: '#5a6058' }}>{ai.summary}</span>}
          <Button onClick={ai.addConnection}>+ Add connection</Button>
        </div>
      </div>
      {ai.designNote && <Banner tone="info">{ai.designNote}</Banner>}
      {ai.error && <Banner tone="warning" actions={<Button size="sm" variant="secondary" onClick={ai.retry}>Try again</Button>}>{ai.error}</Banner>}
      {ai.loading && <div style={{ color: '#8b918a' }}>Loading the AI settings</div>}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={caps}>Connections</div>
        {ai.noConnections && <div style={{ ...card, padding: '14px 16px', color: '#5a6058' }}>No connections yet. Add one with its key; then choose it for the uses below.</div>}
        {ai.connections.map((c) => (
          <div key={c.id} style={{ ...card, padding: '12px 16px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontWeight: 600 }}>{c.name}</span><Tag tone="source">{c.provider}</Tag></div>
              <div style={{ fontSize: 12, color: '#5a6058', marginTop: 2 }}>{c.meta}</div>
              <div style={{ fontSize: 12, color: '#8b918a', marginTop: 2 }}>{c.usedBy}</div>
            </div>
            <Tag tone={c.hasKey ? 'green' : 'amber'}>{c.keyLabel}</Tag>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', minWidth: 150 }}>
              {c.canTest ? <Button size="sm" variant="secondary" onClick={c.test} disabled={c.testing}>{c.testing ? 'Testing' : 'Test'}</Button> : <span style={{ fontSize: 11.5, color: '#8b918a' }}>{c.testNote}</span>}
              {c.testText && !c.testing && <Tag tone={c.testTone}>{c.testText}</Tag>}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {c.confirming ? (
                <>
                  <span style={{ fontSize: 12.5 }}>Remove it and its key?</span>
                  <Button size="sm" variant="dark" onClick={c.confirmRemove}>Remove</Button>
                  <LinkButton tone="muted" onClick={c.cancelRemove}>Keep</LinkButton>
                </>
              ) : (
                <>
                  <LinkButton onClick={c.edit}>Edit</LinkButton>
                  <LinkButton tone="muted" onClick={c.remove}>Remove</LinkButton>
                </>
              )}
            </div>
          </div>
        ))}
      </section>

      {ai.groups.map((g) => (
        <section key={g.kind} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={caps}>{g.label}</div>
          <div style={{ ...card, overflowX: 'auto' }}>
            <div style={{ minWidth: 900 }}>
              <div style={{ display: 'grid', gridTemplateColumns: USE_COLS, ...caps, borderBottom: '1px solid #e1e5dc', background: '#fafbf8' }}>
                <div style={{ padding: '9px 12px' }}>Where AI is used</div><div style={{ padding: '9px 12px' }}>Status</div><div style={{ padding: '9px 12px' }}>Connection</div><div style={{ padding: '9px 12px' }}>Model</div><div style={{ padding: '9px 12px' }}>Use</div>
              </div>
              {g.uses.map((u) => (
                <Hover key={u.key} data-use={u.key} hoverStyle={{ background: '#fafbf8' }} style={{ display: 'grid', gridTemplateColumns: USE_COLS, alignItems: 'center', borderBottom: '1px solid #eef0ea' }}>
                  <div style={{ padding: '10px 12px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontWeight: 500 }}>{u.label}</span>{u.adminsOnly && <Tag tone="muted">{u.adminsOnly}</Tag>}</div>
                    <div style={{ fontSize: 12, color: '#5a6058' }}>{u.place}</div>
                    <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>{u.description}</div>
                    <div style={{ fontSize: 11.5, color: '#8b918a', display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2 }}>
                      <span style={{ fontStyle: 'italic', textWrap: 'pretty' }}>{u.instruction}</span>
                      <LinkButton size={11.5} onClick={u.editInstruction}>Instruction and limit</LinkButton>
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', minWidth: 0 }}>
                    <StatusChip status={u.status} label={u.statusLabel} icon={u.status === 'accepted' ? 'check' : 'dot'} />
                    <span style={{ fontSize: 11.5, color: '#8b918a', textWrap: 'pretty' }}>{u.why}</span>
                    {u.usageLine && <span style={{ fontSize: 11.5, color: '#5a6058', fontVariantNumeric: 'tabular-nums' }}>{u.usageLine}</span>}
                  </div>
                  <div style={{ padding: '10px 12px' }}><Select size="md" aria-label={'Connection for ' + u.label} value={u.connValue} onChange={u.setConn} options={u.connOptions} disabled={ai.busy} /></div>
                  <div style={{ padding: '10px 12px' }}><Input key={u.modelKey} size="md" aria-label={'Model for ' + u.label} defaultValue={u.model} placeholder={u.modelPlaceholder} onBlur={u.saveModel} onKeyDown={u.modelKeyDown} /></div>
                  <div style={{ padding: '10px 12px' }}><PillToggle options={onOff} value={u.enabled ? 'on' : 'off'} onChange={(v) => { if ((v === 'on') !== u.enabled) u.toggle(); }} /></div>
                </Hover>
              ))}
            </div>
          </div>
        </section>
      ))}

      {ai.usageTop.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={caps}>Most AI calls</div>
          <div style={{ ...card, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ai.usageTop.map((t) => <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}><span>{t.name}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: '#5a6058' }}>{t.calls}</span></div>)}
            <div style={{ fontSize: 11.5, color: '#8b918a' }}>{ai.usageNote}</div>
          </div>
        </section>
      )}

      {ai.form && <ConnectionDrawer f={ai.form} />}
      {ai.useEdit && (
        <Drawer title={ai.useEdit.title} subtitle="The ai function always sends this instruction first; the app's own context follows it. A person who reaches the daily limit gets the scripted reply until tomorrow (UTC)." onClose={ai.useEdit.cancel} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Fixed instruction" hint={ai.useEdit.count}><Textarea minHeight={140} aria-label="Fixed instruction" value={ai.useEdit.preamble} onChange={ai.useEdit.setPreamble} /></Field>
            <Field label="Calls per person per day" hint="0 stops the use for everyone."><Input aria-label="Calls per person per day" inputMode="numeric" value={ai.useEdit.limit} onChange={ai.useEdit.setLimit} /></Field>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Button onClick={ai.useEdit.save} disabled={ai.useEdit.busy}>Save</Button>
              <LinkButton tone="muted" onClick={ai.useEdit.cancel}>Cancel</LinkButton>
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}

function ConnectionDrawer({ f }: { f: NonNullable<AiVM['form']> }) {
  return (
    <Drawer title={f.title} subtitle={f.providerNote} onClose={f.cancel} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Name"><Input value={f.name} onChange={f.setName} placeholder="e.g. Mistral EU" /></Field>
        <Field label="Provider"><Select value={f.provider} onChange={f.setProvider} options={f.providerOptions} /></Field>
        <Field label={f.urlLabel}><Input value={f.base_url} onChange={f.setUrl} placeholder={f.urlPlaceholder} /></Field>
        <Field label="Default model" hint="A use can override it."><Input value={f.default_model} onChange={f.setModel} placeholder={f.modelPlaceholder} /></Field>
        <Field label="Region and notes" hint="Where the provider processes the data, e.g. EU (Paris), or global."><Input value={f.region} onChange={f.setRegion} placeholder="e.g. EU (Paris)" /></Field>
        <Field label={f.keyLabel} hint={f.keyHint}><Input type="password" autoComplete="off" value={f.key} onChange={f.setKey} placeholder="Paste the API key" /></Field>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button onClick={f.save} disabled={f.busy}>Save</Button>
          <LinkButton tone="muted" onClick={f.cancel}>Cancel</LinkButton>
        </div>
      </div>
    </Drawer>
  );
}
