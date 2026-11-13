/**
 * 할 일의 «담당자에게 보이는 날» + 업무 「대기」 은퇴 + 완료된 업무의 할 일 보존 — 회귀 (2026-10-05)
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/task-visibility-test/run.mts
 *
 * 이 부류는 전부 **오류 없이 조용히 틀린다**:
 *   · 서버와 화면의 날짜 규칙이 갈리면 홈과 내 할 일이 서로 다른 날에 열린다
 *   · 완료된 업무의 할 일이 «내 할 일 › 완료»에서 사라진다(기록이 남지 않는다)
 *   · 그 할 일이 홈 대시보드에 «기한 지남»으로 떠오른다(운영 실측 13건)
 *   · 업무 [대기] 버튼이 되살아나 숨김 수단이 둘이 된다
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isHiddenFromAssignees, taskVisibleFrom, todayKeyKst, visibleFromError, visibleFromLabel,
} from '../../src/lib/taskVisibility';
import { getMyTaskStatus, isFromClosedWork } from '../../src/lib/taskStatus';
import { TASK_META_ROLLOVER_POLICY, planTaskRollover } from '../../src/lib/workRollover';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail: unknown = '') => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name}${detail !== '' ? ` — ${JSON.stringify(detail)}` : ''}`); }
};

console.log('[① 보이는 날 판정]');
const t = (visibleFrom?: unknown) => ({ meta: { visibleFrom } as { visibleFrom?: string | null } });
check('없으면 보인다', !isHiddenFromAssignees(t(undefined), '2026-10-05') && !isHiddenFromAssignees(t(null), '2026-10-05'));
check('빈 값이면 보인다', !isHiddenFromAssignees(t(''), '2026-10-05'));
check('오늘이면 보인다(그날 아침 열린다)', !isHiddenFromAssignees(t('2026-10-05'), '2026-10-05'));
check('내일이면 안 보인다', isHiddenFromAssignees(t('2026-10-06'), '2026-10-05'));
check('지난 날이면 보인다', !isHiddenFromAssignees(t('2026-01-01'), '2026-10-05'));
check('형식이 틀리면 없는 것(= 보임) — 서버와 같다', !isHiddenFromAssignees(t('2026/10/20'), '2026-10-05') && taskVisibleFrom(t('bad')) === null);
check('칩 문구', visibleFromLabel(t('2026-10-20')) === '10/20부터 보임' && visibleFromLabel(t('')) === null);
// 한국 날짜 — UTC 15시(= KST 자정)를 넘으면 다음 날이어야 한다
check('오늘 = 한국 날짜', todayKeyKst(new Date('2026-10-05T14:59:00Z')) === '2026-10-05' && todayKeyKst(new Date('2026-10-05T15:00:00Z')) === '2026-10-06');
check('검증: 첫 마감보다 늦으면 막는다', !!visibleFromError('2026-10-20', ['2026-10-10', '']));
check('검증: 마감 전이면 통과', visibleFromError('2026-10-01', ['2026-10-10']) === null && visibleFromError('', ['2026-10-10']) === null);
check('검증: 마감이 없으면 통과', visibleFromError('2026-10-01', ['']) === null);

console.log('[② 서버 — 같은 규칙]');
{
  const sql = read('supabase/migrations/20261005120000_task_visible_from.sql');
  check('같은 정규식', sql.includes(String.raw`'^\d{4}-\d{2}-\d{2}$'`));
  check('같은 날짜 기준(한국)', sql.includes("now() at time zone 'Asia/Seoul'"));
  check('담당 목록은 취소된 업무만 뺀다(완료된 업무 보존)', /WHERE e\.status <> 'cancelled'\s+AND public\.task_visible_to_assignees\(t\.meta\)/.test(sql));
  check('완료된 업무의 할 일은 status=completed 로 싣는다', sql.includes("'status', CASE WHEN e.status = 'completed' AND t.status <> 'cancelled' THEN 'completed' ELSE t.status END"));
  check('원래 상태·업무 상태를 함께 싣는다', sql.includes("'task_status', t.status") && (sql.match(/'event_status', e\.status/g) ?? []).length === 3);
  check('급한 목록·요약도 보이는 날을 지킨다', (sql.match(/public\.task_visible_to_assignees\(t\.meta\)/g) ?? []).length === 3);
  // 매니저 목록은 거르지 않는다 — 매니저는 언제나 본다
  const managed = sql.slice(sql.indexOf('INTO managed_task_data'), sql.indexOf('INTO managed_task_data') + 600);
  check('매니저 목록은 보이는 날로 거르지 않는다', !managed.includes('task_visible_to_assignees'));
}

console.log('[③ 끝난 업무의 할 일]');
check('업무 완료 → 내 상태 완료', getMyTaskStatus({ status: 'pending', event_status: 'completed', meta: { assignees: [{ id: 'me', status: 'pending' }] } }, 'me') === 'completed');
check('업무 취소 → 취소', getMyTaskStatus({ status: 'pending', event_status: 'cancelled' }, 'me') === 'cancelled');
check('진행 중 업무는 종전 규칙', getMyTaskStatus({ status: 'pending', event_status: 'active', meta: { assignees: [{ id: 'me', status: 'pending' }] } }, 'me') === 'pending');
check('업무 상태가 없으면 종전 규칙(다른 출처의 행)', getMyTaskStatus({ status: 'completed' }, 'me') === 'completed');
check('isFromClosedWork', isFromClosedWork({ event_status: 'completed' }) && isFromClosedWork({ event_status: 'cancelled' }) && !isFromClosedWork({ event_status: 'active' }) && !isFromClosedWork({}));
{
  const index = read('src/pages/Index.tsx');
  check('홈은 끝난 업무의 할 일을 출처에서 한 번 거른다', /\.filter\(\(task\) => !isFromClosedWork\(task\)\)/.test(index));
}

console.log('[④ 업무 「대기」 은퇴]');
{
  const view = read('src/components/tasks/IntegratedTaskView.tsx');
  check('대기로 바꾸는 버튼이 없다', !/handleWorkStatusChange\(work\.id, 'pending'\)/.test(view));
  check('옛 대기 업무는 진행중으로 본다(필터에서 사라지지 않게)', /work\.status === 'pending' \? 'active' : work\.status/.test(view));
  const header = read('src/components/tasks/TaskHeader.tsx');
  check('「대기 중 업무」 필터가 없다', !header.includes('대기 중 업무') && !/onMyWorksFilterChange\('pending'\)/.test(header));
  const inbox = read('src/components/tasks/taskInboxUtils.ts');
  check('업무 대기 → 시작 대기 매핑이 없다', !/workStatus === 'pending'/.test(inbox));
}

console.log('[⑤ 편집 창 · 매니저 화면 · 지난 업무 가져오기]');
{
  const dialog = read('src/components/tasks/TaskEditDialog.tsx');
  check('편집 창에 입력이 있다', dialog.includes('담당자에게 보이는 날') && /id="visible_from"/.test(dialog));
  // update 경로가 meta 얕은 병합이라 비울 때 null 을 명시해야 옛 날짜가 지워진다
  check('비우면 null 을 명시해 저장', dialog.includes('visibleFrom: formData.visibleFrom || null'));
  check('저장 전 검증', /visibleFromError\(formData\.visibleFrom, nextDeadlines\)/.test(dialog));
  check('복사본은 보이는 날을 이어받지 않는다', /visibleFrom: '',\s*\n\s*keywords: selectedTask\.keywords/.test(dialog) || /복사본은 바로 보이게/.test(dialog));
  check('매니저 표에 칩', read('src/components/tasks/WorkTaskTable.tsx').includes('<VisibleFromChip task={row.task} />'));
  check('할 일 상세에 칩', read('src/components/tasks/TaskDetailDialog.tsx').includes('<VisibleFromChip task={live} />'));

  check('가져오기 규칙표에 등록(shift)', (TASK_META_ROLLOVER_POLICY as Record<string, string>).visibleFrom === 'shift');
  const plan = planTaskRollover(
    { id: 't1', title: '공시', due_date: '2025-10-20', meta: { visibleFrom: '2025-10-01', assignees: [] } },
    1,
    { keepAssignees: false, activeResources: new Map(), now: new Date('2026-09-01T00:00:00Z'), sourceWorkId: 'w1' },
  );
  check('가져오면 보이는 날도 1년 옮긴다', plan.meta.visibleFrom === '2026-10-01', plan.meta.visibleFrom);
  const bad = planTaskRollover(
    { id: 't2', title: 'x', due_date: null, meta: { visibleFrom: 'bad' } },
    1,
    { keepAssignees: false, activeResources: new Map(), now: new Date('2026-09-01T00:00:00Z'), sourceWorkId: 'w1' },
  );
  check('형식이 틀린 값은 버린다', !('visibleFrom' in bad.meta));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
