begin;
select set_config('enc.owner',(select id::text from public.profiles where role='student' limit 1),true);
select set_config('enc.other',(select id::text from public.profiles where role='student' and id::text<>current_setting('enc.owner') limit 1),true);
delete from public.academy_luon_encouragements where user_id=current_setting('enc.owner')::uuid;
set local role service_role;
do $$ declare u uuid:=current_setting('enc.owner')::uuid; c jsonb; x jsonb; first_token uuid; second_token uuid; d date; begin
 c:=public.academy_encouragement_claim(u); d:=(c->'entry'->>'day')::date;
 if d<>(now() at time zone 'Asia/Seoul')::date or not (c->>'claimed')::boolean then raise exception 'KST claim failed'; end if;
 first_token:=(c->>'token')::uuid;
 x:=public.academy_encouragement_claim(u);
 if (x->>'claimed')::boolean then raise exception 'Concurrent claim accepted'; end if;
 x:=public.academy_encouragement_finish(u,d,first_token,null);
 if x->>'status'<>'failed' then raise exception 'Failure did not release lease'; end if;
 c:=public.academy_encouragement_claim(u); second_token:=(c->>'token')::uuid;
 x:=public.academy_encouragement_finish(u,d,first_token,'stale');
 if x->>'message' is not null then raise exception 'Stale worker wrote'; end if;
 x:=public.academy_encouragement_finish(u,d,second_token,'리아, 당신의 속도로 나아가도 괜찮아요.');
 c:=public.academy_encouragement_claim(u);
 if (c->>'claimed')::boolean or c->'entry'->>'message'<>x->>'message' then raise exception 'Same-day regeneration accepted'; end if;
 if c->'entry' ? 'lease_token' then raise exception 'Lease token leaked'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('enc.owner'),'role','authenticated')::text,true);
do $$ declare s jsonb; begin
 s:=public.academy_encouragement_read();
 if jsonb_array_length(s->'entries')<>1 then raise exception 'Saved encouragement missing'; end if;
 begin perform public.academy_encouragement_claim(auth.uid()); raise exception 'Client forged generation'; exception when insufficient_privilege then null; end;
 begin delete from public.academy_luon_encouragements where user_id=auth.uid(); raise exception 'Client bypassed daily limit'; exception when insufficient_privilege then null; end;
 begin perform public.academy_encouragement_read('30101'); raise exception 'Student preview accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('enc.other'),'role','authenticated')::text,true);
do $$ begin
 if exists(select day from public.academy_luon_encouragements where user_id=current_setting('enc.owner')::uuid) then raise exception 'Another student read private message'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.academy_encouragement_read(); raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: KST day, stored replay, concurrent claim, failed retry, stale token, private owner read and denied mutation/anonymous access (rolled back)' as result;
