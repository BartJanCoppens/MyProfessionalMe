import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example)');

export const supabase = createClient(url, key);

export const BUSINESS_LINES = ['Consulting', 'Audit', 'Tax & Legal'] as const;
export type BusinessLine = (typeof BUSINESS_LINES)[number];

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  business_line: BusinessLine | null;
  must_change_password: boolean;
  created_at: string;
};
export type Role = { role: 'system_admin' | 'domain_admin'; business_line: BusinessLine | null };

// Mirrors supabase/config.toml and the manage-users function.
export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;
export const PASSWORD_HINT = 'At least 12 characters, with lower-case and upper-case letters and a digit.';

// A temporary password that satisfies PASSWORD_RULE, for an admin to hand over.
export function temporaryPassword() {
  const pick = (set: string, n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => set[v % set.length]).join('');
  const chars = pick('abcdefghjkmnpqrstuvwxyz', 6) + pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 4) + pick('23456789', 4);
  return chars.split('').sort(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 - 0.5).join('');
}

type ManageUsers =
  | { action: 'create'; email: string; full_name?: string; business_line: string; password: string }
  | { action: 'remove'; user_id: string }
  | { action: 'reset_password'; user_id: string; password: string }
  | { action: 'change_password'; password: string };

// Calls the manage-users edge function and turns any failure into an Error with a readable message.
export async function manageUsers(body: ManageUsers): Promise<{ ok: true; user_id?: string }> {
  const { data, error } = await supabase.functions.invoke('manage-users', { body });
  if (error) {
    let message = error.message;
    try { const ctx = (error as { context?: Response }).context; if (ctx) message = (await ctx.json()).error || message; } catch { /* keep message */ }
    throw new Error(message);
  }
  return data;
}
