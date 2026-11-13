-- 다마고찌 새 종 · 창고 · 유학 · 통신 (2026-10-26) 역할 시험 — 끝에서 rollback, 아무것도 남지 않는다.
-- 학생 둘(별빛 친구)로: 통신 신청 → 받기 → 첫 통신이면 둘 다 알 표 · 두 번째는 알 없음 · 2분 지나면 만료 · 남의 통신은 못 받음 ·
-- 칸이 없으면 알 표를 못 깨움 → 창고로 보내기(10코인 · 원장 한 줄) → 깨우기(전파 가족 알) · 창고 → 칸(자리 없으면 거절) ·
-- 유학(기념 기록 study_abroad · 앨범 abroad · 펫 행 삭제) · 잠긴 종·통신 종 알 받기 거절 · 종은 저장으로 바뀌지 않음 · anon 거절
begin;
select set_config('tt.a', (select p.id::text from public.profiles p where p.role = 'student' order by p.id limit 1), true);
select set_config('tt.b', (select p.id::text from public.profiles p where p.role = 'student' order by p.id offset 1 limit 1), true);

-- 바탕(관리 신원): 두 사람의 펫·통신·표를 비우고 친구로 · 부화한 펫 하나씩 · A 에게 코인
delete from public.tama_link where from_user in (current_setting('tt.a')::uuid, current_setting('tt.b')::uuid) or to_user in (current_setting('tt.a')::uuid, current_setting('tt.b')::uuid);
delete from public.tama_egg_ticket where owner in (current_setting('tt.a')::uuid, current_setting('tt.b')::uuid);
delete from public.tama_pet where owner in (current_setting('tt.a')::uuid, current_setting('tt.b')::uuid);
delete from public.tama_wallet where owner in (current_setting('tt.a')::uuid, current_setting('tt.b')::uuid);
delete from public.academy_friendships where least(requester_id, addressee_id) = least(current_setting('tt.a')::uuid, current_setting('tt.b')::uuid)
  and greatest(requester_id, addressee_id) = greatest(current_setting('tt.a')::uuid, current_setting('tt.b')::uuid);
insert into public.academy_friendships(requester_id, addressee_id, status, responded_at) values (current_setting('tt.a')::uuid, current_setting('tt.b')::uuid, 'accepted', now());
select set_config('tt.tick', floor(extract(epoch from now()) * 1000 / 300000)::bigint::text, true);
insert into public.tama_pet(owner, name, state) select o, '시험',
  jsonb_build_object('v', 1, 'name', '시험', 'seed', 1, 'tick', current_setting('tt.tick')::bigint, 'bornTick', current_setting('tt.tick')::bigint - 50,
    'hatchTick', current_setting('tt.tick')::bigint - 40, 'stage', 'child', 'stageTick', current_setting('tt.tick')::bigint - 20,
    'hunger', 300, 'happy', 300, 'weight', 10, 'poop', 0, 'poopClock', 30, 'dirtyTicks', 0, 'starvingTicks', 0, 'sick', false, 'dosesLeft', 0,
    'lightsOn', true, 'asleep', false, 'attention', null, 'careMisses', 0, 'lastPatTick', -1, 'events', '[]'::jsonb, 'caredTicks', 40)
  from unnest(array[current_setting('tt.a')::uuid, current_setting('tt.b')::uuid]) o;
insert into public.academy_user_stats(user_id) values (current_setting('tt.a')::uuid) on conflict (user_id) do nothing;
update public.academy_user_stats set coins = 100 where user_id = current_setting('tt.a')::uuid;

