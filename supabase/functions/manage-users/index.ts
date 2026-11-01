// Account operations that need the auth admin API: create, remove, reset a password, change your own.
// Role grants and profile edits do not come through here; the app writes those directly under RLS.
//
// Who may act:
//   System Admin  -> any user
//   Domain Admin  -> users whose business line they administer, never a System Admin
import { withSupabase } from '@supabase/server';

const LINES = ['Consulting', 'Audit', 'Tax & Legal'];
// Mirrors supabase/config.toml: minimum_password_length = 12, lower_upper_letters_digits
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;
const PASSWORD_HINT = 'Use at least 12 characters with lower-case and upper-case letters and a digit.';

type Body =
  | { action: 'create'; email: string; full_name?: string; business_line: string; password: string }
  | { action: 'remove'; user_id: string }
  | { action: 'reset_password'; user_id: string; password: string }
  | { action: 'change_password'; password: string };

const fail = (status: number, error: string) => Response.json({ error }, { status });

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Use POST');
    const callerId = ctx.userClaims!.id;
    const admin = ctx.supabaseAdmin;

    let body: Body;
    try { body = await req.json(); } catch { return fail(400, 'Body must be JSON'); }

    // The caller's own password needs no role.
    if (body.action === 'change_password') {
      if (!PASSWORD_RULE.test(body.password || '')) return fail(400, PASSWORD_HINT);
      const { error } = await admin.auth.admin.updateUserById(callerId, { password: body.password });
      if (error) return fail(400, error.message);
      await admin.from('profiles').update({ must_change_password: false }).eq('id', callerId);
      return Response.json({ ok: true });
    }

    const { data: roles, error: rolesError } = await admin.from('user_roles').select('role, business_line').eq('user_id', callerId);
    if (rolesError) return fail(500, rolesError.message);
    const isSystem = roles.some((r) => r.role === 'system_admin');
    const domains = roles.filter((r) => r.role === 'domain_admin').map((r) => r.business_line as string);
    const manages = (line: string | null) => isSystem || (!!line && domains.includes(line));
    if (!isSystem && !domains.length) return fail(403, 'Only System Admins and Domain Admins can manage users');

    // Load a target user and check the caller may manage them.
    const target = async (userId: string) => {
      if (!userId) return { error: fail(400, 'user_id is required') };
      const { data: profile } = await admin.from('profiles').select('id, email, business_line').eq('id', userId).maybeSingle();
      if (!profile) return { error: fail(404, 'User not found') };
      const { data: targetRoles } = await admin.from('user_roles').select('role, business_line').eq('user_id', userId);
      const targetIsSystem = (targetRoles || []).some((r) => r.role === 'system_admin');
      if (targetIsSystem && !isSystem) return { error: fail(403, 'Only a System Admin can manage a System Admin') };
      const targetIsGeneral = (targetRoles || []).some((r) => r.role === 'general_admin');
      if (targetIsGeneral && !isSystem) return { error: fail(403, 'Only a System Admin can manage a General Admin') };
      // Managing someone who administers another line would hand their admin rights to the caller.
      const foreignAdmin = (targetRoles || []).some((r) => r.role === 'domain_admin' && !domains.includes(r.business_line as string));
      if (foreignAdmin && !isSystem) return { error: fail(403, 'This user is Domain Admin for a line you do not administer') };
      if (!manages(profile.business_line)) return { error: fail(403, 'This user is outside your business line') };
      return { profile };
    };

    if (body.action === 'create') {
      const email = (body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Enter a valid email address');
      if (!LINES.includes(body.business_line)) return fail(400, 'Choose a business line');
      if (!manages(body.business_line)) return fail(403, 'You can only add users to your own business line');
      if (!PASSWORD_RULE.test(body.password || '')) return fail(400, PASSWORD_HINT);

      const { data, error } = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
      if (error || !data.user) return fail(400, error?.message || 'Could not create the user');
      // The on_auth_user_created trigger has inserted the profile; fill in the rest.
      const { error: profileError } = await admin.from('profiles')
        .update({ full_name: (body.full_name || '').trim() || null, business_line: body.business_line, must_change_password: true })
        .eq('id', data.user.id);
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id);
        return fail(500, profileError.message);
      }
      return Response.json({ ok: true, user_id: data.user.id });
    }

    if (body.action === 'reset_password') {
      const t = await target(body.user_id);
      if (t.error) return t.error;
      if (!PASSWORD_RULE.test(body.password || '')) return fail(400, PASSWORD_HINT);
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) return fail(400, error.message);
      await admin.from('profiles').update({ must_change_password: true }).eq('id', body.user_id);
      return Response.json({ ok: true });
    }

    if (body.action === 'remove') {
      if (body.user_id === callerId) return fail(400, 'You cannot remove your own account');
      const t = await target(body.user_id);
      if (t.error) return t.error;
      // Deleting the auth user cascades to profile and roles; the database refuses to remove the last System Admin.
      const { error } = await admin.auth.admin.deleteUser(body.user_id);
      if (error) return fail(400, /last System Admin/i.test(error.message) ? 'Cannot remove the last System Admin' : error.message);
      return Response.json({ ok: true });
    }

    return fail(400, 'Unknown action');
  }),
};
