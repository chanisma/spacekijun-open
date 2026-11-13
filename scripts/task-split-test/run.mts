/**
 * 업무 관리 분리 회귀 (2026-09-21) — 수행(`/my-tasks`) ↔ 관리·조망(`/tasks`)
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/task-split-test/run.mts
 * (`--tsconfig` 없이 돌리면 .tsx 가 classic 런타임으로 컴파일돼 `React is not defined` 로 죽는다)
 *
 * 이 분리가 조용히 되돌아가는 자리들을 못 박는다:
 *   · 구 주소(`?tab=myTasks`·`myWork`)가 기본 탭으로 떨어져 **업무 흐름이 열린다**(오류 없음)
 *   · 내 업무에 완료 체크박스가 되살아나 수행 진입점이 다시 둘이 된다
 *   · [오늘] 섹션에 끼운 메뉴가 모바일 하단 5번째 칸(입시 정보)을 밀어낸다
 *   · 안내 씬의 포인터가 담당자 칩이 아닌 곳을 가리킨다
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_TASK_PAGE, LEGACY_TASK_TABS, MY_TASKS_PATH, MY_TASKS_TABS, TASK_PAGES, TASK_TABS, WORK_LIST_SCOPES,
  isAdminOnlyPage, isMyTasksTab, resolveTaskPage, taskPagePath, taskViewHref, taskViewOf, viewFromLegacyTab,
} from '../../src/lib/taskTabs';
import { regularNavSections, commonNavItems, isNavGroup, type NavSection } from '../../src/config/navigation';
import { pickMobileBottomItems } from '../../src/lib/navMobileLayout';
import { MANAGED_MENUS } from '../../src/config/menuRegistry';
import { SceneFind, SceneProgress } from '../../src/components/tasks/guide/myWorksScenes';
import { SceneInbox, SceneKinds, ScenePlanner } from '../../src/components/tasks/guide/myTasksScenes';
import { hasReportedNotMine, withoutReportedNotMine } from '../../src/lib/taskAssignmentIssue';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail: unknown = '') => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
};

console.log('[① 페이지 정본 (2026-10-05 탭 → 페이지)]');
// 업무 관리의 탭 다섯은 페이지 넷이 됐다 — 내 업무 관리 + 업무 검색 = 업무 목록(범위 둘)
// 2026-10-30: 공문 판단함(docs, 관리자 전용)이 학교 전체 뒤에 붙었다
// 2026-11-10: 예산(budget)이 타임라인 뒤에 — 관리자 전용 페이지가 아니다(공개 범위는 메뉴 카탈로그 기본값)
check('페이지는 여섯 — 업무 목록이 맨 앞(서랍을 누르면 열리는 곳), 관리자 전용 둘이 맨 뒤',
  TASK_PAGES.map((p) => p.value).join() === 'myWorks,workflow,timeline,budget,map,docs');
check('주소', TASK_PAGES.map((p) => p.path).join() === '/tasks/mine,/tasks/workflow,/tasks/timeline,/tasks/budget,/tasks/map,/tasks/docs');
check('예산은 관리자 전용 페이지가 아니다(담당 교사가 쓴다)', !isAdminOnlyPage('budget') && resolveTaskPage('budget', false) === 'budget');
check('기본 페이지 = 업무 목록', DEFAULT_TASK_PAGE === 'myWorks' && TASK_PAGES[0].value === DEFAULT_TASK_PAGE);
check('업무 목록 범위 = 내가 책임자인 업무 / 전체 업무', WORK_LIST_SCOPES.map((s) => s.value).join() === 'mine,all');
check('보기 = 페이지 + 범위', taskViewOf('myWorks', 'mine') === 'myWorks' && taskViewOf('myWorks', 'all') === 'works' && taskViewOf('workflow', 'all') === 'workflow');
check('전체 업무 보기의 주소', taskViewHref('works') === '/tasks/mine?scope=all' && taskViewHref('timeline') === '/tasks/timeline');
check("'내 할 일'은 업무 관리 페이지가 아니다", !TASK_PAGES.some((p) => (p.value as string) === 'myTasks') && !TASK_TABS.some((t) => (t.value as string) === 'myTasks'));
check('모르는 조각·빈 조각 → 기본 페이지', resolveTaskPage('nope', true) === 'myWorks' && resolveTaskPage(undefined, true) === 'myWorks');
check('현행 조각은 그대로', TASK_PAGES.every((p) => resolveTaskPage(p.path.split('/').pop(), true) === p.value));

// ── 「학교 전체」는 관리자만 (2026-09-25 사용자 결정) ──────────────────────
// ⚠️ 이 부류는 **막은 줄 알았는데 안 막힌 상태**가 화면에 아무 표시도 없이 남는다.
//    게이트가 둘(메뉴·주소)이라 한쪽만 고치기도 쉽다 → 정적 검사가 방어선이다.
check('map 은 관리자 전용으로 표시돼 있다', isAdminOnlyPage('map'));
check('나머지 셋은 전용이 아니다', ['myWorks', 'workflow', 'timeline'].every((v) => !isAdminOnlyPage(v)));
check('관리자 전용 페이지는 서랍 맨 끝', TASK_PAGES.slice(-2).map((p) => p.value).join() === 'map,docs');
check('docs(공문 판단함)도 관리자 전용', isAdminOnlyPage('docs') && resolveTaskPage('docs', false) === 'myWorks' && resolveTaskPage('docs', true) === 'docs');
check('비관리자가 구 주소 ?tab=docs 이어도 업무 목록', viewFromLegacyTab('docs', false) === 'myWorks');
check('비관리자가 /tasks/map 이면 업무 목록', resolveTaskPage('map', false) === 'myWorks');
check('관리자는 map 그대로', resolveTaskPage('map', true) === 'map');
check('비관리자가 구 주소 ?tab=map 이어도 업무 목록', viewFromLegacyTab('map', false) === 'myWorks' && viewFromLegacyTab('map', true) === 'map');
{
  // 게이트가 **둘 다** 배선돼 있는가 — 하나만 있으면 뚫리거나 죽은 메뉴가 남는다
  const map = MANAGED_MENUS.find((m) => m.key === taskPagePath('map'));
  check('메뉴: 학교 전체는 기본 = 관리자에게만', !!map && map.defaultVisibleToUsers === false && map.defaultVisibleToAdmin === true);
  const page = readFileSync('src/pages/TaskManagement.tsx', 'utf8');
  check('주소: 페이지 해석에 isAdmin 을 넘긴다', /resolveTaskPage\(pageSegment, isAdmin\)/.test(page));
  check('본문: 학교 전체는 isAdmin 일 때만 그린다', /activeTab === 'map' && isAdmin &&/.test(page));
  check('본문: 공문 판단함은 isAdmin 일 때만 그린다', /activeTab === 'docs' && isAdmin &&/.test(page));
  const docs = MANAGED_MENUS.find((m) => m.key === taskPagePath('docs'));
  check('메뉴: 공문 판단함은 기본 = 관리자에게만', !!docs && docs.defaultVisibleToUsers === false && docs.defaultVisibleToAdmin === true);
  const budget = MANAGED_MENUS.find((m) => m.key === taskPagePath('budget'));
  check('메뉴: 예산은 처음엔 관리자에게만(2026-11-10 결정)', !!budget && budget.defaultVisibleToUsers === false && budget.defaultVisibleToAdmin === true);
  // ⚠️ `isRealAdmin` 을 쓰면 미리보기가 얕아진다(관리자가 교사 시점에서도 페이지가 보인다)
  check('미리보기를 반영하는 isAdmin 을 쓴다', !/isRealAdmin/.test(page));
  const header = readFileSync('src/components/tasks/TaskHeader.tsx', 'utf8');
  check('머리글에 탭 줄이 없다(페이지 이동은 사이드바 서랍)', !/visibleTaskTabs|onTabChange|TAB_ICONS/.test(header));
  check('머리글의 범위 전환은 정본에서 생성한다', /WORK_LIST_SCOPES\.map\(/.test(header));
}

console.log('[② 구 주소]');
for (const v of ['myTasks', 'myWork', 'integrated', 'analytics']) {
  check(`?tab=${v} → 내 할 일`, isMyTasksTab(v) && MY_TASKS_TABS[v] === MY_TASKS_PATH);
}
check('보기 값은 내 할 일이 아니다', TASK_TABS.every((t) => !isMyTasksTab(t.value)));
// 한 글자 차이 — `myWork`(구 내 할 일) 와 `myWorks`(업무 목록)
check('myWorks 는 내 할 일로 새지 않는다', !isMyTasksTab('myWorks') && viewFromLegacyTab('myWorks', true) === 'myWorks');
check('구 탭 값 → 보기', viewFromLegacyTab('workflow', true) === 'workflow' && viewFromLegacyTab('works', true) === 'works'
  && viewFromLegacyTab('myEvents', true) === 'myWorks' && viewFromLegacyTab('events', true) === 'works');
check('탭 없는 구 주소 → 업무 목록', viewFromLegacyTab(null, true) === 'myWorks' && viewFromLegacyTab('', false) === 'myWorks');
check('두 표가 겹치지 않는다', Object.keys(MY_TASKS_TABS).every((k) => !(k in LEGACY_TASK_TABS)));
check('Object.prototype 키에 속지 않는다', !isMyTasksTab('constructor') && !isMyTasksTab('toString'));
check('빈 값', !isMyTasksTab(null) && !isMyTasksTab(''));
{
  const page = read('src/pages/TaskManagement.tsx');
  check('뿌리 /tasks 가 내 할 일 값을 <Navigate> 로 보낸다', /!pageSegment && isMyTasksTab\(legacyTab\)/.test(page) && /<Navigate to=\{query \?/.test(page));
  check('다른 파라미터(?task= 등)를 실은 채 보낸다', /rest\.delete\('tab'\)/.test(page) && /const rest = new URLSearchParams\(searchParams\)/.test(page));
  check('업무 검색(works)은 업무 목록의 전체 범위로', /if \(view === 'works'\) rest\.set\(WORK_LIST_SCOPE_PARAM, 'all'\)/.test(page));
  check('업무 관리에 내 할 일 화면이 남아 있지 않다', !/MyTaskInbox/.test(page));
  const app = read('src/App.tsx');
  check('라우트: 뿌리와 페이지가 같은 컴포넌트', /path="\/tasks" element=\{<ProtectedRoute allowed=\{FACULTY_ROLES\}><TaskManagement \/>/.test(app)
    && /path="\/tasks\/:page" element=\{<ProtectedRoute allowed=\{FACULTY_ROLES\}><TaskManagement \/>/.test(app));
  // 링크를 만드는 곳은 새 주소로 — 뿌리가 넘겨 주긴 하지만 그때 navigate state 는 사라진다
  check('진행 화면 링크는 업무 목록 페이지', /taskPagePath\('myWorks'\)/.test(read('src/lib/workPipelineLink.ts')));
  check('흐름 바로가기는 업무 흐름 페이지', /taskPagePath\('workflow'\)/.test(read('src/features/task-workflow/components/WorkflowLinkButton.tsx')));
  check('업무 흐름의 «저장 안 한 변경»이 페이지 이동(링크)도 막는다',
    /document\.addEventListener\('click', guardLink, true\)/.test(read('src/features/task-workflow/components/TaskWorkflowTab.tsx')));
}

console.log('[③ 라우트 · 메뉴]');
{
  const app = read('src/App.tsx');
  // 2026-11-12 «내 할 일»은 업무노트(/work)로 합쳤다 — 옛 주소는 ?task=·?collect= 를 실어 넘겨준다
  check('/my-tasks 는 업무노트로 넘겨준다(쿼리 보존)', /path="\/my-tasks" element=\{<MyTasksRedirect \/>/.test(app) && /<Navigate to=\{`\/work\$\{search\}\$\{hash\}`\} replace \/>/.test(app));
  check('화면 파일이 있다', existsSync(join(ROOT, 'src/features/work-ontology/TodayPage.tsx')));
  check('메뉴 항목 = 업무노트(옛 내 할 일 자리)', commonNavItems.workToday.href === MY_TASKS_PATH && !('myTasks' in commonNavItems));
  check('메뉴 카탈로그에 등록', MANAGED_MENUS.some((m) => m.key === MY_TASKS_PATH));
  check('대시보드 [전체 보기] 가 수행 화면(업무노트)으로 간다', /navigate\('\/work'\)/.test(read('src/features/teacher-dashboard/components/TeacherTasksCard.tsx')));

  // 모바일 하단 바 — 메뉴 순서와 따로 정한다(2026-10-25). 4번째 칸 = 수행 화면(2026-09-21 결정 · 2026-11-12 업무노트가 이어받음)
  const flatItems = regularNavSections.flatMap((s) => s.items.flatMap((e) => (isNavGroup(e) ? e.children : [e])));
  const bottom = pickMobileBottomItems(flatItems, null, 'teacher').map((i) => i.href);
  check('모바일 하단 기본 5칸 불변', bottom.join() === '/,/timetable,/schedule,/work,/ipsi', bottom);
  check('협업 보드는 전체 메뉴에 남는다', flatItems.some((i) => i.href === '/collab'));
}

console.log('[③-1 교사 데스크톱 메뉴 (2026-09-21 개편)]');
{
  const names = (id: string) => (regularNavSections.find((sec) => sec.id === id)?.items ?? []).map((e) => e.name);
  check('[오늘]에 협업 보드·플래너가 없다', !names('today').includes('협업 보드') && !names('today').includes('플래너'), names('today'));
  check('업무 관리(서랍)는 [오늘]의 업무노트(옛 내 할 일) 바로 다음', names('today').indexOf('업무 관리') === names('today').indexOf('업무노트') + 1 && names('today').indexOf('업무노트') >= 0 && !names('today').includes('내 할 일'), names('today'));
  // 2026-10-05 — 업무 관리가 서랍이 됐다. 내 할 일은 서랍 밖 독립 메뉴(같은 날 사용자 결정)
  const today = regularNavSections.find((sec) => sec.id === 'today')?.items ?? [];
  const tasksHub = today.find((e) => isNavGroup(e) && e.name === '업무 관리');
  check('업무 관리는 서랍이고 페이지 넷을 담는다', !!tasksHub && isNavGroup(tasksHub)
    && tasksHub.children.map((c) => c.href).join() === TASK_PAGES.map((p) => p.path).join());
  check('업무노트(수행 화면)는 서랍 밖', today.some((e) => !isNavGroup(e) && e.href === MY_TASKS_PATH));
  check('서랍 안 이름은 정본에서', !!tasksHub && isNavGroup(tasksHub) && tasksHub.children.map((c) => c.name).join() === TASK_PAGES.map((p) => p.label).join());
  check('페이지마다 메뉴 카탈로그에 등록', TASK_PAGES.every((p) => MANAGED_MENUS.some((m) => m.key === p.path)));
  check('협업 보드는 [도구] 맨 앞, 업무 관리는 [도구]에 없다', names('tools')[0] === '협업 보드' && !names('tools').includes('업무 관리'), names('tools'));
  // 면접 준비가 2026-09 에 합류했다 — 이 검사는 «학생이 쓰는 것만 여기 모인다»를 보는 것이지
  // 목록을 얼리는 것이 아니다(새 학생 메뉴가 생기면 여기에 더한다)
  check('[학생 메뉴] = 플래너 · 아카데미 · 면접 준비',
    names('student-menus').join() === '플래너,별빛 탐구 아카데미,면접 준비', names('student-menus'));
  const ids = regularNavSections.map((sec) => sec.id);
  check('[학생 메뉴]는 [관리] 바로 위', ids.indexOf('student-menus') === ids.indexOf('admin') - 1, ids);
  const hub = regularNavSections.find((sec) => sec.id === 'analytics')?.items[0];
  check('입시 분석 허브에서 아카데미가 빠졌다', !!hub && isNavGroup(hub) && !hub.children.some((c) => c.href === '/academy'));
  check('간격반복은 [학생 메뉴]로 주입된다(구 [학습] 섹션 없음)',
    // 주입 규칙은 2026-09-21 에 `lib/navAssembly.ts` 로 나갔다(관리 화면이 같은 함수를 쓴다)
    /student-menus[\s\S]{0,200}spacedRepetition/.test(read('src/lib/navAssembly.ts'))
      && /injectTeacherDynamicItems\(/.test(read('src/hooks/useNavSections.ts'))
      && !/id: 'learning'/.test(read('src/hooks/useNavSections.ts')) && !/id: 'learning'/.test(read('src/lib/navAssembly.ts')));
}

console.log('[④ 내 업무 = 관리 화면]');
{
  const view = read('src/components/tasks/IntegratedTaskView.tsx');
  check('완료 체크박스가 없다', !/<Checkbox/.test(view) && !/from '@\/components\/ui\/checkbox'/.test(view));
  check('담당자용 토글 함수가 없다', !/handleTaskToggle/.test(view) && !/useUpdateTaskStatusJsonb/.test(view));
  check('매니저인 업무만 보인다', /work\.userRole !== 'manager' && work\.userRole !== 'both'\) return false/.test(view));
  check('담당자이기만 한 업무를 다시 끌어들이지 않는다', !/userRole === 'assigned'/.test(view));
  check('표시 상태는 할 일 전체 기준', /useTaskDisplayHelpers\(null, NO_STATUS_OVERRIDES/.test(view));
  // 2026-09-24: 할 일 표시가 카드 → 표로 바뀌며 마크업이 `WorkTaskTable` 로 나갔다.
  // **불변식은 그대로**이므로 변수 이름이 아니라 «동작»을 두 파일에 걸쳐 본다.
  const table = read('src/components/tasks/WorkTaskTable.tsx');
  // 2026-09-26 사용자 결정: 표의 「내 할 일에서 수행 ↗」 바로가기는 뺐다(수행은 내 할 일 메뉴).
  //   남는 불변식 = 이 표에서는 수행할 수 없다(아래 «완료 토글이 없다»). 대신 제목=상세, [수정]=편집 창.
  check('제목을 누르면 상세가 열린다', /onClick=\{\(\) => onOpenDetail\(row\.task\)\}/.test(table));
  check('[수정]은 매니저 행에만', /row\.isManager && onOpenEdit &&/.test(table));
  check('매니저의 개입(남의 상태 토글)은 남아 있다', /canEditAll=\{[\w.]*isManager\}/.test(view));
  // 표로 바꾸면서 «완료 체크박스»가 되살아나지 않았는가 (2026-09-04 사고 재발 방지)
  // 2026-10-01 사용자 결정(2026-09-26 «연결 시 글자 버튼 / 아니면 워크플로 아이콘»을 뒤집음):
  //   연결된 작업은 **연결이 없어도 늘 렌치 아이콘만**(없으면 흐리게), 워크플로 바로가기는 업무 카드 머리에만.
  //   연결 판정 정본은 여전히 task_action 연결(workConnectedTaskIds)이지 워크플로 노드가 아니다.
  {
    const card = read('src/components/tasks/WorkCard.tsx');
    for (const [label, src] of [['내 업무 관리', view], ['업무 검색', card]] as const) {
      check(`${label}: 연결된 작업은 아이콘만(글자 버튼 아님)`, !/<TaskActionButton\s+variant="label"/.test(src));
      // 2026-10-05: 연결 판정은 task_action 연결 하나(옛 meta.submission 은 걷어 냈다) — 판정 단일 출처 hasConnectedActions
      check(`${label}: 연결 여부 = task_action 연결`, /connected=\{hasConnectedActions\(task, workConnectedTaskIds\)\}/.test(src));
      check(`${label}: 할 일 행에 워크플로 링크가 없다`, !/WorkflowLinkButton link=\{(workflowLinks\.tasks|taskWorkflowLinks)\[task\.id\]\}/.test(src));
    }
    // 2026-10-01: 담당자 칸에서 담당자 바꾸기 — 매니저 행만, 업무 검색(명단 비노출 탭)에는 두지 않는다
    check('담당자 바꾸기는 매니저 행에만', /onEdit=\{row\.isManager \? onEditAssignees : undefined\}/.test(table));
    check('업무 검색에는 담당자 바꾸기가 없다(명단 비노출)', !/onEditAssignees/.test(card));
    check('업무 이름을 누르면 상세', /setSelectedWork\(work\);\s*setWorkDetailOpen\(true\);[\s\S]{0,400}\{work\.name\}\s*<\/button\>/.test(view));
  }
  // 2026-09-27: 업무 검색 = 내 업무 관리와 같은 카드·같은 할 일 표. 남의 업무도 보이는 탭이다.
  {
    const list = read('src/components/tasks/WorkList.tsx');
    const card = read('src/components/tasks/WorkCard.tsx');
    check('업무 검색은 한 줄에 업무 하나(2열 그리드 아님)', !/xl:grid-cols-2/.test(list));
    check('업무 검색도 같은 할 일 표를 쓴다', /<WorkTaskTable/.test(card));
    check('두 화면이 같은 할 일 순서 함수를 쓴다',
      /sortWorkTasks/.test(card) && /sortWorkTasks/.test(view));
    check('업무 검색은 담당자 명단을 내보내지 않는다(개수만)',
      !/getInitials|assignee\.name|TaskAssigneeSummary/.test(card));
    check('업무 검색에도 완료 토글이 없다', !/onCheckedChange|handleTaskToggle|useToggleAssigneeStatus/.test(card));
    check('편집은 그 업무의 매니저에게만', /isManager && onWorkEdit &&/.test(card) && /isWorkManager\(/.test(card));
  }
  check('표에 완료 토글이 없다',
    !/onCheckedChange/.test(table) && !/handleTaskToggle/.test(table), '수행 진입점은 내 할 일 하나뿐');
}

console.log("[④-1 '담당자 아님' 표시 — 홈에는 없고 내 할 일에는 표시와 함께]");
{
  const mine = { id: 't1', meta: { assignmentIssues: { me: { reason: '타 부서', reportedAt: '2026-09-21' } } } };
  const theirs = { id: 't2', meta: { assignmentIssues: { other: { reason: 'x', reportedAt: '2026-09-21' } } } };
  const plain = { id: 't3', meta: {} };
  const noMeta = { id: 't4' };
  check('내가 표시한 것만 참', hasReportedNotMine(mine, 'me') && !hasReportedNotMine(theirs, 'me') && !hasReportedNotMine(plain, 'me') && !hasReportedNotMine(noMeta, 'me'));
  check('홈 목록에서 빠진다', withoutReportedNotMine([mine, theirs, plain, noMeta], 'me').map((t) => t.id).join() === 't2,t3,t4');
  // resource id 를 아직 모를 때(로딩 중) 전부 지우면 홈이 잠깐 비었다가 채워진다 — 아무것도 빼지 않는다
  check('id 를 모르면 아무것도 빼지 않는다', withoutReportedNotMine([mine, plain], null).length === 2 && withoutReportedNotMine([mine], undefined).length === 1);
  check('빈 입력', withoutReportedNotMine(null, 'me').length === 0 && withoutReportedNotMine(undefined, 'me').length === 0);
  check('null 로 지워진 표시는 표시가 아니다', !hasReportedNotMine({ meta: { assignmentIssues: { me: null } } }, 'me'));

  const index = read('src/pages/Index.tsx');
  // 2026-10-05 부터 끝난 업무의 할 일도 같은 자리에서 함께 거른다(서버가 «완료» 기록을 위해 싣는다)
  check('홈은 출처에서 한 번 거른다', /assigned_tasks: withoutReportedNotMine\(\s*\(rawMyTasksData\.assigned_tasks \?\? \[\]\)\.filter\(\(task\) => !isFromClosedWork\(task\)\),\s*currentResourceId,?\s*\)/.test(index));
  check('카드에는 거른 값만 내려간다', !/myTasksData=\{rawMyTasksData\}/.test(index));
  const inbox = read('src/components/tasks/MyTaskInbox.tsx');
  check('내 할 일은 거르지 않는다', !/withoutReportedNotMine/.test(inbox) && /buildMyTaskInbox\(data\?\.assigned_tasks/.test(inbox));
  check('내 할 일 행에 표시가 드러난다', /reportedNotMine && \(/.test(inbox) && inbox.includes('담당자 아님 표시함'));
  check('표시한 할 일의 주행동은 상세 보기다(완료 토글이 아니다)', /inactive \|\| reportedNotMine \|\|/.test(inbox));
  // 2026-11-12 업무노트의 «담당만 맡은 일»은 더 작은 행(dense, py-1.5) — 기본 행은 그대로 py-2
  check('행이 컴팩트하다(세로 패딩 py-2 · 작은 행 py-1.5)', /'px-3\.5 py-2 sm:px-5'/.test(inbox) && /'px-3\.5 py-1\.5 sm:px-5'/.test(inbox) && !/px-5 py-5/.test(inbox));
}

console.log('[⑤ 안내]');
{
  const dialog = read('src/components/tasks/guide/TaskGuideDialog.tsx');
  check('내 업무 안내가 체크박스를 말하지 않는다', !/MY_WORKS[\s\S]*?체크박스[\s\S]*?const MY_TASKS/.test(dialog));
  check('내 할 일 안내 = 확인·완료 → 제출·회차 → 계획표', /const MY_TASKS[\s\S]*<SceneInbox \/>[\s\S]*<SceneKinds \/>[\s\S]*<ScenePlanner \/>[\s\S]*const EVENTS/.test(dialog));
  check('임시 상자 그림이 남아 있지 않다', !/scene: <div className=/.test(dialog));

  // 렌더는 성공하고 그림만 틀리는 부류 — SSR 로 실제 마크업을 본다
  const find = renderToStaticMarkup(h(SceneFind));
  const progress = renderToStaticMarkup(h(SceneProgress));
  const inboxScene = renderToStaticMarkup(h(SceneInbox));
  const kinds = renderToStaticMarkup(h(SceneKinds));
  const planner = renderToStaticMarkup(h(ScenePlanner));
  check('씬 5편이 렌더된다', [find, progress, inboxScene, kinds, planner].every((m) => m.length > 500));
  // 2026-10-05 탭 줄 폐지 — 목업 머리글 왼쪽은 업무 목록의 범위 전환(실제 머리글과 같다)
  check('목업 머리글 = 범위 전환(내가 책임자인 업무 / 전체 업무)', find.indexOf('내가 책임자인 업무') >= 0 && find.indexOf('내가 책임자인 업무') < find.indexOf('전체 업무'));
  check('목업에 옛 탭 줄이 없다', !find.includes('>업무 흐름<') && !find.includes('>타임라인<') && !find.includes('>내 업무 관리<'));
  check('목업 머리글에 내 할 일이 없다', !/>내 할 일</.test(find));
  // 업무 「대기」는 2026-10-05 에 은퇴했다(숨김은 할 일의 «보이는 날») — 목업과 실제 머리글 둘 다에서 없어야 한다
  check('필터 문구가 실제 화면과 같다(대기 없음)', find.includes('완료된 업무') && !find.includes('대기 중 업무')
    && read('src/components/tasks/TaskHeader.tsx').includes('완료된 업무') && !read('src/components/tasks/TaskHeader.tsx').includes('대기 중 업무'));
  check('매니저 칩은 아바타 스택이다(내 상태 배지가 아니다)', !progress.includes('내 상태'));

  // 내 할 일 씬 — 실제 화면 문구와 같은가(기억으로 쓴 라벨은 없는 버튼을 안내하게 된다)
  const inboxSrc = read('src/components/tasks/MyTaskInbox.tsx');
  const headerSrc = read('src/components/tasks/TaskHeader.tsx');
  const myScenes = read('src/components/tasks/guide/myTasksScenes.tsx');
  for (const label of ['완료하기', '완료 취소', '상세 보기', '담당자 아님 표시함', '할 일 계획표', '마감일 미정', '회차별 완료', '과제 선택·완료']) {
    check(`씬 문구 "${label}" 이 실제 화면에 있다`, myScenes.includes(label) && inboxSrc.includes(label));
  }
  // 2026-10-05 옛 제출(task.meta.submission)을 걷어 냈다 — 제출 버튼의 동사는 collectInput.requestVerb 가 정한다
  const collectSrc = read('src/lib/collectInput.ts');
  check('씬의 [제출하기] = 실제 동사', myScenes.includes('label="제출하기"') && collectSrc.includes("'제출하기'") && inboxSrc.includes('requestVerb(pendingSubmits[0])'));
  check('씬에 옛 제출 화면 문구가 없다(제출 현황 →·파일 제출 버튼)', !myScenes.includes('제출 현황 →') && !myScenes.includes('label="파일 제출"'));
  check('헤더 문구(계획표 열기/접기)가 실제와 같다',
    headerSrc.includes("계획표 {plannerOpen ? '접기' : '열기'}") && myScenes.includes("'계획표 접기' : '계획표 열기'"));
  // 기능명·아이콘을 헤더에 쓰지 않는다 (2026-09-22 사용자 규약 — 사이드바·주소가 이미 어디인지 말한다).
  // 실제 헤더와 안내 목업이 **함께** 지켜야 한다 — 한쪽만 되살아나면 안내가 없는 화면을 가르친다.
  check('내 할 일 헤더에 기능명·설명·아이콘이 없다',
    !headerSrc.includes('MY_TASKS_LABEL') && !headerSrc.includes('ListTodo') && !headerSrc.includes('내게 배정된 할 일'));
  // 2026-10-05 업무 관리도 탭 줄이 없어져 첫 줄 왼쪽은 «그 화면의 첫 필터» 하나다(업무 목록 = 범위)
  check('내 할 일 헤더 첫 줄 왼쪽 = 상태 필터', /isMyTasks \? inboxFilterSegment : scopeSegment/.test(headerSrc));
  check('안내 목업도 기능명을 그리지 않는다',
    !/<b[^>]*>내 할 일<\/b>/.test(myScenes) && !myScenes.includes('내게 배정된 할 일') && !inboxScene.includes('내게 배정된 할 일'));
  check('내 할 일 씬은 업무 관리 탭 줄을 이지 않는다(별도 화면)', !/import \{[^}]*TabBar/.test(myScenes) && !/<TabBar/.test(myScenes) && !inboxScene.includes('업무 흐름'));
  // 씬 밖에서 렌더하면 시간 컨텍스트의 기본값(끝 상태)이 쓰인다 → SSR 은 **마지막 국면**을 그린다
  check('마지막 국면은 성공 판정(완료 → 완료 취소)으로 끝난다', inboxScene.includes('완료 취소') && inboxScene.includes('>완료<'));
  check('마지막 국면에 담당자 아님 안내가 떠 있다', inboxScene.includes('내 일이 아닌 것 같다면'));
  check('계획표는 열린 채 끝난다(관리 할 일 포함)', planner.includes('계획표 접기') && planner.includes('관리 · 성적 처리'));
  check('포인터가 행 버튼 자리를 유도해서 쓴다',
    /const A_DONE_BTN = rowBtnOf\(rowOf\(A_LIST, 0\)\)/.test(myScenes) && /inWindow\(WIN, A_DONE_BTN, CH\)/.test(myScenes)
      && /<Btn rect=\{A_DONE_BTN\}/.test(myScenes));
  check('계획표 토글도 같은 상수', /<Btn rect=\{C_TOGGLE\}/.test(myScenes) && /inWindow\(WIN, C_TOGGLE, CH\)/.test(myScenes));

  // 포인터 ↔ 목업: 칩 자리를 한 식(chipOf)에서 유도하는가
  const scenes = read('src/components/tasks/guide/myWorksScenes.tsx');
  check('포인터가 칩 자리를 유도해서 쓴다', /const M2_CHIP = inWindow\(M2_W, chipOf\(M2_CARD\), CH\)/.test(scenes) && /centerOf\(M2_CHIP\)/.test(scenes));
  check('명단 행과 포인터가 같은 식을 쓴다', /boxOf\(m2Row\(i\)\)/.test(scenes) && /inWindow\(M2_W, m2Row\(2\), CH\)/.test(scenes));
  check('목업 칩 높이와 포인터 칩 높이가 같은 상수다', (scenes.match(/CHIP_H/g) ?? []).length >= 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
