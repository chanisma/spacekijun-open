-- 데스크 메시지 허락 (2026-10-31) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261031130000_desk_message_session.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 기존 쌍 active · 처음은 보내기 거절 · 요청 → 대기 중 거절·중복 거절 → 거절 → 다시 요청 → 허락 → 보내기
--      · 종료 → 다시 거절 · 선생님이 보내면 열림 · 남의 요청 결정 거절 · 역할 거절 · 표 직접 접근 거절 · 알림 위조 불가
begin;
select set_config('ms.teacher', (select ur.user_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                                 join public.profiles p on p.id = ur.user_id
                                 where r.type = 'teacher' and p.role = 'teacher' order by ur.user_id limit 1), true);
select set_config('ms.other', (select ur.user_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                               join public.profiles p on p.id = ur.user_id
                               where r.type = 'teacher' and p.role = 'teacher'
                                 and public.desk_message_who(ur.user_id)->>'resource_id'
                                     <> public.desk_message_who(current_setting('ms.teacher')::uuid)->>'resource_id'
                               order by ur.user_id desc limit 1), true);
select set_config('ms.rt', public.desk_message_who(current_setting('ms.teacher')::uuid)->>'resource_id', true);
select set_config('ms.student', (select p.id::text from public.profiles p
                                 where p.role = 'student' and public.desk_message_who(p.id) is not null
                                   and not exists (select 1 from public.desk_message_session s
                                                   where s.teacher_resource_id = current_setting('ms.rt')::uuid
                                                     and s.student_resource_id = (public.desk_message_who(p.id)->>'resource_id')::uuid)
                                 order by p.id limit 1), true);
select set_config('ms.rs', public.desk_message_who(current_setting('ms.student')::uuid)->>'resource_id', true);

do $$
begin
  if coalesce(current_setting('ms.rt', true), '') = '' or coalesce(current_setting('ms.rs', true), '') = ''
     or coalesce(current_setting('ms.other', true), '') = '' then
    raise exception '시험 계정을 찾지 못함';
  end if;
  -- 기존 쌍: 주고받은 기록이 있는 쌍은 모두 active 여야 한다
  if exists (
    select 1 from public.notification_events n
    join public.resource rec on rec.id = n.resource_id
    join public.resource snd on snd.id::text = n.meta->>'sender_resource_id'
    where n.type = 'desk_message' and (rec.type = 'student') <> (snd.type = 'student')
      and not exists (select 1 from public.desk_message_session s
                      where s.status = 'active'
                        and s.student_resource_id = case when rec.type = 'student' then rec.id else snd.id end
                        and s.teacher_resource_id = case when rec.type = 'student' then snd.id else rec.id end)) then
    raise exception '기존 대화 중 active 가 아닌 쌍이 있음';
  end if;
end $$;

create temp table ms_expect(body text) on commit drop;
grant all on ms_expect to authenticated;
set local role authenticated;

-- 학생
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.student'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; rt uuid := current_setting('ms.rt')::uuid;
begin
  begin
    perform public.send_desk_message_v2(rt, '허락 없이', null, null);
    raise exception 'FAIL 허락 없이 보내짐';
  exception when insufficient_privilege then null; end;
  begin
    perform public.send_desk_message(rt, '옛 앱 허락 없이', null);
    raise exception 'FAIL 옛 3인자 함수로 허락 없이 보내짐';
  exception when insufficient_privilege then null; end;
  begin
    perform public.desk_message_request(rt, '   ');
    raise exception 'FAIL 빈 용건 통과';
  exception when invalid_parameter_value then null; end;
  v := public.desk_message_request(rt, '수행평가 질문이 있습니다');
  if v->>'notification_id' is null then raise exception 'FAIL 요청 알림 없음'; end if;
  begin
    perform public.desk_message_request(rt, '두 번째');
    raise exception 'FAIL 중복 요청 통과';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.send_desk_message_v2(rt, '대기 중', null, null);
    raise exception 'FAIL 대기 중 보내짐';
  exception when insufficient_privilege then null; end;
  begin
    perform public.desk_message_decide((public.desk_message_who(auth.uid())->>'resource_id')::uuid, true);
    raise exception 'FAIL 학생이 스스로 허락';
  exception when insufficient_privilege then null; end;
  begin
    perform public.desk_message_end_session((public.desk_message_who(auth.uid())->>'resource_id')::uuid);
    raise exception 'FAIL 학생이 종료';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.desk_message_session;
    raise exception 'FAIL 표 직접 읽기';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.notification_events (resource_id, type, title, message, meta)
    values (rt, 'desk_message', 'x', '위조', '{}');
    raise exception 'FAIL 알림 직접 넣기';
  exception when insufficient_privilege then null; end;
  if (select s->>'status' from jsonb_array_elements(public.desk_message_sessions()->'sessions') s where s->>'peer' = rt::text) <> 'pending' then
    raise exception 'FAIL 학생에게 pending 이 안 보임';
  end if;
