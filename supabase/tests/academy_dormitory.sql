begin;
select set_config('academy.owner',(select p.id::text from public.profiles p where role='student' and exists(select 1 from public.student_basic_info s where s.id=split_part(p.email,'@',1)) limit 1),true);
select set_config('academy.other',(select id::text from public.profiles where role='student' and id::text<>current_setting('academy.owner') limit 1),true);
select set_config('academy.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('academy.code',(select split_part(email,'@',1) from public.profiles where id=current_setting('academy.owner')::uuid),true);
delete from public.academy_user_items where user_id=current_setting('academy.owner')::uuid;
delete from public.academy_planning_rewards where user_id=current_setting('academy.owner')::uuid;
insert into public.academy_user_stats(user_id,coins) values(current_setting('academy.owner')::uuid,100) on conflict(user_id) do update set coins=100;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('academy.owner'),'role','authenticated')::text,true);
do $$ declare r jsonb; g jsonb; tid uuid; iid integer; lid integer; today date:=(now() at time zone 'Asia/Seoul')::date; begin
 g:=public.academy_dormitory_write('save_goal','{"title":"Test academy goal"}');
 r:=public.academy_dormitory_write('save_task',jsonb_build_object('title','Test academy plan','task_date',today,'start_time','09:00','end_time','10:00','related_goal_id',g->>'id'));
 tid:=(r->>'id')::uuid; perform set_config('academy.task',tid::text,true);
 if r->>'start_time'<>'09:00' then raise exception 'Schedule not persisted'; end if;
 begin
   perform public.academy_dormitory_write('save_task',jsonb_build_object('title','Invalid','task_date',today,'start_time','20:00','end_time','10:00'));
   raise exception 'Invalid time accepted' using errcode='XX000';
 exception when sqlstate 'P0001' then null; end;
 r:=public.academy_dormitory_write('complete',jsonb_build_object('id',tid,'completed',true));
 if (r->>'reward')::int<>5 then raise exception 'First daily reward missing'; end if;
 perform public.academy_dormitory_write('complete',jsonb_build_object('id',tid,'completed',false));
 r:=public.academy_dormitory_write('complete',jsonb_build_object('id',tid,'completed',true));
 if (r->>'reward')::int<>0 then raise exception 'Reward duplicated'; end if;
 select id into iid from public.academy_shop_items where academy_asset='ria-rose';
 select id into lid from public.academy_shop_items where academy_asset='luon-blue';
 perform public.academy_dormitory_write('purchase',jsonb_build_object('item_id',iid,'price',0,'user_id',current_setting('academy.other')));
 perform public.academy_dormitory_write('purchase',jsonb_build_object('item_id',iid));
 if (select coins from public.academy_user_stats where user_id=auth.uid())<>70 then raise exception 'Trusted price or idempotent purchase failed'; end if;
 if (select count(*) from public.academy_user_items where user_id=auth.uid() and item_id=iid)<>1 then raise exception 'Duplicate ownership'; end if;
 perform public.academy_dormitory_write('purchase',jsonb_build_object('item_id',lid));
 perform public.academy_dormitory_write('equip',jsonb_build_object('item_id',iid));
 perform public.academy_dormitory_write('equip',jsonb_build_object('item_id',lid));
 if (select count(*) from public.academy_user_items where user_id=auth.uid() and is_equipped)<>2 then raise exception 'Male/female equipment slots interfere'; end if;
 begin
  perform public.academy_dormitory_write('purchase',jsonb_build_object('item_id',(select id from public.academy_shop_items where academy_asset='dorm-rose')));
  raise exception 'Insufficient balance accepted' using errcode='XX000';
 exception when sqlstate 'P0001' then null; end;
 if (select coins from public.academy_user_stats where user_id=auth.uid())<>35 then raise exception 'Failed purchase changed wallet'; end if;
 begin update public.academy_user_stats set coins=999; raise exception 'Wallet forged' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin insert into public.academy_user_items(user_id,item_id,item_type) values(auth.uid(),iid,'accessory'); raise exception 'Inventory forged' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin perform public.academy_dormitory_read(today,current_setting('academy.code')); raise exception 'Student used preview' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('academy.other'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.academy_tasks where id=current_setting('academy.task')::uuid) then raise exception 'Foreign row exposed'; end if;
 begin perform public.academy_dormitory_write('complete',jsonb_build_object('id',current_setting('academy.task'))); raise exception 'Foreign plan changed' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('academy.admin'),'role','authenticated')::text,true);
do $$ declare r jsonb; begin
 r:=public.academy_dormitory_read((now() at time zone 'Asia/Seoul')::date,current_setting('academy.code'));
 if not exists(select 1 from jsonb_array_elements(r->'tasks') t where t->>'id'=current_setting('academy.task')) then raise exception 'Admin student preview missing'; end if;
 begin perform public.academy_dormitory_write('save_goal','{"title":"forged"}'); raise exception 'Admin preview wrote' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.academy_dormitory_read(current_date); raise exception 'Anonymous read allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
 begin perform public.academy_dormitory_write('save_goal','{}'); raise exception 'Anonymous write allowed' using errcode='XX000'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: plan scheduling, daily reward once, trusted atomic purchase, independent outfit slots, balance failure rollback, owner isolation, admin read-only preview, anon denied. All test changes rolled back.' as result;
rollback;
