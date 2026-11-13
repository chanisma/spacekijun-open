// taskDeadlines 유틸 단위 검증(빠른 회귀)
import {
  buildDeadlinePayload, effectiveFromDeadlines, getTaskDeadlineInfo,
  getTaskDeadlines, normalizeDeadlines,
} from '../../src/lib/taskDeadlines';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}

// normalize: 중복·빈값 제거, 정렬, T 절단
ok(JSON.stringify(normalizeDeadlines(['2026-09-01', '', null, '2026-03-01T00:00:00', '2026-09-01', 'bad']))
  === JSON.stringify(['2026-03-01', '2026-09-01']), 'normalize 정렬·중복·불량 제거');

// effective: 다음 예정(오늘 포함), 전부 지났으면 마지막
const now = new Date('2026-04-15T12:00:00');
ok(effectiveFromDeadlines(['2026-03-01', '2026-06-01', '2026-09-01'], now) === '2026-06-01', 'effective=다음 예정');
ok(effectiveFromDeadlines(['2026-01-01', '2026-02-01'], now) === '2026-02-01', 'effective=전부 지남→마지막');
ok(effectiveFromDeadlines(['2026-04-15'], now) === '2026-04-15', 'effective=오늘 마감은 예정');
ok(effectiveFromDeadlines([], now) === null, 'effective=빈 목록 null');

// getTaskDeadlines: meta.deadlines 우선, 폴백 due_date, null 무시
ok(JSON.stringify(getTaskDeadlines({ due_date: '2026-05-01', meta: { deadlines: ['2026-06-01', '2026-03-01'] } }))
  === JSON.stringify(['2026-03-01', '2026-06-01']), 'meta.deadlines 우선(정렬)');
ok(JSON.stringify(getTaskDeadlines({ due_date: '2026-05-01T00:00:00+09:00', meta: { deadlines: null } }))
  === JSON.stringify(['2026-05-01']), 'deadlines=null → due_date 폴백');
ok(getTaskDeadlines({ meta: {} }).length === 0, '마감 없음');

// info
const info = getTaskDeadlineInfo({ due_date: '2026-06-01', meta: { deadlines: ['2026-03-01', '2026-06-01', '2026-09-01'] } }, now);
ok(info.isMulti && info.total === 3 && info.passed === 1 && info.effective === '2026-06-01', 'info 회차 집계');

// payload: due_date=effective, 단일이면 deadlines=null(병합 삭제 시맨틱)
const p1 = buildDeadlinePayload(['2026-09-01', '2026-03-01'], { assignees: [1] });
ok(JSON.stringify(p1.meta.deadlines) === JSON.stringify(['2026-03-01', '2026-09-01']) && 'assignees' in p1.meta, 'payload 다중=배열+base 유지');
const p2 = buildDeadlinePayload(['2026-05-01'], {});
ok(p2.due_date === '2026-05-01' && p2.meta.deadlines === null, 'payload 단일=null');
const p3 = buildDeadlinePayload([''], {});
ok(p3.due_date === null && p3.meta.deadlines === null, 'payload 빈 입력');

console.log(`\n[test-deadlines] ALL PASS (${pass})`);

// ── 회차별 완료(deadlineProgress) ──
import {
  countCompletedRounds, deriveAssigneesFromProgress, getDeadlineProgress,
  isRoundCompleted, pendingDeadlinesForAssignee, pendingDeadlinesForWork,
  pruneDeadlineProgress,
} from '../../src/lib/taskDeadlines';

const prog = {
  '2026-03-01': { A: { status: 'completed' as const }, B: { status: 'pending' as const } },
  '2026-06-01': { A: { status: 'completed' as const } },
  '2026-99-99': { A: { status: 'completed' as const } },
};
ok(isRoundCompleted(prog, '2026-03-01', 'A') && !isRoundCompleted(prog, '2026-03-01', 'B')
  && !isRoundCompleted(prog, '2026-09-01', 'A'), 'isRoundCompleted 기본');
ok(countCompletedRounds(prog, ['2026-03-01', '2026-06-01', '2026-09-01'], 'A') === 2, 'countCompletedRounds');

const pruned = pruneDeadlineProgress(prog, ['2026-03-01', '2026-06-01']);
ok(!('2026-99-99' in pruned) && '2026-03-01' in pruned, 'prune 고아 키 제거');

const asg = [
  { id: 'A', status: 'completed', completed_at: '2026-06-01T00:00:00Z' },
  { id: 'B', status: 'pending', completed_at: null },
  { id: 'C', status: 'cancelled', completed_at: null },
];
// A는 2회 모두 완료 → completed 유지, 회차 3개로 늘리면 pending으로 강등
const d2 = deriveAssigneesFromProgress(['2026-03-01', '2026-06-01'], pruned, asg);
ok(d2[0].status === 'completed' && d2[1].status === 'pending' && d2[2].status === 'cancelled', 'derive 2회차');
const d3 = deriveAssigneesFromProgress(['2026-03-01', '2026-06-01', '2026-09-01'], pruned, asg);
ok(d3[0].status === 'pending' && d3[0].completed_at === null, 'derive 회차 추가 시 완료→미완료 강등');
ok(deriveAssigneesFromProgress(['2026-03-01'], pruned, asg)[0].status === 'completed', 'derive 단일 마감=원본 유지');

