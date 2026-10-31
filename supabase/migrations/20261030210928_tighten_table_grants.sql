-- This project still applies Supabase's default table grants (ALL to anon and authenticated),
-- which re-opened the email column to updates and allowed TRUNCATE, which bypasses RLS.
-- Reset to exactly the privileges the app needs; RLS policies then decide which rows.

revoke all on public.profiles from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, business_line) on public.profiles to authenticated;
grant select, insert, delete on public.user_roles to authenticated;
