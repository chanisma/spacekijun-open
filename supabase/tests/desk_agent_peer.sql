-- 데스크 에이전트 PC 사이 메시지 (2026-10-27) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261027120000_desk_agent_peer.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 교사 A·B 두 PC → 목록(자기 PC 빼고) · 보내기 · 받는 쪽 inbox(is_reply=false) · ack · 답(결과) → A inbox(is_reply=true)
--      · 상태와 답 목록 · 꺼진 PC·없는 에이전트·같은 PC·빈 글·받지 않은 메시지에 답 거절 · 남의 메시지 ack 무시
--      · 학생 거절 · 표 직접 접근 거절 · 10분 지난 것 expired · leave 하면 목록에서 빠짐
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

-- A: PC 하나를 알리고, B 는 아직 없다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1","title":"보고서","tool":"claude","status":"idle","folder":"C:/secret"},{"name":"bad name"}]');
  if jsonb_array_length(v->'inbox') <> 0 then raise exception 'A inbox 가 비어 있지 않음'; end if;
  if public.desk_agent_directory(repeat('a', 32)) @> jsonb_build_array(jsonb_build_object('device', repeat('a', 32))) then
    raise exception '목록에 자기 PC 가 보임';
  end if;
end $$;

-- B: PC 를 알리고 A 를 목록에서 본다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; row jsonb;
begin
  perform public.desk_agent_beat(repeat('b', 32), 'B-PC', '[{"name":"codex-1","title":"","tool":"codex","status":"working"}]');
  v := public.desk_agent_directory(repeat('b', 32));
  select x into row from jsonb_array_elements(v) x where x->>'device' = repeat('a', 32);
  if row is null then raise exception 'B 의 목록에 A PC 가 없음: %', v; end if;
  if jsonb_array_length(row->'agents') <> 1 or row->'agents'->0 ? 'folder' then raise exception 'A 의 에이전트 목록이 이상함: %', row->'agents'; end if;
end $$;

-- A → B 보내기, 그리고 거절되어야 하는 것들
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; ok boolean;
begin
  v := public.desk_agent_send(repeat('a', 32), 'claude-1', current_setting('ap.rb')::uuid, repeat('b', 32), 'codex-1', '  이 표를 검토해 주세요  ');
  perform set_config('ap.m1', v->>'id', true);
  if v->>'agent' <> 'codex-1' or v->>'label' <> 'B-PC' then raise exception '보내기 답이 이상함: %', v; end if;

  ok := false; begin perform public.desk_agent_send(repeat('a', 32), 'claude-1', current_setting('ap.rb')::uuid, repeat('b', 32), 'codex-9', 'x');
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '없는 에이전트에게 보내짐'; end if;
  ok := false; begin perform public.desk_agent_send(repeat('a', 32), 'claude-1', current_setting('ap.rb')::uuid, repeat('c', 32), 'codex-1', 'x');
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '연결 안 된 PC 로 보내짐'; end if;
  ok := false; begin perform public.desk_agent_send(repeat('a', 32), 'claude-1', current_setting('ap.ra')::uuid, repeat('a', 32), 'claude-1', 'x');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '같은 PC 로 보내짐'; end if;
  ok := false; begin perform public.desk_agent_send(repeat('a', 32), 'claude-1', current_setting('ap.rb')::uuid, repeat('b', 32), 'codex-1', '   ');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '빈 글이 보내짐'; end if;
  ok := false; begin perform public.desk_agent_send(repeat('d', 32), 'claude-1', current_setting('ap.rb')::uuid, repeat('b', 32), 'codex-1', 'x');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '알리지 않은 PC 에서 보내짐'; end if;
  ok := false; begin perform public.desk_agent_reply(repeat('a', 32), 'claude-1', current_setting('ap.m1')::uuid, '내가 나에게');
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '보낸 사람이 자기 메시지에 답함'; end if;
end $$;

