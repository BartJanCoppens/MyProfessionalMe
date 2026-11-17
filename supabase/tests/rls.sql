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
with i as (insert into public.learner_learnings (user_id, learning_id, state, pct) values ('00000000-0000-0000-0000-0000000000a2','L3','in-progress',40) returning 1) insert into results (check_name, expected, actual) select 'Owner saves progress', '1 rows', count(*)||' rows' from i;
with i as (insert into public.ambitions (user_id, text, horizon, domains) values ('00000000-0000-0000-0000-0000000000a2','Lead a workstream','1 year','{lead}') returning 1) insert into results (check_name, expected, actual) select 'Owner saves ambition', '1 rows', count(*)||' rows' from i;
insert into public.learner_learnings (user_id, learning_id, state, pct) values ('00000000-0000-0000-0000-0000000000a2','L2','submitted',100);
do $$ begin
  begin update public.learner_learnings set state='accepted', pct=100 where user_id='00000000-0000-0000-0000-0000000000a2' and learning_id='L3';
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
    if found then insert into results (check_name, expected, actual) values ('DA edits managed user progress', 'blocked', 'allowed');
    else insert into results (check_name, expected, actual) values ('DA edits managed user progress', 'blocked', 'blocked: no row'); end if;
  exception when others then insert into results (check_name, expected, actual) values ('DA edits managed user progress', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- Tax & Legal user sees nothing of a2
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'Other line reads ambitions', '0', count(*)::text from public.ambitions where user_id='00000000-0000-0000-0000-0000000000a2';
-- Counsellor reads and accepts
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'Counsellor reads counsellee profile', '1', count(*)::text from public.profiles where id='00000000-0000-0000-0000-0000000000a2';
insert into results (check_name, expected, actual) select 'Counsellor reads counsellee progress', '2', count(*)::text from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000a2';
-- decisions go through decide_learning (v0.7.0)
insert into results (check_name, expected, actual) select 'Counsellor accepts submitted item', 'accepted', public.decide_learning('00000000-0000-0000-0000-0000000000a2', 'L2', 'accepted');
do $$ begin
  begin perform public.decide_learning('00000000-0000-0000-0000-0000000000a2', 'L3', 'accepted');
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
with i as (insert into public.domain_experts (domain, user_id) values ('acad','00000000-0000-0000-0000-0000000000a3') returning 1) insert into results (check_name, expected, actual) select 'CS SA names a second expert for the same domain', '1 rows', count(*)||' rows' from i;
do $$ begin
  begin insert into public.domain_experts (domain, user_id) values ('acad','00000000-0000-0000-0000-0000000000a1');
    insert into results (check_name, expected, actual) values ('CS same expert twice for a domain', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CS same expert twice for a domain', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with d as (delete from public.domain_experts where domain = 'acad' and user_id = '00000000-0000-0000-0000-0000000000a3' returning 1) insert into results (check_name, expected, actual) select 'CS SA removes one expert of a domain', '1 rows', count(*)||' rows' from d;
insert into results (check_name, expected, actual) select 'CS the other expert stays', '1', count(*)::text from public.domain_experts where domain = 'acad';
insert into public.domain_experts (domain, user_id) values ('acad','00000000-0000-0000-0000-0000000000a3');
reset role;
delete from public.domain_experts where domain = 'corp';
insert into results (check_name, expected, actual) select 'CS expert review skips an author who is an expert', '00000000-0000-0000-0000-0000000000a3', private.pick_expert('acad', '00000000-0000-0000-0000-0000000000a1', null)::text;
insert into results (check_name, expected, actual) select 'CS expert review goes to one of the experts', '1', count(*)::text from public.domain_experts where domain = 'acad' and user_id = (select private.pick_expert('acad', '00000000-0000-0000-0000-0000000000a2', null));
insert into results (check_name, expected, actual) select 'CS no expert named for a domain', 'null', coalesce(private.pick_expert('corp', '00000000-0000-0000-0000-0000000000a2', null)::text, 'null');

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

-- ---------- v0.7.0: learning record and approvals ----------
-- b1: Consulting learner with counsellor a6; b2: Consulting learner without a counsellor; b3: Tax & Legal learner without
-- a counsellor. a1 is the Consulting Domain Admin, a7 a General Admin (now in Audit), a2 a plain Consulting member.
-- L18 is a Certification, L3 a Book, L4 and L10 Classroom, L45 a Reel.
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000b1','t.recordlearner@test.local'),
 ('00000000-0000-0000-0000-0000000000b2','t.nocounsellor@test.local'),
 ('00000000-0000-0000-0000-0000000000b3','t.taxlearner@test.local');
update public.profiles set business_line='Consulting', full_name='T Record Learner', counsellor_id='00000000-0000-0000-0000-0000000000a6' where id='00000000-0000-0000-0000-0000000000b1';
update public.profiles set business_line='Consulting', counsellor_id=null where id='00000000-0000-0000-0000-0000000000b2';
update public.profiles set business_line='Tax & Legal', counsellor_id=null where id='00000000-0000-0000-0000-0000000000b3';
update public.profiles set full_name='T Counsellor' where id='00000000-0000-0000-0000-0000000000a6';
insert into public.ambitions (user_id, text, domains) values ('00000000-0000-0000-0000-0000000000b1', 'T record ambition', '{lead}');
set local role authenticated;
-- learner b1: evidence per format
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$ begin
  begin perform public.save_learning('L18', p_state => 'submitted', p_pct => 100::smallint);
    insert into results (check_name, expected, actual) values ('LR certification submitted without evidence', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR certification submitted without evidence', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L3', p_state => 'submitted', p_pct => 100::smallint, p_note => 'Short note.');
    insert into results (check_name, expected, actual) values ('LR book submitted with a reflection under 140 characters', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR book submitted with a reflection under 140 characters', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L18', p_link => 'not a link');
    insert into results (check_name, expected, actual) values ('LR evidence link must be a web address', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR evidence link must be a web address', 'blocked', 'blocked: '||sqlstate); end;
end $$;
select public.save_learning('L18', p_state => 'submitted', p_pct => 100::smallint, p_link => 'https://sharepoint.example/certificates/az900.pdf');
insert into results (check_name, expected, actual) select 'LR certification submits with a certificate link', 'submitted true', max(state)||' '||bool_and(submitted_at is not null) from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L18';
select public.save_learning('L3', p_state => 'in-progress', p_pct => 50::smallint);
select public.save_learning('L3', p_state => 'submitted', p_pct => 100::smallint, p_note => rpad('What I took from it: start with the answer, then the three reasons, then the evidence behind each.', 150, ' Next.'));
insert into results (check_name, expected, actual) select 'LR book submits with a reflection', 'submitted', coalesce(max(state), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L3';
select public.save_learning('L4', p_state => 'submitted', p_pct => 100::smallint);
insert into results (check_name, expected, actual) select 'LR classroom submits without evidence', 'submitted', coalesce(max(state), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L4';
select public.save_learning('L10', p_state => 'submitted', p_pct => 100::smallint);
do $$ begin
  begin perform public.save_learning('L18', p_link => '');
    insert into results (check_name, expected, actual) values ('LR submission loses its required evidence', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR submission loses its required evidence', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.learning_decisions (user_id, learning_id, verdict) values ('00000000-0000-0000-0000-0000000000b1', 'L4', 'accepted');
    insert into results (check_name, expected, actual) values ('LR learner writes a decision', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR learner writes a decision', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.decide_learning('00000000-0000-0000-0000-0000000000b1', 'L4', 'accepted');
    insert into results (check_name, expected, actual) values ('LR learner accepts own submission', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR learner accepts own submission', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.learner_learnings set submitted_at = now() - interval '30 days' where user_id = '00000000-0000-0000-0000-0000000000b1' and learning_id = 'L4';
    insert into results (check_name, expected, actual) values ('LR learner backdates a submission', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR learner backdates a submission', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- counsellor a6: reads the evidence, finds the queue, requests changes, accepts
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'LR counsellor reads the evidence', 'https://sharepoint.example/certificates/az900.pdf', coalesce(max(evidence_link), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L18';
insert into results (check_name, expected, actual) select 'LR queue lists the counsellee''s submissions', 'L10,L18,L3,L4', string_agg(learning_id, ',' order by learning_id) from public.waiting_submissions() where user_id='00000000-0000-0000-0000-0000000000b1';
insert into results (check_name, expected, actual) select 'LR queue names the person and their last activity', 'T Record Learner true', max(name)||' '||bool_and(last_activity is not null) from public.waiting_submissions() where user_id='00000000-0000-0000-0000-0000000000b1';
do $$ begin
  begin perform public.decide_learning('00000000-0000-0000-0000-0000000000b1', 'L3', 'changes', 'Too short');
    insert into results (check_name, expected, actual) values ('LR changes without a real comment', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR changes without a real comment', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.decide_learning('00000000-0000-0000-0000-0000000000b1', 'L3', 'rejected', 'Not a verdict we know');
    insert into results (check_name, expected, actual) values ('LR unknown verdict', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR unknown verdict', 'blocked', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'LR counsellor requests changes', 'in-progress', public.decide_learning('00000000-0000-0000-0000-0000000000b1', 'L3', 'changes', 'Name one idea you will apply on your next engagement.');
insert into results (check_name, expected, actual) select 'LR changes keep hours and evidence', '100 true', max(pct)||' '||bool_and(evidence_note is not null) from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L3';
insert into results (check_name, expected, actual) select 'LR counsellor accepts with a comment', 'accepted', public.decide_learning('00000000-0000-0000-0000-0000000000b1', 'L18', 'accepted', 'Certificate checked.');
insert into results (check_name, expected, actual) select 'LR acceptance record: who, verdict, comment, evidence', 'accepted|00000000-0000-0000-0000-0000000000a6|T Counsellor|Certificate checked.|https://sharepoint.example/certificates/az900.pdf',
  string_agg(verdict||'|'||decided_by||'|'||decided_by_name||'|'||comment||'|'||(evidence->>'link'), ';') from public.learning_decisions where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L18';
do $$ begin
  begin perform public.decide_learning('00000000-0000-0000-0000-0000000000b1', 'L18', 'accepted');
    insert into results (check_name, expected, actual) values ('LR second decision on the same submission', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR second decision on the same submission', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.learner_learnings set state = 'accepted' where user_id = '00000000-0000-0000-0000-0000000000b1' and learning_id = 'L4';
    if found then insert into results (check_name, expected, actual) values ('LR counsellor accepts by a direct update', 'blocked', 'allowed');
    else insert into results (check_name, expected, actual) values ('LR counsellor accepts by a direct update', 'blocked', 'blocked: no row'); end if;
  exception when others then insert into results (check_name, expected, actual) values ('LR counsellor accepts by a direct update', 'blocked', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'LR queue drops decided submissions', 'L10,L4', string_agg(learning_id, ',' order by learning_id) from public.waiting_submissions() where user_id='00000000-0000-0000-0000-0000000000b1';
insert into results (check_name, expected, actual) select 'LR counsellor still reads no ambitions', '0', count(*)::text from public.ambitions where user_id='00000000-0000-0000-0000-0000000000b1';
-- learner b1: sees the feedback, resubmits; accepted evidence stays; a reel completing itself is recorded
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'LR learner reads the requested changes', 'changes|T Counsellor|Name one idea you will apply on your next engagement.', string_agg(verdict||'|'||decided_by_name||'|'||comment, ';') from public.learning_decisions where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L3';
select public.save_learning('L3', p_state => 'submitted');
insert into results (check_name, expected, actual) select 'LR learner resubmits after changes', 'submitted', coalesce(max(state), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L3';
do $$ begin
  begin perform public.save_learning('L18', p_link => 'https://sharepoint.example/certificates/other.pdf');
    insert into results (check_name, expected, actual) values ('LR learner changes accepted evidence', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR learner changes accepted evidence', 'blocked', 'blocked: '||sqlstate); end;
end $$;
select public.save_learning('L18', p_chosen => true);
insert into results (check_name, expected, actual) select 'LR learner still marks an accepted learning for the path', 'accepted true', max(state)||' '||bool_and(chosen) from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L18';
select public.save_learning('L45', p_state => 'accepted', p_pct => 100::smallint);
insert into results (check_name, expected, actual) select 'LR reel completing itself is recorded', 'self_completed|00000000-0000-0000-0000-0000000000b1', string_agg(verdict||'|'||decided_by, ';') from public.learning_decisions where user_id='00000000-0000-0000-0000-0000000000b1' and learning_id='L45';
-- learner b2 (no counsellor) and b3 (Tax & Legal, no counsellor) submit
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select public.save_learning('L4', p_state => 'submitted', p_pct => 100::smallint);
select public.save_learning('L10', p_state => 'submitted', p_pct => 100::smallint);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
select public.save_learning('L4', p_state => 'submitted', p_pct => 100::smallint);
-- Consulting Domain Admin a1: people of the line without a counsellor; not another line's
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'LR DA queue: own line without a counsellor', 'L10,L4', string_agg(learning_id, ',' order by learning_id) from public.waiting_submissions() where user_id='00000000-0000-0000-0000-0000000000b2';
insert into results (check_name, expected, actual) select 'LR DA queue: not people with a counsellor', '0', count(*)::text from public.waiting_submissions() where user_id='00000000-0000-0000-0000-0000000000b1';
insert into results (check_name, expected, actual) select 'LR DA queue: not another line', '0', count(*)::text from public.waiting_submissions() where user_id='00000000-0000-0000-0000-0000000000b3';
do $$ begin
  begin perform public.decide_learning('00000000-0000-0000-0000-0000000000b3', 'L4', 'accepted');
    insert into results (check_name, expected, actual) values ('LR DA decides for another line', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('LR DA decides for another line', 'blocked', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'LR DA requests changes for own line', 'in-progress', public.decide_learning('00000000-0000-0000-0000-0000000000b2', 'L10', 'changes', 'Add the attendance link from the academy, please.');
-- General Admin a7: reads every formal track, never ambitions; accepts for people without a counsellor
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'LR GA reads any person''s progress', '1', least(count(*), 1)::text from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000b3';
insert into results (check_name, expected, actual) select 'LR GA reads any person''s decisions', '1', least(count(*), 1)::text from public.learning_decisions where user_id='00000000-0000-0000-0000-0000000000b1';
insert into results (check_name, expected, actual) select 'LR GA reads avatar prefs', '1', count(*)::text from public.learner_prefs where user_id='00000000-0000-0000-0000-0000000000b1';
insert into results (check_name, expected, actual) select 'LR GA reads no ambitions', '0', count(*)::text from public.ambitions where user_id='00000000-0000-0000-0000-0000000000b1';
insert into results (check_name, expected, actual) select 'LR GA queue: people without a counsellor in any line', 'L4|L4', (select string_agg(learning_id, ',') from public.waiting_submissions() where user_id='00000000-0000-0000-0000-0000000000b2')||'|'||(select string_agg(learning_id, ',') from public.waiting_submissions() where user_id='00000000-0000-0000-0000-0000000000b3');
insert into results (check_name, expected, actual) select 'LR GA queue: not people with a counsellor', '0', count(*)::text from public.waiting_submissions() where user_id='00000000-0000-0000-0000-0000000000b1';
insert into results (check_name, expected, actual) select 'LR GA accepts', 'accepted', public.decide_learning('00000000-0000-0000-0000-0000000000b3', 'L4', 'accepted');
insert into results (check_name, expected, actual) select 'LR GA recorded as the decider', '00000000-0000-0000-0000-0000000000a7', coalesce(max(decided_by::text), 'none') from public.learning_decisions where user_id='00000000-0000-0000-0000-0000000000b3' and learning_id='L4';
with u as (update public.learner_learnings set pct = 10 where user_id = '00000000-0000-0000-0000-0000000000b2' returning 1) insert into results (check_name, expected, actual) select 'LR GA writes nobody''s progress', '0 rows', count(*)||' rows' from u;
-- a plain member reads nobody else's record
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'LR member reads no one else''s decisions', '0', count(*)::text from public.learning_decisions where user_id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b3');
insert into results (check_name, expected, actual) select 'LR member queue holds nobody else''s submissions', '0', count(*)::text from public.waiting_submissions() where user_id in ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000b3');
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
insert into results (check_name, expected, actual) select 'AI teach_back use is seeded, text and off', 'text/false', kind||'/'||enabled from public.ai_uses where key = 'teach_back';
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
-- Guard rails: usage is counted by the function only, up to the use's daily limit; nobody else reads or writes it.
do $$ begin
  begin perform count(*) from public.ai_usage; insert into results (check_name, expected, actual) values ('AI member reads usage', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI member reads usage', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.ai_usage (user_id, use_key) values ('00000000-0000-0000-0000-0000000000a2', 'profile_chat'); insert into results (check_name, expected, actual) values ('AI member writes usage', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI member writes usage', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.ai_count_call('00000000-0000-0000-0000-0000000000a2', 'profile_chat', 1); insert into results (check_name, expected, actual) values ('AI member counts a call', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI member counts a call', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.ai_usage_summary(); insert into results (check_name, expected, actual) values ('AI member reads the usage summary', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI member reads the usage summary', 'blocked', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
with u as (update public.ai_uses set daily_limit = 1000, preamble = '' where key = 'profile_chat' returning 1) insert into results (check_name, expected, actual) select 'AI DA changes a limit or instruction', '0 rows', count(*)||' rows' from u;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
with u as (update public.ai_uses set daily_limit = 2, preamble = 'Stay on topic.' where key = 'profile_chat' returning 1) insert into results (check_name, expected, actual) select 'AI SA sets a limit and an instruction', '1 rows', count(*)||' rows' from u;
do $$ begin
  begin perform public.ai_count_call('00000000-0000-0000-0000-0000000000a2', 'profile_chat', 1); insert into results (check_name, expected, actual) values ('AI SA counts a call', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI SA counts a call', 'blocked', 'blocked: '||sqlstate); end;
end $$;
reset role;
grant insert on results to service_role; grant usage, select on sequence results_n_seq to service_role;
set local role service_role;
insert into results (check_name, expected, actual) select 'AI function counts a call', '1', public.ai_count_call('00000000-0000-0000-0000-0000000000a2', 'profile_chat', 120)::text;
insert into results (check_name, expected, actual) select 'AI function counts up to the limit', '2', public.ai_count_call('00000000-0000-0000-0000-0000000000a2', 'profile_chat', 80)::text;
do $$ begin
  begin perform public.ai_count_call('00000000-0000-0000-0000-0000000000a2', 'profile_chat', 50); insert into results (check_name, expected, actual) values ('AI function refuses beyond the daily limit', 'blocked: Daily AI limit reached', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AI function refuses beyond the daily limit', 'blocked: Daily AI limit reached', 'blocked: '||sqlerrm); end;
end $$;
reset role;
insert into results (check_name, expected, actual) select 'AI a refused call is not counted', '2|200', calls||'|'||input_chars from public.ai_usage where user_id = '00000000-0000-0000-0000-0000000000a2' and use_key = 'profile_chat';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'AI SA sees calls per use today', 'true', ((public.ai_usage_summary() -> 'uses' -> 'profile_chat' ->> 'today')::int >= 2)::text;
insert into results (check_name, expected, actual) select 'AI SA sees the top users, no content', 'true', (exists (select 1 from jsonb_array_elements(public.ai_usage_summary() -> 'top') e
  where e ->> 'name' = (select coalesce(full_name, email) from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') and (e ->> 'calls')::int >= 2))::text;
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

-- ---------- v0.7.2: completion per learning type ----------
-- c1: Consulting learner without a counsellor; c2: Tax & Legal learner. a1 is the Consulting Domain Admin, a7 a General
-- Admin, a2 a plain member. L1 is an E-learning, L4 and L10 Classroom, L38 an Avatar, L18 a Certification, L3 a Book.
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000c1','t.completer@test.local'),
 ('00000000-0000-0000-0000-0000000000c2','t.taxattendee@test.local');
update public.profiles set business_line='Consulting', full_name='T Completer', counsellor_id=null where id='00000000-0000-0000-0000-0000000000c1';
update public.profiles set business_line='Tax & Legal', full_name='T Tax Attendee', counsellor_id=null where id='00000000-0000-0000-0000-0000000000c2';
set local role authenticated;
-- learner c1: what completes itself, and what does not
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select public.save_learning('L1', p_state => 'in-progress', p_pct => 50::smallint);
select public.save_learning('L1', p_state => 'accepted', p_pct => 100::smallint);
insert into results (check_name, expected, actual) select 'CT owner marks an e-learning completed', 'accepted 100', coalesce(max(state)||' '||max(pct), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L1';
insert into results (check_name, expected, actual) select 'CT e-learning completion recorded as self_completed', 'self_completed|00000000-0000-0000-0000-0000000000c1', string_agg(verdict||'|'||decided_by, ';') from public.learning_decisions where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L1';
do $$ begin
  begin perform public.save_learning('L10', p_state => 'accepted', p_pct => 100::smallint);
    insert into results (check_name, expected, actual) values ('CT classroom self-completed without feedback', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT classroom self-completed without feedback', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L10', p_state => 'accepted', p_pct => 100::smallint, p_note => 'Good day.', p_rating => 4::smallint);
    insert into results (check_name, expected, actual) values ('CT classroom feedback under 40 characters', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT classroom feedback under 40 characters', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L10', p_state => 'accepted', p_pct => 100::smallint, p_note => 'I will open every workshop with the issue tree we built together.');
    insert into results (check_name, expected, actual) values ('CT classroom feedback without a rating', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT classroom feedback without a rating', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L10', p_rating => 6::smallint);
    insert into results (check_name, expected, actual) values ('CT rating outside 1 to 5', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT rating outside 1 to 5', 'blocked', 'blocked: '||sqlstate); end;
end $$;
select public.save_learning('L10', p_state => 'accepted', p_pct => 100::smallint, p_note => 'I will open every workshop with the issue tree we built together.', p_rating => 4::smallint);
insert into results (check_name, expected, actual) select 'CT classroom completes with the feedback', 'accepted 4', coalesce(max(state)||' '||max(evidence_rating), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L10';
insert into results (check_name, expected, actual) select 'CT the feedback is kept with the record', 'self_completed|4', string_agg(verdict||'|'||(evidence->>'rating'), ';') from public.learning_decisions where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L10';
select public.save_learning('L38', p_state => 'accepted', p_pct => 100::smallint);
insert into results (check_name, expected, actual) select 'CT owner completes an avatar practice', 'accepted', coalesce(max(state), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L38';
do $$ begin
  begin perform public.save_learning('L18', p_state => 'accepted', p_pct => 100::smallint, p_link => 'https://sharepoint.example/certificates/az900.pdf');
    insert into results (check_name, expected, actual) values ('CT certification self-completed', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT certification self-completed', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L3', p_state => 'accepted', p_pct => 100::smallint, p_note => rpad('A reflection', 150, '.'));
    insert into results (check_name, expected, actual) values ('CT book self-completed', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT book self-completed', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L10', p_rating => 2::smallint);
    insert into results (check_name, expected, actual) values ('CT owner changes the feedback of a completed classroom', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT owner changes the feedback of a completed classroom', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L1', p_state => 'in-progress');
    insert into results (check_name, expected, actual) values ('CT completed e-learning stays completed', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT completed e-learning stays completed', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.register_attendance('L4', array['00000000-0000-0000-0000-0000000000c1']::uuid[]);
    insert into results (check_name, expected, actual) values ('CT learner registers own attendance', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT learner registers own attendance', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- learner c2 started the classroom
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select public.save_learning('L4', p_state => 'in-progress', p_pct => 25::smallint);
-- Consulting Domain Admin a1: own line yes, another line no, never themselves
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'CT DA roster: own line, not another line, not self', '1 0 0', (select count(*) from public.attendance_roster('L4') where user_id='00000000-0000-0000-0000-0000000000c1')||' '||(select count(*) from public.attendance_roster('L4') where user_id='00000000-0000-0000-0000-0000000000c2')||' '||(select count(*) from public.attendance_roster('L4') where user_id='00000000-0000-0000-0000-0000000000a1');
insert into results (check_name, expected, actual) select 'CT DA registers attendance for own line', '1', public.register_attendance('L4', array['00000000-0000-0000-0000-0000000000c1']::uuid[])::text;
insert into results (check_name, expected, actual) select 'CT attended: accepted with the full hours', 'accepted 100', coalesce(max(state)||' '||max(pct), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L4';
insert into results (check_name, expected, actual) select 'CT attended recorded with the admin', 'attended|00000000-0000-0000-0000-0000000000a1', string_agg(verdict||'|'||decided_by, ';') from public.learning_decisions where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L4';
insert into results (check_name, expected, actual) select 'CT DA roster shows who is done', 'accepted', coalesce(max(state), 'none') from public.attendance_roster('L4') where user_id='00000000-0000-0000-0000-0000000000c1';
do $$ begin
  begin perform public.register_attendance('L4', array['00000000-0000-0000-0000-0000000000c2']::uuid[]);
    insert into results (check_name, expected, actual) values ('CT DA registers another line''s person', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT DA registers another line''s person', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.register_attendance('L4', array['00000000-0000-0000-0000-0000000000a1']::uuid[]);
    insert into results (check_name, expected, actual) values ('CT DA registers themselves', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT DA registers themselves', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- a plain member cannot register attendance
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'CT member roster is empty', '0', count(*)::text from public.attendance_roster('L4');
do $$ begin
  begin perform public.register_attendance('L10', array['00000000-0000-0000-0000-0000000000c2']::uuid[]);
    insert into results (check_name, expected, actual) values ('CT member registers attendance', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT member registers attendance', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- General Admin a7: anyone, on a published classroom only; an accepted item stays accepted
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'CT GA roster: every line', '1 1', (select count(*) from public.attendance_roster('L4') where user_id='00000000-0000-0000-0000-0000000000c1')||' '||(select count(*) from public.attendance_roster('L4') where user_id='00000000-0000-0000-0000-0000000000c2');
insert into results (check_name, expected, actual) select 'CT a refused registration changes nobody', '25 in-progress', coalesce(max(pct)||' '||max(state), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c2' and learning_id='L4';
insert into results (check_name, expected, actual) select 'CT GA registers attendance for anyone', '1', public.register_attendance('L4', array['00000000-0000-0000-0000-0000000000c2']::uuid[])::text;
insert into results (check_name, expected, actual) select 'CT GA attendance completes an item in progress', 'accepted 100 attended', coalesce(max(l.state)||' '||max(l.pct)||' '||(select string_agg(verdict, ',') from public.learning_decisions d where d.user_id='00000000-0000-0000-0000-0000000000c2' and d.learning_id='L4'), 'none') from public.learner_learnings l where l.user_id='00000000-0000-0000-0000-0000000000c2' and l.learning_id='L4';
do $$ begin
  begin perform public.register_attendance('L1', array['00000000-0000-0000-0000-0000000000c2']::uuid[]);
    insert into results (check_name, expected, actual) values ('CT attendance on a non-classroom learning', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('CT attendance on a non-classroom learning', 'blocked', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'CT attendance on an accepted item registers nobody', '0', public.register_attendance('L10', array['00000000-0000-0000-0000-0000000000c1']::uuid[])::text;
insert into results (check_name, expected, actual) select 'CT accepted item stays accepted with its record', 'accepted 4 self_completed', coalesce(max(l.state)||' '||max(l.evidence_rating)||' '||(select string_agg(verdict, ',') from public.learning_decisions d where d.user_id='00000000-0000-0000-0000-0000000000c1' and d.learning_id='L10'), 'none') from public.learner_learnings l where l.user_id='00000000-0000-0000-0000-0000000000c1' and l.learning_id='L10';
insert into results (check_name, expected, actual) select 'CT registering again registers nobody', '0', public.register_attendance('L4', array['00000000-0000-0000-0000-0000000000c1']::uuid[])::text;
insert into results (check_name, expected, actual) select 'CT registering again adds no decision', '1', count(*)::text from public.learning_decisions where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L4';

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
  begin perform count(*) from public.learning_decisions; insert into results (check_name, expected, actual) values ('anon reads decisions', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon reads decisions', 'blocked', 'blocked: '||sqlstate); end;
  begin perform count(*) from public.waiting_submissions(); insert into results (check_name, expected, actual) values ('anon reads the approvals queue', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon reads the approvals queue', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.decide_learning('00000000-0000-0000-0000-0000000000b2', 'L4', 'accepted'); insert into results (check_name, expected, actual) values ('anon decides a learning', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon decides a learning', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.register_attendance('L4', array['00000000-0000-0000-0000-0000000000b2']::uuid[]); insert into results (check_name, expected, actual) values ('anon registers attendance', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon registers attendance', 'blocked', 'blocked: '||sqlstate); end;
  begin perform count(*) from public.attendance_roster('L4'); insert into results (check_name, expected, actual) values ('anon reads an attendance roster', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('anon reads an attendance roster', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- ---------- Projects & evaluations (formal track) and personality results (the person only, owner's Q8) ----------
reset role;
select set_config('request.jwt.claims', '', true);
update public.profiles set business_line = 'Consulting', counsellor_id = '00000000-0000-0000-0000-0000000000a6' where id = '00000000-0000-0000-0000-0000000000a2';
insert into public.project_evaluations (user_id, client, name, role, period, hours, lead, evaluator, advice) values ('00000000-0000-0000-0000-0000000000a2', 'T Northwind', 'T review', 'Consultant', 'Oct 2026', 40, 'T Lead', 'T Lead', '[["L37","Story first."]]');
insert into public.personality_tests (user_id, name, provider, taken, headline, unit, bars, sugg) values ('00000000-0000-0000-0000-0000000000a2', 'T Four Colours', 'Insights', 'Oct 2026', 'Cool blue first', '%', '[["Blue",60]]', '[["L37","Practise the story."]]');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'PT owner reads own projects and personality', '1/1', (select count(*) from public.project_evaluations where user_id = '00000000-0000-0000-0000-0000000000a2' and client = 'T Northwind')||'/'||(select count(*) from public.personality_tests where user_id = '00000000-0000-0000-0000-0000000000a2' and name = 'T Four Colours');
do $$ begin
  begin insert into public.project_evaluations (user_id, client, name, role, period, hours, lead, evaluator) values ('00000000-0000-0000-0000-0000000000a2', 'T own', 'T', 'T', 'T', 1, 'T', 'T');
    insert into results (check_name, expected, actual) values ('PT owner writes an evaluation', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('PT owner writes an evaluation', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.personality_tests set headline = 'T changed' where user_id = '00000000-0000-0000-0000-0000000000a2';
    insert into results (check_name, expected, actual) values ('PT owner edits a personality result', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('PT owner edits a personality result', 'blocked', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'PT counsellor reads projects, no personality', '1/0', (select count(*) from public.project_evaluations where user_id = '00000000-0000-0000-0000-0000000000a2' and client = 'T Northwind')||'/'||(select count(*) from public.personality_tests where user_id = '00000000-0000-0000-0000-0000000000a2' and name = 'T Four Colours');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'PT managing Domain Admin reads projects, no personality', '1/0', (select count(*) from public.project_evaluations where user_id = '00000000-0000-0000-0000-0000000000a2' and client = 'T Northwind')||'/'||(select count(*) from public.personality_tests where user_id = '00000000-0000-0000-0000-0000000000a2' and name = 'T Four Colours');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'PT General Admin reads projects, no personality', '1/0', (select count(*) from public.project_evaluations where user_id = '00000000-0000-0000-0000-0000000000a2' and client = 'T Northwind')||'/'||(select count(*) from public.personality_tests where user_id = '00000000-0000-0000-0000-0000000000a2' and name = 'T Four Colours');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'PT System Admin reads projects, no personality', '1/0', (select count(*) from public.project_evaluations where user_id = '00000000-0000-0000-0000-0000000000a2' and client = 'T Northwind')||'/'||(select count(*) from public.personality_tests where user_id = '00000000-0000-0000-0000-0000000000a2' and name = 'T Four Colours');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'PT another line reads neither', '0/0', (select count(*) from public.project_evaluations where user_id = '00000000-0000-0000-0000-0000000000a2' and client = 'T Northwind')||'/'||(select count(*) from public.personality_tests where user_id = '00000000-0000-0000-0000-0000000000a2' and name = 'T Four Colours');
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin perform count(*) from public.project_evaluations; insert into results (check_name, expected, actual) values ('PT anon reads evaluations', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('PT anon reads evaluations', 'blocked', 'blocked: '||sqlstate); end;
  begin perform count(*) from public.personality_tests; insert into results (check_name, expected, actual) values ('PT anon reads personality results', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('PT anon reads personality results', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- ---------- design v4: completion and evidence of the new formats ----------
-- L68 is a Job aid, L64 a Case exercise, L66 a Stretch assignment, L67 a Webinar. c1 and c2 are the learners above.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select public.save_learning('L68', p_state => 'in-progress', p_pct => 50::smallint);
select public.save_learning('L68', p_state => 'accepted', p_pct => 100::smallint, p_detail => '{"ticks":[0,1,2]}'::jsonb);
insert into results (check_name, expected, actual) select 'FC learner self-accepts a published job aid', 'accepted', coalesce(max(state), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L68';
insert into results (check_name, expected, actual) select 'FC detail is saved with the progress row by its owner', '{"ticks": [0, 1, 2]}', coalesce(max(detail::text), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L68';
do $$ begin
  begin perform public.save_learning('L64', p_state => 'accepted', p_pct => 100::smallint);
    insert into results (check_name, expected, actual) values ('FC learner self-accepts a case exercise', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FC learner self-accepts a case exercise', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L66', p_state => 'accepted', p_pct => 100::smallint);
    insert into results (check_name, expected, actual) values ('FC learner self-accepts a stretch assignment', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FC learner self-accepts a stretch assignment', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L64', p_state => 'submitted', p_pct => 100::smallint);
    insert into results (check_name, expected, actual) values ('FC case exercise submitted without a link', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FC case exercise submitted without a link', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L66', p_state => 'submitted', p_pct => 100::smallint, p_note => 'Too short.');
    insert into results (check_name, expected, actual) values ('FC stretch assignment submitted with a short reflection', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FC stretch assignment submitted with a short reflection', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L67', p_state => 'accepted', p_pct => 100::smallint);
    insert into results (check_name, expected, actual) values ('FC webinar completed without feedback', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FC webinar completed without feedback', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.save_learning('L68', p_detail => '[1]'::jsonb);
    insert into results (check_name, expected, actual) values ('FC detail must be an object', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FC detail must be an object', 'blocked', 'blocked: '||sqlstate); end;
end $$;
select public.save_learning('L64', p_state => 'submitted', p_pct => 100::smallint, p_link => 'https://sharepoint.example/case/day-one.pdf');
select public.save_learning('L66', p_state => 'submitted', p_pct => 100::smallint, p_note => rpad('What I stretched: I ran the steering committee, prepared the options and let the sponsor decide.', 150, ' Next.'));
insert into results (check_name, expected, actual) select 'FC case exercise with a link and stretch with a reflection go to the counsellor', 'submitted submitted', string_agg(state, ' ' order by learning_id) from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id in ('L64', 'L66');
select public.save_learning('L67', p_state => 'accepted', p_pct => 100::smallint, p_note => rpad('I will apply the top-up tax test to every group structure I review from now on.', 90, ' Next.'), p_rating => 5::smallint);
insert into results (check_name, expected, actual) select 'FC webinar completes with feedback', 'accepted 5', coalesce(max(state)||' '||max(evidence_rating), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L67';
-- nobody else writes the detail of c1's row (RLS update is owner-only)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
update public.learner_learnings set detail = '{"ticks":[9]}' where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L68';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
update public.learner_learnings set detail = '{"ticks":[9]}' where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L68';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
update public.learner_learnings set detail = '{"ticks":[9]}' where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L68';
-- the faculty registers a webinar attendee, as for a classroom
select public.register_attendance('L67', array['00000000-0000-0000-0000-0000000000c2'::uuid]);
reset role;
insert into results (check_name, expected, actual) select 'FC nobody else changes detail on someone else''s row', '{"ticks": [0, 1, 2]}', coalesce(max(detail::text), 'none') from public.learner_learnings where user_id='00000000-0000-0000-0000-0000000000c1' and learning_id='L68';
insert into results (check_name, expected, actual) select 'FC the faculty registers webinar attendance', 'accepted attended', coalesce(max(l.state), 'none')||' '||coalesce(max(d.verdict), 'none') from public.learner_learnings l left join public.learning_decisions d on d.user_id=l.user_id and d.learning_id=l.learning_id where l.user_id='00000000-0000-0000-0000-0000000000c2' and l.learning_id='L67';
reset role;
-- ---------- design v4: certification trajectories, enrolments and credentials ----------
-- d1: Consulting learner with counsellor a6 (outside T1's mandatory audience); d2: Tax & Legal consultant (inside it). a2 counsels a8 (someone else's counsellor), a1 is the Consulting Domain Admin,
-- a4 the Audit Domain Admin, a7 a General Admin, a3 the Tax & Legal Domain Admin. T1 (auto, mandatory), T2 (approval)
-- and T3 (open) are the seeds; TX1–TX3 are made here.
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1','t.trajectory@test.local');
update public.profiles set business_line='Consulting', counsellor_id='00000000-0000-0000-0000-0000000000a6' where id='00000000-0000-0000-0000-0000000000d1';
-- d2: Tax & Legal consultant, inside T1's mandatory audience (Tax & Legal at Consultant)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d2','t.mandatory@test.local');
update public.profiles set business_line='Tax & Legal', career_stage='Consultant', counsellor_id=null where id='00000000-0000-0000-0000-0000000000d2';
set local role authenticated;
-- Consulting Domain Admin a1: drafts and advised trajectories of the own line; never a mandatory one live (D2)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
with i as (insert into public.trajectories (id, name, issuer, credential, enrol, months, status, business_line, steps, maps)
  values ('TX1', 'T mandatory draft', 'T issuer', 'T credential', 'auto', 6, 'draft', 'Consulting', '[{"id":"s1","k":"check"},{"id":"s2","k":"exam"}]', '[["Consulting","Manager","mandatory"]]') returning 1)
  insert into results (check_name, expected, actual) select 'TR Domain Admin adds a draft for the own line', '1 rows', count(*)||' rows' from i;
with i as (insert into public.trajectories (id, name, issuer, credential, enrol, months, status, business_line, steps, maps)
  values ('TX2', 'T advised live', 'T issuer', 'T credential', 'open', 6, 'live', 'Consulting', '[{"id":"s1","k":"learn","lid":"L1"},{"id":"s2","k":"exam"}]', '[["Consulting","Manager","advised"]]') returning 1)
  insert into results (check_name, expected, actual) select 'TR Domain Admin publishes an advised trajectory of the own line', '1 rows', count(*)||' rows' from i;
insert into public.trajectories (id, name, issuer, credential, enrol, months, status, business_line, steps, maps)
  values ('TX3', 'T plain draft', 'T issuer', 'T credential', 'open', 6, 'draft', 'Consulting', '[]', '[]');
insert into results (check_name, expected, actual) select 'TR Domain Admin reads the own line''s drafts', '2', count(*)::text from public.trajectories where id in ('TX1', 'TX3');
do $$ begin
  begin insert into public.trajectories (id, name, issuer, credential, enrol, months, status, business_line, steps, maps)
      values ('TX9', 'T other line', 'T', 'T', 'open', 6, 'draft', 'Audit', '[]', '[]');
    insert into results (check_name, expected, actual) values ('TR Domain Admin adds a trajectory of another line', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR Domain Admin adds a trajectory of another line', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.trajectories (id, name, issuer, credential, enrol, months, status, business_line, steps, maps)
      values ('TX9', 'T firm-wide', 'T', 'T', 'open', 6, 'draft', null, '[]', '[]');
    insert into results (check_name, expected, actual) values ('TR Domain Admin adds a firm-wide trajectory', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR Domain Admin adds a firm-wide trajectory', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.trajectories set status = 'live' where id = 'TX1';
    insert into results (check_name, expected, actual) values ('TR Domain Admin publishes a mandatory trajectory (D2)', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR Domain Admin publishes a mandatory trajectory (D2)', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.trajectories (id, name, issuer, credential, enrol, months, status, business_line, steps, maps)
      values ('TX9', 'T live mandatory', 'T', 'T', 'auto', 6, 'live', 'Consulting', '[]', '[["Consulting","Manager","mandatory"]]');
    insert into results (check_name, expected, actual) values ('TR Domain Admin adds a live mandatory trajectory (D2)', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR Domain Admin adds a live mandatory trajectory (D2)', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.trajectories set maps = '[["Consulting","Manager","mandatory"]]' where id = 'TX2';
    insert into results (check_name, expected, actual) values ('TR Domain Admin makes a live trajectory mandatory (D2)', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR Domain Admin makes a live trajectory mandatory (D2)', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.trajectories set maps = '[["Audit","Manager","advised"]]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR Domain Admin maps another line''s audience', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR Domain Admin maps another line''s audience', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.trajectories (id, name, issuer, credential, enrol, months, status, business_line, steps, maps)
      values ('TX9', 'T tec', 'T', 'T', 'open', 6, 'draft', 'Consulting', '[]', '[["tec:data","Manager","advised"]]');
    insert into results (check_name, expected, actual) values ('TR Domain Admin maps a tec: audience', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR Domain Admin maps a tec: audience', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.trajectories set steps = '[{"id":"s1","k":"learn"},{"id":"s1","k":"exam"}]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR steps with a repeated id', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR steps with a repeated id', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.trajectories set steps = '[{"id":"s1","k":"quiz"}]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR a step of an unknown kind', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR a step of an unknown kind', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- Audit Domain Admin a4: not the Consulting drafts, no edits there
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR another line''s Domain Admin reads the drafts', '0', count(*)::text from public.trajectories where id in ('TX1', 'TX3');
with u as (update public.trajectories set name = 'T renamed' where id = 'TX2' returning 1) insert into results (check_name, expected, actual) select 'TR another line''s Domain Admin edits', '0 rows', count(*)||' rows' from u;
with d as (delete from public.trajectories where id = 'TX2' returning 1) insert into results (check_name, expected, actual) select 'TR another line''s Domain Admin removes', '0 rows', count(*)||' rows' from d;
-- General Admin a7 publishes the mandatory one (D2)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
with u as (update public.trajectories set maps = '[["Audit","Manager","advised"],["tec:data","Manager","advised"]]' where id = 'TX3' returning 1) insert into results (check_name, expected, actual) select 'TR General Admin maps any line or tec: audience', '1 rows', count(*)||' rows' from u;
do $$ begin
  begin update public.trajectories set maps = '[["amb:sust","Manager","mandatory"]]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR an ambition audience is mandatory', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR an ambition audience is mandatory', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.trajectories set maps = '[["Consulting","Intern","advised"]]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR a map with an unknown stage', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR a map with an unknown stage', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.trajectories set maps = '[["Marketing","Manager","advised"]]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR a map with an unknown audience', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR a map with an unknown audience', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.trajectories set maps = '[["tec:data","Manager","mandatory"]]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR a tec: audience is mandatory', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR a tec: audience is mandatory', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin update public.trajectories set maps = '[["ind:energy","Manager","mandatory"]]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR an ind: audience is mandatory', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR an ind: audience is mandatory', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin perform private.in_mandatory_audience('00000000-0000-0000-0000-0000000000a7', '[]'::jsonb);
    insert into results (check_name, expected, actual) values ('TR a signed-in user calls the audience helper', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR a signed-in user calls the audience helper', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
with u as (update public.trajectories set status = 'live' where id = 'TX1' returning published_at) insert into results (check_name, expected, actual) select 'TR General Admin publishes a mandatory trajectory', '1 rows true', count(*)||' rows '||coalesce(bool_and(published_at is not null), false) from u;
-- Consulting Domain Admin a1 can no longer touch the live mandatory one
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
with u as (update public.trajectories set status = 'draft' where id = 'TX1' returning 1) insert into results (check_name, expected, actual) select 'TR Domain Admin takes back a live mandatory trajectory', '0 rows', count(*)||' rows' from u;

-- learner d1: reads live trajectories, not drafts; starts through the functions only
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR learner reads the live seeds', 'T1 T2 T3', string_agg(id, ' ' order by id) from public.trajectories where id in ('T1', 'T2', 'T3');
insert into results (check_name, expected, actual) select 'TR learner reads no draft', '0', count(*)::text from public.trajectories where id = 'TX3';
insert into results (check_name, expected, actual) select 'TR learner starts an open trajectory', 'enrolled', public.request_trajectory('T3');
insert into results (check_name, expected, actual) select 'TR learner asks to start an approval trajectory', 'requested', public.request_trajectory('T2');
insert into results (check_name, expected, actual) select 'TR learner starts a Domain Admin''s open trajectory', 'enrolled', public.request_trajectory('TX2');
do $$ begin
  begin insert into public.trajectory_enrolments (user_id, trajectory_id, status, start_month) values ('00000000-0000-0000-0000-0000000000d1', 'TX1', 'enrolled', 24318);
    insert into results (check_name, expected, actual) values ('TR learner writes an enrolment row directly', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner writes an enrolment row directly', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.trajectory_enrolments set status = 'enrolled' where trajectory_id = 'T2';
    insert into results (check_name, expected, actual) values ('TR learner approves the own start request directly', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner approves the own start request directly', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.request_trajectory('TX3');
    insert into results (check_name, expected, actual) values ('TR learner starts a draft', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner starts a draft', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.submit_trajectory_step('T2', 's7');
    insert into results (check_name, expected, actual) values ('TR learner submits a step before the start is approved', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner submits a step before the start is approved', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.submit_trajectory_step('T3', 's5', 'done');
    insert into results (check_name, expected, actual) values ('TR learner sets a check step to done', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner sets a check step to done', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.submit_trajectory_step('T3', 's5', 'booked');
    insert into results (check_name, expected, actual) values ('TR learner books a check step', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner books a check step', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.submit_trajectory_step('T3', 's2');
    insert into results (check_name, expected, actual) values ('TR learner submits a learning step', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner submits a learning step', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.submit_trajectory_step('T3', 's6');
    insert into results (check_name, expected, actual) values ('TR learner submits an exam result without a link or number', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner submits an exam result without a link or number', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T2', null, 'approve');
    insert into results (check_name, expected, actual) values ('TR learner approves the own start request', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner approves the own start request', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.submit_trajectory_step('T1', 's6', p_link => 'https://sharepoint.example/log.pdf');
    insert into results (check_name, expected, actual) values ('TR outside the audience, the first action does not start an auto-enrol trajectory', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR outside the audience, the first action does not start an auto-enrol trajectory', 'blocked', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'TR learner asks for the sign-off', 'submitted', public.submit_trajectory_step('T3', 's5');
do $$ begin
  begin perform public.submit_trajectory_step('T3', 's5', p_note => 'T changed after sending');
    insert into results (check_name, expected, actual) values ('TR learner rewrites a step waiting for the counsellor', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner rewrites a step waiting for the counsellor', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- outside its mandatory audience an auto-enrol trajectory is like an open one: start, leave, start again (current month)
insert into results (check_name, expected, actual) select 'TR outside the audience, learner starts an auto-enrol trajectory', 'enrolled', public.request_trajectory('T1');
select public.withdraw_trajectory('T1');
insert into results (check_name, expected, actual) select 'TR outside the audience, learner leaves an auto-enrol trajectory', '0', count(*)::text from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T1';
select public.request_trajectory('T1');
insert into results (check_name, expected, actual) select 'TR outside the audience, the start is the current month', 'true', (start_month = private.current_month())::text from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T1';
insert into results (check_name, expected, actual) select 'TR learner sends evidence', 'submitted', public.submit_trajectory_step('T1', 's6', p_link => 'https://sharepoint.example/traineeship-log.pdf');
insert into results (check_name, expected, actual) select 'TR learner''s rows', 'T1 enrolled, T2 requested, T3 enrolled, TX2 enrolled', string_agg(trajectory_id||' '||status, ', ' order by trajectory_id) from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1';
-- T1 published in Sep 2025, so its publication month differs from the current month
reset role;
update public.trajectories set published_at = '2025-09-15' where id = 'T1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR inside the audience, the first action writes the enrolled row (D6)', 'submitted', public.submit_trajectory_step('T1', 's6', p_link => 'https://sharepoint.example/d2-log.pdf');
insert into results (check_name, expected, actual) select 'TR inside the audience, the start is the publication month', 'enrolled 24308', e.status||' '||e.start_month from public.trajectory_enrolments e join public.trajectories t on t.id = e.trajectory_id where e.user_id = '00000000-0000-0000-0000-0000000000d2' and e.trajectory_id = 'T1';
insert into results (check_name, expected, actual) select 'TR inside the audience, asking to start changes nothing', 'enrolled', public.request_trajectory('T1');
do $$ begin
  begin perform public.withdraw_trajectory('T1');
    insert into results (check_name, expected, actual) values ('TR inside the audience, learner leaves a mandatory trajectory', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR inside the audience, learner leaves a mandatory trajectory', 'blocked', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
-- a trajectory back in draft stays readable for the person enrolled in it, and only while they are
reset role;
update public.trajectories set status = 'draft' where id = 'TX2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR learner reads a draft they are enrolled in', '1', count(*)::text from public.trajectories where id = 'TX2';
select public.withdraw_trajectory('TX2');
insert into results (check_name, expected, actual) select 'TR learner withdraws, the draft is gone', '0/0', (select count(*) from public.trajectory_enrolments where trajectory_id = 'TX2')||'/'||(select count(*) from public.trajectories where id = 'TX2');

-- someone else's counsellor a2: reads nothing, decides nothing
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR someone else''s counsellor reads the enrolments', '0', count(*)::text from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's5', 'approve');
    insert into results (check_name, expected, actual) values ('TR someone else''s counsellor signs off a step', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR someone else''s counsellor signs off a step', 'blocked', 'blocked: '||sqlstate); end;
end $$;
-- another line's Domain Admin a3 reads nothing
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR another line''s Domain Admin reads the enrolments', '0', count(*)::text from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1';
-- the counsellor a6: approves the start, signs off the check, accepts the exam (D5: the credential appears)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR counsellor reads the enrolments', '3', count(*)::text from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1';
insert into results (check_name, expected, actual) select 'TR counsellor approves the start request', 'enrolled', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T2', null, 'approve');
insert into results (check_name, expected, actual) select 'TR counsellor signs off the check step', 'done', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's5', 'approve');
insert into results (check_name, expected, actual) select 'TR counsellor wants to talk about the evidence first', 'talk', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T1', 's6', 'talk');
do $$ begin
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's4', 'approve');
    insert into results (check_name, expected, actual) values ('TR counsellor accepts a step never submitted', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR counsellor accepts a step never submitted', 'blocked', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'TR the steps after the decisions', 'T1 {} / T3 done', 'T1 '||(select steps::text from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T1')||' / T3 '||(select steps -> 's5' ->> 'state' from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T3');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR after talk the learner sends the evidence again', 'submitted', public.submit_trajectory_step('T1', 's6', p_link => 'https://sharepoint.example/traineeship-log-v2.pdf');
do $$ begin
  begin perform public.withdraw_trajectory('T3');
    insert into results (check_name, expected, actual) values ('TR learner leaves a trajectory with a signed-off step', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner leaves a trajectory with a signed-off step', 'blocked', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
do $$ begin
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T1', 's6', 'approve');
    insert into results (check_name, expected, actual) values ('TR another line''s Domain Admin decides', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR another line''s Domain Admin decides', 'blocked', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR the person''s own-line Domain Admin decides', 'done', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T1', 's6', 'approve');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR learner books the exam', 'booked', public.submit_trajectory_step('T3', 's6', 'booked');
insert into results (check_name, expected, actual) select 'TR learner sends the exam result', 'submitted', public.submit_trajectory_step('T3', 's6', p_link => 'https://academy.example/cert/123', p_ref => 'CSRD-123');
do $$ begin
  begin perform public.submit_trajectory_step('T3', 's5');
    insert into results (check_name, expected, actual) values ('TR learner reopens a signed-off step', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner reopens a signed-off step', 'blocked', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR counsellor accepts the exam', 'done', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's6', 'approve');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR the exam ends in a confirmed credential (D5)', 'CSRD practitioner · internal academy|Internal academy|confirmed|T3|CSRD-123|true|true',
  string_agg(name||'|'||issuer||'|'||status||'|'||trajectory_id||'|'||ref||'|'||(earned_on = current_date)||'|'||(expires_on = (current_date + interval '24 months')::date), ', ')
  from public.credentials where user_id = '00000000-0000-0000-0000-0000000000d1';

-- external credentials: the learner adds one waiting; only the counsellor or an admin confirms it
with i as (insert into public.credentials (user_id, name, issuer, earned_on, link) values ('00000000-0000-0000-0000-0000000000d1', 'T Lean Six Sigma Yellow Belt', 'T issuer', '2025-06-01', 'https://cert.example/lssyb') returning status)
  insert into results (check_name, expected, actual) select 'TR learner adds an external credential, waiting', 'waiting', max(status) from i;
do $$ begin
  begin insert into public.credentials (user_id, name, issuer, earned_on, link, status) values ('00000000-0000-0000-0000-0000000000d1', 'T self-confirmed', 'T', '2025-06-01', 'https://cert.example/x', 'confirmed');
    insert into results (check_name, expected, actual) values ('TR learner adds a confirmed credential', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner adds a confirmed credential', 'blocked', 'blocked: '||sqlstate); end;
  begin update public.credentials set status = 'confirmed' where user_id = '00000000-0000-0000-0000-0000000000d1';
    insert into results (check_name, expected, actual) values ('TR learner confirms the own credential directly', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner confirms the own credential directly', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.confirm_credential((select id from public.credentials where name = 'T Lean Six Sigma Yellow Belt'));
    insert into results (check_name, expected, actual) values ('TR learner confirms the own credential', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner confirms the own credential', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.credentials (user_id, name, issuer, earned_on, link) values ('00000000-0000-0000-0000-0000000000a2', 'T for someone else', 'T', '2025-06-01', 'https://cert.example/y');
    insert into results (check_name, expected, actual) values ('TR learner adds a credential for someone else', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner adds a credential for someone else', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.credentials (user_id, name, issuer, earned_on) values ('00000000-0000-0000-0000-0000000000d1', 'T no proof', 'T', '2025-06-01');
    insert into results (check_name, expected, actual) values ('TR learner adds a credential without a link or number', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR learner adds a credential without a link or number', 'blocked', 'blocked: '||sqlstate); end;
end $$;
select set_config('test.cred', (select id::text from public.credentials where name = 'T Lean Six Sigma Yellow Belt'), true);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR someone else''s counsellor reads the credentials', '0', count(*)::text from public.credentials where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  begin perform public.confirm_credential(current_setting('test.cred')::uuid);
    insert into results (check_name, expected, actual) values ('TR someone else''s counsellor confirms a credential', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR someone else''s counsellor confirms a credential', 'blocked', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR General Admin reads the enrolments and credentials', '3/2', (select count(*) from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1')||'/'||(select count(*) from public.credentials where user_id = '00000000-0000-0000-0000-0000000000d1');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR counsellor confirms the external credential', 'confirmed', public.confirm_credential(current_setting('test.cred')::uuid);
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin perform count(*) from public.trajectories; insert into results (check_name, expected, actual) values ('TR anon reads trajectories', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR anon reads trajectories', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.request_trajectory('T3'); insert into results (check_name, expected, actual) values ('TR anon starts a trajectory', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR anon starts a trajectory', 'blocked', 'blocked: '||sqlstate); end;
end $$;
reset role;
-- the seeds: steps s1… with prerequisites as step ids, every referenced learning in the catalogue, no mandatory ambition
insert into results (check_name, expected, actual) select 'TR seeds T1–T3 with their step counts', 'T1 9 auto live, T2 8 approval live, T3 6 open live', string_agg(id||' '||jsonb_array_length(steps)||' '||enrol||' '||status, ', ' order by id) from public.trajectories where id in ('T1', 'T2', 'T3');
insert into results (check_name, expected, actual) select 'TR seed prerequisites', 'T1 s7>s6 s9>s7, T2 s3>s1 s6>s3 s7>s3 s8>s7, T3 s4>s2 s5>s4 s6>s5',
  string_agg(t.id||' '||p.pres, ', ' order by t.id) from public.trajectories t
  cross join lateral (select string_agg((s ->> 'id')||'>'||(s ->> 'pre'), ' ' order by o) as pres from jsonb_array_elements(t.steps) with ordinality e(s, o) where s ->> 'pre' is not null) p
  where t.id in ('T1', 'T2', 'T3');
insert into results (check_name, expected, actual) select 'TR seed learnings all in the catalogue', '0', count(*)::text from public.trajectories t, jsonb_array_elements(t.steps) s,
  lateral (select s ->> 'lid' as lid union all select jsonb_array_elements_text(coalesce(s -> 'opts', '[]'))) l
  where t.id in ('T1', 'T2', 'T3') and l.lid is not null and not exists (select 1 from public.learnings where id = l.lid);
insert into results (check_name, expected, actual) select 'TR seed maps', 'T1 Tax & Legal/Consultant/mandatory, T2 tec:data/Consultant/advised, T3 amb:sust/Senior consultant/advised', string_agg(id||' '||(maps -> 0 ->> 0)||'/'||(maps -> 0 ->> 1)||'/'||(maps -> 0 ->> 2), ', ' order by id) from public.trajectories where id in ('T1', 'T2', 'T3');
-- a second acceptance of the same exam adds no second credential while the first is valid; after expiry the guard allows one (the step is reset by hand: there is no re-take path yet)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
do $$ begin
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's6', 'approve');
    insert into results (check_name, expected, actual) values ('TR counsellor accepts a signed-off exam again', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR counsellor accepts a signed-off exam again', 'blocked', 'blocked: '||sqlstate); end;
end $$;
reset role;
update public.trajectory_enrolments set steps = jsonb_set(steps, '{s6,state}', '"submitted"') where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T3';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
do $$ begin
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's6', 'approve');
    insert into results (check_name, expected, actual) values ('TR a second exam acceptance while the credential is valid', 'blocked: 23505', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR a second exam acceptance while the credential is valid', 'blocked: 23505', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'TR still one credential from the trajectory', '1', count(*)::text from public.credentials where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T3';
reset role;
update public.credentials set expires_on = current_date - 1 where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T3';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TR after expiry the guard allows another credential', 'done', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's6', 'approve');
insert into results (check_name, expected, actual) select 'TR after expiry a second credential is added', '2', count(*)::text from public.credentials where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T3';
reset role;
select check_name, expected, actual, case when actual like expected||'%' or (expected='blocked' and actual like 'blocked%') then 'PASS' else 'FAIL' end as result from results order by n;
rollback;
