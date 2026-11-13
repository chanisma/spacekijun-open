-- 예산 관리(budget_*) 시험 (2026-11-10) — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261110100000_budget_management.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 만든 사람 = owner · 남은 못 본다 · 관리자는 읽기만 · 카드 반영(새 줄·갱신·사라진 줄·차수) ·
--      추경 초안 확정(원인행위 미만 거절 · 직전 금액 기록 · 확정 차수 잠금) · 공동 담당 · 마지막 owner ·
--      다른 사업 줄에 계획 거절 · 학생 거절 · 로그인 없음 거절 · 초안이 있을 때 카드 반영 · 사업 삭제 연쇄
begin;
select set_config('bg.a', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                           where p.role = 'teacher' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
select set_config('bg.b', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                           where p.role = 'teacher' and public.account_link_status(p.id) = 'linked'
                             and p.id::text <> current_setting('bg.a') order by p.id desc limit 1), true);
select set_config('bg.admin', (select p.id::text from public.profiles p where p.role = 'admin'
                               and public.account_link_status(p.id) = 'linked'
                               and p.id::text not in (current_setting('bg.a'), current_setting('bg.b')) order by p.id limit 1), true);
select set_config('bg.b_res', (select ur.resource_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                               where ur.user_id::text = current_setting('bg.b') and r.type in ('teacher','staff') limit 1), true);
select set_config('bg.admin_res', (select r.id::text from public.resource r where r.type = 'teacher'
                                   and r.id::text <> current_setting('bg.b_res') order by r.id limit 1), true);
select set_config('bg.student', (select p.id::text from public.profiles p where p.role = 'student' order by p.id limit 1), true);

do $$ begin
  if coalesce(current_setting('bg.a', true), '') = '' or coalesce(current_setting('bg.b', true), '') = ''
     or coalesce(current_setting('bg.admin', true), '') = '' or coalesce(current_setting('bg.student', true), '') = ''
     or coalesce(current_setting('bg.b_res', true), '') = '' or coalesce(current_setting('bg.admin_res', true), '') = '' then
    raise exception '시험 재료(교사 둘·관리자·학생)를 찾지 못함';
  end if;
end $$;

set local role authenticated;

-- ① 로그인 없음
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  perform public.budget_apply_card(gen_random_uuid(), 'x.xls', '{"lines":[{"name":"a","budget":1}]}');
  raise exception 'FAIL ① 로그인 없이 반영됐다';
exception when insufficient_privilege then null;
end $$;

