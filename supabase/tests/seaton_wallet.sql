-- 통합 지갑 · seaton 컷오버 회귀 (20261009110000 + 20261009120000). 전부 롤백한다.
-- 학생 = 자습실 예약이 하나도 없는 재학생(실데이터 청구가 섞이지 않게). claims 에 email 필수
-- (seat_reservations 정책 일부가 auth.jwt()->>'email' 로 본인을 판정한다).
begin;
select set_config('w.s',(select p.id::text from public.profiles p where p.role='student'
  and not exists(select 1 from public.seat_reservations r where r.student_id=p.id)
  and exists(select 1 from public.resource x where x.type='student' and x.status='active' and x.meta->>'id'=split_part(p.email,'@',1))
  order by p.id limit 1),true);
select set_config('w.s_email',(select email from public.profiles where id=current_setting('w.s')::uuid),true);
select set_config('w.other',(select id::text from public.profiles where role='student' and id::text<>current_setting('w.s') order by id limit 1),true);
select set_config('w.t',(select id::text from public.profiles where role='teacher' order by id limit 1),true);
select set_config('w.staff',(select id::text from public.profiles where role='staff' order by id limit 1),true);
select set_config('w.today',((now() at time zone 'Asia/Seoul')::date)::text,true);
select set_config('w.room',gen_random_uuid()::text,true);
select set_config('w.event',gen_random_uuid()::text,true);

-- 고정 자료(postgres) — 지갑 100 · 열람실 · 예약 6건 · 퍼즐 이벤트 · 옛 포인트 15
insert into public.academy_user_stats(user_id,coins) values(current_setting('w.s')::uuid,100) on conflict(user_id) do update set coins=100;
delete from public.wallet_ledger where user_id=current_setting('w.s')::uuid;
delete from public.tama_credit_ledger where user_id=current_setting('w.s')::uuid and earned_on=current_setting('w.today')::date;
insert into public.study_rooms(id,name,grade,total_seats) values(current_setting('w.room')::uuid,'Wallet fixture 아침',1,50);
insert into public.seat_reservations(id,student_id,room_id,seat_number,reservation_date,period_id)
select gen_random_uuid(),current_setting('w.s')::uuid,current_setting('w.room')::uuid,'A'||n,d,0 from (values
 (1,current_setting('w.today')::date-1),(2,current_setting('w.today')::date-2),(3,current_setting('w.today')::date-9),
 (4,current_setting('w.today')::date-3),(5,current_setting('w.today')::date+2),(6,current_setting('w.today')::date-4)) v(n,d);
create temp table _r on commit drop as select seat_number s, id from public.seat_reservations where room_id=current_setting('w.room')::uuid;
grant select on _r to authenticated;
insert into public.puzzle_events(id,title,image_url,grid_size,total_pieces,piece_cost,start_date,end_date,is_active)
values(current_setting('w.event')::uuid,'wallet fixture','x','3x4',12,10,current_setting('w.today')::date-1,current_setting('w.today')::date+1,true);
alter table public.point_transactions disable trigger seaton_freeze_legacy_points;
insert into public.point_transactions(student_id,amount,type,reference_id,description) values(current_setting('w.s')::uuid,15,'attendance','fixture','옛 포인트');
alter table public.point_transactions enable trigger seaton_freeze_legacy_points;
-- 컷오버 전 출석(백로그) 흉내: 트리거를 끄고 A6 출석
select set_config('request.jwt.claims',json_build_object('sub',current_setting('w.t'),'role','authenticated')::text,true); -- 출석 열 보호 트리거는 교사만 통과
alter table public.seat_reservations disable trigger wallet_seaton_attendance;
update public.seat_reservations set attendance_status='attended',is_attended=true where id=(select id from _r where s='A6');
alter table public.seat_reservations enable trigger wallet_seaton_attendance;

create or replace function pg_temp.coins() returns int language sql as $$ select coins from public.academy_user_stats where user_id=current_setting('w.s')::uuid $$;
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated','email',(select email from public.profiles where id=uid::uuid))::text,true);
end $$;

-- ① 출석 자동 +5 · 같은 갱신 반복 0 · 인정(=보상 대상 아님)으로 바꾸면 −5 · 다시 출석 +5
select pg_temp.as_user(current_setting('w.t'));
set local role authenticated;
update public.seat_reservations set attendance_status='attended',is_attended=true,checked_by=auth.uid() where id=(select id from _r where s='A1');
reset role;
do $$ begin if pg_temp.coins()<>105 then raise exception '① auto +5 failed: %',pg_temp.coins(); end if;
 if (select source from public.academy_study_rewards where reservation_id=(select id from _r where s='A1'))<>'auto' then raise exception '① receipt source'; end if; end $$;
