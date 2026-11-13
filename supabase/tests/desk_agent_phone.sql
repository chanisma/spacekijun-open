-- 휴대폰 → 내 PC 의 에이전트 (2026-10-29) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261027120000_desk_agent_peer.sql · 20261029130000_desk_agent_phone.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 내 PC 목록·에이전트 → 휴대폰에서 보내기 → 데스크 inbox(from_phone=true, is_reply=false) → ack → 답 →
--      휴대폰 목록에 답이 붙음 · 휴대폰 앞 답은 10분 만료에서 빠짐 · 남의 PC·꺼진 PC·없는 에이전트·빈 글·잘못된 휴대폰 id 거절
--      · 남의 휴대폰 메시지는 내 목록에 안 보임 · 다른 교사가 보낸 것은 from_phone=false · 학생 거절
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
select set_config('ap.student', (select p.id::text from public.profiles p where p.role = 'student' order by p.id limit 1), true);
select set_config('ap.ra', public.desk_message_who(current_setting('ap.a')::uuid)->>'resource_id', true);
select set_config('ap.rb', public.desk_message_who(current_setting('ap.b')::uuid)->>'resource_id', true);

do $$ begin
  if coalesce(current_setting('ap.ra', true), '') = '' or coalesce(current_setting('ap.rb', true), '') = '' then
    raise exception '교사 계정 둘을 찾지 못함';
  end if;
end $$;

set local role authenticated;

-- B: PC 하나 (A 의 휴대폰이 B 의 PC 로 보내면 안 된다)
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
select public.desk_agent_beat(repeat('b', 32), 'B-PC', '[{"name":"claude-1","title":"","tool":"claude","status":"idle"}]');

-- A: PC 하나 + 휴대폰
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; pc jsonb; ok boolean;
begin
  perform public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1","title":"보고서","tool":"claude","status":"idle"}]');
  v := public.desk_agent_phone_overview();
  if jsonb_array_length(v->'pcs') <> 1 then raise exception '내 PC 가 하나여야 함: %', v->'pcs'; end if;
  pc := v->'pcs'->0;
  if pc->>'device' <> repeat('a', 32) or (pc->>'online')::boolean is not true or pc->'agents'->0->>'name' <> 'claude-1' then
    raise exception 'PC 목록이 이상함: %', pc;
  end if;

  v := public.desk_agent_phone_send(repeat('c', 32), repeat('a', 32), 'claude-1', '  오늘 회의록 요약해 줘  ');
  perform set_config('ap.m1', v->>'id', true);
  if v->>'label' <> 'A-PC' or v->>'agent' <> 'claude-1' then raise exception '보내기 답이 이상함: %', v; end if;

  -- 거절되어야 하는 것
  ok := false; begin perform public.desk_agent_phone_send(repeat('c', 32), repeat('b', 32), 'claude-1', 'x');
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '남의 PC 로 보내짐'; end if;
  ok := false; begin perform public.desk_agent_phone_send(repeat('c', 32), repeat('a', 32), 'codex-9', 'x');
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '없는 에이전트로 보내짐'; end if;
  ok := false; begin perform public.desk_agent_phone_send(repeat('c', 32), repeat('a', 32), 'claude-1', '   ');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '빈 글이 보내짐'; end if;
  ok := false; begin perform public.desk_agent_phone_send('phone', repeat('a', 32), 'claude-1', 'x');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '잘못된 휴대폰 id 가 통과'; end if;
  ok := false; begin perform public.desk_agent_phone_send(repeat('c', 32), repeat('d', 32), 'claude-1', 'x');
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '없는 PC 로 보내짐'; end if;

  -- 데스크가 받아 간다 — from_phone
  v := public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1","title":"보고서","tool":"claude","status":"idle"}]');
  if jsonb_array_length(v->'inbox') <> 1 then raise exception 'inbox 가 하나여야 함: %', v->'inbox'; end if;
  if (v->'inbox'->0->>'from_phone')::boolean is not true or (v->'inbox'->0->>'is_reply')::boolean is not false
     or v->'inbox'->0->>'body' <> '오늘 회의록 요약해 줘' or v->'inbox'->0->'sender'->>'label' <> '휴대폰' then
    raise exception 'inbox 줄이 이상함: %', v->'inbox'->0;
  end if;
  if not (public.desk_agent_ack(repeat('a', 32), current_setting('ap.m1')::uuid, 'delivered')->>'ok')::boolean then
    raise exception 'ack 실패';
  end if;

  -- 에이전트가 결과를 돌려보낸다 → 휴대폰 목록에 붙는다
  v := public.desk_agent_reply(repeat('a', 32), 'claude-1', current_setting('ap.m1')::uuid, '요약: 세 가지 안건');
  if v->>'label' <> '휴대폰' then raise exception '답의 받는 쪽이 휴대폰이 아님: %', v; end if;
  v := public.desk_agent_phone_overview();
  if jsonb_array_length(v->'messages') <> 1 then raise exception '보낸 메시지가 하나여야 함: %', v->'messages'; end if;
  if v->'messages'->0->>'status' <> 'delivered' or v->'messages'->0->'replies'->0->>'body' <> '요약: 세 가지 안건'
     or v->'messages'->0->>'to_label' <> 'A-PC' then
    raise exception '휴대폰 목록이 이상함: %', v->'messages'->0;
  end if;

