-- 동아리 P3(예산·구매) 시험 (2026-11-11) — 끝에서 rollback.
begin;
select set_config('cf.y', (select y.id::text from public.club_year y join public.club_advisor a on a.club_year_id = y.id
  join public.user_resource ur on ur.resource_id = a.teacher_resource_id join public.profiles p on p.id = ur.user_id and p.role = 'teacher'
  where y.status = 'active' and exists (select 1 from public.club_member m join public.profiles sp on split_part(sp.email, '@', 1) = m.student_code
                                         where m.club_year_id = y.id and m.status = 'confirmed' and sp.role = 'student')
  order by y.name limit 1), true);
select set_config('cf.adv', (select ur.user_id::text from public.club_advisor a join public.user_resource ur on ur.resource_id = a.teacher_resource_id
  join public.profiles p on p.id = ur.user_id and p.role = 'teacher' where a.club_year_id::text = current_setting('cf.y') limit 1), true);
select set_config('cf.admin', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
  join public.resource r on r.id = ur.resource_id and r.type in ('teacher', 'staff')
  where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
select set_config('cf.stu', (select sp.id::text from public.club_member m join public.profiles sp on split_part(sp.email, '@', 1) = m.student_code
  where m.club_year_id::text = current_setting('cf.y') and m.status = 'confirmed' and sp.role = 'student' limit 1), true);
select set_config('cf.stu_res', (select r.id::text from public.resource r join public.profiles sp on split_part(sp.email, '@', 1) = r.meta->>'id'
  where sp.id::text = current_setting('cf.stu') and r.type = 'student' limit 1), true);
select set_config('cf.other_stu', (select sp.id::text from public.profiles sp
  where sp.role = 'student' and not exists (select 1 from public.club_member m where m.student_code = split_part(sp.email, '@', 1) and m.club_year_id::text = current_setting('cf.y'))
  order by sp.id limit 1), true);
select set_config('cf.other_res', (select r.id::text from public.resource r join public.profiles sp on split_part(sp.email, '@', 1) = r.meta->>'id'
  where sp.id::text = current_setting('cf.other_stu') and r.type = 'student' limit 1), true);
select set_config('cf.line', coalesce((select id::text from public.budget_line order by created_at limit 1), ''), true);
set local role authenticated;

-- ① 지도교사: 배정액은 못 정하고 페이지는 연다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cf.adv'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  begin perform public.club_set_finance(current_setting('cf.y')::uuid, 100000, null, null); raise exception 'FAIL ① 지도교사 배정';
  exception when insufficient_privilege then null; end;
  r := public.club_open_purchase_page(current_setting('cf.y')::uuid);
  if r->'page'->>'id' is null then raise exception 'FAIL ① 페이지 %', r; end if;
  perform set_config('cf.page', r->'page'->>'id', true);
  if (public.club_open_purchase_page(current_setting('cf.y')::uuid))->'page'->>'id' <> r->'page'->>'id' then raise exception 'FAIL ① 두 번 열림'; end if;
  if not public.is_purchase_page_manager((r->'page'->>'id')::uuid) then raise exception 'FAIL ① 지도교사가 페이지 담당자가 아님'; end if;
end $$;

-- ② 담당자: 배정액 · 예산 줄
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cf.admin'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.club_set_finance(current_setting('cf.y')::uuid, 500000, nullif(current_setting('cf.line'), '')::uuid, '시험');
  if (r->>'allocated')::bigint <> 500000 then raise exception 'FAIL ② 배정 %', r; end if;
  if current_setting('cf.line') <> '' and r->'budget_line' is null then raise exception 'FAIL ② 예산 줄'; end if;
  r := public.club_finance_overview(null);
  if not r ? current_setting('cf.y') then raise exception 'FAIL ② 전체 현황'; end if;
end $$;

-- ③ 부원 학생: 신청 됨 → 금액 집계 · 다른 학생: 거절
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cf.stu'), 'role', 'authenticated')::text, true);
do $$ begin
  insert into public.purchase_requests (page_id, requester_id, items, status)
  values (current_setting('cf.page')::uuid, current_setting('cf.stu_res')::uuid,
          '[{"id":"r1","cells":{"default-name":"아두이노","default-price":28000,"default-qty":2}}]'::jsonb, 'pending');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cf.other_stu'), 'role', 'authenticated')::text, true);
do $$ begin
  insert into public.purchase_requests (page_id, requester_id, items, status)
  values (current_setting('cf.page')::uuid, current_setting('cf.other_res')::uuid, '[]'::jsonb, 'pending');
  raise exception 'FAIL ③ 부원 아닌 학생 신청';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cf.adv'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.club_finance_get(current_setting('cf.y')::uuid);
  if (r->'amounts'->>'requested')::bigint <> 56000 or (r->'amounts'->>'pending_items')::int <> 1 then raise exception 'FAIL ③ 집계 %', r->'amounts'; end if;
end $$;

reset role;
select 'PASS club_finance' as result;
rollback;
