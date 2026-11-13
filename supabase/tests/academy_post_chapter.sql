begin;
select set_config('post.owner',(select id::text from public.profiles where role='student' order by id limit 1),true);
select set_config('post.other',(select id::text from public.profiles where role='student' and id::text<>current_setting('post.owner') order by id limit 1),true);
select set_config('post.admin',(select id::text from public.profiles where role='admin' limit 1),true);
delete from public.academy_chapters where user_id=current_setting('post.owner')::uuid;
delete from public.academy_chapter_rewards where user_id=current_setting('post.owner')::uuid and chapter='post_first_letter';
insert into public.ai_news(id,url,source,title,published_at,keep,comic_path,summary,category) overriding system value values
 (-914001,'https://example.invalid/academy-test/illustrated','nature','TEST illustrated latest','2199-01-01',true,'test/comic.png','TEST article summary','연구성과'),
 (-914002,'https://example.invalid/academy-test/no-comic','nature','TEST newer without comic','2199-01-02',true,null,'TEST','연구성과'),
 (-914003,'https://example.invalid/academy-test/hidden','nature','TEST hidden','2199-01-03',false,'test/hidden.png','TEST','연구성과');
select set_config('request.jwt.claims',json_build_object('sub',current_setting('post.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.academy_post_chapter_write('start',0); raise exception 'IV unlocked before III' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
insert into public.academy_chapters(user_id,chapter,step,revision,completed_at) values
 (current_setting('post.owner')::uuid,'first_star',16,16,now()),
 (current_setting('post.owner')::uuid,'library_questions',18,18,now()),
 (current_setting('post.owner')::uuid,'dorm_first_plan',36,36,now());
select set_config('post.balance',(select coins::text from public.academy_user_stats where user_id=current_setting('post.owner')::uuid),true);
set local role authenticated;
do $$ declare c jsonb; i integer; begin
 c:=public.academy_post_chapter_write('start',0);
 if c->>'step'<>'0' then raise exception 'Missing morning'; end if;
 if public.academy_chapter_read()->'postLetter'->>'id'<>'-914001' then raise exception 'Must recommend latest kept comic, not latest plain/hidden article'; end if;
 perform public.academy_post_chapter_write('next',0);
 c:=public.academy_post_chapter_write('next',0);
 if c->>'step'<>'1' then raise exception 'Stale revision advanced'; end if;
 for i in 1..11 loop perform public.academy_post_chapter_write('next',i); end loop;
 begin perform public.academy_post_chapter_write('next',12); raise exception 'Travel skipped' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 perform public.academy_post_chapter_write('arrive',12);
 for i in 13..19 loop perform public.academy_post_chapter_write('next',i); end loop;
 begin perform public.academy_post_chapter_write('next',20); raise exception 'Read skipped' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 begin perform public.academy_post_chapter_write('read',20,-914002); raise exception 'Non-comic read accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 perform public.academy_post_chapter_write('read',20,-914001);
 perform public.academy_post_chapter_write('next',21);
 begin perform public.academy_post_chapter_write('note',22); raise exception 'Missing own note accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 insert into public.world_news_inquiries(user_id,news_id,question) values(auth.uid(),-914001,'');
 begin perform public.academy_post_chapter_write('note',22); raise exception 'Blank question accepted' using errcode='XX000'; exception when sqlstate 'P0001' then null; end;
 update public.world_news_inquiries set question='이 발견을 우리 동네에서 어떻게 확인할까?' where user_id=auth.uid() and news_id=-914001;
 if public.academy_chapter_read()->>'postNoteReady'<>'true' then raise exception 'Saved note recovery missing'; end if;
 c:=public.academy_post_chapter_write('note',22);
 if c->>'question'<>'이 발견을 우리 동네에서 어떻게 확인할까?' then raise exception 'Wrong question snapshot'; end if;
 for i in 23..29 loop c:=public.academy_post_chapter_write('next',i); end loop;
 if c->>'step'<>'30' or c->>'completed_at' is null then raise exception 'Completion failed'; end if;
 perform public.academy_post_chapter_write('next',30);
  if (select coins from public.academy_user_stats where user_id=auth.uid())<>current_setting('post.balance')::integer+50 then raise exception 'Incorrect or duplicate reward'; end if;
  delete from public.world_news_inquiries where user_id=auth.uid() and news_id=-914001;
  if exists(select 1 from public.world_news_inquiries where user_id=auth.uid() and news_id=-914001) then raise exception 'Own note deletion failed'; end if;
  if public.academy_chapter_read()->'post'->>'step'<>'30' then raise exception 'Note deletion reset completed chapter'; end if;
  if (select coins from public.academy_user_stats where user_id=auth.uid())<>current_setting('post.balance')::integer+50 then raise exception 'Note deletion changed reward'; end if;
  -- Leave one row to verify another student cannot delete it.
  insert into public.world_news_inquiries(user_id,news_id,question) values(auth.uid(),-914001,'본인의 새 질문');
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('post.other'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.academy_chapters where user_id=current_setting('post.owner')::uuid) then raise exception 'Foreign chapter leaked'; end if;
  if exists(select 1 from public.world_news_inquiries where user_id=current_setting('post.owner')::uuid) then raise exception 'Foreign notebook leaked'; end if;
  delete from public.world_news_inquiries where user_id=current_setting('post.owner')::uuid and news_id=-914001;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.world_news_inquiries where user_id=current_setting('post.owner')::uuid and news_id=-914001) then raise exception 'Foreign notebook deletion allowed'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('post.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 begin perform public.academy_post_chapter_write('start',0); raise exception 'Admin wrote chapter' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: Chapter IV prerequisite, latest illustrated public letter, read/note gates, own saved question, retry, 50 coins and permissions; rolled back' as result;
rollback;
