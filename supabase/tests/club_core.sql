-- 동아리 관리 P1(club_*) 시험 (2026-11-11) — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261111130000_club_core.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 로그인 없음 거절 · 교사 목록 · 학생은 자기 동아리 명단만 · 지도교사 칸 제한 · 남의 동아리 거절 ·
--      담당자 만들기 · 명단 미리보기/정규 하나 · 학생 제안 → 확정 · 기장 · club_info/창체 동기화 · 이름 변경 이력
begin;
-- 재료: 동아리 A(부원 ≥3, 지도교사 연결됨), A 의 부원 학생, 다른 동아리 B 의 지도교사, 관리자
select set_config('ct.ya', (select y.id::text from public.club_year y
  join public.club_advisor a on a.club_year_id = y.id
  join public.user_resource ur on ur.resource_id = a.teacher_resource_id
  join public.profiles p on p.id = ur.user_id and p.role = 'teacher'
  where y.status = 'active' and (select count(*) from public.club_member m where m.club_year_id = y.id and m.status = 'confirmed') >= 3
  order by y.name limit 1), true);
select set_config('ct.adv', (select ur.user_id::text from public.club_advisor a join public.user_resource ur on ur.resource_id = a.teacher_resource_id
  join public.profiles p on p.id = ur.user_id and p.role = 'teacher'
  where a.club_year_id::text = current_setting('ct.ya') limit 1), true);
select set_config('ct.other_t', (select ur.user_id::text from public.club_advisor a join public.user_resource ur on ur.resource_id = a.teacher_resource_id
  join public.profiles p on p.id = ur.user_id and p.role = 'teacher'
  where a.club_year_id::text <> current_setting('ct.ya') and ur.user_id::text <> current_setting('ct.adv')
    and not exists (select 1 from public.club_advisor a2 join public.user_resource u2 on u2.resource_id = a2.teacher_resource_id
                    where u2.user_id = ur.user_id and a2.club_year_id::text = current_setting('ct.ya'))
    and not exists (select 1 from public.resource_tag_assignments rta join public.resource_tags rt on rt.id = rta.tag_id
                    join public.user_resource u3 on u3.resource_id = rta.resource_id
                    where u3.user_id = ur.user_id and rt.name = '동아리담당자')
    and not exists (select 1 from public.user_resource u4 join public.resource r4 on r4.id = u4.resource_id
                    where u4.user_id = ur.user_id and r4.name = '윤도윤')
  limit 1), true);
