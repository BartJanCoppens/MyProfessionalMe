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
reset role;
insert into results (check_name, expected, actual) select 'FC the case says who reviews it, as the flow does', 'Reviewed by your counsellor.', content ->> 'reviewer' from public.learnings where id = 'L64';
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
  -- industry and technology membership is stored (audience_members), so these audiences may be mandatory
  begin update public.trajectories set maps = '[["tec:data","Manager","mandatory"]]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR a tec: audience is mandatory', 'allowed', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR a tec: audience is mandatory', 'allowed', 'blocked: '||sqlstate); end;
  begin update public.trajectories set maps = '[["ind:energy","Manager","mandatory"]]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR an ind: audience is mandatory', 'allowed', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR an ind: audience is mandatory', 'allowed', 'blocked: '||sqlstate); end;
  begin update public.trajectories set maps = '[["pro:blue","Manager","mandatory"]]' where id = 'TX3';
    insert into results (check_name, expected, actual) values ('TR a profile audience is mandatory', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TR a profile audience is mandatory', 'blocked: 23514', 'blocked: '||sqlstate); end;
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
-- talk first needs a comment of 10 to 500 characters (trimmed), as decide_learning's request for changes
do $$ begin
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T2', null, 'talk');
    insert into results (check_name, expected, actual) values ('TD talk on a start request without a comment', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TD talk on a start request without a comment', 'blocked: 22023', 'blocked: '||sqlstate); end;
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T1', 's6', 'talk', '  123456789  ');
    insert into results (check_name, expected, actual) values ('TD talk on a step with 9 characters', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TD talk on a step with 9 characters', 'blocked: 22023', 'blocked: '||sqlstate); end;
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's5', 'approve', repeat('x', 501));
    insert into results (check_name, expected, actual) values ('TD approve with a comment over 500 characters', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TD approve with a comment over 500 characters', 'blocked: 22023', 'blocked: '||sqlstate); end;
  begin perform public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's5', 'approve', ' fine ');
    insert into results (check_name, expected, actual) values ('TD approve with a comment under 10 characters', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TD approve with a comment under 10 characters', 'blocked: 22023', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'TD decide_trajectory has one signature, with the comment', 'p_user uuid, p_trajectory text, p_step text, p_decision text, p_comment text DEFAULT NULL::text', string_agg(pg_get_function_arguments(p.oid), ' / ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'decide_trajectory';
insert into results (check_name, expected, actual) select 'TD nothing is logged for a refused decision', '0', count(*)::text from public.trajectory_decisions where user_id = '00000000-0000-0000-0000-0000000000d1';
insert into results (check_name, expected, actual) select 'TD talk on a start request with a comment leaves it requested', 'talk/requested', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T2', null, 'talk', 'Let us plan the study leave first.')||'/'||(select status from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T2');
insert into results (check_name, expected, actual) select 'TR counsellor approves the start request', 'enrolled', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T2', null, 'approve');
insert into results (check_name, expected, actual) select 'TR counsellor signs off the check step', 'done', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's5', 'approve');
insert into results (check_name, expected, actual) select 'TR counsellor wants to talk about the evidence first', 'talk', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T1', 's6', 'talk', '  1234567890  ');
insert into results (check_name, expected, actual) select 'TD each decision is logged with the counsellor''s name, a trimmed comment, null for approve', 'T1 s6 talk 1234567890 | T2 - approve null | T2 - talk Let us plan the study leave first. | T3 s5 approve null (T Counsellor)',
  string_agg(trajectory_id||' '||coalesce(step_id, '-')||' '||decision||' '||coalesce(comment, 'null'), ' | ' order by trajectory_id, step_id nulls first, decision)||' ('||max(decided_by_name)||')'
  from public.trajectory_decisions where user_id = '00000000-0000-0000-0000-0000000000d1' and decided_by = '00000000-0000-0000-0000-0000000000a6';
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
-- the owner may remove a waiting credential of their own; not a confirmed one, and nobody else may remove it
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
insert into public.credentials (user_id, name, issuer, earned_on, link) values ('00000000-0000-0000-0000-0000000000d1', 'T added by mistake', 'T issuer', '2025-06-01', 'https://cert.example/oops');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
with d as (delete from public.credentials where name = 'T added by mistake' returning 1)
  insert into results (check_name, expected, actual) select 'TR counsellor removes someone else''s waiting credential', '0', count(*)::text from d;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
with d as (delete from public.credentials where id = current_setting('test.cred')::uuid returning 1)
  insert into results (check_name, expected, actual) select 'TR learner removes a confirmed credential', '0', count(*)::text from d;
with d as (delete from public.credentials where name = 'T added by mistake' returning 1)
  insert into results (check_name, expected, actual) select 'TR learner removes the own waiting credential', '1', count(*)::text from d;
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
-- the decision log: read by the person and whoever reads their track; nobody writes it directly
insert into results (check_name, expected, actual) select 'TD the counsellor reads the person''s decisions', '7', count(*)::text from public.trajectory_decisions where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  begin delete from public.trajectory_decisions where user_id = '00000000-0000-0000-0000-0000000000d1';
    insert into results (check_name, expected, actual) values ('TD the counsellor deletes a decision', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TD the counsellor deletes a decision', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TD the learner reads the talk comments on their own trajectories', 'T1 s6 1234567890 | T2 - Let us plan the study leave first.',
  string_agg(trajectory_id||' '||coalesce(step_id, '-')||' '||comment, ' | ' order by trajectory_id) from public.trajectory_decisions where user_id = '00000000-0000-0000-0000-0000000000d1' and decision = 'talk';
do $$ begin
  begin insert into public.trajectory_decisions (user_id, trajectory_id, step_id, decision, comment) values ('00000000-0000-0000-0000-0000000000d1', 'T1', 's6', 'approve', 'Approved by myself, honestly.');
    insert into results (check_name, expected, actual) values ('TD the learner writes a decision directly', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TD the learner writes a decision directly', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin update public.trajectory_decisions set comment = 'Nothing to talk about here.' where user_id = '00000000-0000-0000-0000-0000000000d1';
    insert into results (check_name, expected, actual) values ('TD the learner rewrites a comment', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TD the learner rewrites a comment', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- leaving and starting again makes a new enrolment row with its own created_at (the page ignores older decisions)
reset role;
update public.trajectory_enrolments set created_at = '2020-01-01' where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select public.withdraw_trajectory('T2');
select public.request_trajectory('T2');
insert into results (check_name, expected, actual) select 'TD a re-created enrolment gets a newer created_at', 'requested true', status||' '||(created_at > '2020-01-01')::text from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T2';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TD another learner reads the person''s decisions', '0', count(*)::text from public.trajectory_decisions where user_id = '00000000-0000-0000-0000-0000000000d1';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'TD someone else''s counsellor reads the person''s decisions', '0', count(*)::text from public.trajectory_decisions where user_id = '00000000-0000-0000-0000-0000000000d1';
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin perform count(*) from public.trajectory_decisions; insert into results (check_name, expected, actual) values ('TD anon reads decisions', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('TD anon reads decisions', 'blocked', 'blocked: '||sqlstate); end;
end $$;
reset role;
-- ---------- Flash cards and practice exams (FX) ----------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1','t.podcaster@test.local'), ('00000000-0000-0000-0000-0000000000e2','t.deckmaker@test.local');
update public.profiles set business_line='Consulting' where id in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2');
insert into public.creator_rules (user_id, lines, formats) values
 ('00000000-0000-0000-0000-0000000000e1','{Consulting}','{Podcast}'),
 ('00000000-0000-0000-0000-0000000000e2','{Consulting}','{"Flash cards","Practice exam"}');
delete from public.review_policies; -- earlier checks left broader requirements; the strictest would win
insert into public.review_policies (formats, peers, expert, quality) values ('{"Flash cards"}', 0, false, false), ('{"Practice exam"}', 0, false, false);
insert into results (check_name, expected, actual) select 'FX draft_items use is seeded, text and off', 'text/false', kind||'/'||enabled from public.ai_uses where key = 'draft_items';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$ begin
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items) values ('Consulting','Flash cards','T fx podcaster cards','pers','x','[["f","b"]]');
    insert into results (check_name, expected, actual) values ('FX a Podcast-only rule cannot create Flash cards', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FX a Podcast-only rule cannot create Flash cards', 'blocked', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway) values ('Consulting','Practice exam','T fx podcaster exam','pers','x');
    insert into results (check_name, expected, actual) values ('FX a Podcast-only rule cannot create a Practice exam', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FX a Podcast-only rule cannot create a Practice exam', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with i as (insert into public.contributions (business_line, type, title, domain, takeaway) values ('Consulting','Podcast','T fx podcast','pers','Listen first.') returning 1)
  insert into results (check_name, expected, actual) select 'FX the same person still creates a Podcast', '1 rows', count(*)||' rows' from i;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
insert into public.contributions (business_line, type, title, domain, takeaway, items) values
 ('Consulting','Flash cards','T fx cards','pers','Lead with the answer.','[["What is the standard rate?","25 %"],["Reduced SME rate?","20 %"]]'),
 ('Consulting','Flash cards','T fx no items','pers','Lead with the answer.',null),
 ('Consulting','Flash cards','T fx bad shape','pers','Lead with the answer.','[["only a front"]]'),
 ('Consulting','Flash cards','T fx client','pers','Lead with the answer.','[["What did Delcroix pay?","Too much"]]'),
 ('Consulting','Practice exam','T fx exam','pers','Read the stem twice.','[{"t":"Rates","q":"Standard rate?","o":["20 %","25 %","29 %","34 %"],"a":1,"why":"Since 2020."}]'),
 ('Consulting','Practice exam','T fx exam bad answer','pers','Read the stem twice.','[{"t":"Rates","q":"Standard rate?","o":["20 %","25 %","29 %","34 %"],"a":4,"why":"Since 2020."}]'),
 ('Consulting','Flash cards','T fx long front','pers','Lead with the answer.', jsonb_build_array(jsonb_build_array(repeat('x', 301), 'b'))),
 ('Consulting','Practice exam','T fx exam three options','pers','Read the stem twice.','[{"t":"Rates","q":"Standard rate?","o":["20 %","25 %","29 %"],"a":1,"why":"Since 2020."}]');
do $$ begin
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items) values ('Consulting','Flash cards','T fx too many','pers','x', (select jsonb_agg(jsonb_build_array('f'||g, 'b')) from generate_series(1, 41) g));
    insert into results (check_name, expected, actual) values ('FX more than 40 items', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FX more than 40 items', 'blocked', 'blocked: '||sqlstate); end;
  begin perform public.submit_contribution((select id from public.contributions where title = 'T fx no items'));
    insert into results (check_name, expected, actual) values ('FX submit without items', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FX submit without items', 'blocked: P0001', 'blocked: '||sqlstate); end;
  begin perform public.submit_contribution((select id from public.contributions where title = 'T fx bad shape'));
    insert into results (check_name, expected, actual) values ('FX submit with a card of one side', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FX submit with a card of one side', 'blocked: P0001', 'blocked: '||sqlstate); end;
  begin perform public.submit_contribution((select id from public.contributions where title = 'T fx client'));
    insert into results (check_name, expected, actual) values ('FX a client name inside a card', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FX a client name inside a card', 'blocked: P0001', 'blocked: '||sqlstate); end;
  begin perform public.submit_contribution((select id from public.contributions where title = 'T fx exam bad answer'));
    insert into results (check_name, expected, actual) values ('FX an exam answer outside 0 to 3', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FX an exam answer outside 0 to 3', 'blocked: P0001', 'blocked: '||sqlstate); end;
  begin perform public.submit_contribution((select id from public.contributions where title = 'T fx long front'));
    insert into results (check_name, expected, actual) values ('FX a card front over 300 characters', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FX a card front over 300 characters', 'blocked: P0001', 'blocked: '||sqlstate); end;
  begin perform public.submit_contribution((select id from public.contributions where title = 'T fx exam three options'));
    insert into results (check_name, expected, actual) values ('FX an exam question with three options', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('FX an exam question with three options', 'blocked: P0001', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'FX cards with items publish when no review is required', 'published', public.submit_contribution((select id from public.contributions where title = 'T fx cards'));
insert into results (check_name, expected, actual) select 'FX the exam publishes the same way', 'published', public.submit_contribution((select id from public.contributions where title = 'T fx exam'));
insert into results (check_name, expected, actual) select 'FX the deck becomes flash content', 'flash/2/2/2', l.content ->> 'kind' || '/' || (l.content ->> 'total') || '/' || (l.content ->> 'due') || '/' || jsonb_array_length(l.content -> 'cards')
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T fx cards';
insert into results (check_name, expected, actual) select 'FX the exam becomes exam content', 'exam/1/1', l.content ->> 'kind' || '/' || (l.content ->> 'bank') || '/' || jsonb_array_length(l.content -> 'qs')
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T fx exam';
insert into results (check_name, expected, actual) select 'FX the published learning keeps the format', 'Flash cards/published', l.format || '/' || l.status
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T fx cards';
with u as (update public.contributions set items = '[["changed","after publishing"]]' where title = 'T fx cards' returning 1)
  insert into results (check_name, expected, actual) select 'FX items cannot change after publishing', '0 rows', count(*)||' rows' from u;
reset role;
-- ---------- Studios: formats and the automatic check before "Send for review" (ST) ----------
-- e1 may only create Podcasts, e2 flash cards and exams (both from FX), e3 Games. Flash and exam need no review (FX).
-- A contribution made in a studio (studio not null) is submitted only after check_contribution passed on its current
-- items, title and format; the upload form (studio null) is unchanged.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e3','t.gamemaker@test.local');
update public.profiles set business_line='Consulting' where id = '00000000-0000-0000-0000-0000000000e3';
insert into public.creator_rules (user_id, lines, formats) values ('00000000-0000-0000-0000-0000000000e3','{Consulting}','{Game}');
insert into results (check_name, expected, actual) select 'ST studio_draft use is seeded, text and off', 'text/false', kind||'/'||enabled from public.ai_uses where key = 'studio_draft';
with i as (insert into public.creator_rules (user_id, formats) values ('00000000-0000-0000-0000-0000000000e3', '{Avatar,Game,Slides,"Animated flow","Interactive explainer","Job aid","Case exercise"}') returning 1)
  insert into results (check_name, expected, actual) select 'ST creation rules take every studio format', '1 rows', count(*)||' rows' from i;
with i as (insert into public.review_policies (formats, peers, expert, quality) values ('{Avatar,Game,Slides,"Animated flow","Interactive explainer","Job aid","Case exercise"}', 1, true, true) returning 1)
  insert into results (check_name, expected, actual) select 'ST review requirements take every studio format', '1 rows', count(*)||' rows' from i;
delete from public.creator_rules where user_id = '00000000-0000-0000-0000-0000000000e3' and lines = '{}';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$ begin
  begin insert into public.contributions (business_line, type, title, domain, takeaway) values ('Consulting','Game','T st podcaster game','pers','x');
    insert into results (check_name, expected, actual) values ('ST a Podcast-only rule cannot create a Game', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST a Podcast-only rule cannot create a Game', 'blocked', 'blocked: '||sqlstate); end;
end $$;
with i as (insert into public.contributions (business_line, type, title, domain, takeaway) values ('Consulting','Podcast','T st plain podcast','pers','Listen first.') returning 1)
  insert into results (check_name, expected, actual) select 'ST a plain upload of an upload-form format is still created', '1 rows', count(*)||' rows' from i;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
do $$ begin
  begin insert into public.contributions (business_line, type, title, domain, takeaway) values ('Consulting','Game','T st plain game','pers','Find the flaw.');
    insert into results (check_name, expected, actual) values ('ST a Game without a studio (skipping the check)', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST a Game without a studio (skipping the check)', 'blocked: 23514', 'blocked: '||sqlstate); end;
end $$;
with i as (insert into public.contributions (business_line, type, title, domain, takeaway, studio) values ('Consulting','Game','T st game','pers','Find the flaw.','game') returning 1)
  insert into results (check_name, expected, actual) select 'ST a Game rule creates a Game in the Game Studio', '1 rows', count(*)||' rows' from i;
insert into results (check_name, expected, actual) select 'ST a studio format without an item shape yet fails the check', 'Add the items first',
  array_to_string(public.check_contribution((select id from public.contributions where title = 'T st game')), '|');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
insert into public.contributions (business_line, type, title, domain, takeaway, items, studio) values
 ('Consulting','Flash cards','T st deck','pers','Lead with the answer.','[["Standard rate?","25 %"],["SME rate?","20 %"],["Pillar Two rate?","15 %"],["Advance payments?","Four"]]','flash'),
 ('Consulting','Flash cards','T st short','pers','Lead with the answer.','[["Standard rate?","25 %"],["What did Delcroix pay?","Too much"]]','flash'),
 ('Consulting','Flash cards','T st wrong studio','pers','Lead with the answer.','[["a","b"],["c","d"],["e","f"],["g","h"]]','reel'),
 ('Consulting','Flash cards','T st plain','pers','Lead with the answer.','[["Standard rate?","25 %"]]',null);
insert into results (check_name, expected, actual) select 'ST the studio is stored, nothing is checked yet', 'flash/null', studio||'/'||coalesce(check_passed_at::text, 'null') from public.contributions where title = 'T st deck';
do $$ begin
  begin perform public.submit_contribution((select id from public.contributions where title = 'T st deck'));
    insert into results (check_name, expected, actual) values ('ST a studio submit without a passed check', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST a studio submit without a passed check', 'blocked: P0001', 'blocked: '||sqlstate); end;
  begin update public.contributions set check_fingerprint = 'x', check_passed_at = now() where title = 'T st deck';
    insert into results (check_name, expected, actual) values ('ST the author writes a passed check directly', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST the author writes a passed check directly', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin update public.contributions set studio = null where title = 'T st deck';
    insert into results (check_name, expected, actual) values ('ST the author drops the studio to skip the check', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST the author drops the studio to skip the check', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'ST a failing check returns every reason', 'Add at least 4 items|“Delcroix” looks like a client name · anonymise it',
  array_to_string(public.check_contribution((select id from public.contributions where title = 'T st short')), '|');
insert into results (check_name, expected, actual) select 'ST a studio that does not make the format fails the check', 'This studio does not make Flash cards',
  array_to_string(public.check_contribution((select id from public.contributions where title = 'T st wrong studio')), '|');
insert into results (check_name, expected, actual) select 'ST a clean deck passes the check', '{}', public.check_contribution((select id from public.contributions where title = 'T st deck'))::text;
insert into results (check_name, expected, actual) select 'ST a pass stores its time and a fingerprint', 'true/32', (check_passed_at is not null)::text||'/'||char_length(check_fingerprint) from public.contributions where title = 'T st deck';
update public.contributions set items = '[["Standard rate?","25 %"],["SME rate?","20 %"],["Pillar Two rate?","15 %"],["Advance payments?","Four instalments"]]' where title = 'T st deck';
do $$ begin
  begin perform public.submit_contribution((select id from public.contributions where title = 'T st deck'));
    insert into results (check_name, expected, actual) values ('ST items changed after the check', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST items changed after the check', 'blocked: P0001', 'blocked: '||sqlstate); end;
end $$;
update public.contributions set title = 'T st deck renamed' where title = 'T st deck';
insert into results (check_name, expected, actual) select 'ST checked again after the edits', '{}', public.check_contribution((select id from public.contributions where title = 'T st deck renamed'))::text;
update public.contributions set title = 'T st deck' where title = 'T st deck renamed';
do $$ begin
  begin perform public.submit_contribution((select id from public.contributions where title = 'T st deck'));
    insert into results (check_name, expected, actual) values ('ST the title changed after the check', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST the title changed after the check', 'blocked: P0001', 'blocked: '||sqlstate); end;
end $$;
-- a failure after a pass clears it
update public.contributions set items = '[["Standard rate?","25 %"]]' where title = 'T st deck';
insert into results (check_name, expected, actual) select 'ST a failed check after a pass says why', 'Add at least 4 items',
  array_to_string(public.check_contribution((select id from public.contributions where title = 'T st deck')), '|');
insert into results (check_name, expected, actual) select 'ST a failed check after a pass clears the pass', 'null/null',
  coalesce(check_passed_at::text, 'null')||'/'||coalesce(check_fingerprint, 'null') from public.contributions where title = 'T st deck';
update public.contributions set items = '[["Standard rate?","25 %"],["SME rate?","20 %"],["Pillar Two rate?","15 %"],["Advance payments?","Four instalments"]]' where title = 'T st deck';
insert into results (check_name, expected, actual) select 'ST re-checked, the studio deck is sent', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T st deck'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T st deck'));
insert into results (check_name, expected, actual) select 'ST a plain upload is sent without a check', 'published', public.submit_contribution((select id from public.contributions where title = 'T st plain'));
do $$ begin
  begin perform public.check_contribution((select id from public.contributions where title = 'T st deck'));
    insert into results (check_name, expected, actual) values ('ST checking a published contribution', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST checking a published contribution', 'blocked: P0001', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$ begin
  begin perform public.check_contribution((select id from public.contributions where title = 'T st short'));
    insert into results (check_name, expected, actual) values ('ST someone else checks a contribution', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST someone else checks a contribution', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin perform public.check_contribution('00000000-0000-0000-0000-000000000000');
    insert into results (check_name, expected, actual) values ('ST checking a contribution that does not exist', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST checking a contribution that does not exist', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin perform public.check_contribution((select '00000000-0000-0000-0000-000000000000'::uuid));
    insert into results (check_name, expected, actual) values ('ST anon checks a contribution', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ST anon checks a contribution', 'blocked', 'blocked: '||sqlstate); end;
end $$;
reset role;
-- ---------- design v4 follow-ups: industry and technology membership (AM) ----------
-- audience_members: the counsellor, the person's Domain Admins, General and System Admins set a person's ind:/tec: audiences;
-- never the person. A mandatory map on such an audience binds its members at the map's stage.
-- d1: Consulting analyst, counsellor a6. d3: Audit consultant, counsellor a6 (becomes a tec:data member). d4: Audit consultant,
-- no membership. a2 counsels someone else, a1 is the Consulting Domain Admin, a4 the Audit Domain Admin, a7 a General Admin.
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d3','t.member@test.local'), ('00000000-0000-0000-0000-0000000000d4','t.nonmember@test.local');
update public.profiles set business_line='Audit', career_stage='Consultant', counsellor_id='00000000-0000-0000-0000-0000000000a6' where id in ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d4');
update public.profiles set career_stage='Analyst' where id='00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
-- the counsellor a6 sets and removes a counsellee's audience
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
with i as (insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000d1','tec:data') returning 1)
  insert into results (check_name, expected, actual) select 'AM counsellor sets a counsellee''s technology', '1 rows', count(*)||' rows' from i;
with d as (delete from public.audience_members where user_id='00000000-0000-0000-0000-0000000000d1' and audience='tec:data' returning 1)
  insert into results (check_name, expected, actual) select 'AM counsellor removes it', '1 rows', count(*)||' rows' from d;
insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000d1','tec:data'), ('00000000-0000-0000-0000-0000000000d3','tec:data');
insert into results (check_name, expected, actual) select 'AM counsellor reads the counsellees'' audiences', '2', count(*)::text from public.audience_members where user_id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d3');
do $$ begin
  begin insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000d1','amb:sust');
    insert into results (check_name, expected, actual) values ('AM an ambition is not a membership', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM an ambition is not a membership', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000d1','tec:Data');
    insert into results (check_name, expected, actual) values ('AM a malformed audience', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM a malformed audience', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.audience_members (user_id, audience, set_by) values ('00000000-0000-0000-0000-0000000000d1','ind:health','00000000-0000-0000-0000-0000000000a7');
    insert into results (check_name, expected, actual) values ('AM set_by cannot be chosen', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM set_by cannot be chosen', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin update public.audience_members set audience = 'tec:sap' where user_id = '00000000-0000-0000-0000-0000000000d1';
    insert into results (check_name, expected, actual) values ('AM a membership is not updated', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM a membership is not updated', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- someone else's counsellor a2: reads nothing, sets nothing, removes nothing
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'AM someone else''s counsellor reads the audiences', '0', count(*)::text from public.audience_members where user_id = '00000000-0000-0000-0000-0000000000d1';
with d as (delete from public.audience_members where user_id = '00000000-0000-0000-0000-0000000000d1' returning 1)
  insert into results (check_name, expected, actual) select 'AM someone else''s counsellor removes one', '0 rows', count(*)||' rows' from d;
do $$ begin
  begin insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000d1','ind:energy');
    insert into results (check_name, expected, actual) values ('AM someone else''s counsellor sets one', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM someone else''s counsellor sets one', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- the person reads their own, never sets or removes them
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'AM the person reads their own', 'tec:data', string_agg(audience, ' ') from public.audience_members where user_id = '00000000-0000-0000-0000-0000000000d1';
with d as (delete from public.audience_members where user_id = '00000000-0000-0000-0000-0000000000d1' returning 1)
  insert into results (check_name, expected, actual) select 'AM the person removes their own', '0 rows', count(*)||' rows' from d;
do $$ begin
  begin insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000d1','ind:health');
    insert into results (check_name, expected, actual) values ('AM the person sets their own', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM the person sets their own', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- Domain Admins: the person's line (a1 for Consulting d1) sets one; another line's (a4, Audit) does not
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
with i as (insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000d1','ind:energy') returning set_by)
  insert into results (check_name, expected, actual) select 'AM the person''s Domain Admin sets one (set_by is them)', '1 rows true', count(*)||' rows '||bool_and(set_by = '00000000-0000-0000-0000-0000000000a1') from i;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
with d as (delete from public.audience_members where user_id = '00000000-0000-0000-0000-0000000000d1' returning 1)
  insert into results (check_name, expected, actual) select 'AM another line''s Domain Admin removes one', '0 rows', count(*)||' rows' from d;
do $$ begin
  begin insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000d1','ind:public');
    insert into results (check_name, expected, actual) values ('AM another line''s Domain Admin sets one', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM another line''s Domain Admin sets one', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- a General Admin sets one and reads them all
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
with i as (insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000d1','ind:health') returning 1)
  insert into results (check_name, expected, actual) select 'AM a General Admin sets one', '1 rows', count(*)||' rows' from i;
insert into results (check_name, expected, actual) select 'AM a General Admin reads them', 'ind:energy ind:health tec:data', string_agg(audience, ' ' order by audience) from public.audience_members where user_id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin
  begin insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000a7','tec:ai');
    insert into results (check_name, expected, actual) values ('AM a General Admin sets their own', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM a General Admin sets their own', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- a Domain Admin of their own line (a1, Consulting) manages themselves, yet never sets their own membership
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  begin insert into public.audience_members (user_id, audience) values ('00000000-0000-0000-0000-0000000000a1','tec:ai');
    insert into results (check_name, expected, actual) values ('AM a Domain Admin sets their own', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM a Domain Admin sets their own', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- the System Admin neither
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
do $$ begin
  begin insert into public.audience_members (user_id, audience) values (current_setting('test.sa')::uuid, 'tec:ai');
    insert into results (check_name, expected, actual) values ('AM a System Admin sets their own', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM a System Admin sets their own', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
-- a mandatory tec:data map binds members at its stage (a General Admin publishes it, D2)
insert into public.trajectories (id, name, issuer, credential, enrol, months, status, business_line, steps, maps)
  values ('TX4', 'T data mandatory', 'T issuer', 'T credential', 'auto', 6, 'live', null,
          '[{"id":"s1","k":"evidence","title":"T pipeline"},{"id":"s2","k":"exam","title":"T exam","pre":"s1"}]', '[["tec:data","Consultant","mandatory"]]');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'AM a member at the map''s stage: the first action writes the row', 'submitted', public.submit_trajectory_step('TX4', 's1', p_note => 'T built the pipeline');
do $$ begin
  begin perform public.withdraw_trajectory('TX4');
    insert into results (check_name, expected, actual) values ('AM a member leaves the mandatory trajectory', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM a member leaves the mandatory trajectory', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
do $$ begin
  begin perform public.submit_trajectory_step('TX4', 's1', p_note => 'T not my stage');
    insert into results (check_name, expected, actual) values ('AM a member at another stage is not bound', 'blocked: P0002', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM a member at another stage is not bound', 'blocked: P0002', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}';
do $$ begin
  begin perform public.submit_trajectory_step('TX4', 's1', p_note => 'T not a member');
    insert into results (check_name, expected, actual) values ('AM a non-member is not bound', 'blocked: P0002', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM a non-member is not bound', 'blocked: P0002', 'blocked: '||sqlstate); end;
end $$;
select public.request_trajectory('TX4');
select public.withdraw_trajectory('TX4');
insert into results (check_name, expected, actual) select 'AM a non-member starts and leaves it like an open one', '0', count(*)::text from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d4' and trajectory_id = 'TX4';
-- the counsellor removes the membership; with no step done the row may be left
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
delete from public.audience_members where user_id = '00000000-0000-0000-0000-0000000000d3' and audience = 'tec:data';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select public.withdraw_trajectory('TX4');
insert into results (check_name, expected, actual) select 'AM without the membership the former member leaves', '0', count(*)::text from public.trajectory_enrolments where user_id = '00000000-0000-0000-0000-0000000000d3' and trajectory_id = 'TX4';
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin perform count(*) from public.audience_members; insert into results (check_name, expected, actual) values ('AM anon reads memberships', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('AM anon reads memberships', 'blocked', 'blocked: '||sqlstate); end;
end $$;
reset role;
-- ---------- design v4 follow-ups: credential renewal by proof (RN) ----------
-- d1 holds T3's credential (made to expire in 10 days here) and external ones: expiring in 30 and 31 days, expired 40
-- days ago, without expiry, and one still waiting.
update public.credentials set expires_on = current_date + 10 where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T3' and expires_on > current_date;
select set_config('test.rn_trj', (select id::text from public.credentials where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T3' and expires_on = current_date + 10), true);
insert into public.credentials (user_id, name, issuer, earned_on, expires_on, ref, status) values
 ('00000000-0000-0000-0000-0000000000d1', 'T ext in 30 days', 'T issuer', '2024-01-01', current_date + 30, 'R-30', 'confirmed'),
 ('00000000-0000-0000-0000-0000000000d1', 'T ext in 31 days', 'T issuer', '2024-01-01', current_date + 31, 'R-31', 'confirmed'),
 ('00000000-0000-0000-0000-0000000000d1', 'T ext expired', 'T issuer', '2023-01-01', current_date - 40, 'R-EX', 'confirmed'),
 ('00000000-0000-0000-0000-0000000000d1', 'T ext no expiry', 'T issuer', '2023-01-01', null, 'R-NO', 'confirmed'),
 ('00000000-0000-0000-0000-0000000000d1', 'T ext waiting', 'T issuer', '2023-01-01', current_date + 5, 'R-W', 'waiting');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
do $$ begin
  begin perform public.submit_renewal(current_setting('test.rn_trj')::uuid, p_ref => 'R-NEW');
    insert into results (check_name, expected, actual) values ('RN renewing someone else''s credential', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN renewing someone else''s credential', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
do $$ begin
  begin perform public.submit_renewal((select id from public.credentials where name = 'T ext waiting'), p_ref => 'R-NEW', p_expires => current_date + 365);
    insert into results (check_name, expected, actual) values ('RN renewing a waiting credential', 'blocked: P0002', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN renewing a waiting credential', 'blocked: P0002', 'blocked: '||sqlstate); end;
  begin perform public.submit_renewal((select id from public.credentials where name = 'T ext in 31 days'), p_ref => 'R-NEW', p_expires => current_date + 365);
    insert into results (check_name, expected, actual) values ('RN renewing more than 30 days before expiry', 'blocked: P0002', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN renewing more than 30 days before expiry', 'blocked: P0002', 'blocked: '||sqlstate); end;
  begin perform public.submit_renewal((select id from public.credentials where name = 'T ext no expiry'), p_ref => 'R-NEW', p_expires => current_date + 365);
    insert into results (check_name, expected, actual) values ('RN renewing a credential that does not expire', 'blocked: P0002', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN renewing a credential that does not expire', 'blocked: P0002', 'blocked: '||sqlstate); end;
  begin perform public.submit_renewal((select id from public.credentials where name = 'T ext in 30 days'), p_link => '  ', p_ref => ' ', p_expires => current_date + 365);
    insert into results (check_name, expected, actual) values ('RN a renewal without a link or number', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN a renewal without a link or number', 'blocked: 22023', 'blocked: '||sqlstate); end;
  begin perform public.submit_renewal((select id from public.credentials where name = 'T ext in 30 days'), p_link => 'ftp://cert.example/x', p_expires => current_date + 365);
    insert into results (check_name, expected, actual) values ('RN a renewal with a link that is not http(s)', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN a renewal with a link that is not http(s)', 'blocked: 22023', 'blocked: '||sqlstate); end;
  begin perform public.submit_renewal((select id from public.credentials where name = 'T ext in 30 days'), p_ref => repeat('9', 81), p_expires => current_date + 365);
    insert into results (check_name, expected, actual) values ('RN a renewal with a certificate number over 80 characters', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN a renewal with a certificate number over 80 characters', 'blocked: 22023', 'blocked: '||sqlstate); end;
  begin perform public.submit_renewal(current_setting('test.rn_trj')::uuid, p_ref => 'R-NEW', p_expires => current_date + 365);
    insert into results (check_name, expected, actual) values ('RN a trajectory credential takes no expiry date', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN a trajectory credential takes no expiry date', 'blocked: 22023', 'blocked: '||sqlstate); end;
  begin perform public.submit_renewal((select id from public.credentials where name = 'T ext in 30 days'), p_ref => 'R-NEW');
    insert into results (check_name, expected, actual) values ('RN an external renewal without a new expiry date', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN an external renewal without a new expiry date', 'blocked: 22023', 'blocked: '||sqlstate); end;
  begin perform public.submit_renewal((select id from public.credentials where name = 'T ext in 30 days'), p_ref => 'R-NEW', p_expires => current_date);
    insert into results (check_name, expected, actual) values ('RN an external renewal expiring today', 'blocked: 22023', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN an external renewal expiring today', 'blocked: 22023', 'blocked: '||sqlstate); end;
  begin insert into public.credentials (user_id, name, issuer, earned_on, ref, renewal_of) values ('00000000-0000-0000-0000-0000000000d1', 'T forged renewal', 'T issuer', current_date, 'R-F', current_setting('test.rn_trj')::uuid);
    insert into results (check_name, expected, actual) values ('RN the learner writes renewal_of directly', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN the learner writes renewal_of directly', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin update public.credentials set superseded_at = now() where id = current_setting('test.rn_trj')::uuid;
    insert into results (check_name, expected, actual) values ('RN the learner stamps superseded_at directly', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN the learner stamps superseded_at directly', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'RN renewing 30 days before expiry is allowed', 'waiting', public.submit_renewal((select id from public.credentials where name = 'T ext in 30 days'), p_ref => 'R-30-NEW', p_expires => current_date + 365);
insert into results (check_name, expected, actual) select 'RN renewing an expired credential is allowed', 'waiting', public.submit_renewal((select id from public.credentials where name = 'T ext expired'), p_link => ' https://cert.example/renewed ', p_expires => current_date + 400);
insert into results (check_name, expected, actual) select 'RN renewing a trajectory credential is allowed', 'waiting', public.submit_renewal(current_setting('test.rn_trj')::uuid, p_ref => ' CSRD-456 ');
insert into results (check_name, expected, actual) select 'RN the waiting renewal copies name, issuer and trajectory; expiry from the learner only for an external one',
  'CSRD practitioner · internal academy|Internal academy|T3|waiting|CSRD-456|null|true',
  string_agg(name||'|'||issuer||'|'||coalesce(trajectory_id, '-')||'|'||status||'|'||coalesce(ref, '-')||'|'||coalesce(expires_on::text, 'null')||'|'||(earned_on = current_date), ', ')
  from public.credentials where renewal_of = current_setting('test.rn_trj')::uuid;
insert into results (check_name, expected, actual) select 'RN the external renewal keeps the trimmed link and the new expiry', 'https://cert.example/renewed|true',
  max(link)||'|'||(max(expires_on) = current_date + 400) from public.credentials where renewal_of = (select id from public.credentials where name = 'T ext expired' and renewal_of is null);
do $$ begin
  begin perform public.submit_renewal(current_setting('test.rn_trj')::uuid, p_ref => 'CSRD-789');
    insert into results (check_name, expected, actual) values ('RN a second waiting renewal of the same credential', 'blocked: 23505', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN a second waiting renewal of the same credential', 'blocked: 23505', 'blocked: '||sqlstate); end;
  begin perform public.confirm_credential((select id from public.credentials where renewal_of = current_setting('test.rn_trj')::uuid));
    insert into results (check_name, expected, actual) values ('RN the learner confirms the own renewal', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN the learner confirms the own renewal', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- the owner withdraws a waiting renewal with the existing remove of a waiting row
with d as (delete from public.credentials where ref = 'R-30-NEW' returning 1)
  insert into results (check_name, expected, actual) select 'RN the learner removes the own waiting renewal', '1', count(*)::text from d;
insert into results (check_name, expected, actual) select 'RN after removing it the credential can be renewed again', 'waiting', public.submit_renewal((select id from public.credentials where name = 'T ext in 30 days'), p_ref => 'R-30-AGAIN', p_expires => current_date + 365);
-- someone else's counsellor confirms nothing; the counsellor confirms and the old row is superseded in the same step
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$ begin
  begin perform public.confirm_credential('00000000-0000-0000-0000-000000000000'::uuid);
    insert into results (check_name, expected, actual) values ('RN confirming a credential that does not exist', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN confirming a credential that does not exist', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
select set_config('test.rn_new', (select id::text from public.credentials where renewal_of = current_setting('test.rn_trj')::uuid), true);
insert into results (check_name, expected, actual) select 'RN the counsellor confirms the trajectory renewal', 'confirmed', public.confirm_credential(current_setting('test.rn_new')::uuid);
insert into results (check_name, expected, actual) select 'RN the renewal is earned today and runs valid_months from today', 'confirmed|true|true|00000000-0000-0000-0000-0000000000a6',
  status||'|'||(earned_on = current_date)||'|'||(expires_on = (current_date + interval '24 months')::date)||'|'||confirmed_by from public.credentials where id = current_setting('test.rn_new')::uuid;
insert into results (check_name, expected, actual) select 'RN the old credential is superseded, the renewal is not', 'true|false',
  (select (superseded_at is not null)::text from public.credentials where id = current_setting('test.rn_trj')::uuid)||'|'||(select (superseded_at is not null)::text from public.credentials where id = current_setting('test.rn_new')::uuid);
insert into results (check_name, expected, actual) select 'RN the counsellor confirms the external renewal', 'confirmed', public.confirm_credential((select id from public.credentials where link = 'https://cert.example/renewed'));
insert into results (check_name, expected, actual) select 'RN the external renewal keeps the learner''s expiry; the expired one is superseded', 'confirmed|true|true|true',
  (select status||'|'||(earned_on = current_date)||'|'||(expires_on = current_date + 400) from public.credentials where link = 'https://cert.example/renewed')
  ||'|'||(select (superseded_at is not null)::text from public.credentials where name = 'T ext expired' and renewal_of is null);
do $$ begin
  begin perform public.confirm_credential(current_setting('test.rn_new')::uuid);
    insert into results (check_name, expected, actual) values ('RN confirming the same renewal twice', 'blocked: P0002', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN confirming the same renewal twice', 'blocked: P0002', 'blocked: '||sqlstate); end;
end $$;
-- an external renewal whose date passed while it waited is refused at confirm (put in by hand: submit_renewal needs a future date)
reset role;
insert into public.credentials (user_id, name, issuer, earned_on, ref, renewal_of, expires_on) values ('00000000-0000-0000-0000-0000000000d1', 'T ext no expiry', 'T issuer', current_date, 'R-STALE', (select id from public.credentials where name = 'T ext no expiry' and renewal_of is null), current_date);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
do $$ begin
  begin perform public.confirm_credential((select id from public.credentials where ref = 'R-STALE'));
    insert into results (check_name, expected, actual) values ('RN confirming an external renewal whose expiry date has passed', 'blocked: P0002', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN confirming an external renewal whose expiry date has passed', 'blocked: P0002', 'blocked: '||sqlstate); end;
end $$;
reset role;
delete from public.credentials where ref = 'R-STALE';
-- a renewal of an already superseded credential (put in by hand: submit_renewal refuses it) is refused at confirm
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
do $$ begin
  begin perform public.submit_renewal(current_setting('test.rn_trj')::uuid, p_ref => 'CSRD-789');
    insert into results (check_name, expected, actual) values ('RN renewing a superseded credential', 'blocked: P0002', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN renewing a superseded credential', 'blocked: P0002', 'blocked: '||sqlstate); end;
end $$;
reset role;
insert into public.credentials (user_id, name, issuer, earned_on, ref, trajectory_id, renewal_of) values ('00000000-0000-0000-0000-0000000000d1', 'CSRD practitioner · internal academy', 'Internal academy', current_date, 'CSRD-DUP', 'T3', current_setting('test.rn_trj')::uuid);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
do $$ begin
  begin perform public.confirm_credential((select id from public.credentials where ref = 'CSRD-DUP'));
    insert into results (check_name, expected, actual) values ('RN confirming a renewal of a superseded credential', 'blocked: P0002', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN confirming a renewal of a superseded credential', 'blocked: P0002', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'RN confirm supersedes exactly once: one superseded T3 row, the hand-made renewal still waits', '1|waiting',
  (select count(*) from public.credentials where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T3' and superseded_at is not null)||'|'||(select status from public.credentials where ref = 'CSRD-DUP');
-- the exam guard ignores a superseded row: with the renewal expired, the superseded (still unexpired) row does not block
reset role;
delete from public.credentials where ref = 'CSRD-DUP';
update public.credentials set expires_on = current_date - 1 where id = current_setting('test.rn_new')::uuid;
update public.trajectory_enrolments set steps = jsonb_set(steps, '{s6,state}', '"submitted"') where user_id = '00000000-0000-0000-0000-0000000000d1' and trajectory_id = 'T3';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'RN the exam guard ignores a superseded, unexpired credential', 'done', public.decide_trajectory('00000000-0000-0000-0000-0000000000d1', 'T3', 's6', 'approve');
set local role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin
  begin perform public.submit_renewal(current_setting('test.rn_trj')::uuid, p_ref => 'X'); insert into results (check_name, expected, actual) values ('RN anon submits a renewal', 'blocked', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('RN anon submits a renewal', 'blocked', 'blocked: '||sqlstate); end;
end $$;
reset role;
-- ---------- Job Aid Studio and Case Studio: studio rows, their check and the content they publish (SC) ----------
-- e5 makes Job aids and Case exercises in their studios (and Podcasts). Here neither needs a review, so a passed check
-- publishes on submit. Rows are [label, text] or [label, text, text2]; publishing turns them into the learning's aid or
-- case content (private.aid_content, private.case_content); the case reads the "Shape it" answers kept in `shape`.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e5','t.aidmaker@test.local');
update public.profiles set business_line='Consulting' where id = '00000000-0000-0000-0000-0000000000e5';
insert into public.creator_rules (user_id, lines, formats) values ('00000000-0000-0000-0000-0000000000e5','{Consulting}','{"Job aid","Case exercise",Podcast}');
delete from public.review_policies; -- earlier checks left stricter requirements; the strictest would win
insert into public.review_policies (formats, peers, expert, quality) values ('{"Job aid","Case exercise"}', 0, false, false);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e5","role":"authenticated"}';
with i as (insert into public.contributions (business_line, type, title, domain, takeaway, items, studio) values
 ('Consulting','Job aid','T sc aid','prof','Tick it before the kick-off.','[["Before","Objectives and scope confirmed "],["Before","Stakeholder map ready"],["During","Agree who signs off"],["After","Minutes out within 24 hours"]]','aid') returning 1)
  insert into results (check_name, expected, actual) select 'SC a Job aid made in its studio keeps its rows', '1 rows', count(*)||' rows' from i;
insert into public.contributions (business_line, type, title, domain, takeaway, items, studio, shape) values
 ('Consulting','Case exercise','T sc case','tech','Decide, do not list options.','[["Brief","Two companies merged on 1 October."],["Deliverable","A day-100 roadmap"],["Deliverable","Three decisions for the CFO"],["Criterion","Realistic sequencing"]]','case',
  '{"Can it count as trajectory evidence?":"Yes","How long should it take?":"A full day"}'),
 ('Consulting','Case exercise','T sc case no','tech','Decide.','[["Brief","A merger."],["Deliverable","A roadmap"],["Deliverable","Decisions"],["Criterion","Realism"]]','case','{"Can it count as trajectory evidence?":"No","How long should it take?":"2 hours"}'),
 ('Consulting','Case exercise','T sc case unanswered','tech','Decide.','[["Brief","A merger."],["Deliverable","A roadmap"],["Deliverable","Decisions"],["Criterion","Realism"]]','case',null),
 ('Consulting','Job aid','T sc aid one field','prof','x','[["Before"],["Before","b"],["During","c"],["After","d"]]','aid',null),
 ('Consulting','Job aid','T sc aid blank text','prof','x','[["Before"," "],["Before","b"],["During","c"],["After","d"]]','aid',null),
 ('Consulting','Job aid','T sc aid number','prof','x','[["Before","a",3],["Before","b"],["During","c"],["After","d"]]','aid',null),
 ('Consulting','Case exercise','T sc case no criterion','tech','x','[["Brief","A merger."],["Deliverable","A roadmap"],["Deliverable","Decisions"],["Deliverable","Risks"]]','case',null),
 ('Consulting','Case exercise','T sc case odd label','tech','x','[["Brief","A merger."],["Deliverable","A roadmap"],["Criterion","Realism"],["Note","Bring coffee"]]','case',null);
insert into public.contributions (business_line, type, title, domain, takeaway, items, studio) values
 ('Consulting','Job aid','T sc aid long label','prof','x', jsonb_build_array(jsonb_build_array(repeat('x', 301), 'a'), '["Before","b"]'::jsonb, '["During","c"]'::jsonb, '["After","d"]'::jsonb),'aid'),
 ('Consulting','Job aid','T sc aid long text','prof','x', jsonb_build_array(jsonb_build_array('Before', repeat('x', 601)), '["Before","b"]'::jsonb, '["During","c"]'::jsonb, '["After","d"]'::jsonb),'aid');
do $$ begin
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items, studio) values ('Consulting','Job aid','T sc aid too many','prof','x', (select jsonb_agg(jsonb_build_array('Check', 'line '||g)) from generate_series(1, 21) g),'aid');
    insert into results (check_name, expected, actual) values ('SC more rows than a Job aid holds (20)', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC more rows than a Job aid holds (20)', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items, studio) values ('Consulting','Case exercise','T sc case too many','tech','x', (select jsonb_agg(jsonb_build_array('Criterion', 'c'||g)) from generate_series(1, 13) g),'case');
    insert into results (check_name, expected, actual) values ('SC more rows than a Case exercise holds (12)', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC more rows than a Case exercise holds (12)', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items) values ('Consulting','Job aid','T sc plain aid','prof','x','[["Before","a"],["Before","b"],["During","c"],["After","d"]]');
    insert into results (check_name, expected, actual) values ('SC a plain upload cannot make a Job aid', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC a plain upload cannot make a Job aid', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items) values ('Consulting','Podcast','T sc plain podcast rows','prof','x','[["Chapter 1 · 0:00","Intro"]]');
    insert into results (check_name, expected, actual) values ('SC a plain upload of an upload-form format carries no rows', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC a plain upload of an upload-form format carries no rows', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items, studio, shape) values ('Consulting','Job aid','T sc shape list','prof','x',null,'aid','["Yes"]');
    insert into results (check_name, expected, actual) values ('SC the answers are an object, not a list', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC the answers are an object, not a list', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items, studio, shape) values ('Consulting','Job aid','T sc shape number','prof','x',null,'aid','{"Template?":1}');
    insert into results (check_name, expected, actual) values ('SC every answer is text', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC every answer is text', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items, studio, shape) values ('Consulting','Job aid','T sc shape inner list','prof','x',null,'aid','{"Template?":["x"]}');
    insert into results (check_name, expected, actual) values ('SC a list of texts is not an answer', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC a list of texts is not an answer', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items, studio, shape) values ('Consulting','Job aid','T sc shape empty list','prof','x',null,'aid','{"Template?":[]}');
    insert into results (check_name, expected, actual) values ('SC an empty list is not an answer', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC an empty list is not an answer', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.contributions (business_line, type, title, domain, takeaway, shape) values ('Consulting','Podcast','T sc plain answers','prof','x','{"Format?":"Solo talk"}');
    insert into results (check_name, expected, actual) values ('SC a plain upload carries no answers', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC a plain upload carries no answers', 'blocked: 23514', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'SC a row without a text fails the check', 'Add the items first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T sc aid one field')), '|');
insert into results (check_name, expected, actual) select 'SC a blank text fails the check', 'Add the items first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T sc aid blank text')), '|');
insert into results (check_name, expected, actual) select 'SC a row field that is not text fails the check', 'Add the items first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T sc aid number')), '|');
insert into results (check_name, expected, actual) select 'SC a label over 300 characters fails the check', 'Add the items first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T sc aid long label')), '|');
insert into results (check_name, expected, actual) select 'SC a text over 600 characters fails the check', 'Add the items first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T sc aid long text')), '|');
insert into results (check_name, expected, actual) select 'SC a case without a Criterion fails the check', 'Add the items first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T sc case no criterion')), '|');
insert into results (check_name, expected, actual) select 'SC a case row outside Brief, Deliverable and Criterion fails the check', 'Add the items first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T sc case odd label')), '|');
do $$ begin
  begin perform public.submit_contribution((select id from public.contributions where title = 'T sc aid one field'));
    insert into results (check_name, expected, actual) values ('SC malformed rows are not sent', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC malformed rows are not sent', 'blocked: P0001', 'blocked: '||sqlstate); end;
end $$;
insert into public.contributions (business_line, type, title, domain, takeaway, items, studio, shape) values
 ('Consulting','Job aid','T sc aid answers','prof','x','[["Before","a"],["Before","b"],["During","c"],["After","d"]]','aid','{"When is it used?":"Before a meeting"}'),
 ('Consulting','Job aid','T sc aid client answer','prof','x','[["Before","a"],["Before","b"],["During","c"],["After","d"]]','aid','{"When is it used?":"For Delcroix"}');
insert into results (check_name, expected, actual) select 'SC a client name in an answer fails the check', '“Delcroix” looks like a client name · anonymise it',
  array_to_string(public.check_contribution((select id from public.contributions where title = 'T sc aid client answer')), '|');
insert into results (check_name, expected, actual) select 'SC answers with rows pass the check', '{}', public.check_contribution((select id from public.contributions where title = 'T sc aid answers'))::text;
update public.contributions set shape = '{"When is it used?":"After a deliverable"}' where title = 'T sc aid answers';
do $$ begin
  begin perform public.submit_contribution((select id from public.contributions where title = 'T sc aid answers'));
    insert into results (check_name, expected, actual) values ('SC answers changed after the check', 'blocked: P0001', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC answers changed after the check', 'blocked: P0001', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'SC a clean job aid passes the check and is published', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T sc aid'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T sc aid'));
insert into results (check_name, expected, actual) select 'SC the job aid becomes aid content, one line per row', '{"kind": "aid", "items": ["Before · Objectives and scope confirmed", "Before · Stakeholder map ready", "During · Agree who signs off", "After · Minutes out within 24 hours"]}'::jsonb::text,
  l.content::text from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T sc aid';
insert into results (check_name, expected, actual) select 'SC the published job aid keeps its format', 'Job aid/published/0.25', l.format||'/'||l.status||'/'||l.hours
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T sc aid';
insert into results (check_name, expected, actual) select 'SC a clean case passes the check and is published', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T sc case'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T sc case'));
insert into results (check_name, expected, actual) select 'SC the case becomes case content that counts as trajectory evidence',
  '{"kind": "case", "brief": "Two companies merged on 1 October.", "deliv": ["A day-100 roadmap", "Three decisions for the CFO"], "rubric": ["Realistic sequencing"], "evidence": true, "reviewer": "Reviewed by your counsellor."}'::jsonb::text,
  l.content::text from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T sc case';
insert into results (check_name, expected, actual) select 'SC a case answered No does not count as evidence: published', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T sc case no'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T sc case no'));
insert into results (check_name, expected, actual) select 'SC a case of a full day counts 8 hours', '8', l.hours::numeric::text
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T sc case';
insert into results (check_name, expected, actual) select 'SC a case of 2 hours counts 2 hours', '2', l.hours::numeric::text
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T sc case no';
insert into results (check_name, expected, actual) select 'SC a case answered No does not count as evidence', 'false', l.content ->> 'evidence'
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T sc case no';
insert into results (check_name, expected, actual) select 'SC an unanswered case does not count as evidence: published', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T sc case unanswered'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T sc case unanswered'));
insert into results (check_name, expected, actual) select 'SC an unanswered case counts half a day', '4', l.hours::numeric::text
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T sc case unanswered';
insert into results (check_name, expected, actual) select 'SC an unanswered case does not count as evidence', 'false', l.content ->> 'evidence'
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T sc case unanswered';
with u as (update public.contributions set items = '[["Brief","changed"]]' where title = 'T sc case' returning 1)
  insert into results (check_name, expected, actual) select 'SC rows cannot change after publishing', '0 rows', count(*)||' rows' from u;
with u as (update public.contributions set shape = '{"Can it count as trajectory evidence?":"No"}' where title = 'T sc case' returning 1)
  insert into results (check_name, expected, actual) select 'SC answers cannot change after publishing', '0 rows', count(*)||' rows' from u;
with u as (update public.contributions set shape = '{"Template?":"Checklist"}' where title = 'T sc aid one field' returning 1)
  insert into results (check_name, expected, actual) select 'SC the author changes the answers of a draft', '1 rows', count(*)||' rows' from u;
reset role;
-- past RLS (as the table owner, with the author's id), the guard still keeps the answers of a published contribution
do $$ begin
  begin update public.contributions set shape = '{"Can it count as trajectory evidence?":"No"}' where title = 'T sc case';
    insert into results (check_name, expected, actual) values ('SC the guard keeps the answers of a published case', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('SC the guard keeps the answers of a published case', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- ---------- Explainer Studio: steps, the optional three-question check, the ending and the content they publish (EX) ----------
-- e5 also makes Interactive explainers, without review. Steps are [label, text] rows; the check is three exam questions
-- after them, published only when "End with?" is the check (private.explainer_ok, private.explainer_content).
reset role;
update public.creator_rules set formats = formats || '{"Interactive explainer"}' where user_id = '00000000-0000-0000-0000-0000000000e5';
update public.review_policies set formats = formats || '{"Interactive explainer"}' where formats = '{"Job aid","Case exercise"}';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e5","role":"authenticated"}';
select set_config('test.ex_steps', '[["Supplier","Creates the invoice. "],["Access point","Checks the format."],["Customer","Gets the invoice."]]', true);
select set_config('test.ex_q', '{"t":"Peppol","q":"Who checks the format?","o":["The supplier","The access point","The customer","The tax office"],"a":1,"why":"The access point checks it."}', true);
insert into public.contributions (business_line, type, title, domain, takeaway, items, studio, shape) values
 ('Consulting','Interactive explainer','T ex check','reg','Peppol carries it.', current_setting('test.ex_steps')::jsonb || jsonb_build_array(current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb),'explainer',
  '{"Depth?":"With technical detail","End with?":"A three-question check"}'),
 ('Consulting','Interactive explainer','T ex summary','reg','Peppol carries it.', current_setting('test.ex_steps')::jsonb,'explainer','{"End with?":"A summary card"}'),
 ('Consulting','Interactive explainer','T ex two questions','reg','x', current_setting('test.ex_steps')::jsonb || jsonb_build_array(current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb),'explainer','{"End with?":"A three-question check"}'),
 ('Consulting','Interactive explainer','T ex bad question','reg','x', current_setting('test.ex_steps')::jsonb || jsonb_build_array(current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb - 'why'),'explainer','{"End with?":"A three-question check"}'),
 ('Consulting','Interactive explainer','T ex check missing','reg','x', current_setting('test.ex_steps')::jsonb,'explainer','{"End with?":"A three-question check"}'),
 ('Consulting','Interactive explainer','T ex check unused','reg','x', current_setting('test.ex_steps')::jsonb || jsonb_build_array(current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb),'explainer','{"End with?":"Nothing"}'),
 ('Consulting','Interactive explainer','T ex too few steps','reg','x', '[["Supplier","a"],["Customer","b"]]'::jsonb || jsonb_build_array(current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb),'explainer','{"End with?":"A three-question check"}'),
 ('Consulting','Interactive explainer','T ex client key','reg','x', current_setting('test.ex_steps')::jsonb,'explainer','{"For Delcroix?":"Nothing"}');
do $$ begin
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items, studio) values ('Consulting','Interactive explainer','T ex too many','reg','x',
      (select jsonb_agg(jsonb_build_array('Step '||g, 'x')) from generate_series(1, 8) g) || jsonb_build_array(current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb),'explainer');
    insert into results (check_name, expected, actual) values ('EX more steps and questions than an explainer holds (10)', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('EX more steps and questions than an explainer holds (10)', 'blocked: 23514', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'EX a check of two questions fails the check', 'Add the items first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T ex two questions')), '|');
insert into results (check_name, expected, actual) select 'EX a question without its explanation fails the check', 'Add the items first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T ex bad question')), '|');
insert into results (check_name, expected, actual) select 'EX ending with the check needs the check', 'Ending with a three-question check needs its three questions',
  array_to_string(public.check_contribution((select id from public.contributions where title = 'T ex check missing')), '|');
insert into results (check_name, expected, actual) select 'EX a check that is not the ending fails the check', 'The check is only shown when the explainer ends with it: remove it, or choose “A three-question check” in Shape it',
  array_to_string(public.check_contribution((select id from public.contributions where title = 'T ex check unused')), '|');
insert into results (check_name, expected, actual) select 'EX the check''s questions do not count as steps', 'Add at least 3 items', array_to_string(public.check_contribution((select id from public.contributions where title = 'T ex too few steps')), '|');
insert into results (check_name, expected, actual) select 'EX a client name in a question of Shape it fails the check', '“Delcroix” looks like a client name · anonymise it',
  array_to_string(public.check_contribution((select id from public.contributions where title = 'T ex client key')), '|');
insert into results (check_name, expected, actual) select 'EX an explainer with its check passes the check and is published', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T ex check'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T ex check'));
insert into results (check_name, expected, actual) select 'EX the explainer becomes explainer content with its check',
  jsonb_build_object('kind', 'explainer', 'style', 'Step-through', 'depth', 'With technical detail', 'end', 'A three-question check',
    'steps', '[{"label":"Supplier","text":"Creates the invoice."},{"label":"Access point","text":"Checks the format."},{"label":"Customer","text":"Gets the invoice."}]'::jsonb,
    'check', jsonb_build_array(current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb, current_setting('test.ex_q')::jsonb))::text,
  l.content::text from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T ex check';
insert into results (check_name, expected, actual) select 'EX the published explainer keeps its format', 'Interactive explainer/published/0.25', l.format||'/'||l.status||'/'||l.hours
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T ex check';
insert into results (check_name, expected, actual) select 'EX an explainer ending with a summary card is published', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T ex summary'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T ex summary'));
insert into results (check_name, expected, actual) select 'EX the summary explainer has no check', 'A summary card/Overview/false', (l.content ->> 'end')||'/'||(l.content ->> 'depth')||'/'||(l.content ? 'check')::text
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T ex summary';
-- the learner completes an interactive explainer themselves (completion 'mark', private.is_self_complete)
select public.save_learning((select learning_id from public.contributions where title = 'T ex check'), p_state => 'accepted', p_pct => 100::smallint, p_detail => '{"last":true,"best":100}');
insert into results (check_name, expected, actual) select 'EX a learner completes an interactive explainer without a counsellor', 'accepted', state
  from public.learner_learnings where user_id = '00000000-0000-0000-0000-0000000000e5' and learning_id = (select learning_id from public.contributions where title = 'T ex check');
-- ---------- Motion Studio: stages, one animated drawing with its text alternative, and the content they publish (MO) ----------
-- e5 also makes Animated flows, without review. Stages are [label, text] rows, then one drawing {svg, alt, made}
-- (private.motion_ok, private.drawing_ok, private.motion_content).
reset role;
update public.creator_rules set formats = formats || '{"Animated flow"}' where user_id = '00000000-0000-0000-0000-0000000000e5';
update public.review_policies set formats = formats || '{"Animated flow"}' where formats @> '{"Job aid","Case exercise"}';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e5","role":"authenticated"}';
select set_config('test.mo_stages', '[["Order","The customer orders. "],["Deliver","Goods leave."],["Collect","Payment arrives."]]', true);
select set_config('test.mo_svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="9" height="9"><animate attributeName="opacity" dur="1s"/></rect></svg>', true);
select set_config('test.mo_d', jsonb_build_object('svg', current_setting('test.mo_svg'), 'alt', ' Three stages, order to cash. ', 'made', 'ai', 'seconds', 20)::text, true);
insert into public.contributions (business_line, type, title, domain, takeaway, items, studio, shape) values
 ('Consulting','Animated flow','T mo flow','corp','Cash follows the order.', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb),'motion','{"Length?":"20 s","What moves?":"A process flow"}'),
 ('Consulting','Animated flow','T mo scripted','corp','Cash follows the order.', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb || '{"made":"scripted","seconds":45}'),'motion',null),
 ('Consulting','Animated flow','T mo no drawing','corp','x', current_setting('test.mo_stages')::jsonb,'motion',null),
 ('Consulting','Animated flow','T mo no alt','corp','x', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb || '{"alt":"  "}'),'motion',null),
 ('Consulting','Animated flow','T mo layout','corp','x', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb || '{"made":"layout"}'),'motion',null),
 ('Consulting','Animated flow','T mo not svg','corp','x', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb || '{"svg":"Here: <svg/>"}'),'motion',null),
 ('Consulting','Animated flow','T mo oversize','corp','x', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb || jsonb_build_object('svg', '<svg>' || repeat('x', 60000) || '</svg>')),'motion',null),
 ('Consulting','Animated flow','T mo no length','corp','x', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb - 'seconds'),'motion',null),
 ('Consulting','Animated flow','T mo odd length','corp','x', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb || '{"seconds":30}'),'motion',null),
 ('Consulting','Animated flow','T mo two drawings','corp','x', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb, current_setting('test.mo_d')::jsonb),'motion',null),
 ('Consulting','Animated flow','T mo too few stages','corp','x', '[["Order","a"],["Collect","b"]]'::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb),'motion',null),
 ('Consulting','Animated flow','T mo client alt','corp','x', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb || '{"alt":"As we did for Delcroix."}'),'motion',null),
 ('Consulting','Animated flow','T mo changed','corp','x', current_setting('test.mo_stages')::jsonb || jsonb_build_array(current_setting('test.mo_d')::jsonb),'motion',null);
do $$ begin
  begin insert into public.contributions (business_line, type, title, domain, takeaway, items, studio) values ('Consulting','Animated flow','T mo too many','corp','x',
      (select jsonb_agg(jsonb_build_array('Stage '||g, 'x')) from generate_series(1, 8) g) || jsonb_build_array(current_setting('test.mo_d')::jsonb),'motion');
    insert into results (check_name, expected, actual) values ('MO more stages and drawing than an Animated flow holds (8)', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('MO more stages and drawing than an Animated flow holds (8)', 'blocked: 23514', 'blocked: '||sqlstate); end;
end $$;
insert into results (check_name, expected, actual) select 'MO '||t||' fails the check', 'Add the stages, build the animation and write its text alternative first', array_to_string(public.check_contribution((select id from public.contributions where title = 'T mo '||t)), '|')
  from unnest(array['no drawing', 'no alt', 'layout', 'not svg', 'oversize', 'no length', 'odd length', 'two drawings']) t;
insert into results (check_name, expected, actual) select 'MO a drawing never makes up for too few stages', 'Add at least 3 items', array_to_string(public.check_contribution((select id from public.contributions where title = 'T mo too few stages')), '|');
insert into results (check_name, expected, actual) select 'MO a client name in the text alternative fails the check', '“Delcroix” looks like a client name · anonymise it',
  array_to_string(public.check_contribution((select id from public.contributions where title = 'T mo client alt')), '|');
insert into results (check_name, expected, actual) select 'MO a flow passes the check before its text alternative changes', '{}', public.check_contribution((select id from public.contributions where title = 'T mo changed'))::text;
update public.contributions set items = jsonb_set(items, '{3,alt}', '"Changed."') where title = 'T mo changed';
do $$ begin
  perform public.submit_contribution((select id from public.contributions where title = 'T mo changed'));
  insert into results (check_name, expected, actual) values ('MO a text alternative changed after the check is refused (submit)', 'blocked: The content changed after the automatic check', 'allowed');
exception when others then insert into results (check_name, expected, actual) values ('MO a text alternative changed after the check is refused (submit)', 'blocked: The content changed after the automatic check', 'blocked: '||sqlerrm); end $$;
insert into results (check_name, expected, actual) select 'MO an Animated flow with its drawing passes the check and is published', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T mo flow'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T mo flow'));
-- compared as jsonb: the drawing's quotes are escaped in its text, which a LIKE pattern would read as escapes
insert into results (check_name, expected, actual) select 'MO the flow becomes motion content: stages, drawing, text alternative, the length it was built for, maker', 'true',
  (l.content = jsonb_build_object('kind', 'motion', 'stages', '[{"label":"Order","text":"The customer orders."},{"label":"Deliver","text":"Goods leave."},{"label":"Collect","text":"Payment arrives."}]'::jsonb,
    'svg', current_setting('test.mo_svg'), 'alt', 'Three stages, order to cash.', 'seconds', 20, 'made', 'ai'))::text from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T mo flow';
insert into results (check_name, expected, actual) select 'MO the published flow is a short media learning (hours kept to two decimals)', 'Animated flow/published/0.03', l.format||'/'||l.status||'/'||l.hours
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T mo flow';
insert into results (check_name, expected, actual) select 'MO a scripted flow passes the check and is published', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T mo scripted'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T mo scripted'));
insert into results (check_name, expected, actual) select 'MO the scripted flow keeps its maker and the length it was built for', 'scripted/45', (l.content ->> 'made')||'/'||(l.content ->> 'seconds')
  from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T mo scripted';
-- the learner completes an Animated flow themselves (completion 'mark', private.is_self_complete)
select public.save_learning((select learning_id from public.contributions where title = 'T mo flow'), p_state => 'accepted', p_pct => 100::smallint, p_detail => '{"played":true}');
insert into results (check_name, expected, actual) select 'MO a learner completes an Animated flow without a counsellor', 'accepted', state
  from public.learner_learnings where user_id = '00000000-0000-0000-0000-0000000000e5' and learning_id = (select learning_id from public.contributions where title = 'T mo flow');
reset role;
-- ---------- Phase 2 review fixes (P2) ----------
insert into results (check_name, expected, actual) values ('P2 studio_motion use is seeded, text and off, asking for one SVG', 'text/false/true/false',
  (select kind||'/'||enabled||'/'||(preamble like '%SVG only%')||'/'||(preamble like '%JSON%') from public.ai_uses where key = 'studio_motion'));
-- private.rows_of: an explainer's or a flow's rows (its array items) in order, without its check or drawing
insert into results (check_name, expected, actual) values ('P2 rows_of keeps the rows in order and leaves the rest out', '[["a", "b"], ["c", "d"]]/[]',
  private.rows_of('[["a","b"],{"q":"x"},["c","d"]]'::jsonb)::text||'/'||private.rows_of('[{"svg":"<svg/>"}]'::jsonb)::text);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e5","role":"authenticated"}';
do $$ begin
  begin perform private.rows_of('[]'::jsonb);
    insert into results (check_name, expected, actual) values ('P2 a signed-in user cannot call rows_of', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('P2 a signed-in user cannot call rows_of', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
reset role;
-- learnings.ai_made: publishing marks a learning AI made from the contribution's ai_assisted, and always when AI
-- animated an Animated flow's drawing; nobody writes it directly (as content).
insert into results (check_name, expected, actual) values ('P2 a flow whose drawing AI animated is marked AI made', 'true',
  (select l.ai_made::text from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T mo flow'));
insert into results (check_name, expected, actual) values ('P2 a scripted flow is not marked AI made', 'false',
  (select l.ai_made::text from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T mo scripted'));
insert into results (check_name, expected, actual) values ('P2 a job aid made by hand is not marked AI made', 'false',
  (select l.ai_made::text from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T sc aid'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e5","role":"authenticated"}';
insert into public.contributions (business_line, type, title, domain, takeaway, items, studio, ai_assisted) values
 ('Consulting','Job aid','T p2 ai aid','prof','Tick it.','[["Before","Scope"],["Before","Map"],["During","Sign-off"],["After","Minutes"]]','aid', true);
insert into results (check_name, expected, actual) select 'P2 an AI-assisted job aid passes the check and is published', '{}/published',
  public.check_contribution((select id from public.contributions where title = 'T p2 ai aid'))::text||'/'||public.submit_contribution((select id from public.contributions where title = 'T p2 ai aid'));
reset role;
insert into results (check_name, expected, actual) values ('P2 the AI-assisted job aid is marked AI made', 'true',
  (select l.ai_made::text from public.contributions c join public.learnings l on l.id = c.learning_id where c.title = 'T p2 ai aid'));
insert into results (check_name, expected, actual) values ('P2 a learning added by an admin is not AI made', 'false', (select ai_made::text from public.learnings where id = 'L68'));
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}';
do $$ begin
  begin update public.learnings set ai_made = true where id = 'L68';
    insert into results (check_name, expected, actual) values ('P2 a General Admin cannot set ai_made', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('P2 a General Admin cannot set ai_made', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
with u as (update public.learnings set title = title where id = 'L68' returning 1)
  insert into results (check_name, expected, actual) select 'P2 a General Admin still edits the other columns', '1 rows', count(*)||' rows' from u;
reset role;
-- ---------- Private media storage (ME) ----------
-- Bucket `media` is private. A file lives at <author id>/<contribution id>/<file>. The author writes it while the
-- contribution is a draft or has changes requested; the author, the contribution's reviewers and, once the published
-- learning names the path in a "path" member of its content, every signed-in person read it (private.can_read_media).
-- Storage refuses direct row deletes unless storage.allow_delete_query is on, as the Storage API sets it.
reset role;
insert into results (check_name, expected, actual) select 'ME the media bucket is private, 50 MB, with audio and .horizon (JSON) among its types', 'false/52428800/true',
  public||'/'||file_size_limit||'/'||(allowed_mime_types @> '{audio/mpeg,audio/mp4,application/json}') from storage.buckets where id = 'media';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1','t.mediamaker@test.local'), ('00000000-0000-0000-0000-0000000000f2','t.othermaker@test.local'), ('00000000-0000-0000-0000-0000000000f3','t.medialearner@test.local');
update public.profiles set business_line='Consulting' where id in ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2');
update public.profiles set business_line='Audit' where id = '00000000-0000-0000-0000-0000000000f3'; -- never a peer of a Consulting author
insert into public.creator_rules (user_id, lines, formats) values ('00000000-0000-0000-0000-0000000000f1','{Consulting}','{"Job aid"}'), ('00000000-0000-0000-0000-0000000000f2','{Consulting}','{"Job aid"}');
delete from public.review_policies; -- one peer, then published
insert into public.review_policies (formats, peers, expert, quality) values ('{"Job aid"}', 1, false, false);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
insert into public.contributions (business_line, type, title, domain, takeaway, items, studio) values
 ('Consulting','Job aid','T me other','prof','x','[["Before","a"],["Before","b"],["During","c"],["After","d"]]','aid');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
insert into public.contributions (business_line, type, title, domain, takeaway, items, studio) values
 ('Consulting','Job aid','T me aid','prof','Tick it.','[["Before","Scope"],["Before","Map"],["During","Sign-off"],["After","Minutes"]]','aid');
reset role;
select set_config('test.me_c', (select id::text from public.contributions where title = 'T me aid'), true);
select set_config('test.me_o', (select id::text from public.contributions where title = 'T me other'), true);
select set_config('test.me_a', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/narration.mp3', true);
select set_config('test.me_b', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/notes.mp3', true);
select set_config('test.me_x', '00000000-0000-0000-0000-0000000000f2/'||current_setting('test.me_o')||'/deck.horizon', true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
insert into storage.objects (bucket_id, name) values ('media', current_setting('test.me_x'));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
with i as (insert into storage.objects (bucket_id, name) values ('media', current_setting('test.me_a')) returning 1)
  insert into results (check_name, expected, actual) select 'ME the author uploads a file of their draft under their own id', '1 rows', count(*)||' rows' from i;
insert into storage.objects (bucket_id, name) values ('media', current_setting('test.me_b')), ('media', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/spare.mp3');
with u as (update storage.objects set metadata = '{"size":1}' where bucket_id = 'media' and name = current_setting('test.me_a') returning 1)
  insert into results (check_name, expected, actual) select 'ME the author replaces a file of their draft', '1 rows', count(*)||' rows' from u;
insert into results (check_name, expected, actual) select 'ME the author reads their own files only', '3', count(*)::text from storage.objects where bucket_id = 'media';
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-0000000000f2/'||current_setting('test.me_c')||'/x.mp3');
    insert into results (check_name, expected, actual) values ('ME no upload under someone else''s id', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME no upload under someone else''s id', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_o')||'/x.mp3');
    insert into results (check_name, expected, actual) values ('ME no upload for another person''s contribution', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME no upload for another person''s contribution', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/sub/x.mp3');
    insert into results (check_name, expected, actual) values ('ME no upload outside <user>/<contribution>/<file>', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME no upload outside <user>/<contribution>/<file>', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin insert into storage.objects (bucket_id, name) values ('media', upper('00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c'))||'/x.mp3');
    insert into results (check_name, expected, actual) values ('ME no upload under upper-case ids', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME no upload under upper-case ids', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/../x.mp3');
    insert into results (check_name, expected, actual) values ('ME no upload with a .. segment', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME no upload with a .. segment', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/..');
    insert into results (check_name, expected, actual) values ('ME no file named ..', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME no file named ..', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin update storage.objects set name = '00000000-0000-0000-0000-0000000000f2/'||current_setting('test.me_o')||'/moved.mp3' where bucket_id = 'media' and name = current_setting('test.me_b');
    insert into results (check_name, expected, actual) values ('ME no move to someone else''s contribution', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME no move to someone else''s contribution', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
set local storage.allow_delete_query = 'true';
with d as (delete from storage.objects where bucket_id = 'media' and name like '%/spare.mp3' returning 1)
  insert into results (check_name, expected, actual) select 'ME the author removes a file of their draft', '1 rows', count(*)||' rows' from d;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
with d as (delete from storage.objects where bucket_id = 'media' and name = current_setting('test.me_b') returning 1)
  insert into results (check_name, expected, actual) select 'ME another person cannot remove the author''s file', '0 rows', count(*)||' rows' from d;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'ME a learner cannot read an unpublished file', '0', count(*)::text from storage.objects where bucket_id = 'media';
-- sent for review: the author's files are frozen; the assigned peer reads them
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'ME the draft passes the check and goes to one peer', '{}/review',
  public.check_contribution(current_setting('test.me_c')::uuid)::text||'/'||public.submit_contribution(current_setting('test.me_c')::uuid);
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/late.mp3');
    insert into results (check_name, expected, actual) values ('ME no upload once the contribution is in review', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME no upload once the contribution is in review', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
with d as (delete from storage.objects where bucket_id = 'media' and name = current_setting('test.me_b') returning 1)
  insert into results (check_name, expected, actual) select 'ME the author cannot remove a file in review', '0 rows', count(*)||' rows' from d;
reset role;
select set_config('test.me_r', (select reviewer_id::text from public.contribution_reviews where contribution_id = current_setting('test.me_c')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.me_r'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'ME the reviewer reads the contribution''s files', '2', count(*)::text from storage.objects where bucket_id = 'media' and name like '00000000-0000-0000-0000-0000000000f1/%';
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/reviewer.mp3');
    insert into results (check_name, expected, actual) values ('ME the reviewer adds no file to the contribution', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME the reviewer adds no file to the contribution', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin insert into storage.objects (bucket_id, name) values ('media', current_setting('test.me_r')||'/'||current_setting('test.me_c')||'/reviewer.mp3');
    insert into results (check_name, expected, actual) values ('ME the reviewer adds no file under their own id for it', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME the reviewer adds no file under their own id for it', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
with u as (update storage.objects set metadata = '{"size":2}' where bucket_id = 'media' and name = current_setting('test.me_a') returning 1)
  insert into results (check_name, expected, actual) select 'ME the reviewer replaces no file', '0 rows', count(*)||' rows' from u;
with d as (delete from storage.objects where bucket_id = 'media' and name = current_setting('test.me_a') returning 1)
  insert into results (check_name, expected, actual) select 'ME the reviewer removes no file', '0 rows', count(*)||' rows' from d;
insert into results (check_name, expected, actual) select 'ME the peer approves; published', 'published', public.review_contribution(current_setting('test.me_c')::uuid, 'approved', '{t,t,t,t}', '');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'ME a published learning that names no file opens none', '0', count(*)::text from storage.objects where bucket_id = 'media';
-- a later studio names its files in the learning content, here an audio part (and, wrongly, another person's file)
reset role;
update public.learnings set content = content || jsonb_build_object('audio', jsonb_build_object('path', current_setting('test.me_a')), 'extra', jsonb_build_array(jsonb_build_object('path', current_setting('test.me_x'))))
  where id = (select learning_id from public.contributions where id = current_setting('test.me_c')::uuid);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'ME a signed-in learner reads the file a published learning names', '1', count(*)::text from storage.objects where bucket_id = 'media' and name = current_setting('test.me_a');
insert into results (check_name, expected, actual) select 'ME but not the files it does not name', '0', count(*)::text from storage.objects where bucket_id = 'media' and name = current_setting('test.me_b');
insert into results (check_name, expected, actual) select 'ME nor another contribution''s file it names', '0', count(*)::text from storage.objects where bucket_id = 'media' and name = current_setting('test.me_x');
reset role;
update public.learnings set status = 'review' where id = (select learning_id from public.contributions where id = current_setting('test.me_c')::uuid);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'ME the file closes again when its learning is set back from published', '0', count(*)::text from storage.objects where bucket_id = 'media' and name = current_setting('test.me_a');
reset role;
set local role anon;
set local request.jwt.claims = '';
insert into results (check_name, expected, actual) select 'ME anon reads no media', '0', count(*)::text from storage.objects where bucket_id = 'media';
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/anon.mp3');
    insert into results (check_name, expected, actual) values ('ME anon uploads nothing', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('ME anon uploads nothing', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- ---------- Voice adapter (VO) ----------
-- stock_voices: System and General Admins add, rename and deactivate; every signed-in person reads the active ones;
-- nobody deletes one, and its provider voice id stays as added. studio_voice: kind voice, off by default, live only on an
-- ElevenLabs connection with a key. ai_count_call keeps a daily character limit per use as well as the call limit.
-- public.can_write_media: the media write rule, which the voice function asks before it calls ElevenLabs.
reset role;
insert into results (check_name, expected, actual) select 'VO studio_voice is seeded: voice, off, 30000 characters a day', 'voice/false/30000',
  kind||'/'||enabled||'/'||daily_chars from public.ai_uses where key = 'studio_voice';
insert into results (check_name, expected, actual) select 'VO text uses keep no character limit', '0', count(*)::text from public.ai_uses where kind = 'text' and daily_chars is not null;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e8','t.voicega@test.local'), ('00000000-0000-0000-0000-0000000000e9','t.voicemember@test.local');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000e8','general_admin');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e8","role":"authenticated"}';
with i as (insert into public.stock_voices (name, voice_id, language, accent) values ('Narrator · warm, 40s', 'tVoiceWarm01', 'en', 'British') returning 1)
  insert into results (check_name, expected, actual) select 'VO a General Admin adds a stock voice', '1 rows', count(*)||' rows' from i;
insert into public.stock_voices (name, voice_id, language, accent) values ('Interviewer · calm, 30s', 'tVoiceCalm02', 'nl', 'Flemish');
with u as (update public.stock_voices set active = false, name = 'Interviewer · calm' where voice_id = 'tVoiceCalm02' returning 1)
  insert into results (check_name, expected, actual) select 'VO a General Admin renames and deactivates a voice', '1 rows', count(*)||' rows' from u;
do $$ begin
  begin insert into public.stock_voices (name, voice_id, language) values ('Bad id', 'x y', 'en');
    insert into results (check_name, expected, actual) values ('VO a voice id is letters, digits, - and _ (at most 64)', 'blocked: 23514', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO a voice id is letters, digits, - and _ (at most 64)', 'blocked: 23514', 'blocked: '||sqlstate); end;
  begin insert into public.stock_voices (name, voice_id, language) values ('Twice', 'tVoiceWarm01', 'en');
    insert into results (check_name, expected, actual) values ('VO a voice id is on the list once', 'blocked: 23505', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO a voice id is on the list once', 'blocked: 23505', 'blocked: '||sqlstate); end;
  begin update public.stock_voices set voice_id = 'tVoiceOther9' where voice_id = 'tVoiceWarm01';
    insert into results (check_name, expected, actual) values ('VO the provider voice id stays as added', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO the provider voice id stays as added', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin delete from public.stock_voices where voice_id = 'tVoiceCalm02';
    insert into results (check_name, expected, actual) values ('VO nobody deletes a voice (deactivate instead)', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO nobody deletes a voice (deactivate instead)', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
with i as (insert into public.stock_voices (name, voice_id, language) values ('Coach · bright, 20s', 'tVoiceBright3', 'fr') returning 1)
  insert into results (check_name, expected, actual) select 'VO a System Admin adds a stock voice', '1 rows', count(*)||' rows' from i;
insert into results (check_name, expected, actual) select 'VO admins read inactive voices too', '3', count(*)::text from public.stock_voices where voice_id like 'tVoice%';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'VO a member reads the active voices only', '2', count(*)::text from public.stock_voices where voice_id like 'tVoice%';
with u as (update public.stock_voices set active = false where voice_id = 'tVoiceWarm01' returning 1)
  insert into results (check_name, expected, actual) select 'VO a member deactivates no voice', '0 rows', count(*)||' rows' from u;
do $$ begin
  begin insert into public.stock_voices (name, voice_id, language) values ('Mine', 'tVoiceMine04', 'en');
    insert into results (check_name, expected, actual) values ('VO a member adds no voice', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO a member adds no voice', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  begin insert into public.stock_voices (name, voice_id, language) values ('Line voice', 'tVoiceLine05', 'en');
    insert into results (check_name, expected, actual) values ('VO a Domain Admin adds no voice', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO a Domain Admin adds no voice', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
with u as (update public.stock_voices set name = 'Renamed' where voice_id = 'tVoiceWarm01' returning 1)
  insert into results (check_name, expected, actual) select 'VO a Domain Admin renames no voice', '0 rows', count(*)||' rows' from u;
reset role;
set local role anon;
set local request.jwt.claims = '';
do $$ begin
  begin perform count(*) from public.stock_voices;
    insert into results (check_name, expected, actual) values ('VO anon reads no voices', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO anon reads no voices', 'blocked: 42501', 'blocked: '||sqlstate); end;
  begin perform public.can_write_media('00000000-0000-0000-0000-0000000000f2/'||current_setting('test.me_o')||'/voice-a.mp3');
    insert into results (check_name, expected, actual) values ('VO anon asks no media rule', 'blocked: 42501', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO anon asks no media rule', 'blocked: 42501', 'blocked: '||sqlstate); end;
end $$;
-- live: studio_voice on the ElevenLabs connection with a key (test.ai2) and no model; never on an 'other' connection
reset role; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.sa'), 'role', 'authenticated')::text, true);
insert into results (check_name, expected, actual) select 'VO studio_voice is not live while off', 'false', ('studio_voice' = any(public.ai_live_uses()))::text;
with u as (update public.ai_uses set connection_id = current_setting('test.ai2')::uuid, enabled = true where key = 'studio_voice' returning 1)
  insert into results (check_name, expected, actual) select 'VO a System Admin gives studio_voice the ElevenLabs connection', '1 rows', count(*)||' rows' from u;
insert into results (check_name, expected, actual) select 'VO studio_voice is live on ElevenLabs with a key, no model needed', 'true', ('studio_voice' = any(public.ai_live_uses()))::text;
with i as (insert into public.ai_connections (name, provider) values ('T Other voices', 'other') returning id)
  select set_config('test.ai3', (select id::text from i), true);
select public.ai_set_key(current_setting('test.ai3')::uuid, 'other-test-key-77');
update public.ai_uses set connection_id = current_setting('test.ai3')::uuid where key = 'studio_voice';
insert into results (check_name, expected, actual) select 'VO only an ElevenLabs connection makes studio_voice live', 'false', ('studio_voice' = any(public.ai_live_uses()))::text;
update public.ai_uses set connection_id = current_setting('test.ai2')::uuid where key = 'studio_voice';
with u as (update public.ai_uses set daily_chars = 5000 where key = 'studio_voice' returning 1)
  insert into results (check_name, expected, actual) select 'VO a System Admin sets the character limit', '1 rows', count(*)||' rows' from u;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e8","role":"authenticated"}';
with u as (update public.ai_uses set daily_chars = 900000 where key = 'studio_voice' returning 1)
  insert into results (check_name, expected, actual) select 'VO a General Admin sets no character limit', '0 rows', count(*)||' rows' from u;
-- the function (service role) counts characters as well as calls
reset role;
insert into results (check_name, expected, actual) select 'VO the function counts a voice call', '1', public.ai_count_call('00000000-0000-0000-0000-0000000000e9', 'studio_voice', 4000)::text;
do $$ begin
  begin perform public.ai_count_call('00000000-0000-0000-0000-0000000000e9', 'studio_voice', 1500);
    insert into results (check_name, expected, actual) values ('VO refused beyond the daily characters', 'blocked: Daily AI limit reached', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO refused beyond the daily characters', 'blocked: Daily AI limit reached', 'blocked: '||sqlerrm); end;
  begin perform public.ai_count_call('00000000-0000-0000-0000-0000000000e8', 'studio_voice', 5001);
    insert into results (check_name, expected, actual) values ('VO a first call over the characters is refused too', 'blocked: Daily AI limit reached', 'allowed');
  exception when others then insert into results (check_name, expected, actual) values ('VO a first call over the characters is refused too', 'blocked: Daily AI limit reached', 'blocked: '||sqlerrm); end;
end $$;
insert into results (check_name, expected, actual) select 'VO a refused call counts nothing', '1/4000', calls||'/'||input_chars from public.ai_usage where user_id = '00000000-0000-0000-0000-0000000000e9' and use_key = 'studio_voice';
insert into results (check_name, expected, actual) select 'VO the call still fits up to the limit', '2', public.ai_count_call('00000000-0000-0000-0000-0000000000e9', 'studio_voice', 1000)::text;
-- the media write rule, asked by the caller: their own editable contribution only
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'VO the author may write to their own draft''s folder', 'true', public.can_write_media('00000000-0000-0000-0000-0000000000f2/'||current_setting('test.me_o')||'/voice-a.mp3')::text;
insert into results (check_name, expected, actual) select 'VO not to another person''s contribution', 'false', public.can_write_media('00000000-0000-0000-0000-0000000000f2/'||current_setting('test.me_c')||'/voice-a.mp3')::text;
insert into results (check_name, expected, actual) select 'VO not to a contribution that does not exist', 'false', public.can_write_media('00000000-0000-0000-0000-0000000000f2/00000000-0000-0000-0000-00000000dead/voice-a.mp3')::text;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
insert into results (check_name, expected, actual) select 'VO not to their own contribution once published', 'false', public.can_write_media('00000000-0000-0000-0000-0000000000f1/'||current_setting('test.me_c')||'/voice-a.mp3')::text;
reset role;
select check_name, expected, actual, case when actual like expected||'%' or (expected='blocked' and actual like 'blocked%') then 'PASS' else 'FAIL' end as result from results order by n;
rollback;
