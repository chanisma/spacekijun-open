-- MCP 동아리 P4 도구 시험 (2026-11-11) — 끝에서 rollback.
begin;
select set_config('mr.admin', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
  join public.resource r on r.id = ur.resource_id and r.type in ('teacher', 'staff')
  where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
select set_config('mr.y', (select y.id::text from public.club_year y where y.status = 'active' and y.kind = 'regular' order by y.name limit 1), true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mr.admin'), 'role', 'authenticated', 'client_id', 'test-agent')::text, true);
do $$
declare r jsonb;
begin
  r := public.mcp_save_club_recruit(null, jsonb_build_object('title', '시험', 'opens_at', now() - interval '1 hour', 'closes_at', now() + interval '1 day'), true);
  if not (r->>'check_only')::boolean then raise exception 'FAIL 미리보기'; end if;
  r := public.mcp_save_club_recruit(null, jsonb_build_object('title', '시험', 'opens_at', now() - interval '1 hour', 'closes_at', now() + interval '1 day',
                                    'target_grades', '[1,2]'::jsonb), false);
  if not (r->>'is_open')::boolean then raise exception 'FAIL 회차 %', r; end if;
  r := public.mcp_list_club_recruits(null);
  if jsonb_array_length(r->'recruits') < 1 then raise exception 'FAIL 목록'; end if;
  r := public.mcp_get_club_applications(current_setting('mr.y')::uuid);
  r := public.mcp_finalize_club_applications(current_setting('mr.y')::uuid, true);
  if not (r->>'check_only')::boolean then raise exception 'FAIL 확정 미리보기'; end if;
  r := public.mcp_roll_over_clubs(2026, true, true);
  if (r->>'clubs')::int < 30 then raise exception 'FAIL 새 학년도 %', r; end if;
end $$;
reset role;
select 'PASS mcp_club_recruit' as result;
rollback;
