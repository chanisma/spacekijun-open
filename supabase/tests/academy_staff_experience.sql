begin;
select set_config('trial.teacher',(select id::text from public.profiles where role='teacher' order by id limit 1),true);
select set_config('trial.admin',(select id::text from public.profiles where role='admin' order by id limit 1),true);
select set_config('trial.student',(select id::text from public.profiles where role='student' and split_part(email,'@',1)='00-00001' limit 1),true);
do $$ begin if current_setting('trial.teacher')='' or current_setting('trial.admin')='' or not exists(select 1 from public.student_basic_info where id='00-00001') then raise exception 'Missing trial fixtures'; end if; end $$;
create temp table template_before as select
 (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from public.student_kg_versions t where student_id='00-00001') kg,
 (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from public.student_kg_entities t where student_id='00-00001') entities,
 (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from public.student_inquiry_designs t where student_id='00-00001') designs,
 (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from public.student_inquiry_recommendations t where student_id='00-00001') analyses;
delete from public.academy_chapters where user_id in (current_setting('trial.teacher')::uuid,current_setting('trial.admin')::uuid);
delete from public.academy_experience_records where owner_id in (current_setting('trial.teacher')::uuid,current_setting('trial.admin')::uuid);
delete from public.academy_chapter_rewards where user_id in (current_setting('trial.teacher')::uuid,current_setting('trial.admin')::uuid);
insert into public.academy_chapters(user_id,chapter,step,revision) values(current_setting('trial.teacher')::uuid,'first_star',11,11);
insert into public.academy_user_stats(user_id,coins) values(current_setting('trial.teacher')::uuid,200),(current_setting('trial.admin')::uuid,200) on conflict(user_id) do update set coins=200;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('trial.teacher'),'role','authenticated')::text,true);
do $$ declare r jsonb; c jsonb; i integer; begin
 perform public.save_academy_prologue(0,null);
 r:=public.academy_experience_write('design',jsonb_build_object('title','교사 체험 탐구','status','saved','student_rationale','별의 변화를 직접 비교하고 싶어서','owner_id',current_setting('trial.admin'),'student_id','00-00001','target_kind','subject','target_name','과학','academic_year',2026,'grade',1,'semester',1));
 perform set_config('trial.design',r->>'id',true);
 if r->>'owner_id'<>current_setting('trial.teacher') or r->>'student_id'<>'experience:'||current_setting('trial.teacher') then raise exception 'Owner spoof accepted'; end if;
 c:=public.academy_chapter_read();
 if c->'designs'->0->>'id'<>'trial:'||(r->>'id') then raise exception 'Own design missing from chapter'; end if;
 c:=public.academy_chapter_write('design',11,(r->>'id')::uuid);
 if c->>'design_id'<>'trial:'||(r->>'id') then raise exception 'Trial chapter did not bind'; end if;
 for i in 12..15 loop c:=public.academy_chapter_write('next',i); end loop;
 if c->>'step'<>'16' then raise exception 'Staff chapter not completed'; end if;
 if (public.academy_dormitory_read(current_date)->>'coins')::integer<>250 then raise exception 'Staff chapter reward missing'; end if;
 r:=public.academy_dormitory_write('save_goal','{"title":"하루 단어 10개","description":"실천하기"}');
 if not exists(select 1 from public.academy_user_goals where id=(r->>'id')::uuid and user_id=auth.uid()) then raise exception 'Goal owner mismatch'; end if;
 perform public.academy_experience_write('recommendation','{"weaknesses":[],"recommendations":[],"prepared_at":"2026-09-14T00:00:00Z"}');
 perform public.academy_experience_write('cache','{"cache_key":"test-key","result":{"title":"체험 분석"}}');
 if jsonb_array_length(public.academy_experience_read('cache'))<>1 then raise exception 'Own cache missing'; end if;
 perform public.academy_study_read();
 perform public.academy_study_claim(date_trunc('week',now() at time zone 'Asia/Seoul')::date);
 perform public.academy_workshop_own_read();
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('trial.admin'),'role','authenticated')::text,true);
do $$ begin
 if jsonb_array_length(public.academy_experience_read('design'))<>0 then raise exception 'Teacher result leaked to admin experience'; end if;
 if exists(select 1 from public.academy_experience_records where id=current_setting('trial.design')::uuid) then raise exception 'Cross-owner RLS leaked'; end if;
 begin perform public.academy_experience_write('design','{"title":"forged"}',current_setting('trial.design')::uuid); raise exception 'Cross-owner update succeeded' using errcode='XX000'; exception when insufficient_privilege then null; end;
 perform public.academy_experience_delete(current_setting('trial.design')::uuid);
 perform public.save_academy_prologue(0,null);
 perform public.academy_dormitory_write('save_goal','{"title":"관리자 목표","description":"체험"}');
 if jsonb_array_length(public.academy_chapter_read()->'designs')<>0 then raise exception 'Student/template results mixed into admin chapter'; end if;
 if public.academy_chapter_read('00-00001')->'chapter' is distinct from (select to_jsonb(c)||jsonb_build_object('design_id',c.design_id::text) from public.academy_chapters c where c.user_id=current_setting('trial.student')::uuid and c.chapter='first_star') and exists(select 1 from public.academy_chapters where user_id=current_setting('trial.student')::uuid and chapter='first_star') then raise exception 'Student preview changed'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('trial.student'),'role','authenticated')::text,true);
do $$ begin
 begin perform public.academy_experience_read('design'); raise exception 'Student entered staff storage' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin perform public.academy_experience_write('design','{}'); raise exception 'Student wrote staff storage' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare before template_before; begin
 select * into before from template_before;
 if before.kg is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from public.student_kg_versions t where student_id='00-00001') or
 before.entities is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from public.student_kg_entities t where student_id='00-00001') or
 before.designs is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from public.student_inquiry_designs t where student_id='00-00001') or
 before.analyses is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id)::text,'')) from public.student_inquiry_recommendations t where student_id='00-00001') then raise exception 'Template student was modified'; end if;
 if not exists(select 1 from public.academy_experience_records where id=current_setting('trial.design')::uuid and owner_id=current_setting('trial.teacher')::uuid) then raise exception 'Cross-owner delete affected teacher'; end if;
end $$;
rollback;
select 'PASS: staff own records, chapter/rewards/planner, shared read-only template checksum, admin preview, cross-account isolation and student denial (rolled back)' as result;