-- ② 교사 A: 사업 만들기 → owner 자동
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bg.a'), 'role', 'authenticated')::text, true);
do $$
declare v uuid;
begin
  insert into public.budget_project (fiscal_year, name, kind) values (2026, '[목적]시험 사업', 'purpose') returning id into v;
  perform set_config('bg.p', v::text, true);
  if not exists (select 1 from public.budget_member m join public.user_resource ur on ur.resource_id = m.resource_id
                 where m.project_id = v and ur.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'FAIL ② owner 가 자동으로 들어가지 않았다';
  end if;
  insert into public.budget_project (fiscal_year, name) values (2026, '다른 사업') returning id into v;
  perform set_config('bg.p2', v::text, true);
end $$;

-- ③ 카드 첫 반영: 새 줄 2 · 본예산(0) 확정 차수
do $$
declare r jsonb; v_rev record;
begin
  r := public.budget_apply_card(current_setting('bg.p')::uuid, '사업관리카드_20261012.xls', jsonb_build_object(
    'card_date', '2026-10-12',
    'lines', jsonb_build_array(
      jsonb_build_object('name', '캠프 운영', 'expense_item', '교육운영비', 'card_key', 'k1', 'budget', 6000000, 'pumui', 0, 'wonin', 0),
      jsonb_build_object('name', '협의회비', 'expense_item', '목적사업업무추진비', 'card_key', 'k2', 'budget', 1500000, 'pumui', 175000, 'wonin', 149200))));
  if (r ->> 'new')::int <> 2 or (r ->> 'budget_changed')::int <> 2 then raise exception 'FAIL ③ 요약 %', r; end if;
  select * into v_rev from public.budget_revision where id = (r ->> 'revision_id')::uuid;
  if v_rev.seq <> 0 or v_rev.status <> 'confirmed' or v_rev.title <> '본예산 (카드)' then raise exception 'FAIL ③ 본예산 차수 %', row_to_json(v_rev); end if;
  if (select sum(budget_amount) from public.budget_line where project_id = current_setting('bg.p')::uuid) <> 7500000 then
    raise exception 'FAIL ③ 예산현액 합';
  end if;
  perform set_config('bg.l1', (select id::text from public.budget_line where project_id = current_setting('bg.p')::uuid and card_key = 'k1'), true);
  perform set_config('bg.l2', (select id::text from public.budget_line where project_id = current_setting('bg.p')::uuid and card_key = 'k2'), true);
end $$;

-- ④ 다시 반영: k1 예산 변경 · k2 빠짐 → 갱신 1 · 사라진 줄 1 · 카드 반영 차수(1)
do $$
declare r jsonb;
begin
  r := public.budget_apply_card(current_setting('bg.p')::uuid, 'card2.xls', jsonb_build_object(
    'lines', jsonb_build_array(
      jsonb_build_object('line_id', current_setting('bg.l1'), 'name', '캠프 운영', 'card_key', 'k1', 'budget', 5000000, 'pumui', 100000, 'wonin', 50000))));
  if (r ->> 'updated')::int <> 1 or (r ->> 'missing')::int <> 1 or (r ->> 'budget_changed')::int <> 1 then raise exception 'FAIL ④ 요약 %', r; end if;
  if not (select missing_from_card from public.budget_line where id = current_setting('bg.l2')::uuid) then raise exception 'FAIL ④ 사라진 줄 표시'; end if;
  if (select seq from public.budget_revision where id = (r ->> 'revision_id')::uuid) <> 1 then raise exception 'FAIL ④ 차수 번호'; end if;
  if (select prev_amount from public.budget_revision_line where revision_id = (r ->> 'revision_id')::uuid) <> 6000000 then raise exception 'FAIL ④ 직전 금액'; end if;
  if (select count(*) from public.budget_card_import where project_id = current_setting('bg.p')::uuid) <> 2 then raise exception 'FAIL ④ 업로드 이력'; end if;
end $$;

-- ⑤ 추경 초안: 원인행위 미만 거절 → 고쳐서 확정 → 잠금
do $$
declare v_rev uuid;
begin
  insert into public.budget_revision (project_id, seq, title) values (current_setting('bg.p')::uuid, 2, '2회 추경') returning id into v_rev;
  perform set_config('bg.rev', v_rev::text, true);
  insert into public.budget_revision_line (revision_id, project_id, line_id, amount)
  values (v_rev, current_setting('bg.p')::uuid, current_setting('bg.l1')::uuid, 40000);   -- 원인행위 50,000 미만
  begin
    perform public.budget_confirm_revision(v_rev);
    raise exception 'FAIL ⑤ 원인행위 미만이 확정됐다';
  exception when check_violation then null;
  end;
  update public.budget_revision_line set amount = 4000000 where revision_id = v_rev;
  perform public.budget_confirm_revision(v_rev);
  if (select budget_amount from public.budget_line where id = current_setting('bg.l1')::uuid) <> 4000000 then raise exception 'FAIL ⑤ 예산현액 반영'; end if;
  if (select prev_amount from public.budget_revision_line where revision_id = v_rev) <> 5000000 then raise exception 'FAIL ⑤ 직전 금액'; end if;
  begin
    update public.budget_revision_line set amount = 1 where revision_id = v_rev;
    raise exception 'FAIL ⑤ 확정 차수가 고쳐졌다';
  exception when check_violation then null;
  end;
  begin
    update public.budget_revision set status = 'draft' where id = v_rev;
    raise exception 'FAIL ⑤ 확정이 되돌려졌다';
  exception when check_violation then null;
  end;
end $$;

-- ⑥ 초안이 있을 때 카드 반영 → 카드 차수가 초안 앞에 선다
do $$
declare v_draft uuid; r jsonb;
begin
  insert into public.budget_revision (project_id, seq, title) values (current_setting('bg.p')::uuid, 3, '3회 추경 (초안)') returning id into v_draft;
  r := public.budget_apply_card(current_setting('bg.p')::uuid, 'card3.xls', jsonb_build_object(
    'lines', jsonb_build_array(
      jsonb_build_object('line_id', current_setting('bg.l1'), 'name', '캠프 운영', 'budget', 4500000, 'pumui', 100000, 'wonin', 50000))));
  if (select seq from public.budget_revision where id = (r ->> 'revision_id')::uuid) <> 3
     or (select seq from public.budget_revision where id = v_draft) <> 4
     or (select status from public.budget_revision where id = v_draft) <> 'draft' then
    raise exception 'FAIL ⑥ 차수 순서 % / %', (select seq from public.budget_revision where id = (r ->> 'revision_id')::uuid),
      (select seq from public.budget_revision where id = v_draft);
  end if;
end $$;

-- ⑦ 다른 사업의 줄에 계획 → FK 거절
do $$ begin
  insert into public.budget_plan_item (project_id, line_id, title, amount)
  values (current_setting('bg.p2')::uuid, current_setting('bg.l1')::uuid, '엉뚱한 계획', 1000);
  raise exception 'FAIL ⑦ 다른 사업 줄에 계획이 붙었다';
exception when foreign_key_violation then null;
end $$;
insert into public.budget_plan_item (project_id, line_id, title, amount, planned_month)
values (current_setting('bg.p')::uuid, current_setting('bg.l1')::uuid, '겨울 캠프 버스', 1200000, '2026-12-01');

-- ⑧ 교사 B: 못 본다 · 못 쓴다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bg.b'), 'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  if exists (select 1 from public.budget_project where id = current_setting('bg.p')::uuid) then raise exception 'FAIL ⑧ 남의 사업이 보인다'; end if;
  if exists (select 1 from public.budget_plan_item where project_id = current_setting('bg.p')::uuid) then raise exception 'FAIL ⑧ 남의 계획이 보인다'; end if;
  update public.budget_line set note = 'x' where project_id = current_setting('bg.p')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL ⑧ 남의 줄을 고쳤다'; end if;
  begin
    perform public.budget_apply_card(current_setting('bg.p')::uuid, 'x', '{"lines":[{"name":"a","budget":1}]}');
    raise exception 'FAIL ⑧ 남의 사업에 카드를 반영했다';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ⑨ 관리자: 읽기만
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bg.admin'), 'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  if not exists (select 1 from public.budget_project where id = current_setting('bg.p')::uuid) then raise exception 'FAIL ⑨ 관리자가 못 본다'; end if;
  if (select count(*) from public.budget_line where project_id = current_setting('bg.p')::uuid) <> 2 then raise exception 'FAIL ⑨ 관리자 줄 읽기'; end if;
  update public.budget_line set note = 'x' where project_id = current_setting('bg.p')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL ⑨ 관리자가 고쳤다'; end if;
  begin
    insert into public.budget_plan_item (project_id, line_id, title, amount)
    values (current_setting('bg.p')::uuid, current_setting('bg.l1')::uuid, '관리자 계획', 1);
    raise exception 'FAIL ⑨ 관리자가 계획을 썼다';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ⑩ A 가 B 를 공동 담당으로 → B 는 보고 쓰지만 담당자를 더할 수 없다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bg.a'), 'role', 'authenticated')::text, true);
insert into public.budget_member (project_id, resource_id, role) values (current_setting('bg.p')::uuid, current_setting('bg.b_res')::uuid, 'editor');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bg.b'), 'role', 'authenticated')::text, true);
do $$ begin
  if not exists (select 1 from public.budget_project where id = current_setting('bg.p')::uuid) then raise exception 'FAIL ⑩ 공동 담당이 못 본다'; end if;
  insert into public.budget_plan_item (project_id, line_id, title, amount)
  values (current_setting('bg.p')::uuid, current_setting('bg.l1')::uuid, '공동 담당 계획', 300000);
  begin
    insert into public.budget_member (project_id, resource_id, role) values (current_setting('bg.p')::uuid, current_setting('bg.admin_res')::uuid, 'editor');
    raise exception 'FAIL ⑩ editor 가 담당자를 더했다';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.budget_project where id = current_setting('bg.p')::uuid;
    if exists (select 1 from public.budget_project where id = current_setting('bg.p')::uuid) is false then
      raise exception 'FAIL ⑩ editor 가 사업을 지웠다';
    end if;
  end;
end $$;

-- ⑪ 마지막 owner 는 빠질 수 없다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bg.a'), 'role', 'authenticated')::text, true);
do $$ begin
  delete from public.budget_member where project_id = current_setting('bg.p')::uuid and role = 'owner';
  raise exception 'FAIL ⑪ 마지막 owner 가 빠졌다';
exception when check_violation then null;
end $$;

-- ⑫ 학생: 사업을 만들 수 없다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bg.student'), 'role', 'authenticated')::text, true);
do $$ begin
  insert into public.budget_project (fiscal_year, name) values (2026, '학생 사업');
  raise exception 'FAIL ⑫ 학생이 사업을 만들었다';
exception when insufficient_privilege then null;
end $$;

-- ⑬ owner 가 사업을 지우면 차수(확정 포함)·줄·계획이 함께 지워진다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bg.a'), 'role', 'authenticated')::text, true);
do $$ begin
  delete from public.budget_project where id = current_setting('bg.p')::uuid;
  if exists (select 1 from public.budget_project where id = current_setting('bg.p')::uuid) then raise exception 'FAIL ⑬ 사업이 남았다'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.budget_line where project_id = current_setting('bg.p')::uuid)
     or exists (select 1 from public.budget_revision where project_id = current_setting('bg.p')::uuid) then
    raise exception 'FAIL ⑬ 연쇄 삭제가 남겼다';
  end if;
end $$;

select 'budget_management PASS' as result;
rollback;