select set_config('ct.admin', (select p.id::text from public.profiles p where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
select set_config('ct.stu', (select p.id::text from public.profiles p join public.club_member m on m.student_code = split_part(p.email, '@', 1)
  where p.role = 'student' and m.club_year_id::text = current_setting('ct.ya') and m.status = 'confirmed' limit 1), true);
select set_config('ct.stu_code', (select split_part(email, '@', 1) from public.profiles where id::text = current_setting('ct.stu')), true);
select set_config('ct.free', coalesce((select r2.meta->>'id' from public.resource r2 where r2.type = 'student' and r2.status = 'active'
  and not exists (select 1 from public.club_member m where m.student_code = r2.meta->>'id') order by r2.id limit 1), ''), true);
select set_config('ct.ci',(select legacy_club_info_id::text from public.club_year where id::text = current_setting('ct.ya')), true);

do $$ begin
  if coalesce(current_setting('ct.ya', true), '') = '' or coalesce(current_setting('ct.adv', true), '') = ''
     or coalesce(current_setting('ct.other_t', true), '') = '' or coalesce(current_setting('ct.admin', true), '') = '' then
    raise exception '시험 재료(동아리·지도교사·다른 교사·관리자)를 찾지 못함';
  end if;
  if (select count(*) from public.club_year) < 44 or (select count(*) from public.club_member) < 623 then
    raise exception 'FAIL 백필 수가 모자라다';
  end if;
end $$;

set local role authenticated;

-- ① 로그인 없음
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  perform public.club_list(null);
  raise exception 'FAIL ① 로그인 없이 목록';
exception when insufficient_privilege then null;
end $$;

-- ② 다른 교사: 목록·상세는 보이지만 고치기·명단·기장은 거절
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ct.other_t'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.club_list(null);
  if jsonb_array_length(r->'clubs') < 40 then raise exception 'FAIL ② 교사 목록 %', jsonb_array_length(r->'clubs'); end if;
  r := public.club_get(current_setting('ct.ya')::uuid);
  if jsonb_array_length(r->'members') < 3 then raise exception 'FAIL ② 교사가 명단을 못 본다'; end if;
  if (r->>'can_manage')::boolean then raise exception 'FAIL ② 남의 동아리 can_manage'; end if;
  begin
    perform public.club_save(current_setting('ct.ya')::uuid, '{"place":"x"}');
    raise exception 'FAIL ② 남의 동아리 고침';
  exception when insufficient_privilege then null; end;
  begin
    perform public.club_set_members(current_setting('ct.ya')::uuid, '[]', 'replace', false);
    raise exception 'FAIL ② 남의 동아리 명단';
  exception when insufficient_privilege then null; end;
  begin
    perform public.club_save(null, '{"name":"시험동아리"}');
    raise exception 'FAIL ② 교사가 동아리를 만들었다';
  exception when insufficient_privilege then null; end;
end $$;

-- ③ 지도교사: 장소는 고치고 이름은 거절, 명단 미리보기, 기장 정하기 → club_info 동기화
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ct.adv'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; v_code text; v_ci jsonb;
begin
  r := public.club_save(current_setting('ct.ya')::uuid, '{"place":"시험실-1"}');
  if r->>'place' <> '시험실-1' then raise exception 'FAIL ③ 장소'; end if;
  if (select meta->>'place' from public.club_info where id::text = current_setting('ct.ci')) <> '시험실-1' then
    raise exception 'FAIL ③ club_info 장소 동기화';
  end if;
  begin
    perform public.club_save(current_setting('ct.ya')::uuid, '{"name":"바뀐이름"}');
    raise exception 'FAIL ③ 지도교사가 이름을 바꿈';
  exception when insufficient_privilege then null; end;

  -- 다른 정규 동아리 부원을 넣으려 하면 미리보기에 오류
  select m.student_code into v_code from public.club_member m join public.club_year y on y.id = m.club_year_id
  where y.kind = 'regular' and y.status = 'active' and m.status = 'confirmed' and y.id::text <> current_setting('ct.ya') limit 1;
  r := public.club_set_members(current_setting('ct.ya')::uuid, jsonb_build_array(jsonb_build_object('code', v_code)), 'add', true);
  if (r->>'ok')::boolean or jsonb_array_length(r->'errors') <> 1 then raise exception 'FAIL ③ 정규 하나 규칙 미리보기 %', r; end if;
  -- 없는 학생
  r := public.club_set_members(current_setting('ct.ya')::uuid, '["9-99-99"]', 'add', false);
  if (r->>'ok')::boolean then raise exception 'FAIL ③ 없는 학생이 통과'; end if;

  -- 기장: 첫 부원
  select student_code into v_code from public.club_member where club_year_id::text = current_setting('ct.ya') and status = 'confirmed'
    order by grade, class_num, number limit 1;
  r := public.club_set_leader(current_setting('ct.ya')::uuid, v_code);
  if r->'leader'->>'code' <> v_code then raise exception 'FAIL ③ 기장'; end if;
  select meta->'leader' into v_ci from public.club_info where id::text = current_setting('ct.ci');
  if v_ci->>'code' <> v_code then raise exception 'FAIL ③ club_info 기장 동기화 %', v_ci; end if;
  if not exists (select 1 from public.activity_host_member hm join public.club_year y on y.activity_host_id = hm.host_id
                 where y.id::text = current_setting('ct.ya') and hm.student_code = v_code and hm.role = 'leader') then
    raise exception 'FAIL ③ 창체 명단 기장 동기화';
  end if;
end $$;

-- ④ 학생(그 동아리 부원): 자기 동아리 명단은 보이고, 고치기 거절, 제안은 대기로
do $$ begin
  if coalesce(current_setting('ct.stu', true), '') = '' then raise notice '④ 건너뜀 — 로그인 계정이 있는 부원 없음'; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('ct.stu', true), ''), 'role', 'authenticated')::text, true)
