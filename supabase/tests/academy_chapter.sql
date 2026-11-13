begin;
select set_config('chapter.owner',(select p.id::text from public.profiles p join public.student_basic_info s on s.id=split_part(p.email,'@',1) where p.role='student' order by p.id limit 1),true);
select set_config('chapter.other',(select p.id::text from public.profiles p join public.student_basic_info s on s.id=split_part(p.email,'@',1) where p.role='student' and p.id::text<>current_setting('chapter.owner') order by p.id limit 1),true);
select set_config('chapter.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('chapter.code',(select split_part(email,'@',1) from public.profiles where id=current_setting('chapter.owner')::uuid),true);
delete from public.academy_chapters where user_id in (current_setting('chapter.owner')::uuid,current_setting('chapter.other')::uuid);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('chapter.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare c jsonb; i integer; begin
 if public.academy_chapter_read()->'chapter'<>'null'::jsonb then raise exception 'Read created progress'; end if;
 c:=public.academy_chapter_write('next',0);
 if c->>'step'<>'1' then raise exception 'Intro failed'; end if;
 c:=public.academy_chapter_write('next',0);
 if c->>'step'<>'1' then raise exception 'Retry advanced twice'; end if;
 perform public.academy_chapter_write('next',1);
 begin perform public.academy_chapter_write('next',2); raise exception 'Skipped travel' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 perform public.academy_chapter_write('arrive',2);
 for i in 3..5 loop perform public.academy_chapter_write('next',i); end loop;
 begin perform public.academy_chapter_write('next',6); raise exception 'Skipped telescope' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 perform public.academy_chapter_write('observe',6,null,false);
 for i in 7..9 loop perform public.academy_chapter_write('next',i); end loop;
 perform public.academy_chapter_write('desk',10);
 begin perform public.academy_chapter_write('next',11); raise exception 'Skipped design' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 begin perform public.academy_chapter_write('design',11,gen_random_uuid()); raise exception 'Nonexistent design accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 begin insert into public.academy_chapters(user_id) values(auth.uid()); raise exception 'Direct client write accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin perform public.academy_chapter_read('other-code'); raise exception 'Cross-student read accepted' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('chapter.design',gen_random_uuid()::text,true);
insert into public.student_inquiry_designs(id,student_id,title,target_kind,target_name,academic_year,grade,status,student_rationale,created_at)
values(current_setting('chapter.design')::uuid,(select split_part(email,'@',1) from public.profiles where id=current_setting('chapter.other')::uuid),'Chapter fixture','subject','과학',2026,3,'saved','스스로 관측해서 비교해 보고 싶은 탐구입니다.',now());
set local role authenticated;
do $$ begin
 begin perform public.academy_chapter_write('design',11,current_setting('chapter.design')::uuid); raise exception 'Other student design accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
update public.student_inquiry_designs set student_id=current_setting('chapter.code'),status='draft' where id=current_setting('chapter.design')::uuid;
set local role authenticated;
do $$ begin
 begin perform public.academy_chapter_write('design',11,current_setting('chapter.design')::uuid); raise exception 'Draft accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
update public.student_inquiry_designs set status='saved',created_at=now()-interval '1 day' where id=current_setting('chapter.design')::uuid;
set local role authenticated;
do $$ begin
 begin perform public.academy_chapter_write('design',11,current_setting('chapter.design')::uuid); raise exception 'Pre-chapter design accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
update public.student_inquiry_designs set created_at=now() where id=current_setting('chapter.design')::uuid;
set local role authenticated;
do $$ declare c jsonb; i integer; begin
 if not exists(select 1 from jsonb_array_elements(public.academy_chapter_read()->'designs') d where d->>'id'=current_setting('chapter.design')) then raise exception 'Saved design recovery missing'; end if;
 c:=public.academy_chapter_write('design',11,current_setting('chapter.design')::uuid);
 if c->>'step'<>'12' or c->>'design_title'<>'Chapter fixture' then raise exception 'Design did not unlock celebration'; end if;
 for i in 12..15 loop c:=public.academy_chapter_write('next',i); end loop;
 if c->>'step'<>'16' or c->>'completed_at' is null then raise exception 'Completion not saved'; end if;
 c:=public.academy_chapter_write('next',16);
 if c->>'revision'<>'16' then raise exception 'Completed chapter changed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('chapter.other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.academy_chapters where user_id=current_setting('chapter.owner')::uuid) then raise exception 'Progress leaked'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('chapter.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.academy_chapter_read(current_setting('chapter.code'))->'chapter'->>'step'<>'16' then raise exception 'Admin preview failed'; end if;
 begin perform public.academy_chapter_write('next',0); raise exception 'Admin wrote chapter' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.academy_chapter_read(); raise exception 'Anon read' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: first chapter ordered story/action transitions, retry bookmark, own newly confirmed design gate, saved-design recovery, completion, privacy and admin read-only (rolled back)' as result;
rollback;
