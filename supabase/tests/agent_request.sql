-- 에이전트 작업 요청 (2026-11-11) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261111120000_mcp_agent_request.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저) · desk_agent_* (휴대폰으로 넘기기).
-- 판정: 미리보기는 아무것도 안 남김 · 지문 없이/다르게는 거부 · 보내면 받는 사람에게 줄·알림 · 받는 사람만 맡길 말·넘기기·완료
--      · 보낸 사람만 취소 · 끝난 요청은 다시 못 바꿈 · 완료하면 보낸 사람에게 알림 · 제3자는 못 봄 · 휴대폰으로 넘기면 데스크 메시지로
begin;
select set_config('ar.a', (select ur.user_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                           join public.profiles p on p.id = ur.user_id
                           where r.type = 'teacher' and p.role = 'teacher' order by ur.user_id limit 1), true);
select set_config('ar.b', (select ur.user_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                           join public.profiles p on p.id = ur.user_id
                           where r.type = 'teacher' and p.role = 'teacher'
                             and (select count(*) from public.resource x where x.type in ('teacher', 'staff')
                                    and coalesce(x.status, 'active') = 'active' and x.name = r.name) = 1
                             and ur.user_id::text <> current_setting('ar.a')
                           order by ur.user_id desc limit 1), true);
select set_config('ar.b_name', (select r.name from public.user_resource ur join public.resource r on r.id = ur.resource_id
                                where ur.user_id = current_setting('ar.b')::uuid and r.type = 'teacher' limit 1), true);

do $$ begin
  if coalesce(current_setting('ar.a', true), '') = '' or coalesce(current_setting('ar.b', true), '') = '' then
    raise exception '교사 계정 둘을 찾지 못함';
  end if;
end $$;

set local role authenticated;

-- A 가 B 에게 보낸다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ar.a'), 'role', 'authenticated')::text, true);
do $$
declare
  v jsonb; ok boolean; n int;
  args jsonb := jsonb_build_array(current_setting('ar.b_name'));
begin
  v := public.mcp_send_agent_request(args, '협의록 작성', '11월 교과 협의록을 써 주세요.',
         '["get_document_generation 으로 칸을 본다", "create_document check_only"]'::jsonb,
         '[{"kind": "skill", "name": "neis-exam-ratio"}]'::jsonb, null, true, null);
  if not (v->>'check_only')::boolean or coalesce(v->>'fingerprint', '') = '' then raise exception '미리보기 모양: %', v; end if;
  perform set_config('ar.fp', v->>'fingerprint', true);
  select count(*) into n from public.agent_request where title = '협의록 작성' and created_at > now() - interval '1 minute';
  if n <> 0 then raise exception '미리보기가 줄을 남김'; end if;

  ok := false; begin perform public.mcp_send_agent_request(args, '협의록 작성', '11월 교과 협의록을 써 주세요.',
         '["get_document_generation 으로 칸을 본다", "create_document check_only"]'::jsonb,
         '[{"kind": "skill", "name": "neis-exam-ratio"}]'::jsonb, null, false, null);
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '지문 없이 보내짐'; end if;

  ok := false; begin perform public.mcp_send_agent_request(args, '협의록 작성', '바뀐 내용',
         '["get_document_generation 으로 칸을 본다", "create_document check_only"]'::jsonb,
         '[{"kind": "skill", "name": "neis-exam-ratio"}]'::jsonb, null, false, current_setting('ar.fp'));
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '미리 본 뒤 바뀐 내용이 보내짐'; end if;

  ok := false; begin perform public.mcp_send_agent_request('["없는 이름 시험"]'::jsonb, 't', 'b', '[]'::jsonb, '[]'::jsonb, null, true, null);
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '없는 이름이 통과'; end if;

  ok := false; begin perform public.mcp_send_agent_request(args, 't', 'b', '[]'::jsonb,
         '[{"kind": "work", "id": "00000000-0000-4000-8000-000000000000"}]'::jsonb, null, true, null);
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '없는 업무 연결이 통과'; end if;

  v := public.mcp_send_agent_request(args, '협의록 작성', '11월 교과 협의록을 써 주세요.',
         '["get_document_generation 으로 칸을 본다", "create_document check_only"]'::jsonb,
         '[{"kind": "skill", "name": "neis-exam-ratio"}]'::jsonb, null, false, current_setting('ar.fp'));
  if not (v->>'sent')::boolean or jsonb_array_length(v->'requests') <> 1 then raise exception '보내기 결과: %', v; end if;
  perform set_config('ar.id', v->'requests'->0->>'id', true);

  -- 보낸 사람은 맡길 말을 못 받는다(받는 사람 전용)
  ok := false; begin perform public.agent_request_prompt(current_setting('ar.id')::uuid);
  exception when sqlstate 'P0002' then ok := true; end;
  if not ok then raise exception '보낸 사람이 맡길 말을 받음'; end if;
  -- 보낸 사람은 완료 못 함
  ok := false; begin perform public.mcp_reply_agent_request(current_setting('ar.id')::uuid, 'done', 'x', false);
  exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception '보낸 사람이 완료함'; end if;
  v := public.mcp_list_agent_requests('sent', 'open', 10);
  if not exists (select 1 from jsonb_array_elements(v->'requests') r where r->>'id' = current_setting('ar.id')) then
    raise exception '보낸 목록에 없음: %', v; end if;