set local role authenticated;
update public.seat_reservations set attendance_status='attended',is_attended=true where id=(select id from _r where s='A1');
reset role;
do $$ begin if pg_temp.coins()<>105 then raise exception '① repeat minted'; end if; end $$;
set local role authenticated;
update public.seat_reservations set attendance_status='excused' where id=(select id from _r where s='A1');
reset role;
do $$ begin if pg_temp.coins()<>100 or exists(select 1 from public.academy_study_rewards where reservation_id=(select id from _r where s='A1')) then raise exception '① reversal failed: %',pg_temp.coins(); end if; end $$;
set local role authenticated;
update public.seat_reservations set attendance_status='attended' where id=(select id from _r where s='A1');
-- 미래 예약 출석 처리 → 보상 없음(그날이 와도 자동으로 주지 않는다 — 청구 버튼이 받는다)
update public.seat_reservations set attendance_status='attended',is_attended=true where id=(select id from _r where s='A5');
update public.seat_reservations set attendance_status='attended',is_attended=true where id in (select id from _r where s in ('A2','A3'));
reset role;
do $$ begin if pg_temp.coins()<>115 then raise exception '① re-attend/future/batch: % (expect 115 = 100+5+5+5)',pg_temp.coins(); end if;
 if (select count(*) from public.wallet_ledger where user_id=current_setting('w.s')::uuid and kind like 'seaton_attendance%')<>5 then raise exception '① ledger rows'; end if; end $$;

-- ② 청구 버튼: 자동 지급분은 0, 컷오버 전 출석(A6)만 받는다
select pg_temp.as_user(current_setting('w.s'));
set local role authenticated;
do $$ declare r jsonb; wk date; begin
  wk := date_trunc('week', current_setting('w.today')::date - 4)::date;
  r := public.academy_study_claim(wk);
  if pg_temp.coins() <> 115 + (r->>'reward')::int then raise exception '② claim mismatch %',r; end if;
  if not exists(select 1 from public.academy_study_rewards where reservation_id=(select id from _r where s='A6') and source='claim') then
    -- A6 이 다른 주에 있으면 그 주를 청구
    r := public.academy_study_claim(date_trunc('week', current_setting('w.today')::date - 4)::date);
  end if;
  if (select count(*) from public.academy_study_rewards where reservation_id in (select id from _r) and source='auto')<>3 then raise exception '② auto receipts'; end if;
end $$;
reset role;
-- 기준을 다시 맞춘다
update public.academy_user_stats set coins=100 where user_id=current_setting('w.s')::uuid;

-- ③ 회수 clamp — 잔액 2 에서 −5 → 0 (음수 없음)
update public.academy_user_stats set coins=2 where user_id=current_setting('w.s')::uuid;
select pg_temp.as_user(current_setting('w.t'));
set local role authenticated;
update public.seat_reservations set attendance_status=null,is_attended=false where id=(select id from _r where s='A2');
reset role;
do $$ begin if pg_temp.coins()<>0 then raise exception '③ clamp: %',pg_temp.coins(); end if;
 if (select delta from public.wallet_ledger where user_id=current_setting('w.s')::uuid and kind='seaton_attendance_reversal' order by id desc limit 1)<>-2 then raise exception '③ ledger delta'; end if;
 begin update public.academy_user_stats set coins=-1 where user_id=current_setting('w.s')::uuid; raise exception '③ negative accepted' using errcode='XX000'; exception when check_violation then null; end;
end $$;
update public.academy_user_stats set coins=100 where user_id=current_setting('w.s')::uuid;

