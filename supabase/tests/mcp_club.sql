-- MCP 동아리 도구(club.manage) 시험 (2026-11-11) — 끝에서 rollback.
-- 전제: 20261111130000_club_core.sql · 20261111140000_mcp_club.sql
begin;
select set_config('mc.adv', (select ur.user_id::text from public.club_advisor a join public.club_year y on y.id = a.club_year_id
  join public.user_resource ur on ur.resource_id = a.teacher_resource_id join public.profiles p on p.id = ur.user_id and p.role = 'teacher'
  where y.status = 'active' and (select count(*) from public.club_member m where m.club_year_id = y.id and m.status = 'confirmed') >= 3
  order by y.name limit 1), true);
select set_config('mc.y', (select a.club_year_id::text from public.club_advisor a join public.user_resource ur on ur.resource_id = a.teacher_resource_id
  join public.club_year y on y.id = a.club_year_id
  where ur.user_id::text = current_setting('mc.adv') and y.status = 'active' order by y.name limit 1), true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mc.adv'), 'role', 'authenticated', 'client_id', 'test-agent')::text, true);

do $$
declare r jsonb; v_code text; v_before int;
begin
  r := public.mcp_club_overview(null, null);
  if jsonb_array_length(r->'clubs') < 40 then raise exception 'FAIL 목록 %', jsonb_array_length(r->'clubs'); end if;
  if not exists (select 1 from jsonb_array_elements(r->'clubs') c where c->>'my_role' = 'advisor') then raise exception 'FAIL 내 역할'; end if;

  r := public.mcp_get_club(current_setting('mc.y')::uuid);
  if jsonb_array_length(r->'members') < 3 or r->'members'->0 ? 'code' then raise exception 'FAIL 명단 모양 %', r->'members'->0; end if;

  -- 미리보기만: 아무것도 안 바뀐다
  select count(*) into v_before from public.club_member;
  r := public.mcp_save_club(current_setting('mc.y')::uuid, '{"place":"MCP시험실"}', true);
  if not (r->>'check_only')::boolean then raise exception 'FAIL save 미리보기'; end if;
  r := public.mcp_save_club(current_setting('mc.y')::uuid, '{"place":"MCP시험실"}', false);
  if r->'club'->>'place' <> 'MCP시험실' then raise exception 'FAIL save %', r; end if;
  begin
    perform public.mcp_save_club(current_setting('mc.y')::uuid, '{"name":"x"}', false);
    raise exception 'FAIL 지도교사가 이름 변경';
  exception when insufficient_privilege then null; end;

  r := public.mcp_set_club_members(current_setting('mc.y')::uuid, '["9-99-99"]', 'add', true);
  if (r->>'ok')::boolean or r->'errors' is null then raise exception 'FAIL 없는 학생 %', r; end if;

  select concat_ws('-', grade, class_num, number) into v_code from public.club_member
   where club_year_id::text = current_setting('mc.y') and status = 'confirmed' order by number desc limit 1;
  r := public.mcp_set_club_leader(current_setting('mc.y')::uuid, v_code, true);
  if not (r->>'check_only')::boolean then raise exception 'FAIL 기장 미리보기'; end if;
  r := public.mcp_set_club_leader(current_setting('mc.y')::uuid, v_code, false);
  if r->'club'->>'leader' not like v_code || '%' then raise exception 'FAIL 기장 %', r; end if;

  begin
    perform public.mcp_set_club_advisors(current_setting('mc.y')::uuid, '["누구"]', true);
    raise exception 'FAIL 지도교사가 지도교사 지정';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin
  if not exists (select 1 from public.mcp_call_log where tool = 'get_club' and client_id = 'test-agent') then
    raise exception 'FAIL 호출 기록';
  end if;
end $$;
select 'PASS mcp_club' as result;
rollback;
