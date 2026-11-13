// 업무 목록 «작업 줄» 회귀 (2026-10-06 사용자 결정 — 칩 기각, 글자로 된 작업 줄).
//
// 못 박는 것:
//  ① 줄 글 — 종류 이름(등록부) · 작업 이름(종류와 같으면 생략) · 관리 창과 같은 요약 · 순서 = actionFlow
//  ② 요청 상태 — 요청 전 / 보냄 · N명(사람 수, 빠진 사람 제외) / 마감, 못 읽는 사람에게는 상태 없음
//  ③ 렌더 — 작업이 있는 할 일에만 줄, 표·휴대폰 둘 다, [작업 함께 보기] 끄면 사라짐
//  ④ 배선 — 업무 목록 두 범위가 같은 래퍼를 쓴다
//
// 실행: npx tsx --tsconfig tsconfig.app.json --import ./scripts/css-stub.mjs scripts/work-action-lines-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { WorkTaskTable, type WorkTaskRow } from '../../src/components/tasks/WorkTaskTable';
import { actionLineState, buildActionLines, countRequestPeople } from '../../src/features/task-workflow/utils/actionOverview';
import type { TaskAction } from '../../src/features/task-workflow/types';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const A = (id: string, taskId: string, type: string, title: string, config: Record<string, unknown> = {}): TaskAction => ({
  id, task_id: taskId, created_by: 'me', action_type: type, handler_version: 1, title, description: null,
  execution_mode: 'manual', verification_mode: 'none', config, is_required: false, archived_at: null,
  created_at: `2026-10-0${id.length}T00:00:00Z`, updated_at: '2026-10-01T00:00:00Z',
} as unknown as TaskAction);

console.log('① 줄 글');
const actions = [
  A('a1', 't1', 'submit.file', '파일 제출 받기'),
  A('a2', 't1', 'collect.input', '과목별 출제 원안 점검 결과', { collect: {} }),
  A('a3', 't1', 'neis.screen', 'NEIS 업무 화면'),
  A('a4', 't2', 'document.spec_fill', '자동 양식', { origin: 'submission' }),
];
const meta = new Map<string, unknown>([['t1', { actionFlow: ['a2', 'a1'] }], ['t2', {}]]);
const lines = buildActionLines(actions, meta, new Map([['a2', { status: 'open', people: 12 }]]), () => true);
const t1 = lines.get('t1') ?? [];
check('순서 = actionFlow, 목록에 없는 것은 뒤', t1.map((l) => l.action.id).join() === 'a2,a1,a3', t1.map((l) => l.action.id).join());
check('종류 이름은 등록부에서', t1[0].typeLabel === '입력 받기' && t1[2].typeLabel === 'NEIS 업무 화면');
check('작업 이름이 종류와 같으면 비운다', t1[1].name === '' && t1[0].name === '과목별 출제 원안 점검 결과');
check('요약 = 관리 창과 같은 문장', typeof t1[0].summary === 'string' && t1[0].summary.length > 0);
check('값 제출용 자동 연결은 줄을 만들지 않는다', !lines.has('t2'));

console.log('② 요청 상태');
check('보냄 · 사람 수', t1[0].state?.label === '보냄 · 12명' && t1[0].state.tone === 'open');
check('요청 행이 없으면 요청 전', t1[1].state?.label === '요청 전');
check('요청을 보내지 않는 작업은 상태 없음', t1[2].state === null);
check('마감', actionLineState('submit.file', { status: 'closed', people: 3 }, true)?.label === '마감');
check('못 읽는 사람에게는 «요청 전»이라 하지 않는다', actionLineState('submit.file', undefined, false) === null);
const people = countRequestPeople([
  { action_id: 'x', resource_id: 'r1', holder_name: '갑', removed_at: null },
  { action_id: 'x', resource_id: 'r1', holder_name: '갑', removed_at: null },
  { action_id: 'x', resource_id: 'r2', holder_name: '을', removed_at: '2026-10-01' },
  { action_id: 'x', resource_id: null, holder_name: '병', removed_at: null },
]);
check('사람 수 = 같은 사람의 여러 줄은 한 명 · 빠진 사람 제외 · 미연결 이름도 센다', people.get('x') === 2, String(people.get('x')));

console.log('③ 렌더');
const task = (id: string, title: string) => ({ id, title, description: null, due_date: null, meta: {}, type: 'procedural', status: 'pending' }) as never;
const row = (id: string, title: string, n: number): WorkTaskRow => ({
  task: task(id, title), orderNumber: n, isOneTime: false, displayStatus: 'pending', assignees: [], isManager: true,
  canViewAssignees: true, deadlines: [], dueLabel: null,
});
const render = () => renderToStaticMarkup(React.createElement(TooltipProvider, null, React.createElement(WorkTaskTable, {
  rows: [row('t1', '1차 정기시험 문항 점검', 1), row('t9', '시험 원안 인쇄', 2)],
  isUpdating: false,
  onOpenDetail: () => {},
  renderAssigneeSummary: () => null,
  actionLines: lines,
  onOpenAction: () => {},
})));
const html = render();
check('작업 줄이 종류 이름으로 그려진다', html.includes('입력 받기') && html.includes('파일 제출 받기') && html.includes('NEIS 업무 화면'));
check('상태가 글로 보인다', html.includes('보냄 · 12명') && html.includes('요청 전'));
check('[열기]가 작업마다', (html.match(/aria-label="[^"]* 열기"/g) ?? []).length >= 6, String((html.match(/aria-label="[^"]* 열기"/g) ?? []).length));
check('[작업 함께 보기] 스위치 + 개수', html.includes('작업 함께 보기') && html.includes('aria-pressed="true"'));

console.log('④ 배선(정적)');
check('내가 책임자인 업무가 래퍼를 쓴다', read('src/components/tasks/IntegratedTaskView.tsx').includes('<WorkTaskTableWithActions'));
check('전체 업무도 같은 래퍼', read('src/components/tasks/WorkCard.tsx').includes('<WorkTaskTableWithActions'));
const wrapper = read('src/components/tasks/WorkTaskTableWithActions.tsx');
check('책임자가 아니면 설정 화면이 아니라 사용 보기', wrapper.includes("mode: usable ? 'runner' : 'panel'") && wrapper.includes('canManage(task) &&'));
check('조회는 업무 단위 한 번(행마다 아님)', read('src/features/task-workflow/hooks/useWorkActionOverview.ts').includes('useTaskActionsForTasks(taskIds)'));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
