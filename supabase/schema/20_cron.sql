-- 정기 작업 (pg_cron). 00_baseline.sql · 10_seed.sql 다음에 적용.
-- 쓰지 않는 기능의 줄은 지워도 된다. pg_cron 확장을 먼저 켤 것(대시보드 › Database › Extensions).
-- 엣지 함수를 부르는 작업(*.wake* · dispatch_*)은 30_private_config.sql 의 주소·비밀값이 있어야 동작한다.

select cron.schedule('automation-tick',                    '* * * * *',    $$select automation_private.tick()$$);
select cron.schedule('classroom-link-sweep',               '*/5 * * * *',  $$select public.classroom_link_sweep()$$);
select cron.schedule('classroom-type-sweep',               '*/5 * * * *',  $$select public.classroom_type_sweep()$$);
select cron.schedule('academy-generation-worker',          '15 seconds',   $$select academy_private.wake_generation_worker()$$);
select cron.schedule('contest-academy-generation-worker',  '15 seconds',   $$select contest_private.wake_generation_worker()$$);
select cron.schedule('invest-quotes',                      '*/10 * * * *', $$select invest_private.wake()$$);
select cron.schedule('tama-focus-invites',                 '*/5 * * * *',  $$select tama_private.dispatch_focus_invites()$$);
select cron.schedule('tama-pet-calls',                     '*/5 * * * *',  $$select tama_private.dispatch_calls()$$);
select cron.schedule('world-news-picks',                   '40 22 * * *',  $$select world_news_private.dispatch_picks()$$);
select cron.schedule('world-news-tag',                     '30 * * * *',   $$select world_news_private.wake_tagger()$$);
select cron.schedule('desk-message-images-7d',             '7 * * * *',    $$delete from public.desk_message_images where created_at < now() - interval '7 days'$$);
select cron.schedule('coolmessenger-notifications-monthly-retention', '0 * * * *',
  $$delete from public.notification_events where type = 'coolmessenger' and created_at < now() - interval '1 month'$$);
