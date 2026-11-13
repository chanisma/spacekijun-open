-- 업무 작업실 메모(work_note) 시험 (2026-11-12) — 끝에서 rollback, 아무것도 남지 않는다.
-- 전제: 20261112100000_work_note.sql 적용(드라이런이면 같은 트랜잭션 안에서 먼저).
-- 판정: 책임자 쓰기·읽기 · 담당자 쓰기·읽기 · 남(같은 학교 교사)은 못 보고 못 쓴다 · 링크는 주소가 있어야
--      · 남의 메모를 담당자는 못 지우고 책임자는 지운다 · 업무를 옮길 수 없다 · 로그인 없으면 거절
begin;
-- 재료: 책임자(user) M · 그 업무 할 일의 담당자(책임자 아님) A · 둘 다 아닌 교사 O — 모두 명단에 연결된 계정
with w as (
  select w.id work_id, ur.user_id m_user
  from public.work w join public.user_resource ur on ur.resource_id = w.manager_id
  join public.profiles p on p.id = ur.user_id
  where p.role in ('teacher','admin') and public.account_link_status(p.id) = 'linked'
), a as (
  select t.event_id work_id, ur.user_id a_user
  from public.task t cross join lateral jsonb_array_elements(case when jsonb_typeof(t.meta->'assignees')='array' then t.meta->'assignees' else '[]' end) x(v)
  join public.user_resource ur on ur.resource_id::text = x.v->>'id'
  join public.profiles p on p.id = ur.user_id
  where p.role = 'teacher' and public.account_link_status(p.id) = 'linked'
)
select set_config('wn.work', w.work_id::text, true), set_config('wn.m', w.m_user::text, true), set_config('wn.a', a.a_user::text, true)
from w join a on a.work_id = w.work_id and a.a_user <> w.m_user
where not exists (select 1 from public.work x where x.id = w.work_id and x.created_by = a.a_user)
order by w.work_id limit 1;

select set_config('wn.o', (
  select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
  where p.role = 'teacher' and public.account_link_status(p.id) = 'linked'
    and p.id::text not in (current_setting('wn.m'), current_setting('wn.a'))
    and not exists (select 1 from public.work w where w.id = current_setting('wn.work')::uuid
                    and (w.created_by = p.id or w.manager_id = ur.resource_id or ur.resource_id::text = any(public.jsonb_person_ids(w.meta->'managers'))))
    and not exists (select 1 from public.task t cross join lateral jsonb_array_elements(case when jsonb_typeof(t.meta->'assignees')='array' then t.meta->'assignees' else '[]' end) x(v)
                    where t.event_id = current_setting('wn.work')::uuid and x.v->>'id' = ur.resource_id::text)
  order by p.id limit 1), true);
select set_config('wn.work2', (select id::text from public.work where id::text <> current_setting('wn.work') order by created_at limit 1), true);

do $$ begin
  if coalesce(current_setting('wn.work', true), '') = '' or coalesce(current_setting('wn.o', true), '') = '' then
    raise exception '시험 재료(책임자·담당자·남이 있는 업무)를 찾지 못함';
  end if;
end $$;

set local role authenticated;

-- ① 로그인 없음 → 쓰기 거절
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  insert into public.work_note (work_id, body) values (current_setting('wn.work')::uuid, '익명');
  raise exception 'FAIL ① 로그인 없이 썼다';
exception when insufficient_privilege or not_null_violation or check_violation then null;
end $$;

-- ② 책임자 M: 메모·링크 쓰기, 링크는 주소 필수
select set_config('request.jwt.claims', json_build_object('sub', current_setting('wn.m'), 'role', 'authenticated')::text, true);
do $$
declare v uuid;
begin
  insert into public.work_note (work_id, body) values (current_setting('wn.work')::uuid, '부스 번호는 당일 배정') returning id into v;
  perform set_config('wn.note_m', v::text, true);
  insert into public.work_note (work_id, kind, body, url) values (current_setting('wn.work')::uuid, 'link', '신청 웹앱', 'https://example.org/a');
  begin
    insert into public.work_note (work_id, kind, body) values (current_setting('wn.work')::uuid, 'link', '주소 없음');
    raise exception 'FAIL ② 주소 없는 링크';
  exception when check_violation then null;
  end;
  begin
    insert into public.work_note (work_id, kind, body, url) values (current_setting('wn.work')::uuid, 'link', 'js', 'javascript:alert(1)');
    raise exception 'FAIL ② http 가 아닌 주소';
  exception when check_violation then null;
  end;
end $$;

-- ③ 담당자 A: 읽고 쓴다 · 책임자 메모는 못 지운다(0행)
select set_config('request.jwt.claims', json_build_object('sub', current_setting('wn.a'), 'role', 'authenticated')::text, true);
do $$
declare n int; v uuid;
begin
  select count(*) into n from public.work_note where work_id = current_setting('wn.work')::uuid;
  if n <> 2 then raise exception 'FAIL ③ 담당자가 본 메모 % (2 기대)', n; end if;
  insert into public.work_note (work_id, body) values (current_setting('wn.work')::uuid, '시연 노트북 내가 가져감') returning id into v;
  perform set_config('wn.note_a', v::text, true);
  delete from public.work_note where id = current_setting('wn.note_m')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL ③ 담당자가 책임자 메모를 지웠다'; end if;
  -- 남이 쓴 것처럼 넣기 거절
  begin
    insert into public.work_note (work_id, body, created_by) values (current_setting('wn.work')::uuid, '사칭', current_setting('wn.m')::uuid);
    raise exception 'FAIL ③ 쓴 사람 사칭';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ④ 남 O: 못 보고 못 쓴다
select set_config('request.jwt.claims', json_build_object('sub', current_setting('wn.o'), 'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  select count(*) into n from public.work_note where work_id = current_setting('wn.work')::uuid;
  if n <> 0 then raise exception 'FAIL ④ 남이 메모 % 건을 봤다', n; end if;
  begin
    insert into public.work_note (work_id, body) values (current_setting('wn.work')::uuid, '끼어들기');
    raise exception 'FAIL ④ 남이 썼다';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ⑤ 책임자 M: 담당자 메모를 지운다 · 업무 옮기기 거절
select set_config('request.jwt.claims', json_build_object('sub', current_setting('wn.m'), 'role', 'authenticated')::text, true);
do $$
declare n int;
begin
  begin
    update public.work_note set work_id = current_setting('wn.work2')::uuid where id = current_setting('wn.note_m')::uuid;
    raise exception 'FAIL ⑤ 업무를 옮겼다';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  when insufficient_privilege then null;
  end;
  update public.work_note set body = '부스 번호 B-12' where id = current_setting('wn.note_m')::uuid;
  delete from public.work_note where id = current_setting('wn.note_a')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL ⑤ 책임자가 담당자 메모를 못 지웠다'; end if;
end $$;

reset role;
select 'work_note PASS' as result;
rollback;
