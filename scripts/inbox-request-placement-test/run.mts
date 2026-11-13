// 내 할 일 · 홈 카드의 요청 배치 회귀 (2026-10-05, 감사 문서 §4-1 · §4-9).
//
// 같은 제출 의무가 「요청」 구획 · 할 일 행 · 계획표에 2~3번 나왔다. 규칙(placeInboxRequests):
//   제출 요청이고 그 할 일이 지금 행으로 있으면 행이 맡는다 — 구획·계획표에서는 뺀다.
//   입력 요청 · 행이 없는 제출 요청은 구획이 맡고, 다 낸 것은 남은 것과 섞지 않는다.
//
// 실행: npx tsx --tsconfig tsconfig.app.json scripts/inbox-request-placement-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { placeInboxRequests, type MyCollectRequest } from '../../src/lib/collectInput';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const R = (id: string, kind: MyCollectRequest['kind'], taskId: string | null, done: number, total = 1, due: string | null = null): MyCollectRequest => ({
  action_id: id, kind, task_id: taskId, task_title: null, work_title: null, action_title: id, guide: null,
  due_date: due, visibility: 'private', answer_mode: 'individual', total, done, started_at: '2026-10-01T00:00:00Z',
} as MyCollectRequest);

console.log('① 배치');
const rows = new Set(['t1', 't2']);
const placed = placeInboxRequests([
  R('file-on-row', 'file', 't1', 0),
  R('doc-on-row', 'document', 't1', 0, 1, '2026-10-02'),
  R('file-on-row-done', 'file', 't2', 1),
  R('input-on-row-task', 'input', 't1', 0),
  R('file-no-row', 'file', 't9', 0, 1, '2026-10-03'),
  R('file-no-task', 'file', null, 0),
  R('input-done', 'input', null, 2, 2),
  R('empty-target', 'input', null, 0, 0),
], rows);
check('행이 있는 제출 요청은 행에', placed.rows.get('t1')?.map((r) => r.action_id).join() === 'doc-on-row,file-on-row', JSON.stringify([...placed.rows]));
check('행이 맡은 요청은 구획에 없다', !placed.section.some((r) => r.task_id === 't1' && r.kind !== 'input'));
check('행이 맡은 다 낸 요청은 어디에도 없다(행의 완료가 말한다)', !placed.rows.has('t2') && !placed.sectionDone.some((r) => r.action_id === 'file-on-row-done'));
check('입력 요청은 그 할 일이 행에 있어도 구획에', placed.section.some((r) => r.action_id === 'input-on-row-task'));
check('행이 없는 제출 요청은 구획에', placed.section.some((r) => r.action_id === 'file-no-row') && placed.section.some((r) => r.action_id === 'file-no-task'));
check('다 낸 요청은 sectionDone 으로 따로', placed.sectionDone.map((r) => r.action_id).join() === 'input-done');
check('대상 0명 요청은 어디에도 없다', ![...placed.section, ...placed.sectionDone].some((r) => r.action_id === 'empty-target'));
check('구획은 마감일 순(마감 없음은 뒤)', placed.section[0].action_id === 'file-no-row');

console.log('② 배선(정적)');
const inbox = read('src/components/tasks/MyTaskInbox.tsx');
check('내 할 일이 구획을 직접 그린다(어떤 요청을 행이 맡는지 아는 곳)', inbox.includes('<CollectRequestInbox requests={placed.section} doneRequests={placed.sectionDone}'));
check('페이지는 구획을 따로 그리지 않는다(두 번 그려지지 않게)', !read('src/features/work-ontology/TodayPage.tsx').includes('<CollectRequestInbox'));
check('행 = [제출하기]를 그리는 행(담당자 아님 제외)', inbox.includes('todo.filter(item => !hasReportedNotMine(item.task, resourceId))'));
check('계획표의 요청 = 구획의 남은 요청', inbox.includes('const plannedCollect = placed.section;'));
check('남은 요청이 있으면 «모두 마쳤습니다»를 띄우지 않는다', inbox.includes('const celebrate = allDone && requestsLeft === 0;') && inbox.includes('위 「요청」에 남은 것이'));
const section = read('src/features/task-workflow/components/collect/CollectRequestInbox.tsx');
check('구획 머리 숫자 = 남은 줄 수', section.includes('{requests.length}') && !section.includes('r.done < r.total).length'));
check('다 낸 요청은 접어 둔다', section.includes('다 낸 요청 {doneRequests.length}건'));
const card = read('src/features/teacher-dashboard/components/TeacherTasksCard.tsx');
check('홈 카드도 같은 규칙 — 그린 행의 제출은 행 칩', card.includes('placedRequests.rows.get(task.id)') && card.includes('남음`}'));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
