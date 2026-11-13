-- seat_reservations SELECT 좁히기(20261009130000) 회귀. 전부 롤백한다.
-- 단독으로 돌리면 «현재 운영 상태»를 잰다 — M4 적용 전에는 ①이 실패하는 것이 정상이다.
begin;
select set_config('x.s',(select p.id::text from public.profiles p where p.role='student' and exists(select 1 from public.seat_reservations r where r.student_id=p.id) order by p.id limit 1),true);
select set_config('x.t',(select id::text from public.profiles where role='teacher' order by id limit 1),true);
select set_config('x.staff',(select id::text from public.profiles where role='staff' order by id limit 1),true);
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated','email',(select email from public.profiles where id=uid::uuid))::text,true);
end $$;
create temp table _n on commit drop as select count(*)::int as total from public.seat_reservations;
create temp table _o on commit drop as select count(*)::int as own from public.seat_reservations where student_id=current_setting('x.s')::uuid;
grant select on _n, _o to authenticated;

-- ① 학생 = 본인 행만
select pg_temp.as_user(current_setting('x.s'));
set local role authenticated;
do $$ begin
  if (select count(*) from public.seat_reservations)<>(select own from _o) then raise exception '① student sees % rows, own %',(select count(*) from public.seat_reservations),(select own from _o); end if;
  if exists(select 1 from public.seaton_seat_occupancy((select room_id from public.seat_reservations limit 1),current_date-30,current_date+30) o where o.is_mine is null) then raise exception '① occupancy is_mine'; end if;
end $$;
reset role;
-- ② 교사 = 전부
select pg_temp.as_user(current_setting('x.t'));
set local role authenticated;
do $$ begin if (select count(*) from public.seat_reservations)<>(select total from _n) then raise exception '② teacher rows'; end if;
  perform public.seaton_stats_summary(current_date-7,current_date); end $$;
reset role;
-- ③ 직원 = 표는 0행, 교사 홈 카드 RPC 는 동작
select pg_temp.as_user(current_setting('x.staff'));
set local role authenticated;
do $$ begin
  if (select count(*) from public.seat_reservations)<>0 then raise exception '③ staff table rows'; end if;
  perform public.seaton_day_attendance_rows(current_date);
end $$;
reset role;
-- ④ 익명 = 0행
set local role anon;
do $$ begin if (select count(*) from public.seat_reservations)<>0 then raise exception '④ anon rows'; end if; end $$;
reset role;
select 'PASS: 학생 본인 행만 · 교사 전체 · 직원 표 0행(카드 RPC 동작) · 익명 0행 (rolled back)' as result;
rollback;
