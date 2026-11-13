begin;
select set_config('academy.daily_owner', (select p.id::text from public.profiles p join auth.users u on u.id=p.id where p.role='student' limit 1), true);
select set_config('academy.daily_other', (select id::text from auth.users where id::text <> current_setting('academy.daily_owner') limit 1), true);
delete from public.academy_daily_conversations where user_id::text=current_setting('academy.daily_owner');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('academy.daily_owner'),'role','authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.academy_daily_state()->'conversation' <> 'null'::jsonb then raise exception 'Read generated a question'; end if;
  if (public.academy_daily_state()->>'day')::date <> (now() at time zone 'Asia/Seoul')::date then raise exception 'Wrong timezone'; end if;
  begin perform public.academy_daily_claim(auth.uid(),current_date,0,null); raise exception 'Client claim allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.academy_daily_conversations(user_id,day,npc) values(auth.uid(),current_date,'luon'); raise exception 'Client insert allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$
declare uid uuid := current_setting('academy.daily_owner')::uuid; d date := (now() at time zone 'Asia/Seoul')::date; a jsonb; b jsonb; done jsonb; old_token uuid;
begin
  a := public.academy_daily_claim(uid,d,0,null);
  if not (a->>'claimed')::boolean then raise exception 'Initial claim failed'; end if;
  if a->'conversation'->>'question' is not null then raise exception 'Question prefilled'; end if;
  if jsonb_array_length(a->'conversation'->'turns') <> 1 then raise exception 'Waiting dialogue not stored'; end if;
  b := public.academy_daily_claim(uid,d,0,null);
  if (b->>'claimed')::boolean then raise exception 'Stale tab duplicated generation'; end if;
  b := public.academy_daily_claim(uid,d,1,null);
  if (b->>'claimed')::boolean then raise exception 'Active lease duplicated generation'; end if;
  old_token := (a->>'token')::uuid;
  done := public.academy_daily_finish(uid,d,old_token,null);
  if done->>'status' <> 'failed' then raise exception 'Failure not retryable'; end if;
  a := public.academy_daily_claim(uid,d,(done->>'revision')::integer,null);
  b := public.academy_daily_finish(uid,d,old_token,'stale question');
  if b->>'question' is not null then raise exception 'Old worker overwrote question'; end if;
  done := public.academy_daily_finish(uid,d,(a->>'token')::uuid,'왜 그렇게 생각하니?');
  b := public.academy_daily_claim(uid,d,(done->>'revision')::integer,null);
  if (b->>'claimed')::boolean then raise exception 'Daily question repeated'; end if;
  a := public.academy_daily_claim(uid,d,(done->>'revision')::integer,'관찰한 근거가 있어요.');
  if a->'conversation'->>'pending_message' <> '관찰한 근거가 있어요.' then raise exception 'Answer not durable before AI'; end if;
  done := public.academy_daily_finish(uid,d,(a->>'token')::uuid,null);
  a := public.academy_daily_claim(uid,d,(done->>'revision')::integer,'another tab draft');
  if a->'conversation'->>'pending_message' <> '관찰한 근거가 있어요.' then raise exception 'Retry replaced pending answer'; end if;
  done := public.academy_daily_finish(uid,d,(a->>'token')::uuid,'그 관찰을 조금 더 들려주겠니?');
  if done->>'question' <> '왜 그렇게 생각하니?' or jsonb_array_length(done->'turns') <> 5 then raise exception 'Dialogue or original question lost'; end if;
  begin perform public.academy_daily_claim(uid,d-1,0,null); raise exception 'Past date generation allowed'; exception when raise_exception then if sqlerrm='Past date generation allowed' then raise; end if; end;
  if (select count(*) from public.academy_daily_conversations where user_id=uid) <> 1 then raise exception 'More than one daily row'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
  if (select count(*) from public.academy_daily_conversations) <> 1 then raise exception 'Owner cannot read'; end if;
  begin update public.academy_daily_conversations set question='tampered'; raise exception 'Client update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.academy_daily_conversations; raise exception 'Client delete allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('academy.daily_other'),'role','authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists(select 1 from public.academy_daily_conversations where user_id::text=current_setting('academy.daily_owner')) then raise exception 'Cross owner read leaked'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform * from public.academy_daily_conversations; raise exception 'Anon read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.academy_daily_state(); raise exception 'Anon state allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: read-only entry, KST day, one question, concurrent lease/revision guards, failure retries, durable answer/dialogue, owner-only reads and server-only writes; fixtures rolled back' as result;
rollback;
