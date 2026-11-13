// 할 일 마감 알림 회귀 — npx tsx scripts/task-deadline-notice-test/run.mts
//
// 이 기능은 **안 보내도 오류가 나지 않는다**. 실제로 만드는 동안 세 번 조용히 틀렸다 —
//   ① `jsonb_typeof(...) <> 'array'` 가 NULL 이라 **단일 마감 할 일 전체**가 빠졌다(가장 흔한 경우)
//   ② `due_date` 가 timestamptz 라 회차(date)와 타입이 갈려 D-n 계산이 깨질 자리였다
//   ③ `priority = 'normal'` 이 CHECK 위반(허용값은 low|medium|high)
// 셋 다 «알림이 안 온다»로만 드러나므로 정적 검사가 방어선이다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getNotificationDestination } from '../../src/components/notifications/notificationNavigation';
import { notificationEventCatalog } from '../../src/components/admin/notificationEventCatalog';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const sql = src('supabase/migrations/20260924180000_task_deadline_notice.sql');

// ── SQL: 조용히 틀리는 세 자리 ─────────────────────────────────────────────
{
  ok(
    /coalesce\(jsonb_typeof\(l\.meta->'deadlines'\), ''\) <> 'array'/.test(sql),
    "단일 마감 경로가 coalesce 를 쓴다(NULL <> 'array' 는 false 가 아니라 NULL)"
  );
  ok(
    /l\.due_date::date between current_date and current_date \+ 3/.test(sql),
    'due_date 를 date 로 못 박는다(timestamptz 와 date 가 섞이면 D-n 이 interval 이 된다)'
  );
  ok(/select l\.task_id, l\.title, l\.event_id, l\.meta, l\.due_date::date/.test(sql), '회차 컬럼 타입도 date');
  ok(!/'normal'\s*,/.test(sql), "priority 에 'normal' 을 쓰지 않는다(CHECK 는 low|medium|high)");
  ok(/then 'high' else 'medium' end/.test(sql), '허용되는 값만 쓴다');
}

// ── SQL: 보내면 안 되는 대상 ───────────────────────────────────────────────
{
  ok(
    /coalesce\(t\.status, ''\) not in \('completed', 'cancelled'\)/.test(sql),
    '끝난 할 일에는 보내지 않는다'
  );
  ok(
    /coalesce\(w\.status, ''\) not in \('completed', 'cancelled'\)/.test(sql),
    '끝난 업무의 할 일에도 보내지 않는다'
  );
  ok(
    /coalesce\(a\.value->>'status', 'pending'\) not in \('completed', 'cancelled'\)/.test(sql),
    '이미 끝낸 담당자에게는 보내지 않는다'
  );
  // 담당자 상태는 «모든 회차» 를 끝내야 completed 다 — 그것만 보면 끝낸 회차에도 알림이 간다
  ok(
    /deadlineProgress'->\(r\.deadline::text\)->\(a\.value->>'id'\)->>'status'/.test(sql),
    '다중 마감은 그 회차를 끝냈는지 따로 본다'
  );
  ok(
    /where not exists \([\s\S]{0,200}g\.task_id = s\.task_id and g\.deadline = s\.deadline and g\.resource_id = m\.resource_id/.test(sql),
    '매니저이면서 담당자인 사람에게 두 번 보내지 않는다'
  );
}

// ── SQL: 중복 발송을 «표» 가 아니라 인덱스가 막는다 ────────────────────────
{
  ok(
    /create unique index if not exists notification_events_task_deadline_key[\s\S]{0,300}where type in \('task_deadline', 'task_deadline_summary'\)/.test(sql),
    '부분 유니크 인덱스가 중복을 거부한다'
  );
  ok(!/create table/i.test(sql.replace(/create temp table/gi, '')), '보낸 기록용 표를 새로 만들지 않았다');
  ok(
    /drop table if exists tmp_deadline_targets;/.test(sql),
    '한 트랜잭션에서 두 번 불려도 죽지 않는다(on commit drop 은 커밋 때 지운다)'
  );
  ok(/on conflict \(resource_id, type/.test(sql), '경합도 인덱스로 흡수한다');
}

// ── SQL: 권한 ──────────────────────────────────────────────────────────────
{
  ok(/if auth\.uid\(\) is null then/.test(sql), '로그인 필수(3값 논리 구멍 방지)');
  ok(/is_staff_teacher_or_admin\(auth\.uid\(\)\)/.test(sql), '교직원만 방아쇠를 당긴다');
  ok(
    /revoke execute on function public\.notify_task_deadlines\(\) from public, anon;/.test(sql),
    'anon 과 PUBLIC 양쪽에서 회수한다'
  );
}

// ── 클라이언트: 방아쇠는 세션당 한 번 ──────────────────────────────────────
{
  const trigger = src('src/services/taskDeadlineNotice.ts');
  ok(/let triggered = false;/.test(trigger), '모듈 전역 플래그로 한 번만 부른다');
  ok(/if \(triggered\) return;/.test(trigger), '두 번째 호출은 곧바로 돌아간다');
  ok(/console\.warn/.test(trigger), '실패해도 화면은 그대로 뜬다(오류를 삼킨다)');

  const bridge = src('src/components/notifications/BrowserNotificationBridge.tsx');
  ok(/useEffect\(triggerTaskDeadlineNotices, \[\]\)/.test(bridge), '앱에 한 번만 마운트되는 자리에 붙였다');

  const app = src('src/App.tsx');
  ok(
    (app.match(/<BrowserNotificationBridge \/>/g) ?? []).length === 1,
    '그 자리가 앱에 하나뿐이다(여러 개면 알림도 여러 번)'
  );
}

// ── 알림 클릭 목적지 ───────────────────────────────────────────────────────
{
  const assignee = getNotificationDestination({
    type: 'task_deadline', meta: { task_id: 'T1' }, related_meeting_id: null,
  } as never);
  ok(assignee?.to === '/my-tasks?task=T1', '담당자는 수행 화면으로');

  const manager = getNotificationDestination({
    type: 'task_deadline_summary', meta: { task_id: 'T1' }, related_meeting_id: null,
  } as never);
  ok(manager?.to === '/tasks?tab=myWorks&task=T1', '매니저는 관리 화면으로');

  // id 를 잃어도 «아무 일도 없음» 이 되지 않는다
  const fallback = getNotificationDestination({
    type: 'task_deadline', meta: {}, related_meeting_id: null,
  } as never);
  ok(fallback?.to === '/my-tasks', 'task_id 가 없으면 내 할 일로');

  const icons = src('src/components/notifications/notificationUtils.tsx');
  ok(/case 'task_deadline':/.test(icons) && /case 'task_deadline_summary':/.test(icons), '아이콘이 붙었다');
}

// ── 관리 화면 카탈로그(감사 뷰)에 등록 ─────────────────────────────────────
{
  const types = notificationEventCatalog.map((entry) => entry.notificationType);
  ok(types.includes('task_deadline'), '담당자 알림이 카탈로그에 있다');
  ok(types.includes('task_deadline_summary'), '매니저 요약이 카탈로그에 있다');
  const entry = notificationEventCatalog.find((e) => e.notificationType === 'task_deadline');
  ok(entry?.status === 'active', 'active 로 등록');
  ok(/pg_cron/.test(entry?.trigger ?? ''), '«화면이 방아쇠»라는 사실을 카탈로그가 말한다');
}

console.log(`\n${pass}건 통과`);
