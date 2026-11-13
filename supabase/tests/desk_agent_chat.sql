-- 휴대폰 «에이전트» 탭 채팅방 (2026-11-10) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261027120000 · 20261029130000 · 20261030100000 · 20261107090000 · 20261110130000_desk_agent_chat.sql 적용
--       (드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: beat 가 에이전트의 thread 를 남김(모양이 틀리면 버림) · 방을 주고 보내면 그 방이 열려 있을 때만 · 끝난 방(같은 이름 새 칸)은 거절
--      · 방 없이(옛 화면) 보내면 예전처럼 이름으로 · inbox 와 휴대폰 목록에 thread · 예약 결과도 방에(옛 8인자 부르기도 됨)
--      · 잘못된 방 id 거절 · 남의 목록에 안 보임
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

do $$ begin
  if coalesce(current_setting('ap.a', true), '') = '' or coalesce(current_setting('ap.b', true), '') = '' then
    raise exception '교사 계정 둘을 찾지 못함';
  end if;
end $$;

set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare
  v jsonb; row jsonb; ok boolean;
  pc text := repeat('a', 32); phone text := repeat('c', 32);
  room1 text := '11111111-1111-4111-8111-111111111111';
  room2 text := '22222222-2222-4222-8222-222222222222';
begin
  -- 방 1 이 열려 있다 (모양이 틀린 thread 는 버린다)
  perform public.desk_agent_beat(pc, 'A-PC', jsonb_build_array(
    jsonb_build_object('name', 'claude-1', 'title', '', 'tool', 'claude', 'status', 'idle', 'thread', room1),
    jsonb_build_object('name', 'codex-1', 'title', '', 'tool', 'codex', 'status', 'idle', 'thread', 'x & calc')));
  v := public.desk_agent_phone_overview();
  row := (select a from jsonb_array_elements((select p->'agents' from jsonb_array_elements(v->'pcs') p where p->>'device' = pc)) a
          where a->>'name' = 'claude-1');
  if row->>'thread' is distinct from room1 then raise exception 'beat 가 방을 남기지 않음: %', row; end if;
  row := (select a from jsonb_array_elements((select p->'agents' from jsonb_array_elements(v->'pcs') p where p->>'device' = pc)) a
          where a->>'name' = 'codex-1');
  if row->>'thread' is not null then raise exception '틀린 모양의 방이 남음: %', row; end if;

  -- 방 1 로 보낸다 → 목록·inbox 에 thread
  v := public.desk_agent_phone_send(phone, pc, 'claude-1', '첫 방 메시지', room1);
  perform set_config('ap.m1', v->>'id', true);
  row := (select m from jsonb_array_elements(public.desk_agent_phone_overview()->'messages') m where m->>'id' = v->>'id');
  if row->>'thread' is distinct from room1 then raise exception '목록에 방이 없음: %', row; end if;
  v := public.desk_agent_beat(pc, 'A-PC', jsonb_build_array(
    jsonb_build_object('name', 'claude-1', 'title', '', 'tool', 'claude', 'status', 'idle', 'thread', room1)));
  row := (select m from jsonb_array_elements(v->'inbox') m where m->>'id' = current_setting('ap.m1'));
  if row->>'thread' is distinct from room1 then raise exception 'inbox 에 방이 없음: %', v->'inbox'; end if;

  -- 칸을 닫고 같은 이름으로 새로 열었다(방 2) → 방 1 로는 보내지 못한다
  perform public.desk_agent_beat(pc, 'A-PC', jsonb_build_array(
    jsonb_build_object('name', 'claude-1', 'title', '', 'tool', 'claude', 'status', 'idle', 'thread', room2)));
  ok := false; begin perform public.desk_agent_phone_send(phone, pc, 'claude-1', '끝난 방', room1);
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '끝난 방으로 보내짐'; end if;
  v := public.desk_agent_phone_send(phone, pc, 'claude-1', '새 방 메시지', room2);
  if v->>'thread' is distinct from room2 then raise exception '새 방 보내기 답이 이상함: %', v; end if;

  -- 방 없이(옛 휴대폰 화면) — 이름으로 예전처럼
  v := public.desk_agent_phone_send(phone, pc, 'claude-1', '옛 화면');
  row := (select m from jsonb_array_elements(public.desk_agent_phone_overview()->'messages') m where m->>'id' = v->>'id');
  if row->>'thread' is not null or row->>'status' <> 'sent' then raise exception '방 없는 보내기가 이상함: %', row; end if;

  -- 잘못된 방 id
  ok := false; begin perform public.desk_agent_phone_send(phone, pc, 'claude-1', 'x', 'not-a-room');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '잘못된 방 id 가 통과'; end if;

  -- 예약 결과 — 방에 붙는다. 옛 데스크(8인자)도 된다
  v := public.desk_agent_cron_post(pc, 'A-PC', 'claude-1', '아침 공문', '정리해 줘', '2건', 'done', false, room2);
  row := (select m from jsonb_array_elements(public.desk_agent_phone_overview()->'messages') m where m->>'id' = v->>'id');
  if row->>'thread' is distinct from room2 or row->>'kind' <> 'cron' then raise exception '예약이 방에 없음: %', row; end if;
  v := public.desk_agent_cron_post(pc, 'A-PC', 'claude-1', '저녁', '점검', '끝', 'done', false);
  row := (select m from jsonb_array_elements(public.desk_agent_phone_overview()->'messages') m where m->>'id' = v->>'id');
  if row is null or row->>'thread' is not null then raise exception '옛 예약 올리기가 이상함: %', row; end if;
  ok := false; begin perform public.desk_agent_cron_post(pc, 'A-PC', 'claude-1', 't', 'p', 'r', 'done', false, 'bad');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '예약의 잘못된 방 id 가 통과'; end if;
end $$;

-- B 의 목록에는 A 의 방 메시지가 보이지 않는다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from jsonb_array_elements(public.desk_agent_phone_overview()->'messages') m
             where m->>'id' = current_setting('ap.m1')) then
    raise exception '남의 대화가 보임';
  end if;
end $$;

reset role;
select 'desk_agent_chat PASS' as result;
rollback;
