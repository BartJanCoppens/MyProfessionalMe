-- Reflections in an E-learning course (E-learning Studio, Task 1.5): what a learner writes at a reflect block. Owner decision (19 Nov 2026): nobody but the
-- learner reads it, not the counsellor, not any admin role, not View as. So the table has four owner-only policies and no other path to it: no
-- security-definer function and no admin or can_view branch ever selects from it (src/logic/reflections.sync.test.ts keeps it so).
-- At most 2000 characters as written (spaces count), and something besides white space (private.trimmed, the one trim rule). A definer wrapper, because
-- private.trimmed is not executable by the client roles and a check runs as the writer.
create function private.reflection_ok(p_text text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select char_length(p_text) <= 2000 and private.trimmed(p_text) <> ''
$$;
revoke execute on function private.reflection_ok(text) from public, anon;
grant execute on function private.reflection_ok(text) to authenticated;

create table public.course_reflections (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  learning_id text not null references public.learnings (id) on delete cascade,
  block_id text not null check (block_id ~ '^b[0-9a-z]{4,20}$'),
  text text not null check (private.reflection_ok(text)),
  updated_at timestamptz not null default now(),
  primary key (user_id, learning_id, block_id)
);
create index course_reflections_learning_idx on public.course_reflections (learning_id);

-- Is this block a reflect block of that published E-learning? Reads learnings only, never the reflections.
create function private.course_has_reflection(p_learning text, p_block text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.learnings l
    where l.id = p_learning and l.status = 'published' and l.format = 'E-learning'
      and jsonb_path_exists(l.content, '$.lessons[*].blocks[*] ? (@.block == "reflect" && @.id == $id)', jsonb_build_object('id', p_block))
  )
$$;
revoke execute on function private.course_has_reflection(text, text) from public, anon;
grant execute on function private.course_has_reflection(text, text) to authenticated;

-- A reflection stays with its person, course and block. The client upserts with the key columns in the SET list, so those are granted for update
-- but refused here unless unchanged (user_id is not granted at all).
create function private.stamp_reflection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.learning_id <> old.learning_id or new.block_id <> old.block_id then
    raise exception 'A reflection stays with its block' using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.stamp_reflection() from public, anon, authenticated;
create trigger stamp_reflection before update on public.course_reflections
  for each row execute function private.stamp_reflection();

alter table public.course_reflections enable row level security;
revoke all on public.course_reflections from anon, authenticated;
grant select, insert (learning_id, block_id, text), update (learning_id, block_id, text), delete on public.course_reflections to authenticated;

create policy "course_reflections: own read" on public.course_reflections for select to authenticated
  using (user_id = (select auth.uid()));
create policy "course_reflections: own write" on public.course_reflections for insert to authenticated
  with check (user_id = (select auth.uid()) and private.course_has_reflection(learning_id, block_id));
create policy "course_reflections: own change" on public.course_reflections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "course_reflections: own remove" on public.course_reflections for delete to authenticated
  using (user_id = (select auth.uid()));
