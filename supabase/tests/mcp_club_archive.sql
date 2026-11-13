-- MCP 동아리 P5 도구 시험 (2026-11-11) — 끝에서 rollback.
begin;
select set_config('ma.admin', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
  join public.resource r on r.id = ur.resource_id and r.type in ('teacher', 'staff')
  where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ma.admin'), 'role', 'authenticated', 'client_id', 'test-agent')::text, true);
do $$
declare r jsonb; v_host uuid; v_club uuid;
begin
  r := public.mcp_list_club_host_candidates();
  select (x->>'host_id')::uuid, (x->'suggestion'->>'club_id')::uuid into v_host, v_club
  from jsonb_array_elements(r->'hosts') x where jsonb_typeof(x->'suggestion') = 'object' limit 1;
  r := public.mcp_link_club_host(v_host, v_club, true);
  if not (r->>'check_only')::boolean then raise exception 'FAIL 미리보기'; end if;
  r := public.mcp_link_club_host(v_host, v_club, false);
  if not exists (select 1 from public.club_host_alias where activity_host_id = v_host) then raise exception 'FAIL 잇기'; end if;
end $$;
reset role;
select 'PASS mcp_club_archive' as result;
rollback;
