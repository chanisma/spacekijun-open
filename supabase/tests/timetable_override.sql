-- 운영 시간표 (2026-10-26) 역할·판정 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261026100000_timetable_override.sql 적용 + 3학년 수능 대비 운영 시간표(2026-10-26~11-18, grades {3}) 시드.
-- 판정: 기간 안 3학년 정규 수업은 빠지고 운영 칸이 들어온다 · 1·2학년 정규 수업은 그대로 · 기간 밖은 정규 그대로 ·
-- 교사 필터 · 63일 상한 · 교사는 못 씀 · 같은 기간·학년 겹침 거부 · 대상 밖 학년 칸 거부 · anon 거절 · MCP 요일 시간표
begin;
select set_config('tt.ov', (select o.id::text from public.timetable_override o where o.kind = 'csat' and o.academic_year = 2026 and o.semester = 2 order by o.created_at desc limit 1), true);
select set_config('tt.teacher', (select p.id::text from public.profiles p where p.role = 'teacher' order by p.id limit 1), true);
select set_config('tt.admin', (select p.id::text from public.profiles p where p.role = 'admin' order by p.id limit 1), true);
select set_config('tt.kim', (select r.id::text from public.resource r where r.name = '류은호' and r.type = 'teacher' limit 1), true);
select set_config('tt.cha', (select r.id::text from public.resource r where r.name = '최은호' and r.type = 'teacher' limit 1), true);

do $$ begin
  if current_setting('tt.ov', true) is null or current_setting('tt.ov') = '' then raise exception '수능 대비 운영 시간표 시드가 없음'; end if;
end $$;