end $$;

-- 휴대폰 앞 답은 데스크 inbox 에 나오지 않고, 10분이 지나도 만료되지 않는다 (표는 사용자 역할로 못 건드린다 — 관리자로 시계를 돌린다)
reset role;
update public.desk_agent_message set created_at = now() - interval '20 minutes'
 where reply_to = current_setting('ap.m1')::uuid;
do $$ begin
  if not exists (select 1 from public.desk_agent_message where reply_to = current_setting('ap.m1')::uuid) then
    raise exception '답이 저장되지 않음';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1","title":"","tool":"claude","status":"idle"}]');
  if jsonb_array_length(v->'inbox') <> 0 then raise exception '휴대폰 앞 답이 PC inbox 에 보임: %', v->'inbox'; end if;
  v := public.desk_agent_phone_overview();
  if v->'messages'->0->'replies'->0->>'body' <> '요약: 세 가지 안건' then raise exception '오래된 답이 사라짐'; end if;
end $$;
reset role;
do $$ begin
  if (select status from public.desk_agent_message where reply_to = current_setting('ap.m1')::uuid) <> 'sent' then
    raise exception '휴대폰 앞 답이 만료됨';
  end if;
end $$;
set local role authenticated;

-- B 는 A 의 휴대폰 메시지를 못 보고, B 가 A 에게 보낸 것은 from_phone=false
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.desk_agent_phone_overview();
  if jsonb_array_length(v->'messages') <> 0 then raise exception 'B 에게 A 의 휴대폰 메시지가 보임'; end if;
  if v->'pcs' @> jsonb_build_array(jsonb_build_object('device', repeat('a', 32))) then raise exception 'B 에게 A 의 PC 가 보임'; end if;
  perform public.desk_agent_send(repeat('b', 32), 'claude-1', current_setting('ap.ra')::uuid, repeat('a', 32), 'claude-1', '검토 부탁');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1","title":"","tool":"claude","status":"idle"}]');
  if jsonb_array_length(v->'inbox') <> 1 or (v->'inbox'->0->>'from_phone')::boolean is not false then
    raise exception '다른 교사의 메시지가 from_phone 으로 보임: %', v->'inbox';
  end if;
end $$;

-- 학생은 거절
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.student'), 'role', 'authenticated')::text, true);
do $$
declare ok boolean := false;
begin
  begin perform public.desk_agent_phone_overview(); exception when others then ok := true; end;
  if not ok then raise exception '학생이 목록을 봄'; end if;
  ok := false;
  begin perform public.desk_agent_phone_send(repeat('c', 32), repeat('a', 32), 'claude-1', 'x'); exception when others then ok := true; end;
  if not ok then raise exception '학생이 보냄'; end if;
end $$;

reset role;
select 'desk_agent_phone 시험 통과' as result;
rollback;
