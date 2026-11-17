// The credentials wallet in My profile (design v4): held and waiting credentials, what the person is working toward, and the
// form for an external credential. Reads from VM only (walletVals.ts); no action in View as.
import { Button, Input, LinkButton, StatusChip } from '../ds';
import type { VM } from '../model';

const small = { fontSize: 12, color: '#5a6058' } as const;
type Cf = NonNullable<VM['credForm']>;

function CredentialForm({ f }: { f: Cf }) {
  const field = (label: string, key: keyof Omit<Cf, 'set' | 'submit' | 'cancel'>, extra: { type?: string; placeholder?: string; max?: number } = {}) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px' }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5a6058' }}>{label}</span>
      <Input size="md" type={extra.type} placeholder={extra.placeholder} maxLength={extra.max} value={f[key]} onChange={(e) => f.set(key, e.target.value)} />
    </label>
  );
  return (
    <div style={{ borderTop: '1px solid #eef0ea', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, background: '#fafbf8' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{field('Credential', 'name', { max: 160 })}{field('Issued by', 'issuer', { max: 120 })}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{field('Earned on', 'earned', { type: 'date' })}{field('Expires on (if it does)', 'expires', { type: 'date' })}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{field('Link to the certificate', 'link', { placeholder: 'https://', max: 500 })}{field('or certificate number', 'ref', { max: 80 })}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Button size="sm" onClick={f.submit}>Add credential</Button><LinkButton tone="muted" onClick={f.cancel}>Cancel</LinkButton></div>
    </div>
  );
}

export default function Wallet({ vm }: { vm: VM }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #eef0ea', background: '#fafbf8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>Credentials</div><div style={small}>{vm.walletLead}</div></div>
        {vm.canAddCred && <Button size="sm" variant="secondary" onClick={vm.addCred}>+ Add an external credential</Button>}
      </div>
      {vm.credForm && <CredentialForm f={vm.credForm} />}
      {vm.wallet.length === 0 && <div style={{ padding: '14px 18px', ...small }}>No credentials yet. They appear here when a certification trajectory ends in one, or when you add one you already hold.</div>}
      <div style={{ padding: vm.wallet.length ? '14px 18px' : 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
        {vm.wallet.map((wc) => (
          <div key={wc.id} style={{ border: '1px solid ' + wc.bd, borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, background: wc.bg }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span aria-hidden="true" style={{ width: 30, height: 30, flex: 'none', borderRadius: 7, background: '#fdf3dc', border: '1px solid #f0dca3', color: '#7a5000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>◆</span>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, lineHeight: 1.3 }}>{wc.name}</div><div style={small}>{wc.issuer}</div></div>
            </div>
            <div style={{ fontSize: 12, color: '#3d423b' }}>{wc.dates}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
              <StatusChip status={wc.st} label={wc.stLabel} />
              {/^https?:\/\//.test(wc.link) && <a href={wc.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#4c7a10' }}>Open certificate</a>}
              {wc.remove && <LinkButton tone="muted" onClick={wc.remove.run}>{wc.remove.label}</LinkButton>}
            </div>
          </div>
        ))}
      </div>
      {vm.hasWork && (
        <div style={{ borderTop: '1px solid #eef0ea', padding: '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>Working toward</div>
          {vm.walletWork.map((ww) => (
            <button key={ww.id} type="button" onClick={ww.open} style={{ appearance: 'none', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '10px 12px', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(120px,1fr) auto', gap: 14, alignItems: 'center' }}>
              <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600 }}>◆ {ww.name}</span><span style={{ display: 'block', ...small }}>{ww.sub}</span></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={{ display: 'block', height: 5, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: ww.barW, background: '#86BC25' }} /></span><span style={{ fontSize: 11.5, color: '#5a6058' }}>{ww.prog}</span></span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#4c7a10' }}>Open →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
