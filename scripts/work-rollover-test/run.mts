// 연간 업무 템플릿(지난 업무 가져오기) 회귀 — npx tsx scripts/work-rollover-test/run.mts
//
// 이 기능의 사고는 **오류를 내지 않는다**: 작년 진척이 따라와 "만들자마자 완료"가 되거나,
// 날짜가 작년 그대로라 "만들자마자 기한 초과"가 되거나, 값 제출이 작년 실행을 가리킨다.
// 그래서 판정 함수를 직접 두드리고, 할 일 meta 타입의 키 전부가 규칙표에 분류돼 있는지 정적으로 본다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TASK_META_ROLLOVER_POLICY,
  findExistingRollover,
  inferWorkYear,
  isWeekendDateKey,
  planWorkRollover,
  remapSubmissionAction,
  rolloverWorkName,
  shiftDateKey,
  toDateKey,
} from '../../src/lib/workRollover';

let pass = 0;
function ok(cond: unknown, name: string) {
  if (!cond) {
    console.error('  ✗', name);
    process.exit(1);
  }
  console.log('  ✓', name);
  pass++;
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log('날짜');
ok(toDateKey('2026-03-20T00:00:00+09:00') === '2026-03-20', 'ISO → 날짜 키(앞 10자)');
ok(toDateKey('') === null && toDateKey(null) === null, '빈 값 → null');
ok(shiftDateKey('2025-03-10', 1) === '2026-03-10', '1년 이동');
ok(shiftDateKey('2024-02-29', 1) === '2025-02-28', '윤일 → 평년 2/28');
ok(shiftDateKey('2027-02-28', 1) === '2028-02-28', '평년 2/28 은 윤년에도 2/28');
ok(shiftDateKey('2026-12-01', -1) === '2025-12-01', '음수 이동');
ok(isWeekendDateKey('2026-09-26') && isWeekendDateKey('2026-09-27'), '토·일 판정');
ok(!isWeekendDateKey('2026-09-25'), '금 = 평일');

console.log('연도');
ok(inferWorkYear({ name: 'x', meta: { year: 2025 } }) === 2025, 'meta.year 우선');
ok(inferWorkYear({ name: 'x', meta: { year: '2024' } }) === 2024, 'meta.year 문자열');
ok(inferWorkYear({ name: '2025년 2학기 2차고사(1, 2학년)', meta: {} }) === 2025, '이름의 YYYY년');
ok(inferWorkYear({ name: '2026학년도 교육과정', meta: null }) === 2026, '이름의 YYYY학년도');
ok(inferWorkYear({ name: '정보공시', created_at: '2025-04-01T00:00:00+09:00' }) === 2025, '생성일 폴백');
ok(rolloverWorkName('2025년 2학기 2차고사(1, 2학년)', 2025, 2026).name === '2026년 2학기 2차고사(1, 2학년)', '연도만 바꾸고 학년·차수 숫자는 그대로');
ok(rolloverWorkName('2025 년 정보공시', 2025, 2026).name === '2026 년 정보공시', '연도와 년 사이 공백');
ok(rolloverWorkName('20250년 x', 2025, 2026).replaced === false, '더 긴 숫자의 일부는 안 바꾼다');
ok(rolloverWorkName('정보공시', 2025, 2026).replaced === false, '연도가 없으면 replaced=false');

console.log('계획');
const active = new Map([['A', '김교사'], ['M', '박부장']]);
const source = {
  id: 'W1',
  name: '2025년 정기고사 출제',
  description: '설명',
  keywords: ['시험'],
  created_at: '2025-03-01T00:00:00+09:00',
  meta: {
    year: 2025,
    department: '교무부',
    managers: [{ id: 'M', name: '박부장' }, { id: 'GONE', name: '전출교사' }],
    files: [{ id: 'f' }],
    documentAnalysisId: 'da',
  },
  tasks: [
    {
      id: 'T2', title: '검토', type: 'procedural', order_index: 2, due_date: '2025-04-11T00:00:00+09:00', keywords: [],
      meta: {
        assignees: [{ id: 'A', status: 'completed' }, { id: 'GONE', status: 'completed' }],
        assignmentIssues: { A: { reason: 'x', reportedAt: 'y' } },
        mysteryProgress: { done: true },
      },
    },
    {
      id: 'T1', title: '출제', type: 'procedural', order_index: 1, due_date: '2025-08-07T00:00:00+09:00', keywords: ['출제'],
      meta: {
        deadlines: ['2025-03-01', '2025-08-07'],
        deadlineProgress: { '2025-03-01': { A: { status: 'completed' } } },
        units: [{ key: 'u1', label: '국어' }],
        unitProgress: { u1: { A: { status: 'completed' } } },
        submission: { required: true, mode: 'spec', actionId: 'ACT_OLD', template: { id: 'tpl' } },
        assignees: [{ id: 'A', status: 'completed' }],
      },
    },
  ],
};
const now = new Date('2026-01-10T00:00:00+09:00');
const plan = planWorkRollover(source, { targetYear: 2026, keepAssignees: true, activeResources: active, now });

ok(plan.name === '2026년 정기고사 출제' && plan.nameReplaced, '업무 이름 연도 교체');
ok(plan.sourceYear === 2025 && plan.targetYear === 2026, '원본·대상 연도');
ok(plan.workMeta.year === 2026 && plan.workMeta.department === '교무부', 'work.meta: 연도 갱신·부서 유지');
ok(!('files' in plan.workMeta) && !('documentAnalysisId' in plan.workMeta), 'work.meta: 파일·문서분석 출처는 버린다');
ok(eq(plan.workMeta.rolledOverFrom, { workId: 'W1', year: 2025, name: '2025년 정기고사 출제' }), 'work 계보');
ok(eq(plan.managers.map((m) => m.id), ['M']) && eq(plan.droppedManagers.map((m) => m.id), ['GONE']), '매니저: 재직자만, 빠진 사람은 보고');
ok(eq(plan.tasks.map((t) => t.sourceTaskId), ['T1', 'T2']), '할 일은 순서대로');

const [t1, t2] = plan.tasks;
ok(eq(t1.meta.deadlines, ['2026-03-01', '2026-08-07']), '다중 마감 회차 전부 이동');
ok(t1.due_date === '2026-03-01', '다중 마감 due_date = 새 기준 다음 마감');
ok(!('deadlineProgress' in t1.meta) && !('unitProgress' in t1.meta), '작년 회차·단위 진척은 버린다');
ok(eq(t1.meta.units, [{ key: 'u1', label: '국어' }]), '단위 정의는 유지');
ok((t1.meta.submission as { actionId?: string }).actionId === 'ACT_OLD', '제출 설정 유지(실행 재연결은 저장 단계)');
ok(t1.hadProgress, '진척이 있었음을 보고');
ok(eq(t1.dates.map((d) => d.weekend), [true, false]), '2026-03-01(일)만 주말 표시');

ok(t2.due_date === '2026-04-11' && !('deadlines' in t2.meta), '단일 마감 이동');
ok(eq((t2.meta.assignees as Array<{ id: string; status: string }>).map((a) => [a.id, a.status]), [['A', 'pending']]), '담당자: 재직자만·상태는 대기로');
ok(eq(t2.droppedAssignees.map((a) => a.id), ['GONE']), '빠진 담당자 보고');
ok(!('assignmentIssues' in t2.meta), "'담당자 아님' 표시는 버린다");
ok(!('mysteryProgress' in t2.meta) && eq(t2.unknownKeys, ['mysteryProgress']), '모르는 키는 버리고 보고');
ok(eq(t2.meta.rolledOverFrom, { workId: 'W1', taskId: 'T2' }), '할 일 계보');

const noKeep = planWorkRollover(source, { targetYear: 2026, keepAssignees: false, activeResources: active, now });
ok(noKeep.tasks.every((t) => (t.meta.assignees as unknown[]).length === 0), '담당자 유지 끔 → 빈 담당자');
const picked = planWorkRollover(source, { targetYear: 2026, keepAssignees: true, activeResources: active, managers: [{ id: 'NEW', name: '새교사' }], now });
ok(eq(picked.managers.map((m) => m.id), ['NEW']), '고른 매니저가 원본 매니저를 대신한다');
const twoYears = planWorkRollover(source, { targetYear: 2027, keepAssignees: true, activeResources: active, now });
ok(twoYears.tasks[1].due_date === '2027-04-11' && twoYears.name === '2027년 정기고사 출제', '2년 건너뛰기');

console.log('실행 재연결·복사 정리');
const remapped = remapSubmissionAction(t1.meta, new Map([['ACT_OLD', 'ACT_NEW']]));
ok(remapped.changed && (remapped.meta.submission as { actionId: string }).actionId === 'ACT_NEW', '새 실행으로 재연결');
const detached = remapSubmissionAction(t1.meta, new Map());
ok(detached.changed && !('actionId' in (detached.meta.submission as object)), '못 옮긴 실행은 연결을 끊는다');
ok((detached.meta.submission as { template?: unknown }).template !== undefined, '양식 사본은 남는다');
ok(!remapSubmissionAction({ units: [] }, new Map()).changed, '제출 없는 할 일은 그대로');

console.log('참고해서 시작 — 비슷한 일 참고(reference) 모드 (2026-11-12, 옛 «기존 업무에서 복사» 대체)');
{
  const ref = planWorkRollover(source, {
    mode: 'reference', targetYear: 2026, keepAssignees: false, activeResources: active, now,
    assignAllTo: { id: 'ME', name: '나' },
  });
  ok(ref.mode === 'reference', '모드가 계획에 실린다');
  ok(!('rolledOverFrom' in ref.workMeta), '참고: 업무 계보(rolledOverFrom)를 달지 않는다 — 남의 지식이 «작년»으로 섞인다');
  ok(eq(ref.workMeta.referencedFrom, { workId: 'W1', year: 2025, name: '2025년 정기고사 출제' }), '참고: 출처는 referencedFrom');
  const rt1 = ref.tasks.find((t) => t.sourceTaskId === 'T1')!;
  ok(rt1.due_date === null && !('deadlines' in rt1.meta) && rt1.dates.length === 0, '참고: 날짜를 가져오지 않는다(남의 일정)');
  ok(!('rolledOverFrom' in rt1.meta) && eq(rt1.meta.copiedFrom, { workId: 'W1', taskId: 'T1' }), '참고: 할 일 출처는 copiedFrom(계보 아님)');
  ok(eq((rt1.meta.assignees as Array<{ id: string }>).map((a) => a.id), ['ME']), '참고: 담당 «모두 나»');
  ok(!('unitProgress' in rt1.meta) && !('deadlineProgress' in rt1.meta) && eq(rt1.meta.units, [{ key: 'u1', label: '국어' }]), '참고: 진척은 버리고 설정은 남긴다');
  ok(!('visibleFrom' in rt1.meta), '참고: 보이는 날도 날짜라 버린다');

  const picked1 = planWorkRollover(source, { targetYear: 2026, keepAssignees: true, activeResources: active, now, taskIds: new Set(['T2']) });
  ok(eq(picked1.tasks.map((t) => t.sourceTaskId), ['T2']), '고른 할 일만 가져온다');
  ok(picked1.mode === 'continue' && eq(picked1.tasks[0].meta.rolledOverFrom, { workId: 'W1', taskId: 'T2' }), '기본 = 이어가기(계보)');

  // 참고로 만든 할 일을 다시 이어가면 출처 키는 새로 쓴다(옛 copiedFrom 이 따라가지 않는다)
  const again = planWorkRollover({ ...source, tasks: [{ ...source.tasks[0], meta: { ...source.tasks[0].meta, copiedFrom: { workId: 'X', taskId: 'Y' } } }] }, { targetYear: 2026, keepAssignees: true, activeResources: active, now });
  ok(!('copiedFrom' in again.tasks[0].meta), '옛 copiedFrom 은 다음 복사로 옮기지 않는다');
}

console.log('중복 방지');
const works = [
  { name: '2026년 정기고사 출제', meta: { year: 2026, rolledOverFrom: { workId: 'W1' } } },
  { name: '2025년 정기고사 출제', meta: { year: 2025 } },
];
ok(findExistingRollover(works, 'W1', 2026)?.name === '2026년 정기고사 출제', '같은 원본·같은 해 = 이미 가져옴');
ok(findExistingRollover(works, 'W1', 2027) === undefined, '다른 해는 가져올 수 있다');
ok(findExistingRollover(works, 'W2', 2026) === undefined, '다른 원본');

console.log('정적 — Task.meta 타입의 키가 전부 규칙표에 있는가');
const typesSrc = readFileSync(new URL('../../src/types/tasks.ts', import.meta.url), 'utf8');
const block = /export interface Task \{[\s\S]*?meta: Record<string, any> & \{([\s\S]*?)\n  \};/.exec(typesSrc)?.[1] ?? '';
const typeKeys = [...block.matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]);
ok(typeKeys.length >= 5, `Task.meta 키를 읽었다(${typeKeys.join(', ')})`);
const policy = TASK_META_ROLLOVER_POLICY as Record<string, string>;
const unclassified = typeKeys.filter((k) => !(k in policy));
ok(unclassified.length === 0, `미분류 키 없음${unclassified.length ? ` — ${unclassified.join(', ')}` : ''}`);
// 라이브 실측(2026-09-23) 키 — 타입에 없는 것까지
for (const k of ['assignees', 'assignmentIssues', 'deadlineProgress', 'deadlines', 'documentAnalysisCandidateId', 'documentAnalysisId', 'files', 'submission', 'unitProgress', 'units']) {
  ok(k in policy, `라이브 키 분류됨: ${k}`);
}


// 입구가 열려 있는가 (2026-09-24 사용자 결정으로 활성화)
{
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  const page = read('src/pages/TaskManagement.tsx');
  ok(page.includes('const WORK_ROLLOVER_ENABLED = true;'), '지난 업무 가져오기 입구가 열려 있다');
  ok(page.includes('onRolloverWork={WORK_ROLLOVER_ENABLED ?'), '머리글 버튼이 그 값을 본다');
  ok(page.includes('{WORK_ROLLOVER_ENABLED && ('), '모달도 같은 값을 본다');
  ok(page.includes('<WorkFromReferenceDialog') && !page.includes('WorkRolloverDialog'), '입구 = 통합 창(옛 가져오기 창 없음)');

  // 업무를 «원본에서» 만드는 길은 하나(2026-11-12) — 옛 «기존 업무에서 복사»는 날짜·작업·재직·계보를 따로 처리했다
  const create = read('src/components/tasks/WorkCreateDialog.tsx');
  ok(!create.includes('handleCopyFromWork') && !create.includes('기존 업무에서 복사</h3>'), '업무 만들기 창에 옛 복사가 없다');
  ok(create.includes('onStartFromReference'), '업무 만들기 창은 «참고해서 시작»으로 넘긴다');
  const refDialog = read('src/components/tasks/WorkFromReferenceDialog.tsx');
  ok(refDialog.includes('executeWorkRollover(') && refDialog.includes('planWorkRollover('), '통합 창은 같은 판정·쓰기를 쓴다');
  ok(refDialog.includes("kind: 'related'"), '원본으로 «관련» 연결을 남긴다(파일은 복사하지 않고 연결로 연다)');
  const svc = read('src/services/workRolloverService.ts');
  ok(svc.includes('rolled_over_from: lineage ? a.id : null'), '참고 모드 작업에는 계보(rolled_over_from)를 남기지 않는다');
  const doc = read('src/features/work-ontology/components/DocSuggestionActions.tsx');
  ok(doc.includes('<WorkFromReferenceDialog') && doc.includes('addDocTaskToCreated: true'), '공문 [내 일로] → 참고해서 새 업무로(공문 할 일 포함)');
  ok(doc.includes('newWorkDraft('), '공문 [내 일로] → 새 업무로');
  ok(read('src/features/work-ontology/components/StartWorkDialog.tsx').includes('<WorkFromReferenceDialog'), '업무노트 [새 업무] → 참고해서 시작');

  // 계보를 볼 수 있게 하는 길 — 이름만 적혀 있으면 "어떻게 하는 거였죠"에 답하지 못한다
  ok(page.includes("searchParams.get('work')"), '업무 딥링크(?work=)를 읽는다');
  ok(page.includes('if (!found) return;'), '못 찾으면 파라미터를 지우지 않는다');

  const dialog = read('src/components/tasks/WorkDetailDialog.tsx');
  ok(dialog.includes('/tasks/mine?work='), '원본 라벨이 작년 업무로 가는 링크다(2026-10-05 업무 목록 페이지)');
  ok(
    dialog.includes("typeof currentWork.meta.rolledOverFrom.workId === 'string' ?"),
    'workId 가 없는 옛 기록은 링크가 아니라 글자로 남는다'
  );
}

console.log(`\n${pass}건 통과`);
