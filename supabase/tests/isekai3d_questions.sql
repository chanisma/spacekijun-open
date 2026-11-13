-- 이세계 3D 질문 (2026-10-19) 역할 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 동의한 학생 하나, 그 학생의 담임(태그 N학년 N반) 하나, 그 반·학년과 상관없는 교사 하나로:
--  본인 RPC(상태·지식 저장과 충돌·기억 끄기) · 직접 접근 거절 · 함수 전용 쓰기 · 3개 넣기 →
--  하루 1개(두 번째 받기는 daily_done) · 답 한 번만 · 담임은 보고 다른 교사·anon 은 못 봄
begin;
select set_config('s3.student', (
  select p.id::text from public.profiles p
    join public.resource r on r.type = 'student' and r.status = 'active' and r.meta->>'id' = split_part(p.email, '@', 1)
   where p.role = 'student' and (r.meta->>'grade') ~ '^[0-9]+$' and (r.meta->>'class') ~ '^[0-9]+$'
     and exists (select 1 from public.user_privacy_consents c join public.privacy_policy_versions v on v.version = c.policy_version and v.is_active where c.user_id = p.id)
   order by p.id limit 1), true);
select set_config('s3.grade', (select grade::text from public.isekai3d_student_class(current_setting('s3.student')::uuid)), true);
select set_config('s3.class', (select class::text from public.isekai3d_student_class(current_setting('s3.student')::uuid)), true);
select set_config('s3.homeroom', coalesce((
  select pr.id::text from public.profiles pr
    join public.resource r on r.name = pr.name and r.type = 'teacher' and r.status = 'active'
    join public.resource_tag_assignments a on a.resource_id = r.id
    join public.resource_tags t on t.id = a.tag_id
   where pr.role in ('teacher', 'admin')
     and regexp_replace(t.name, '\s', '', 'g') = current_setting('s3.grade') || '학년' || current_setting('s3.class') || '반'
   limit 1), ''), true);
select set_config('s3.other', (
  select pr.id::text from public.profiles pr
   where pr.role = 'teacher' and pr.id::text <> current_setting('s3.homeroom')
     and not exists (
       select 1 from public.resource r
         join public.resource_tag_assignments a on a.resource_id = r.id
         join public.resource_tags t on t.id = a.tag_id
        where r.name = pr.name and r.type = 'teacher'
          and regexp_replace(t.name, '\s', '', 'g') in (current_setting('s3.grade') || '학년' || current_setting('s3.class') || '반', current_setting('s3.grade') || '학년부장'))
   order by pr.id limit 1), true);
do $$ begin
  if current_setting('s3.student', true) is null or current_setting('s3.student') = '' then raise exception '시험할 학생(동의함·학년반 있음)이 없다'; end if;
end $$;
-- 이 학생의 기존 이세계 3D 기록은 이 트랜잭션 안에서만 비운다 (rollback)
delete from public.isekai3d_questions where user_id = current_setting('s3.student')::uuid;
delete from public.isekai3d_player where user_id = current_setting('s3.student')::uuid;

-- 1) 학생 본인
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.student'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.isekai3d_status('explore');
  if not (r->>'consent')::boolean then raise exception '동의를 못 봄: %', r; end if;
  if (r->>'pending')::int <> 0 or (r->>'deliveredToday')::boolean then raise exception '빈 상태가 아님: %', r; end if;
  r := public.isekai3d_knowledge_get();
  if (r->>'version')::int <> 0 or not (r->>'memory')::boolean then raise exception '처음 지식: %', r; end if;
  r := public.isekai3d_knowledge_save(0, '{"v":1,"episodes":[],"insights":[],"tally":{"card":1},"nextId":1,"recent":""}');
  if (r->>'conflict')::boolean or (r->>'version')::int <> 1 then raise exception '첫 저장: %', r; end if;
  r := public.isekai3d_knowledge_save(0, '{"v":1}');
  if not (r->>'conflict')::boolean or (r->'knowledge'->'tally'->>'card') <> '1' then raise exception '옛 판으로 덮어씀: %', r; end if;
  r := public.isekai3d_question_take('explore');
  if r->>'status' <> 'empty' then raise exception '빈 대기열에서 받음: %', r; end if;
  begin
    insert into public.isekai3d_questions (user_id, kind, context_key, card, batch) values (auth.uid(), 'explore', 'explore', '{}', gen_random_uuid());
    raise exception '표에 직접 씀' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform public.isekai3d_questions_add(auth.uid(), 'explore', 'explore', '[{}]'::jsonb);
    raise exception '학생이 함수 전용 쓰기를 부름' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform public.isekai3d_student_overview(auth.uid());
    raise exception '학생이 교사용 열람을 부름' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
  if (public.isekai3d_status(null)->>'dev')::boolean then raise exception '학생에게 시험 단추'; end if;
