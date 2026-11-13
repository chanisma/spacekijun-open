// 절차적 할 일 순서 번호 = 1부터 회귀 — 2026-09-23 신설.
//
// 종전엔 규칙이 둘이었다(저장 0부터 + 표시 +1 / 저장 1부터 + 표시 그대로). 대부분 1부터
// 저장돼 있어 +1 표시가 첫 단계를 "순서 2"로 보여 줬다(노드 "절차 2" 실사용 보고).
// 이 부류는 오류가 없으므로 정적 검사가 방어선이다.
//
// 실행: npx tsx scripts/task-order-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIRST_STEP_ORDER, nextStepOrder, parseStepOrderInput, planStepPlacement, stepOrderAt } from '../../src/lib/taskOrder';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

console.log('① 규칙');
check('첫 순서는 1', FIRST_STEP_ORDER === 1 && stepOrderAt(0) === 1 && stepOrderAt(2) === 3);
check('절차가 없으면 다음 순서는 1', nextStepOrder(null) === 1 && nextStepOrder(undefined) === 1);
check('가장 큰 순서 다음', nextStepOrder(3) === 4);
check('예전 0부터 업무에서도 다음 순서는 1 이상', nextStepOrder(-1) === 1 && nextStepOrder(0) === 1);
check('입력칸: 비었거나 1 미만이면 1', parseStepOrderInput('') === 1 && parseStepOrderInput('0') === 1 && parseStepOrderInput('-3') === 1);
check('입력칸: 정상 값은 그대로', parseStepOrderInput('5') === 5);

console.log('② 표시는 저장값 그대로(+1 금지)');
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const displays: Array<[string, RegExp]> = [
  ['src/features/task-workflow/components/WorkflowNode.tsx', /orderIndex\s*\+\s*1/],
  ['src/components/tasks/MyTaskInbox.tsx', /order_index\s*\+\s*1/],
  ['src/components/tasks/TaskItem.tsx', /order_index\s*\+\s*1/],
  ['src/components/tasks/TaskEditDialog.tsx', /order_index\s*\+\s*1/],
];
for (const [file, bad] of displays) check(`${file.split('/').pop()} 에 +1 보정 없음`, !bad.test(read(file)));

console.log('③ 저장은 1부터');
const edit = read('src/components/tasks/TaskEditDialog.tsx');
check('할 일 편집 입력칸 min=1', /id="order_index"[\s\S]{0,300}min="1"/.test(edit) && !/id="order_index"[\s\S]{0,300}min="0"/.test(edit));
check('할 일 편집 입력칸이 비면 1', edit.includes('parseStepOrderInput(e.target.value)'));
check('업무 만들기 초안은 위치에서 1부터', read('src/components/tasks/WorkCreateDialog.tsx').includes('order_index: stepOrderAt(index)'));

console.log('④ 순서 칸에서 자리 바꾸기 (2026-09-26 내 업무 관리 표)');
{
  const tasks = [
    { id: 'a', type: 'procedural', order_index: 1 },
    { id: 'b', type: 'procedural', order_index: 2 },
    { id: 'c', type: 'procedural', order_index: 3 },
    { id: 'x', type: 'one_time', order_index: 0 },
  ];
  const plan = (list: typeof tasks, id: string, target: number | 'one_time') =>
    JSON.stringify(Object.fromEntries(planStepPlacement(list, id, target).map((c) => [c.id, `${c.type}:${c.order_index}`])));
  const same = (actual: string, expected: Record<string, string>) => actual === JSON.stringify(expected);

  check('3번째 → 1번째: 앞 단계가 한 칸씩 밀린다', same(plan(tasks, 'c', 1), { a: 'procedural:2', b: 'procedural:3', c: 'procedural:1' }));
  check('1번째 → 2번째: 바뀌는 행만 돌려준다(c 는 쓰지 않는다)', same(plan(tasks, 'a', 2), { a: 'procedural:2', b: 'procedural:1' }));
  check('같은 자리를 고르면 쓰기 없음', same(plan(tasks, 'b', 2), {}));
  check('절차 → 일회성: 뒤 단계가 당겨진다', same(plan(tasks, 'a', 'one_time'), { a: 'one_time:0', b: 'procedural:1', c: 'procedural:2' }));
  check('일회성 → 2번째 절차', same(plan(tasks, 'x', 2), { b: 'procedural:3', c: 'procedural:4', x: 'procedural:2' }));
  check('범위 밖 번호는 맨 뒤로', same(plan(tasks, 'x', 99), { x: 'procedural:4' }));
  check('없는 할 일은 아무것도 안 한다', same(plan(tasks, 'zzz', 1), {}));
  const gappy = [
    { id: 'a', type: 'procedural', order_index: 1 },
    { id: 'b', type: 'procedural', order_index: 5 },
    { id: 'x', type: 'one_time', order_index: 0 },
  ];
  check('번호 구멍(1,5)은 옮길 때 메워진다', same(plan(gappy, 'x', 1), { a: 'procedural:2', b: 'procedural:3', x: 'procedural:1' }));

  const table = read('src/components/tasks/WorkTaskTable.tsx');
  check('표의 순서 칸은 매니저에게만 열린다', /onChange=\{row\.isManager \? onPlacementChange : undefined\}/.test(table));
  check('표는 번호를 직접 계산하지 않는다(계획은 taskOrder.ts)', !/order_index/.test(table));
  check('표가 table-fixed 다(없으면 긴 제목이 잘리지 않고 열을 민다)', /table-fixed/.test(table));
  check('표에 최소 폭이 있다(좁아질 때 할 일만 0 으로 사라지지 않게)', /<table className="[^"]*min-w-\[\d+px\][^"]*table-fixed/.test(table));
  check('마감일 입력 글자가 데스크톱에서도 작다(md:text-sm 을 덮는다)', /md:text-\[11px\]/.test(table));
}

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
