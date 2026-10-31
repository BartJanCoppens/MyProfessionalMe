import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, Role } from './supabase';
import type { Access } from '../types';

export type Auth = {
  status: 'loading' | 'signed-out' | 'signed-in';
  session: Session | null;
  profile: Profile | null;
  roles: Role[];
  access: Access;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

type Account = { userId: string; profile: Profile | null; roles: Role[] };

async function fetchAccount(userId: string): Promise<Account> {
  const [p, r] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, business_line, must_change_password, created_at').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role, business_line').eq('user_id', userId),
  ]);
  return { userId, profile: (p.data as Profile) || null, roles: (r.data as Role[]) || [] };
}

export function useAuth(): Auth {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // Keep the callback synchronous: calling Supabase inside it can deadlock the auth client.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchAccount(userId).then((a) => { if (live) setAccount(a); });
    return () => { live = false; };
  }, [userId]);

  const reload = useCallback(async () => { if (userId) setAccount(await fetchAccount(userId)); }, [userId]);

  // Ignore an account loaded for a previous session.
  const current = account && account.userId === userId ? account : null;
  const roles = current?.roles || [];
  const access: Access = {
    isSystem: roles.some((r) => r.role === 'system_admin'),
    domains: roles.filter((r) => r.role === 'domain_admin').map((r) => r.business_line as string),
  };

  return {
    status: session === undefined || (session && !current) ? 'loading' : session ? 'signed-in' : 'signed-out',
    session: session || null, profile: current?.profile || null, roles, access, reload,
    signOut: async () => { await supabase.auth.signOut(); },
  };
}
