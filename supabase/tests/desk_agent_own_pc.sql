-- «내 다른 PC» (2026-11-12) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261027120000 · 20261029130000 · 20261030100000 · 20261110130000 · 20261112150000 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 내 다른 PC 화면이 보낸 것은 받는 PC inbox 에 from_own_pc · 다른 선생님 것은 아니다 · 같은 PC 로는 못 보낸다 ·
--      cross_pc 를 끈 내 PC 에도 보낸다 · 남의 PC 로는 못 보낸다 · 답은 보낸 화면의 overview 에 붙는다 · overview 에 이 PC 는 없다
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

-- B(다른 선생님) PC — 다른 PC 켬
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
select public.desk_agent_beat(repeat('b', 32), 'B-PC', '[{"name":"codex-1","title":"","tool":"codex","status":"idle"}]', true);

-- A 의 두 PC: 집(다른 PC 끔 — 휴대폰만) · 학교
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; t text := '11111111-2222-4333-8444-555555555555'; ok boolean;
begin
  perform public.desk_agent_beat(repeat('1', 32), '집 PC', jsonb_build_array(jsonb_build_object('name', 'claude-1', 'title', '집 일', 'tool', 'claude', 'status', 'idle', 'thread', t)), false);
  perform public.desk_agent_beat(repeat('2', 32), '학교 PC', '[{"name":"claude-2","title":"","tool":"claude","status":"idle"}]', true);
  -- 학교 PC 화면 → 집 PC claude-1 (cross_pc 꺼져 있어도)
  v := public.desk_agent_own_send(repeat('2', 32), repeat('1', 32), 'claude-1', '집에서 해 줘', t);
  if v->>'agent' <> 'claude-1' then raise exception '내 PC 보내기 실패: %', v; end if;
  perform set_config('ap.m', v->>'id', true);
  -- 같은 PC 로는 못 보낸다
  ok := false;
  begin perform public.desk_agent_own_send(repeat('2', 32), repeat('2', 32), 'claude-2', 'x'); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '같은 PC 로 보냄'; end if;
  -- 남의 PC(B)로는 못 보낸다(내 PC 가 아니다)
  ok := false;
  begin perform public.desk_agent_own_send(repeat('2', 32), repeat('b', 32), 'codex-1', 'x'); exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '남의 PC 로 내 PC 보내기가 됨'; end if;
  -- 끝난 방에는 못 보낸다
  ok := false;
  begin perform public.desk_agent_own_send(repeat('2', 32), repeat('1', 32), 'claude-1', 'x', '99999999-2222-4333-8444-555555555555'); exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '끝난 방으로 보냄'; end if;
  -- 집 PC 가 받는다 — from_own_pc
  v := public.desk_agent_beat(repeat('1', 32), '집 PC', jsonb_build_array(jsonb_build_object('name', 'claude-1', 'title', '집 일', 'tool', 'claude', 'status', 'idle', 'thread', t)), false);
  if jsonb_array_length(v->'inbox') <> 1 or (v->'inbox'->0->>'from_own_pc')::boolean is not true or (v->'inbox'->0->>'from_phone')::boolean then
    raise exception '집 PC inbox: %', v->'inbox';
  end if;
  perform public.desk_agent_ack(repeat('1', 32), current_setting('ap.m')::uuid, 'delivered');
  perform public.desk_agent_reply(repeat('1', 32), 'claude-1', current_setting('ap.m')::uuid, '다 했습니다');
  -- 학교 PC 화면 overview: 집 PC 만(이 PC 없음), 보낸 것 + 답
  v := public.desk_agent_own_overview(repeat('2', 32));
  if jsonb_array_length(v->'pcs') <> 1 or v->'pcs'->0->>'device' <> repeat('1', 32) then raise exception 'overview pcs: %', v->'pcs'; end if;
  if v->'messages'->0->'replies'->0->>'body' <> '다 했습니다' then raise exception 'overview 답: %', v->'messages'; end if;
  -- 답은 학교 PC inbox 에 is_reply 로(받는 에이전트 이름 = desk)
  v := public.desk_agent_beat(repeat('2', 32), '학교 PC', '[{"name":"claude-2","title":"","tool":"claude","status":"idle"}]', true);
  if (v->'inbox'->0->>'is_reply')::boolean is not true or v->'inbox'->0->>'agent' <> 'desk' or (v->'inbox'->0->>'from_own_pc')::boolean is not true then
    raise exception '학교 PC 가 받은 답: %', v->'inbox';
  end if;
end $$;

-- 다른 선생님(B)이 보낸 것은 from_own_pc 가 아니다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
select public.desk_agent_send(repeat('b', 32), 'codex-1', current_setting('ap.ra')::uuid, repeat('2', 32), 'claude-2', '안녕하세요');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.desk_agent_beat(repeat('2', 32), '학교 PC', '[{"name":"claude-2","title":"","tool":"claude","status":"idle"}]', true);
  if not exists (select 1 from jsonb_array_elements(v->'inbox') x where x->>'body' = '안녕하세요' and (x->>'from_own_pc')::boolean is false) then
    raise exception '다른 선생님 메시지 표시: %', v->'inbox';
  end if;
end $$;

reset role;
select 'desk_agent_own_pc PASS' as result;
rollback;