ok(JSON.stringify(getDeadlineProgress({ meta: { deadlineProgress: prog } })) === JSON.stringify(prog)
  && Object.keys(getDeadlineProgress({ meta: { deadlineProgress: null } })).length === 0, 'getDeadlineProgress');

// payload: progress prune 동반, 단일 축소 시 progress도 null
const pp = buildDeadlinePayload(['2026-03-01', '2026-06-01'], {}, prog);
ok(!('2026-99-99' in (pp.meta.deadlineProgress as object)) && pp.meta.deadlines !== null, 'payload progress prune');
const ps = buildDeadlinePayload(['2026-03-01'], {}, prog);
ok(ps.meta.deadlineProgress === null && ps.meta.deadlines === null, 'payload 단일 축소 시 progress null');

// ── 개인 타임라인: 이미 완료한 회차 제외 (홈 대시보드 '나의 업무') ──
// 담당자 전체 상태는 "모든 회차 완료"라야 completed가 되므로, 일부만 끝낸 task는
// 목록에 남는다 → 끝낸 회차까지 타임라인에 뿌리면 안 된다.
const ME = 'me-1', OTHER = 'other-1';
const done = (at: string) => ({ status: 'completed' as const, completed_at: at });
// 라이브 실제 사례("리로스쿨 세팅"): 2회차 중 1회차만 완료, 담당자 상태는 pending
const partial = {
  due_date: '2026-08-07',
  meta: {
    assignees: [{ id: ME, status: 'pending' }],
    deadlines: ['2026-03-01', '2026-08-07'],
    deadlineProgress: { '2026-03-01': { [ME]: done('2026-07-28T02:22:00+09:00') } },
  },
};
ok(JSON.stringify(pendingDeadlinesForAssignee(partial as never, ME)) === JSON.stringify(['2026-08-07']),
  '타임라인: 내가 끝낸 회차 제외');
ok(JSON.stringify(pendingDeadlinesForAssignee(partial as never, OTHER)) === JSON.stringify(['2026-03-01', '2026-08-07']),
  '타임라인: 남의 완료 기록은 내 회차를 지우지 않음');
ok(JSON.stringify(pendingDeadlinesForAssignee(partial as never, undefined)) === JSON.stringify(['2026-03-01', '2026-08-07']),
  '타임라인: 담당자 미상이면 전부 표시(폴백)');
// 단일 마감은 task 단위 완료 필터가 이미 거르므로 손대지 않는다
ok(JSON.stringify(pendingDeadlinesForAssignee(
  { due_date: '2026-03-01', meta: { deadlineProgress: { '2026-03-01': { [ME]: done('x') } } } } as never, ME,
)) === JSON.stringify(['2026-03-01']), '타임라인: 단일 마감은 필터 미적용');

// 이벤트(매니저 시점) 기간 = 담당자 '전원'이 끝낸 회차만 제외
const twoAssignees = {
  meta: {
    assignees: [{ id: ME, status: 'pending' }, { id: OTHER, status: 'pending' }],
    deadlines: ['2026-03-01', '2026-06-01'],
    deadlineProgress: {
      '2026-03-01': { [ME]: done('x'), [OTHER]: done('x') },
      '2026-06-01': { [ME]: done('x') },
    },
  },
};
ok(JSON.stringify(pendingDeadlinesForWork(twoAssignees as never)) === JSON.stringify(['2026-06-01']),
  '이벤트: 전원 완료 회차만 제외(일부 완료는 유지)');
ok(JSON.stringify(pendingDeadlinesForWork({
  meta: { assignees: [], deadlines: ['2026-03-01', '2026-06-01'] },
} as never)) === JSON.stringify(['2026-03-01', '2026-06-01']), '이벤트: 담당자 없으면 전부 표시');
// cancelled 담당자는 완료 판정에서 빠진다 — 남은 담당자가 끝냈으면 그 회차는 제외
ok(JSON.stringify(pendingDeadlinesForWork({
  meta: {
    assignees: [{ id: ME, status: 'pending' }, { id: OTHER, status: 'cancelled' }],
    deadlines: ['2026-03-01', '2026-06-01'],
    deadlineProgress: { '2026-03-01': { [ME]: done('x') } },
  },
} as never)) === JSON.stringify(['2026-06-01']), '이벤트: cancelled 담당자는 판정 제외');

console.log(`\n[test-deadlines+rounds] ALL PASS (${pass})`);
