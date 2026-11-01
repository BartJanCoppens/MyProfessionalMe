-- Review fixes for the learner-data work.
--
-- 1. save_learning: one atomic insert-or-update of the caller's own progress row. Update-then-insert
--    from the client raced on quick double actions and failed with a duplicate key.
-- 2. Acceptance is durable: the owner may not set or clear "accepted" (or delete an accepted row), but
--    may still change other fields of an accepted row (for example "chosen").
-- 3. Every profile has a learner_prefs row, so saving avatar prefs is a plain update.
-- 4. manageable_user_ids(): the accounts the caller may manage, for User management.

create function public.save_learning(p_learning_id text, p_state text default null, p_pct smallint default null, p_chosen boolean default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.learner_learnings as l (user_id, learning_id, state, pct, chosen)
  values ((select auth.uid()), p_learning_id, coalesce(p_state, 'not-started'), coalesce(p_pct, 0), coalesce(p_chosen, false))
  on conflict (user_id, learning_id) do update set
    state = coalesce(p_state, l.state),
    pct = coalesce(p_pct, l.pct),
    chosen = coalesce(p_chosen, l.chosen),
    updated_at = now();
$$;
revoke execute on function public.save_learning(text, text, smallint, boolean) from public, anon;
grant execute on function public.save_learning(text, text, smallint, boolean) to authenticated;

-- The owner's UPDATE no longer checks state here; the trigger decides what may change.
drop policy "learner_learnings: update" on public.learner_learnings;
create policy "learner_learnings: update" on public.learner_learnings for update to authenticated
  using (user_id = (select auth.uid()) or (select private.can_accept(user_id)))
  with check (user_id = (select auth.uid()) or ((select private.can_accept(user_id)) and state = 'accepted'));

drop policy "learner_learnings: owner removes" on public.learner_learnings;
create policy "learner_learnings: owner removes" on public.learner_learnings for delete to authenticated
  using (user_id = (select auth.uid()) and state <> 'accepted');

create or replace function private.guard_learning_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if (select auth.uid()) = old.user_id then
    -- the learner: anything except acceptance itself
    if (new.state = 'accepted') is distinct from (old.state = 'accepted') then
      raise exception 'Only your counsellor or an admin can accept a learning' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.state = 'submitted' and new.state = 'accepted'
     and new.pct = old.pct and new.chosen = old.chosen
     and new.user_id = old.user_id and new.learning_id = old.learning_id then
    return new;
  end if;
  raise exception 'Only a submitted learning can be accepted, and nothing else may change' using errcode = '42501';
end;
$$;

-- Prefs rows for everyone, now and for new accounts.
insert into public.learner_prefs (user_id) select id from public.profiles on conflict (user_id) do nothing;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email));
  insert into public.learner_prefs (user_id) values (new.id);
  if exists (select 1 from private.bootstrap_admins where email = lower(new.email))
     and not exists (select 1 from public.user_roles where role = 'system_admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'system_admin');
  end if;
  delete from private.bootstrap_admins where email = lower(new.email);
  return new;
end;
$$;

-- RLS also shows counsellees and your own counsellor; this narrows to people you may manage.
create function public.manageable_user_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id from public.profiles p where (select private.can_manage_user(p.id));
$$;
revoke execute on function public.manageable_user_ids() from public, anon;
grant execute on function public.manageable_user_ids() to authenticated;
