-- 공문 판단함 1단계 (2026-10-30) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261030170000 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 실행기 키 없이는 못 올린다 · 올리면 원장·판정이 생기고 같은 판정은 다시 안 들어간다 ·
--      다음 회차가 본문 없이 올려도 본문이 지워지지 않는다 · 지식 묶음에 결정·이미 판정한 문서가 실린다 ·
--      관리자만 읽고 결정을 남길 수 있다(교사는 0행·거부)
begin;

insert into public.automation_runner(key_hash, name) values (repeat('e', 64), '시험 실행기');

do $$
declare v jsonb; ok boolean := false;
begin
  begin
    perform public.official_doc_ingest(repeat('0', 64), '[]'::jsonb);
  exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception '모르는 키로 올려짐'; end if;

  v := public.official_doc_ingest(repeat('e', 64), jsonb_build_array(
    jsonb_build_object('doc_no', '시험학교-1', 'title', '[긴급] 자료 제출 요청', 'sender', '전북특별자치도교육청 미래교육과',
                       'approver_name', '홍길동', 'registered_at', '2026-10-30T09:00:00+09:00',
                       'body_status', 'stored', 'body', '제출 기한: 2026. 11. 4.',
                       'triage', jsonb_build_object('engine', 'llm', 'model', 'haiku', 'prompt_version', 't1',
                         'result', jsonb_build_object('nature', '제출', 'needs_action', true, 'deadline', '2026-11-04',
                                                      'confidence', 0.7, 'question', '누가 맡나요?'))),
    jsonb_build_object('doc_no', '시험학교-2', 'title', '학생 개인 사안 안내', 'body_status', 'private', 'body', '가려야 할 본문')));
  if (v->>'inserted')::int <> 2 or (v->>'triaged')::int <> 1 then raise exception '첫 업로드: %', v; end if;

  -- 같은 판정 다시 → 판정 0 · 본문 없이 다시 → 본문 그대로
  v := public.official_doc_ingest(repeat('e', 64), jsonb_build_array(
    jsonb_build_object('doc_no', '시험학교-1', 'title', '[긴급] 자료 제출 요청', 'process_status', '종료', 'body_status', 'none',
                       'triage', jsonb_build_object('engine', 'llm', 'model', 'haiku', 'prompt_version', 't1',
                         'result', jsonb_build_object('nature', '제출', 'needs_action', true, 'deadline', '2026-11-04',
                                                      'confidence', 0.7, 'question', '누가 맡나요?')))));
  if (v->>'updated')::int <> 1 or (v->>'triaged')::int <> 0 then raise exception '두 번째 업로드: %', v; end if;
  if (select body from public.official_doc where doc_no = '시험학교-1') is distinct from '제출 기한: 2026. 11. 4.' then
    raise exception '본문이 지워짐';
  end if;
  if (select body from public.official_doc where doc_no = '시험학교-2') is not null then
    raise exception '개인정보 의심 본문이 저장됨';
  end if;
  if (select process_status from public.official_doc where doc_no = '시험학교-1') <> '종료' then
    raise exception '처리상태 갱신 안 됨';
  end if;
  if (select nature || deadline::text from public.official_doc_triage t join public.official_doc o on o.id = t.doc_id
       where o.doc_no = '시험학교-1') <> '제출2026-11-04' then
    raise exception '판정 요약 칸';
  end if;
end $$;

-- 관리자: 읽기·결정 / 교사: 0행·결정 거부
select set_config('od.admin', (select id::text from public.profiles where role = 'admin' order by id limit 1), true);
select set_config('od.teacher', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                                  where p.role = 'teacher' order by p.id limit 1), true);
set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.admin'), 'role', 'authenticated')::text, true);
do $$
begin
  if (select count(*) from public.official_doc where doc_no like '시험학교-%') <> 2 then raise exception '관리자가 원장을 못 읽음'; end if;
  insert into public.official_doc_decision(doc_id, decision, nature, assignee_names, reason)
  select id, 'info', '지침', '{홍길동}', '시험 결정' from public.official_doc where doc_no = '시험학교-1';
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.teacher'), 'role', 'authenticated')::text, true);
do $$
declare ok boolean := false;
begin
  if (select count(*) from public.official_doc) <> 0 then raise exception '교사가 원장을 읽음'; end if;
  if (select count(*) from public.official_doc_decision) <> 0 then raise exception '교사가 결정을 읽음'; end if;
  begin
    insert into public.official_doc_decision(doc_id, decision) values (gen_random_uuid(), 'ignore');
  exception when others then ok := true; end;
  if not ok then raise exception '교사가 결정을 남김'; end if;
end $$;

reset role;
do $$
declare v jsonb;
begin
  v := public.official_doc_knowledge(repeat('e', 64), 2026);
  if not (v->'decisions' @> '[{"title": "[긴급] 자료 제출 요청", "decision": "info"}]'::jsonb) then
    raise exception '지식 묶음에 결정 없음: %', v->'decisions';
  end if;
  if not (v->'known' ? '시험학교-1') then raise exception '이미 판정한 문서 없음'; end if;
  if jsonb_typeof(v->'candidates') <> 'array' or jsonb_typeof(v->'seats') <> 'array' then raise exception '지식 묶음 모양'; end if;
  raise notice '지식 묶음: 후보 % · 업무 % · 자리 % · 규칙 %',
    jsonb_array_length(v->'candidates'), jsonb_array_length(v->'works'), jsonb_array_length(v->'seats'), jsonb_array_length(v->'rules');
end $$;

select 'official_doc_triage 시험 통과' as result;
rollback;