end $$;
reset role;

-- 2) 엣지 함수(service_role): 3개 넣기, 대기열이 남으면 더 넣지 않음
set local role service_role;
do $$ declare r jsonb; begin
  r := public.isekai3d_questions_add(current_setting('s3.student')::uuid, 'explore', 'explore',
    '[{"text":"a","options":["1","2","3"]},{"text":"b","options":["1","2","3"]},{"text":"c","options":["1","2","3"]}]'::jsonb);
  if r->>'status' <> 'filled' or (r->>'count')::int <> 3 then raise exception '넣기: %', r; end if;
  r := public.isekai3d_questions_add(current_setting('s3.student')::uuid, 'explore', 'explore', '[{"text":"d","options":["1","2","3"]}]'::jsonb);
  if r->>'status' <> 'pending_exists' then raise exception '대기열이 남았는데 또 넣음: %', r; end if;
end $$;
reset role;

-- 3) 학생: 하루 1개, 답은 한 번
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.student'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; r2 jsonb; begin
  r := public.isekai3d_question_take('explore');
  if r->>'status' <> 'card' or r->'card'->>'text' <> 'a' then raise exception '받기: %', r; end if;
  r2 := public.isekai3d_question_take('explore');
  if r2->>'status' <> 'daily_done' then raise exception '하루에 두 번 받음: %', r2; end if;
  r2 := public.isekai3d_question_answer((r->>'id')::uuid, 1, '  내 생각이에요  ');
  if not (r2->>'saved')::boolean then raise exception '답 저장 실패'; end if;
  r2 := public.isekai3d_question_answer((r->>'id')::uuid, 0, '다시');
  if (r2->>'saved')::boolean then raise exception '답을 두 번 받음'; end if;
  if not (public.isekai3d_status('explore')->>'deliveredToday')::boolean then raise exception '오늘 받은 것을 모름'; end if;
  if (public.isekai3d_status('explore')->>'pending')::int <> 2 then raise exception '남은 대기 수'; end if;
end $$;
reset role;

-- 4) 담임은 보고, 다른 교사는 못 본다
select set_config('request.jwt.claims', json_build_object('sub', nullif(current_setting('s3.homeroom'), ''), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  if current_setting('s3.homeroom') = '' then raise notice '이 학생의 담임 태그 교사가 없어 담임 열람은 건너뜀'; return; end if;
  r := public.isekai3d_student_overview(current_setting('s3.student')::uuid);
  if jsonb_array_length(r->'answers') <> 1 or r->'answers'->0->>'text' <> '내 생각이에요' or (r->'answers'->0->>'choice')::int <> 1 then raise exception '담임 열람: %', r; end if;
  if not exists (select 1 from public.isekai3d_my_students() where user_id = current_setting('s3.student')::uuid) then raise exception '담임의 학생 목록에 없음'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.other'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin
    perform public.isekai3d_student_overview(current_setting('s3.student')::uuid);
    raise exception '다른 교사가 봄' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.isekai3d_my_students() where user_id = current_setting('s3.student')::uuid) then raise exception '다른 교사 목록에 나옴'; end if;
end $$;
reset role;
-- 관리자도 본다 (2026-10-22 정책 변경, 20261022120000) — 담임 태그가 없어도
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'admin' order by id limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.isekai3d_student_overview(current_setting('s3.student')::uuid);
  if jsonb_array_length(r->'answers') <> 1 or r->'answers'->0->>'contextKey' is null then raise exception '관리자 열람: %', r; end if;
  if not exists (select 1 from public.isekai3d_my_students() where user_id = current_setting('s3.student')::uuid) then raise exception '관리자 학생 목록에 없음'; end if;
end $$;
reset role;

-- 5) 기억 끄기: 지식을 지우고, 저장을 받지 않는다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.student'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  perform public.isekai3d_memory_set(false);
  r := public.isekai3d_knowledge_get();
  if r->'knowledge' <> '{}'::jsonb or (r->>'memory')::boolean then raise exception '기억 끄기: %', r; end if;
  r := public.isekai3d_knowledge_save((r->>'version')::int, '{"v":1}');
  if (r->>'memory')::boolean is distinct from false then raise exception '끈 뒤 저장됨: %', r; end if;
