-- 업무 온톨로지 연결(ontology_link) 시험 (2026-11-08) — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261108100000_ontology_link.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 잇기·멱등 · 양 끝을 볼 수 있어야 보이고 이을 수 있다(공문 = 관리자만) · 자기 자신·모르는 종류 거절
--      · 남의 연결은 못 지운다(관리자는 지운다) · 학생은 못 보고 못 잇는다 · 로그인 없으면 거절
begin;
select set_config('ol.a', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                           where p.role = 'teacher' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
select set_config('ol.b', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
                           where p.role = 'teacher' and public.account_link_status(p.id) = 'linked'
                             and p.id::text <> current_setting('ol.a') order by p.id desc limit 1), true);
select set_config('ol.admin', (select p.id::text from public.profiles p where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
-- ⚠️ 명단에 연결되지 않은 교사는 is_staff_teacher_or_admin 이 거짓이라 기능을 못 쓴다(옳은 동작) — 시험 재료는 연결된 계정만
select set_config('ol.student', (select p.id::text from public.profiles p where p.role = 'student' order by p.id limit 1), true);
select set_config('ol.work', (select id::text from public.work order by created_at limit 1), true);
select set_config('ol.work2', (select id::text from public.work order by created_at desc limit 1), true);
select set_config('ol.meeting', (select id::text from public.meeting where kind = 'schedule' order by starts_at desc limit 1), true);
select set_config('ol.doc', (select id::text from public.official_doc order by registered_at desc limit 1), true);

do $$ begin
  if coalesce(current_setting('ol.a', true), '') = '' or coalesce(current_setting('ol.b', true), '') = ''
     or coalesce(current_setting('ol.admin', true), '') = '' or coalesce(current_setting('ol.student', true), '') = ''
     or coalesce(current_setting('ol.meeting', true), '') = '' or coalesce(current_setting('ol.doc', true), '') = ''
     or current_setting('ol.work') = current_setting('ol.work2') then
    raise exception '시험 재료(교사 둘·관리자·학생·업무 둘·학사일정·공문)를 찾지 못함';
  end if;
end $$;

set local role authenticated;

-- ① 로그인 없음
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  perform public.link_objects('work', current_setting('ol.work')::uuid, 'meeting', current_setting('ol.meeting')::uuid, 'schedule');
  raise exception 'FAIL ① 로그인 없이 이어졌다';
exception when insufficient_privilege then null;
end $$;

-- ② 교사 A: 업무 ↔ 학사일정 잇기 · 멱등
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ol.a'), 'role', 'authenticated')::text, true);
do $$
declare v1 uuid; v2 uuid;
begin
  v1 := public.link_objects('work', current_setting('ol.work')::uuid, 'meeting', current_setting('ol.meeting')::uuid, 'schedule', '  위원회 회의  ');
  v2 := public.link_objects('work', current_setting('ol.work')::uuid, 'meeting', current_setting('ol.meeting')::uuid, 'schedule');
  if v1 is null or v1 <> v2 then raise exception 'FAIL ② 멱등이 아니다 % %', v1, v2; end if;
  perform set_config('ol.link_a', v1::text, true);
  if (select note from public.ontology_link where id = v1) <> '위원회 회의' then raise exception 'FAIL ② 메모 다듬기'; end if;
  if (select created_by::text from public.ontology_link where id = v1) <> current_setting('ol.a') then raise exception 'FAIL ② 만든 사람'; end if;
end $$;

-- ③ 교사 A: 공문은 볼 수 없다 → 이을 수 없다
do $$ begin
  perform public.link_objects('official_doc', current_setting('ol.doc')::uuid, 'work', current_setting('ol.work')::uuid, 'evidence');
  raise exception 'FAIL ③ 교사가 공문을 이었다';
exception when insufficient_privilege then null;
end $$;

-- ④ 자기 자신 · 모르는 종류 · 모르는 관계 거절
do $$ begin
  perform public.link_objects('work', current_setting('ol.work')::uuid, 'work', current_setting('ol.work')::uuid, 'related');
  raise exception 'FAIL ④ 자기 자신';
exception when check_violation then null;
end $$;
do $$ begin
  if public.can_view_object('student', current_setting('ol.work')::uuid) then raise exception 'FAIL ④ 모르는 종류가 보인다'; end if;
end $$;
do $$ begin
  perform public.link_objects('work', current_setting('ol.work')::uuid, 'work', current_setting('ol.work2')::uuid, 'likes');
  raise exception 'FAIL ④ 모르는 관계';
exception when check_violation then null;
end $$;

-- ⑤ 교사 B: 보이지만 남의 연결은 못 지운다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ol.b'), 'role', 'authenticated')::text, true);
do $$ begin
  if (select count(*) from public.ontology_link where id = current_setting('ol.link_a')::uuid) <> 1 then raise exception 'FAIL ⑤ B 에게 안 보인다'; end if;
  if public.unlink_objects(current_setting('ol.link_a')::uuid) then raise exception 'FAIL ⑤ B 가 A 의 연결을 지웠다'; end if;
end $$;

-- ⑥ 관리자: 공문 → 업무 근거를 잇는다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ol.admin'), 'role', 'authenticated')::text, true);
do $$
declare v uuid;
begin
  v := public.link_objects('official_doc', current_setting('ol.doc')::uuid, 'work', current_setting('ol.work')::uuid, 'evidence');
  if v is null then raise exception 'FAIL ⑥ 관리자가 공문을 잇지 못함'; end if;
  perform set_config('ol.link_doc', v::text, true);
end $$;

-- ⑦ 교사 A: 공문 연결은 보이지 않는다(양 끝을 다 봐야 보인다) — 같은 업무의 일정 연결은 보인다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ol.a'), 'role', 'authenticated')::text, true);
do $$ begin
  if exists (select 1 from public.ontology_link where id = current_setting('ol.link_doc')::uuid) then raise exception 'FAIL ⑦ 교사에게 공문 연결이 보인다'; end if;
  if (select count(*) from public.ontology_link where (from_type = 'work' and from_id = current_setting('ol.work')::uuid)
      or (to_type = 'work' and to_id = current_setting('ol.work')::uuid)) <> 1 then raise exception 'FAIL ⑦ 업무의 연결 수'; end if;
end $$;

-- ⑧ 학생: 보이지 않고 잇지 못한다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ol.student'), 'role', 'authenticated')::text, true);
do $$ begin
  if exists (select 1 from public.ontology_link) then raise exception 'FAIL ⑧ 학생에게 보인다'; end if;
  begin
    perform public.link_objects('work', current_setting('ol.work')::uuid, 'work', current_setting('ol.work2')::uuid, 'related');
    raise exception 'FAIL ⑧ 학생이 이었다';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ⑨ 관리자는 남의 연결을 지운다 · 교사 A 는 자기 연결을 지운다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ol.admin'), 'role', 'authenticated')::text, true);
do $$ begin
  if not public.unlink_objects(current_setting('ol.link_doc')::uuid) then raise exception 'FAIL ⑨ 관리자 지우기'; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ol.a'), 'role', 'authenticated')::text, true);
do $$ begin
  if not public.unlink_objects(current_setting('ol.link_a')::uuid) then raise exception 'FAIL ⑨ 자기 연결 지우기'; end if;
end $$;

reset role;
select 'ontology_link PASS' as result;
rollback;
