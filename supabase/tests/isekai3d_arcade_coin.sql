-- 이세계 사회인 오락기 동전 (2026-10-20) 역할 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 학생 하나(지갑 12코인으로 맞춤)로: 첫 동전 무료 → 쓴 분량은 넣은 만큼까지만 → 둘째·셋째 5코인씩 →
-- 넷째는 거절 · 코인이 모자라면 아무것도 바뀌지 않음 · 표 직접 접근 거절 · anon 거절
begin;
select set_config('s3.student', (
  select p.id::text from public.profiles p where p.role = 'student' order by p.id limit 1), true);
delete from public.isekai3d_play_day where user_id = current_setting('s3.student')::uuid;
insert into public.academy_user_stats(user_id) values (current_setting('s3.student')::uuid) on conflict (user_id) do nothing;
update public.academy_user_stats set coins = 12 where user_id = current_setting('s3.student')::uuid;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.student'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.isekai3d_play_status();
  if (r->>'coins')::int <> 0 or (r->>'budget')::int <> 0 or (r->>'nextPrice')::int <> 0 or (r->>'admin')::boolean then
    raise exception '처음 상태: %', r; end if;
  r := public.isekai3d_play_use(100);
  if (r->>'used')::int <> 0 then raise exception '동전 없이 씀: %', r; end if;

  r := public.isekai3d_play_insert();
  if (r->>'coins')::int <> 1 or (r->>'budget')::int <> 1440 or (r->>'wallet')::int <> 12 or (r->>'nextPrice')::int <> 5 then
    raise exception '첫 동전(무료): %', r; end if;
  r := public.isekai3d_play_use(5000);
  if (r->>'used')::int <> 1440 then raise exception '넣은 만큼까지만: %', r; end if;
  r := public.isekai3d_play_use(10);
  if (r->>'used')::int <> 1440 then raise exception '쓴 분량이 줄어듦: %', r; end if;

  r := public.isekai3d_play_insert();
  if (r->>'coins')::int <> 2 or (r->>'wallet')::int <> 7 or (r->>'budget')::int <> 2880 then raise exception '둘째 동전: %', r; end if;
  r := public.isekai3d_play_insert();
  if (r->>'coins')::int <> 3 or (r->>'wallet')::int <> 2 or r->>'nextPrice' is not null then raise exception '셋째 동전: %', r; end if;
  begin
    perform public.isekai3d_play_insert();
    raise exception '넷째 동전을 받음' using errcode = 'XX000';
  exception when sqlstate 'P0001' then null; end;

  begin
    perform 1 from public.isekai3d_play_day;
    raise exception '표를 직접 읽음' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 코인이 모자라면: 동전 수도 지갑도 그대로
delete from public.isekai3d_play_day where user_id = current_setting('s3.student')::uuid;
update public.academy_user_stats set coins = 3 where user_id = current_setting('s3.student')::uuid;
set local role authenticated;
do $$ declare r jsonb; begin
  perform public.isekai3d_play_insert();
  begin
    perform public.isekai3d_play_insert();
    raise exception '모자란데 받음' using errcode = 'XX000';
  exception when sqlstate 'P0001' then null; end;
  r := public.isekai3d_play_status();
  if (r->>'coins')::int <> 1 or (r->>'wallet')::int <> 3 then raise exception '모자랄 때 바뀜: %', r; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.wallet_ledger where user_id = current_setting('s3.student')::uuid and kind = 'isekai3d_coin'
        and earned_on = (now() at time zone 'Asia/Seoul')::date) <> 2 then
    raise exception '원장 줄 수가 2가 아님';
  end if;
end $$;

-- anon
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  begin
    perform public.isekai3d_play_status();
    raise exception 'anon 이 부름' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'isekai3d_arcade_coin ok' as result;
rollback;
