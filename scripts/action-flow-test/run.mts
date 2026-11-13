// 작업 순서(action flow) 회귀 — 2026-09-23 신설.
//
// 못 박는 것:
//  ① 권장 순서일 뿐 — 순서를 정해도 작업이 사라지거나 막히지 않는다(모르는 키 무시, 새 작업은 뒤에).
//  ② 저장 = task.meta.actionFlow(제출 받기는 'submission' 고정 키). task_action 에 두지 않는다
//     (작성자 전용 수정 → 공동 매니저가 못 바꾼다, 제출 받기엔 행이 없다).
//  ③ 임시 키(저장 전 새 작업)는 저장할 때 새 id 로 바뀐다.
//  ④ 연간 가져오기·복사 규칙표에 분류돼 있다(옛 연결 id 는 새 할 일에서 의미가 없다 → drop).
//
// 실행: npx tsx --tsconfig tsconfig.app.json scripts/action-flow-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SUBMISSION_FLOW_KEY,
  moveKey,
  orderByFlow,
  readActionFlow,
  resolveFlowKeys,
  sameFlow,
} from '../../src/features/task-workflow/utils/actionFlow';
import { TASK_META_ROLLOVER_POLICY } from '../../src/lib/workRollover';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const keys = (items: string[], flow: string[]) => orderByFlow(items, flow, (k) => k).join(',');

console.log('① 정렬');
check('순서가 없으면 원래 순서', keys(['submission', 'a', 'b'], []) === 'submission,a,b');
check('정한 순서대로', keys(['submission', 'a', 'b'], ['b', 'submission', 'a']) === 'b,submission,a');
check('순서 목록에 없는 새 작업은 뒤에 원래 순서로', keys(['submission', 'a', 'b', 'c'], ['b', 'a']) === 'b,a,submission,c');
check('사라진 키(해제된 연결)는 무시 — 작업이 사라지지 않는다', keys(['a', 'b'], ['gone', 'b', 'a']) === 'b,a');

console.log('② 읽기·이동');
check('모양이 깨진 값은 빈 순서', readActionFlow({ actionFlow: 'x' }).length === 0 && readActionFlow(null).length === 0);
check('문자열만·중복 제거', readActionFlow({ actionFlow: ['a', 1, 'a', '', 'b'] }).join() === 'a,b');
check('위로', moveKey(['a', 'b', 'c'], 'b', -1).join() === 'b,a,c');
check('아래로', moveKey(['a', 'b', 'c'], 'b', 1).join() === 'a,c,b');
check('끝에서는 그대로', moveKey(['a', 'b'], 'a', -1).join() === 'a,b' && moveKey(['a', 'b'], 'b', 1).join() === 'a,b');
check('없는 키는 그대로', moveKey(['a'], 'z', 1).join() === 'a');
check('같은 순서 판정', sameFlow(['a', 'b'], ['a', 'b']) && !sameFlow(['a', 'b'], ['b', 'a']));

console.log('③ 저장할 키');
const alive = new Set([SUBMISSION_FLOW_KEY, 'id-1', 'id-new']);
check(
  '임시 키 → 새 id, 빠진 것·연결 실패한 임시 키는 버린다',
  resolveFlowKeys(['tmp-1', 'submission', 'id-removed', 'tmp-failed', 'id-1'], { 'tmp-1': 'id-new' }, alive).join() ===
    'id-new,submission,id-1',
);

console.log('④ 규칙표·배선(정적)');
check('연간 가져오기·복사 규칙표에 actionFlow = drop', (TASK_META_ROLLOVER_POLICY as Record<string, string>).actionFlow === 'drop');
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const service = read('src/features/task-workflow/services/taskActionService.ts');
check('순서는 task.meta 에 병합 저장한다(다른 meta 키 보존)', /setTaskActionFlow[\s\S]*?\.\.\.\(\(current\?\.meta[\s\S]*?actionFlow: flow/.test(service));
check('0행(RLS 차단)을 오류로 만든다', /setTaskActionFlow[\s\S]*?!data\?\.length/.test(service));
const edit = read('src/components/tasks/TaskEditDialog.tsx');
check('할 일 편집 창은 화살표를 눌렀을 때만 순서를 저장한다', edit.includes('if (actionOrderTouched) {'));
check('저장할 때 임시 키를 새 id 로 바꾼다', edit.includes('resolveFlowKeys(actionOrder, createdActionIds, alive)'));
const panel = read('src/features/task-workflow/components/TaskActionPanel.tsx');
check('관리·사용 두 보기가 같은 순서 목록을 쓴다', (panel.match(/flowEntries\.map\(\(entry, index\)/g) ?? []).length === 2);
check('담당자에게 순서가 권장임을 말한다', panel.includes('번호는 권장 순서입니다. 마치면 내 할 일에서 완료를 체크하세요.'));
check('순서대로 하도록 막는 코드가 없다(강제하지 않는다)', !/disabled=\{[^}]*(previous|prev(ious)?Done|index > )/.test(panel));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
