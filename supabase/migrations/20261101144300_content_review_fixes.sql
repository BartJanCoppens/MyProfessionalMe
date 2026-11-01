-- Review fixes for the content tables.
--
-- 1. A curriculum mapping is readable only when its learning is: drafts stay invisible to people who cannot edit them,
--    and so do mappings that point at them (the app could not resolve those). Learnings RLS applies inside the check.
-- 2. Column grants: nobody rewrites a learning's id or author, and new learnings take their id from the sequence.
--    Bundles keep a client-chosen id (upserts send it), but their author is fixed too.
-- Note: Domain Admins see drafts of their own line only; firm-wide drafts are for General and System Admins.

drop policy "curriculum_mappings: read" on public.curriculum_mappings;
create policy "curriculum_mappings: read" on public.curriculum_mappings for select to authenticated
  using (exists (select 1 from public.learnings l where l.id = learning_id));

revoke insert, update on public.learnings from authenticated;
grant insert (title, domain, level, format, source, hours, cpd, due, why, business_line, status) on public.learnings to authenticated;
grant update (title, domain, level, format, source, hours, cpd, due, why, business_line, status, updated_at) on public.learnings to authenticated;

revoke insert, update on public.knowledge_bundles from authenticated;
grant insert (id, business_line, access, data, updated_at) on public.knowledge_bundles to authenticated;
grant update (id, business_line, access, data, updated_at) on public.knowledge_bundles to authenticated;
