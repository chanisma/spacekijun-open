begin;
select set_config('chapter.owner',(select p.id::text from public.profiles p join public.student_basic_info s on s.id=split_part(p.email,'@',1) where p.role='student' order by p.id limit 1),true);
select set_config('chapter.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('chapter.activity',(select id::text from public.activity where visibility='school' limit 1),true);
delete from public.academy_chapters where user_id=current_setting('chapter.owner')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('chapter.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.academy_library_chapter_write('start',0); raise exception 'Chapter II unlocked before I' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
insert into public.academy_chapters(user_id,chapter,step,revision,completed_at) values(current_setting('chapter.owner')::uuid,'first_star',16,16,now());
set local role authenticated;
do $$ declare c jsonb; i integer; begin
 if public.academy_chapter_read()->'library'<>'null'::jsonb then raise exception 'Read starts chapter'; end if;
 c:=public.academy_library_chapter_write('start',0);
 if c->>'step'<>'0' then raise exception 'Introduction missing'; end if;
 perform public.academy_library_chapter_write('next',0);
 c:=public.academy_library_chapter_write('next',0);
 if c->>'step'<>'1' then raise exception 'Retry advances twice'; end if;
 for i in 1..4 loop perform public.academy_library_chapter_write('next',i); end loop;
 begin perform public.academy_library_chapter_write('next',5); raise exception 'Travel skipped' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 perform public.academy_library_chapter_write('arrive',5);
 for i in 6..12 loop perform public.academy_library_chapter_write('next',i); end loop;
 begin perform public.academy_library_chapter_write('next',13); raise exception 'Reading skipped' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 begin perform public.academy_library_chapter_write('read',13,gen_random_uuid()); raise exception 'Unreadable activity accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
 perform public.academy_library_chapter_write('read',13,current_setting('chapter.activity')::uuid);
 begin perform public.academy_library_chapter_write('note',14,null,'질문만 씁니다. 이유가 없습니다.',''); raise exception 'Missing reason accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 perform public.academy_library_chapter_write('note',14,null,'조건이 바뀌면 관찰 결과는 어떻게 달라질까요?','일상에서 본 변화와 기록의 결과가 달라 더 알아보고 싶습니다.');
 for i in 15..17 loop c:=public.academy_library_chapter_write('next',i); end loop;
 if c->>'step'<>'18' or c->>'completed_at' is null then raise exception 'Chapter did not complete'; end if;
 if public.academy_chapter_read()->'chapter'->>'step'<>'16' then raise exception 'Chapter I bookmark overwritten'; end if;
 c:=public.academy_library_chapter_write('start',0);
 if c->>'step'<>'18' then raise exception 'Completion replay restarted progress'; end if;
 begin perform public.academy_chapter_read('different-student'); raise exception 'Other student exposed' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin update public.academy_chapters set step=0 where user_id=auth.uid(); raise exception 'Direct mutation allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- The existing side journey must accept the new chapter note without changing old tutorial records.
delete from public.academy_journeys where user_id=current_setting('chapter.owner')::uuid;
delete from public.academy_game_progress where user_id=current_setting('chapter.owner')::uuid;
set local role service_role;
do $$ declare result jsonb; begin
 result:=public.academy_journey_transition(current_setting('chapter.owner')::uuid,'start',0);
 if result->>'source_question' not like '%조건이 바뀌면%' then raise exception 'Journey did not use chapter note'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('chapter.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.academy_library_chapter_write('start',0); raise exception 'Admin writes as student' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
