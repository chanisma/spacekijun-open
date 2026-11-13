-- 공문 판단함 3단계(2026-10-30) 시험 — 끝에서 rollback.
-- 전제: 20261030170000 · 20261030190000 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 관리자 에이전트는 목록·한 건·결정(+규칙)을 쓴다 · 교사 에이전트는 허용이 없어 거부 ·
--      결정이 남으면 맞는 규칙의 hits/overturned 가 오른다(그 결정에서 태어난 규칙은 세지 않는다)
begin;
insert into public.automation_runner(key_hash, name) values (repeat('f', 64), '시험 실행기');
select public.official_doc_ingest(repeat('f', 64), jsonb_build_array(
  jsonb_build_object('doc_no', '시험학교-101', 'title', '[긴급] 수의계약 현황 제출', 'sender', '전북특별자치도교육청 재무과',
                     'registered_at', '2026-10-30T09:00:00+09:00', 'body_status', 'stored', 'body', '11. 2.까지',
                     'triage', jsonb_build_object('engine', 'llm', 'model', 'haiku', 'result',
                       jsonb_build_object('nature', '제출', 'needs_action', true, 'deadline', '2026-11-02', 'summary', '제출'))),
  jsonb_build_object('doc_no', '시험학교-102', 'title', '수의계약 집행 실적 제출 요청', 'sender', '전북특별자치도교육청 재무과',
                     'registered_at', '2026-10-30T10:00:00+09:00', 'body_status', 'none')));

select set_config('od.admin', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                                where p.role = 'admin' order by p.id limit 1), true);
select set_config('od.teacher', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                                  where p.role = 'teacher'
                                    and not exists (select 1 from public.mcp_tool_grant g where g.resource_id = ur.resource_id and g.tool = 'official.doc')
                                  order by p.id limit 1), true);
set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.teacher'), 'role', 'authenticated', 'client_id', 'test-client')::text, true);
do $$
declare ok boolean := false;
begin
  begin perform public.mcp_list_official_docs('all', 10); exception when others then ok := true; end;
  if not ok then raise exception '교사 에이전트가 공문 목록을 읽음'; end if;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.admin'), 'role', 'authenticated', 'client_id', 'test-client')::text, true);
do $$
declare v jsonb; r jsonb; ok boolean := false;
begin
  v := public.mcp_list_official_docs('action', 100);
  if not (v @> '[{"doc_no": "시험학교-101"}]'::jsonb) then raise exception '처리 필요 목록에 없음'; end if;
  v := public.mcp_get_official_doc('시험학교-101');
  if v->>'body' <> '11. 2.까지' or jsonb_array_length(v->'triage') <> 1 then raise exception '한 건: %', v; end if;
  begin perform public.mcp_decide_official_doc('시험학교-101', 'link_work'); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'work_id 없는 link_work 가 남음'; end if;

  -- 첫 결정 + 규칙(발신 재무과 + 수의계약 → info)
  r := public.mcp_decide_official_doc('시험학교-101', 'info', '계약 자료는 행정실 몫', '지침', null, null, '{}',
                                      '{"sender": "재무과", "title_all": ["수의계약"]}');
  if r->>'rule_id' is null then raise exception '규칙이 안 생김'; end if;
  if (select hits + overturned from public.doc_rule where id = (r->>'rule_id')::uuid) <> 0 then
    raise exception '자기 결정을 적중으로 셈';
  end if;
  -- 같은 규칙에 맞는 다른 공문: 같은 결정 → hits 1, 그 뒤 다른 결정 → overturned 1
  perform public.mcp_decide_official_doc('시험학교-102', 'info');
  perform public.mcp_decide_official_doc('시험학교-102', 'ignore');
  if (select hits::text || '/' || overturned::text from public.doc_rule where id = (r->>'rule_id')::uuid) <> '1/1' then
    raise exception '적중 셈: %', (select hits::text || '/' || overturned::text from public.doc_rule where id = (r->>'rule_id')::uuid);
  end if;
  v := public.mcp_get_official_doc('시험학교-102');
  if jsonb_array_length(v->'rules') <> 1 or jsonb_array_length(v->'decisions') <> 2 then raise exception '한 건의 규칙·결정: %', v; end if;
  if (select via from public.official_doc_decision d join public.official_doc o on o.id = d.doc_id where o.doc_no = '시험학교-101') <> 'mcp' then
    raise exception 'via';
  end if;
end $$;

select 'official_doc_mcp 시험 통과' as result;
rollback;
