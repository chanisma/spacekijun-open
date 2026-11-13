begin;
select set_config('sky.owner',(select id::text from public.profiles where role='student' order by id limit 1),true);
select set_config('sky.other',(select id::text from public.profiles where role='student' and id::text<>current_setting('sky.owner') order by id limit 1),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('sky.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare g jsonb; t jsonb; t2 jsonb; goal uuid; plan uuid; begin
 g:=public.academy_dormitory_write('save_goal','{"title":"TEST constellation"}');goal:=(g->>'id')::uuid;perform set_config('sky.goal',goal::text,true);
 t:=public.academy_dormitory_write('save_task',jsonb_build_object('title','TEST star','task_date','2199-01-01','related_goal_id',goal));plan:=(t->>'plan_id')::uuid;
 begin perform public.academy_sky_write('place_constellation',goal,null,.5,.5,null,null,0);raise exception 'Unpracticed placement' using errcode='XX000';exception when raise_exception then null;end;
 perform public.academy_dormitory_write('complete',jsonb_build_object('id',t->>'id','completed',true));
 g:=public.academy_sky_write('place_constellation',goal,null,.5,.5,null,null,0);
 begin perform public.academy_sky_write('place_star',goal,plan,.5,.5,null,null,0);raise exception 'Stale revision' using errcode='XX000';exception when serialization_failure then null;end;
 g:=public.academy_sky_write('place_star',goal,plan,.4,.5,null,null,1);
 begin perform public.academy_sky_write('place_star',goal,plan,-.1,0,null,null,2);raise exception 'Outside square' using errcode='XX000';exception when raise_exception then null;end;
 t2:=public.academy_dormitory_write('save_task',jsonb_build_object('title','TEST second star','task_date','2199-01-01','related_goal_id',goal));
 begin perform public.academy_sky_write('place_star',goal,(t2->>'plan_id')::uuid,.5,.5,null,null,2);raise exception 'Unlit star placed' using errcode='XX000';exception when raise_exception then null;end;
 perform public.academy_dormitory_write('complete',jsonb_build_object('id',t2->>'id','completed',true));
 g:=public.academy_sky_write('place_star',goal,(t2->>'plan_id')::uuid,.6,.5,null,null,2);
 begin perform public.academy_sky_write('set_lines',goal,null,null,null,jsonb_build_array(jsonb_build_array(plan,plan)),null,3);raise exception 'Self line accepted' using errcode='XX000';exception when raise_exception then null;end;
 begin perform public.academy_sky_write('set_lines',goal,null,null,null,jsonb_build_array(jsonb_build_array(plan,gen_random_uuid())),null,3);raise exception 'Foreign endpoint accepted' using errcode='XX000';exception when raise_exception then null;end;
 g:=public.academy_sky_write('set_lines',goal,null,null,null,jsonb_build_array(jsonb_build_array(plan,t2->>'plan_id')),null,3);
 perform public.academy_dormitory_write('complete_goal',jsonb_build_object('id',goal,'completed',true));
 g:=public.academy_sky_write('name',goal,null,null,null,null,'나의 작은 길',4);
 begin perform public.academy_sky_write('set_lines',goal,null,null,null,'[]',null,5);raise exception 'Gold lines changed' using errcode='XX000';exception when raise_exception then null;end;
 perform public.academy_dormitory_write('archive_goal',jsonb_build_object('id',goal,'archived',true));
 begin perform public.academy_sky_write('place_constellation',goal,null,.2,.2,null,null,5);raise exception 'Archived goal changed' using errcode='XX000';exception when raise_exception then null;end;
end $$;
-- The limit counts distinct stars, not edges: twelve stars can have many lines.
do $$ declare g jsonb; t jsonb; root_id uuid; lines jsonb:='[]'; begin
 g:=public.academy_dormitory_write('save_goal','{"title":"TEST twelve connected stars"}');
 for i in 1..13 loop
  t:=public.academy_dormitory_write('save_task',jsonb_build_object('title','TEST star '||i,'task_date','2199-01-01','related_goal_id',g->>'id'));
  perform public.academy_dormitory_write('complete',jsonb_build_object('id',t->>'id','completed',true));
  if i=1 then
   root_id:=(t->>'plan_id')::uuid;
   g:=public.academy_sky_write('place_constellation',(g->>'id')::uuid,null,.5,.5,null,null,0);
  end if;
  g:=public.academy_sky_write('place_star',(g->>'id')::uuid,(t->>'plan_id')::uuid,.5,.5,null,null,(g->>'constellation_revision')::int);
  if i>1 then lines:=lines||jsonb_build_array(jsonb_build_array(root_id,t->>'plan_id'));end if;
  if i=12 then g:=public.academy_sky_write('set_lines',(g->>'id')::uuid,null,null,null,lines,null,(g->>'constellation_revision')::int);end if;
 end loop;
 begin
  perform public.academy_sky_write('set_lines',(g->>'id')::uuid,null,null,null,lines,null,(g->>'constellation_revision')::int);
  raise exception 'Thirteen connected stars accepted' using errcode='XX000';
 exception when raise_exception then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('sky.other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.academy_sky_write('place_constellation',current_setting('sky.goal')::uuid,null,.5,.5,null,null,0);raise exception 'Foreign goal changed' using errcode='XX000';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set local role authenticated;
do $$ begin
 begin perform public.academy_sky_write('place_constellation',current_setting('sky.goal')::uuid,null,.5,.5,null,null,0);raise exception 'Null auth accepted' using errcode='XX000';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS sky: practice gate, coordinates, ownership, null auth, revision, endpoints, frozen lines, archive; rollback' as result;
rollback;
