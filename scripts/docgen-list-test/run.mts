// 문서 생성 목록 회귀 — 2026-09-08 신설.
//
// 못 박는 것 셋:
//  ① **목록은 spec_fill WORK 전부다.** 업무 관리(워크플로 캔버스·업무 제출 양식)에서
//     만들어진 방식도 문서 생성 메뉴에 서야 한다(사용자 결정). 범위 판정은 서버 RLS
//     한 곳이므로, 조회에 `created_by`·`visibility` 조건을 다시 걸면 안 된다 —
//     그건 정책을 클라이언트에 복제하는 것이고, 정책이 바뀌면 화면만 조용히 어긋난다.
//  ② **업무 연결은 업무 관리에서만 한다.** 문서 생성에서 `task_id` 를 채우던 경로
//     (`setDocGenActionTask`·`DocGenTaskLinkDialog`)는 제거됐다. 되살아나면 여기서 걸린다.
//  ③ **제목이 유형 이름뿐인 행을 그대로 나열하지 않는다.** 캔버스는 노드에 이름을 묻지
//     않아 라이브 4행이 전부 'HWPX 스펙 기반 문서 생성' 이다 — 그대로 두면 제목이 같은
//     카드가 여러 장 서고, 어느 것이 무엇인지 화면이 말해 주지 못한다.
//
// 실행: npx tsx scripts/docgen-list-test/run.mts
import { readFileSync } from 'node:fs';
import {
  GENERIC_SPEC_FILL_TITLE,
  SPEC_FILL_WORK_TYPE,
  buildDocGenRows,
  canManageDocGenAction,
  docGenActionLabel,
  docGenActionSegment,
  docGenActionSource,
  filterDocGenRows,
  isDocGenPublic,
  isListedForOthers,
} from '../../src/features/document-generation/lib/docGenActionList';
import { getTaskActionDefinition } from '../../src/features/task-workflow/actionRegistry';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` — ${detail}`}`);
  if (!cond) fails += 1;
};

const ME = 'user-me';
const OTHER = 'user-other';

type AnyWork = Parameters<typeof buildDocGenRows>[0][number];

let seq = 0;
const action = (patch: Partial<AnyWork> & { config?: Record<string, unknown> }): AnyWork =>
  ({
    id: `w${++seq}`,
    task_id: null,
    created_by: ME,
    action_type: SPEC_FILL_WORK_TYPE,
    handler_version: 1,
    title: '방과후학교 운영계획서',
    description: null,
    execution_mode: 'assisted',
    verification_mode: 'human_review',
    config: {},
    is_required: false,
    archived_at: null,
    created_at: '2026-09-01T00:00:00+09:00',
    updated_at: '2026-09-01T00:00:00+09:00',
    ...patch,
  }) as AnyWork;

// ── ① 출신 판정 ─────────────────────────────────────────────────────────────
console.log('\n[출신] config.origin');
check('origin=docgen → docgen', docGenActionSource(action({ config: { origin: 'docgen' } })) === 'docgen');
check('origin 없음(캔버스 bindTaskAction) → task', docGenActionSource(action({ config: {} })) === 'task');
check(
  'origin=submission(업무 제출 양식) → task',
  docGenActionSource(action({ config: { origin: 'submission' } })) === 'task',
  '제출 양식도 업무 관리에서 만들어진 방식이다',
);

check('visibility=public 만 공개', isDocGenPublic(action({ config: { visibility: 'public' } })));
check('visibility 없으면 비공개(안전 기본)', !isDocGenPublic(action({ config: { origin: 'docgen' } })));

// ── ② 세그먼트는 전체의 분할이다 ────────────────────────────────────────────
console.log('\n[세그먼트] 항목 하나는 정확히 한 칸');
const mine = action({ config: { origin: 'docgen' }, created_by: ME });
const sharedByOther = action({ config: { origin: 'docgen', visibility: 'public' }, created_by: OTHER });
const canvasMine = action({ config: {}, created_by: ME, task_id: 't1', title: GENERIC_SPEC_FILL_TITLE });
const canvasOther = action({ config: {}, created_by: OTHER, task_id: 't2', title: GENERIC_SPEC_FILL_TITLE });
const submissionWork = action({ config: { origin: 'submission' }, created_by: OTHER, task_id: 't3' });

check('내가 문서 생성에서 만든 것 → mine', docGenActionSegment(mine, ME) === 'mine');
check('남이 공개한 문서 생성 방식 → shared', docGenActionSegment(sharedByOther, ME) === 'shared');
check('내가 캔버스에서 만든 것 → task', docGenActionSegment(canvasMine, ME) === 'task', '만든 사람이 아니라 만든 자리가 기준');
check('남이 캔버스에서 만든 것 → task', docGenActionSegment(canvasOther, ME) === 'task');
check('업무 제출 양식 → task', docGenActionSegment(submissionWork, ME) === 'task');

// ── ③ 관리 권한 = 내가 만들었는가 (2026-09-08 사용자 결정) ──────────────────
console.log('\n[관리 권한] 이 화면에서 고치고 지울 수 있는가');
check('내 문서 생성 방식 → 가능', canManageDocGenAction(mine, ME));
check(
  '내가 캔버스에서 만든 방식도 가능',
  canManageDocGenAction(canvasMine, ME),
  '서버는 원래 소유자에게 열려 있었다 — 업무에까지 미치는 것은 삭제 전에 말할 일',
);
check('남의 공개 방식 → 불가', !canManageDocGenAction(sharedByOther, ME));
check('남이 캔버스에서 만든 방식 → 불가', !canManageDocGenAction(canvasOther, ME));
check('로그인 정보가 아직 없으면 불가', !canManageDocGenAction(mine, null));

// ── ③-2 공개 토글: 기본값이 출신에 따라 반대다(양쪽 현행 보존) ─────────────
console.log('\n[공개] 목록에 세울지 — 기본값은 출신에 따라 반대');
check('docgen: 값이 없으면 목록에 안 선다', !isListedForOthers(action({ config: { origin: 'docgen' } })));
check(
  "docgen: 'public' 이면 선다",
  isListedForOthers(action({ config: { origin: 'docgen', visibility: 'public' } })),
);
check(
  '업무: 값이 없으면 선다',
  isListedForOthers(action({ config: {}, task_id: 't1' })),
  '원래 전 교직원이 읽고 실행하던 행이다 — 기본을 뒤집으면 목록에 세우기로 한 결정이 되돌려진다',
);
check(
  "업무: 'private' 이면 감춰진다",
  !isListedForOthers(action({ config: { visibility: 'private' }, task_id: 't1' })),
);
check(
  "docgen 도 'private' 이면 감춰진다(같은 코드 경로)",
  !isListedForOthers(action({ config: { origin: 'docgen', visibility: 'private' } })),
);

const hiddenMine = action({ config: { origin: 'docgen' }, created_by: ME, title: '감춘 내 방식' });
const hiddenOther = action({ config: { visibility: 'private' }, created_by: OTHER, task_id: 't9' });
const listedRows = buildDocGenRows([mine, hiddenMine, hiddenOther, canvasOther], { userId: ME });
check(
  '감춘 남의 방식은 목록에서 빠진다',
  !listedRows.some((r) => r.action.id === hiddenOther.id),
);
check(
  '감춘 내 방식은 나에게는 보인다',
  listedRows.some((r) => r.action.id === hiddenMine.id),
  '감춘 것을 되돌릴 유일한 자리다',
);

// ── ④ 카드 이름 ─────────────────────────────────────────────────────────────
console.log('\n[이름] 제목이 유형 이름뿐일 때');
check(
  'GENERIC_SPEC_FILL_TITLE 이 actionRegistry 와 같다',
  GENERIC_SPEC_FILL_TITLE === getTaskActionDefinition(SPEC_FILL_WORK_TYPE)?.title,
  '레지스트리 제목이 바뀌면 이 규칙이 조용히 멈춘다',
);
check(
  '사람이 지은 제목은 그대로 쓴다',
  docGenActionLabel({ title: '부서별 협의록' }, { taskTitle: '2학기 협의', templateName: '협의록 양식' }) ===
    '부서별 협의록',
);
check(
  '유형 이름뿐 → 연결된 업무 제목',
  docGenActionLabel({ title: GENERIC_SPEC_FILL_TITLE }, { taskTitle: '교수학습 계획 제출', templateName: '양식A' }) ===
    '교수학습 계획 제출',
);
check(
  '업무 제목을 못 읽으면 → 양식 이름',
  docGenActionLabel({ title: GENERIC_SPEC_FILL_TITLE }, { taskTitle: null, templateName: '공모신청서' }) ===
    '공모신청서',
);
check(
  '둘 다 없으면 원래 제목을 지어내지 않고 그대로',
  docGenActionLabel({ title: GENERIC_SPEC_FILL_TITLE }, {}) === GENERIC_SPEC_FILL_TITLE,
);
check('제목이 비었으면 (제목 없음)', docGenActionLabel({ title: '   ' }, {}) === '(제목 없음)');
check(
  '공백만 든 업무 제목은 후보가 아니다',
  docGenActionLabel({ title: GENERIC_SPEC_FILL_TITLE }, { taskTitle: '  ', templateName: '양식B' }) === '양식B',
);

// ── ⑤ 행 조립: 정렬·라벨·분할 ───────────────────────────────────────────────
console.log('\n[목록] 정렬과 분할');
const olderMine = action({
  config: { origin: 'docgen' },
  created_by: ME,
  title: '오래된 내 방식',
  created_at: '2026-08-01T00:00:00+09:00',
});
const actions = [canvasOther, sharedByOther, olderMine, mine, canvasMine];
const rows = buildDocGenRows(actions, {
  userId: ME,
  taskTitles: new Map([
    ['t1', '교수학습 계획 제출'],
    // t2 는 일부러 비운다 — 권한·삭제로 못 읽는 업무가 실제로 있다
  ]),
  templateNameOf: (w) => (w.id === canvasOther.id ? '공모신청서' : null),
});

check('행 수가 보존된다', rows.length === actions.length);
check(
  '정렬 = 내 방식 → 업무 → 공유받음',
  rows.map((r) => r.segment).join(',') === 'mine,mine,task,task,shared',
  rows.map((r) => r.segment).join(','),
);
check(
  '같은 칸 안에서는 최신 먼저',
  rows[0].action.id === mine.id && rows[1].action.id === olderMine.id,
);
check(
  '업무 제목을 읽은 캔버스 행은 그 이름으로 선다',
  rows.find((r) => r.action.id === canvasMine.id)?.label === '교수학습 계획 제출',
);
check(
  '업무 제목을 못 읽으면 양식 이름으로 폴백한다',
  rows.find((r) => r.action.id === canvasOther.id)?.label === '공모신청서',
);
check(
  '못 읽은 업무의 taskTitle 은 null 이다(빈 문자열이 아니라)',
  rows.find((r) => r.action.id === canvasOther.id)?.taskTitle === null,
);

const counts = { mine: 0, task: 0, shared: 0 } as Record<string, number>;
for (const r of rows) counts[r.segment] += 1;
check(
  '세그먼트 합 = 전체 (겹치거나 새는 항목이 없다)',
  counts.mine + counts.task + counts.shared === rows.length,
);
for (const seg of ['mine', 'task', 'shared'] as const) {
  check(
    `필터 '${seg}' 는 그 칸만 돌려준다`,
    filterDocGenRows(rows, { segment: seg }).every((r) => r.segment === seg) &&
      filterDocGenRows(rows, { segment: seg }).length === counts[seg],
  );
}
check("필터 'all' 은 전부", filterDocGenRows(rows, { segment: 'all' }).length === rows.length);

// ── ⑥ 검색은 카드에 보이는 것을 대상으로 ────────────────────────────────────
console.log('\n[검색] 카드에 보이는 단서로 찾힌다');
const hit = (q: string) => filterDocGenRows(rows, { segment: 'all', search: q }).map((r) => r.action.id);
check('업무 제목으로 찾힌다', hit('교수학습').includes(canvasMine.id), '유형 이름뿐인 행의 유일한 단서다');
check('양식 이름으로 찾힌다', hit('공모').includes(canvasOther.id));
check('대소문자를 가리지 않는다', hit('교수학습').length === hit('교수학습').length);
check('없는 말은 아무것도 안 준다', hit('존재하지않는말').length === 0);
check('빈 검색어는 거르지 않는다', filterDocGenRows(rows, { segment: 'all', search: '   ' }).length === rows.length);

// ── ⑦ 소스 규약 (되살아나면 여기서 걸린다) ──────────────────────────────────
console.log('\n[소스 규약] 업무 연결 제거 · RLS 가 범위');
const read = (p: string) => readFileSync(p, 'utf8');
const service = read('src/features/document-generation/services/docGenService.ts');
const page = read('src/features/document-generation/DocumentGenerationPage.tsx');
const hooks = read('src/features/document-generation/hooks/useDocGenActions.ts');

// 주석에는 남아 있어도 된다(왜 없앴는지가 기록이다) — 되살아난 **구현**을 잡는다
check(
  'setDocGenActionTask 구현이 없다',
  !/export\s+(async\s+)?function\s+setDocGenActionTask/.test(service),
);
check('서비스에 task_id 를 쓰는 경로가 없다', !/update\(\{\s*task_id/.test(service));
check('useSetDocGenActionTask 훅이 없다', !/export\s+function\s+useSetDocGenActionTask/.test(hooks));
check('DocGenTaskLinkDialog 를 쓰지 않는다', !/<DocGenTaskLinkDialog/.test(page));
check(
  "카드에 '업무 연결' 버튼이 없다",
  !/>\s*업무 연결\s*<\/Button>/.test(page) && !page.includes('setLinking'),
  '연결은 업무 관리에서만',
);

const listFn = service.slice(service.indexOf('export async function listDocGenActions'));
const listBody = listFn.slice(0, listFn.indexOf('\n}'));
check(
  'listDocGenActions 는 action_type·archived_at 만 건다',
  listBody.includes("eq('action_type'") && listBody.includes("is('archived_at', null)"),
);
check(
  'listDocGenActions 가 created_by 로 좁히지 않는다',
  !listBody.includes('created_by'),
  '범위는 task_action_select_teachers 가 정한다',
);
check(
  'listDocGenActions 가 origin·visibility 로 좁히지 않는다',
  !listBody.includes('contains('),
  '업무 관리에서 만든 방식이 다시 사라진다',
);

// 러너 흐름 — 행의 출신이 아니라 연 화면이 시작 단계를 정한다
const runner = read('src/features/task-workflow/components/SpecFillActionRunner.tsx');
check('러너가 docGenHost prop 을 받는다', runner.includes('docGenHost'));
check(
  '시작 단계 판정에 docGenFlow 를 쓴다',
  runner.includes('if (submissionMode || docGenFlow) setStep(\'plan\')'),
);
check(
  '기본 양식 자동 고정은 origin 기준을 유지한다',
  runner.includes('if (isDocGenAction && isWorkOwner)'),
  '업무에 매인 WORK 의 양식을 조용히 바꾸면 안 된다',
);
check('문서 생성 페이지가 docGenMode 로 연다', page.includes('docGenMode'));

// ── ⑧ 기본 양식은 문서 생성 경로에서 스스로 잡힌다 ──────────────────────────
//
// 세 창구(양식 첨부 / 기존 양식 선택 / 둘 다 비우고 나중에 고르기)가 모두 기본 양식으로
// 끝나야 카드의 [문서 만들기]가 늘 계획 검토부터 열린다. 종전에는 **새로 만든 양식만**
// 고정해서, 세 번째 경로로 만든 방식만 매번 양식 단계로 떨어졌다.
console.log('\n[기본 양식] 문서 생성 경로에서는 스스로 잡힌다');
check(
  '기존 양식을 처음 고른 경우도 고정한다',
  /if \(isDocGenAction && isWorkOwner && !defaultTemplate\) \{/.test(runner),
);
check(
  '이미 지정된 기본 양식은 덮어쓰지 않는다',
  runner.includes('!defaultTemplate'),
  '다른 양식을 잠깐 열어 본 것일 수 있다 — 바꾸는 것은 핀 버튼이 맡는다',
);
check(
  '새로 만든 양식 고정도 origin 기준을 유지한다',
  runner.includes('if (isDocGenAction && isWorkOwner) {'),
);
check(
  "기본 양식 문구가 화면에 따라 갈린다",
  runner.includes("docGenFlow ? '이 생성 방식' : '이 노드'"),
  '문서 생성 메뉴에는 노드가 없다',
);
check(
  "UI 문자열에 '이 노드의 기본 양식' 이 하드코딩돼 있지 않다",
  !/['`]이 노드의 기본 양식/.test(runner),
);