-- ④ 피드백: 미출석·8일 지남·삽입 시·지우기 거부 / 출석한 어제 +1 / 하루 두 번째 0
select pg_temp.as_user(current_setting('w.s'));
set local role authenticated;
do $$ begin
  begin update public.seat_reservations set feedback_rating=5 where id=(select id from _r where s='A4'); raise exception '④ non-attended feedback' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin update public.seat_reservations set feedback_rating=5 where id=(select id from _r where s='A3'); raise exception '④ 9 days ago feedback' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin insert into public.seat_reservations(student_id,room_id,seat_number,reservation_date,period_id,feedback_rating) values(auth.uid(),current_setting('w.room')::uuid,'B1',current_setting('w.today')::date+3,0,5); raise exception '④ insert with feedback' using errcode='XX000'; exception when insufficient_privilege then null; end;
  update public.seat_reservations set feedback_rating=4,feedback_note='좋아요' where id=(select id from _r where s='A1');
  if pg_temp.coins()<>101 then raise exception '④ review +1: %',pg_temp.coins(); end if;
  begin update public.seat_reservations set feedback_rating=null where id=(select id from _r where s='A1'); raise exception '④ delete feedback' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_user(current_setting('w.t'));
set local role authenticated;
update public.seat_reservations set attendance_status='attended',is_attended=true where id=(select id from _r where s='A4');
reset role;
update public.academy_user_stats set coins=101 where user_id=current_setting('w.s')::uuid;
select pg_temp.as_user(current_setting('w.s'));
set local role authenticated;
update public.seat_reservations set feedback_rating=3 where id=(select id from _r where s='A4');
reset role;
do $$ begin if pg_temp.coins()<>101 then raise exception '④ daily cap: %',pg_temp.coins(); end if; end $$;

-- ⑤ 삭제 범위: 지난 예약·출석한 예약은 학생이 못 지운다, 미래 미출석은 지운다
select pg_temp.as_user(current_setting('w.s'));
set local role authenticated;
do $$ declare n int; begin
  delete from public.seat_reservations where id=(select id from _r where s='A3'); get diagnostics n=row_count;
  if n<>0 then raise exception '⑤ past delete'; end if;
  insert into public.seat_reservations(student_id,room_id,seat_number,reservation_date,period_id) values(auth.uid(),current_setting('w.room')::uuid,'C1',current_setting('w.today')::date+5,0);
  delete from public.seat_reservations where seat_number='C1' and room_id=current_setting('w.room')::uuid; get diagnostics n=row_count;
  if n<>1 then raise exception '⑤ future delete blocked'; end if;
end $$;
reset role;

-- ⑥ 집중: 시작 직후 running · 목표 지나 +2 · 펫 집중과 합쳐 하루 2번
update public.academy_user_stats set coins=100 where user_id=current_setting('w.s')::uuid;
insert into public.tama_credit_ledger(user_id,earned_on,kind,source_id,amount) values(current_setting('w.s')::uuid,current_setting('w.today')::date,'focus','pet-fixture',2);
select pg_temp.as_user(current_setting('w.s'));
set local role authenticated;
select set_config('w.run',(public.seaton_focus_start(25)->'run'->>'id'),true);
do $$ begin if public.seaton_focus_finish(current_setting('w.run')::uuid)->>'outcome'<>'running' then raise exception '⑥ running'; end if; end $$;
reset role;
update public.seaton_focus_runs set started_at=now()-interval '26 minutes' where id=current_setting('w.run')::uuid;
set local role authenticated;
do $$ declare r jsonb; begin r:=public.seaton_focus_finish(current_setting('w.run')::uuid);
  if r->>'outcome'<>'completed' or (r->>'credit')::int<>2 then raise exception '⑥ completed %',r; end if; end $$;
select set_config('w.run2',(public.seaton_focus_start(25)->'run'->>'id'),true);
reset role;
update public.seaton_focus_runs set started_at=now()-interval '26 minutes' where id=current_setting('w.run2')::uuid;
set local role authenticated;
do $$ declare r jsonb; begin r:=public.seaton_focus_finish(current_setting('w.run2')::uuid);
  if r->>'outcome'<>'completed' or (r->>'credit')::int<>0 then raise exception '⑥ shared cap %',r; end if;
  if pg_temp.coins()<>102 then raise exception '⑥ coins %',pg_temp.coins(); end if;
  if (public.seaton_wallet_read()->>'focus_left')::int<>0 then raise exception '⑥ focus_left'; end if;
  begin perform public.seaton_focus_start(30); raise exception '⑥ odd minutes' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  if public.award_focus_points(gen_random_uuid())<>0 then raise exception '⑥ legacy focus points'; end if;
end $$;
reset role;

