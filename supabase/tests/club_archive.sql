-- 동아리 P5(아카이브 연결) 시험 (2026-11-11) — 끝에서 rollback.
begin;
select set_config('ar.admin', (select p.id::text from public.profiles p join public.user_resource ur on ur.user_id = p.id
  join public.resource r on r.id = ur.resource_id and r.type in ('teacher', 'staff')
  where p.role = 'admin' and public.account_link_status(p.id) = 'linked' order by p.id limit 1), true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ar.admin'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; v_host uuid; v_club uuid; v_year uuid; v_before int; v_after int; v_past int;
begin
  r := public.club_host_candidates();
  if jsonb_array_length(r) < 10 then raise exception 'FAIL 후보 %', jsonb_array_length(r); end if;
  -- 제안이 있는 후보 하나를 잇는다
  select (x->>'host_id')::uuid, (x->'suggestion'->>'club_id')::uuid into v_host, v_club
  from jsonb_array_elements(r) x where x->'suggestion' is not null and x->'suggestion' <> 'null'::jsonb limit 1;
  if v_host is null then raise exception 'FAIL 제안 없음'; end if;
  select id into v_year from public.club_year where club_id = v_club and status = 'active' order by academic_year desc limit 1;
  select jsonb_array_length(public.club_activities(v_year)) into v_before;
  perform public.club_link_host(v_host, v_club);
  r := public.club_activities(v_year);
  v_after := jsonb_array_length(r);
  if v_after <= v_before then raise exception 'FAIL 이은 뒤 활동 % → %', v_before, v_after; end if;
  select count(*) into v_past from jsonb_array_elements(r) x where (x->>'this_year')::boolean is false;
  if v_past < 1 then raise exception 'FAIL 지난 해 구분'; end if;
  if jsonb_array_length(public.club_get(v_year)->'linked_hosts') < 1 then raise exception 'FAIL linked_hosts'; end if;
  perform public.club_link_host(v_host, null);
  if jsonb_array_length(public.club_activities(v_year)) <> v_before then raise exception 'FAIL 끊기'; end if;
end $$;
reset role;
select 'PASS club_archive' as result;
rollback;
