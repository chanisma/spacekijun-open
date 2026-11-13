-- 이세계 사회인 직장 에피소드 (2026-10-25) 역할 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 학생 A: 비었을 때 · 넣은 장면 받기 · 답 못 한 장면은 다시(세지 않음) · 답 한 번 · 하루 2개 · 만들기 하루 3번 ·
-- 마지막 장면이면 시즌 끝 · 새 시즌은 진행 중이던 것을 dropped 로 · 표 직접 접근 거절. 학생 B 는 A 것을 못 받음. anon 거절.
begin;
select set_config('s3.a', (select p.id::text from public.profiles p where p.role = 'student' order by p.id limit 1), true);
select set_config('s3.b', (select p.id::text from public.profiles p where p.role = 'student' order by p.id offset 1 limit 1), true);
delete from public.isekai3d_episodes where user_id in (current_setting('s3.a')::uuid, current_setting('s3.b')::uuid);

-- (함수 전용) 시즌과 첫 장면
do $$ declare r jsonb; begin
  r := public.isekai3d_episode_add(current_setting('s3.a')::uuid, 'abcd1234:1', 'tech', '{"title":"새벽의 서버실","beats":["a","b"]}', '{"title":"하나","final":false}', 'solar-pro4');
  if r->>'status' <> 'added' or (r->>'idx')::int <> 0 then raise exception '첫 장면 넣기: %', r; end if;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; s1 uuid; begin
  if public.isekai3d_episode_take('abcd1234:1', 'doctor')->>'status' <> 'empty' then raise exception '다른 직장에서 받음'; end if;
  r := public.isekai3d_episode_take('abcd1234:1', 'tech');
  if r->>'status' <> 'scene' or (r->>'idx')::int <> 0 or r->'outline'->>'title' <> '새벽의 서버실' then raise exception '받기: %', r; end if;
  s1 := (r->>'sceneId')::uuid;
  -- 답하지 못한 채 다시 받으면 같은 장면 (게임이 꺼졌다 켜진 경우)
  r := public.isekai3d_episode_take('abcd1234:1', 'tech');
  if (r->>'sceneId')::uuid <> s1 then raise exception '다시 받기가 다른 장면: %', r; end if;
  if (public.isekai3d_episode_status('abcd1234:1', 'tech')->>'deliveredToday')::int <> 1 then raise exception '다시 받기를 셈'; end if;
  begin
    perform public.isekai3d_episode_answer(s1, null, null);
    raise exception '빈 답을 받음' using errcode = 'XX000';
  exception when sqlstate '22023' then null; end;
  r := public.isekai3d_episode_answer(s1, null, '선배에게 솔직하게 말해요');
  if r->>'status' <> 'answered' or (r->>'seasonDone')::boolean then raise exception '답: %', r; end if;
  if public.isekai3d_episode_answer(s1, 0::smallint, null)->>'status' <> 'already' then raise exception '두 번 답함'; end if;
  r := public.isekai3d_episode_status('abcd1234:1', 'tech');
  if r->'season'->'scenes'->0->>'text' <> '선배에게 솔직하게 말해요' then raise exception '상태에 답이 없음: %', r; end if;
  begin
    perform 1 from public.isekai3d_episode_scenes;
    raise exception '표를 직접 읽음' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform public.isekai3d_episode_add(current_setting('s3.a')::uuid, 'abcd1234:1', 'tech', null, '{}', null);
    raise exception '학생이 장면을 넣음' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 다음 장면 둘 (만들기 하루 3번째까지), 넷째는 한도
do $$ declare r jsonb; begin
  r := public.isekai3d_episode_add(current_setting('s3.a')::uuid, 'abcd1234:1', 'tech', null, '{"title":"둘","final":false}', 'solar-pro4');
  if (r->>'idx')::int <> 1 then raise exception '둘째 장면: %', r; end if;
  r := public.isekai3d_episode_add(current_setting('s3.a')::uuid, 'abcd1234:1', 'tech', null, '{"title":"셋","final":true}', 'solar-pro4');
  if (r->>'idx')::int <> 2 then raise exception '셋째 장면: %', r; end if;
  r := public.isekai3d_episode_add(current_setting('s3.a')::uuid, 'abcd1234:1', 'tech', null, '{"title":"넷"}', 'solar-pro4');
  if r->>'status' <> 'limit' then raise exception '만들기 한도를 못 막음: %', r; end if;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.isekai3d_episode_take('abcd1234:1', 'tech');
  if (r->>'idx')::int <> 1 then raise exception '둘째 받기: %', r; end if;
  perform public.isekai3d_episode_answer((r->>'sceneId')::uuid, 1::smallint, null);
  -- 오늘 둘을 받았다
  if public.isekai3d_episode_take('abcd1234:1', 'tech')->>'status' <> 'daily_done' then raise exception '하루 2개를 못 막음'; end if;
end $$;
reset role;

-- 내일인 셈 치고 (받은 때를 하루 앞으로): 마지막 장면을 받고 답하면 시즌이 끝난다
update public.isekai3d_episode_scenes set delivered_at = delivered_at - interval '1 day', created_at = created_at - interval '1 day'
 where user_id = current_setting('s3.a')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.isekai3d_episode_take('abcd1234:1', 'tech');
  if (r->>'idx')::int <> 2 then raise exception '셋째 받기: %', r; end if;
  r := public.isekai3d_episode_answer((r->>'sceneId')::uuid, 0::smallint, null);
  if not (r->>'seasonDone')::boolean then raise exception '시즌이 안 끝남: %', r; end if;
  r := public.isekai3d_episode_status('abcd1234:1', 'tech');
  if r->'season' <> 'null'::jsonb or r->'pastTitles'->>0 <> '새벽의 서버실' then raise exception '끝난 시즌: %', r; end if;
end $$;
reset role;

-- 새 시즌: 진행 중이던 것(있으면)은 dropped
do $$ declare r jsonb; begin
  perform public.isekai3d_episode_add(current_setting('s3.a')::uuid, 'abcd1234:1', 'tech', '{"title":"둘째 시즌"}', '{"title":"하나"}', null);
  r := public.isekai3d_episode_add(current_setting('s3.a')::uuid, 'abcd1234:1', 'tech', '{"title":"셋째 시즌"}', '{"title":"하나"}', null);
  if (r->>'idx')::int <> 0 then raise exception '새 시즌: %', r; end if;
  if (select count(*) from public.isekai3d_episodes where user_id = current_setting('s3.a')::uuid and status = 'active') <> 1 then raise exception '진행 중 시즌이 둘'; end if;
end $$;

-- 학생 B 는 A 의 시즌을 받지 못한다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if public.isekai3d_episode_take('abcd1234:1', 'tech')->>'status' <> 'empty' then raise exception 'B 가 A 의 장면을 받음'; end if;
end $$;
reset role;

-- anon
set local role anon;
do $$ begin
  perform public.isekai3d_episode_take('abcd1234:1', 'tech');
  raise exception 'anon 이 받음' using errcode = 'XX000';
exception when insufficient_privilege then null; end $$;
reset role;

rollback;
