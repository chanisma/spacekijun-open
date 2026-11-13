-- Run in a single rollback transaction, optionally preceded by the migration.
begin;
select set_config('focus.owner',(select id::text from public.profiles where role='student' order by id limit 1),true);
select set_config('focus.other',(select id::text from public.profiles where role='student' and id::text<>current_setting('focus.owner') order by id limit 1),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('focus.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare t jsonb; payload jsonb; saved jsonb; begin
  t:=public.academy_dormitory_write('save_task','{"title":"TEST focus plan","task_date":"2199-01-01","priority":"medium"}');
  perform set_config('focus.task',t->>'id',true);
  payload:=jsonb_build_object('id',gen_random_uuid(),'task_id',t->>'id','started_at',now()-interval '25 minutes','ended_at',now(),'focus_seconds',1500,'planned_seconds',1500,'completed',true);
  perform set_config('focus.payload',payload::text,true);
  saved:=public.planner_focus_record(payload);
  perform public.planner_focus_record(payload);
  if jsonb_array_length(public.planner_focus_read('2199-01-01'))<>1 then raise exception 'Duplicate session recorded'; end if;
  if exists(select 1 from public.academy_tasks where id=(t->>'id')::uuid and completed) then raise exception 'Timer completed a task without user consent'; end if;
  begin perform public.planner_focus_record(payload||'{"focus_seconds":1000,"completed":false}'); raise exception 'Changed retry accepted' using errcode='XX000'; exception when invalid_parameter_value then null; end;
  begin perform public.planner_focus_record(payload||jsonb_build_object('id',gen_random_uuid(),'focus_seconds',-1)); raise exception 'Negative duration accepted' using errcode='XX000'; exception when check_violation then null; end;
  begin perform public.planner_focus_record(payload||jsonb_build_object('id',gen_random_uuid(),'started_at',now(),'ended_at',now()+interval '25 minutes')); raise exception 'Future completion accepted' using errcode='XX000'; exception when invalid_parameter_value then null; end;
  begin insert into public.planner_focus_sessions(id,user_id,task_id,started_at,ended_at,focus_seconds,planned_seconds,completed) values(gen_random_uuid(),auth.uid(),(t->>'id')::uuid,now()-interval '1 minute',now(),60,60,true); raise exception 'Direct write accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('focus.other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.planner_focus_sessions where task_id=current_setting('focus.task')::uuid) then raise exception 'Foreign history leaked'; end if;
  if exists(select 1 from jsonb_array_elements(public.planner_focus_read('2199-01-01')) s where s->>'task_id'=current_setting('focus.task')) then raise exception 'Foreign history leaked through RPC'; end if;
  begin perform public.planner_focus_record(current_setting('focus.payload')::jsonb); raise exception 'Foreign task accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  begin perform public.planner_focus_read('2199-01-01'); raise exception 'Anonymous read accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS planner focus: ownership, RLS, idempotency, duration, no automatic completion; rolled back' as result;
rollback;