// ── ⑨ 삭제: 무엇이 사라지는지 먼저 말한다 ───────────────────────────────────
//
// 이 삭제는 카드 하나를 넘어선다 — 행이 하드 삭제되므로 **연결된 업무의 WORK 목록에서도
// 사라진다**(사용자 요구사항). `window.confirm` 으로는 그 사실도 숫자도 담을 수 없다.
console.log('\n[삭제] 카드 하나를 지우는 일이 아니다');
const workService = read('src/features/task-workflow/services/taskActionService.ts');
check('확인은 전용 모달이 맡는다', page.includes('<DocGenDeleteDialog'));
// 주석에서 "왜 안 쓰는지"를 설명하는 것은 기록이다 — 되살아난 **호출**을 잡는다
check('window.confirm 호출이 없다', !/window\.confirm\s*\(/.test(page));
const deleteDialog = read('src/features/document-generation/components/DocGenDeleteDialog.tsx');
for (const [what, needle] of [
  ['연결된 업무에서도 사라진다', 'WORK 목록에서도 사라집니다'],
  ['제출 양식 경고', 'isSubmissionForm'],
  ['실행 이력 건수', 'impact.runs'],
  ['남의 실행 결과 파일은 남는다', 'impact.otherRuns'],
  ['완성 문서는 목록에서 사라진다', '[완성 문서] 목록에서 찾을 수 없게'],
] as const) {
  check(`확인 모달이 ${what}를 말한다`, deleteDialog.includes(needle));
}
check(
  'AlertDialogAction 이 기본 닫기를 막는다',
  /e\.preventDefault\(\)/.test(deleteDialog),
  '막지 않으면 실패해도 모달이 사라져 원인을 알 수 없다',
);
check(
  'deleteTaskAction 는 내 RUN 만 RPC 로 지운다',
  /\.eq\('action_id', actionId\)\s*\n\s*\.eq\('created_by', user\.id\)/.test(workService),
  '남의 RUN 을 넘기면 P0002 로 거부돼 반쯤 삭제된 상태가 된다',
);
check(
  "공개 해제가 키 삭제가 아니라 'private' 기록이다",
  /visibility = isPublic \? 'public' : 'private'/.test(service),
  '업무 쪽 행은 키가 없는 것이 곧 공개라 삭제로는 감출 수 없다',
);

console.log(`\n${fails === 0 ? '모든 검사 통과' : `${fails}건 실패`}`);
process.exit(fails === 0 ? 0 : 1);
