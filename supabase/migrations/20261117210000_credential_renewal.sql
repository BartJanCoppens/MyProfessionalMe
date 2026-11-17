-- Design v4 follow-up: renew a credential by submitting proof.
--
-- 1. credentials.renewal_of: a waiting row that renews this (confirmed) credential; superseded_at: when a confirmed
--    renewal replaced this row. A superseded credential is no longer held: the wallet hides it, and "earned" and the
--    exam-acceptance guard in decide_trajectory (20261117200000_trajectory_decisions.sql) ignore it. One waiting renewal
--    per credential (partial unique index). The learner's column grant on insert does not include either column.
-- 2. submit_renewal: from 30 days before a confirmed credential's expiry, and after it, the owner submits a link or a
--    certificate number (the credentials_proof rule, checked here with clear messages). A trajectory credential takes
--    no expiry: it is computed at confirmation from the trajectory's valid_months. An external credential needs the
--    new expiry date, after today. The renewal is a waiting row; the owner may remove it with the existing
--    "credentials: owner removes waiting" policy. The 30 days are RENEW_DAYS in src/logic/trajectoryLearner.ts
--    (trajectory.sync.test.ts).
-- 3. confirm_credential: unchanged for a new credential. For a renewal, in the same transaction: earned today, a
--    trajectory credential runs valid_months from today (null: does not expire), and the renewed row is stamped
--    superseded (refused when it already is).

alter table public.credentials
  add column renewal_of uuid references public.credentials (id) on delete set null,
  add column superseded_at timestamptz;
create index credentials_renewal_of_idx on public.credentials (renewal_of);
create unique index credentials_one_waiting_renewal on public.credentials (renewal_of) where status = 'waiting';

-- Returns 'waiting'. A second waiting renewal of the same credential is refused by the unique index (23505).
create function public.submit_renewal(p_credential uuid, p_link text default null, p_ref text default null, p_expires date default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.credentials;
  l text := nullif(btrim(coalesce(p_link, '')), '');
  rf text := nullif(btrim(coalesce(p_ref, '')), '');
begin
  select * into c from public.credentials where id = p_credential and user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'You can only renew your own credential' using errcode = '42501';
  end if;
  if c.status <> 'confirmed' or c.superseded_at is not null then
    raise exception 'Only a confirmed credential in your wallet can be renewed' using errcode = 'P0002';
  end if;
  if c.expires_on is null then
    raise exception 'This credential does not expire' using errcode = 'P0002';
  end if;
  if c.expires_on > current_date + 30 then
    raise exception 'Renewal opens 30 days before the expiry date' using errcode = 'P0002';
  end if;
  if l is null and rf is null then
    raise exception 'Add a link or the certificate number' using errcode = '22023';
  end if;
  if l is not null and (char_length(l) > 500 or l !~ '^https?://[^[:space:]]+$') then
    raise exception 'The link must start with http:// or https://' using errcode = '22023';
  end if;
  if char_length(rf) > 80 then
    raise exception 'The certificate number is too long' using errcode = '22023';
  end if;
  if c.trajectory_id is not null and p_expires is not null then
    raise exception 'The new expiry follows from the trajectory when it is confirmed' using errcode = '22023';
  end if;
  if c.trajectory_id is null and (p_expires is null or p_expires <= current_date) then
    raise exception 'Add the new expiry date, after today' using errcode = '22023';
  end if;
  insert into public.credentials (user_id, name, issuer, earned_on, expires_on, link, ref, trajectory_id, status, renewal_of)
  values (c.user_id, c.name, c.issuer, current_date, p_expires, l, rf, c.trajectory_id, 'waiting', c.id);
  return 'waiting';
end;
$$;
revoke execute on function public.submit_renewal(uuid, text, text, date) from public, anon;
grant execute on function public.submit_renewal(uuid, text, text, date) to authenticated;

-- Confirm an external credential a learner added, or a renewal (see 3. above).
create or replace function public.confirm_credential(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.credentials;
begin
  select * into c from public.credentials where id = p_id for update;
  if not found or not coalesce(private.can_accept(c.user_id), false) then
    raise exception 'Only their counsellor or an admin can confirm this credential' using errcode = '42501';
  end if;
  if c.status <> 'waiting' then
    raise exception 'This credential is already confirmed' using errcode = 'P0002';
  end if;
  if c.renewal_of is not null then
    update public.credentials set superseded_at = now() where id = c.renewal_of and superseded_at is null;
    if not found then
      raise exception 'The credential this renews was already replaced' using errcode = 'P0002';
    end if;
  end if;
  update public.credentials
    set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now(),
        earned_on = case when c.renewal_of is null then earned_on else current_date end,
        expires_on = case when c.renewal_of is null or c.trajectory_id is null then expires_on
                          else (select (current_date + make_interval(months => t.valid_months))::date
                                  from public.trajectories t where t.id = c.trajectory_id) end
    where id = p_id;
  return 'confirmed';
end;
$$;
