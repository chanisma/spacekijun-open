-- MCP 동아리 P3 도구 시험 (2026-11-11) — 끝에서 rollback.
begin;
select set_config('mf.y', (select y.id::text from public.club_year y join public.club_advisor a on a.club_year_id = y.id
  join public.user_resource ur on ur.resource_id = a.teacher_resource_id join public.profiles p on p.id = ur.user_id and p.role = 'teacher'
  where y.status = 'active' order by y.name limit 1), true);
select set_config('mf.adv', (select ur.user_id::text from public.club_advisor a join public.user_resource ur on ur.resource_id = a.teacher_resource_id
  join public.profiles p on p.id = ur.user_id and p.role = 'teacher' where a.club_year_id::text = current_setting('mf.y') limit 1), true);
select set_config('mf.admin', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
  join public.resource r on r.id = ur.resource_id and r.type in ('teacher', 'staff')
  where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mf.adv'), 'role', 'authenticated', 'client_id', 'test-agent')::text, true);
do $$
declare r jsonb;
begin
  r := public.mcp_get_club_finance(current_setting('mf.y')::uuid);
  if not r ? 'amounts' then raise exception 'FAIL 읽기'; end if;
  r := public.mcp_open_club_purchase_page(current_setting('mf.y')::uuid, true);
  if not (r->>'check_only')::boolean then raise exception 'FAIL 미리보기'; end if;
  r := public.mcp_open_club_purchase_page(current_setting('mf.y')::uuid, false);
  if r->'page'->>'id' is null then raise exception 'FAIL 페이지'; end if;
  begin perform public.mcp_set_club_finance(current_setting('mf.y')::uuid, 1000, null, null, true); raise exception 'FAIL 지도교사 배정';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mf.admin'), 'role', 'authenticated', 'client_id', 'test-agent')::text, true);
do $$
declare r jsonb;
begin
  r := public.mcp_set_club_finance(current_setting('mf.y')::uuid, 300000, null, '시험', false);
  if (r->'finance'->>'allocated')::bigint <> 300000 then raise exception 'FAIL 배정 %', r; end if;
end $$;
reset role;
select 'PASS mcp_club_finance' as result;
rollback;
