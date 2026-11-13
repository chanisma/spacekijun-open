-- «다른 PC» 와 «휴대폰» 따로 (2026-10-30) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261027120000 · 20261029130000 · 20261030100000 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 휴대폰만 켠 PC(p_cross=false)는 남의 목록에 없고 남이 보낼 수 없다 · 내 휴대폰은 그 PC 로 보낸다 ·
--      인자 없이 부르는 옛 데스크는 다른 PC 를 켠 것으로 본다 · 다시 켜면 목록에 돌아온다
begin;
select set_config('ap.a', (select ur.user_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                           join public.profiles p on p.id = ur.user_id
                           where r.type = 'teacher' and p.role = 'teacher' order by ur.user_id limit 1), true);
select set_config('ap.b', (select ur.user_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                           join public.profiles p on p.id = ur.user_id
                           where r.type = 'teacher' and p.role = 'teacher'
                             and public.desk_message_who(ur.user_id)->>'resource_id'
                                 <> public.desk_message_who(current_setting('ap.a')::uuid)->>'resource_id'
                           order by ur.user_id desc limit 1), true);
select set_config('ap.ra', public.desk_message_who(current_setting('ap.a')::uuid)->>'resource_id', true);

set local role authenticated;

-- A: 휴대폰만 켠 PC
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
select public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1","title":"비밀 제목","tool":"claude","status":"idle"}]', false);

-- B: 다른 PC 를 켠 PC (옛 데스크처럼 p_cross 없이)
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; ok boolean := false;
begin
  perform public.desk_agent_beat(repeat('b', 32), 'B-PC', '[{"name":"codex-1","title":"","tool":"codex","status":"idle"}]');
  v := public.desk_agent_directory(repeat('b', 32));
  if v @> jsonb_build_array(jsonb_build_object('device', repeat('a', 32))) then raise exception '휴대폰만 켠 PC 가 남의 목록에 보임: %', v; end if;
  begin
    perform public.desk_agent_send(repeat('b', 32), 'codex-1', current_setting('ap.ra')::uuid, repeat('a', 32), 'claude-1', '안녕하세요');
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '휴대폰만 켠 PC 로 남이 보냄'; end if;
end $$;

-- A 의 휴대폰은 그 PC 로 보낸다 · A 의 목록에는 B 가 보인다(인자 없이 = 다른 PC 켬)
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.desk_agent_phone_send(repeat('c', 32), repeat('a', 32), 'claude-1', '휴대폰에서');
  if v->>'agent' <> 'claude-1' then raise exception '휴대폰 보내기 실패: %', v; end if;
  v := public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1","title":"","tool":"claude","status":"idle"}]', false);
  if jsonb_array_length(v->'inbox') <> 1 or (v->'inbox'->0->>'from_phone')::boolean is not true then
    raise exception '휴대폰만 켠 PC 가 휴대폰 메시지를 못 받음: %', v->'inbox';
  end if;
  -- 다시 «다른 PC» 를 켠다
  perform public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1","title":"","tool":"claude","status":"idle"}]', true);
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.desk_agent_directory(repeat('b', 32));
  if not v @> jsonb_build_array(jsonb_build_object('device', repeat('a', 32))) then raise exception '다시 켠 PC 가 목록에 없음: %', v; end if;
end $$;

reset role;
select 'desk_agent_cross 시험 통과' as result;
rollback;
