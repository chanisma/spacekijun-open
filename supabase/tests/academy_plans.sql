-- Runs against actual schema and roles; all data and rewards roll back.
begin;
select set_config('sky.owner',(select id::text from public.profiles where role='student' order by id limit 1),true);
select set_config('sky.other',(select id::text from public.profiles where role='student' and id::text<>current_setting('sky.owner') order by id limit 1),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('sky.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare g jsonb; t jsonb; repeated jsonb; d jsonb; begin
 g:=public.academy_dormitory_write('save_goal','{"title":"TEST SKY goal","description":"내가 직접 정한 목표"}');
 perform set_config('sky.goal',g->>'id',true);
 t:=public.academy_dormitory_write('save_task',jsonb_build_object('title','TEST SKY plan','task_date','2199-01-01','related_goal_id',g->>'id','start_time','10:00','end_time','11:00','priority','high'));
 perform set_config('sky.plan',t->>'plan_id',true);
 if t->>'plan_id' is null then raise exception 'Missing plan identity'; end if;
 repeated:=public.academy_dormitory_write('save_task',jsonb_build_object('title','renamed plan','task_date','2199-01-02','related_goal_id',g->>'id','plan_id',t->>'plan_id','priority','high'));
 if repeated->>'plan_id'<>t->>'plan_id' then raise exception 'Repeat split a star'; end if;
 perform public.academy_dormitory_write('complete',jsonb_build_object('id',t->>'id','completed',true));
 perform public.academy_dormitory_write('complete',jsonb_build_object('id',repeated->>'id','completed',true));
 perform public.academy_dormitory_write('save_feedback',jsonb_build_object('id',t->>'id','comment','TEST feedback'));
 d:=public.academy_dormitory_read('2199-01-01',null);
 if (select count(*) from jsonb_array_elements(d->'plans') p where p->>'id'=t->>'plan_id' and p->>'title'='renamed plan' and (p->>'practice_count')::int=2)<>1 then raise exception 'Repeat count or rename wrong'; end if;
 if not exists(select 1 from jsonb_array_elements(d->'tasks') x where x->>'id'=t->>'id' and x->>'title'='renamed plan' and x->>'feedback'='TEST feedback') then raise exception 'Occurrence cache or feedback lost'; end if;
 perform public.academy_dormitory_write('save_task',jsonb_build_object('title','renamed plan','task_date','2199-01-02','related_goal_id',g->>'id','plan_id',t->>'plan_id'));
 if (select count(*) from public.academy_tasks where plan_id=(t->>'plan_id')::uuid)<>2 then raise exception 'Duplicate repeat'; end if;
 begin perform public.academy_dormitory_write('save_task','{"title":"invalid","task_date":"2199-01-01","priority":"typo"}'); raise exception 'Bad priority accepted' using errcode='XX000'; exception when check_violation then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('sky.other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.academy_plans where id=current_setting('sky.plan')::uuid) then raise exception 'Foreign plan leaked'; end if;
 begin perform public.academy_dormitory_write('save_task',jsonb_build_object('title','foreign','task_date','2199-01-03','plan_id',current_setting('sky.plan'),'related_goal_id',current_setting('sky.goal'))); raise exception 'Foreign plan changed' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS plans: stable identity, repeat, rename, feedback, priority, ownership, rollback' as result;
rollback;
