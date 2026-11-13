// taskUnits 유틸 단위 검증(빠른 회귀) — npx tsx scripts/task-units-test/run.mts
import {
  buildUnitProgressFromRows, buildUnitsPayload, deriveAssigneesFromUnits,
  deriveTaskStatusFromUnits, getTaskUnits, getUnitProgress, isUnitCompleted,
  parseUnitPaste, pruneUnitProgress, unclaimedUnits, unitCompletionStats,
  unitsOfAssignee, type TaskUnit, type UnitProgressMap,
} from '../../src/lib/taskUnits';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}

const units: TaskUnit[] = [
  { key: 'u1', label: '물리' },
  { key: 'u2', label: '화학' },
  { key: 'u3', label: '기타' },
];
const progress: UnitProgressMap = {
  u1: { A: { status: 'completed' } },
  u2: { B: { status: 'pending' } },
  u3: {},
};

// 파싱·판별
ok(getTaskUnits({ meta: { units } }).length === 3, 'getTaskUnits 정상 배열');
ok(getTaskUnits({ meta: { units: [{ key: '', label: 'x' }, { bad: 1 }] } }).length === 0, '불량 항목 필터');
ok(getTaskUnits({ meta: { units: null } }).length === 0, 'units=null → 빈 배열');
ok(Object.keys(getUnitProgress({ meta: { unitProgress: progress } })).length === 3, 'getUnitProgress');

// 단위 완료 판정: 담당자 ≥1 && 전원 완료 (빈 단위는 미완료)
ok(isUnitCompleted(progress, 'u1') === true, 'u1 완료');
ok(isUnitCompleted(progress, 'u2') === false, 'u2 미완료');
ok(isUnitCompleted(progress, 'u3') === false, '빈 단위=미완료');
ok(JSON.stringify(unitCompletionStats(units, progress)) === JSON.stringify({ completed: 1, total: 3 }), '집계 1/3');

// 담당자 시점
ok(unitsOfAssignee(units, progress, 'A').map(u => u.key).join() === 'u1', 'A의 단위');
ok(unclaimedUnits(units, progress).map(u => u.key).join() === 'u3', '미선택 단위');

// 개인 상태 파생: 내 단위 ≥1 && 전부 완료. 단위 0개(범주만)=pending, cancelled 불변
const derived = deriveAssigneesFromUnits(units, progress, [
  { id: 'A', status: 'pending' },
  { id: 'B', status: 'completed' },
  { id: 'C', status: 'pending' },
  { id: 'D', status: 'cancelled' },
]);
ok(derived.find(a => a.id === 'A')!.status === 'completed', 'A 파생=completed');
ok(derived.find(a => a.id === 'B')!.status === 'pending', 'B 파생=pending(강등)');
ok(derived.find(a => a.id === 'C')!.status === 'pending', '범주만=pending');
ok(derived.find(a => a.id === 'D')!.status === 'cancelled', 'cancelled 불변');
ok(deriveAssigneesFromUnits([], progress, [{ id: 'B', status: 'completed' }])[0].status === 'completed',
  '단위 없으면 원본 유지');

// task 상태 파생: 모든 단위 완료(빈 단위 포함 시 pending)
ok(deriveTaskStatusFromUnits(units, progress) === 'pending', 'task=pending');
ok(deriveTaskStatusFromUnits(units.slice(0, 1), progress) === 'completed', '전 단위 완료=completed');
ok(deriveTaskStatusFromUnits([], {}) === 'pending', '단위 0개=pending');

// prune: 단위 목록·범주 밖 기록 제거
const pruned = pruneUnitProgress(progress, units.slice(0, 2), ['A']);
ok(!('u3' in pruned) && 'A' in pruned.u1 && !('B' in pruned.u2), 'prune 단위·범주 기준');

// 편집 폼 행 → progress 재구성(기존 상태 보존, 새 담당=pending, 빠진 담당 제거)
const rebuilt = buildUnitProgressFromRows(
  [{ key: 'u1', assigneeIds: ['A', 'C'] }, { key: 'u2', assigneeIds: [] }],
  progress,
);
ok(rebuilt.u1.A.status === 'completed' && rebuilt.u1.C.status === 'pending'
  && Object.keys(rebuilt.u2).length === 0, '행 재구성: 보존+신규 pending');

// payload: 단위 0개면 null 명시(meta 얕은 병합 삭제 시맨틱)
ok(buildUnitsPayload([], progress, ['A']).units === null, '빈 목록=null');
const payload = buildUnitsPayload(units, progress, ['A', 'B']);
ok(payload.units!.length === 3 && payload.unitProgress!.u1.A.status === 'completed', 'payload 유지');

// 붙여넣기 파싱: 탭 구분, 이름 매칭·미매칭, 라벨만 있는 줄
const teacherByName = new Map([['김교사', 'T1'], ['이교사', 'T2']]);
const parsed = parseUnitPaste('물리\t김교사\n화학\t이교사, 박교사\n기타\n\n', teacherByName);
ok(parsed.rows.length === 3, '붙여넣기 3행(빈 줄 무시)');
ok(parsed.rows[0].assigneeIds.join() === 'T1', '1행 매칭');
ok(parsed.rows[1].assigneeIds.join() === 'T2', '2행 부분 매칭');
ok(parsed.rows[2].assigneeIds.length === 0, '라벨만 행');
ok(parsed.unmatchedNames.join() === '박교사', '미매칭 보고');

console.log(`\n${pass} checks passed`);
