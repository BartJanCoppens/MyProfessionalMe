-- Design v4, part B: certification trajectories. An ordered set of steps (learnings, electives, evidence, a counsellor
-- sign-off, an exam) that ends in a credential.
--
-- 1. public.trajectories: the catalogue. Content editors of the line write it (private.can_edit_content), as for
--    learnings. Only a System or General Admin may have a trajectory with a mandatory map live (owner decision D2); a
--    Domain Admin publishes advised ones of their own line. Learners read live ones, plus any they have a row for.
--    steps and maps are checked here for their outline only (ids, kinds, audiences, stages); the rest is checked in TS.
-- 2. public.trajectory_enrolments: one row per person and trajectory. Learners write it only through
--    request_trajectory, withdraw_trajectory and submit_trajectory_step: they may submit an evidence, check or exam
--    step, or book an exam, never mark one done. The counsellor or a managing admin (private.can_accept, as for
--    decide_learning) approves a start request and signs off steps through decide_trajectory. Someone in an
--    auto-enrol audience has no row until their first action (D6). Learning and elective steps are done when their
--    learning is accepted in learner_learnings; they are not stored here.
-- 3. public.credentials: the wallet. Accepting a trajectory's exam adds a confirmed credential in the same transaction
--    (D5). A learner adds an external credential as waiting, with a link or a certificate number; the counsellor or a
--    managing admin confirms it (confirm_credential). Credentials never count toward readiness.

-- ---------- outline checks ----------

