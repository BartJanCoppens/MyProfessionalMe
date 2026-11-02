-- Row-level security checks. Runs in one transaction and rolls back: supabase db query --linked -f supabase/tests/rls.sql
begin;
create temp table results (n serial, check_name text, expected text, actual text) on commit drop;
grant all on results to authenticated, anon; grant usage, select on sequence results_n_seq to authenticated, anon;
-- The live System Admin (looked up, not hard-coded) for the checks that need one.
select set_config('test.sa', (select user_id::text from public.user_roles where role = 'system_admin' order by created_at limit 1), true);
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','t.domainadmin@test.local'),
 ('00000000-0000-0000-0000-0000000000a2','t.consultant@test.local'),
 ('00000000-0000-0000-0000-0000000000a3','t.taxlegal@test.local');
update public.profiles set business_line='Consulting' where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');
update public.profiles set business_line='Tax & Legal' where id='00000000-0000-0000-0000-0000000000a3';
insert into public.user_roles (user_id, role, business_line) values ('00000000-0000-0000-0000-0000000000a1','domain_admin','Consulting');
-- a4: Consulting profile, but Domain Admin of Audit
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a4','t.auditadmin@test.local');
update public.profiles set business_line='Consulting' where id='00000000-0000-0000-0000-0000000000a4';
insert into public.user_roles (user_id, role, business_line) values ('00000000-0000-0000-0000-0000000000a4','domain_admin','Audit');
-- bootstrap must not grant System Admin while one exists
insert into private.bootstrap_admins (email) values ('t.bootstrap@test.local');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a5','t.bootstrap@test.local');
insert into results (check_name, expected, actual) select 'Bootstrap email when SA exists gets SA', '0', count(*)::text from public.user_roles where user_id='00000000-0000-0000-0000-0000000000a5';
insert into results (check_name, expected, actual) select 'Bootstrap row consumed', '0', count(*)::text from private.bootstrap_admins where email='t.bootstrap@test.local';
insert into results (check_name, expected, actual) select 'Bootstrap list empty after first SA', '0', count(*)::text from private.bootstrap_admins;

-- a6: plain user who is a2's counsellor
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a6','t.counsellor@test.local');
update public.profiles set business_line='Consulting', counsellor_id='00000000-0000-0000-0000-0000000000a6' where id='00000000-0000-0000-0000-0000000000a2';

