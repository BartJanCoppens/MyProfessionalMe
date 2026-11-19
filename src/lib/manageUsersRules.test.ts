// Who may manage whom through manage-users (FT-USR-RESET-GA). Pure rule shared by the edge function.
import { describe, expect, it } from 'vitest';
import { refusal } from '../../supabase/functions/manage-users/rules.ts';

const system = { isSystem: true, isGeneral: false, domains: [] as string[] };
const general = { isSystem: false, isGeneral: true, domains: [] as string[] };
const audit = { isSystem: false, isGeneral: false, domains: ['Audit'] };
const member = (line: string | null) => ({ line, roles: [] as { role: string; business_line: string | null }[] });
const withRole = (role: string, line: string | null = null, bl: string | null = null) => ({ line, roles: [{ role, business_line: bl }] });

describe('manage-users rules', () => {
  it('lets a General Admin reset any password except a System Admin\'s', () => {
    expect(refusal('reset_password', general, member('Consulting'))).toBeNull();
    expect(refusal('reset_password', general, member(null))).toBeNull();
    expect(refusal('reset_password', general, withRole('general_admin', 'Audit'))).toBeNull();
    expect(refusal('reset_password', general, withRole('domain_admin', 'Tax & Legal', 'Tax & Legal'))).toBeNull();
    expect(refusal('reset_password', general, withRole('system_admin'))).toBe('Only a System Admin can manage a System Admin');
  });
  it('keeps every other account action away from a General Admin', () => {
    expect(refusal('remove', general, member('Audit'))).toBe('Only System Admins and Domain Admins can manage users');
    expect(refusal('create', general, null)).toBe('Only System Admins and Domain Admins can manage users');
  });
  it('keeps the Domain Admin and System Admin rules as they were', () => {
    expect(refusal('reset_password', audit, member('Audit'))).toBeNull();
    expect(refusal('reset_password', audit, member('Consulting'))).toBe('This user is outside your business line');
    expect(refusal('reset_password', audit, withRole('general_admin', 'Audit'))).toBe('Only a System Admin can manage a General Admin');
    expect(refusal('remove', audit, withRole('domain_admin', 'Audit', 'Consulting'))).toBe('This user is Domain Admin for a line you do not administer');
    expect(refusal('remove', system, withRole('system_admin'))).toBeNull();
    expect(refusal('reset_password', { isSystem: false, isGeneral: false, domains: [] }, member('Audit'))).toBe('Only System Admins and Domain Admins can manage users');
  });
});