-- maps: [[audience, stage, 'mandatory'|'advised'], ...]. Audiences as in curriculum_mappings; amb: and pro: only advise.
create function private.trajectory_maps_ok(maps jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(maps) <> 'array' then false else not exists (
    select 1 from jsonb_array_elements(maps) m
    where not coalesce(
      jsonb_typeof(m) = 'array' and jsonb_array_length(m) = 3
      and jsonb_typeof(m -> 0) = 'string' and jsonb_typeof(m -> 1) = 'string' and jsonb_typeof(m -> 2) = 'string'
      and ((m ->> 0) in ('Consulting', 'Audit', 'Tax & Legal') or (m ->> 0) ~ '^(ind|tec|amb|pro):[a-z]+$')
      and (m ->> 1) = any (enum_range(null::public.career_stage)::text[])
      and (m ->> 2) in ('mandatory', 'advised')
      and ((m ->> 2) = 'advised' or (m ->> 0) !~ '^(amb|pro):'),
      false)
  ) end;
$$;

-- steps: an array of objects, each with a unique string id and a known kind k.
create function private.trajectory_steps_ok(steps jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(steps) <> 'array' then false else
    not exists (
      select 1 from jsonb_array_elements(steps) s
      where not coalesce(
        jsonb_typeof(s) = 'object' and jsonb_typeof(s -> 'id') = 'string' and btrim(s ->> 'id') <> ''
        and (s ->> 'k') in ('learn', 'elect', 'evidence', 'check', 'exam'),
        false)
    )
    and (select count(distinct s ->> 'id') = count(*) from jsonb_array_elements(steps) s)
  end;
$$;

create function private.trajectory_has_mandatory(maps jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(maps) = 'array' and exists (select 1 from jsonb_array_elements(maps) m where m ->> 2 = 'mandatory');
$$;

-- Writing a trajectory: content editors of its line; a live one with a mandatory map only by a System or General Admin.
create function private.can_write_trajectory(line public.business_line, status text, maps jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_edit_content(line) and (
    status <> 'live' or not private.trajectory_has_mandatory(maps) or private.is_system_admin() or private.is_general_admin()
  );
$$;

-- Months are counted as year * 12 + month index (Sep 2026 = 2026 * 12 + 8), as in the design.
create function private.current_month()
returns int
language sql
stable
set search_path = ''
as $$
  select (extract(year from current_date)::int * 12) + extract(month from current_date)::int - 1;
$$;

revoke execute on function private.trajectory_maps_ok(jsonb), private.trajectory_steps_ok(jsonb), private.trajectory_has_mandatory(jsonb),
  private.can_write_trajectory(public.business_line, text, jsonb), private.current_month() from public, anon;
grant execute on function private.trajectory_maps_ok(jsonb), private.trajectory_steps_ok(jsonb), private.trajectory_has_mandatory(jsonb),
  private.can_write_trajectory(public.business_line, text, jsonb), private.current_month() to authenticated;

-- ---------- tables ----------

create sequence public.trajectories_seq start 100;
create table public.trajectories (
  id text primary key default ('T' || nextval('public.trajectories_seq')),
  name text not null check (char_length(name) between 1 and 160),
  issuer text not null default '' check (char_length(issuer) <= 120),
  credential text not null check (char_length(credential) between 1 and 160),
  enrol text not null default 'open' check (enrol in ('auto', 'open', 'approval')),
  months smallint not null check (months between 1 and 120),
  valid_months smallint check (valid_months between 1 and 240), -- null: does not expire
  renewal text not null default '' check (char_length(renewal) <= 500),
  cost text not null default '' check (char_length(cost) <= 500),
  status text not null default 'draft' check (status in ('draft', 'live', 'retired')),
  business_line public.business_line, -- null: firm-wide
  steps jsonb not null default '[]'::jsonb check (private.trajectory_steps_ok(steps)),
  maps jsonb not null default '[]'::jsonb check (private.trajectory_maps_ok(maps)),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create index trajectories_business_line_idx on public.trajectories (business_line);

create table public.trajectory_enrolments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- a trajectory with people on it is retired, not deleted
  trajectory_id text not null references public.trajectories (id),
  status text not null check (status in ('requested', 'enrolled')),
  start_month int not null,
  -- per step id: {state: 'submitted'|'booked'|'done', link?, ref?, note?}; written by the functions below only
  steps jsonb not null default '{}'::jsonb check (jsonb_typeof(steps) = 'object'),
  asked_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  primary key (user_id, trajectory_id)
);
create index trajectory_enrolments_trajectory_id_idx on public.trajectory_enrolments (trajectory_id);
create index trajectory_enrolments_decided_by_idx on public.trajectory_enrolments (decided_by);

create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  issuer text not null check (char_length(btrim(issuer)) between 1 and 120),
  earned_on date not null,
  expires_on date, -- null: does not expire
  link text check (char_length(link) <= 500 and link ~ '^https?://[^[:space:]]+$'),
  ref text check (btrim(ref) <> '' and char_length(ref) <= 80),
  trajectory_id text references public.trajectories (id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'confirmed')),
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  -- links only, never uploads (D5): a certificate link or number
  constraint credentials_proof check (link is not null or ref is not null)
);
create index credentials_user_id_idx on public.credentials (user_id);
create index credentials_trajectory_id_idx on public.credentials (trajectory_id);
create index credentials_confirmed_by_idx on public.credentials (confirmed_by);

-- updated_at, and published_at the first time a trajectory goes live
create function private.stamp_trajectory()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'live' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.stamp_trajectory() from public, anon, authenticated;
create trigger stamp_trajectory before insert or update on public.trajectories
  for each row execute function private.stamp_trajectory();

-- ---------- grants and policies ----------

alter table public.trajectories enable row level security;
alter table public.trajectory_enrolments enable row level security;
alter table public.credentials enable row level security;
revoke all on public.trajectories, public.trajectory_enrolments, public.credentials from anon, authenticated;
revoke all on sequence public.trajectories_seq from anon, authenticated;
grant select, insert, update, delete on public.trajectories to authenticated;
grant usage on sequence public.trajectories_seq to authenticated;
grant select on public.trajectory_enrolments to authenticated;
grant select on public.credentials to authenticated;
grant insert (user_id, name, issuer, earned_on, expires_on, link, ref) on public.credentials to authenticated;

-- Live ones for everyone; drafts and retired ones for the line's content editors and for whoever can read a row on it.
create policy "trajectories: read" on public.trajectories for select to authenticated
  using (
    status = 'live'
    or (select private.can_edit_content(business_line))
    or exists (select 1 from public.trajectory_enrolments e where e.trajectory_id = trajectories.id)
  );
create policy "trajectories: admins add" on public.trajectories for insert to authenticated
  with check ((select private.can_write_trajectory(business_line, status, maps)));
create policy "trajectories: admins edit" on public.trajectories for update to authenticated
  using ((select private.can_write_trajectory(business_line, status, maps)))
  with check ((select private.can_write_trajectory(business_line, status, maps)));
create policy "trajectories: admins remove" on public.trajectories for delete to authenticated
  using ((select private.can_write_trajectory(business_line, status, maps)));

-- The person, their counsellor, admins who manage them and General Admins (the formal track).
create policy "trajectory_enrolments: read" on public.trajectory_enrolments for select to authenticated
  using ((select private.can_view_track(user_id)));

create policy "credentials: read" on public.credentials for select to authenticated
  using ((select private.can_view_track(user_id)));
create policy "credentials: owner adds waiting" on public.credentials for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'waiting' and trajectory_id is null and confirmed_by is null);

-- ---------- the learner ----------

-- Start a live trajectory: enrolled for an open or auto-enrol one, a start request for one that needs approval.
-- Returns the row's status; asking again changes nothing.
create function public.request_trajectory(p_trajectory text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t public.trajectories;
  s text;
begin
  select * into t from public.trajectories where id = p_trajectory;
  if uid is null or not found or t.status <> 'live' then
    raise exception 'This trajectory cannot be started' using errcode = 'P0002';
  end if;
  s := case when t.enrol = 'approval' then 'requested' else 'enrolled' end;
  insert into public.trajectory_enrolments (user_id, trajectory_id, status, start_month, asked_at)
  values (uid, t.id, s, private.current_month(), case when s = 'requested' then now() end)
  on conflict (user_id, trajectory_id) do nothing;
  return (select status from public.trajectory_enrolments where user_id = uid and trajectory_id = t.id);
end;
$$;

-- Leave a trajectory, or take back a start request. Not an auto-enrol one: everyone in its audience follows it.
create function public.withdraw_trajectory(p_trajectory text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select enrol from public.trajectories where id = p_trajectory) = 'auto' then
    raise exception 'Everyone in its audience follows this trajectory' using errcode = '42501';
  end if;
  delete from public.trajectory_enrolments where user_id = (select auth.uid()) and trajectory_id = p_trajectory;
  if not found then
    raise exception 'You are not on this trajectory' using errcode = 'P0002';
  end if;
end;
$$;

-- Submit an evidence, check or exam step, or book the exam. An exam result needs a certificate link or number,
-- evidence a link or a note. Only the counsellor marks a step done (decide_trajectory). Returns the step's state.
create function public.submit_trajectory_step(p_trajectory text, p_step text, p_state text default 'submitted',
                                              p_link text default null, p_ref text default null, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t public.trajectories;
  r public.trajectory_enrolments;
  k text;
  l text := nullif(btrim(coalesce(p_link, '')), '');
  rf text := nullif(btrim(coalesce(p_ref, '')), '');
  n text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if coalesce(p_state, '') not in ('submitted', 'booked') then
    raise exception 'A step is submitted or booked; your counsellor marks it done' using errcode = '42501';
  end if;
  select * into t from public.trajectories where id = p_trajectory;
  k := (select s ->> 'k' from jsonb_array_elements(t.steps) s where s ->> 'id' = p_step);
  if uid is null or k is null then
    raise exception 'No such step' using errcode = 'P0002';
  end if;
  if k not in ('evidence', 'check', 'exam') then
    raise exception 'This step is done when its learning is accepted' using errcode = '22023';
  end if;
  if p_state = 'booked' and k <> 'exam' then
    raise exception 'Only an exam is booked' using errcode = '22023';
  end if;
  if l is not null and (char_length(l) > 500 or l !~ '^https?://[^[:space:]]+$') then
    raise exception 'The link must start with http:// or https://' using errcode = '22023';
  end if;
  if char_length(rf) > 80 or char_length(n) > 2000 then
    raise exception 'The certificate number or the note is too long' using errcode = '22023';
  end if;
  if p_state = 'submitted' and k = 'exam' and l is null and rf is null then
    raise exception 'Add the certificate link or number' using errcode = '22023';
  end if;
  if p_state = 'submitted' and k = 'evidence' and l is null and n is null then
    raise exception 'Add a link to the evidence or a note' using errcode = '22023';
  end if;
  select * into r from public.trajectory_enrolments where user_id = uid and trajectory_id = t.id for update;
  if not found then
    -- auto-enrol: the first action writes the row (D6)
    if t.enrol <> 'auto' or t.status <> 'live' then
      raise exception 'Start this trajectory first' using errcode = 'P0002';
    end if;
    insert into public.trajectory_enrolments (user_id, trajectory_id, status, start_month)
    values (uid, t.id, 'enrolled', private.current_month()) returning * into r;
  end if;
  if r.status <> 'enrolled' then
    raise exception 'Your counsellor has not approved the start yet' using errcode = '42501';
  end if;
  if r.steps -> p_step ->> 'state' = 'done' then
    raise exception 'This step is already signed off' using errcode = '42501';
  end if;
  update public.trajectory_enrolments
    set steps = steps || jsonb_build_object(p_step, jsonb_strip_nulls(jsonb_build_object('state', p_state, 'link', l, 'ref', rf, 'note', n)))
    where user_id = uid and trajectory_id = t.id;
  return p_state;
end;
$$;

-- ---------- the counsellor or a managing admin ----------

-- p_step null: approve a start request ('talk' leaves it waiting, stamped). A step: approve marks a submitted step
-- done ('talk' sends it back to the learner). Accepting the exam adds the confirmed credential (D5).
-- Returns the new status or state, or 'talk'.
create function public.decide_trajectory(p_user uuid, p_trajectory text, p_step text, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t public.trajectories;
  r public.trajectory_enrolments;
  k text;
begin
  if coalesce(p_decision, '') not in ('approve', 'talk') then
    raise exception 'A decision is approve or talk' using errcode = '22023';
  end if;
  if not coalesce(private.can_accept(p_user), false) then
    raise exception 'Only their counsellor or an admin can decide on this trajectory' using errcode = '42501';
  end if;
  select * into r from public.trajectory_enrolments where user_id = p_user and trajectory_id = p_trajectory for update;
  if not found then
    raise exception 'This person is not on this trajectory' using errcode = 'P0002';
  end if;
  if p_step is null then
    if r.status <> 'requested' then
      raise exception 'No start request is waiting' using errcode = 'P0002';
    end if;
    update public.trajectory_enrolments
      set status = case when p_decision = 'approve' then 'enrolled' else status end,
          start_month = case when p_decision = 'approve' then private.current_month() else start_month end,
          decided_by = uid, decided_at = now()
      where user_id = p_user and trajectory_id = p_trajectory;
    return case when p_decision = 'approve' then 'enrolled' else 'talk' end;
  end if;
  select * into t from public.trajectories where id = p_trajectory;
  k := (select s ->> 'k' from jsonb_array_elements(t.steps) s where s ->> 'id' = p_step);
  if r.status <> 'enrolled' or k is null or k not in ('evidence', 'check', 'exam')
     or (r.steps -> p_step ->> 'state') is distinct from 'submitted' then
    raise exception 'This step is not waiting for a decision' using errcode = 'P0002';
  end if;
  if p_decision = 'talk' then
    update public.trajectory_enrolments set steps = steps - p_step, decided_by = uid, decided_at = now()
      where user_id = p_user and trajectory_id = p_trajectory;
    return 'talk';
  end if;
  update public.trajectory_enrolments
    set steps = jsonb_set(steps, array[p_step, 'state'], '"done"'::jsonb), decided_by = uid, decided_at = now()
    where user_id = p_user and trajectory_id = p_trajectory;
  if k = 'exam' then
    insert into public.credentials (user_id, name, issuer, earned_on, expires_on, link, ref, trajectory_id, status, confirmed_by, confirmed_at)
    values (p_user, t.credential, coalesce(nullif(t.issuer, ''), t.name), current_date,
            case when t.valid_months is not null then (current_date + make_interval(months => t.valid_months))::date end,
            r.steps -> p_step ->> 'link', r.steps -> p_step ->> 'ref', t.id, 'confirmed', uid, now());
  end if;
  return 'done';
end;
$$;

-- Confirm an external credential a learner added.
create function public.confirm_credential(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  credential_owner uuid := (select user_id from public.credentials where id = p_id);
begin
  if credential_owner is null or not coalesce(private.can_accept(credential_owner), false) then
    raise exception 'Only their counsellor or an admin can confirm this credential' using errcode = '42501';
  end if;
  update public.credentials set status = 'confirmed', confirmed_by = (select auth.uid()), confirmed_at = now()
    where id = p_id and status = 'waiting';
  if not found then
    raise exception 'This credential is already confirmed' using errcode = 'P0002';
  end if;
  return 'confirmed';
end;
$$;

revoke execute on function public.request_trajectory(text), public.withdraw_trajectory(text),
  public.submit_trajectory_step(text, text, text, text, text, text), public.decide_trajectory(uuid, text, text, text),
  public.confirm_credential(uuid) from public, anon;
grant execute on function public.request_trajectory(text), public.withdraw_trajectory(text),
  public.submit_trajectory_step(text, text, text, text, text, text), public.decide_trajectory(uuid, text, text, text),
  public.confirm_credential(uuid) to authenticated;

-- ---------- seeds: the design's three trajectories ----------
-- Step ids s1…; a step's prerequisite (pre) is the id of the step it waits for. T1 is mandatory for Tax & Legal
-- consultants, so it belongs to that line; T2 (tec:data) and T3 (amb:sust, advised) are firm-wide.

insert into public.trajectories (id, name, issuer, credential, enrol, months, valid_months, renewal, cost, status, business_line, steps, maps) values
  ('T1', 'ITAA accreditation', 'ITAA', 'Certified tax adviser (ITAA)', 'auto', 36, 12,
   'Yearly permanent education, logged as ITAA units', 'Firm pays the exam fee; study leave for the exam days', 'live', 'Tax & Legal',
   '[{"id":"s1","k":"learn","lid":"L16","win":3,"req":true,"pre":null},
     {"id":"s2","k":"learn","lid":"L5","win":6,"req":true,"pre":null},
     {"id":"s3","k":"learn","lid":"L31","win":6,"req":true,"pre":null},
     {"id":"s4","k":"elect","opts":["L18","L19","L12"],"pick":1,"win":18,"req":true,"pre":null},
     {"id":"s5","k":"learn","lid":"L60","win":12,"req":false,"pre":null},
     {"id":"s6","k":"evidence","title":"Traineeship log signed by your traineeship supervisor","hours":0,"win":30,"req":true,"pre":null},
     {"id":"s7","k":"check","title":"Counsellor reviews the traineeship log","hours":0,"win":32,"req":true,"pre":"s6"},
     {"id":"s8","k":"learn","lid":"L62","win":34,"req":false,"pre":null},
     {"id":"s9","k":"exam","title":"ITAA aptitude exam","hours":4,"win":36,"req":true,"pre":"s7"}]',
   '[["Tax & Legal","Consultant","mandatory"]]'),
  ('T2', 'Azure data engineer', 'Microsoft', 'Microsoft Certified: Fabric Data Engineer Associate', 'approval', 9, 12,
   'Free online renewal assessment on Microsoft Learn', 'Exam voucher paid by the firm after counsellor approval', 'live', null,
   '[{"id":"s1","k":"learn","lid":"L23","win":2,"req":true,"pre":null},
     {"id":"s2","k":"learn","lid":"L25","win":2,"req":true,"pre":null},
     {"id":"s3","k":"learn","lid":"L26","win":5,"req":true,"pre":"s1"},
     {"id":"s4","k":"elect","opts":["L35","L24"],"pick":1,"win":6,"req":false,"pre":null},
     {"id":"s5","k":"learn","lid":"L63","win":4,"req":false,"pre":null},
     {"id":"s6","k":"learn","lid":"L61","win":7,"req":false,"pre":"s3"},
     {"id":"s7","k":"check","title":"Counsellor approves the exam voucher","hours":0,"win":7,"req":true,"pre":"s3"},
     {"id":"s8","k":"exam","title":"Exam DP-700","hours":3,"win":9,"req":true,"pre":"s7"}]',
   '[["tec:data","Consultant","advised"]]'),
  ('T3', 'CSRD certified practitioner', 'Internal academy', 'CSRD practitioner · internal academy', 'open', 12, 24,
   'Refresher module when the ESRS change', 'Internal; no fee', 'live', null,
   '[{"id":"s1","k":"learn","lid":"L34","win":4,"req":false,"pre":null},
     {"id":"s2","k":"learn","lid":"L18","win":6,"req":true,"pre":null},
     {"id":"s3","k":"learn","lid":"L35","win":8,"req":true,"pre":null},
     {"id":"s4","k":"evidence","title":"One double-materiality assessment on a client engagement","hours":0,"win":11,"req":true,"pre":"s2"},
     {"id":"s5","k":"check","title":"Counsellor signs off the case","hours":0,"win":11,"req":true,"pre":"s4"},
     {"id":"s6","k":"exam","title":"Case-based assessment with a CSRD panel","hours":2,"win":12,"req":true,"pre":"s5"}]',
   '[["amb:sust","Senior consultant","advised"]]');
