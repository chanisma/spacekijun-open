-- 예약 업무 결과 → 휴대폰 «에이전트» 탭 (2026-11-07) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261027120000_desk_agent_peer.sql · 20261029130000_desk_agent_phone.sql · 20261030100000_desk_agent_cross.sql ·
--       20261107090000_desk_agent_cron.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 올리기 → 휴대폰 목록에 kind=cron 묶음(제목·시킨 일·결과·상태·늦게) · PC 이름은 beat 가 없어도 결과 줄에서
--      · 휴대폰에서 보낸 것은 그대로 kind=phone · 데스크 inbox 에 다시 들어가지 않음 · 남의 목록에는 안 보임
--      · 잘못된 기기·이름·상태·빈 제목·긴 결과 거절 · 학생 거절 · 표 직접 접근 거절
begin;
select set_config('ap.a', (select ur.user_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                           join public.profiles p on p.id = ur.user_id
                           where r.type = 'teacher' and p.role = 'teacher' order by ur.user_id limit 1), true);
select set_config('ap.b', (select ur.user_id::text from public.user_resource ur join public.resource r on r.id = ur.resource_id
                           join public.profiles p on p.id = ur.user_id
                           where r.type = 'teacher' and p.role = 'teacher'
                             and public.desk_message_who(ur.user_id)->>'resource_id'
                                 <> public.desk_message_who(current_setting('ap.a')::uuid)->>'resource_id'
                           order by ur.user_id desc limit 1), true);
select set_config('ap.student', (select p.id::text from public.profiles p where p.role = 'student' order by p.id limit 1), true);

do $$ begin
  if coalesce(current_setting('ap.a', true), '') = '' or coalesce(current_setting('ap.b', true), '') = '' then
    raise exception '교사 계정 둘을 찾지 못함';
  end if;
end $$;

set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.a'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; row jsonb; ok boolean; before int;
begin
  -- 휴대폰 스위치를 켜지 않은 PC(beat 없음)도 올릴 수 있다 — 결과는 내 휴대폰에만
  v := public.desk_agent_cron_post(repeat('e', 32), 'A-PC', 'claude-1', '아침 공문 정리', '오늘 마감 공문을 정리해 줘',
                                   '마감 공문 2건: …', 'done', true);
  if v->>'id' is null or v->>'reply' is null then raise exception '올리기 답이 이상함: %', v; end if;
  perform set_config('ap.head', v->>'id', true);

  v := public.desk_agent_phone_overview();
  row := (select m from jsonb_array_elements(v->'messages') m where m->>'id' = current_setting('ap.head'));
  if row is null then raise exception '휴대폰 목록에 예약 결과가 없음: %', v->'messages'; end if;
  if row->>'kind' <> 'cron' or row->>'title' <> '아침 공문 정리' or row->>'body' <> '오늘 마감 공문을 정리해 줘'
     or row->>'result_status' <> 'done' or (row->>'late')::boolean is not true or row->>'to_label' <> 'A-PC'
     or row->>'to_agent' <> 'claude-1' or row->>'status' <> 'delivered' then
    raise exception '예약 묶음이 이상함: %', row;
  end if;
  if jsonb_array_length(row->'replies') <> 1 or row->'replies'->0->>'body' <> '마감 공문 2건: …'
     or row->'replies'->0->>'agent' <> 'claude-1' then
    raise exception '예약 결과 줄이 이상함: %', row->'replies';
  end if;

  -- 늦지 않은 실패도
  v := public.desk_agent_cron_post(repeat('e', 32), 'A-PC', 'claude-1', '저녁 점검', '점검', '로그인 필요', 'login');
  row := (select m from jsonb_array_elements(public.desk_agent_phone_overview()->'messages') m where m->>'id' = v->>'id');
  if row->>'result_status' <> 'login' or (row->>'late')::boolean is not false then raise exception '상태가 이상함: %', row; end if;

  -- 휴대폰에서 보낸 것은 그대로 phone
  perform public.desk_agent_beat(repeat('a', 32), 'A-PC', '[{"name":"claude-1","title":"","tool":"claude","status":"idle"}]');
  v := public.desk_agent_phone_send(repeat('c', 32), repeat('a', 32), 'claude-1', '이어서 표로 만들어 줘');
  row := (select m from jsonb_array_elements(public.desk_agent_phone_overview()->'messages') m where m->>'id' = v->>'id');
  if row->>'kind' <> 'phone' or row->>'title' is not null or row->>'status' <> 'sent' then raise exception '휴대폰 메시지가 이상함: %', row; end if;

  -- 예약 줄은 데스크 inbox 에 다시 들어가지 않는다 (휴대폰에서 보낸 것 하나만)
  v := public.desk_agent_beat(repeat('e', 32), 'A-PC', '[{"name":"claude-1","title":"","tool":"claude","status":"idle"}]');
  if jsonb_array_length(v->'inbox') <> 0 then raise exception '예약 줄이 inbox 에 들어감: %', v->'inbox'; end if;

  -- 거절되어야 하는 것
  ok := false; begin perform public.desk_agent_cron_post('pc', 'A-PC', 'claude-1', 't', 'p', 'r');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '잘못된 기기 id 가 통과'; end if;
  ok := false; begin perform public.desk_agent_cron_post(repeat('e', 32), 'A-PC', 'bad name', 't', 'p', 'r');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '잘못된 에이전트 이름이 통과'; end if;
  ok := false; begin perform public.desk_agent_cron_post(repeat('e', 32), 'A-PC', 'claude-1', '   ', 'p', 'r');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '빈 제목이 통과'; end if;
  ok := false; begin perform public.desk_agent_cron_post(repeat('e', 32), 'A-PC', 'claude-1', 't', 'p', 'r', 'choice');
  exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception '모르는 상태가 통과'; end if;
  ok := false; begin perform public.desk_agent_cron_post(repeat('e', 32), 'A-PC', 'claude-1', 't', 'p', repeat('가', 8001));
  exception when sqlstate '22001' then ok := true; end;
  if not ok then raise exception '긴 결과가 통과'; end if;

  -- 표 직접 접근
  ok := false; begin perform 1 from public.desk_agent_message limit 1;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception '표를 직접 읽을 수 있음'; end if;
end $$;

-- B 의 목록에는 A 의 예약이 보이지 않는다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.b'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from jsonb_array_elements(public.desk_agent_phone_overview()->'messages') m
             where m->>'id' = current_setting('ap.head')) then
    raise exception '남의 예약 결과가 보임';
  end if;
end $$;

-- 학생 거절
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ap.student'), 'role', 'authenticated')::text, true);
do $$
declare ok boolean := false;
begin
  begin perform public.desk_agent_cron_post(repeat('e', 32), 'S-PC', 'claude-1', 't', 'p', 'r');
  exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception '학생이 올림'; end if;
end $$;

reset role;
select 'desk_agent_cron PASS' as result;
rollback;
