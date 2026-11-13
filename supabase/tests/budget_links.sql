-- 예산 관리 P3(연결) 시험 (2026-11-10) — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261110100000_budget_management.sql · 20261110110000_budget_links.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 사업 ↔ 업무 잇기(볼 수 있는 사람만) · 남의 사업에는 못 잇는다 · 품의 연결 → 품의 중 · 구매 완료 → 완료 ·
--      되돌리면 품의 중 · 연결을 끊으면 계획 · 이미 구매 완료인 품목을 이으면 곧바로 완료 · 남의 품의 품목은 못 잇는다
begin;
select set_config('bl.a', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                           where p.role = 'teacher' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
select set_config('bl.a_res', (select ur.resource_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                               where ur.user_id::text = current_setting('bl.a') order by (r.type = 'teacher') desc limit 1), true);
select set_config('bl.b', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                           where p.role = 'teacher' and public.account_link_status(p.id) = 'linked'
                             and p.id::text <> current_setting('bl.a') order by p.id desc limit 1), true);
select set_config('bl.work', (select id::text from public.work order by created_at limit 1), true);

do $$ begin
  if coalesce(current_setting('bl.a', true), '') = '' or coalesce(current_setting('bl.b', true), '') = ''
     or coalesce(current_setting('bl.a_res', true), '') = '' or coalesce(current_setting('bl.work', true), '') = '' then
    raise exception '시험 재료(교사 둘·업무)를 찾지 못함';
  end if;
end $$;

