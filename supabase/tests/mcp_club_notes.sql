-- MCP 동아리 P2 도구(누가기록·요청함) 시험 (2026-11-11) — 끝에서 rollback.
begin;
select set_config('mn.y', (select y.id::text from public.club_year y join public.club_advisor a on a.club_year_id = y.id
  join public.user_resource ur on ur.resource_id = a.teacher_resource_id join public.profiles p on p.id = ur.user_id and p.role = 'teacher'
  where y.status = 'active' and (select count(*) from public.club_member m where m.club_year_id = y.id and m.status = 'confirmed') >= 3
  order by y.name limit 1), true);
select set_config('mn.adv', (select ur.user_id::text from public.club_advisor a join public.user_resource ur on ur.resource_id = a.teacher_resource_id
  join public.profiles p on p.id = ur.user_id and p.role = 'teacher' where a.club_year_id::text = current_setting('mn.y') limit 1), true);
select set_config('mn.admin', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
  join public.resource r on r.id = ur.resource_id and r.type in ('teacher', 'staff')
  where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
select set_config('mn.gcn', (select concat_ws('-', grade, class_num, number) from public.club_member
  where club_year_id::text = current_setting('mn.y') and status = 'confirmed' order by number limit 1), true);
select set_config('mn.name', (select name from public.club_year where id::text = current_setting('mn.y')), true);
set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('mn.adv'), 'role', 'authenticated', 'client_id', 'test-agent')::text, true);
do $$
declare r jsonb;
begin
  r := public.mcp_get_club_notes(current_setting('mn.y')::uuid);
  if jsonb_array_length(r->'students') < 3 then raise exception 'FAIL 근거 학생 %', r; end if;
  r := public.mcp_save_club_note(current_setting('mn.y')::uuid, current_setting('mn.gcn'), '발표 준비를 주도함', '11월', null, true);
  if not (r->>'check_only')::boolean then raise exception 'FAIL 미리보기'; end if;
  r := public.mcp_save_club_note(current_setting('mn.y')::uuid, current_setting('mn.gcn'), '발표 준비를 주도함', '11월', null, false);
  if (select source from public.club_observation where id = (r->>'note_id')::uuid) <> 'agent' then raise exception 'FAIL source'; end if;
  begin perform public.mcp_save_club_note(current_setting('mn.y')::uuid, '9-99-99', 'x', null, null, true); raise exception 'FAIL 없는 부원';
  exception when invalid_parameter_value then null; end;
  r := public.mcp_list_club_requests(current_setting('mn.y')::uuid, null);
  if r->'requests' is null then raise exception 'FAIL 요청 현황'; end if;
  begin perform public.mcp_send_club_request('x', 'club', '[{"label":"a"}]', null, null, null, 'private', true); raise exception 'FAIL 지도교사가 요청 보냄';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('mn.admin'), 'role', 'authenticated', 'client_id', 'test-agent')::text, true);
do $$
declare r jsonb;
begin
  r := public.mcp_send_club_request('11월 누가기록', 'club_member', '[{"label":"관찰 내용","type":"text"}]', '2026-11-30',
                                    array[current_setting('mn.name')], null, 'private', true);
  if not (r->>'check_only')::boolean or (r->>'rows')::int < 3 or r ? 'config' then raise exception 'FAIL 요청 미리보기 %', r; end if;
  begin perform public.mcp_send_club_request('x', 'club', '[{"label":"a"}]', null, array['없는 동아리'], null, 'private', true); raise exception 'FAIL 없는 동아리';
  exception when invalid_parameter_value then null; end;
  r := public.mcp_send_club_request('11월 누가기록', 'club_member', '[{"label":"관찰 내용","type":"text"}]', '2026-11-30',
                                    array[current_setting('mn.name')], null, 'private', false);
  if r->>'action_id' is null then raise exception 'FAIL 보내기 %', r; end if;
end $$;

reset role;
select 'PASS mcp_club_notes' as result;
rollback;
