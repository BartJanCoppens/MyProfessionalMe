// Who may manage whom through manage-users. Pure, shared by the edge function and its Vitest test.
//   System Admin  -> any user, any action
//   Domain Admin  -> users whose business line they administer, never a System or General Admin
//   General Admin -> reset_password only, for anyone except a System Admin (owner decision, 19 Nov 2026)
export type Action = 'create' | 'remove' | 'reset_password';
export type Caller = { isSystem: boolean; isGeneral: boolean; domains: string[] };
export type Target = { line: string | null; roles: { role: string; business_line: string | null }[] };

// The reason the caller may not act on the target (null for create's target), or null when allowed.
export function refusal(action: Action, caller: Caller, target: Target | null): string | null {
  const generalReset = caller.isGeneral && action === 'reset_password';
  if (!caller.isSystem && !caller.domains.length && !generalReset) return 'Only System Admins and Domain Admins can manage users';
  if (!target || caller.isSystem) return null;
  if (target.roles.some((r) => r.role === 'system_admin')) return 'Only a System Admin can manage a System Admin';
  if (generalReset) return null;
  if (target.roles.some((r) => r.role === 'general_admin')) return 'Only a System Admin can manage a General Admin';
  // Managing someone who administers another line would hand their admin rights to the caller.
  if (target.roles.some((r) => r.role === 'domain_admin' && !caller.domains.includes(r.business_line as string))) return 'This user is Domain Admin for a line you do not administer';
  if (!target.line || !caller.domains.includes(target.line)) return 'This user is outside your business line';
  return null;
}
