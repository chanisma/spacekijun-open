begin;
select set_config('unlock.owner',(select id::text from public.profiles where role='student' order by id limit 1),true);
delete from public.academy_chapters where user_id=current_setting('unlock.owner')::uuid;
update public.academy_user_goals set is_archived=true where user_id=current_setting('unlock.owner')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('unlock.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.academy_postlude_write(0);raise exception 'Post prerequisite bypass' using errcode='XX000';exception when raise_exception then null;end;
end $$;
reset role;
insert into public.academy_chapters(user_id,chapter,step,completed_at) values(current_setting('unlock.owner')::uuid,'post_first_letter',30,now());
select set_config('unlock.coins',(select coins::text from public.academy_user_stats where user_id=current_setting('unlock.owner')::uuid),true);
set local role authenticated;
do $$ declare c jsonb; g jsonb; other_g jsonb; t jsonb; pid text; begin
 begin perform public.academy_sky_chapter_write('start',0);raise exception 'Postlude skipped' using errcode='XX000';exception when raise_exception then null;end;
 c:=public.academy_postlude_write(0);
 c:=public.academy_postlude_write(0);
 if (c->>'postlude_step')::int<>1 then raise exception 'Stale postlude advanced';end if;
 for i in 1..8 loop c:=public.academy_postlude_write(i);end loop;
 c:=public.academy_postlude_write(8);
 if c->>'postlude_completed_at' is null or (c->>'postlude_step')::int<>9 then raise exception 'Postlude not complete';end if;
 if (public.academy_dormitory_read(current_date,null)->>'coins')::int<>current_setting('unlock.coins')::int then raise exception 'Postlude minted coins';end if;
 begin perform public.academy_sky_chapter_write('start',0);raise exception 'Zero plans accepted' using errcode='XX000';exception when raise_exception then null;end;
 g:=public.academy_dormitory_write('save_goal','{"title":"TEST unlock target"}');
 other_g:=public.academy_dormitory_write('save_goal','{"title":"TEST other target"}');
 for i in 1..5 loop
  t:=public.academy_dormitory_write('save_task',jsonb_build_object('title','TEST repeated','related_goal_id',g->>'id','plan_id',pid,'task_date',date '2199-01-01'+i));
  pid:=t->>'plan_id';
  perform public.academy_dormitory_write('complete',jsonb_build_object('id',t->>'id','completed',true));
 end loop;
 if (public.academy_chapter_read(null)->'skyEligibility'->>'completed_plans')::int<>1 then raise exception 'Repeat counted as distinct plans';end if;
 for i in 1..4 loop
  t:=public.academy_dormitory_write('save_task',jsonb_build_object('title','TEST split '||i,'related_goal_id',other_g->>'id','task_date','2199-01-01'));
  perform public.academy_dormitory_write('complete',jsonb_build_object('id',t->>'id','completed',true));
 end loop;
 begin perform public.academy_sky_chapter_write('start',0);raise exception 'Plans across goals counted' using errcode='XX000';exception when raise_exception then null;end;
 t:=public.academy_dormitory_write('save_task',jsonb_build_object('title','TEST fifth','related_goal_id',other_g->>'id','task_date','2199-01-01'));
 begin perform public.academy_sky_chapter_write('start',0);raise exception 'Uncompleted fifth counted' using errcode='XX000';exception when raise_exception then null;end;
 perform public.academy_dormitory_write('complete',jsonb_build_object('id',t->>'id','completed',true));
 c:=public.academy_sky_chapter_write('start',0);
 if (c->>'step')::int<>0 then raise exception 'Sky did not start';end if;
 perform public.academy_dormitory_write('complete',jsonb_build_object('id',t->>'id','completed',false));
 c:=public.academy_sky_chapter_write('next',0);
 if (c->>'step')::int<>1 then raise exception 'Existing sky progress relocked';end if;
end $$;
reset role;
do $$ begin
 -- At most the existing daily practice reward; the postlude itself has no reward row.
 if exists(select 1 from public.academy_chapter_rewards where user_id=current_setting('unlock.owner')::uuid and chapter not in ('first_star','library_questions','dorm_first_plan','post_first_letter','sky_first_light')) then raise exception 'Unexpected postlude reward';end if;
end $$;
select set_config('request.jwt.claims','{}',true);
set local role authenticated;
do $$ begin
 begin perform public.academy_postlude_write(0);raise exception 'Null user accepted' using errcode='XX000';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS postlude, stale retry, distinct plans, same goal, incomplete plan, unlock, existing progress, auth' as result;
rollback;