-- 교사로
select set_config('request.jwt.claims', json_build_object('sub', current_setting('tt.teacher'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_ov uuid := current_setting('tt.ov')::uuid;
  n_reg3 int; n_ov int; n_eff3 int; n_eff12 int; n_reg12 int; n int;
begin
  -- 2026-10-27(화) — 기간 안
  select count(*) into n_eff3 from public.teacher_timetable_effective(2026, 2, '2026-10-27', '2026-10-27') e where e.grade = 3 and e.override_id is null;
  if n_eff3 <> 0 then raise exception '기간 안인데 3학년 정규 수업이 % 줄 남음', n_eff3; end if;
  select count(*) into n_ov from public.timetable_override_slot s where s.override_id = v_ov and s.day_of_week = 2;
  select count(*) into n from public.teacher_timetable_effective(2026, 2, '2026-10-27', '2026-10-27') e where e.override_id = v_ov;
  if n <> n_ov or n = 0 then raise exception '운영 칸 수 % ≠ %', n, n_ov; end if;
  select count(*) into n_reg12 from public.teacher_timetable t where t.academic_year = 2026 and t.semester = 2 and t.grade <> 3 and t.day_of_week = 2;
  select count(*) into n_eff12 from public.teacher_timetable_effective(2026, 2, '2026-10-27', '2026-10-27') e where e.grade <> 3;
  if n_eff12 <> n_reg12 then raise exception '1·2학년 정규 수업이 바뀜 % ≠ %', n_eff12, n_reg12; end if;

  -- 2026-11-19(목, 수능 당일 — 기간 밖) · 2026-10-23(금, 시작 전) = 정규 그대로
  select count(*) into n_reg3 from public.teacher_timetable t where t.academic_year = 2026 and t.semester = 2 and t.grade = 3 and t.day_of_week = 4;
  select count(*) into n from public.teacher_timetable_effective(2026, 2, '2026-11-19', '2026-11-19') e where e.grade = 3;
  if n <> n_reg3 then raise exception '수능 당일에 정규 3학년 수업이 아님 % ≠ %', n, n_reg3; end if;
  select count(*) into n from public.teacher_timetable_effective(2026, 2, '2026-10-23', '2026-10-23') e where e.override_id is not null;
  if n <> 0 then raise exception '시작 전 날에 운영 칸 %', n; end if;

  -- 날짜마다 따로 판정 — 11-16(월)~11-22(일) 주: 월~수만 운영, 목·금은 정규
  select count(distinct e.lesson_date) into n from public.teacher_timetable_effective(2026, 2, '2026-11-16', '2026-11-22') e where e.override_id is not null;
  if n <> 3 then raise exception '경계 주의 운영 날짜 수 % ≠ 3', n; end if;

  -- 교사 필터: 류은호은 기간 안 3학년 수업이 없다(새 시간표에서 빠짐), 최은호은 있다
  select count(*) into n from public.teacher_timetable_effective(2026, 2, '2026-10-26', '2026-10-30', current_setting('tt.kim')::uuid) e where e.grade = 3;
  if n <> 0 then raise exception '류은호에게 3학년 수업 % 줄', n; end if;
  select count(*) into n from public.teacher_timetable_effective(2026, 2, '2026-10-26', '2026-10-30', current_setting('tt.cha')::uuid) e where e.override_id is not null;
  if n < 10 then raise exception '최은호 운영 칸이 너무 적음 %', n; end if;

  -- 63일 상한
  select count(distinct e.lesson_date) into n from public.teacher_timetable_effective(2026, 2, '2026-09-01', '2026-12-31') e;
  if n > 63 then raise exception '63일 상한을 넘음 %', n; end if;

  -- 교사는 못 쓴다
  begin
    insert into public.timetable_override (title, kind, academic_year, semester, start_date, end_date, grades)
    values ('시험', 'exam', 2026, 2, '2026-12-01', '2026-12-03', array[1]::smallint[]);
    raise exception '교사가 운영 시간표를 만듦' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
  update public.timetable_override set status = 'archived' where id = v_ov;
  if (select status from public.timetable_override where id = v_ov) <> 'active' then raise exception '교사가 상태를 바꿈'; end if;
end $$;

-- 관리자로
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('tt.admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare v_new uuid;
begin
  -- 같은 기간·같은 학년 = 거부
  begin
    insert into public.timetable_override (title, kind, academic_year, semester, start_date, end_date, grades)
    values ('겹침', 'exam', 2026, 2, '2026-11-10', '2026-11-12', array[3]::smallint[]);
    raise exception '겹치는 운영 시간표를 받음' using errcode = 'XX000';
  exception when sqlstate '23P01' then null; end;
  -- 전 학년(null)도 겹침
  begin
    insert into public.timetable_override (title, kind, academic_year, semester, start_date, end_date, grades)
    values ('전체', 'special', 2026, 2, '2026-11-10', '2026-11-12', null);
    raise exception '전 학년 겹침을 받음' using errcode = 'XX000';
  exception when sqlstate '23P01' then null; end;
  -- 같은 기간 다른 학년 = 받는다
  insert into public.timetable_override (title, kind, academic_year, semester, start_date, end_date, grades)
  values ('1학년 시험', 'exam', 2026, 2, '2026-11-10', '2026-11-12', array[1]::smallint[]) returning id into v_new;
  -- 대상 밖 학년 칸 = 거부
  begin
    insert into public.timetable_override_slot (override_id, day_of_week, period, grade, class_label, teacher_name)
    values (v_new, 2, 1, 2, '1', '최은호');
    raise exception '대상 밖 학년 칸을 받음' using errcode = 'XX000';
  exception when sqlstate '23514' then null; end;
  -- 끈(archived) 운영 시간표는 판정에서 빠진다 → 이제 그 기간 1학년 정규 수업이 0줄(칸 없음)
  if (select count(*) from public.teacher_timetable_effective(2026, 2, '2026-11-10', '2026-11-10') e where e.grade = 1) <> 0 then
    raise exception '칸 없는 1학년 운영 시간표가 정규 수업을 못 가림';
  end if;
  update public.timetable_override set status = 'archived' where id = v_new;
  if (select count(*) from public.teacher_timetable_effective(2026, 2, '2026-11-10', '2026-11-10') e where e.grade = 1) = 0 then
    raise exception '끈 운영 시간표가 여전히 정규 수업을 가림';
  end if;
end $$;

-- 에이전트 요일 시간표(오늘 = 2026-10-26 기준 7일)는 운영 시간표 이름을 싣는다
reset role;
do $$
declare r jsonb;
begin
  if (now() at time zone 'Asia/Seoul')::date between '2026-10-26' and '2026-11-12' then
    r := mcp_private.timetable_of(current_setting('tt.cha')::uuid, null);
    if not (r ? 'operational_timetable') then raise exception 'MCP 시간표에 운영 시간표 표시 없음: %', r; end if;
  end if;
end $$;

-- anon 은 판정 함수를 못 부른다
set local role anon;
do $$ begin
  begin
    perform 1 from public.teacher_timetable_effective(2026, 2, '2026-10-27', '2026-10-27');
    raise exception 'anon 이 판정 함수를 부름' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select 'timetable_override tests passed' as result;
rollback;