-- A: 통신 신청
select set_config('request.jwt.claims', json_build_object('sub', current_setting('tt.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.tama_link_write('offer', jsonb_build_object('friend', current_setting('tt.b')));
  perform set_config('tt.l1', r->>'id', true);
  begin perform public.tama_link_write('accept', jsonb_build_object('id', r->>'id')); raise exception 'A 가 자기 신청을 받음';
  exception when sqlstate '42501' then null; end;
end $$;

-- B: realtime 이 쓰는 SELECT 로 보이고, 받으면 첫 통신
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('tt.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; n int; begin
  select count(*) into n from public.tama_link where id = current_setting('tt.l1')::uuid;
  if n <> 1 then raise exception 'B 에게 신청이 안 보임'; end if;
  r := public.tama_link_write('accept', jsonb_build_object('id', current_setting('tt.l1')));
  if r->>'status' <> 'accepted' or not (r->>'first_contact')::boolean then raise exception '첫 통신: %', r; end if;
  r := public.tama_species_read();
  if jsonb_array_length(r->'tickets') <> 1 or r->'tickets'->0->>'species' <> 'signal' then raise exception 'B 알 표: %', r; end if;
  -- 두 번째 통신(B → A)은 알이 없다
  r := public.tama_link_write('offer', jsonb_build_object('friend', current_setting('tt.a')));
  perform set_config('tt.l2', r->>'id', true);
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('tt.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := public.tama_link_write('accept', jsonb_build_object('id', current_setting('tt.l2')));
  if r->>'status' <> 'accepted' or (r->>'first_contact')::boolean then raise exception '두 번째 통신: %', r; end if;
  r := public.tama_species_read();
  if jsonb_array_length(r->'tickets') <> 1 then raise exception 'A 알 표는 하나: %', r; end if;
  if (r->'storage'->>'size')::int <> 6 or (r->'storage'->>'used')::int <> 1 or (r->'storage'->>'move_price')::int <> 10 then raise exception '창고: %', r; end if;
  if (r->'unlocked'->>'tide')::boolean or (r->'unlocked'->>'moon')::boolean or (r->'unlocked'->>'sprout')::boolean then raise exception '해금되면 안 됨: %', r; end if;
  if (public.tama_link_read()->>'partners')::int <> 1 then raise exception '통신한 친구 수'; end if;
  perform set_config('tt.ticket', r->'tickets'->0->>'id', true);
end $$;

-- 2분 지난 신청은 만료(관리 신원으로 시각을 당긴다)
reset role;
insert into public.tama_link(from_user, to_user, created_at) values (current_setting('tt.b')::uuid, current_setting('tt.a')::uuid, now() - interval '3 minutes');
select set_config('tt.l3', (select id::text from public.tama_link where from_user = current_setting('tt.b')::uuid and status = 'pending'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('tt.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; egg jsonb; old_id uuid; begin
  r := public.tama_link_write('accept', jsonb_build_object('id', current_setting('tt.l3')));
  if r->>'status' <> 'expired' then raise exception '만료를 못 막음: %', r; end if;

  egg := jsonb_build_object('v', 1, 'name', '삐리', 'seed', 7, 'tick', current_setting('tt.tick')::bigint, 'bornTick', current_setting('tt.tick')::bigint,
    'hatchTick', current_setting('tt.tick')::bigint + 1, 'stage', 'egg', 'stageTick', current_setting('tt.tick')::bigint,
    'hunger', 400, 'happy', 400, 'weight', 0, 'poop', 0, 'poopClock', 30, 'dirtyTicks', 0, 'starvingTicks', 0, 'sick', false, 'dosesLeft', 0,
    'lightsOn', true, 'asleep', false, 'attention', null, 'careMisses', 0, 'lastPatTick', -1, 'events', '[]'::jsonb, 'species', 'signal');
  -- 칸(1)이 차 있어 못 깨운다
  begin perform public.tama_ticket_hatch(current_setting('tt.ticket')::uuid, '삐리', egg); raise exception '자리 없이 깨움';
  exception when sqlstate '23505' then null; end;
  -- 알 받기로 통신 종·잠긴 종은 못 받는다
  begin perform public.tama_pet_adopt('삐리', egg); raise exception '통신 종을 알 받기로 받음';
  exception when others then if sqlerrm not like '%통신%' then raise; end if; end;
  begin perform public.tama_pet_adopt('몽', egg || '{"species":"tide"}'); raise exception '잠긴 종을 받음';
  exception when others then if sqlerrm not like '%아직 만날 수 없는%' then raise; end if; end;

  -- 함께하는 펫을 창고로(10코인) → 깨우기
  select id into old_id from public.tama_pet where owner = current_setting('tt.a')::uuid and is_primary;
  perform set_config('tt.old', old_id::text, true);
  r := public.tama_storage_write('store', jsonb_build_object('pet_id', old_id));
  if (r->>'price')::int <> 10 or (r->>'coins')::int <> 90 then raise exception '창고 값: %', r; end if;
  r := public.tama_ticket_hatch(current_setting('tt.ticket')::uuid, '삐리', egg);
  if r->'pet'->'state'->>'species' <> 'signal' or not (r->'pet'->>'is_primary')::boolean then raise exception '깨우기: %', r; end if;
  begin perform public.tama_ticket_hatch(current_setting('tt.ticket')::uuid, '삐리', egg); raise exception '같은 알 표를 두 번 깨움';
  exception when others then if sqlerrm not like '%이미 깨운%' then raise; end if; end;
  -- 칸이 찼으니 창고에서 못 꺼낸다
  begin perform public.tama_storage_write('unstore', jsonb_build_object('pet_id', old_id, 'state',
      (select state from public.tama_pet where id = old_id))); raise exception '자리 없이 꺼냄';
  exception when sqlstate '23505' then null; end;
  -- 창고의 펫을 유학 보낸다
  r := public.tama_storage_write('abroad', jsonb_build_object('pet_id', old_id));
end $$;

reset role;
do $$ begin
  if (select count(*) from public.wallet_ledger where user_id = current_setting('tt.a')::uuid and kind = 'tama_storage' and delta = -10) <> 1 then raise exception '원장 한 줄이 아님'; end if;
  if exists (select 1 from public.tama_pet where id = current_setting('tt.old')::uuid) then raise exception '유학 보낸 펫이 남음'; end if;
  if not exists (select 1 from public.tama_pet_memorial where pet_id = current_setting('tt.old')::uuid and death_cause = 'study_abroad' and ticks = 40) then raise exception '기념 기록 없음'; end if;
  if not exists (select 1 from public.tama_album where owner = current_setting('tt.a')::uuid and kind = 'abroad') then raise exception '앨범 abroad 없음'; end if;
  if not exists (select 1 from public.tama_album where owner = current_setting('tt.a')::uuid and kind = 'adopt' and species = 'signal') then raise exception '앨범 종 칸이 안 채워짐'; end if;
  -- 종은 저장으로 바뀌지 않는다
  update public.tama_pet set state = jsonb_set(state, '{species}', '"moon"') where owner = current_setting('tt.a')::uuid and is_primary;
  if (select state->>'species' from public.tama_pet where owner = current_setting('tt.a')::uuid and is_primary) <> 'signal' then raise exception '종이 바뀜'; end if;
  update public.tama_pet set state = state - 'species' where owner = current_setting('tt.a')::uuid and is_primary;
  if (select state->>'species' from public.tama_pet where owner = current_setting('tt.a')::uuid and is_primary) is distinct from 'signal' then raise exception '종 키가 지워짐'; end if;
end $$;

-- 표 직접 쓰기 · anon
set local role authenticated;
do $$ begin
  begin insert into public.tama_egg_ticket(owner, species, source) values (current_setting('tt.a')::uuid, 'signal', 'link'); raise exception '알 표를 직접 씀';
  exception when insufficient_privilege then null; end;
  begin insert into public.tama_link(from_user, to_user) values (current_setting('tt.a')::uuid, current_setting('tt.b')::uuid); raise exception '통신을 직접 씀';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.tama_link_read(); raise exception 'anon 이 읽음';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select '통과' as result;
rollback;
