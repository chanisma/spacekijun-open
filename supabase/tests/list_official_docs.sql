-- 공문 판단함 목록 RPC (2026-11-04) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261104140000 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 기간(한국 날짜, 양끝 포함) 안 공문만 최신순 · 본문을 싣지 않는다 · 판정·결정은 최신 1건 ·
--      기간 밖 원 공문·비슷한 공문은 related 에 결정만 · total = 기간 안 전체 수(limit 무관) ·
--      pending_outside 에 기간 밖 판단 대기가 들어간다 · 교사는 빈 목록 · 로그인 없으면 거부
begin;

-- 시험 공문(2099년 — 운영 공문과 기간이 겹치지 않는다). 2099-01-31 23:30 KST = 기간 끝날 안쪽
insert into public.official_doc(doc_no, registered_at, title, body, body_status, meta) values
  ('시험목록-원',   '2098-12-01T09:00:00+09:00', '원 공문',     '원 본문', 'stored', '{}'),
  ('시험목록-비슷', '2098-11-01T09:00:00+09:00', '비슷한 공문', null,      'none',   '{}'),
  ('시험목록-1',    '2099-01-02T09:00:00+09:00', '첫 공문',     '본문1',   'stored',
     jsonb_build_object('similar', jsonb_build_array(jsonb_build_object('doc_no', '시험목록-비슷', 'title', '비슷한 공문')))),
  ('시험목록-2',    '2099-01-31T23:30:00+09:00', '끝날 공문',   '본문2',   'stored', '{}'),
  ('시험목록-밖',   '2099-02-01T00:10:00+09:00', '다음 달 공문', '본문3',  'stored', '{}');

insert into public.official_doc_triage(doc_id, engine, nature, result, result_hash, created_at)
select id, 'llm', '지침', '{"summary": "옛 판정"}'::jsonb, 'h-old', '2099-01-02T10:00:00+09:00'::timestamptz from public.official_doc where doc_no = '시험목록-1'
union all
select id, 'llm', '지침',
       jsonb_build_object('summary', '새 판정', 'parent', jsonb_build_array(jsonb_build_object('doc_no', '시험목록-원', 'title', '원 공문'))),
       'h-new', '2099-01-02T11:00:00+09:00'::timestamptz from public.official_doc where doc_no = '시험목록-1';

insert into public.official_doc_decision(doc_id, decision, reason, decided_by, created_at)
select id, 'ignore', '옛 결정', (select id from auth.users limit 1), '2099-01-03T09:00:00+09:00'::timestamptz from public.official_doc where doc_no = '시험목록-2'
union all
select id, 'info',   '새 결정', (select id from auth.users limit 1), '2099-01-04T09:00:00+09:00'::timestamptz from public.official_doc where doc_no = '시험목록-2'
union all
select id, 'link_work', '원 결정', (select id from auth.users limit 1), '2098-12-02T09:00:00+09:00'::timestamptz from public.official_doc where doc_no = '시험목록-원';

select set_config('od.admin', (select id::text from public.profiles where role = 'admin' order by id limit 1), true);
select set_config('od.teacher', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                                  where p.role = 'teacher' order by p.id limit 1), true);
set local role authenticated;

-- 로그인 없음 → 거부
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
do $$
declare ok boolean := false;
begin
  begin perform public.list_official_docs('2099-01-01', '2099-01-31');
  exception when sqlstate '28000' then ok := true; end;
  if not ok then raise exception '로그인 없이 목록이 나옴'; end if;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.admin'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; d1 jsonb; d2 jsonb;
begin
  v := public.list_official_docs('2099-01-01', '2099-01-31');
  if jsonb_array_length(v->'docs') <> 2 then raise exception '기간 안 2건이어야: %', v->'docs'; end if;
  if (v->>'total')::int <> 2 then raise exception 'total: %', v->>'total'; end if;
  if v->'docs'->0->>'doc_no' <> '시험목록-2' then raise exception '최신순이 아님(끝날 23:30 이 기간 안이어야)'; end if;
  if (v->'docs'->0) ? 'body' then raise exception '목록에 본문이 실림'; end if;

  select x into d1 from jsonb_array_elements(v->'docs') x where x->>'doc_no' = '시험목록-1';
  select x into d2 from jsonb_array_elements(v->'docs') x where x->>'doc_no' = '시험목록-2';
  if d1->'triage'->'result'->>'summary' <> '새 판정' then raise exception '최신 판정이 아님: %', d1->'triage'; end if;
  if d1->'decision' <> 'null'::jsonb then raise exception '결정 없는 공문에 결정'; end if;
  if d2->'decision'->>'reason' <> '새 결정' then raise exception '최신 결정이 아님: %', d2->'decision'; end if;

  if not (v->'related' @> '[{"doc_no": "시험목록-원", "decision": {"decision": "link_work"}}]'::jsonb) then
    raise exception '기간 밖 원 공문이 related 에 없음: %', v->'related';
  end if;
  if not (v->'related' @> '[{"doc_no": "시험목록-비슷"}]'::jsonb) then raise exception '비슷한 공문이 related 에 없음'; end if;
  if v->'related' @> '[{"doc_no": "시험목록-밖"}]'::jsonb then raise exception '관계없는 기간 밖 공문이 related 에'; end if;
  if (v->>'pending_outside')::int < 2 then raise exception '기간 밖 판단 대기(비슷·밖) 누락: %', v->>'pending_outside'; end if;

  -- limit 에 잘려도 total 은 기간 전체
  v := public.list_official_docs('2099-01-01', '2099-01-31', 1);
  if jsonb_array_length(v->'docs') <> 1 or (v->>'total')::int <> 2 then raise exception 'limit/total: %', v; end if;

  -- 기간 없음 = 전체
  v := public.list_official_docs(null, null, 2000);
  if not (v->'docs' @> '[{"doc_no": "시험목록-밖"}]'::jsonb) then raise exception '전체 기간에 빠짐'; end if;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.teacher'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.list_official_docs(null, null);
  if jsonb_array_length(v->'docs') <> 0 or (v->>'total')::int <> 0 then raise exception '교사가 공문을 읽음'; end if;
end $$;

reset role;
select 'list_official_docs 시험 통과' as result;
rollback;