-- 구매 재료(관리자 권한으로): A 가 담당인 신청 페이지 · 품의 차수 둘 · 품목 둘 / B 가 담당인 페이지의 품목 하나
do $$
declare v_page uuid; v_b1 uuid; v_b2 uuid; v_page_b uuid; v_bb uuid; v_b_res uuid; v uuid;
begin
  insert into public.purchase_request_pages (title, target_roles, period_start, period_end, created_by)
  values ('예산 연결 시험', array['teacher'], now() - interval '1 day', now() + interval '1 day', current_setting('bl.a_res')::uuid)
  returning id into v_page;
  insert into public.purchase_order_batches (page_id, title) values (v_page, '1차') returning id into v_b1;
  insert into public.purchase_order_batches (page_id, title, status) values (v_page, '2차', 'purchased') returning id into v_b2;
  perform set_config('bl.batch1', v_b1::text, true);
  insert into public.purchase_order_lines (batch_id, page_id, name, unit_price, qty) values (v_b1, v_page, '재료', 1000, 3) returning id into v;
  perform set_config('bl.ol1', v::text, true);
  insert into public.purchase_order_lines (batch_id, page_id, name, unit_price, qty) values (v_b2, v_page, '이미 산 것', 500, 1) returning id into v;
  perform set_config('bl.ol2', v::text, true);
  select ur.resource_id into v_b_res from public.user_resource ur where ur.user_id::text = current_setting('bl.b') limit 1;
  insert into public.purchase_request_pages (title, target_roles, period_start, period_end, created_by)
  values ('남의 페이지', array['teacher'], now() - interval '1 day', now() + interval '1 day', v_b_res) returning id into v_page_b;
  insert into public.purchase_order_batches (page_id, title) values (v_page_b, '1차') returning id into v_bb;
  insert into public.purchase_order_lines (batch_id, page_id, name) values (v_bb, v_page_b, '남의 품목') returning id into v;
  perform set_config('bl.ol_other', v::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bl.a'), 'role', 'authenticated')::text, true);

-- ① A: 사업 · 줄 · 계획 둘
do $$
declare v_p uuid; v_l uuid; v uuid;
begin
  insert into public.budget_project (fiscal_year, name, kind) values (2026, '연결 시험 사업', 'purpose') returning id into v_p;
  insert into public.budget_line (project_id, name, budget_amount) values (v_p, '재료비', 100000) returning id into v_l;
  perform set_config('bl.p', v_p::text, true);
  perform set_config('bl.l', v_l::text, true);
  insert into public.budget_plan_item (project_id, line_id, title, amount) values (v_p, v_l, '재료 구입', 3000) returning id into v;
  perform set_config('bl.plan1', v::text, true);
  insert into public.budget_plan_item (project_id, line_id, title, amount) values (v_p, v_l, '이미 산 것', 500) returning id into v;
  perform set_config('bl.plan2', v::text, true);
end $$;

-- ② 사업 ↔ 업무 잇기 (A 는 둘 다 볼 수 있다)
do $$
declare v uuid;
begin
  v := public.link_objects('budget_project', current_setting('bl.p')::uuid, 'work', current_setting('bl.work')::uuid, 'related');
  if v is null then raise exception 'FAIL ② 잇지 못함'; end if;
  if not public.can_view_object('budget_project', current_setting('bl.p')::uuid) then raise exception 'FAIL ② can_view_object'; end if;
end $$;

-- ③ 품의 연결 → 품의 중
insert into public.budget_order_link (order_line_id, project_id, line_id, plan_item_id)
values (current_setting('bl.ol1')::uuid, current_setting('bl.p')::uuid, current_setting('bl.l')::uuid, current_setting('bl.plan1')::uuid);
do $$ begin
  if (select status from public.budget_plan_item where id = current_setting('bl.plan1')::uuid) <> 'in_order' then raise exception 'FAIL ③ 품의 중이 아니다'; end if;
end $$;

-- ④ 이미 구매 완료인 차수의 품목을 이으면 곧바로 완료
insert into public.budget_order_link (order_line_id, project_id, line_id, plan_item_id)
values (current_setting('bl.ol2')::uuid, current_setting('bl.p')::uuid, current_setting('bl.l')::uuid, current_setting('bl.plan2')::uuid);
do $$ begin
  if (select status from public.budget_plan_item where id = current_setting('bl.plan2')::uuid) <> 'done' then raise exception 'FAIL ④ 곧바로 완료가 아니다'; end if;
end $$;

-- ⑤ 남의 페이지 품목은 못 잇는다(볼 수 없다)
do $$ begin
  insert into public.budget_order_link (order_line_id, project_id, line_id)
  values (current_setting('bl.ol_other')::uuid, current_setting('bl.p')::uuid, current_setting('bl.l')::uuid);
  raise exception 'FAIL ⑤ 남의 품의 품목이 이어졌다';
exception when insufficient_privilege then null;
end $$;

-- ⑥ 교사 B: 남의 사업은 볼 수 없어 업무와 이을 수 없다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bl.b'), 'role', 'authenticated')::text, true);
do $$ begin
  perform public.link_objects('budget_project', current_setting('bl.p')::uuid, 'work', current_setting('bl.work')::uuid, 'evidence');
  raise exception 'FAIL ⑥ 남의 사업을 이었다';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  if exists (select 1 from public.ontology_link where from_type = 'budget_project' and from_id = current_setting('bl.p')::uuid) then
    raise exception 'FAIL ⑥ 남의 사업 연결이 보인다';
  end if;
end $$;

-- ⑦ 차수 «구매 완료» → 완료, 되돌리면 품의 중 (구매 담당자 권한 = 트리거 DEFINER)
reset role;
update public.purchase_order_batches set status = 'purchased' where id = current_setting('bl.batch1')::uuid;
do $$ begin
  if (select status from public.budget_plan_item where id = current_setting('bl.plan1')::uuid) <> 'done' then raise exception 'FAIL ⑦ 완료가 아니다'; end if;
end $$;
update public.purchase_order_batches set status = 'submitted' where id = current_setting('bl.batch1')::uuid;
do $$ begin
  if (select status from public.budget_plan_item where id = current_setting('bl.plan1')::uuid) <> 'in_order' then raise exception 'FAIL ⑦ 되돌려 품의 중이 아니다'; end if;
end $$;

-- ⑧ 연결을 끊으면 계획
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('bl.a'), 'role', 'authenticated')::text, true);
delete from public.budget_order_link where order_line_id = current_setting('bl.ol1')::uuid;
do $$ begin
  if (select status from public.budget_plan_item where id = current_setting('bl.plan1')::uuid) <> 'planned' then raise exception 'FAIL ⑧ 계획으로 돌아가지 않았다'; end if;
end $$;

select 'budget_links PASS' as result;
rollback;
