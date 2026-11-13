begin;
select set_config('academy.test_owner', (select p.id::text from public.profiles p join auth.users u on u.id=p.id where p.role='admin' limit 1), true);
select set_config('academy.test_other', (select id::text from auth.users where id::text <> current_setting('academy.test_owner') limit 1), true);
delete from public.academy_game_progress where user_id::text in (current_setting('academy.test_owner'), current_setting('academy.test_other'));
select set_config('request.jwt.claims', json_build_object('sub', current_setting('academy.test_owner'),'role','authenticated')::text, true);
set local role authenticated;
do $$
declare aid uuid;
begin
  insert into public.academy_game_progress(user_id,quest_step) values (auth.uid(),'accepted');
  if (select count(*) from public.academy_game_progress) <> 1 then raise exception 'owner read failed'; end if;
  begin
    update public.academy_game_progress set quest_step='completed', question=repeat('a',25) where user_id=auth.uid();
    raise exception 'stage skip allowed';
  exception when check_violation then null; end;
  select id into aid from public.activity limit 1;
  if aid is null then raise exception 'no readable fixture activity'; end if;
  update public.academy_game_progress set quest_step='read',activity_id=aid where user_id=auth.uid();
  begin
    update public.academy_game_progress set quest_step='ready',question='short' where user_id=auth.uid();
    raise exception 'short question allowed';
  exception when check_violation then null; end;
  update public.academy_game_progress set quest_step='ready',question=repeat('fixture ',4) where user_id=auth.uid();
  update public.academy_game_progress set quest_step='completed' where user_id=auth.uid();
  begin
    update public.academy_game_progress set quest_step='accepted' where user_id=auth.uid();
    raise exception 'reward replay allowed';
  exception when check_violation then null; end;
  begin
    insert into public.academy_game_progress(user_id,quest_step) values (current_setting('academy.test_other')::uuid,'accepted');
    raise exception 'cross owner insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.academy_game_progress where user_id=auth.uid();
    raise exception 'client delete allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('academy.test_other'),'role','authenticated')::text, true);
set local role authenticated;
do $$
declare n integer;
begin
  if exists(select 1 from public.academy_game_progress) then raise exception 'cross owner read leaked'; end if;
  update public.academy_game_progress set question=repeat('x',25) where user_id=current_setting('academy.test_owner')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'cross owner update allowed'; end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin perform * from public.academy_game_progress; raise exception 'anon read allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.academy_game_progress(user_id,quest_step) values (current_setting('academy.test_other')::uuid,'accepted'); raise exception 'anon insert allowed'; exception when insufficient_privilege then null; end;
  begin update public.academy_game_progress set question='x'; raise exception 'anon update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.academy_game_progress; raise exception 'anon delete allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: owner stages, question length, no skipping/replay, cross-account isolation, anon denial; all fixtures rolled back' as result;
rollback;
