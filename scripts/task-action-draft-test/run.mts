// 할 일 편집 창의 작업(Action) 초안 회귀 — 2026-09-23 신설.
//
// 못 박는 것:
//  ① 저장 계획 — 삭제 → 추가 → 수정 순서, 남의 연결은 빼거나 고치지 않는다(RLS created_by),
//     해제하는 연결의 설정 변경은 버린다.
//  ② 추가 가능 목록 — 내가 이미 가진 유형은 빼되(UNIQUE task·사람·유형), 초안에서 해제한 것은 다시 허용.
//  ③ 값 제출용 자동 연결(origin=submission)은 목록에 따로 서지 않는다(제출 받기의 구현이다).
//  ④ 배선 — 제출 받기는 작업 목록의 한 항목이지만 저장은 종전대로 task.meta.submission,
//     할 일 목록 경로는 관리 보기를 끈다.
//
// 실행: npx tsx --tsconfig tsconfig.app.json scripts/task-action-draft-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AVAILABLE_TASK_ACTION_DEFINITIONS } from '../../src/features/task-workflow/actionRegistry';
import {
  EMPTY_ACTION_DRAFT,
  addableDefinitions,
  canRemoveAction,
  isDraftEmpty,
  listableActions,
  planActionDraft,
} from '../../src/features/task-workflow/utils/taskActionDraft';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};
const ME = 'user-me';
const OTHER = 'user-other';
const row = (id: string, type: string, createdBy: string, config: Record<string, unknown> = {}) =>
  ({ id, action_type: type, created_by: createdBy, config }) as never;
const neis = { version: 1 as const, screens: [] };

console.log('① 저장 계획');
const existing = [row('a1', 'neis.screen', ME), row('a2', 'document.spec_fill', OTHER), row('a3', 'link.notice_write', ME)];
const plan = planActionDraft(
  {
    adds: [{ tempId: 't', type: 'neis.screen', neis }],
    removeIds: ['a1', 'a2'],
    neisEdits: { a1: neis, a3: neis, a2: neis },
  },
  existing,
  ME,
);
check('남의 연결은 빼지 않는다', plan.removeIds.join() === 'a1');
check('해제하는 연결의 설정 변경은 버린다', !plan.neisUpdates.some((u) => u.actionId === 'a1'));
check('남의 연결은 고치지 않는다', !plan.neisUpdates.some((u) => u.actionId === 'a2'));
check('내 연결의 설정 변경은 남는다', plan.neisUpdates.map((u) => u.actionId).join() === 'a3');
check('추가는 그대로', plan.adds.length === 1);
check('로그인 정보가 없으면 아무것도 빼지 않는다', planActionDraft({ ...EMPTY_ACTION_DRAFT, removeIds: ['a1'] }, existing, null).removeIds.length === 0);
check('빈 초안', isDraftEmpty(EMPTY_ACTION_DRAFT) && !isDraftEmpty({ ...EMPTY_ACTION_DRAFT, removeIds: ['x'] }));
check('뺄 수 있는 사람 = 만든 사람', canRemoveAction(existing[0], ME) && !canRemoveAction(existing[1], ME));

console.log('② 추가 가능 목록');
const all = () => true;
const types = (defs: { type: string }[]) => new Set(defs.map((d) => d.type));
const base = types(addableDefinitions(AVAILABLE_TASK_ACTION_DEFINITIONS, { existing, draft: EMPTY_ACTION_DRAFT, userId: ME, canUse: all }));
check('내가 가진 한 개 유형은 뺀다', !base.has('link.notice_write'));
check('여러 개 유형(NEIS)은 가지고 있어도 또 추가할 수 있다', base.has('neis.screen'));
check('남이 가진 유형은 나도 추가할 수 있다(행이 따로다)', base.has('document.spec_fill'));
check('숨김(폐기) 유형은 뺀다', !base.has('link.timetable_data'));
const afterRemove = types(addableDefinitions(AVAILABLE_TASK_ACTION_DEFINITIONS, {
  existing, draft: { ...EMPTY_ACTION_DRAFT, removeIds: ['a3'] }, userId: ME, canUse: all,
}));
check('초안에서 해제한 유형은 다시 고를 수 있다', afterRemove.has('link.notice_write'));
const afterAdd = types(addableDefinitions(AVAILABLE_TASK_ACTION_DEFINITIONS, {
  existing: [], draft: { ...EMPTY_ACTION_DRAFT, adds: [{ tempId: 't', type: 'link.notice_write' }, { tempId: 'u', type: 'neis.screen' }] }, userId: ME, canUse: all,
}));
check('초안에 추가한 한 개 유형은 다시 안 나온다', !afterAdd.has('link.notice_write'));
check('초안에 추가한 여러 개 유형은 또 나온다', afterAdd.has('neis.screen'));
const noAdmin = types(addableDefinitions(AVAILABLE_TASK_ACTION_DEFINITIONS, {
  existing: [], draft: EMPTY_ACTION_DRAFT, userId: ME, canUse: (d) => !d.adminOnly,
}));
check('권한 없는 유형은 뺀다', !noAdmin.has('link.evalog_import') && noAdmin.has('neis.screen'));

