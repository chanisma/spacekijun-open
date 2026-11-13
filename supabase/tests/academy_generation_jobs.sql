begin;
select set_config('test.teacher',(select id::text from public.profiles where role='teacher' order by id limit 1),true);
select set_config('test.admin',(select id::text from public.profiles where role='admin' order by id limit 1),true);
select set_config('test.student',(select id::text from public.profiles where role='student' and split_part(email,'@',1)='00-00001' limit 1),true);
create temp table template_designs as select count(*) n from public.student_inquiry_designs where student_id='00-00001';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.teacher'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare j public.academy_generation_jobs; duplicate public.academy_generation_jobs; payload jsonb; key uuid:=gen_random_uuid();
begin
 payload:=jsonb_build_object('studentId','experience:'||auth.uid(),'target',jsonb_build_object('id','target','kind','subject','name','과학','ref','{}'::jsonb,'academic_year',2026,'grade',1,'semester',2),'selectedSources','[]'::jsonb,'userRequirements','수질을 관찰하는 실험을 계획하고 싶어요.');
 begin perform public.academy_generation_start(key,payload,'solar-pro4'); raise exception 'Teacher selected Solar'; exception when insufficient_privilege then null; end;
 j:=public.academy_generation_start(key,payload);
 duplicate:=public.academy_generation_start(key,payload); if j.id<>duplicate.id then raise exception 'Duplicate request'; end if;
 duplicate:=public.academy_generation_start(gen_random_uuid(),payload); if j.id<>duplicate.id then raise exception 'Concurrent active request'; end if;
 perform set_config('test.job',j.id::text,true);
 begin perform public.academy_generation_claim(); raise exception 'Student worker access'; exception when insufficient_privilege then null; end;
 begin perform public.academy_generation_start(gen_random_uuid(),payload||'{"studentId":"other"}'); raise exception 'Foreign scope accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- SQL worker operations run as the service, with a fenced lease.
do $$ declare j public.academy_generation_jobs; snapshot jsonb:='{"title":"수질 탐구","summary":"계획","inquiry_questions":["수질?"],"plan_steps":[],"student_prompt_questions":[],"risk_flags":[]}';
begin
 select * into j from public.academy_generation_claim();
 if j.id::text<>current_setting('test.job') then raise exception 'Unexpected queue work; run in an idle queue'; end if;
 perform public.academy_generation_checkpoint(j.id,gen_random_uuid(),snapshot);
 if (select design is not null from public.academy_generation_jobs where id=j.id) then raise exception 'Stale lease wrote'; end if;
 perform public.academy_generation_checkpoint(j.id,j.lease,snapshot);
 select * into j from public.academy_generation_claim();
 if j.stage<>'graph' or j.design<>snapshot then raise exception 'Lost design checkpoint'; end if;
 perform public.academy_generation_checkpoint(j.id,j.lease,p_error=>'PROVIDER_HTTP_503');
 if (select stage<>'graph' or status<>'retry' or design<>snapshot from public.academy_generation_jobs where id=j.id) then raise exception 'Retry restarted design'; end if;
 update public.academy_generation_jobs set available_at=now() where id=j.id;
 select * into j from public.academy_generation_claim();
 perform public.academy_generation_checkpoint(j.id,j.lease,'{"entities":[],"relations":[]}');
 select * into j from public.academy_generation_claim();
 if j.stage<>'save' then raise exception 'Missing save stage'; end if;
 perform public.academy_generation_checkpoint(j.id,j.lease);
 perform public.academy_generation_checkpoint(j.id,j.lease);
 if (select count(*) from public.academy_experience_records where data->>'generation_job_id'=j.id::text)<>1 then raise exception 'Duplicate draft'; end if;
 if (select n from template_designs)<>(select count(*) from public.student_inquiry_designs where student_id='00-00001') then raise exception 'Template changed'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare j public.academy_generation_jobs; payload jsonb;
begin
 if exists(select 1 from public.academy_generation_jobs where id=current_setting('test.job')::uuid) then raise exception 'Other owner sees job'; end if;
 begin perform public.academy_generation_retry(current_setting('test.job')::uuid); raise exception 'Foreign retry'; exception when insufficient_privilege then null; end;
 payload:=jsonb_build_object('studentId','experience:'||auth.uid(),'target',jsonb_build_object('kind','subject','name','과학','ref','{}'::jsonb,'academic_year',2026,'grade',1),'selectedSources','[]'::jsonb);
 j:=public.academy_generation_start(gen_random_uuid(),payload,'solar-pro4');
 if j.provider<>'solar-pro4' then raise exception 'Admin selection lost'; end if;
end $$;
reset role;
update public.academy_generation_jobs set status='failed' where owner_id=current_setting('test.admin')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.student'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare j public.academy_generation_jobs;
begin
 j:=public.academy_generation_start(gen_random_uuid(),'{"studentId":"00-00001","target":{"kind":"subject","name":"과학","ref":{},"academic_year":2026,"grade":1,"semester":2},"selectedSources":[]}');
 if j.experience or j.provider<>'openai' then raise exception 'Wrong student routing'; end if;
 perform set_config('test.studentjob',j.id::text,true);
end $$;
reset role;
do $$ declare j public.academy_generation_jobs; draft text;
begin
 select * into j from public.academy_generation_claim();
 if j.id::text<>current_setting('test.studentjob') then raise exception 'Unexpected student work'; end if;
 perform public.academy_generation_checkpoint(j.id,j.lease,'{"title":"학생 초안","summary":"계획","inquiry_questions":[],"plan_steps":[],"student_prompt_questions":[],"risk_flags":[]}');
 select * into j from public.academy_generation_claim();
 perform public.academy_generation_checkpoint(j.id,j.lease,'{"entities":[],"relations":[]}');
 select * into j from public.academy_generation_claim();
 perform public.academy_generation_checkpoint(j.id,j.lease);
 select draft_id into draft from public.academy_generation_jobs where id=j.id;
 if not exists(select 1 from public.student_inquiry_designs where id=draft::uuid and student_id='00-00001' and status='draft') then raise exception 'Student draft not saved'; end if;
end $$;
rollback;
select 'PASS: default Luna, admin-only Solar, owner scope, durable checkpoints, graph-only retry, stale lease, exactly one draft, template untouched' as result;