end $$;

-- 다른 선생님은 결정하지 못한다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.other'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.desk_message_decide(current_setting('ms.rs')::uuid, true);
    raise exception 'FAIL 남의 요청 결정';
  exception when no_data_found then null; end;
end $$;

-- 선생님: 거절
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.teacher'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.desk_message_decide(current_setting('ms.rs')::uuid, false)->>'status' <> 'declined' then raise exception 'FAIL 거절'; end if;
  begin
    perform public.desk_message_decide(current_setting('ms.rs')::uuid, true);
    raise exception 'FAIL 끝난 요청을 다시 결정';
  exception when no_data_found then null; end;
end $$;

-- 학생: 거절 뒤 못 보내고, 다시 요청한다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.student'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.send_desk_message_v2(current_setting('ms.rt')::uuid, '거절 뒤', null, null);
    raise exception 'FAIL 거절 뒤 보내짐';
  exception when insufficient_privilege then null; end;
  perform public.desk_message_request(current_setting('ms.rt')::uuid, '다시 부탁드립니다');
end $$;

-- 선생님: 허락
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.teacher'), 'role', 'authenticated')::text, true);
select public.desk_message_decide(current_setting('ms.rs')::uuid, true);

-- 학생: 보낸다, 요청은 막힌다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.student'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.send_desk_message_v2(current_setting('ms.rt')::uuid, '허락 뒤', null, null);
  if v->>'notification_id' is null then raise exception 'FAIL 허락 뒤 못 보냄'; end if;
  begin
    perform public.desk_message_request(current_setting('ms.rt')::uuid, '또');
    raise exception 'FAIL 진행 중 요청 통과';
  exception when invalid_parameter_value then null; end;
  if not exists (select 1 from jsonb_array_elements(public.desk_message_sent(50)) m where m->>'kind' = 'session_request') then
    raise exception 'FAIL 보낸 목록에 kind 없음';
  end if;
end $$;

-- 선생님: 종료
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.teacher'), 'role', 'authenticated')::text, true);
select public.desk_message_end_session(current_setting('ms.rs')::uuid);

-- 학생: 종료 뒤 못 보낸다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.student'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.send_desk_message_v2(current_setting('ms.rt')::uuid, '종료 뒤', null, null);
    raise exception 'FAIL 종료 뒤 보내짐';
  exception when insufficient_privilege then null; end;
end $$;

-- 선생님이 보내면 다시 열린다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.teacher'), 'role', 'authenticated')::text, true);
select public.send_desk_message_v2(current_setting('ms.rs')::uuid, '다시 이야기하자', null, null);

select set_config('request.jwt.claims', json_build_object('sub', current_setting('ms.student'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.send_desk_message_v2(current_setting('ms.rt')::uuid, '네', null, null)->>'notification_id' is null then
    raise exception 'FAIL 다시 열린 뒤 못 보냄';
  end if;
end $$;

select 'desk_message_session 시험 통과' as result;
rollback;
