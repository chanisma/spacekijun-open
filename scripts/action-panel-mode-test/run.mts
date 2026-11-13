// 연결된 작업 패널 관리/사용 보기 회귀 — 2026-09-23 신설.
//
// 못 박는 것:
//  ① 보기 — 관리 권한 없으면 사용뿐 / 관리자지만 담당 아니면 관리뿐 / 둘 다면 토글, 기본은 진입점.
//  ② 사용 보기의 주 동작 — 서버가 RUN 쓰기를 허용하는 경우에만 실행 버튼(아니면 이유 문구).
//     버튼을 보여 놓고 서버가 42501 로 거절하면 담당자에게는 "고장"이다.
//  ③ 배선 — 할 일 목록 진입점은 'use', 업무 흐름 인스펙터는 기본 'manage'.
//
// 실행: npx tsx --tsconfig tsconfig.app.json scripts/action-panel-mode-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTaskActionDefinition } from '../../src/features/task-workflow/actionRegistry';
import {
  affordanceForUse,
  manageSummaryFor,
  resolvePanelModes,
  summaryForUse,
} from '../../src/features/task-workflow/utils/actionPanelMode';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

console.log('① 보기');
const m = (canManage: boolean, isAssignee: boolean, preferred: 'manage' | 'use') =>
  resolvePanelModes({ canManage, isAssignee, preferred });
check('관리 권한 없음 → 사용뿐(담당자여도)', JSON.stringify(m(false, true, 'manage')) === JSON.stringify({ modes: ['use'], initial: 'use' }));
check('관리 권한 없음·담당 아님 → 사용뿐(열람)', m(false, false, 'manage').modes.join() === 'use');
check('관리자·담당 아님 → 관리뿐(진입점이 use 여도)', JSON.stringify(m(true, false, 'use')) === JSON.stringify({ modes: ['manage'], initial: 'manage' }));
check('관리자·담당 → 토글, 할 일 목록에서 열면 사용 먼저', m(true, true, 'use').modes.length === 2 && m(true, true, 'use').initial === 'use');
check('관리자·담당 → 업무 흐름에서 열면 관리 먼저', m(true, true, 'manage').initial === 'manage');

console.log('② 사용 보기의 주 동작');
const act = (type: string, createdBy = 'owner', config: Record<string, unknown> = {}) =>
  ({ id: 'a', task_id: 't', created_by: createdBy, action_type: type, config, title: 't' }) as never;
const def = (type: string) => getTaskActionDefinition(type);
const viewer = (userId: string | null, can = true) => ({ userId, canUseDefinition: can });
check('NEIS → 누구에게나 안내 보기', affordanceForUse(act('neis.screen'), def('neis.screen'), viewer('someone', false)).kind === 'guide');
check('문서 생성 → 소유자가 아니어도 실행(공유 실행)', affordanceForUse(act('document.spec_fill'), def('document.spec_fill'), viewer('someone')).kind === 'run');
check('HWPX 직접 작성 → 소유자가 아니면 실행 불가(서버가 거절)', affordanceForUse(act('document.template_fill'), def('document.template_fill'), viewer('someone')).kind === 'none');
check('HWPX 직접 작성 → 소유자는 실행', affordanceForUse(act('document.template_fill', 'me'), def('document.template_fill'), viewer('me')).kind === 'run');
const adminOnly = affordanceForUse(act('link.evalog_import', 'me'), def('link.evalog_import'), viewer('me', false));
check('관리자 전용 기능 → 권한 없으면 이유를 말한다', adminOnly.kind === 'none' && adminOnly.reason.includes('관리자 전용'));
const label = (type: string) => { const a = affordanceForUse(act(type, 'me'), def(type), viewer('me')); return a.kind === 'run' ? a.label : a.kind; };
check('바로가기형(link) → 소유자는 기능 화면 열기', label('link.exam_supervision') === '기능 화면 열기');
check('모달형(embed, 이름이 link.* 여도) → 열어서 처리하기', label('link.notice_write') === '열어서 처리하기');
check('실행형(runner) → 실행하기', label('document.template_fill') === '실행하기');
check('로그인 정보가 없으면 소유자로 보지 않는다', affordanceForUse(act('link.notice_write', 'me'), def('link.notice_write'), viewer(null)).kind === 'none');

