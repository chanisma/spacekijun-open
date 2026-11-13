begin;
select set_config('study.owner',(select p.id::text from public.profiles p join public.student_basic_info s on s.id=split_part(p.email,'@',1) where p.role='student' order by p.id limit 1),true);
select set_config('study.other',(select id::text from public.profiles where role='student' and id::text<>current_setting('study.owner') order by id limit 1),true);
select set_config('study.admin',(select id::text from public.profiles where role='admin' order by id limit 1),true);
select set_config('study.code',(select split_part(email,'@',1) from public.profiles where id=current_setting('study.owner')::uuid),true);
select set_config('study.room',gen_random_uuid()::text,true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('study.owner'),'role','authenticated')::text,true);
-- Consume any existing eligible attendance only within this rolled-back transaction.
set local role authenticated;
select public.academy_study_claim('2026-09-07');
reset role;
insert into public.academy_user_stats(user_id,coins) values(current_setting('study.owner')::uuid,100) on conflict(user_id) do update set coins=100;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('study.admin'),'role','authenticated')::text,true);
insert into public.study_rooms(id,name,grade,total_seats,operating_periods) values(current_setting('study.room')::uuid,'Academy study fixture',3,100,'[{"id":1,"name":"1교시","start_time":"18:40","end_time":"20:10"},{"id":2,"name":"2교시","start_time":"20:20","end_time":"21:40"}]');
-- 2026-10-09 출석 자동 지급(wallet_seaton_attendance) 이후: 이 고정 자료는 «자동 지급 이전 출석(백로그)»을 흉내 낸다.
-- 수동 청구 경로를 그대로 재려고 삽입하는 동안만 트리거를 끈다. 자동 지급 자체는 seaton_wallet.sql 이 잰다.
alter table public.seat_reservations disable trigger wallet_seaton_attendance;
insert into public.seat_reservations(student_id,room_id,seat_number,reservation_date,period_id,attendance_status,is_attended)
select current_setting('study.owner')::uuid,current_setting('study.room')::uuid,'fixture',day,period,status,attended from (values
 (date '2026-09-07',1,'attended',true),(date '2026-09-07',2,'attended',true),
 (date '2026-09-08',1,'excused',true),(date '2026-09-08',2,'supplement',true),
 (date '2026-09-09',1,null,false),(date '2026-09-10',0,null,true),
 (date '2026-09-06',1,'attended',true),
 (date_trunc('week',(now() at time zone 'Asia/Seoul'))::date+7,1,'attended',true)
) v(day,period,status,attended);
alter table public.seat_reservations enable trigger wallet_seaton_attendance;
select set_config('study.source',(select id::text from public.seat_reservations where room_id=current_setting('study.room')::uuid and reservation_date='2026-09-07' and period_id=1),true);
select set_config('study.points',(select count(*)::text from public.point_transactions where student_id=current_setting('study.owner')::uuid),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('study.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare state jsonb; reward jsonb; begin
 state:=public.academy_study_read('2026-09-07');
 if (select count(*) from jsonb_array_elements(state->'entries') e where e->>'room'='Academy study fixture')<>6 then raise exception 'Week boundaries failed'; end if;
 if (select sum((e->>'minutes')::integer) from jsonb_array_elements(state->'entries') e where e->>'room'='Academy study fixture' and (e->>'eligible')::boolean)<>170 then raise exception 'Period minutes or attendance status failed'; end if;
 reward:=public.academy_study_claim('2026-09-07');
 if reward->>'reward'<>'15' or reward->>'coins'<>'115' then raise exception 'Expected exactly 3 attendances: %',reward; end if;
 reward:=public.academy_study_claim('2026-09-07');
 if reward->>'reward'<>'0' or reward->>'coins'<>'115' then raise exception 'Repeated claim minted coins'; end if;
 begin perform public.academy_study_read('2026-09-07','not-my-code'); raise exception 'Cross-student preview accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin perform public.academy_study_claim('2026-08-31'); raise exception 'Pre-launch claim accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 begin perform public.academy_study_claim('2026-09-08'); raise exception 'Non-Monday accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 begin perform public.academy_study_claim(date_trunc('week',(now() at time zone 'Asia/Seoul'))::date+7); raise exception 'Future claim accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 begin insert into public.academy_study_rewards values(gen_random_uuid(),auth.uid(),'2026-09-07',5,now()); raise exception 'Ledger client insert accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin update public.seat_reservations set id=gen_random_uuid() where id=current_setting('study.source')::uuid; raise exception 'Attendance identity forgery accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin update public.seat_reservations set reservation_date='2026-09-11' where id=current_setting('study.source')::uuid; raise exception 'Attendance date forgery accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin update public.seat_reservations set attendance_status='attended',is_attended=true where room_id=current_setting('study.room')::uuid and reservation_date='2026-09-09'; raise exception 'Student marked own attendance' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.point_transactions where student_id=current_setting('study.owner')::uuid)<>current_setting('study.points')::integer then raise exception 'Seaton points changed'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('study.other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.academy_study_rewards where user_id=current_setting('study.owner')::uuid) then raise exception 'Ledger privacy failed'; end if;
 if exists(select 1 from jsonb_array_elements(public.academy_study_read('2026-09-07')->'entries') e where e->>'room'='Academy study fixture') then raise exception 'Read leaked another student'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('study.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from jsonb_array_elements(public.academy_study_read('2026-09-07',current_setting('study.code'))->'entries') e where e->>'room'='Academy study fixture') then raise exception 'Admin preview missing'; end if;
 -- 2026-09-14 교직원 체험 이후 관리자도 청구할 수 있다(00-00001 의 기록 → 관리자 본인 지갑 · 별도 영수증 표).
 -- 지킬 것은 «학생의 지갑·영수증을 건드리지 않는다»이다 — 아래 reset role 뒤에서 잰다.
 perform public.academy_study_claim('2026-09-07');
end $$;
reset role;
do $$ begin
 if (select coins from public.academy_user_stats where user_id=current_setting('study.owner')::uuid)<>115 then raise exception 'Admin claim changed student coins'; end if;
 if exists(select 1 from public.academy_study_rewards where user_id=current_setting('study.admin')::uuid) then raise exception 'Admin claim wrote student receipts'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.academy_study_read('2026-09-07'); raise exception 'Anon read accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin perform public.academy_study_claim('2026-09-07'); raise exception 'Anon claim accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: library weekly attendance boundaries/times, status eligibility, five coins per attendance, duplicate and forged claim protection, source identity protection, student privacy/admin read-only, Seaton points unchanged (rolled back)' as result;
rollback;
