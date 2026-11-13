begin;
select set_config('academy.test_owner', (select p.id::text from public.profiles p where p.role = 'student' limit 1), true);
select set_config('academy.test_other', (select p.id::text from public.profiles p where p.role = 'student' and p.id::text <> current_setting('academy.test_owner') limit 1), true);
select set_config('academy.test_admin', (select p.id::text from public.profiles p where p.role = 'admin' limit 1), true);
do $$ begin
  if nullif(current_setting('academy.test_owner'),'') is null or nullif(current_setting('academy.test_other'),'') is null or nullif(current_setting('academy.test_admin'),'') is null then raise exception 'Student and admin fixtures required'; end if;
end $$;
delete from public.academy_prologues where user_id in (current_setting('academy.test_owner')::uuid, current_setting('academy.test_other')::uuid);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('academy.test_owner'),'role','authenticated')::text, true);
do $$ declare r jsonb; done_at text; begin
  if exists(select 1 from public.academy_prologues) then raise exception 'First read created a bookmark or exposed another owner'; end if;
  r := public.save_academy_prologue(4);
  if (r->>'scene_index')::int <> 4 or r->>'completed_at' is not null then raise exception 'Bookmark resume failed'; end if;
  r := public.save_academy_prologue(2);
  if (r->>'scene_index')::int <> 4 then raise exception 'Late page moved bookmark backwards'; end if;
  begin perform public.save_academy_prologue(4,'completed'); raise exception 'Early completion accepted' using errcode='XX000'; exception when sqlstate '22023' then null; end;
  begin perform public.save_academy_prologue(31); raise exception 'Invalid page accepted' using errcode='XX000'; exception when sqlstate '22023' then null; end;
  r := public.save_academy_prologue(30,'completed'); done_at := r->>'completed_at';
  r := public.save_academy_prologue(3,'skipped');
  if r->>'completed_at' <> done_at or (r->>'skipped')::boolean or (r->>'scene_index')::int <> 30 then raise exception 'Late write replaced completion'; end if;
  begin insert into public.academy_prologues(user_id) values(current_setting('academy.test_other')::uuid); raise exception 'Foreign insert accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin update public.academy_prologues set user_id=current_setting('academy.test_other')::uuid; raise exception 'Owner transfer accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin delete from public.academy_prologues; raise exception 'Client delete accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('academy.test_other'),'role','authenticated')::text, true);
do $$ declare r jsonb; begin
  if exists(select 1 from public.academy_prologues) then raise exception 'Other owner can read bookmark'; end if;
  update public.academy_prologues set scene_index=0 where user_id=current_setting('academy.test_owner')::uuid;
  if found then raise exception 'Other owner can update bookmark'; end if;
  r := public.save_academy_prologue(0,'skipped');
  if r->>'completed_at' is null or not (r->>'skipped')::boolean then raise exception 'Explicit skip not persisted'; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub',current_setting('academy.test_admin'),'role','authenticated')::text, true);
do $$ begin
  if exists(select 1 from public.academy_prologues where user_id=current_setting('academy.test_owner')::uuid) then raise exception 'Preview read exposed student bookmark'; end if;
  begin perform public.save_academy_prologue(0); raise exception 'Admin preview could write' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin insert into public.academy_prologues(user_id) values(current_setting('academy.test_admin')::uuid); raise exception 'Admin direct insert accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform * from public.academy_prologues; raise exception 'Anonymous read accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
  begin perform public.save_academy_prologue(0); raise exception 'Anonymous RPC accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: prologue bookmark, monotonic resume, completion/skip, owner isolation, student-only writes and anonymous denial; rolled back' as result;
rollback;
