# 쿨메신저 연동 알림 보관 정책

`notification_events.type = 'coolmessenger'`인 알림은 생성 시각(`created_at`)으로부터 달력 기준 한 달 동안 보관한다. 읽음 여부와 관계없이 기간이 지난 알림을 매시 정각에 삭제하므로 실제 삭제에는 최대 한 시간의 지연이 있다.

Supabase `pg_cron` 작업 `coolmessenger-notifications-monthly-retention`이 수행하며, 교직원 PC나 데스크 앱이 꺼져 있어도 실행된다. 다른 유형의 알림, 쿨메신저 원본 쪽지, `coolmsg_outbox` 답장 큐는 이 정책의 대상이 아니다. SPACEKIJUN 답장 알림(`direct_reply`, 2026-09-22부터 [답장]이 쿨메신저 대신 이 경로로 간다 — `docs/features/notification-reply.md`)도 대상이 아니며, 답장에 담긴 원문 인용은 사본이라 원래 쿨메신저 알림이 삭제돼도 남는다. `coolmsg_outbox` 는 2026-09-22 이후 화면이 쓰지 않는다.

적용 순서: `notification_events` 생성과 `created_at`/`type` 컬럼 이후 `20260911031500_coolmessenger_notification_retention.sql` 적용. 해당 유형의 생성 시각 부분 인덱스를 함께 생성한다. 예약 SQL은 DB 관리자 권한으로 실행되며 공개 RPC나 사용자 삭제 권한을 추가하지 않는다.

확인:
```sql
select jobname, schedule, active from cron.job
where jobname = 'coolmessenger-notifications-monthly-retention';
select count(*) from public.notification_events
where type = 'coolmessenger' and created_at < now() - interval '1 month';
```

중지: `select cron.unschedule('coolmessenger-notifications-monthly-retention');` 이미 삭제된 기록은 중지로 복구되지 않는다.

데스크 앱은 SPACEKIJUN 계정이 연결되면 자동 감시를 유지한다. Solar 요약과 알림 본문 포함은 개별 선택 사항이며 로컬 PC에 저장한다. 로그아웃하거나 앱을 완전히 종료하면 감시가 종료된다.

참고: [Supabase Cron 공식 문서](https://supabase.com/docs/guides/cron/quickstart).