console.log('③ 값 제출용 자동 연결');
const withSubmission = [...existing, row('s1', 'document.spec_fill', ME, { origin: 'submission' })];
check('목록에서 숨긴다', listableActions(withSubmission).every((a: { id: string }) => a.id !== 's1'));
check('그 밖의 연결은 그대로', listableActions(withSubmission).length === 3);

console.log('④ 배선(정적)');
const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const edit = read('src/components/tasks/TaskEditDialog.tsx');
check('할 일 편집 창이 작업 카드를 그린다', edit.includes('<TaskActionsSection'));
// 2026-10-05: 옛 제출 받기(task.meta.submission)를 화면에서 걷어 냈다 — 운영 0건, 제출은 「제출 받기」 작업이다.
//   편집 창이 다시 meta.submission 을 쓰기 시작하면 설정 자리가 둘이 된다(새 작업 + 옛 줄).
check('편집 창은 옛 제출 설정을 쓰지 않는다', !/submissionPatchFromDraft|SubmissionSettingsDialog|patchSubmission|formData\.submission/.test(edit));
check('작업 카드에 옛 제출 줄이 없다', !/kind: 'submission'|SubmissionSlot/.test(read('src/components/tasks/TaskActionsSection.tsx')));
check('옛 제출 체크박스는 사라졌다(설정 자리가 둘이 되지 않게)', !edit.includes('id="submission_required"'));
check('초안은 할 일 저장 뒤에 반영한다', edit.indexOf('applyTaskActionPlan(') > edit.indexOf('createTaskJsonbMutation.mutateAsync'));
check('반영 실패 시 창을 닫지 않는다', /failures\.length > 0\) \{[\s\S]*?return;/.test(edit));
const dialog = read('src/features/task-workflow/components/TaskActionDialog.tsx');
// 2026-10-01: 기본은 끔, 매니저 행(manageable)일 때만 켠다 — 관리 화면에서 작업 추가(사용자 요청)
check('할 일 목록 경로는 관리 보기를 끈다(매니저 행 예외)', dialog.includes('allowManage={manageable}') && /manageable = false/.test(dialog));
const panel = read('src/features/task-workflow/components/TaskActionPanel.tsx');
check('패널은 값 제출용 자동 연결을 목록에서 뺀다', panel.includes('listableActions(actions)'));
check('작업 패널에 옛 제출 받기 줄·설정 창이 없다', !/SubmissionSettingsDialog|제출 받기 \(이전 방식\)|kind === 'submission'/.test(panel));
check('사용 보기의 solid 버튼은 제출에만(나머지는 행 전체가 동작)', (panel.match(/bg-blue-600/g) ?? []).length <= 3 && panel.includes('function UseActionRow'));

// 2026-10-05 작업 붙이기 정리 — 오류 없이 조용히 틀리는 자리들
const section = read('src/components/tasks/TaskActionsSection.tsx');
check('NEIS 판정은 작업 유형으로(kind=external 이면 외부 시스템 작업까지 NEIS 로 오인)',
  section.includes("const isNeisType = (type: string | undefined) => type === 'neis.screen';")
  && !/definition\??\.kind (===|!==) 'external'/.test(section));
check('추가 목록은 분류별(등록부의 순서·라벨)', section.includes('TASK_ACTION_CATEGORY_ORDER.map(') && section.includes('TASK_ACTION_CATEGORY_META[category].label'));
check('저장 뒤 첫 작업의 설정 화면을 이어서 연다(편집 창 위에 겹쳐)',
  edit.includes('setFollowUp({ action, taskId, title: taskData.title })') && edit.includes('<TaskActionRunnerDialog')
  && /onOpenChange=\{\(next\) => \{ if \(!next\) closeAfterFollowUp\(\); \}\}/.test(edit));
check('이어 열 작업에서 NEIS 화면은 뺀다(이 창에서 이미 골랐다)', edit.includes("item.type !== 'neis.screen'"));
check('붙이기·떼기 이름 = «작업 연결»·«연결 해제»', section.includes('작업 연결') && section.includes('연결 해제') && !section.includes('작업 추가'));

console.log(fails === 0 ? '\n통과' : `\n실패 ${fails}건`);
process.exit(fails === 0 ? 0 : 1);
