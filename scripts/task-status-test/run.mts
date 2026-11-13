// 업무 상태 표시 판정 회귀 — 2026-08-22 신설.
//
// 규칙을 못 박는 이유 둘:
//  ① 같은 판정이 대시보드 카드 4곳·업무 목록에 복붙돼 있었고 **서로 미묘하게 달랐다**
//     (담당자 항목에 status가 없을 때 업무 목록=pending, 대시보드=task.status).
//  ② **매니저가 완료로 바꾼 업무는 담당자 제출 여부와 무관하게 끝난 것**이라는 사용자 결정
//     (2026-08-22). 종전 규칙은 개인 상태가 항상 이겨서, 끝난 업무가 담당자들의 '나의 업무'에
//     기한 초과로 계속 남았다.
//
// 실행: npx tsx scripts/task-status-test/run.mts
import { getMyTaskStatus, isMyTaskCompleted } from '../../src/lib/taskStatus';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

const ME = 'me-resource-id';
const OTHER = 'other-resource-id';
const task = (status: string | null, assignees: { id: string; status?: string }[] | null) => ({
  status,
  meta: assignees ? { assignees } : null,
});

// ── 핵심 회귀: 매니저가 완료로 바꾼 업무는 담당자 제출 여부와 무관하게 완료다 ──
check(
  'task 완료 + 내 담당 pending → 완료 (버그의 원인이던 지점)',
  isMyTaskCompleted(task('completed', [{ id: ME, status: 'pending' }]), ME),
);
check(
  '담당자 여럿이어도 task 완료면 완료 (과제 단위 업무의 범주 담당자 포함)',
  isMyTaskCompleted(
    task('completed', [{ id: ME, status: 'pending' }, { id: OTHER, status: 'completed' }]),
    ME,
  ),
);
check(
  'task 취소도 개인 상태를 이긴다',
  getMyTaskStatus(task('cancelled', [{ id: ME, status: 'pending' }]), ME) === 'cancelled',
);

// ── 내 몫을 끝낸 경우 ──
check(
  '내 담당 완료 + task 미완료 → 나에겐 완료',
  isMyTaskCompleted(task('active', [{ id: ME, status: 'completed' }, { id: OTHER, status: 'pending' }]), ME),
);
check(
  '남만 완료 + 내 담당 pending → 미완료',
  !isMyTaskCompleted(task('active', [{ id: ME, status: 'pending' }, { id: OTHER, status: 'completed' }]), ME),
);
check(
  '개인 진행 중 상태 보존',
  getMyTaskStatus(task('active', [{ id: ME, status: 'in_progress' }]), ME) === 'in_progress',
);

// ── 폴백 ──
check(
  '담당자가 아니면 task 상태를 따른다',
  getMyTaskStatus(task('active', [{ id: OTHER, status: 'completed' }]), ME) === 'active',
);
check(
  'resource id 미해석이면 task 상태를 따른다',
  getMyTaskStatus(task('active', [{ id: ME, status: 'completed' }]), undefined) === 'active',
);
check('meta 없음 → task 상태', getMyTaskStatus(task('active', null), ME) === 'active');
check('상태가 전혀 없으면 pending', getMyTaskStatus(task(null, null), ME) === 'pending');
check('task 자체가 없어도 죽지 않는다', getMyTaskStatus(null, ME) === 'pending');
check(
  '담당자 항목에 status가 없으면 pending',
  getMyTaskStatus(task('active', [{ id: ME }]), ME) === 'pending',
);

console.log(fails === 0 ? '\n[task-status] ALL PASS' : `\n[task-status] FAILED: ${fails}건`);
if (fails > 0) process.exit(1);
