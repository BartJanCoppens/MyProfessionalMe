-- v0.4.1, the owner's answers of 1 Nov 2026:
-- Q1  Learners see published learnings only; drafts and learnings needing review stay with the admins who edit them.
--     (Curriculum mappings follow: they are readable only when their learning is.)
-- Q8  Ambitions and interests are private to the person. Counsellors and admins see the learning track, not these.
-- A learning another line's audience maps may not be hidden from learners (draft or review) by an admin who cannot
-- edit that audience, extending private.guard_shared_learning() from drafts to both hidden states.

drop policy "learnings: read" on public.learnings;
create policy "learnings: read" on public.learnings for select to authenticated
  using (status = 'published' or (select private.can_edit_content(business_line)));

drop policy "ambitions: read" on public.ambitions;
create policy "ambitions: read" on public.ambitions for select to authenticated using (user_id = (select auth.uid()));
drop policy "interests: read" on public.interests;
create policy "interests: read" on public.interests for select to authenticated using (user_id = (select auth.uid()));

create or replace function private.guard_shared_learning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if (tg_op = 'DELETE' or (new.status <> 'published' and old.status = 'published'))
     and exists (select 1 from public.curriculum_mappings m where m.learning_id = old.id and not private.can_edit_audience(m.audience)) then
    raise exception 'This learning is mapped for audiences you cannot edit; ask their admins to unmap it first' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
