-- Every fixture and balance change is rolled back, including existing users.
begin;
select set_config('reward.owner',(select id::text from public.profiles where role='student' order by id limit 1),true);
select set_config('reward.other',(select id::text from public.profiles where role='student' and id::text<>current_setting('reward.owner') order by id limit 1),true);
select set_config('reward.admin',(select id::text from public.profiles where role='admin' limit 1),true);
delete from public.academy_chapters where user_id=current_setting('reward.owner')::uuid;
delete from public.academy_chapter_rewards where user_id=current_setting('reward.owner')::uuid;
delete from public.academy_user_stats where user_id=current_setting('reward.owner')::uuid;
insert into public.academy_chapters(user_id,step,revision) values(current_setting('reward.owner')::uuid,15,15);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('reward.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.academy_chapter_rewards where user_id=auth.uid()) then raise exception 'Incomplete chapter rewarded'; end if;
 -- Completion, receipt and wallet must roll back together.
 begin
   perform public.academy_chapter_write('next',15);
   raise exception 'Simulate transaction failure' using errcode='XX001';
 exception when sqlstate 'XX001' then null; end;
 if exists(select 1 from public.academy_chapter_rewards where user_id=auth.uid()) or exists(select 1 from public.academy_user_stats where user_id=auth.uid()) or (select step from public.academy_chapters where user_id=auth.uid() and chapter='first_star')<>15 then raise exception 'Reward not atomic'; end if;
 perform public.academy_chapter_write('next',15);
 if (select coins from public.academy_user_stats where user_id=auth.uid())<>150 then raise exception 'Missing initial wallet or 50 coins'; end if;
 perform public.academy_chapter_write('next',15);
 perform public.academy_chapter_write('next',16);
 perform public.academy_chapter_read();
 if (select coins from public.academy_user_stats where user_id=auth.uid())<>150 then raise exception 'Retry/read paid twice'; end if;
 begin insert into public.academy_chapter_rewards(user_id,chapter) values(auth.uid(),'forged'); raise exception 'Client minted reward' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin perform academy_private.award_chapter_completion(); raise exception 'Client invoked trigger' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.academy_chapters(user_id,chapter,step,revision) values(current_setting('reward.owner')::uuid,'library_questions',17,17);
set local role authenticated;
do $$ begin
 perform public.academy_library_chapter_write('next',17);
 perform public.academy_library_chapter_write('next',17);
 perform public.academy_library_chapter_write('start',0);
 if (select coins from public.academy_user_stats where user_id=auth.uid())<>200 or (select count(*) from public.academy_chapter_rewards where user_id=auth.uid())<>2 then raise exception 'Chapter II reward incorrect'; end if;
end $$;
reset role;
-- Replaying/backfilling a previously rewarded completion cannot mint again.
update public.academy_chapters set completed_at=completed_at where user_id=current_setting('reward.owner')::uuid;
delete from public.academy_chapters where user_id=current_setting('reward.owner')::uuid and chapter='library_questions';
insert into public.academy_chapters(user_id,chapter,step,revision,completed_at) values(current_setting('reward.owner')::uuid,'library_questions',18,18,now());
do $$ begin
 if (select coins from public.academy_user_stats where user_id=current_setting('reward.owner')::uuid)<>200 then raise exception 'Recreated bookmark rewarded twice'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('reward.other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.academy_chapter_rewards where user_id=current_setting('reward.owner')::uuid) then raise exception 'Other student receipts exposed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('reward.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.academy_chapter_write('next',15); raise exception 'Admin minted reward' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.academy_chapter_rewards; raise exception 'Anon read receipts' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: 50 per chapter, wallet creation, atomic rollback, retry/read/replay protection, owner privacy and client/admin restrictions (rolled back)' as result;
rollback;
