-- Only a published podcast or reel completes itself; drafts and learnings needing review are not visible to learners.
create or replace function private.is_self_complete(p_learning_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.learnings where id = p_learning_id and format in ('Podcast', 'Reel') and status = 'published');
$$;
