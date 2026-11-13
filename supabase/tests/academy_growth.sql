begin;
select set_config('academy.test_owner',(select u.id::text from auth.users u join public.profiles p on p.id=u.id join public.student_basic_info s on s.id=split_part(u.email,'@',1) where p.role='student' limit 1),true);
select set_config('academy.test_other',(select u.id::text from auth.users u join public.profiles p on p.id=u.id join public.student_basic_info s on s.id=split_part(u.email,'@',1) where p.role='student' and u.id::text<>current_setting('academy.test_owner') limit 1),true);
-- Exercise the same database role as the authenticated edge function.
delete from public.academy_chapters where user_id=current_setting('academy.test_owner')::uuid;
set local role service_role;
do $$
declare owner_id uuid:=current_setting('academy.test_owner')::uuid; other_id uuid:=current_setting('academy.test_other')::uuid;
  code text; other_code text; design uuid; other_design uuid; activity uuid; other_activity uuid; j jsonb; r jsonb;
begin
  if owner_id is null or other_id is null then raise exception 'Two student fixtures required'; end if;
  select split_part(email,'@',1) into code from public.profiles where id=owner_id;
  select split_part(email,'@',1) into other_code from public.profiles where id=other_id;
  delete from public.academy_self_discoveries where user_id=owner_id;
  delete from public.academy_tutorials where user_id=owner_id;
  delete from public.academy_journeys where user_id=owner_id;
  delete from public.academy_game_progress where user_id=owner_id;
  begin perform public.academy_journey_transition(owner_id,'start',0); raise exception 'start without first quest accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  insert into public.academy_game_progress(user_id,quest_step,question) values(owner_id,'completed',repeat('내가 비교하고 싶은 조건 ',3));
  j:=public.academy_journey_transition(owner_id,'start',0);
  if j->>'stage'<>'seeking' then raise exception 'start failed'; end if;
  begin perform public.academy_discovery_write(owner_id,'journey',0,repeat('아직 하지 않은 경험 ',3)); raise exception 'unearned reflection accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  insert into public.student_inquiry_designs(student_id,title,target_kind,target_name,academic_year,grade,status,student_rationale,created_by)
    values(code,'academy rollback fixture','subject','과학',2026,3,'draft',repeat('직접 선택한 이유 ',3),owner_id) returning id into design;
  insert into public.student_inquiry_designs(student_id,title,target_kind,target_name,academic_year,grade,status,student_rationale,created_by)
    values(other_code,'academy other fixture','subject','과학',2026,3,'saved',repeat('다른 학생의 선택 ',3),other_id) returning id into other_design;
  begin perform public.academy_journey_transition(owner_id,'bind',0,other_design); raise exception 'foreign design accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  begin perform public.academy_journey_transition(owner_id,'bind',0,design); raise exception 'draft accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  update public.student_inquiry_designs set status='saved' where id=design;
  j:=public.academy_journey_transition(owner_id,'bind',0,design);
  if j->>'stage'<>'planned' then raise exception 'bind failed'; end if;
  if (public.academy_journey_transition(owner_id,'observe',0))->>'stage'<>'planned' then raise exception 'stale revision changed state'; end if;
  begin perform public.academy_journey_transition(owner_id,'observe',1); raise exception 'missing activity accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  insert into public.student_detailed_activities(student_id,content) values(code,'실제 수행 기록 테스트') returning id into activity;
  insert into public.student_detailed_activities(student_id,content) values(other_code,'다른 학생 수행 기록 테스트') returning id into other_activity;
  update public.student_inquiry_designs set status='observed',observed_activity_id=other_activity where id=design;
  begin perform public.academy_journey_transition(owner_id,'observe',1); raise exception 'foreign activity accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
  update public.student_inquiry_designs set observed_activity_id=activity where id=design;
  j:=public.academy_journey_transition(owner_id,'observe',1);
  if j->>'stage'<>'observed' then raise exception 'observe failed'; end if;
  begin perform public.academy_journey_transition(owner_id,'complete',2,null,'짧음'); raise exception 'empty reflection accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  j:=public.academy_journey_transition(owner_id,'complete',2,null,repeat('조건을 비교하며 직접 발견한 내용을 돌아봅니다. ',3));
  if j->>'stage'<>'completed' or (select reflection from public.student_inquiry_designs where id=design)<>j->>'reflection' then raise exception 'atomic reflection failed'; end if;
  if (public.academy_journey_transition(owner_id,'complete',3,null,repeat('다른 회고 ',10)))->>'revision'<>'3' then raise exception 'reward duplicated'; end if;
  r:=public.academy_discovery_write(owner_id,'first',0,'나는 직접 비교하는 활동을 더 해 보고 싶다.');
  begin perform public.academy_discovery_write(owner_id,'first',0,'다른 창에서 작성한 문장을 덮어쓰려는 요청'); raise exception 'stale discovery accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  r:=public.academy_discovery_write(owner_id,'first',1,'나는 비교할 조건을 정리하는 과정에 끌린다.');
  if r->>'previous_statement'<>'나는 직접 비교하는 활동을 더 해 보고 싶다.' then raise exception 'previous statement lost'; end if;
  r:=public.academy_discovery_write(owner_id,'first',2,null,false);
  if (r->>'memory_enabled')::boolean then raise exception 'memory exclusion failed'; end if;
  perform public.academy_discovery_write(owner_id,'journey',0,'나는 어려운 결과를 만나면 비교 기준부터 살펴보고 싶다.');
  perform public.academy_tutorial_write(owner_id,'pause');
  r:=public.academy_tutorial_write(owner_id,'telescope');
  if not (r->>'paused')::boolean or not (r->>'telescope_seen')::boolean then raise exception 'tutorial progress lost'; end if;
  r:=public.academy_tutorial_write(owner_id,'resume');
  if (r->>'paused')::boolean then raise exception 'resume failed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('academy.test_other'),'role','authenticated')::text,true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.academy_self_discoveries where user_id=current_setting('academy.test_owner')::uuid) or exists(select 1 from public.academy_journeys where user_id=current_setting('academy.test_owner')::uuid) or exists(select 1 from public.academy_tutorials where user_id=current_setting('academy.test_owner')::uuid) then raise exception 'foreign memory leaked'; end if;
  begin perform public.academy_journey_transition(auth.uid(),'start',0); raise exception 'client invoked privileged function' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin update public.academy_self_discoveries set memory_enabled=true; raise exception 'direct memory write allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform * from public.academy_journeys; raise exception 'anon read allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin perform public.academy_discovery_write(null,'first',0,'anonymous forged statement'); raise exception 'anon RPC allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: quest prerequisites, own design/activity, atomic reflection, stale revisions, reward replay, confirmed memory/exclusion, tutorial resume, RLS and RPC access; all fixtures rolled back' as result;
rollback;
