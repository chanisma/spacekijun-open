-- 동아리 P4(편성·개설 신청·새 학년도) 시험 (2026-11-11) — 끝에서 rollback.
begin;
select set_config('rc.admin', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
  join public.resource r on r.id = ur.resource_id and r.type in ('teacher', 'staff')
  where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
-- 정규 동아리가 없는 1·2학년 로그인 학생(없으면 아무 1·2학년 학생)
select set_config('rc.stu', coalesce(
  (select sp.id::text from public.profiles sp join public.resource rs on rs.meta->>'id' = split_part(sp.email, '@', 1) and rs.type = 'student' and rs.status = 'active'
   where sp.role = 'student' and (rs.meta->>'grade')::int in (1, 2)
     and not exists (select 1 from public.club_member m join public.club_year y on y.id = m.club_year_id
                     where m.student_code = rs.meta->>'id' and m.status = 'confirmed' and y.kind = 'regular' and y.status = 'active')
   order by sp.id limit 1),
  (select sp.id::text from public.profiles sp join public.resource rs on rs.meta->>'id' = split_part(sp.email, '@', 1) and rs.type = 'student' and rs.status = 'active'
   where sp.role = 'student' and (rs.meta->>'grade')::int in (1, 2) order by sp.id limit 1)), true);
select set_config('rc.free', (select (not exists (select 1 from public.club_member m join public.club_year y on y.id = m.club_year_id
   join public.profiles sp on split_part(sp.email, '@', 1) = m.student_code
   where sp.id::text = current_setting('rc.stu') and m.status = 'confirmed' and y.kind = 'regular' and y.status = 'active'))::text), true);
select set_config('rc.y1', (select y.id::text from public.club_year y where y.status = 'active' and y.kind = 'regular'
  and exists (select 1 from public.club_advisor a where a.club_year_id = y.id) order by y.name limit 1), true);
select set_config('rc.y2', (select y.id::text from public.club_year y where y.status = 'active' and y.kind = 'regular'
  and y.id::text <> current_setting('rc.y1') order by y.name limit 1), true);
select set_config('rc.adv', (select ur.user_id::text from public.club_advisor a join public.user_resource ur on ur.resource_id = a.teacher_resource_id
  join public.profiles p on p.id = ur.user_id and p.role = 'teacher' where a.club_year_id::text = current_setting('rc.y1') limit 1), true);
select set_config('rc.t', (select a.teacher_resource_id::text from public.club_advisor a where a.club_year_id::text = current_setting('rc.y1') limit 1), true);
set local role authenticated;

-- ① 담당자: 회차 열기 · 새 학년도 미리보기
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.admin'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.club_recruit_save(null, jsonb_build_object('title', '시험 편성', 'target_grades', '[1,2]'::jsonb, 'max_choices', 2,
         'opens_at', now() - interval '1 hour', 'closes_at', now() + interval '1 day'));
  if not (r->>'is_open')::boolean or jsonb_array_length(r->'clubs') < 30 then raise exception 'FAIL ① 회차 %', r->>'is_open'; end if;
  perform set_config('rc.r', r->>'id', true);
  r := public.club_roll_over(2026, 2027, true, true);
  if (r->>'clubs')::int < 30 or (r->>'check_only')::boolean is not true then raise exception 'FAIL ① 새 학년도 미리보기 %', r; end if;
  if not exists (select 1 from public.club_year where academic_year = 2026) then raise exception 'x'; end if;
  if exists (select 1 from public.club_year where academic_year = 2027) then raise exception 'FAIL ① 미리보기가 썼다'; end if;
end $$;

-- ② 학생: 지원 · 다시 내기 · 개설 신청
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.stu'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.club_apply(current_setting('rc.r')::uuid, array[current_setting('rc.y2')::uuid, current_setting('rc.y1')::uuid],
                         jsonb_build_object(current_setting('rc.y1'), '코딩을 배우고 싶어요'));
  if jsonb_array_length(r->'my_applications') <> 2 then raise exception 'FAIL ② 지원 %', r->'my_applications'; end if;
  begin perform public.club_apply(current_setting('rc.r')::uuid, array[current_setting('rc.y1')::uuid, current_setting('rc.y1')::uuid], '{}');
        raise exception 'FAIL ② 중복 지망';
  exception when invalid_parameter_value then null; end;
  r := public.club_apply(current_setting('rc.r')::uuid, array[current_setting('rc.y1')::uuid], jsonb_build_object(current_setting('rc.y1'), '1지망'));
  if jsonb_array_length(r->'my_applications') <> 1 then raise exception 'FAIL ② 다시 내기'; end if;
  if public.club_student_role(current_setting('rc.y1')::uuid) is distinct from 'leader' then   -- 기장은 지원자를 본다(설계)
    begin perform public.club_applications(current_setting('rc.y1')::uuid, null); raise exception 'FAIL ② 학생이 지원자 목록';
    exception when insufficient_privilege then null; end;
  end if;
  r := public.club_propose_autonomous('시험자율동아리X', '과학', '실험을 함께 합니다', null);
  perform set_config('rc.prop', r->>'club_year_id', true);
  if (select status from public.club_year where id = (r->>'club_year_id')::uuid) <> 'proposed' then raise exception 'FAIL ② 개설 신청'; end if;
end $$;

-- ③ 지도교사: 면접 결과 → 확정
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.adv'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; v uuid;
begin
  r := public.club_applications(current_setting('rc.y1')::uuid, current_setting('rc.r')::uuid);
  select (x->>'id')::uuid into v from jsonb_array_elements(r) x limit 1;
  if v is null then raise exception 'FAIL ③ 지원자 없음'; end if;
  r := public.club_judge_applications(array[v], 'accepted', '면접 합격');
  if (r->>'changed')::int <> 1 then raise exception 'FAIL ③ 면접'; end if;
  r := public.club_finalize_applications(current_setting('rc.y1')::uuid, current_setting('rc.r')::uuid);
  if current_setting('rc.free') = 'true' and (r->>'added')::int <> 1 then raise exception 'FAIL ③ 확정 %', r; end if;
  if current_setting('rc.free') = 'false' and jsonb_array_length(r->'skipped') <> 1 then raise exception 'FAIL ③ 다른 동아리 건너뜀 %', r; end if;
end $$;

-- ④ 담당자: 개설 승인
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.admin'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.club_proposals(null);
  if not exists (select 1 from jsonb_array_elements(r) x where x->>'id' = current_setting('rc.prop')) then raise exception 'FAIL ④ 신청 목록'; end if;
  r := public.club_decide_proposal(current_setting('rc.prop')::uuid, true, array[current_setting('rc.t')::uuid], null);
  if r->>'status' <> 'active' or (r->>'member_count')::int <> 1 then raise exception 'FAIL ④ 승인 %', r->>'status'; end if;
  if not exists (select 1 from public.club_info where meta->>'club_year_id' = current_setting('rc.prop')) then raise exception 'FAIL ④ club_info 동기화'; end if;
end $$;

reset role;
select 'PASS club_recruit' as result;
rollback;