-- ⑦ 퍼즐: P 15 → 조각0 = 10P · 조각1 = 5P + 3코인 · 조각2 = 5코인 · 잔액 부족이면 아무것도 안 바뀐다
update public.academy_user_stats set coins=100 where user_id=current_setting('w.s')::uuid;
select pg_temp.as_user(current_setting('w.s'));
set local role authenticated;
do $$ declare r record; q jsonb; begin
  q := public.seaton_puzzle_quote(current_setting('w.event')::uuid);
  if (q->>'pay_points')::int<>10 or (q->>'pay_coins')::int<>0 then raise exception '⑦ quote0 %',q; end if;
  select * into r from public.unlock_puzzle_piece(current_setting('w.event')::uuid,0);
  if r.remaining_points<>5 or pg_temp.coins()<>100 then raise exception '⑦ piece0 %/%',r.remaining_points,pg_temp.coins(); end if;
  q := public.seaton_puzzle_quote(current_setting('w.event')::uuid);
  if (q->>'pay_points')::int<>5 or (q->>'pay_coins')::int<>3 then raise exception '⑦ quote1 %',q; end if;
  select * into r from public.unlock_puzzle_piece(current_setting('w.event')::uuid,1);
  if r.remaining_points<>0 or pg_temp.coins()<>97 then raise exception '⑦ piece1 %/%',r.remaining_points,pg_temp.coins(); end if;
  select * into r from public.unlock_puzzle_piece(current_setting('w.event')::uuid,2);
  if pg_temp.coins()<>92 then raise exception '⑦ piece2 %',pg_temp.coins(); end if;
  if (select total_earned from public.get_student_points(auth.uid()))<>(select coalesce(sum(amount) filter (where amount>0),0) from public.point_transactions where student_id=auth.uid()) then raise exception '⑦ get_student_points shape'; end if;
end $$;
reset role;
update public.academy_user_stats set coins=2 where user_id=current_setting('w.s')::uuid;
set local role authenticated;
do $$ begin
  begin perform public.unlock_puzzle_piece(current_setting('w.event')::uuid,3); raise exception '⑦ insufficient accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
  if exists(select 1 from public.student_puzzle_progress where student_id=auth.uid() and event_id=current_setting('w.event')::uuid and piece_index=3) then raise exception '⑦ progress leaked'; end if;
  if pg_temp.coins()<>2 then raise exception '⑦ coins moved'; end if;
  if (public.seaton_puzzle_quote(current_setting('w.event')::uuid)->>'affordable')::boolean then raise exception '⑦ quote affordable'; end if;
end $$;
reset role;

-- ⑧ 옛 포인트 동결 · 원장 비공개 · 역할
do $$ begin
  begin insert into public.point_transactions(student_id,amount,type,reference_id) values(current_setting('w.s')::uuid,10,'attendance','x'); raise exception '⑧ legacy earn accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_user(current_setting('w.other'));
set local role authenticated;
do $$ begin
  if exists(select 1 from public.wallet_ledger where user_id=current_setting('w.s')::uuid) then raise exception '⑧ ledger privacy'; end if;
  if exists(select 1 from public.seaton_seat_occupancy(current_setting('w.room')::uuid,current_setting('w.today')::date-10,current_setting('w.today')::date+10) o where o.is_mine) then raise exception '⑧ is_mine leaked'; end if;
  if (select count(*) from public.seaton_seat_occupancy(current_setting('w.room')::uuid,current_setting('w.today')::date-10,current_setting('w.today')::date+10))<5 then raise exception '⑧ occupancy rows'; end if;
  if not exists(select 1 from public.seaton_room_seat_counts(current_setting('w.today')::date-10,current_setting('w.today')::date+10) c where c.room_id=current_setting('w.room')::uuid) then raise exception '⑧ seat counts'; end if;
  begin perform public.seaton_day_attendance_rows(current_setting('w.today')::date); raise exception '⑧ student read day rows' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin perform public.seaton_focus_finish(current_setting('w.run')::uuid); raise exception '⑧ foreign focus' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_user(current_setting('w.staff'));
set local role authenticated;
do $$ begin perform public.seaton_day_attendance_rows(current_setting('w.today')::date); end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.seaton_wallet_read(); raise exception '⑧ anon wallet' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin perform public.seaton_seat_occupancy(gen_random_uuid(),current_date,current_date); raise exception '⑧ anon occupancy' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'PASS: 출석 자동 +5·반복 0·회수 clamp·재출석, 청구 버튼과 영수증 공유, 피드백 가드·하루 1번, 지난 예약 삭제 금지, 숲·펫 집중 상한 공유, 퍼즐 P→코인 결제·부족 시 무변경, 옛 포인트 동결, 원장·점유 비공개, 역할 (rolled back)' as result;
rollback;
