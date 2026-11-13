-- 공문 «담당 본인» 읽기·결정 시험 (2026-11-08) — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261108110000_official_doc_owner_read.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 담당 교사 = 자기 공문만 보고(판정·결정 포함) 자기 공문에만 결정을 남긴다 · 다른 교사·학생 = 못 본다
--      · 관리자 = 그대로 전부 · 규칙(doc_rule)은 여전히 관리자만 · list_official_docs 도 같은 경계
begin;
-- 담당 교사 T: 공문 결재권자 이름 = 명단에 연결된 교사(관리자 아님) 이름
select set_config('od.t', (
  select ur.user_id::text from public.official_doc d
  join public.resource r on r.name = d.approver_name and r.type in ('teacher', 'staff')
  join public.user_resource ur on ur.resource_id = r.id
  join public.profiles p on p.id = ur.user_id
  where p.role = 'teacher' and public.account_link_status(p.id) = 'linked'
  group by ur.user_id order by count(*) desc limit 1), true);
select set_config('od.tname', (select r.name from public.user_resource ur join public.resource r on r.id = ur.resource_id
                               where ur.user_id = current_setting('od.t')::uuid and r.type in ('teacher', 'staff') limit 1), true);
select set_config('od.mine', (select id::text from public.official_doc where approver_name = current_setting('od.tname') order by registered_at desc limit 1), true);
select set_config('od.other', (select id::text from public.official_doc where approver_name is distinct from current_setting('od.tname') order by registered_at desc limit 1), true);
select set_config('od.u', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id join public.resource r on r.id = ur.resource_id
                           where p.role = 'teacher' and public.account_link_status(p.id) = 'linked' and r.name <> current_setting('od.tname')
                             and not exists (select 1 from public.official_doc d where d.approver_name = r.name)
                           order by p.id limit 1), true);
select set_config('od.admin', (select p.id::text from public.profiles p where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
select set_config('od.student', (select p.id::text from public.profiles p where p.role = 'student' order by p.id limit 1), true);
select set_config('od.total', (select count(*)::text from public.official_doc), true);
select set_config('od.tcount', (select count(*)::text from public.official_doc where approver_name = current_setting('od.tname')), true);

do $$ begin
  if coalesce(current_setting('od.t', true), '') = '' or coalesce(current_setting('od.mine', true), '') = ''
     or coalesce(current_setting('od.other', true), '') = '' or coalesce(current_setting('od.u', true), '') = ''
     or coalesce(current_setting('od.admin', true), '') = '' or coalesce(current_setting('od.student', true), '') = '' then
    raise exception '시험 재료(담당 교사·공문 없는 교사·관리자·학생·공문 둘)를 찾지 못함';
  end if;
end $$;

set local role authenticated;

-- ① 담당 교사: 자기 공문만
select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.t'), 'role', 'authenticated')::text, true);
do $$ begin
  if (select count(*) from public.official_doc)::text <> current_setting('od.tcount') then
    raise exception 'FAIL ① 담당 교사가 보는 공문 수 % ≠ 자기 공문 %', (select count(*) from public.official_doc), current_setting('od.tcount');
  end if;
  if exists (select 1 from public.official_doc where approver_name is distinct from current_setting('od.tname')) then raise exception 'FAIL ① 남의 공문이 보인다'; end if;
  if not exists (select 1 from public.official_doc where id = current_setting('od.mine')::uuid) then raise exception 'FAIL ① 자기 공문이 안 보인다'; end if;
  if exists (select 1 from public.official_doc_triage where doc_id = current_setting('od.other')::uuid) then raise exception 'FAIL ① 남의 공문 판정이 보인다'; end if;
  if exists (select 1 from public.doc_rule) then raise exception 'FAIL ① 규칙이 보인다(관리자만이어야)'; end if;
  -- 목록 RPC 도 같은 경계
  if exists (select 1 from jsonb_array_elements((public.list_official_docs(null, null, 1000))::jsonb->'docs') x
             where x->>'approver_name' is distinct from current_setting('od.tname')) then
    raise exception 'FAIL ① list_official_docs 에 남의 공문';
  end if;
end $$;

-- ② 담당 교사: 자기 공문에 결정 · 남의 공문·남의 이름으로는 못 남긴다
do $$ begin
  insert into public.official_doc_decision (doc_id, decision, reason) values (current_setting('od.mine')::uuid, 'info', '시험');
  if not exists (select 1 from public.official_doc_decision where doc_id = current_setting('od.mine')::uuid and reason = '시험') then
    raise exception 'FAIL ② 자기 결정이 안 보인다';
  end if;
end $$;
do $$ begin
  insert into public.official_doc_decision (doc_id, decision) values (current_setting('od.other')::uuid, 'info');
  raise exception 'FAIL ② 남의 공문에 결정을 남겼다';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.official_doc_decision (doc_id, decision, decided_by) values (current_setting('od.mine')::uuid, 'info', current_setting('od.u')::uuid);
  raise exception 'FAIL ② 남의 이름으로 결정을 남겼다';
exception when insufficient_privilege then null;
end $$;

-- ③ 공문이 없는 다른 교사: 아무것도 못 본다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.u'), 'role', 'authenticated')::text, true);
do $$ begin
  if exists (select 1 from public.official_doc) then raise exception 'FAIL ③ 다른 교사에게 공문이 보인다'; end if;
  if exists (select 1 from public.official_doc_decision) then raise exception 'FAIL ③ 다른 교사에게 결정이 보인다'; end if;
  if jsonb_array_length(coalesce((public.list_official_docs(null, null, 1000))::jsonb->'docs', '[]'::jsonb)) <> 0 then raise exception 'FAIL ③ 목록 RPC 가 공문을 준다'; end if;
end $$;

-- ④ 학생: 못 본다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.student'), 'role', 'authenticated')::text, true);
do $$ begin
  if exists (select 1 from public.official_doc) or exists (select 1 from public.official_doc_triage) then raise exception 'FAIL ④ 학생에게 보인다'; end if;
end $$;

-- ⑤ 관리자: 그대로 전부(교사가 남긴 결정도 보인다)
select set_config('request.jwt.claims', json_build_object('sub', current_setting('od.admin'), 'role', 'authenticated')::text, true);
do $$ begin
  if (select count(*) from public.official_doc)::text <> current_setting('od.total') then raise exception 'FAIL ⑤ 관리자가 전부 못 본다'; end if;
  if not exists (select 1 from public.official_doc_decision where reason = '시험') then raise exception 'FAIL ⑤ 관리자에게 교사의 결정이 안 보인다'; end if;
end $$;

reset role;
select 'official_doc_owner PASS' as result;
rollback;
