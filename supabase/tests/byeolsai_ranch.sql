-- 별사이 목장 회귀 (20261106150000_byeolsai_ranch.sql + 20261106160000_byeolsai_ranch_skeleton.sql). 전부 롤백한다.
-- 학생 = 별사이 목장 기록이 없는 재학생. 시각은 ranch.test_now 로 정한다(쉬는 시간 · 수업 시간).
begin;
select set_config('r.s', (select p.id::text from public.profiles p where p.role = 'student'
  and not exists (select 1 from public.ranch_state x where x.owner = p.id) order by p.id limit 1), true);
select set_config('r.today', ((now() at time zone 'Asia/Seoul')::date)::text, true);
insert into public.academy_user_stats(user_id, coins) values (current_setting('r.s')::uuid, 100) on conflict (user_id) do update set coins = 100;
delete from public.wallet_ledger where user_id = current_setting('r.s')::uuid and source_app = 'ranch';

-- 학생으로
select set_config('request.jwt.claims', json_build_object('sub', current_setting('r.s'), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('ranch.test_now', (current_setting('r.today') || ' 08:20:00+09'), true);   -- 1교시 전

do $$
declare j jsonb; v int;
begin
  -- ① 처음 읽기 — 목장 없음, 오늘 5코인
  j := public.ranch_read();
  if j->'ranch' <> 'null'::jsonb then raise exception 'FAIL: 처음에는 목장이 없어야 한다 %', j; end if;
  if (j->'today'->>'coins_left')::int <> 5 or (j->'today'->>'unit')::int <> 30 then raise exception 'FAIL: 오늘 교환 정보 %', j->'today'; end if;
  -- ② 처음 저장 — 조각이 너무 많으면 거절
  j := public.ranch_save(0, '{"v":2,"shards":99999}');
  if not (j->>'conflict')::boolean or j->>'rejected' is null then raise exception 'FAIL: 처음 저장에 조각 99999는 거절 %', j; end if;
  j := public.ranch_save(0, '{"v":1,"shards":40}');
  if (j->>'conflict')::boolean or (j->>'version')::int <> 1 then raise exception 'FAIL: 처음 저장 %', j; end if;
  -- ③ 옛 판 번호 → conflict + 서버 것
  j := public.ranch_save(0, '{"v":1,"shards":41}');
  if not (j->>'conflict')::boolean or (j->'ranch'->>'version')::int <> 1 then raise exception 'FAIL: 옛 판 번호는 conflict %', j; end if;
  -- ④ 말이 안 되게 늘면 거절 (방금 저장 → 50,000개까지)
  j := public.ranch_save(1, '{"v":2,"shards":90000}');
  if not (j->>'conflict')::boolean or j->>'rejected' is null then raise exception 'FAIL: 조각이 너무 빨리 늘면 거절 %', j; end if;
  j := public.ranch_save(1, '{"v":1,"shards":100}');
  if (j->>'conflict')::boolean or (j->>'version')::int <> 2 then raise exception 'FAIL: 정상 저장 %', j; end if;
  -- ⑤ 형식
  begin perform public.ranch_save(2, '[1,2]'); raise exception 'FAIL: 배열 저장이 통과'; exception when sqlstate '22023' then null; end;
  begin perform public.ranch_save(2, '{"shards":-1}'); raise exception 'FAIL: 음수 조각이 통과'; exception when sqlstate '22023' then null; end;
  begin perform public.ranch_save(2, '{"shards":3000000000}'); raise exception 'FAIL: 20억 넘는 조각이 통과'; exception when sqlstate '22023' then null; end;
  begin perform public.ranch_save(2, '{"shards":12.5}'); raise exception 'FAIL: 소수 조각이 통과'; exception when sqlstate '22023' then null; end;
  -- ⑥ 코인 교환 — 쉬는 시간에 30개 → 1코인, 상한
  j := public.ranch_sell_shards(3);
  if (j->>'coins')::int <> 3 or (j->'ranch'->'state'->>'shards')::int <> 10 or (j->'today'->>'coins_left')::int <> 2 then raise exception 'FAIL: 교환 %', j; end if;
  if (select coins from public.academy_user_stats where user_id = current_setting('r.s')::uuid) <> 103 then raise exception 'FAIL: 지갑이 3 늘어야 한다'; end if;
  begin perform public.ranch_sell_shards(1); raise exception 'FAIL: 조각이 모자란데 교환됨'; exception when sqlstate 'P0001' then null; end;
  begin perform public.ranch_sell_shards(0); raise exception 'FAIL: 0번 교환이 통과'; exception when sqlstate '22023' then null; end;
  -- 교환 뒤 판 번호가 올랐다 — 옛 번호로 저장하면 conflict
  v := (public.ranch_read()->'ranch'->>'version')::int;
  if v <> 3 then raise exception 'FAIL: 교환 뒤 판 번호 3 이어야 한다 (%)', v; end if;
  j := public.ranch_save(2, '{"v":1,"shards":100}');
  if not (j->>'conflict')::boolean then raise exception 'FAIL: 교환 뒤 옛 판으로 조각을 되살리면 안 된다 %', j; end if;
  -- ⑦ 공부 선물 — 오늘 기록이 없으면 없음
  j := public.ranch_study_gifts();
  if j->'granted' <> '{}'::jsonb then raise exception 'FAIL: 기록 없는 날 선물 %', j; end if;
end $$;

-- ⑧ 수업 시간에는 교환 거절 — 이번 학기 시간표에 수업이 있는 학생으로(없으면 건너뛴다)
reset role;
select set_config('r.c', coalesce((select p.id::text from public.profiles p join public.resource r on r.type = 'student' and r.meta->>'id' = split_part(p.email, '@', 1)
  join public.student_timetable s on s.resource_id = r.id
  where p.role = 'student' and s.day_of_week = 1 and s.period = 2 order by p.id limit 1), ''), true);
do $$
declare monday date := (current_setting('r.today')::date - (extract(isodow from current_setting('r.today')::date)::int - 1));
begin
  if current_setting('r.c') = '' then raise notice 'SKIP: 월요일 2교시 수업이 있는 학생이 없다'; return; end if;
  insert into public.ranch_state(owner, state, version, shards) values (current_setting('r.c')::uuid, '{"shards":60}', 1, 60)
    on conflict (owner) do update set state = '{"shards":60}', shards = 60;
  perform set_config('ranch.test_now', monday::text || ' 10:20:00+09', true);
  if not ranch_private.in_class(current_setting('r.c')::uuid) then raise exception 'FAIL: 월요일 2교시는 수업 중이어야 한다'; end if;
  perform set_config('ranch.test_now', monday::text || ' 10:55:00+09', true);
  if ranch_private.in_class(current_setting('r.c')::uuid) then raise exception 'FAIL: 10:55 는 쉬는 시간'; end if;
  perform set_config('ranch.test_now', monday::text || ' 10:20:00+09', true);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('r.c'), ''), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if current_setting('r.c') = '' then return; end if;
  begin perform public.ranch_sell_shards(1); raise exception 'FAIL: 수업 중 교환이 통과';
  exception when sqlstate 'P0001' then if sqlerrm not like '%수업 중%' then raise; end if; end;
end $$;

-- ⑨ 표에 직접 쓰기·남의 목장 읽기·anon
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('r.s'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin update public.ranch_state set shards = 99999 where owner = current_setting('r.s')::uuid; raise exception 'FAIL: 표를 직접 고쳤다';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.ranch_state where owner <> current_setting('r.s')::uuid) > 0 then raise exception 'FAIL: 남의 목장이 보인다'; end if;
  begin perform 1 from public.ranch_gift; raise exception 'FAIL: 선물 기록이 보인다'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin perform public.ranch_read(); raise exception 'FAIL: anon 이 읽었다'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'PASS: byeolsai_ranch' as result;
rollback;
