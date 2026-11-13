-- 동아리 P2(요청함·누가기록·활동) 시험 (2026-11-11) — 끝에서 rollback.
-- 전제: 20261111130000 · 20261111150000
begin;
select set_config('cr.admin', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
  join public.resource r on r.id = ur.resource_id and r.type in ('teacher', 'staff')
  where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
select set_config('cr.y', (select y.id::text from public.club_year y join public.club_advisor a on a.club_year_id = y.id
  join public.user_resource ur on ur.resource_id = a.teacher_resource_id join public.profiles p on p.id = ur.user_id and p.role = 'teacher'
  where y.status = 'active' and (select count(*) from public.club_member m where m.club_year_id = y.id and m.status = 'confirmed') >= 3
  order by y.name limit 1), true);
select set_config('cr.adv', (select ur.user_id::text from public.club_advisor a join public.user_resource ur on ur.resource_id = a.teacher_resource_id
  join public.profiles p on p.id = ur.user_id and p.role = 'teacher' where a.club_year_id::text = current_setting('cr.y') limit 1), true);
select set_config('cr.stu', coalesce((select p.id::text from public.profiles p join public.club_member m on m.student_code = split_part(p.email, '@', 1)
  where p.role = 'student' and m.club_year_id::text = current_setting('cr.y') and m.status = 'confirmed' limit 1), ''), true);
select set_config('cr.code', (select student_code from public.club_member where club_year_id::text = current_setting('cr.y') and status = 'confirmed' order by number limit 1), true);

do $$ begin
  if coalesce(current_setting('cr.admin', true), '') = '' or coalesce(current_setting('cr.adv', true), '') = '' then
    raise exception '시험 재료 없음';
  end if;
end $$;

set local role authenticated;

-- ① 담당자(관리자): 축 미리보기 · 보내기
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cr.admin'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; v_rows int; v_people int;
begin
  -- 동아리 축: 지도하는 동아리마다 한 줄
  r := public.resolve_audience('{"include":[{"type":"club","names":[]}],"exclude":[]}'::jsonb, 'club', null, null);
  select count(distinct x->>'unit_key') into v_rows from jsonb_array_elements(r->'rows') x where x->>'unit_key' like 'club|%';
  if v_rows < 40 then raise exception 'FAIL ① club 축 줄 %', v_rows; end if;
  r := public.resolve_audience('{"include":[{"type":"club","names":[]}],"exclude":[]}'::jsonb, 'club_member', null, null);
  select count(distinct x->>'unit_key') into v_rows from jsonb_array_elements(r->'rows') x where x->>'unit_key' like 'club|%|%';
  if v_rows < 550 then raise exception 'FAIL ① club_member 축 줄 %', v_rows; end if;
  -- 사람 축은 그대로
  r := public.resolve_audience('{"include":[{"type":"club","names":[]}],"exclude":[]}'::jsonb, 'person', null, null);
  select count(*) into v_people from jsonb_array_elements(r->'rows') x where x->>'unit_key' = 'person';
  if v_people < 30 then raise exception 'FAIL ① 사람 축 %', v_people; end if;

  r := public.club_send_request('11월 누가기록', 'club_member', '[{"label":"관찰 내용","type":"text","required":true}]'::jsonb,
                                '2026-11-30', array[current_setting('cr.y')::uuid], '부원마다 한 줄', 'private', null, true);
  if not (r->>'check_only')::boolean or (r->>'rows')::int < 3 then raise exception 'FAIL ① 미리보기 %', r; end if;
  r := public.club_send_request('11월 누가기록', 'club_member', '[{"label":"관찰 내용","type":"text","required":true}]'::jsonb,
                                '2026-11-30', array[current_setting('cr.y')::uuid], '부원마다 한 줄', 'private', null, false);
  if not (r->>'ok')::boolean then raise exception 'FAIL ① 보내기 %', r; end if;
  perform set_config('cr.action', r->>'action_id', true);
  if (select axis from public.collect_request where action_id = (r->>'action_id')::uuid) <> 'club_member' then raise exception 'FAIL ① 요청 축'; end if;
  r := public.club_requests(null, null);
  if jsonb_array_length(r) < 1 then raise exception 'FAIL ① 전체 요청 현황'; end if;
  -- 잘못된 축
  begin
    perform public.club_send_request('x', 'person', '[{"label":"a"}]'::jsonb, null, null, null, 'private', null, true);
    raise exception 'FAIL ① 사람 축 허용';
  exception when invalid_parameter_value then null; end;
end $$;

-- ② 지도교사: 요청 현황 · 누가기록 쓰기 · 근거 묶음 · 활동
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cr.adv'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; v_note uuid;
begin
  r := public.club_requests(current_setting('cr.y')::uuid, null);
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'action_id' = current_setting('cr.action')) then
    raise exception 'FAIL ② 지도교사 요청 목록 %', r;
  end if;
  if exists (select 1 from jsonb_array_elements(r) x, jsonb_array_elements(x->'clubs') c where (c->>'units')::int < 3) then
    raise exception 'FAIL ② 줄 수';
  end if;
  begin perform public.club_requests(null, null); raise exception 'FAIL ② 전체 현황 허용';
  exception when insufficient_privilege then null; end;

  r := public.club_save_note(current_setting('cr.y')::uuid, current_setting('cr.code'), '발표 준비를 주도함', null, '2026-11', 'manual');
  v_note := (r->>'id')::uuid;
  r := public.club_notes(current_setting('cr.y')::uuid);
  if not exists (select 1 from jsonb_array_elements(r->'students') s, jsonb_array_elements(s->'notes') n where n->>'id' = v_note::text) then
    raise exception 'FAIL ② 누가기록 묶음';
  end if;
  if not (r->'requests' ? current_setting('cr.action')) then raise exception 'FAIL ② 요청 항목 이름표'; end if;
  perform public.club_save_note(current_setting('cr.y')::uuid, current_setting('cr.code'), '고친 내용', v_note, '2026-11', 'manual');
  begin perform public.club_save_note(current_setting('cr.y')::uuid, 'no-such', 'x', null, null, 'manual'); raise exception 'FAIL ② 부원 아닌 학생';
  exception when invalid_parameter_value then null; end;
  perform public.club_activities(current_setting('cr.y')::uuid);
end $$;

-- ③ 학생: 누가기록 못 읽음 · 쓰기 거절
do $$ begin if coalesce(current_setting('cr.stu', true), '') = '' then raise notice '③ 건너뜀'; end if; end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cr.stu'), 'role', 'authenticated')::text, true)
where coalesce(current_setting('cr.stu', true), '') <> '';
do $$ begin
  if coalesce(current_setting('cr.stu', true), '') = '' then return; end if;
  if exists (select 1 from public.club_observation) then raise exception 'FAIL ③ 학생이 누가기록을 읽음'; end if;
  begin perform public.club_notes(current_setting('cr.y')::uuid); raise exception 'FAIL ③ 학생 근거 묶음';
  exception when insufficient_privilege then null; end;
  perform public.club_activities(current_setting('cr.y')::uuid);
end $$;

reset role;
select 'PASS club_requests_notes' as result;
rollback;
