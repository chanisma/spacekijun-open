-- Run as the migration owner. All fixtures and changes roll back.
begin;
do $$
#variable_conflict use_variable
declare
  users uuid[] := '{}'; actors uuid[] := '{}'; candidate record;
  event_id uuid; task_id uuid; submission_id uuid; stamp timestamptz; n integer; value jsonb;
  cols jsonb := '[{"key":"subject","label":"과목"},{"key":"count","label":"수량"}]';
begin
  for candidate in select distinct user_id from public.user_resource loop
    perform set_config('request.jwt.claim.sub', candidate.user_id::text, true);
    if not public.is_admin() and public.current_actor_resource_id() is not null
      and not public.current_actor_resource_id() = any(actors) then
      users := array_append(users, candidate.user_id); actors := array_append(actors, public.current_actor_resource_id());
    end if;
    exit when cardinality(users) = 4;
  end loop;
  if cardinality(users) < 4 then raise exception 'Four non-admin linked users required for RLS regression'; end if;
  insert into public.event(name, manager_id) values ('[ROLLBACK TEST] Spreadsheet', actors[1]) returning id into event_id;
  insert into public.task(event_id,title,type,meta) values (event_id,'[ROLLBACK TEST] Spreadsheet','one_time',
    jsonb_build_object('units',null,'deadlines',null,'assignees', jsonb_build_array(jsonb_build_object('id',actors[2],'status','pending'),jsonb_build_object('id',actors[3],'status','pending')),
      'submission',jsonb_build_object('required',true,'mode','spreadsheet','visibility','own','columns',cols))) returning id into task_id;
  perform set_config('request.jwt.claim.sub', users[2]::text, true);
  set local role authenticated;
  value := public.submit_task_spreadsheet_submission(task_id, '[ ["국어","001"], ["수학","2"] ]', cols);
  submission_id := (value->>'submission_id')::uuid;
  select created_at into stamp from public.task_submission where id = submission_id;
  if stamp is null then raise exception 'Own submission unreadable'; end if;
  if not exists (select 1 from public.task t, jsonb_array_elements(t.meta->'assignees') a where t.id = task_id and a->>'id' = actors[2]::text and a->>'status'='completed') then raise exception 'Submission did not complete assignee'; end if;
  begin perform public.submit_task_spreadsheet_submission(task_id,'[["bad"]]',cols); raise exception 'Wrong dimensions accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.submit_task_spreadsheet_submission(task_id,'[[""," "]]',cols); raise exception 'Empty row accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.submit_task_spreadsheet_submission(task_id,'[["a","b"]]',cols); raise exception 'Stale write accepted'; exception when serialization_failure then null; end;
  perform public.submit_task_spreadsheet_submission(task_id,'[["수정","3"]]',cols,null,stamp);
  select count(*) into n from public.task_submission s where s.task_id = task_id;
  if n <> 1 then raise exception 'Resubmission duplicated'; end if;
  begin perform public.submit_task_submission(task_id,'bad.txt','https://example.test/file'); raise exception 'File accepted for spreadsheet task'; exception when invalid_parameter_value then null; end;
  begin delete from public.task_submission where id = submission_id; raise exception 'Direct delete bypass accepted'; exception when insufficient_privilege then null; end;
  perform public.report_task_assignment_issue(task_id,'잘못 배정된 업무');
  if not exists (select 1 from public.task t where t.id=task_id and t.meta->'assignmentIssues'->actors[2]::text->>'reason'='잘못 배정된 업무') then raise exception 'Assignment report missing'; end if;
  perform public.report_task_assignment_issue(task_id,null);
  perform set_config('request.jwt.claim.sub', users[3]::text, true);
  select count(*) into n from public.task_submission s where s.task_id = task_id;
  if n <> 0 then raise exception 'Private submission leaked'; end if;
  reset role;
  update public.task t set meta=jsonb_set(meta,'{submission,visibility}','"all"') where t.id=task_id;
  set local role authenticated;
  select count(*) into n from public.task_submission s where s.task_id = task_id;
  if n <> 1 then raise exception 'Shared submission unreadable by assignee'; end if;
  begin perform public.delete_task_submission(submission_id); raise exception 'Peer deleted submission'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', users[4]::text, true);
  select count(*) into n from public.task_submission s where s.task_id=task_id;
  if n <> 0 then raise exception 'Shared submission leaked to outsider'; end if;
  begin perform public.submit_task_spreadsheet_submission(task_id,'[["a","b"]]',cols); raise exception 'Outsider submitted'; exception when insufficient_privilege then null; end;
  begin perform public.report_task_assignment_issue(task_id,'invalid'); raise exception 'Outsider reported assignment'; exception when insufficient_privilege then null; end;
  reset role;
  begin update public.task t set meta=jsonb_set(meta,'{submission,columns}','[{"key":"new","label":"새 컬럼"}]') where t.id=task_id; raise exception 'Existing schema changed'; exception when invalid_parameter_value then null; end;
  begin update public.task t set meta=jsonb_set(meta,'{submission,mode}','"file"') where t.id=task_id; raise exception 'Existing mode changed'; exception when invalid_parameter_value then null; end;
  update public.task t set meta=jsonb_set(meta,'{submission,visibility}','"own"') where t.id=task_id;
  perform set_config('request.jwt.claim.sub',users[1]::text,true);
  set local role authenticated;
  select count(*) into n from public.task_submission s where s.task_id=task_id;
  if n <> 1 then raise exception 'Manager cannot read private submission'; end if;
  perform public.delete_task_submission(submission_id);
  if not exists (select 1 from public.task t, jsonb_array_elements(t.meta->'assignees') a where t.id=task_id and a->>'id'=actors[2]::text and a->>'status'='pending') then raise exception 'Withdrawal did not reset assignee'; end if;
  reset role;
  -- Unit tasks require a real unit and update only its progress.
  update public.task t set meta = jsonb_set(meta,'{units}','[{"key":"unit1","label":"1학년"},{"key":"unit2","label":"2학년"}]') where t.id=task_id;
  perform set_config('request.jwt.claim.sub',users[2]::text,true);
  set local role authenticated;
  begin perform public.submit_task_spreadsheet_submission(task_id,'[["a","b"]]',cols); raise exception 'Missing unit accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.submit_task_spreadsheet_submission(task_id,'[["a","b"]]',cols,'unknown'); raise exception 'Unknown unit accepted'; exception when invalid_parameter_value then null; end;
  value := public.submit_task_spreadsheet_submission(task_id,'[["1학년","2"]]',cols,'unit1');
  submission_id := (value->>'submission_id')::uuid;
  if not exists (select 1 from public.task t where t.id=task_id and t.meta->'unitProgress'->'unit1'->actors[2]::text->>'status'='completed') then raise exception 'Unit completion missing'; end if;
  perform public.delete_task_submission(submission_id);
  if not exists (select 1 from public.task t where t.id=task_id and t.meta->'unitProgress'->'unit1'->actors[2]::text->>'status'='pending') then raise exception 'Unit withdrawal missing'; end if;
  reset role;
end;
$$;
rollback;
