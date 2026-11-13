-- 이세계 사회인 저장 칸 서버 저장 (2026-10-20) 역할 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 학생 둘로: 올리기·목록·받기 · 판 충돌 · 판 없이 덮어쓰기 · 크기 상한 · 지우기 · 남의 칸은 안 보임 ·
-- 표 직접 접근 거절 · anon 거절
begin;
select set_config('s3.a', (select p.id::text from public.profiles p where p.role = 'student' order by p.id limit 1), true);
select set_config('s3.b', (select p.id::text from public.profiles p where p.role = 'student' order by p.id offset 1 limit 1), true);
delete from public.isekai3d_saves where user_id in (current_setting('s3.a')::uuid, current_setting('s3.b')::uuid);

-- 학생 A
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  if jsonb_array_length(public.isekai3d_save_list()) <> 0 then raise exception '빈 목록이 아님'; end if;
  r := public.isekai3d_save_get(2);
  if not (r->>'empty')::boolean then raise exception '빈 칸을 받음: %', r; end if;

  r := public.isekai3d_save_put(2, '{"version":1,"dwellers":[],"objects":[],"money":10}', '{"names":["하린"],"day":1,"money":10}', 1000, null);
  if not (r->>'ok')::boolean or (r->>'version')::int <> 1 then raise exception '첫 올리기: %', r; end if;
  r := public.isekai3d_save_put(2, '{"version":1,"dwellers":[],"objects":[],"money":20}', '{"names":["하린"],"day":2,"money":20}', 2000, 1);
  if (r->>'version')::int <> 2 then raise exception '둘째 올리기: %', r; end if;
  -- 옛 판(1)을 알고 올리면 충돌, 서버 것은 그대로
  r := public.isekai3d_save_put(2, '{"version":1,"dwellers":[],"objects":[],"money":99}', '{}', 3000, 1);
  if (r->>'ok')::boolean or not (r->>'conflict')::boolean or (r->>'savedAt')::bigint <> 2000 then raise exception '충돌을 못 막음: %', r; end if;
  r := public.isekai3d_save_get(2);
  if (r->'state'->>'money')::int <> 20 or (r->>'version')::int <> 2 then raise exception '충돌 뒤 바뀜: %', r; end if;
  -- 판 없이(사용자가 고름) 덮어쓰기
  r := public.isekai3d_save_put(2, '{"version":1,"dwellers":[],"objects":[],"money":99}', '{}', 3000, null);
  if (r->>'version')::int <> 3 then raise exception '덮어쓰기: %', r; end if;

  r := public.isekai3d_save_list();
  if jsonb_array_length(r) <> 1 or (r->0->>'slot')::int <> 2 or (r->0->>'savedAt')::bigint <> 3000 or r->0 ? 'state' then raise exception '목록: %', r; end if;

  begin
    perform public.isekai3d_save_put(4, '{"a":1}', '{}', 1, null);
    raise exception '없는 칸에 씀' using errcode = 'XX000';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.isekai3d_save_put(1, jsonb_build_object('big', repeat('x', 530000)), '{}', 1, null);
    raise exception '너무 큰 저장을 받음' using errcode = 'XX000';
  exception when sqlstate '22023' then null; end;
  begin
    perform 1 from public.isekai3d_saves;
    raise exception '표를 직접 읽음' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 학생 B 는 A 의 칸을 못 본다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  if jsonb_array_length(public.isekai3d_save_list()) <> 0 then raise exception 'B 가 A 의 칸을 봄'; end if;
  r := public.isekai3d_save_get(2);
  if not (r->>'empty')::boolean then raise exception 'B 가 A 의 저장을 받음: %', r; end if;
end $$;
reset role;

-- A 가 지우기
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.isekai3d_save_delete(2);
  if jsonb_array_length(public.isekai3d_save_list()) <> 0 then raise exception '지운 뒤에도 남음'; end if;
end $$;
reset role;

-- anon
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  begin
    perform public.isekai3d_save_list();
    raise exception 'anon 이 부름' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'isekai3d_saves ok' as result;
rollback;