where coalesce(current_setting('ct.stu', true), '') <> '';
do $$
declare r jsonb; v_cnt int; v_target text;
begin
  if coalesce(current_setting('ct.stu', true), '') = '' then return; end if;
  r := public.club_get(current_setting('ct.ya')::uuid);
  if r->>'my_role' not in ('member', 'leader') then raise exception 'FAIL ④ 학생 역할 %', r->>'my_role'; end if;
  if jsonb_array_length(r->'members') < 3 then raise exception 'FAIL ④ 학생이 자기 동아리 명단을 못 본다'; end if;
  select count(*) into v_cnt from public.club_member;
  if v_cnt > 60 then raise exception 'FAIL ④ 학생에게 다른 동아리 명단이 보인다(%)', v_cnt; end if;
  begin
    perform public.club_save(current_setting('ct.ya')::uuid, '{"place":"x"}');
    raise exception 'FAIL ④ 학생이 고침';
  exception when insufficient_privilege then null; end;
  begin
    perform public.club_set_members(current_setting('ct.ya')::uuid, '[]', 'add', false);
    raise exception 'FAIL ④ 학생이 명단 확정';
  exception when insufficient_privilege then null; end;
  -- 정규 동아리가 없는 재학생 한 명을 제안
  v_target := nullif(current_setting('ct.free', true), '');
  if v_target is not null then
    r := public.club_request_members(current_setting('ct.ya')::uuid, jsonb_build_array(jsonb_build_object('code', v_target)), '시험 제안');
    if (r->>'requested')::int <> 1 then raise exception 'FAIL ④ 제안 %', r; end if;
    perform set_config('ct.target', v_target, true);
  end if;
end $$;

-- ⑤ 지도교사: 제안 확정 → club_info 학생 수 +1
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ct.adv'), 'role', 'authenticated')::text, true);
do $$
declare v_id uuid; v_before int; r jsonb;
begin
  if coalesce(current_setting('ct.target', true), '') = '' then return; end if;
  select id into v_id from public.club_member where club_year_id::text = current_setting('ct.ya') and student_code = current_setting('ct.target');
  if (select status from public.club_member where id = v_id) <> 'pending' then raise exception 'FAIL ⑤ 대기가 아니다'; end if;
  select student_count into v_before from public.club_info where id::text = current_setting('ct.ci');
  r := public.club_decide_members(array[v_id], 'confirm', null);
  if (r->>'changed')::int <> 1 then raise exception 'FAIL ⑤ 확정 %', r; end if;
  if (select student_count from public.club_info where id::text = current_setting('ct.ci')) <> v_before + 1 then
    raise exception 'FAIL ⑤ club_info 학생 수 동기화';
  end if;
  r := public.club_decide_members(array[v_id], 'remove', '시험');
  if (select student_count from public.club_info where id::text = current_setting('ct.ci')) <> v_before then
    raise exception 'FAIL ⑤ 빼기 동기화';
  end if;
end $$;

-- ⑥ 관리자(담당자): 새 동아리 만들기 → club_info·창체 주최 생성, 이름 변경 이력, 지도교사
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ct.admin'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; v_id uuid; v_t uuid;
begin
  if not public.is_club_manager() then raise exception 'FAIL ⑥ 관리자가 담당자가 아니다'; end if;
  r := public.club_save(null, '{"name":"시험자율동아리","kind":"autonomous","place":"도서실"}');
  v_id := (r->>'id')::uuid;
  if not exists (select 1 from public.club_info where meta->>'club_year_id' = v_id::text and name = '시험자율동아리') then
    raise exception 'FAIL ⑥ club_info 생성';
  end if;
  if (select activity_host_id from public.club_year where id = v_id) is null then raise exception 'FAIL ⑥ 창체 주최 생성'; end if;
  select a.teacher_resource_id into v_t from public.club_advisor a limit 1;
  r := public.club_set_advisors(v_id, array[v_t]);
  if jsonb_array_length(r->'advisors') <> 1 then raise exception 'FAIL ⑥ 지도교사'; end if;
  r := public.club_save(v_id, '{"name":"시험자율동아리2"}');
  if r->'club'->'former_names'->0->>'name' <> '시험자율동아리' then raise exception 'FAIL ⑥ 이름 이력 %', r->'club'; end if;
  if not exists (select 1 from public.club_info where meta->>'club_year_id' = v_id::text and name = '시험자율동아리2') then
    raise exception 'FAIL ⑥ 이름 동기화';
  end if;
end $$;

-- ⑦ 직접 쓰기는 막혀 있다
do $$ begin
  insert into public.club (canonical_name) values ('x');
  raise exception 'FAIL ⑦ 표 직접 쓰기';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'PASS club_core' as result;
rollback;