end $$;
reset role;

-- 6) anon 은 아무것도
set local role anon;
do $$ begin
  begin perform public.isekai3d_status(null); raise exception 'anon 실행' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 7) 관리자 시험(20261019221509): 한도 없음 — 넣을 때마다 남은 것을 버리고 새로, 받기는 몇 번이든, 만든 질문 목록
select set_config('s3.admin', (select id::text from public.profiles where role = 'admin' order by id limit 1), true);
delete from public.isekai3d_questions where user_id = current_setting('s3.admin')::uuid;
set local role service_role;
do $$ declare r jsonb; begin
  r := public.isekai3d_questions_add(current_setting('s3.admin')::uuid, 'explore', 'explore', '[{"text":"a1","options":["1","2","3"]},{"text":"a2","options":["1","2","3"]}]'::jsonb);
  r := public.isekai3d_questions_add(current_setting('s3.admin')::uuid, 'explore', 'explore', '[{"text":"b1","options":["1","2","3"]},{"text":"b2","options":["1","2","3"]}]'::jsonb);
  if r->>'status' <> 'filled' then raise exception '관리자 넣기가 막힘: %', r; end if;
  if (select count(*) from public.isekai3d_questions where user_id = current_setting('s3.admin')::uuid and delivered_at is null) <> 4 then raise exception '관리자: 만든 것이 모두 남지 않음'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  if not (public.isekai3d_status('explore')->>'dev')::boolean then raise exception '관리자에게 시험 단추가 없음'; end if;
  r := public.isekai3d_question_take('explore');
  if r->'card'->>'text' <> 'b1' then raise exception '관리자 받기 1: %', r; end if;
  r := public.isekai3d_question_take('explore');
  if r->'card'->>'text' <> 'b2' then raise exception '관리자는 하루 한도 없이: %', r; end if;
  if (public.isekai3d_status('explore')->>'deliveredToday')::boolean then raise exception '관리자에게 오늘 받음'; end if;
  if jsonb_array_length(public.isekai3d_dev_questions(10)) <> 4 then raise exception '만든 질문 목록에 모두 있지 않음'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.student'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin perform public.isekai3d_dev_questions(10); raise exception '학생이 만든 질문 목록을 봄' using errcode = 'XX000';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 8) 나눔 칸과 남기기(20261019224510): 직업·단계·사건이 칸으로, 만든 AI·보낸 맥락, 30일 지난 것도 지우지 않음
set local role service_role;
do $$ declare r jsonb; q public.isekai3d_questions; begin
  r := public.isekai3d_questions_add(current_setting('s3.student')::uuid, 'career', 'career:doctor:2', '[{"text":"c1"}]'::jsonb, 'solar-pro4',
    '{"kind":"career","career":{"stage":{"key":"expert"},"branch":"외과"}}'::jsonb);
  select * into q from public.isekai3d_questions where user_id = current_setting('s3.student')::uuid and context_key = 'career:doctor:2';
  if q.career_id <> 'doctor' or q.career_level <> 2 or q.life_event is not null or q.model <> 'solar-pro4' or q.prompt_context->>'kind' <> 'career' then raise exception '근무 카드 나눔 칸: %', to_jsonb(q); end if;
  if q.career_stage <> 'expert' or q.career_branch <> '외과' then raise exception '단계·갈래 칸: %', to_jsonb(q); end if;
  r := public.isekai3d_questions_add(current_setting('s3.student')::uuid, 'life', 'life:childBorn', '[{"text":"l1","options":["1","2","3"]}]'::jsonb);
  if (select life_event from public.isekai3d_questions where user_id = current_setting('s3.student')::uuid and context_key = 'life:childBorn') <> 'childBorn' then raise exception '사건 칸'; end if;
  update public.isekai3d_questions set created_at = now() - interval '40 days' where user_id = current_setting('s3.student')::uuid and context_key = 'life:childBorn';
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('s3.student'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.isekai3d_question_take('life:childBorn');
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.isekai3d_questions where user_id = current_setting('s3.student')::uuid and context_key = 'life:childBorn' and delivered_at is null) then
    raise exception '30일 지난 질문을 지움(남겨야 함)';
  end if;
  if to_regprocedure('public.isekai3d_dev_reset()') is not null then raise exception '기록 지우기가 남아 있음'; end if;
end $$;
rollback;
