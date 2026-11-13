begin;
select set_config('sky.owner',(select id::text from public.profiles where role='student' order by id limit 1),true);
delete from public.academy_chapters where user_id=current_setting('sky.owner')::uuid;
delete from public.academy_chapter_rewards where user_id=current_setting('sky.owner')::uuid and chapter='sky_first_light';
select set_config('request.jwt.claims',json_build_object('sub',current_setting('sky.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.academy_sky_chapter_write('start',0);raise exception 'Prerequisite skipped' using errcode='XX000';exception when raise_exception then null;end;
end $$;
reset role;
insert into public.academy_chapters(user_id,chapter,step,completed_at) values(current_setting('sky.owner')::uuid,'post_first_letter',30,now());
set local role authenticated;
do $$ declare g jsonb;t jsonb;begin
 for i in 0..8 loop perform public.academy_postlude_write(i);end loop;
 g:=public.academy_dormitory_write('save_goal','{"title":"TEST Chapter V prerequisite"}');
 for i in 1..5 loop
  t:=public.academy_dormitory_write('save_task',jsonb_build_object('title','TEST prerequisite '||i,'task_date','2199-01-01','related_goal_id',g->>'id'));
  perform public.academy_dormitory_write('complete',jsonb_build_object('id',t->>'id','completed',true));
 end loop;
end $$;
reset role;
select set_config('sky.balance',(select coins::text from public.academy_user_stats where user_id=current_setting('sky.owner')::uuid),true);
set local role authenticated;
do $$ declare c jsonb; g jsonb; t jsonb; prior jsonb; begin
 c:=public.academy_sky_chapter_write('start',0);
 for i in 0..15 loop c:=public.academy_sky_chapter_write('next',(c->>'revision')::int);end loop;
 begin perform public.academy_sky_chapter_write('next',(c->>'revision')::int);raise exception 'Arrival skipped' using errcode='XX000';exception when raise_exception then null;end;
 c:=public.academy_sky_chapter_write('arrive',(c->>'revision')::int);
 for i in 17..20 loop c:=public.academy_sky_chapter_write('next',(c->>'revision')::int);end loop;
 begin perform public.academy_sky_chapter_write('next',(c->>'revision')::int);raise exception 'Practice skipped' using errcode='XX000';exception when raise_exception then null;end;
 g:=public.academy_dormitory_write('save_goal','{"title":"TEST Chapter V"}');
 t:=public.academy_dormitory_write('save_task',jsonb_build_object('title','TEST first light','task_date','2199-01-01','related_goal_id',g->>'id'));
 begin perform public.academy_sky_chapter_write('light',(c->>'revision')::int,jsonb_build_object('plan_id',t->>'plan_id'));raise exception 'Unlit plan passed chapter' using errcode='XX000';exception when raise_exception then null;end;
 perform public.academy_dormitory_write('complete',jsonb_build_object('id',t->>'id','completed',true));
 c:=public.academy_sky_chapter_write('light',(c->>'revision')::int,jsonb_build_object('plan_id',t->>'plan_id'));
 begin perform public.academy_sky_chapter_write('next',(c->>'revision')::int);raise exception 'Placement skipped' using errcode='XX000';exception when raise_exception then null;end;
 begin perform public.academy_sky_chapter_write('place',(c->>'revision')::int,jsonb_build_object('plan_id',t->>'plan_id','x',-.1,'y',0));raise exception 'Bad placement passed' using errcode='XX000';exception when raise_exception then null;end;
 if (select sky_x from public.academy_user_goals where id=(g->>'id')::uuid) is not null then raise exception 'Partial chapter placement committed';end if;
 -- Simulate a prior successful sky write and a failed bookmark request.
 g:=public.academy_sky_write('place_constellation',(g->>'id')::uuid,null,.5,.5,null,null,0);
 g:=public.academy_sky_write('place_star',(g->>'id')::uuid,(t->>'plan_id')::uuid,.5,.5,null,null,1);
 prior:=c;
 c:=public.academy_sky_chapter_write('place',(c->>'revision')::int,jsonb_build_object('plan_id',t->>'plan_id'));
 if (c->>'step')::int<>23 then raise exception 'Saved-star recovery failed';end if;
 c:=public.academy_sky_chapter_write('place',(prior->>'revision')::int,jsonb_build_object('plan_id',t->>'plan_id'));
 if (c->>'step')::int<>23 then raise exception 'Retry advanced twice';end if;
 for i in 23..28 loop c:=public.academy_sky_chapter_write('next',(c->>'revision')::int);end loop;
 perform public.academy_sky_chapter_write('next',(c->>'revision')::int);
 if c->>'completed_at' is null then raise exception 'Chapter incomplete';end if;
end $$;
reset role;
do $$ begin
 if (select coins from public.academy_user_stats where user_id=current_setting('sky.owner')::uuid)<>current_setting('sky.balance')::int+50 then raise exception 'Chapter reward not exactly 50';end if;
 if (select count(*) from public.academy_chapter_rewards where user_id=current_setting('sky.owner')::uuid and chapter='sky_first_light')<>1 then raise exception 'Duplicate chapter reward';end if;
end $$;
select 'PASS Chapter V: prerequisites, action gates, atomic placement, recovery, stale retry, exactly 50 coins; rollback' as result;
rollback;