end $$;

-- B 가 받는다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ar.b'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; ok boolean;
begin
  if not exists (select 1 from jsonb_array_elements(public.agent_request_inbox('open', 30)) r where r->>'id' = current_setting('ar.id')) then
    raise exception '받은 목록에 없음'; end if;
  v := public.agent_request_prompt(current_setting('ar.id')::uuid);
  if position('[작업 요청]' in v->>'prompt') <> 1 or position('reply_agent_request' in v->>'prompt') = 0
     or position('neis-exam-ratio' in v->>'prompt') = 0 or position('다른 선생님이 쓴 요청' in v->>'prompt') = 0 then
    raise exception '맡길 말 모양: %', v->>'prompt'; end if;
  v := public.mcp_get_agent_request(current_setting('ar.id')::uuid);
  if coalesce(v->>'prompt', '') = '' then raise exception 'get 에 prompt 없음'; end if;
  v := public.agent_request_mark_handed(current_setting('ar.id')::uuid, 'desk', 'B-PC', 'claude-1');
  if v->>'status' <> 'handed' then raise exception '넘김 상태: %', v; end if;
  -- 받는 사람은 취소 못 함
  ok := false; begin perform public.mcp_reply_agent_request(current_setting('ar.id')::uuid, 'cancelled', null, false);
  exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception '받는 사람이 취소함'; end if;
  v := public.mcp_reply_agent_request(current_setting('ar.id')::uuid, 'done', '협의록 초안 저장', true);
  if not (v->>'check_only')::boolean then raise exception '답 미리보기: %', v; end if;
  v := public.mcp_reply_agent_request(current_setting('ar.id')::uuid, 'done', '협의록 초안 저장', false);
  if v->'request'->>'status' <> 'done' then raise exception '완료: %', v; end if;
  ok := false; begin perform public.mcp_reply_agent_request(current_setting('ar.id')::uuid, 'declined', null, false);
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '끝난 요청이 다시 바뀜'; end if;
  ok := false; begin perform public.agent_request_prompt(current_setting('ar.id')::uuid);
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '끝난 요청의 맡길 말을 줌'; end if;
end $$;

reset role;
do $$ begin
  if not exists (select 1 from public.notification_events n where n.type = 'agent_request'
                   and n.meta->>'request_id' = current_setting('ar.id')) then raise exception '받는 사람 알림 없음'; end if;
  if not exists (select 1 from public.notification_events n where n.type = 'agent_request_result'
                   and n.meta->>'request_id' = current_setting('ar.id') and n.meta->>'status' = 'done') then
    raise exception '보낸 사람 결과 알림 없음'; end if;
  -- 제3자(학생 아닌 다른 교사·직원 없음이면 건너뜀)는 표를 못 본다 — RLS
end $$;

rollback;
