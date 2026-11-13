// 내 할 일 — 완료 목록 업무별 묶음 회귀 (2026-09-24)
//   npx tsx --tsconfig tsconfig.app.json scripts/my-task-inbox-test/run.mts
// 사용자 결정: 완료한 할 일은 업무별로 묶고, **최근에 완료한 할 일이 든 업무가 위**.
import { readFileSync } from 'node:fs';
import { completedAtOf, groupCompletedByWork, shortDate, type InboxTask } from '../../src/components/tasks/taskInboxUtils';
import type { Task } from '../../src/types/tasks';

let pass = 0;
function ok(cond: boolean, name: string) {
  if (!cond) { console.error('  ✗', name); process.exit(1); }
  console.log('  ✓', name); pass++;
}

const ME = 'me';
const task = (id: string, work: string, workName: string, completedAt: string | null, updatedAt = '2026-01-01T00:00:00Z'): InboxTask => ({
  task: {
    id, title: id, event_id: work, event_name: workName, updated_at: updatedAt,
    meta: { assignees: [{ id: ME, name: '나', status: 'completed', completed_at: completedAt ?? undefined }] },
  } as unknown as Task,
  status: 'completed',
  group: 'completed',
  due: null,
});

const items = [
  task('a1', 'A', '정보공시', '2026-09-01T03:00:00Z'),
  task('b1', 'B', '정기시험', '2026-09-20T03:00:00Z'),
  task('a2', 'A', '정보공시', '2026-09-22T03:00:00Z'),
  task('c1', 'C', '연수', null, '2026-09-10T03:00:00Z'), // 내 기록이 없으면 수정 시각
  task('b2', 'B', '정기시험', '2026-09-05T03:00:00Z'),
];
const groups = groupCompletedByWork(items, ME);
ok(groups.map((g) => g.workName).join() === '정보공시,정기시험,연수', '최근에 완료한 할 일이 든 업무가 위(정보공시 09-22 > 정기시험 09-20 > 연수 09-10)');
ok(groups[0].items.map((i) => i.task.id).join() === 'a2,a1', '업무 안에서도 최근 완료가 위');
ok(groups[1].items.map((i) => i.task.id).join() === 'b1,b2', '업무 안 정렬(정기시험)');
ok(groups[2].lastCompletedAt === '2026-09-10T03:00:00Z', '내 완료 기록이 없으면 할 일 수정 시각(매니저가 직접 완료)');
ok(groups.reduce((n, g) => n + g.items.length, 0) === items.length, '빠지는 할 일이 없다');
ok(completedAtOf(items[0].task, ME) === '2026-09-01T03:00:00Z', '완료 시각 = 내 담당자 기록');

// UTC 로 저장된 완료 시각 — KST 00~09시 완료가 전날로 보이면 안 된다
const kstMorning = new Date(2026, 8, 24, 1, 30).toISOString(); // 로컬 09-24 01:30
ok(shortDate(kstMorning) === '09.24', '완료일은 로컬 날짜(문자열을 자르면 UTC 전날이 된다)');
ok(shortDate('') === '' && shortDate('nope') === '', '모르는 날짜는 빈 문자열');

const inbox = readFileSync(new URL('../../src/components/tasks/MyTaskInbox.tsx', import.meta.url), 'utf8');
ok(inbox.includes("filter === 'completed' ? (") && inbox.includes('<CompletedByWork'), '완료 보기는 업무별 묶음으로 그린다');
// 구획 없음 (2026-09-26 사용자 결정) — 구획 이름을 그리지 않고, 순서만 구획 순서를 따른다
ok(!/group\.label/.test(inbox) && inbox.includes('inboxGroups.flatMap('), '구획 제목 없이 한 목록(순서는 구획 순서)');
ok(/COMPLETED_WORKS_OPEN = \d/.test(inbox), '처음에는 최근 업무 몇 개만 펼친다');

// 목록 열 (2026-09-26) — 머리글과 행이 **같은 열 상수**를 써야 칸이 맞는다. 어긋나도 오류가 없다.
ok(/const ROW_GRID = 'sm:grid sm:grid-cols-\[/.test(inbox) && !inbox.includes('ROW_GRID_IN_WORK'), '열 구성은 상수 하나');
ok((inbox.match(/\bROW_GRID\b(?! =)/g) ?? []).length === 2, '머리글과 행이 같은 열 상수를 쓴다');
ok(/<ClampedText text=\{workLabel\} className="mt-0.5 hidden[^"]*sm:block"/.test(inbox), '데스크톱: 업무 이름은 할 일 이름 아래 줄(따로 된 열이 아니다)');
// 할 일 목록의 머리글은 진행률을 받는다(2026-10-05) — 속성이 붙어도 «한 번»이라는 뜻은 같다
ok((inbox.match(/<InboxListHeader(?! inWorkGroup)[^>]*\/>/g) ?? []).length === 1 && inbox.includes('<InboxListHeader inWorkGroup />'), '열 머리글은 한 번(완료 묶음은 따로)');
ok(/<ClampedText\s+text=\{task\.title\}\s+onClick=\{\(\) => onDetail\(task\)\}/.test(inbox), '제목 = 상세, 0.5초 머물면 전문(ClampedText)');

// 창이 좁아질 때 할 일이 아니라 상태가 줄어야 한다 (2026-09-26 사용자 지적 — minmax(0,1fr) 이면 제목만 사라진다)
ok(/const ROW_GRID = 'sm:grid sm:grid-cols-\[1rem_minmax\((?!0,)\d+rem,1fr\)/.test(inbox), '할 일 열에 하한이 있다');

console.log(`\n${pass}건 통과`);