-- Consulting domain admin
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'DA sees profiles (self+consultant)', '2', count(*)::text from public.profiles where id::text like '00000000-0000-0000-0000-0000000000a_';
insert into results (check_name, expected, actual) select 'DA cannot see system admin', '0', count(*)::text from public.profiles where email like 'bart.%';
insert into results (check_name, expected, actual) select 'DA cannot see Audit admin in Consulting', '0', count(*)::text from public.profiles where id='00000000-0000-0000-0000-0000000000a4';
with u as (update public.profiles set full_name='X' where id='00000000-0000-0000-0000-0000000000a4' returning 1) insert into results (check_name, expected, actual) select 'DA update Audit admin', '0 rows', count(*)||' rows' from u;
with u as (update public.profiles set full_name='X' where id='00000000-0000-0000-0000-0000000000a3' returning 1) insert into results (check_name, expected, actual) select 'DA update Tax&Legal user', '0 rows', count(*)||' rows' from u;
with u as (update public.profiles set full_name='Renamed' where id='00000000-0000-0000-0000-0000000000a2' returning 1) insert into results (check_name, expected, actual) select 'DA update own-line user', '1 rows', count(*)||' rows' from u;
do $$ begin
  begin update public.profiles set business_line='Audit' where id='00000000-0000-0000-0000-0000000000a2';
    insert into results (check_name, expected, actual) values ('DA move user to Audit', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA move user to Audit', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.user_roles (user_id, role, business_line) values ('00000000-0000-0000-0000-0000000000a2','domain_admin','Consulting');
    insert into results (check_name, expected, actual) values ('DA grants domain admin', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA grants domain admin', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.profiles set email='evil@x' where id='00000000-0000-0000-0000-0000000000a2';
    insert into results (check_name, expected, actual) values ('DA edits email column', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA edits email column', 'blocked', 'blocked: '||sqlstate); end;
end $$;

-- Plain consultant
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'User sees self and own counsellor', '2', count(*)::text from public.profiles;
insert into results (check_name, expected, actual) select 'User sees no roles', '0', count(*)::text from public.user_roles;
with u as (update public.profiles set full_name='Me' where id='00000000-0000-0000-0000-0000000000a2' returning 1) insert into results (check_name, expected, actual) select 'User updates own profile', '0 rows', count(*)||' rows' from u;

-- System admin
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'SA sees every test profile', '6', count(*)::text from public.profiles where id::text like '00000000-0000-0000-0000-0000000000a_';
with i as (insert into public.user_roles (user_id, role, business_line) values ('00000000-0000-0000-0000-0000000000a3','domain_admin','Tax & Legal') returning 1) insert into results (check_name, expected, actual) select 'SA grants Tax&Legal domain admin', '1 rows', count(*)||' rows' from i;
with u as (update public.profiles set career_stage='Director' where id='00000000-0000-0000-0000-0000000000a3' returning 1) insert into results (check_name, expected, actual) select 'SA sets stage Director', '1 rows', count(*)||' rows' from u;
with u as (update public.profiles set career_stage='Partner' where id='00000000-0000-0000-0000-0000000000a3' returning 1) insert into results (check_name, expected, actual) select 'SA sets stage Partner', '1 rows', count(*)||' rows' from u;
do $$ begin
  begin delete from public.user_roles where role='system_admin';
    insert into results (check_name, expected, actual) values ('Delete last system admin', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Delete last system admin', 'blocked', 'blocked: '||sqlerrm); end;
end $$;

-- Learner data: a2 owns it
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
with i as (insert into public.learner_learnings (user_id, learning_id, state, pct) values ('00000000-0000-0000-0000-0000000000a2','L1','in-progress',40) returning 1) insert into results (check_name, expected, actual) select 'Owner saves progress', '1 rows', count(*)||' rows' from i;
with i as (insert into public.ambitions (user_id, text, horizon, domains) values ('00000000-0000-0000-0000-0000000000a2','Lead a workstream','1 year','{lead}') returning 1) insert into results (check_name, expected, actual) select 'Owner saves ambition', '1 rows', count(*)||' rows' from i;
insert into public.learner_learnings (user_id, learning_id, state, pct) values ('00000000-0000-0000-0000-0000000000a2','L2','submitted',100);
do $$ begin
  begin update public.learner_learnings set state='accepted', pct=100 where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L1';
    insert into results (check_name, expected, actual) values ('Owner accepts own item', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Owner accepts own item', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.learner_learnings (user_id, learning_id, state, pct) values ('00000000-0000-0000-0000-0000000000a3','L1','in-progress',10);
    insert into results (check_name, expected, actual) values ('Owner writes someone else''s progress', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Owner writes someone else''s progress', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- Consulting domain admin views, cannot edit
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'DA reads managed user progress', '2', count(*)::text from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000a2';
do $$ begin
  begin update public.learner_learnings set pct=99 where user_id='00000000-0000-0000-0000-0000000000a2';
    insert into results (check_name, expected, actual) values ('DA edits managed user progress', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA edits managed user progress', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- Tax & Legal user sees nothing of a2
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'Other line reads ambitions', '0', count(*)::text from public.ambitions where user_id='00000000-0000-0000-0000-0000000000a2';
-- Counsellor reads and accepts
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'Counsellor reads counsellee profile', '1', count(*)::text from public.profiles where id='00000000-0000-0000-0000-0000000000a2';
insert into results (check_name, expected, actual) select 'Counsellor reads counsellee progress', '2', count(*)::text from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000a2';
with u as (update public.learner_learnings set state='accepted' where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L2' returning 1) insert into results (check_name, expected, actual) select 'Counsellor accepts submitted item', '1 rows', count(*)||' rows' from u;
do $$ begin
  begin update public.learner_learnings set state='accepted', pct=100 where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L1';
    insert into results (check_name, expected, actual) values ('Counsellor accepts item never submitted', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Counsellor accepts item never submitted', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.learner_learnings set chosen=true where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L2';
    if found then insert into results (check_name, expected, actual) values ('Counsellor changes chosen flag', 'blocked', 'allowed');
    else insert into results (check_name, expected, actual) values ('Counsellor changes chosen flag', 'blocked', 'blocked: no row'); end if;
  exception when others then insert into results (check_name, expected, actual) values ('Counsellor changes chosen flag', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- Atomic save through save_learning, and accepted items stay accepted (as owner a2; L2 was just accepted)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select public.save_learning('L5', p_chosen => true);
select public.save_learning('L5', p_state => 'in-progress', p_pct => 20::smallint);
insert into results (check_name, expected, actual) select 'save_learning merges into one row', '1 in-progress 20 true', count(*)||' '||max(state)||' '||max(pct)||' '||bool_and(chosen) from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L5';
select public.save_learning('L2', p_chosen => true);
insert into results (check_name, expected, actual) select 'Owner marks accepted item for path', 'accepted true', max(state)||' '||bool_and(chosen) from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L2';
do $$ begin
  begin perform public.save_learning('L6', p_state => 'accepted');
    insert into results (check_name, expected, actual) values ('Owner inserts accepted item', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Owner inserts accepted item', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L2', p_state => 'in-progress');
    insert into results (check_name, expected, actual) values ('Owner reopens accepted item', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Owner reopens accepted item', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with d as (delete from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L2' returning 1) insert into results (check_name, expected, actual) select 'Owner deletes accepted item', '0 rows', count(*)||' rows' from d;
-- a draft podcast (not visible to learners) cannot be completed by one
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.learnings (id, title, domain, level, format, hours, status) values ('L902','T draft podcast','prof',2,'Podcast',0.5,'draft');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$ begin
  begin perform public.save_learning('L902', p_state => 'accepted', p_pct => 100::smallint);
    insert into results (check_name, expected, actual) values ('Owner self-completes a draft podcast', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Owner self-completes a draft podcast', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- Podcasts and reels complete themselves (80% listened, or the reel's question answered); nothing else does
select public.save_learning('L44', p_state => 'accepted', p_pct => 100::smallint);
insert into results (check_name, expected, actual) select 'Owner completes a reel', 'accepted', coalesce(max(state), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L44';
select public.save_learning('L42', p_state => 'in-progress', p_pct => 40::smallint);
select public.save_learning('L42', p_state => 'accepted', p_pct => 100::smallint);
insert into results (check_name, expected, actual) select 'Owner completes a podcast', 'accepted', coalesce(max(state), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L42';
do $$ begin
  begin perform public.save_learning('L44', p_state => 'in-progress');
    insert into results (check_name, expected, actual) values ('Owner reopens completed reel', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Owner reopens completed reel', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.learner_learnings set learning_id = 'L3' where user_id = '00000000-0000-0000-0000-0000000000a2' and learning_id = 'L44';
    insert into results (check_name, expected, actual) values ('Owner moves a completed reel to another learning', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Owner moves a completed reel to another learning', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L3', p_state => 'accepted');
    insert into results (check_name, expected, actual) values ('Owner self-completes a classroom item', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Owner self-completes a classroom item', 'blocked', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'Every profile has prefs', '0', count(*)::text from public.profiles p where p.id = '00000000-0000-0000-0000-0000000000a2' and not exists (select 1 from public.learner_prefs x where x.user_id = p.id);
-- Who the Consulting Domain Admin may manage (User management list)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'DA manageable: consultant included', '1', count(*)::text from public.manageable_user_ids() m where m = '00000000-0000-0000-0000-0000000000a2';
insert into results (check_name, expected, actual) select 'DA manageable: other line, foreign admin, counsellor excluded', '0', count(*)::text from public.manageable_user_ids() m where m in ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a6');
-- Counsellor assignment rules (as the Consulting Domain Admin a1)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  begin update public.profiles set counsellor_id='00000000-0000-0000-0000-0000000000a3' where id='00000000-0000-0000-0000-0000000000a2';
    if found then insert into results (check_name, expected, actual) values ('DA assigns counsellor outside their line', 'blocked', 'allowed');
    else insert into results (check_name, expected, actual) values ('DA assigns counsellor outside their line', 'blocked', 'blocked: no row'); end if;
  exception when others then insert into results (check_name, expected, actual) values ('DA assigns counsellor outside their line', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.profiles set counsellor_id='00000000-0000-0000-0000-0000000000a2' where id='00000000-0000-0000-0000-0000000000a1';
    if found then insert into results (check_name, expected, actual) values ('DA sets own counsellor', 'blocked', 'allowed');
    else insert into results (check_name, expected, actual) values ('DA sets own counsellor', 'blocked', 'blocked: no row'); end if;
  exception when others then insert into results (check_name, expected, actual) values ('DA sets own counsellor', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with u as (update public.profiles set counsellor_id=null where id='00000000-0000-0000-0000-0000000000a2' returning 1) insert into results (check_name, expected, actual) select 'DA clears counsellor of managed user', '1 rows', count(*)||' rows' from u;

-- ---------- content: catalogue, curriculum mappings, knowledge bundles ----------
reset role;
-- a7: General Admin with a Consulting profile
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7','t.generaladmin@test.local');
update public.profiles set business_line='Consulting' where id='00000000-0000-0000-0000-0000000000a7';
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a7','general_admin');
set local role authenticated;

-- Consulting Domain Admin (a1)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
with i as (insert into public.learnings (title, domain, level, format, hours, business_line) values ('T consulting learning','prof',2,'E-learning',1,'Consulting') returning 1) insert into results (check_name, expected, actual) select 'DA adds own-line learning', '1 rows', count(*)||' rows' from i;
do $$ begin
  begin insert into public.learnings (title, domain, level, format, hours, business_line) values ('T audit learning','prof',2,'E-learning',1,'Audit');
    insert into results (check_name, expected, actual) values ('DA adds other-line learning', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA adds other-line learning', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.learnings (title, domain, level, format, hours) values ('T firm learning','prof',2,'E-learning',1);
    insert into results (check_name, expected, actual) values ('DA adds firm-wide learning', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA adds firm-wide learning', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.curriculum_mappings (audience, learning_id, stage, obligation) values ('Audit','L1','Analyst','advised');
    insert into results (check_name, expected, actual) values ('DA maps for another line', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA maps for another line', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.curriculum_mappings (audience, learning_id, stage, obligation) values ('ind:health','L1','Analyst','advised');
    insert into results (check_name, expected, actual) values ('DA maps for an industry audience', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA maps for an industry audience', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with u as (update public.learnings set title = title where id='L1' returning 1) insert into results (check_name, expected, actual) select 'DA edits firm-wide learning', '0 rows', count(*)||' rows' from u;
do $$ begin
  begin update public.learnings set created_by = '00000000-0000-0000-0000-0000000000a2' where business_line = 'Consulting';
    insert into results (check_name, expected, actual) values ('DA rewrites created_by', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA rewrites created_by', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.learnings set id = 'L777' where business_line = 'Consulting';
    insert into results (check_name, expected, actual) values ('DA renames a learning id', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA renames a learning id', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.learnings (id, title, domain, level, format, hours, business_line) values ('L150','T chosen id','prof',2,'E-learning',1,'Consulting');
    insert into results (check_name, expected, actual) values ('DA chooses a learning id', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA chooses a learning id', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with i as (insert into public.curriculum_mappings (audience, learning_id, stage, obligation) values ('Consulting','L5','Partner','advised') on conflict (audience, learning_id) do update set stage = excluded.stage returning 1) insert into results (check_name, expected, actual) select 'DA maps for own line (Partner stage)', '1 rows', count(*)||' rows' from i;
with u as (update public.knowledge_bundles set data = data where id='B1' returning 1) insert into results (check_name, expected, actual) select 'DA edits own-line bundle', '1 rows', count(*)||' rows' from u;
with u as (update public.knowledge_bundles set data = data where id='B2' returning 1) insert into results (check_name, expected, actual) select 'DA edits other-line bundle', '0 rows', count(*)||' rows' from u;
with u as (update public.knowledge_bundles set data = data where id='B4' returning 1) insert into results (check_name, expected, actual) select 'DA edits firm-wide bundle', '0 rows', count(*)||' rows' from u;
with u as (update public.knowledge_bundles set business_line = 'Consulting' where id='B2' returning 1) insert into results (check_name, expected, actual) select 'DA moves another line''s bundle to theirs', '0 rows', count(*)||' rows' from u;
insert into results (check_name, expected, actual) select 'DA manageable: General Admin excluded', '0', count(*)::text from public.manageable_user_ids() m where m = '00000000-0000-0000-0000-0000000000a7';

-- A Domain Admin cannot remove or draft their own learning while another line's audience still uses it
reset role;
insert into public.learnings (id, title, domain, level, format, hours, business_line) values ('L900','T shared learning','prof',2,'E-learning',1,'Consulting');
insert into public.curriculum_mappings (audience, learning_id, stage, obligation) values ('Audit','L900','Analyst','advised');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  begin delete from public.learnings where id = 'L900';
    insert into results (check_name, expected, actual) values ('DA removes own learning mapped for Audit', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA removes own learning mapped for Audit', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.learnings set status = 'draft' where id = 'L900';
    insert into results (check_name, expected, actual) values ('DA drafts own learning mapped for Audit', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA drafts own learning mapped for Audit', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with u as (update public.learnings set title = 'T shared learning, renamed' where id = 'L900' returning 1) insert into results (check_name, expected, actual) select 'DA still edits own shared learning', '1 rows', count(*)||' rows' from u;

-- Consultant without a role (a2)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'Learner sees published catalogue', '1', least(count(*), 1)::text from public.learnings where id='L1';
insert into results (check_name, expected, actual) select 'Learner sees no drafts', '0', count(*)::text from public.learnings where status = 'draft';
insert into results (check_name, expected, actual) select 'Learner sees no mapping to a draft', '0', count(*)::text from public.curriculum_mappings where learning_id = 'L22';
insert into results (check_name, expected, actual) select 'Learner reads mappings', '1', least(count(*), 1)::text from public.curriculum_mappings;
insert into results (check_name, expected, actual) select 'Learner outside T&L: no T&L bundle', '0', count(*)::text from public.knowledge_bundles where access = 'tl';
insert into results (check_name, expected, actual) select 'Learner: no admins-only bundle', '0', count(*)::text from public.knowledge_bundles where access = 'admins';
do $$ begin
  begin insert into public.learnings (title, domain, level, format, hours, business_line) values ('T learner learning','prof',2,'E-learning',1,'Consulting');
    insert into results (check_name, expected, actual) values ('Learner adds learning', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Learner adds learning', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.curriculum_mappings (audience, learning_id, stage, obligation) values ('Consulting','L6','Analyst','advised');
    insert into results (check_name, expected, actual) values ('Learner maps a learning', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Learner maps a learning', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with d as (delete from public.knowledge_bundles where id='B1' returning 1) insert into results (check_name, expected, actual) select 'Learner deletes bundle', '0 rows', count(*)||' rows' from d;

-- Tax & Legal learner (a3) reads the T&L bundle
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'T&L learner reads T&L bundle', '1', least(count(*), 1)::text from public.knowledge_bundles where access = 'tl';

-- General Admin (a7): every line and audience, all bundles, no users
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
with i as (insert into public.curriculum_mappings (audience, learning_id, stage, obligation) values ('Audit','L7','Analyst','mandatory'), ('Tax & Legal','L7','Analyst','mandatory'), ('ind:health','L7','Consultant','advised') on conflict (audience, learning_id) do update set obligation = excluded.obligation returning 1) insert into results (check_name, expected, actual) select 'GA maps for every line and audience', '3 rows', count(*)||' rows' from i;
with i as (insert into public.learnings (title, domain, level, format, hours, status) values ('T firm-wide draft','prof',2,'E-learning',1,'draft') returning 1) insert into results (check_name, expected, actual) select 'GA adds firm-wide learning', '1 rows', count(*)||' rows' from i;
with u as (update public.knowledge_bundles set data = data where id in ('B2','B4') returning 1) insert into results (check_name, expected, actual) select 'GA edits any bundle', '2 rows', count(*)||' rows' from u;
insert into results (check_name, expected, actual) select 'GA manages no users', '0', count(*)::text from public.manageable_user_ids();
do $$ begin
  begin insert into public.curriculum_mappings (audience, learning_id, stage, obligation) values ('amb:sust','L9','Analyst','mandatory');
    insert into results (check_name, expected, actual) values ('Mandatory for an ambition audience', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Mandatory for an ambition audience', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a2','general_admin');
    insert into results (check_name, expected, actual) values ('GA grants a role', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('GA grants a role', 'blocked', 'blocked: '||sqlstate); end;
end $$;

-- ---------- v0.4.1: Q1 review hidden, Q8 private ambitions, missing cases ----------
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.ambitions (user_id, text, domains) values ('00000000-0000-0000-0000-0000000000a2', 'T private ambition', '{lead}');
insert into public.interests (user_id, label, domain) values ('00000000-0000-0000-0000-0000000000a2', 'T private interest', 'lead');
insert into public.learner_learnings (user_id, learning_id, state, pct) values ('00000000-0000-0000-0000-0000000000a3', 'L3', 'in-progress', 10) on conflict do nothing;
update public.profiles set counsellor_id = '00000000-0000-0000-0000-0000000000a6' where id = '00000000-0000-0000-0000-0000000000a2';
insert into public.learnings (id, title, domain, level, format, hours, business_line) values ('L901','T shared review','prof',2,'E-learning',1,'Consulting');
insert into public.curriculum_mappings (audience, learning_id, stage, obligation) values ('Audit','L901','Analyst','advised');
set local role authenticated;
-- learner a2
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'Learner sees no review learnings', '0', count(*)::text from public.learnings where status = 'review';
insert into results (check_name, expected, actual) select 'Learner sees no mapping to a review learning', '0', count(*)::text from public.curriculum_mappings m where m.learning_id in ('L14','L19');
insert into results (check_name, expected, actual) select 'Owner reads own ambitions and interests', '2', ((select count(*) from public.ambitions where user_id = '00000000-0000-0000-0000-0000000000a2' and text = 'T private ambition') + (select count(*) from public.interests where user_id = '00000000-0000-0000-0000-0000000000a2' and label = 'T private interest'))::text;
do $$ begin
  begin insert into public.interests (user_id, label, domain) values ('00000000-0000-0000-0000-0000000000a3', 'T planted', 'lead');
    insert into results (check_name, expected, actual) values ('Member adds another person''s interest', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Member adds another person''s interest', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with u as (update public.learner_prefs set avatar_initials = 'XX' where user_id = '00000000-0000-0000-0000-0000000000a3' returning 1) insert into results (check_name, expected, actual) select 'Member edits another person''s avatar', '0 rows', count(*)||' rows' from u;
-- the System Admin cannot make someone their own counsellor (profiles_not_own_counsellor)
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
do $$ begin
  begin update public.profiles set counsellor_id = id where id = '00000000-0000-0000-0000-0000000000a2';
    insert into results (check_name, expected, actual) values ('Nobody is their own counsellor', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('Nobody is their own counsellor', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- counsellor a6 (counsellor of a2)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'Counsellor reads no counsellee ambitions', '0', count(*)::text from public.ambitions where user_id = '00000000-0000-0000-0000-0000000000a2';
insert into results (check_name, expected, actual) select 'Counsellor reads no counsellee interests', '0', count(*)::text from public.interests where user_id = '00000000-0000-0000-0000-0000000000a2';
insert into results (check_name, expected, actual) select 'Counsellor reads no non-counsellee progress', '0', count(*)::text from public.learner_learnings where user_id = '00000000-0000-0000-0000-0000000000a3';
-- Consulting Domain Admin a1
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'DA reads no managed user''s ambitions', '0', count(*)::text from public.ambitions where user_id = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  begin update public.learnings set status = 'review' where id = 'L901';
    insert into results (check_name, expected, actual) values ('DA hides own learning mapped for Audit (review)', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA hides own learning mapped for Audit (review)', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.knowledge_bundles (id, business_line, access, data) values ('BT1', 'Audit', 'admins', '{}'::jsonb);
    insert into results (check_name, expected, actual) values ('DA adds another line''s bundle', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('DA adds another line''s bundle', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with d as (delete from public.knowledge_bundles where id = 'B2' returning 1) insert into results (check_name, expected, actual) select 'DA deletes another line''s bundle', '0 rows', count(*)||' rows' from d;

-- ---------- Create & share (F12): creation rules, review requirements, routing, reviews, publication ----------
-- Real accounts exist in every line and routing picks at random among equals, so checks assert invariants and
-- impersonate whoever was assigned. Fixed: a2 (Consulting, counsellor a6) authors; a8 is a2's counsellee;
-- a9 has no business line (so no peers); a7 (General Admin) moves to Audit so it is never a Consulting peer.
reset role;
select set_config('request.jwt.claims', '', true);
-- Data carried over from the topic model (live project: one grant, one policy, one contribution in review)
insert into results (check_name, expected, actual) select 'CS migrated grant is a rule (format Micro-guide)', '1', least(count(*), 1)::text from public.creator_rules where formats = '{Micro-guide}' and cardinality(lines) + cardinality(domains) + cardinality(audiences) = 0;
insert into results (check_name, expected, actual) select 'CS migrated policy (Micro-guide: 1 peer, quality)', '1', least(count(*), 1)::text from public.review_policies where formats = '{Micro-guide}' and peers = 1 and not expert and quality;
insert into results (check_name, expected, actual) select 'CS contribution in review keeps its route', '1', least(count(*), 1)::text from public.contributions c
  where c.title = 'Three questions that expose scope creep' and c.status = 'review' and c.step = 3
    and exists (select 1 from public.contribution_reviews r where r.contribution_id = c.id and r.step = 3 and r.verdict = 'pending');
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a8','t.counsellee@test.local'),
 ('00000000-0000-0000-0000-0000000000a9','t.noline@test.local');
update public.profiles set business_line='Consulting', counsellor_id='00000000-0000-0000-0000-0000000000a2' where id='00000000-0000-0000-0000-0000000000a8';
update public.profiles set counsellor_id='00000000-0000-0000-0000-0000000000a6' where id='00000000-0000-0000-0000-0000000000a2';
update public.profiles set business_line='Audit' where id='00000000-0000-0000-0000-0000000000a7';
-- routing below depends only on the requirements these checks set, whatever the live project holds
delete from public.review_policies;
delete from public.domain_experts where domain = 'acad';
insert into results (check_name, expected, actual) select 'CS peer candidates exclude the author', '0', count(*)::text from private.peer_candidates('00000000-0000-0000-0000-0000000000a2') c where c = '00000000-0000-0000-0000-0000000000a2';
insert into results (check_name, expected, actual) select 'CS peer candidates exclude the author''s counsellor', '0', count(*)::text from private.peer_candidates('00000000-0000-0000-0000-0000000000a2') c where c = '00000000-0000-0000-0000-0000000000a6';
insert into results (check_name, expected, actual) select 'CS peer candidates exclude the author''s counsellee', '0', count(*)::text from private.peer_candidates('00000000-0000-0000-0000-0000000000a2') c where c = '00000000-0000-0000-0000-0000000000a8';
insert into results (check_name, expected, actual) select 'CS peer candidates include a line colleague', '1', count(*)::text from private.peer_candidates('00000000-0000-0000-0000-0000000000a2') c where c = '00000000-0000-0000-0000-0000000000a1';
insert into results (check_name, expected, actual) select 'CS blocked term is a whole word, any case', 'Delcroix|null', initcap(private.blocked_term('Notes from DELCROIX visit'))||'|'||coalesce(private.blocked_term('Delcroixville'), 'null');
insert into results (check_name, expected, actual) select 'CS blocked term survives punctuation and spacing', 'flemish care', private.blocked_term('Pilot at Flemish-Care,  then');
insert into results (check_name, expected, actual) select 'CS a contribution always has a line', 'NO', is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'contributions' and column_name = 'business_line';
-- the match: OR within a part, AND across filled parts, empty = any, audience optional
insert into results (check_name, expected, actual) select 'CS rule (Consulting or T&L) and Podcast', 'true,false,false,true',
  private.rule_matches('{Consulting,"Tax & Legal"}', '{Podcast}', '{}', '{}', 'Tax & Legal', 'Podcast', 'reg', null)||','||
  private.rule_matches('{Consulting,"Tax & Legal"}', '{Podcast}', '{}', '{}', 'Audit', 'Podcast', 'reg', null)||','||
  private.rule_matches('{Consulting,"Tax & Legal"}', '{Podcast}', '{}', '{}', 'Consulting', 'Reel', 'reg', null)||','||
  private.rule_matches('{Consulting,"Tax & Legal"}', '{Podcast}', '{}', '{}', 'Consulting', 'Podcast', 'tech', 'ind:energy');
insert into results (check_name, expected, actual) select 'CS rule audiences need the audience', 'false,true,false',
  private.rule_matches('{}', '{}', '{}', '{ind:energy}', 'Audit', 'Reel', 'tech', null)||','||
  private.rule_matches('{}', '{}', '{}', '{ind:energy}', 'Audit', 'Reel', 'tech', 'ind:energy')||','||
  private.rule_matches('{Consulting}', '{}', '{}', '{}', null, 'Reel', 'tech', null);
set local role authenticated;

-- Creation rules and review requirements. Consulting Domain Admin a1:
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
with i as (insert into public.creator_rules (user_id, lines) values ('00000000-0000-0000-0000-0000000000a2','{Consulting}') returning 1) insert into results (check_name, expected, actual) select 'CS DA grants a rule in own line to a managed user', '1 rows', count(*)||' rows' from i;
with i as (insert into public.review_policies (lines, formats, peers, expert, quality) values ('{Consulting}','{Reel}',2,true,true) returning 1) insert into results (check_name, expected, actual) select 'CS DA sets a requirement within own line', '1 rows', count(*)||' rows' from i;
do $$ begin
  begin insert into public.creator_rules (user_id, lines) values ('00000000-0000-0000-0000-0000000000a2','{Audit}');
    insert into results (check_name, expected, actual) values ('CS DA grants another line', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS DA grants another line', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.creator_rules (user_id, lines, formats) values ('00000000-0000-0000-0000-0000000000a2','{Consulting,Audit}','{Reel}');
    insert into results (check_name, expected, actual) values ('CS DA grants own and another line', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS DA grants own and another line', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.creator_rules (user_id, formats) values ('00000000-0000-0000-0000-0000000000a2','{Reel}');
    insert into results (check_name, expected, actual) values ('CS DA grants any line (empty lines part)', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS DA grants any line (empty lines part)', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.creator_rules (user_id, lines) values ('00000000-0000-0000-0000-0000000000a3','{Consulting}');
    insert into results (check_name, expected, actual) values ('CS DA grants an unmanaged user', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS DA grants an unmanaged user', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.review_policies (lines, peers) values ('{Audit}',0);
    insert into results (check_name, expected, actual) values ('CS DA sets another line''s requirement', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS DA sets another line''s requirement', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.review_policies (formats, peers) values ('{Reel}',0);
    insert into results (check_name, expected, actual) values ('CS DA sets a requirement for any line', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS DA sets a requirement for any line', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- General Admin a7: any rule to anyone; requirements for anything; no domain experts; never an empty rule
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
with i as (insert into public.creator_rules (user_id, lines, formats, domains, audiences) values
  ('00000000-0000-0000-0000-0000000000a2','{}','{Micro-guide}','{}','{}'),
  ('00000000-0000-0000-0000-0000000000a2','{}','{}','{acad}','{}'),
  ('00000000-0000-0000-0000-0000000000a2','{Consulting,"Tax & Legal"}','{Podcast}','{}','{}'),
  ('00000000-0000-0000-0000-0000000000a2','{}','{}','{}','{ind:energy}'),
  ('00000000-0000-0000-0000-0000000000a3','{}','{Case write-up}','{}','{}'),
  ('00000000-0000-0000-0000-0000000000a9','{}','{}','{tec}','{}') returning 1)
  insert into results (check_name, expected, actual) select 'CS GA grants any rule to anyone', '6 rows', count(*)||' rows' from i;
with i as (insert into public.review_policies (lines, formats, domains, peers, expert, quality) values
  ('{}','{Micro-guide}','{}',0,false,true), ('{}','{Case write-up}','{}',0,false,false), ('{}','{Podcast}','{}',1,false,false), ('{}','{}','{reg}',0,false,true) returning 1)
  insert into results (check_name, expected, actual) select 'CS GA sets requirements', '4 rows', count(*)||' rows' from i;
reset role;
insert into results (check_name, expected, actual) select 'CS strictest requirement wins', '1,false,true|2,true,true', (select f.peers||','||f.expert||','||f.quality from private.policy_for('Consulting', 'Podcast', 'reg', null) f)||'|'||(select f.peers||','||f.expert||','||f.quality from private.policy_for('Audit', 'Reel', 'tech', null) f);
set local role authenticated;
do $$ begin
  begin insert into public.creator_rules (user_id) values ('00000000-0000-0000-0000-0000000000a2');
    insert into results (check_name, expected, actual) values ('CS an empty rule', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS an empty rule', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.domain_experts (domain, user_id) values ('acad','00000000-0000-0000-0000-0000000000a7');
    insert into results (check_name, expected, actual) values ('CS GA names a domain expert', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS GA names a domain expert', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- Member a2: no granting, no requirements, no experts; drafts only where a rule matches
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'CS member reads own rules', '5', count(*)::text from public.creator_rules where user_id = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  begin insert into public.creator_rules (user_id, domains) values ('00000000-0000-0000-0000-0000000000a2','{tech}');
    insert into results (check_name, expected, actual) values ('CS member grants self', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS member grants self', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.review_policies (domains, peers) values ('{acad}',0);
    insert into results (check_name, expected, actual) values ('CS member sets a requirement', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS member sets a requirement', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.domain_experts (domain, user_id) values ('acad','00000000-0000-0000-0000-0000000000a2');
    insert into results (check_name, expected, actual) values ('CS member names a domain expert', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS member names a domain expert', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway) values ('Audit','Podcast','T no match','tech','x');
    insert into results (check_name, expected, actual) values ('CS draft that no rule matches', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS draft that no rule matches', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway) values ('Audit','Reel','T no audience','tech','x');
    insert into results (check_name, expected, actual) values ('CS an audience rule needs the audience', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS an audience rule needs the audience', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with i as (insert into public.contributions (business_line, audience, type, title, domain, takeaway) values ('Audit','ind:energy','Reel','T audience','tech','Grid tariffs reward a flat load.') returning 1)
  insert into results (check_name, expected, actual) select 'CS an audience rule matches with the audience', '1 rows', count(*)||' rows' from i;
-- no line given: the author's line
with i as (insert into public.contributions (type, title, domain, level, audience_stage, takeaway) values
  ('Reel','T full flow','acad',2,'Partner','One message per slide, stated as a full sentence.'),
  ('Micro-guide','T quality only','pers',1,'Analyst','Ask before you suggest.'),
  ('Reel','T client name','prof',3,'Manager','What we learned at Delcroix.'),
  ('Podcast','T strictest','reg',2,'Consultant','The four boxes that tell you who pays VAT.') returning 1)
  insert into results (check_name, expected, actual) select 'CS author drafts where a rule matches (Partner audience too)', '4 rows', count(*)||' rows' from i;
insert into public.contributions (business_line, type, title, domain, takeaway) values ('Audit','Case write-up','T revoked','acad','Hedge in steps.');
insert into results (check_name, expected, actual) select 'CS line defaults to the author''s', 'Consulting', business_line::text from public.contributions where title = 'T full flow';
insert into results (check_name, expected, actual) select 'CS author name is copied', '1', count(*)::text from public.contributions where title = 'T full flow' and author_name <> '';
insert into public.contributions (type, title, domain, takeaway, outline, sources) values
  ('Reel','T outline name','prof','Clean takeaway.','1. Open with the Brabant-office case', '{}'),
  ('Reel','T source name','prof','Clean takeaway.','', '{"Workshop notes · HOVERNA"}');
do $$ begin
  begin update public.contributions set business_line = 'Audit' where title = 'T client name';
    insert into results (check_name, expected, actual) values ('CS draft edited out of the rules', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS draft edited out of the rules', 'blocked', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'CS the refused edit left the line', 'Consulting', business_line::text from public.contributions where title = 'T client name';
with u as (update public.contributions set business_line = null where title = 'T client name' returning business_line) insert into results (check_name, expected, actual) select 'CS a line cannot be cleared (firm-wide)', 'Consulting', string_agg(business_line::text, ',') from u;
-- a3 (Tax & Legal) drafts too; a2 must not see it
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into public.contributions (type, title, domain, takeaway) values ('Case write-up','T zero steps','corp','Anonymise before you share.');
-- a9 (no business line) drafts for domain tec
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
do $$ begin
  begin insert into public.contributions (type, title, domain, takeaway) values ('Reel','T no line','tec','x');
    insert into results (check_name, expected, actual) values ('CS no line and none to default to', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS no line and none to default to', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
insert into public.contributions (business_line, type, title, domain, takeaway) values ('Audit','Reel','T no peers','tec','Pivot only what you need.');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'CS author cannot read another person''s draft', '0', count(*)::text from public.contributions where title like 'T %' and author_id <> '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  begin update public.contributions set status = 'published' where title = 'T full flow';
    insert into results (check_name, expected, actual) values ('CS author sets status directly', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS author sets status directly', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.submit_contribution((select id from public.contributions where title = 'T client name'));
    insert into results (check_name, expected, actual) values ('CS submit with a client name', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS submit with a client name', 'blocked', 'blocked: '||sqlerrm); end;
  begin perform public.submit_contribution((select id from public.contributions where title = 'T outline name'));
    insert into results (check_name, expected, actual) values ('CS submit with a client name in the outline', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS submit with a client name in the outline', 'blocked', 'blocked: '||sqlerrm); end;
  begin perform public.submit_contribution((select id from public.contributions where title = 'T source name'));
    insert into results (check_name, expected, actual) values ('CS submit with a client name in a source', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS submit with a client name in a source', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
-- the rule behind 'T revoked' (domain acad) is withdrawn by the General Admin; submitting is then refused
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
with d as (delete from public.creator_rules where user_id = '00000000-0000-0000-0000-0000000000a2' and domains = '{acad}' returning 1) insert into results (check_name, expected, actual) select 'CS GA revokes a rule', '1 rows', count(*)||' rows' from d;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
with d as (delete from public.creator_rules where user_id = '00000000-0000-0000-0000-0000000000a2' and formats = '{Podcast}' returning 1) insert into results (check_name, expected, actual) select 'CS DA cannot revoke a rule beyond own lines', '0 rows', count(*)||' rows' from d;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$ begin
  begin perform public.submit_contribution((select id from public.contributions where title = 'T revoked'));
    insert into results (check_name, expected, actual) values ('CS submit no rule matches any more', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS submit no rule matches any more', 'blocked', 'blocked: '||sqlerrm); end;
end $$;

-- Full flow (Consulting Reel: 2 peers, expert, quality & risk): routing
insert into results (check_name, expected, actual) select 'CS submit routes to peer review', 'review', public.submit_contribution((select id from public.contributions where title = 'T full flow'));
select set_config('test.c1', (select id::text from public.contributions where title = 'T full flow'), true);
insert into results (check_name, expected, actual) select 'CS author sees the whole route', '2/1/1', (select count(*) from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid and step = 1)||'/'||(select count(*) from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid and step = 2)||'/'||(select count(*) from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid and step = 3);
insert into results (check_name, expected, actual) select 'CS only the peers start', 'pending,pending,waiting,waiting', string_agg(verdict, ',' order by step, slot) from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid;
insert into results (check_name, expected, actual) select 'CS one step per reviewer', '4', count(distinct reviewer_id)::text from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid;
insert into results (check_name, expected, actual) select 'CS never the author, counsellor or counsellee as peer', '0', count(*)::text from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid and step = 1
  and reviewer_id in ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a6','00000000-0000-0000-0000-0000000000a8');
with u as (update public.contributions set title = 'T full flow edited' where id = current_setting('test.c1')::uuid returning 1) insert into results (check_name, expected, actual) select 'CS author edits while in review', '0 rows', count(*)||' rows' from u;
select set_config('test.p1', (select reviewer_id::text from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid and step = 1 and slot = 1), true);
select set_config('test.p2', (select reviewer_id::text from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid and step = 1 and slot = 2), true);
select set_config('test.ex', (select reviewer_id::text from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid and step = 2), true);
select set_config('test.qr', (select reviewer_id::text from public.contribution_reviews where contribution_id = current_setting('test.c1')::uuid and step = 3), true);
reset role;
insert into results (check_name, expected, actual) select 'CS no domain expert: a System Admin reviews', '1', count(*)::text from public.user_roles where user_id = current_setting('test.ex')::uuid and role = 'system_admin';
insert into results (check_name, expected, actual) select 'CS quality & risk by a General Admin', '1', count(*)::text from public.user_roles where user_id = current_setting('test.qr')::uuid and role = 'general_admin';
select set_config('test.px', coalesce((select r.reviewer_id::text from public.contribution_reviews r where r.contribution_id = current_setting('test.c1')::uuid and r.step = 1
  and not exists (select 1 from public.user_roles x where x.user_id = r.reviewer_id and x.role = 'system_admin') order by r.slot limit 1), current_setting('test.p1')), true);
do $$ begin
  begin insert into public.contribution_reviews (contribution_id, step, slot, reviewer_id) values (current_setting('test.c1')::uuid, 3, 2, current_setting('test.p1')::uuid);
    insert into results (check_name, expected, actual) values ('CS a second step for the same reviewer', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS a second step for the same reviewer', 'blocked', 'blocked: '||sqlstate); end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.px'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'CS a reviewer sees only assigned contributions', '1', count(*)::text from public.contributions where title like 'T %' and status <> 'published';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
do $$ begin
  begin update public.contribution_reviews set verdict = 'approved' where contribution_id = current_setting('test.c1')::uuid;
    insert into results (check_name, expected, actual) values ('CS unassigned user updates a review', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS unassigned user updates a review', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.review_contribution(current_setting('test.c1')::uuid, 'approved', '{t,t,t,t}', '');
    insert into results (check_name, expected, actual) values ('CS unassigned user approves', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS unassigned user approves', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
do $$ begin
  begin perform public.review_contribution(current_setting('test.c1')::uuid, 'approved', '{t,t,t,t}', '');
    insert into results (check_name, expected, actual) values ('CS a later step cannot approve early', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS a later step cannot approve early', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.p1'), 'role', 'authenticated')::text, true);
do $$ begin
  begin perform public.review_contribution(current_setting('test.c1')::uuid, 'approved', '{t,t,t,f}', '');
    insert into results (check_name, expected, actual) values ('CS approve with three of four rubric items', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS approve with three of four rubric items', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
insert into results (check_name, expected, actual) select 'CS first peer approves; still in peer review', 'review', public.review_contribution(current_setting('test.c1')::uuid, 'approved', '{t,t,t,t}', 'Clear.');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.p2'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'CS second peer approves; on to the expert', 'review', public.review_contribution(current_setting('test.c1')::uuid, 'approved', '{t,t,t,t}', '');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.ex'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'CS expert step is current', '2', step::text from public.contributions where id = current_setting('test.c1')::uuid;
insert into results (check_name, expected, actual) select 'CS expert approves; on to quality & risk', 'review', public.review_contribution(current_setting('test.c1')::uuid, 'approved', '{t,t,t,t}', '');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.qr'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'CS quality & risk approves; published', 'published', public.review_contribution(current_setting('test.c1')::uuid, 'approved', '{t,t,t,t}', '');
reset role;
insert into results (check_name, expected, actual) select 'CS publication creates the learning', '1', count(*)::text from public.contributions c join public.learnings l on l.id = c.learning_id
  where c.id = current_setting('test.c1')::uuid and c.status = 'published' and l.created_by = '00000000-0000-0000-0000-0000000000a2' and l.source = 'Peer contribution'
    and l.status = 'published' and l.format = 'Reel' and l.business_line = 'Consulting' and l.title = 'T full flow';
set local role authenticated;

-- Quality & risk only (Micro-guide): changes requested, attributes locked, edited, resubmitted, published
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select set_config('test.c2', (select id::text from public.contributions where title = 'T quality only'), true);
insert into results (check_name, expected, actual) select 'CS quality-only requirement skips peers and expert', 'review', public.submit_contribution(current_setting('test.c2')::uuid);
insert into results (check_name, expected, actual) select 'CS quality-only route', '3:pending', string_agg(step||':'||verdict, ',') from public.contribution_reviews where contribution_id = current_setting('test.c2')::uuid;
select set_config('test.q2', (select reviewer_id::text from public.contribution_reviews where contribution_id = current_setting('test.c2')::uuid), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.q2'), 'role', 'authenticated')::text, true);
do $$ begin
  begin perform public.review_contribution(current_setting('test.c2')::uuid, 'changes', '{}', '  ');
    insert into results (check_name, expected, actual) values ('CS request changes without a comment', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS request changes without a comment', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
insert into results (check_name, expected, actual) select 'CS reviewer requests changes', 'changes', public.review_contribution(current_setting('test.c2')::uuid, 'changes', '{}', 'Name the model you use.');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
with u as (update public.contributions set takeaway = 'Ask before you suggest, using the situation-behaviour-impact model.' where id = current_setting('test.c2')::uuid returning 1)
  insert into results (check_name, expected, actual) select 'CS author edits after changes requested', '1 rows', count(*)||' rows' from u;
do $$ begin
  begin update public.contributions set business_line = 'Tax & Legal' where id = current_setting('test.c2')::uuid;
    insert into results (check_name, expected, actual) values ('CS line is fixed after submission', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS line is fixed after submission', 'blocked', 'blocked: '||sqlerrm); end;
  begin update public.contributions set domain = 'acad' where id = current_setting('test.c2')::uuid;
    insert into results (check_name, expected, actual) values ('CS domain is fixed after submission', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS domain is fixed after submission', 'blocked', 'blocked: '||sqlerrm); end;
  begin update public.contributions set type = 'Podcast' where id = current_setting('test.c2')::uuid;
    insert into results (check_name, expected, actual) values ('CS format is fixed after submission', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS format is fixed after submission', 'blocked', 'blocked: '||sqlerrm); end;
  begin update public.contributions set audience = 'ind:energy' where id = current_setting('test.c2')::uuid;
    insert into results (check_name, expected, actual) values ('CS audience is fixed after submission', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS audience is fixed after submission', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
insert into results (check_name, expected, actual) select 'CS author reads the reviewer comment', 'Name the model you use.', comment from public.contribution_reviews where contribution_id = current_setting('test.c2')::uuid;
insert into results (check_name, expected, actual) select 'CS resubmit returns to the reviewers', 'review', public.submit_contribution(current_setting('test.c2')::uuid);
insert into results (check_name, expected, actual) select 'CS the reviewer is asked again', '3:pending', string_agg(step||':'||verdict, ',') from public.contribution_reviews where contribution_id = current_setting('test.c2')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.q2'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'CS quality-only approval publishes', 'published', public.review_contribution(current_setting('test.c2')::uuid, 'approved', '{t,t,t,t}', '');
reset role;
insert into results (check_name, expected, actual) select 'CS learning takes the contribution''s line', 'Micro-guide|Consulting', l.format||'|'||l.business_line from public.contributions c join public.learnings l on l.id = c.learning_id where c.id = current_setting('test.c2')::uuid;
set local role authenticated;

-- Strictest requirement (Podcast: 1 peer; Regulations: quality) → 1 peer then quality; changes at quality rerun everything
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select set_config('test.c3', (select id::text from public.contributions where title = 'T strictest'), true);
insert into results (check_name, expected, actual) select 'CS strictest requirement routes', 'review', public.submit_contribution(current_setting('test.c3')::uuid);
insert into results (check_name, expected, actual) select 'CS strictest route: 1 peer then quality', '1:pending,3:waiting', string_agg(step||':'||verdict, ',' order by step) from public.contribution_reviews where contribution_id = current_setting('test.c3')::uuid;
select set_config('test.p3', (select reviewer_id::text from public.contribution_reviews where contribution_id = current_setting('test.c3')::uuid and step = 1), true);
select set_config('test.q3', (select reviewer_id::text from public.contribution_reviews where contribution_id = current_setting('test.c3')::uuid and step = 3), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.p3'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'CS the peer approves', 'review', public.review_contribution(current_setting('test.c3')::uuid, 'approved', '{t,t,t,t}', '');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.q3'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'CS quality & risk asks for changes', 'changes', public.review_contribution(current_setting('test.c3')::uuid, 'changes', '{}', 'Cite the source.');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'CS resubmit after a later step', 'review', public.submit_contribution(current_setting('test.c3')::uuid);
insert into results (check_name, expected, actual) select 'CS the whole flow runs again', '1:pending,3:waiting|1', string_agg(step||':'||verdict, ',' order by step)||'|'||(select step from public.contributions where id = current_setting('test.c3')::uuid) from public.contribution_reviews where contribution_id = current_setting('test.c3')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.q3'), 'role', 'authenticated')::text, true);
do $$ begin
  begin perform public.review_contribution(current_setting('test.c3')::uuid, 'approved', '{t,t,t,t}', '');
    insert into results (check_name, expected, actual) values ('CS quality cannot approve before the peer re-approves', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS quality cannot approve before the peer re-approves', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
-- the author's rules are withdrawn while it is in review: the last approval cannot publish it
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.p3'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'CS the peer approves the new version', 'review', public.review_contribution(current_setting('test.c3')::uuid, 'approved', '{t,t,t,t}', '');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
delete from public.creator_rules where user_id = '00000000-0000-0000-0000-0000000000a2' and lines = '{Consulting}' and cardinality(formats) = 0;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
delete from public.creator_rules where user_id = '00000000-0000-0000-0000-0000000000a2' and formats = '{Podcast}';
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.q3'), 'role', 'authenticated')::text, true);
do $$ begin
  begin perform public.review_contribution(current_setting('test.c3')::uuid, 'approved', '{t,t,t,t}', '');
    insert into results (check_name, expected, actual) values ('CS publication re-checks the author''s rules', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS publication re-checks the author''s rules', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
insert into results (check_name, expected, actual) select 'CS nothing was published', 'review|0', c.status||'|'||(select count(*) from public.learnings l where l.title = 'T strictest') from public.contributions c where c.id = current_setting('test.c3')::uuid;
-- a published contribution is read through its learning, not by colleagues
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'CS colleagues do not read a published contribution', '0', count(*)::text from public.contributions where id = current_setting('test.c1')::uuid;
insert into results (check_name, expected, actual) select 'CS colleagues read its published learning', '1', count(*)::text from public.learnings where title = 'T full flow' and source = 'Peer contribution';

-- No review required: published on submit. No peers available: refused, still a draft.
insert into results (check_name, expected, actual) select 'CS requirement without reviews publishes on submit', 'published', public.submit_contribution((select id from public.contributions where title = 'T zero steps'));
insert into results (check_name, expected, actual) select 'CS zero-step learning exists', '1', count(*)::text from public.learnings l join public.contributions c on c.learning_id = l.id where c.title = 'T zero steps' and l.created_by = '00000000-0000-0000-0000-0000000000a3';
-- Nobody left in either line (the author has none; the content line Audit is emptied inside this rolled-back test)
reset role;
select set_config('request.jwt.claims', '', true);
update public.profiles set business_line = null where business_line = 'Audit';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
do $$ begin
  begin perform public.submit_contribution((select id from public.contributions where title = 'T no peers'));
    insert into results (check_name, expected, actual) values ('CS too few peers is refused', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS too few peers is refused', 'blocked', 'blocked: '||sqlerrm); end;
end $$;
insert into results (check_name, expected, actual) select 'CS too few peers keeps the draft', 'draft|0', c.status||'|'||(select count(*) from public.contribution_reviews r where r.contribution_id = c.id) from public.contributions c where c.title = 'T no peers';
insert into results (check_name, expected, actual) select 'CS peer count for someone without a line', '0', public.peer_count()::text;
-- leaving the audience out does not dodge an audience-scoped requirement
reset role;
insert into public.review_policies (lines, formats, audiences, peers, expert, quality) values ('{}','{}','{tec:sap}',1,false,true), ('{Audit}','{Reel}','{}',0,false,false);
insert into results (check_name, expected, actual) select 'CS audience-scoped requirement counts without an audience', '1,false,true|0,false,false',
  (select f.peers||','||f.expert||','||f.quality from private.policy_for('Audit', 'Reel', 'tech', null) f)||'|'||(select f.peers||','||f.expert||','||f.quality from private.policy_for('Audit', 'Reel', 'tech', 'ind:energy') f);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
with i as (insert into public.domain_experts (domain, user_id) values ('acad','00000000-0000-0000-0000-0000000000a1') returning 1) insert into results (check_name, expected, actual) select 'CS SA names a domain expert', '1 rows', count(*)||' rows' from i;

-- General Admin hands out creation rights, so may list people and their roles, but still manages nobody
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'GA lists people of every line', '1', least(count(*), 1)::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a3';
insert into results (check_name, expected, actual) select 'GA reads others'' roles', '1', least(count(*), 1)::text from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000a1';
with u as (update public.profiles set career_stage = 'Partner' where id = '00000000-0000-0000-0000-0000000000a3' returning 1) insert into results (check_name, expected, actual) select 'GA changes nobody''s profile', '0 rows', count(*)||' rows' from u;

-- Peer reviewers come from the author's line or the content's line (owner, 2 Nov 2026)
reset role;
select set_config('request.jwt.claims', '', true);
insert into results (check_name, expected, actual) select 'Peers include the content line', '1', count(*)::text from private.peer_candidates('00000000-0000-0000-0000-0000000000a2', 'Tax & Legal') x(id) where x.id = '00000000-0000-0000-0000-0000000000a3';
insert into results (check_name, expected, actual) select 'Peers include the author line', '1', count(*)::text from private.peer_candidates('00000000-0000-0000-0000-0000000000a2', 'Tax & Legal') x(id) where x.id = '00000000-0000-0000-0000-0000000000a4';
insert into results (check_name, expected, actual) select 'Peers never the author or their counsellor', '0', count(*)::text from private.peer_candidates('00000000-0000-0000-0000-0000000000a2', 'Tax & Legal') x(id) where x.id in ('00000000-0000-0000-0000-0000000000a2', (select counsellor_id from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'));

-- ---------- AI connections ----------
-- System Admin: adds connections, stores keys in Vault (only the last four characters are readable), assigns uses.
reset role; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
with i as (insert into public.ai_connections (name, provider, default_model, region) values ('T Anthropic', 'anthropic', 'claude-test', 'global') returning id)
  select set_config('test.ai1', (select id::text from i), true);
with i as (insert into public.ai_connections (name, provider) values ('T Voices', 'elevenlabs') returning id)
  select set_config('test.ai2', (select id::text from i), true);
insert into results (check_name, expected, actual) select 'AI SA adds connections', '2', count(*)::text from public.ai_connections where id in (current_setting('test.ai1')::uuid, current_setting('test.ai2')::uuid);
select public.ai_set_key(current_setting('test.ai1')::uuid, 'sk-test-first-1111');
select public.ai_set_key(current_setting('test.ai1')::uuid, 'sk-test-second-abcd');
select public.ai_set_key(current_setting('test.ai2')::uuid, 'el-test-key-9999');
insert into results (check_name, expected, actual) select 'AI SA sees only the key hint', 'abcd', key_hint from public.ai_connections where id = current_setting('test.ai1')::uuid;
with u as (update public.ai_uses set connection_id = current_setting('test.ai1')::uuid where key = 'profile_chat' returning 1) insert into results (check_name, expected, actual) select 'AI SA sets a use''s connection', '1 rows', count(*)||' rows' from u;
with u as (update public.ai_uses set connection_id = current_setting('test.ai2')::uuid, model = 'voice-1' where key = 'avatar_voice' returning 1) insert into results (check_name, expected, actual) select 'AI SA sets a voice connection on a voice use', '1 rows', count(*)||' rows' from u;
insert into results (check_name, expected, actual) select 'AI configured text use is live', 'true', ('profile_chat' = any(public.ai_live_uses()))::text;
insert into results (check_name, expected, actual) select 'AI waiting voice use is not live', 'false', ('avatar_voice' = any(public.ai_live_uses()))::text;
update public.ai_uses set enabled = false where key = 'profile_chat';
insert into results (check_name, expected, actual) select 'AI disabled use is not live', 'false', ('profile_chat' = any(public.ai_live_uses()))::text;
update public.ai_uses set enabled = true where key = 'profile_chat';
do $$ begin
  begin perform secret_id from public.ai_connections; insert into results (check_name, expected, actual) values ('AI SA reads the Vault reference', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI SA reads the Vault reference', 'blocked', 'blocked: '||sqlstate); end;
  begin perform count(*) from vault.decrypted_secrets; insert into results (check_name, expected, actual) values ('AI SA reads Vault', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI SA reads Vault', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.ai_connection_key(current_setting('test.ai1')::uuid); insert into results (check_name, expected, actual) values ('AI SA reads a key', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI SA reads a key', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.ai_connections set key_hint = 'zzzz' where id = current_setting('test.ai1')::uuid; insert into results (check_name, expected, actual) values ('AI SA writes the hint directly', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI SA writes the hint directly', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.ai_set_key(current_setting('test.ai1')::uuid, 'short'); insert into results (check_name, expected, actual) values ('AI SA stores a malformed key', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI SA stores a malformed key', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.ai_uses set connection_id = current_setting('test.ai1')::uuid where key = 'avatar_video'; insert into results (check_name, expected, actual) values ('AI text provider on an avatar use', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI text provider on an avatar use', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.ai_connections set provider = 'heygen' where id = current_setting('test.ai1')::uuid; insert into results (check_name, expected, actual) values ('AI connection in use switches to an unfit provider', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI connection in use switches to an unfit provider', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.ai_uses (key, label, description, place, kind) values ('t_new', 'x', 'x', 'x', 'text'); insert into results (check_name, expected, actual) values ('AI SA adds a use', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI SA adds a use', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- Domain Admin, General Admin and member: no connections, no uses, no keys; everyone signed in learns which uses are live.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'AI DA sees no connections', '0', count(*)::text from public.ai_connections;
insert into results (check_name, expected, actual) select 'AI DA sees no uses', '0', count(*)::text from public.ai_uses;
with u as (update public.ai_uses set enabled = false where key = 'profile_chat' returning 1) insert into results (check_name, expected, actual) select 'AI DA switches a use off', '0 rows', count(*)||' rows' from u;
with d as (delete from public.ai_connections returning 1) insert into results (check_name, expected, actual) select 'AI DA deletes a connection', '0 rows', count(*)||' rows' from d;
do $$ begin
  begin insert into public.ai_connections (name, provider) values ('Mine', 'anthropic'); insert into results (check_name, expected, actual) values ('AI DA adds a connection', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI DA adds a connection', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.ai_set_key(current_setting('test.ai1')::uuid, 'sk-hijack-0000'); insert into results (check_name, expected, actual) values ('AI DA sets a key', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI DA sets a key', 'blocked', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'AI GA sees no connections', '0', count(*)::text from public.ai_connections;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'AI member learns the live uses', 'true', ('profile_chat' = any(public.ai_live_uses()))::text;
do $$ begin
  begin perform public.ai_connection_key(current_setting('test.ai1')::uuid); insert into results (check_name, expected, actual) values ('AI member reads a key', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI member reads a key', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.ai_set_key(current_setting('test.ai1')::uuid, 'sk-hijack-0000'); insert into results (check_name, expected, actual) values ('AI member sets a key', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI member sets a key', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- The edge function (service_role) reads the current key; deleting the connection deletes its secret and frees its uses.
reset role; set local role service_role;
select set_config('test.aikey', public.ai_connection_key(current_setting('test.ai1')::uuid), true);
reset role;
insert into results (check_name, expected, actual) select 'AI service role reads the replaced key', 'sk-test-second-abcd', current_setting('test.aikey');
insert into results (check_name, expected, actual) select 'AI one secret per connection', '1', count(*)::text from vault.secrets where name = 'ai_connection_' || current_setting('test.ai1');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
with d as (delete from public.ai_connections where id = current_setting('test.ai1')::uuid returning 1) insert into results (check_name, expected, actual) select 'AI SA deletes a connection', '1 rows', count(*)||' rows' from d;
reset role;
insert into results (check_name, expected, actual) select 'AI deleting a connection deletes its key', '0', count(*)::text from vault.secrets where name = 'ai_connection_' || current_setting('test.ai1');
insert into results (check_name, expected, actual) select 'AI its uses lose the connection', 'null', coalesce(connection_id::text, 'null') from public.ai_uses where key = 'profile_chat';

-- anon
reset role; set local role anon;
do $$ begin
  begin perform count(*) from public.profiles; insert into results (check_name, expected, actual) values ('anon reads profiles', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon reads profiles', 'blocked', 'blocked: '||sqlstate); end;
  begin perform count(*) from public.learner_learnings; insert into results (check_name, expected, actual) values ('anon reads learner progress', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon reads learner progress', 'blocked', 'blocked: '||sqlstate); end;
  begin perform count(*) from public.learnings; insert into results (check_name, expected, actual) values ('anon reads the catalogue', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon reads the catalogue', 'blocked', 'blocked: '||sqlstate); end;
  begin perform count(*) from public.contributions; insert into results (check_name, expected, actual) values ('anon reads contributions', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon reads contributions', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.submit_contribution(gen_random_uuid()); insert into results (check_name, expected, actual) values ('anon submits a contribution', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon submits a contribution', 'blocked', 'blocked: '||sqlstate); end;
end $$;
reset role;
select check_name, expected, actual, case when actual like expected||'%' or (expected='blocked' and actual like 'blocked%') then 'PASS' else 'FAIL' end as result from results order by n;
rollback;