-- B: 받기(새 요청 = is_reply false) → 받기 전 답 거절 → ack → 답
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; m jsonb; ok boolean;
begin
  v := public.desk_agent_beat(repeat('b', 32), 'B-PC', '[{"name":"codex-1","title":"","tool":"codex","status":"idle"}]');
  if jsonb_array_length(v->'inbox') <> 1 then raise exception 'B inbox 수 %', jsonb_array_length(v->'inbox'); end if;
  m := v->'inbox'->0;
  if m->>'body' <> '이 표를 검토해 주세요' or (m->>'is_reply')::boolean or m->>'agent' <> 'codex-1'
     or m->'sender'->>'agent' <> 'claude-1' or m->'sender'->>'label' <> 'A-PC' then
    raise exception 'B 가 받은 것이 이상함: %', m;
  end if;
  ok := false; begin perform public.desk_agent_reply(repeat('b', 32), 'codex-1', current_setting('ap.m1')::uuid, '결과');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '받아 들이기 전에 답이 됨'; end if;
  if not (public.desk_agent_ack(repeat('b', 32), current_setting('ap.m1')::uuid, 'delivered')->>'ok')::boolean then raise exception 'ack 실패'; end if;
  if (public.desk_agent_ack(repeat('b', 32), current_setting('ap.m1')::uuid, 'refused')->>'ok')::boolean then raise exception '두 번 ack 됨'; end if;
  if jsonb_array_length(public.desk_agent_beat(repeat('b', 32), 'B-PC', '[{"name":"codex-1"}]')->'inbox') <> 0 then raise exception 'ack 뒤에도 inbox 에 남음'; end if;
  v := public.desk_agent_reply(repeat('b', 32), 'codex-1', current_setting('ap.m1')::uuid, '검토 결과: 2행 합계가 틀림');
  perform set_config('ap.r1', v->>'id', true);
  if v->>'agent' <> 'claude-1' or v->>'label' <> 'A-PC' then raise exception '답이 엉뚱한 곳으로: %', v; end if;
end $$;

-- A: 결과를 받는다(is_reply true) · 상태와 답 목록 · 결과에 이어 답하기
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; m jsonb; s jsonb;
begin
  v := public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1"}]');
  if jsonb_array_length(v->'inbox') <> 1 then raise exception 'A inbox 수 %', jsonb_array_length(v->'inbox'); end if;
  m := v->'inbox'->0;
  if not (m->>'is_reply')::boolean or m->>'reply_to' <> current_setting('ap.m1') or m->>'agent' <> 'claude-1' then
    raise exception 'A 가 받은 결과가 이상함: %', m;
  end if;
  s := public.desk_agent_status(repeat('a', 32), array[current_setting('ap.m1')::uuid]);
  if s->0->>'status' <> 'delivered' or jsonb_array_length(s->0->'replies') <> 1 then raise exception '상태가 이상함: %', s; end if;
  if jsonb_array_length(public.desk_agent_status(repeat('b', 32), array[current_setting('ap.m1')::uuid])) <> 0 then
    raise exception '다른 PC 표시로 남의 상태가 보임';
  end if;
  perform public.desk_agent_ack(repeat('a', 32), current_setting('ap.r1')::uuid, 'delivered');
  v := public.desk_agent_reply(repeat('a', 32), 'claude-1', current_setting('ap.r1')::uuid, '고마워요, 고쳐서 다시 보낼게요');
  if v->>'agent' <> 'codex-1' then raise exception '이어 답하기가 엉뚱한 곳으로: %', v; end if;
end $$;

-- B 가 받은 이어 답하기는 B 가 보낸 결과에 대한 답이므로 is_reply true
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.desk_agent_beat(repeat('b', 32), 'B-PC', '[{"name":"codex-1"}]');
  if jsonb_array_length(v->'inbox') <> 1 or not (v->'inbox'->0->>'is_reply')::boolean then raise exception 'B 의 이어 답하기 판정: %', v; end if;
  perform public.desk_agent_leave(repeat('b', 32));
end $$;

-- A: B 가 빠졌다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$ begin
  if exists (select 1 from jsonb_array_elements(public.desk_agent_directory(repeat('a', 32))) x where x->>'device' = repeat('b', 32)) then
    raise exception 'leave 뒤에도 B 가 목록에 있음';
  end if;
end $$;

-- 학생 · 표 직접 접근 거절
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.student'), 'role', 'authenticated')::text, true);
do $$
declare ok boolean := false;
begin
  begin perform public.desk_agent_beat(repeat('e', 32), 'S', '[]');
  exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception '학생이 beat 함'; end if;
  ok := false;
  begin perform count(*) from public.desk_agent_message;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception '표를 직접 읽음'; end if;
end $$;

-- 10분 지난 대기 메시지는 expired
reset role;
update public.desk_agent_message set status = 'sent', done_at = null, created_at = now() - interval '11 minutes'
 where id = current_setting('ap.r1')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$ begin
  perform public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1"}]');
  if exists (select 1 from jsonb_array_elements(public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1"}]')->'inbox') x
             where x->>'id' = current_setting('ap.r1')) then
    raise exception '10분 지난 것이 inbox 에 남음';
  end if;
end $$;

-- anon 거절
reset role;
set local role anon;
do $$
declare ok boolean := false;
begin
  begin perform public.desk_agent_directory(repeat('a', 32));
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon 이 목록을 봄'; end if;
end $$;
reset role;
select 'desk_agent_peer ok' as result;
rollback;
