import { useEffect, useMemo, useState } from 'react';
import { Avatar, Banner, Button, Checkbox, Drawer, Field, FilterChip, Hover, Input, LinkButton, PageTitle, SegmentedControl, Select, Tag } from '../ds';
import { BUSINESS_LINES, manageUsers, PASSWORD_HINT, supabase, temporaryPassword } from '../lib/supabase';
import type { BusinessLine, Profile, Role } from '../lib/supabase';
import type { Access } from '../types';
import { STAGES } from '../data';

type User = Profile & { roles: Role[] };
type Handover = { email: string; password: string; what: string };

const COLS = 'minmax(0,2.2fr) 150px 170px 190px minmax(0,2.4fr) 160px 190px';
// RLS returns only the accounts this admin may manage (plus their own).
const fetchUsers = () => supabase.from('profiles')
  .select('id, email, full_name, business_line, must_change_password, created_at, career_stage, counsellor_id, roles:user_roles!user_roles_user_id_fkey(role, business_line)')
  .order('full_name', { ascending: true, nullsFirst: false });
const initials = (u: User) => (u.full_name || u.email).split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export default function UsersScreen({ access, meId, say }: { access: Access; meId: string; say: (msg: string) => void }) {
  const managed: BusinessLine[] = access.isSystem ? [...BUSINESS_LINES] : BUSINESS_LINES.filter((l) => access.domains.includes(l));
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [line, setLine] = useState<string>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const apply = (r: Awaited<ReturnType<typeof fetchUsers>>) => {
    if (r.error) { setLoadError(r.error.message); return; }
    setLoadError(null); setUsers(r.data as unknown as User[]);
  };
  const load = async () => apply(await fetchUsers());
  useEffect(() => {
    let live = true;
    fetchUsers().then((r) => { if (live) apply(r); });
    return () => { live = false; };
  }, []);

  const shown = useMemo(() => (users || []).filter((u) =>
    (line === 'all' || (line === 'none' ? !u.business_line : u.business_line === line))
    && (!q || (u.email + ' ' + (u.full_name || '')).toLowerCase().includes(q.toLowerCase()))), [users, line, q]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); say(ok); } catch (err) { say((err as Error).message); }
    await load();
  };
  const dbError = (error: { message: string } | null) => { if (error) throw new Error(/last System Admin/.test(error.message) ? 'Cannot remove the last System Admin' : error.message); };

  const setLineOf = (u: User, v: string) => run(async () => {
    const { data, error } = await supabase.from('profiles').update({ business_line: v }).eq('id', u.id).select('id');
    dbError(error); if (!data?.length) throw new Error('You cannot move this user to ' + v);
  }, (u.full_name || u.email) + ' moved to ' + v);
  // Stage and counsellor: the database refuses a counsellor you do not manage, and changes to your own (System Admins excepted).
  const setField = (u: User, patch: { career_stage?: string | null; counsellor_id?: string | null }, done: string) => run(async () => {
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', u.id).select('id');
    dbError(error); if (!data?.length) throw new Error('You cannot change this user');
  }, done);
  const toggleRole = (u: User, role: Role['role'], bl: BusinessLine | null, on: boolean) => run(async () => {
    if (on) {
      const { error } = await supabase.from('user_roles').insert({ user_id: u.id, role, business_line: bl, created_by: meId });
      dbError(error);
    } else {
      let del = supabase.from('user_roles').delete().eq('user_id', u.id).eq('role', role);
      del = bl ? del.eq('business_line', bl) : del.is('business_line', null);
      const { error } = await del; dbError(error);
    }
  }, (on ? 'Granted ' : 'Revoked ') + (role === 'system_admin' ? 'System Admin' : 'Domain Admin · ' + bl) + ' for ' + (u.full_name || u.email));
  const resetPassword = async (u: User) => {
    const password = temporaryPassword();
    try { await manageUsers({ action: 'reset_password', user_id: u.id, password }); setHandover({ email: u.email, password, what: 'New temporary password' }); await load(); }
    catch (err) { say((err as Error).message); }
  };
  const remove = (u: User) => run(() => manageUsers({ action: 'remove', user_id: u.id }), (u.full_name || u.email) + ' removed');

  const lineOptions = [{ value: 'all', label: 'All' }].concat(managed.map((l) => ({ value: l, label: l }))).concat(access.isSystem ? [{ value: 'none', label: 'No line' }] : []);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle title="User management" lead={access.isSystem
          ? 'Create accounts, set business lines and appoint Domain Admins. You are a System Admin: you can manage everyone and you are the only role that grants roles.'
          : 'Create and manage accounts in ' + managed.join(', ') + '. A System Admin appoints Domain Admins.'} />
        <Button onClick={() => setAdding(true)}>+ Add user</Button>
      </div>
      {handover && (
        <Banner tone="success" title={handover.what + ' for ' + handover.email + ':'} onDismiss={() => setHandover(null)}
          actions={<Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(handover.password).then(() => say('Password copied'))}>Copy</Button>}>
          <code style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13.5, background: '#fff', padding: '2px 6px', borderRadius: 4 }}>{handover.password}</code>
          {' '}Pass it on in person or by phone. It is shown once; they must replace it when they first sign in.
        </Banner>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', maxWidth: 320 }}><Input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {lineOptions.length > 2 && <SegmentedControl options={lineOptions} value={line} onChange={setLine} size="lg" />}
        <span style={{ fontSize: 12.5, color: '#5a6058' }}>{users ? shown.length + ' of ' + users.length + ' accounts' : 'Loading accounts'}</span>
      </div>
      {loadError && <Banner tone="warning">{loadError}</Banner>}
      <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflowX: 'auto' }}>
        <div style={{ minWidth: 1340 }}>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, fontSize: 11.5, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e1e5dc', background: '#fafbf8' }}>
            <div style={{ padding: '10px 12px' }}>Person</div><div style={{ padding: '10px 12px' }}>Business line</div><div style={{ padding: '10px 12px' }}>Stage</div><div style={{ padding: '10px 12px' }}>Counsellor</div><div style={{ padding: '10px 12px' }}>Roles</div>
            <div style={{ padding: '10px 12px' }}>Sign-in</div><div style={{ padding: '10px 12px' }} />
          </div>
          {shown.map((u) => {
            const me = u.id === meId;
            const isSys = u.roles.some((r) => r.role === 'system_admin');
            const domainOf = (l: string) => u.roles.some((r) => r.role === 'domain_admin' && r.business_line === l);
            const canEditLine = !isSys || access.isSystem;
            return (
              <Hover key={u.id} hoverStyle={{ background: '#fafbf8' }} style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', borderBottom: '1px solid #eef0ea' }}>
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar initials={initials(u)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.full_name || u.email}{me && <span style={{ color: '#8b918a', fontWeight: 400 }}> · you</span>}</div>
                    <div style={{ fontSize: 12, color: '#8b918a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                  </div>
                </div>
                <div style={{ padding: '10px 12px' }}>
                  {canEditLine
                    ? <Select size="md" value={u.business_line || ''} onChange={(e) => setLineOf(u, e.target.value)}
                        options={(u.business_line ? [] : [{ value: '', label: 'No line' }]).concat(managed.map((l) => ({ value: l, label: l })))} />
                    : <span style={{ color: '#5a6058' }}>{u.business_line || 'No line'}</span>}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  {canEditLine && (!me || access.isSystem)
                    ? <Select size="md" value={u.career_stage || ''} onChange={(e) => setField(u, { career_stage: e.target.value || null }, (u.full_name || u.email) + ' · stage ' + (e.target.value || 'cleared'))}
                        options={[{ value: '', label: 'No stage' }].concat(STAGES.map((st) => ({ value: st, label: st })))} />
                    : <span style={{ color: '#5a6058' }}>{u.career_stage || 'No stage'}</span>}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  {canEditLine && (!me || access.isSystem)
                    ? <Select size="md" value={u.counsellor_id || ''} style={{ maxWidth: '100%' }}
                        onChange={(e) => setField(u, { counsellor_id: e.target.value || null }, (u.full_name || u.email) + (e.target.value ? ' · counsellor set' : ' · counsellor cleared'))}
                        options={[{ value: '', label: 'None' }].concat((users || []).filter((c) => c.id !== u.id).map((c) => ({ value: c.id, label: c.full_name || c.email })))} />
                    : <span style={{ color: '#5a6058' }}>{(users || []).find((c) => c.id === u.counsellor_id)?.full_name || (u.counsellor_id ? 'Assigned' : 'None')}</span>}
                </div>
                <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {access.isSystem ? (
                    <>
                      <FilterChip selected={isSys} onClick={() => toggleRole(u, 'system_admin', null, !isSys)} style={{ height: 26, fontSize: 12 }}>System Admin</FilterChip>
                      {BUSINESS_LINES.map((l) => (
                        <FilterChip key={l} selected={domainOf(l)} onClick={() => toggleRole(u, 'domain_admin', l, !domainOf(l))} style={{ height: 26, fontSize: 12 }}>
                          {domainOf(l) ? 'Domain Admin · ' : ''}{l}
                        </FilterChip>
                      ))}
                    </>
                  ) : u.roles.length ? u.roles.map((r) => (
                    <Tag key={r.role + r.business_line} tone={r.role === 'system_admin' ? 'neutral' : 'green'}>{r.role === 'system_admin' ? 'System Admin' : 'Domain Admin · ' + r.business_line}</Tag>
                  )) : <span style={{ color: '#8b918a', fontSize: 12.5 }}>Member</span>}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  {u.must_change_password ? <Tag tone="amber">Temporary password</Tag> : <Tag tone="muted">Own password</Tag>}
                </div>
                <div style={{ padding: '10px 12px', display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
                  {!me && canEditLine && <LinkButton onClick={() => resetPassword(u)}>Reset password</LinkButton>}
                  {!me && canEditLine && (confirmRemove === u.id
                    ? <><LinkButton tone="muted" onClick={() => setConfirmRemove(null)}>Cancel</LinkButton><Button size="sm" variant="dark" onClick={() => { setConfirmRemove(null); remove(u); }}>Remove</Button></>
                    : <LinkButton tone="muted" onClick={() => setConfirmRemove(u.id)}>Remove</LinkButton>)}
                </div>
              </Hover>
            );
          })}
          {users && !shown.length && <div style={{ padding: '18px 12px', color: '#5a6058' }}>No accounts match.</div>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>
        Removing someone deletes their account at once; a session they already have open stays valid for up to an hour. The last System Admin cannot be removed.
      </div>
      {adding && <AddUserDrawer access={access} managed={managed} meId={meId} onClose={() => setAdding(false)}
        onCreated={async (h) => { setAdding(false); setHandover(h); say('Account created for ' + h.email); await load(); }} />}
    </>
  );
}

function AddUserDrawer({ access, managed, meId, onClose, onCreated }: { access: Access; managed: BusinessLine[]; meId: string; onClose: () => void; onCreated: (h: Handover) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [line, setLine] = useState<string>(managed[0]);
  const [password, setPassword] = useState(temporaryPassword);
  const [domainAdmin, setDomainAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await manageUsers({ action: 'create', email, full_name: name, business_line: line, password });
      if (domainAdmin && res.user_id) {
        const { error } = await supabase.from('user_roles').insert({ user_id: res.user_id, role: 'domain_admin', business_line: line, created_by: meId });
        if (error) throw new Error('Account created, but the Domain Admin role was not granted: ' + error.message);
      }
      onCreated({ email: email.trim().toLowerCase(), password, what: 'Temporary password' });
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  };

  return (
    <Drawer title="Add a user" subtitle="They sign in with the temporary password you hand them, then choose their own." onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="firstname.lastname@intelli-select.com" autoFocus /></Field>
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></Field>
        <Field label="Business line" hint={access.isSystem ? undefined : 'You can add users to the lines you administer.'}>
          <Select value={line} onChange={(e) => setLine(e.target.value)} options={managed.map((l) => ({ value: l, label: l }))} />
        </Field>
        <Field label="Temporary password" hint={PASSWORD_HINT}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} style={{ fontFamily: 'ui-monospace,Menlo,monospace' }} />
            <LinkButton onClick={() => setPassword(temporaryPassword())}>Generate</LinkButton>
          </div>
        </Field>
        {access.isSystem && <Checkbox checked={domainAdmin} onChange={setDomainAdmin}>Make them Domain Admin for {line}</Checkbox>}
        {error && <Banner tone="warning">{error}</Banner>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="lg" onClick={submit} disabled={busy || !email}>{busy ? 'Creating' : 'Create account'}</Button>
          <Button size="lg" variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Drawer>
  );
}
