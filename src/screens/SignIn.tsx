import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Banner, BrandMark, Button, Field, Input, LinkButton } from '../ds';
import { manageUsers, PASSWORD_HINT, PASSWORD_RULE, supabase } from '../lib/supabase';

function Frame({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#f3f5f0', fontFamily: "'IBM Plex Sans',system-ui,sans-serif", fontSize: 13, color: '#1a1d18' }}>
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandMark />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.1 }}>MyProfessionalMe</div>
            <div style={{ fontSize: 11, color: '#8b918a', letterSpacing: '.04em', textTransform: 'uppercase' }}>Learning &amp; growth</div>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{title}</h1>
            <p style={{ margin: '4px 0 0', color: '#5a6058', textWrap: 'pretty' }}>{lead}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'That email and password do not match an account.' : error.message);
  };

  return (
    <Frame title="Sign in" lead="Accounts are created by your administrator. Ask them if you do not have one yet.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Email"><Input size="3xl" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Password"><Input size="3xl" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <Banner tone="warning">{error}</Banner>}
        <Button type="submit" size="3xl" fullWidth disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</Button>
      </form>
    </Frame>
  );
}

// Shown after sign-in while the account still has the temporary password an admin set.
export function ChangePasswordScreen({ email, onDone, onSignOut }: { email: string; onDone: () => Promise<void>; onSignOut: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    if (!PASSWORD_RULE.test(password)) { setError(PASSWORD_HINT); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      await manageUsers({ action: 'change_password', password });
      // The password change revokes existing sessions; sign in again so this one keeps refreshing.
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Password saved, but signing in again failed: ' + error.message);
      await onDone();
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  };

  return (
    <Frame title="Choose your own password" lead={<>You signed in as {email} with a temporary password. Replace it before you continue.</>}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="New password" hint={PASSWORD_HINT}><Input size="3xl" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></Field>
        <Field label="Repeat new password"><Input size="3xl" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
        {error && <Banner tone="warning">{error}</Banner>}
        <Button type="submit" size="3xl" fullWidth disabled={busy}>{busy ? 'Saving' : 'Save and continue'}</Button>
        <div style={{ textAlign: 'center' }}><LinkButton tone="muted" onClick={onSignOut}>Sign out</LinkButton></div>
      </form>
    </Frame>
  );
}
