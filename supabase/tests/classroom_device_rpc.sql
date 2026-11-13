-- 교실 기기 DB RPC (2026-11-10) 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261110150000_classroom_device_rpc.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: anon 이 부를 수 있음 · 키는 sha256 으로만 남음 · QR 10분 · poll pending/unknown · 남의 키로는 내 QR 을 못 봄
--      · 입력 검사(키·동작·코드·이름·플랫폼·공개키) · end → cancelled · 횟수 제한은 {"error":"rate_limited"}
--      · 수업 중이 아닌 코드로 type_start → {"error":"not_active"} 류의 알려진 오류
--      · anon 은 아래 함수(classroom_link_poll 등)를 바로 못 부름
begin;
set local role anon;

do $$
declare
  k text := 'TestKey_' || repeat('x', 40);
  other text := 'OtherKey' || repeat('y', 40);
  v jsonb; code text; i int; ok boolean;
begin
  v := public.classroom_device_call('start', k, jsonb_build_object('name', '  시험 기기  ', 'platform', 'windows'));
  code := v->>'code';
  if code is null then raise exception 'start 실패: %', v; end if;
  if (v->>'expires_at')::timestamptz < now() + interval '9 minutes' then raise exception 'QR 수명이 10분이 아님: %', v; end if;

  v := public.classroom_device_call('poll', k, jsonb_build_object('code', code));
  if v->>'status' <> 'pending' then raise exception 'poll 이 pending 이 아님: %', v; end if;
  v := public.classroom_device_call('poll', other, jsonb_build_object('code', code));
  if v->>'status' <> 'unknown' then raise exception '남의 키로 내 QR 이 보임: %', v; end if;

  -- 입력 검사
  if public.classroom_device_call('poll', 'short', jsonb_build_object('code', code))->>'error' <> 'invalid_device' then raise exception '짧은 키 통과'; end if;
  if public.classroom_device_call('approve', k, jsonb_build_object('code', code))->>'error' <> 'invalid_action' then raise exception '교사 동작 통과'; end if;
  if public.classroom_device_call('poll', k, jsonb_build_object('code', 'bad code!'))->>'error' <> 'invalid_code' then raise exception '나쁜 코드 통과'; end if;
  if public.classroom_device_call('poll', k, null)->>'error' <> 'invalid_code' then raise exception '빈 인자 통과'; end if;
  if public.classroom_device_call('start', k, jsonb_build_object('name', ' ', 'platform', 'windows'))->>'error' <> 'invalid_request' then raise exception '빈 이름 통과'; end if;
  if public.classroom_device_call('start', k, jsonb_build_object('name', 'x', 'platform', 'mac'))->>'error' <> 'invalid_request' then raise exception '모르는 플랫폼 통과'; end if;
  if public.classroom_device_call('start', k, jsonb_build_object('name', 'x', 'platform', 'android', 'purpose', 'x'))->>'error' <> 'invalid_request' then raise exception '모르는 목적 통과'; end if;
  if public.classroom_device_call('type_start', k, jsonb_build_object('code', code, 'device_pub', 'short'))->>'error' <> 'invalid_request' then raise exception '짧은 공개키 통과'; end if;

  -- 수업 중이 아닌 코드 — 알려진 오류로 돌아온다(예외로 터지지 않는다)
  v := public.classroom_device_call('type_start', k, jsonb_build_object('code', code, 'device_pub', repeat('A', 60)));
  if v->>'error' is null then raise exception '수업 아닌 코드로 type_start 가 됨: %', v; end if;

  -- end → 대기 QR 은 cancelled
  v := public.classroom_device_call('end', k, jsonb_build_object('code', code));
  if v->>'status' <> 'ended' then raise exception 'end 답이 이상함: %', v; end if;
  v := public.classroom_device_call('poll', k, jsonb_build_object('code', code));
  if v->>'status' <> 'cancelled' then raise exception 'end 뒤 poll: %', v; end if;

  -- 횟수 제한(10분에 20개) — 오류는 값으로
  for i in 1..25 loop
    v := public.classroom_device_call('start', k, jsonb_build_object('name', '시험 기기', 'platform', 'android'));
    exit when v ? 'error';
  end loop;
  if v->>'error' is distinct from 'rate_limited' then raise exception '횟수 제한이 안 걸림: %', v; end if;

  -- anon 은 아래 함수를 바로 못 부른다
  ok := false;
  begin perform public.classroom_link_poll(repeat('a', 64), code);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon 이 classroom_link_poll 을 바로 부름'; end if;
end $$;

reset role;
do $$
begin
  if exists (select 1 from public.classroom_link where device_name = '시험 기기'
             and device_key_hash <> encode(extensions.digest('TestKey_' || repeat('x', 40), 'sha256'), 'hex')) then
    raise exception '키 해시가 다름';
  end if;
  if (select count(*) from public.classroom_link where device_name = '시험 기기') <> 20 then
    raise exception '시험 QR 수가 20 이 아님(이름 다듬기 포함)';
  end if;
end $$;
select 'classroom_device_rpc PASS' as result;
rollback;
