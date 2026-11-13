// 할 일 담당자 바꾸기 계획 회귀 — 2026-10-01 신설 (내 업무 관리 표의 담당자 칸).
//
// 이 계획이 틀려도 오류는 나지 않는다 — 완료가 조용히 되돌아가거나(남는 사람의 상태를 새로 만듦),
// 범주 밖 사람이 과제 단위를 쥔 채 남는다. 그래서 순수 함수로 못 박는다.
//
// 실행: npx tsx scripts/task-assignee-edit-test/run.mts
import { planAssigneeEdit } from '../../src/lib/taskAssigneeEdit';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

const NOW = '2026-10-01T00:00:00.000Z';
const names: Record<string, string> = { a: '김가', b: '이나', c: '박다', d: '최라' };
const nameOf = (id: string) => names[id];

const person = (id: string, status: 'pending' | 'completed' = 'pending') => ({
  id, name: names[id], status, assigned_at: '2026-09-01T00:00:00.000Z',
  completed_at: status === 'completed' ? '2026-09-10T00:00:00.000Z' : null,
});

console.log('① 단일 마감 — 남는 사람은 그대로, 새 사람만 pending');
{
  const task = { due_date: '2026-10-10', meta: { assignees: [person('a', 'completed'), person('b')] } };
  const plan = planAssigneeEdit(task, ['a', 'c'], nameOf, NOW);
  const a = plan.assignees.find((x) => x.id === 'a');
  const c = plan.assignees.find((x) => x.id === 'c');
  check('남는 사람의 완료가 보존된다', a?.status === 'completed' && a?.completed_at === '2026-09-10T00:00:00.000Z');
  check('새 사람은 pending + 지금 배정', c?.status === 'pending' && c?.assigned_at === NOW && c?.name === '박다');
  check('추가·제외 집계', plan.added.map((p) => p.id).join() === 'c' && plan.removed.map((p) => p.id).join() === 'b');
  check('바뀜', plan.changed);
}

console.log('② 변화 없음');
{
  const task = { meta: { assignees: [person('a'), person('b')] } };
  const plan = planAssigneeEdit(task, ['b', 'a', 'a', ' '], nameOf, NOW);
  check('순서만 다르고 중복·빈 값은 무시 → 안 바뀜', !plan.changed && plan.added.length === 0 && plan.removed.length === 0);
}

console.log('③ 다중 마감 — 회차 기록에서 다시 파생');
{
  const task = {
    due_date: '2026-10-01',
    meta: {
      deadlines: ['2026-10-01', '2026-11-01'],
      deadlineProgress: {
        '2026-10-01': { a: { status: 'completed' } },
        '2026-11-01': { a: { status: 'completed' } },
      },
      assignees: [person('a', 'completed')],
    },
  };
  const plan = planAssigneeEdit(task, ['a', 'b'], nameOf, NOW);
  check('회차를 다 끝낸 사람은 완료 유지', plan.assignees.find((x) => x.id === 'a')?.status === 'completed');
  check('새 사람은 회차 기록이 없어 미완료', plan.assignees.find((x) => x.id === 'b')?.status === 'pending');
}

console.log('④ 과제 단위 — 단위를 맡은 사람은 뺄 수 없다');
{
  const task = {
    meta: {
      units: [{ key: 'u1', label: '국어' }, { key: 'u2', label: '수학' }],
      unitProgress: { u1: { a: { status: 'completed' } } },
      assignees: [person('a', 'completed'), person('b')],
    },
  };
  const blocked = planAssigneeEdit(task, ['b'], nameOf, NOW);
  check('단위 담당자를 빼면 막힌다', blocked.blockedUnitHolders.map((p) => p.id).join() === 'a');
  const free = planAssigneeEdit(task, ['a'], nameOf, NOW);
  check('단위 없는 범주 담당자는 뺄 수 있다', free.blockedUnitHolders.length === 0 && free.removed[0]?.id === 'b');
  const add = planAssigneeEdit(task, ['a', 'b', 'c'], nameOf, NOW);
  check('단위 파생: 내 단위 전부 완료면 완료 유지', add.assignees.find((x) => x.id === 'a')?.status === 'completed');
  check('단위 파생: 새 범주 담당자는 pending', add.assignees.find((x) => x.id === 'c')?.status === 'pending');
}

console.log("⑤ 뺀 사람의 '담당자 아님' 표시를 지운다");
{
  const task = {
    meta: {
      assignees: [person('a'), person('b')],
      assignmentIssues: { a: { reason: '제 일 아님' }, b: { reason: '역시' } },
    },
  };
  const plan = planAssigneeEdit(task, ['b'], nameOf, NOW);
  check('뺀 사람(a)의 표시만 지워진다', !!plan.assignmentIssues && !('a' in plan.assignmentIssues) && 'b' in plan.assignmentIssues);
  const keep = planAssigneeEdit(task, ['a', 'b', 'c'], nameOf, NOW);
  check('아무도 안 빠지면 건드리지 않는다(undefined)', keep.assignmentIssues === undefined);
}

console.log('⑥ 완료한 사람 제외 = 화면이 경고할 수 있게 상태를 넘긴다');
{
  const task = { meta: { assignees: [person('a', 'completed')] } };
  const plan = planAssigneeEdit(task, [], nameOf, NOW);
  check('제외 항목에 completed 상태', plan.removed[0]?.status === 'completed');
  check('전원 제외도 가능', plan.assignees.length === 0 && plan.changed);
}

console.log(fails === 0 ? '\n모두 통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