console.log('③ 요약 문구');
const neis = { neis: { version: 1, screens: [{ key: 'k', name: '과목별출결관리', path: ['a', 'b', 'c', 'd'] }], note: '마감까지' } };
check('관리 요약 — NEIS 는 가리키는 화면', manageSummaryFor(act('neis.screen', 'o', neis), def('neis.screen')).startsWith('과목별출결관리'));
check('관리 요약 — NEIS 화면 미지정이면 할 일을 말한다', manageSummaryFor(act('neis.screen'), def('neis.screen')).includes('화면 미지정'));
check('관리 요약 — 문서 생성은 기본 양식', manageSummaryFor(act('document.spec_fill', 'o', { defaultTemplate: { id: 'x', name: '출장 복명서' } }), def('document.spec_fill')) === '기본 양식 · 출장 복명서');
check('사용 요약 — NEIS 에 안내가 있으면 안내', summaryForUse(act('neis.screen', 'o', neis), def('neis.screen')) === '마감까지');
const noNote = { neis: { version: 1, screens: [{ key: 'k', name: '과목별출결관리', path: ['교무업무', '교무학사(고)', '학적', '출결관리'] }] } };
const pathSummary = summaryForUse(act('neis.screen', 'o', noNote), def('neis.screen'));
check('사용 요약 — 안내가 없으면 메뉴 경로(제목의 화면 이름을 되풀이하지 않는다)', pathSummary === '교무학사(고) › 학적 › 출결관리' && !pathSummary.includes('과목별출결관리'), pathSummary);

console.log('④ 배선(정적)');
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
// 2026-10-01: 관리 화면의 매니저 행(manageable)만 관리 보기로 연다(연결된 작업에서 작업 추가). 그 밖은 종전대로 사용 보기.
{
  const dlg = read('src/features/task-workflow/components/TaskActionDialog.tsx');
  check('할 일 목록 진입점(TaskActionDialog)은 사용 보기가 기본', /manageable = false/.test(dlg) && dlg.includes("defaultMode={manageable ? 'manage' : 'use'}"));
  const btn = read('src/features/task-workflow/components/TaskActionButton.tsx');
  check('버튼도 기본은 관리 보기 아님', /manageable = false/.test(btn));
  // 관리 보기를 켜는 곳은 매니저 판정과 함께만 — 홈·상세 경로에 manageable 이 새어 나가지 않게
  for (const [p, re] of [
    ['src/components/tasks/IntegratedTaskView.tsx', /manageable=\{checkIsWorkManager\(/],
    ['src/components/tasks/WorkCard.tsx', /manageable=\{isManager\}/],
  ] as const) check(`${p.split('/').pop()}: manageable 은 매니저 판정으로만`, re.test(read(p)));
  for (const p of ['src/components/tasks/TaskDetailDialog.tsx', 'src/features/teacher-dashboard/components/TeacherDashboardBriefing.tsx']) {
    try { check(`${p.split('/').pop()}: 관리 보기를 켜지 않는다`, !/manageable/.test(read(p))); } catch { /* 파일이 없으면 건너뛴다 */ }
  }
}
const inspector = read('src/features/task-workflow/components/WorkflowInspector.tsx');
check('업무 흐름 인스펙터는 기본(관리)을 바꾸지 않는다', !inspector.includes('defaultMode="use"'));
const panel = read('src/features/task-workflow/components/TaskActionPanel.tsx');
check('작업 연결 버튼은 관리 보기에만 있다', /mode === 'manage' \? \([\s\S]*?작업 연결[\s\S]*?\) : flowEntries\.length > 0/.test(panel));
check('토글은 보기가 둘일 때만', panel.includes('panelModes.modes.length > 1'));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
