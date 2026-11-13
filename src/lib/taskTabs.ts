/**
 * 업무 관리 — 페이지·보기·구 주소 대응의 **단일 출처** (2026-09-20 탭, 2026-10-05 페이지).
 *
 * ── 탭에서 페이지로 (2026-10-05 사용자 결정) ─────────────────────────────────────
 * 종전 `/tasks` 한 페이지의 탭 다섯은 각자의 주소를 가진 **페이지**가 됐고, 사이드바의
 * 「업무 관리」는 그 페이지들을 담는 **서랍(NavGroup)** 이 됐다. 「내 업무 관리」와 「업무 검색」은
 * 하나(「업무 목록」)로 합쳤다 — 같은 카드·표에 범위(내가 매니저인 업무 / 전체)만 달랐다.
 * 서랍을 누르면 업무 목록이 열린다(업무 흐름을 만든 사람은 1명뿐이었다 — 실측).
 * 근거 = `docs/plans/2026-10-05-task-ux-audit.md` §2-1.
 *
 * ── 수행과 관리를 갈랐다 (2026-09-21) ─────────────────────────────────────────
 * '내 할 일'은 배정된 일을 수행하는 도구라 **별도 메뉴 `/my-tasks`** 다(서랍 밖, 2026-10-05 유지).
 *
 * ⚠️ **구 값과 신 값이 교차한다.** `myWork`(구 = 내 할 일)와 `myWorks`(업무 목록)는
 * 한 글자 차이인데 가리키는 화면이 서로 다르다. 값 이행은 **부분 문자열 치환으로 할 수 없다** —
 * 값 전체가 정확히 일치할 때만 바꾼다. 회귀 `scripts/task-vocabulary-test/run.mts` 가 충돌 목록을 고정한다.
 *
 * 어휘 사전 = `docs/features/task-hierarchy.md` §3-1.
 */

/** `?task=` 딥링크의 할 일을 못 찾았을 때 — 내 할 일·업무 관리가 같은 문구를 쓴다 */
export const TASK_LINK_NOT_FOUND_MESSAGE = '링크의 할 일을 찾지 못했습니다. 삭제됐거나 볼 수 없는 할 일일 수 있습니다.';

/** '내 할 일'은 업무 관리의 페이지가 아니라 별도 메뉴다 */
/** 수행 화면 — 2026-11-12 부터 업무노트(/work)가 옛 «내 할 일»(/my-tasks, 이제 넘겨주기만)을 품는다 */
export const MY_TASKS_PATH = '/work';

/**
 * 업무 관리 페이지 — 서랍 메뉴와 라우트가 **둘 다** 이 표를 읽는다.
 *
 * ⚠️ **`adminOnly` 는 이 표가 유일한 출처다** (2026-09-25 사용자 결정 — 학교 전체는 관리자만).
 *   · 메뉴: 메뉴 카탈로그 기본값이 관리자만(`menuRegistry` — 관리자가 켜면 다른 대상에게도 열 수 있다)
 *   · 라우트: `resolveTaskPage(raw, isAdmin)` — 주소 직접 입력의 방어선
 *   (CLAUDE.md 「게이트는 두 곳이고 둘 다 필요하다」)
 * ⚠️ **순서 = 서랍 안 순서**다. 첫 줄이 서랍을 눌렀을 때 열리는 페이지다(`DEFAULT_TASK_PAGE`).
 */
export const TASK_PAGES = [
  { value: 'myWorks', label: '업무 목록', path: '/tasks/mine' },
  { value: 'workflow', label: '업무 흐름', path: '/tasks/workflow' },
  { value: 'timeline', label: '타임라인', path: '/tasks/timeline' },
  // 예산(2026-11-10) — 사업관리카드 · 계획 · 추경. 관리자 전용 페이지가 아니다(담당 교사가 쓴다) —
  // 처음 공개 범위는 메뉴 카탈로그 기본값(관리자만)이 정한다(docs/plans/2026-11-10-budget-management.md §7)
  { value: 'budget', label: '예산', path: '/tasks/budget' },
  { value: 'map', label: '학교 전체', path: '/tasks/map', adminOnly: true },
  // 공문 판단함 1단계 — 관리자 전용(2026-10-30 사용자 결정, docs/plans/2026-10-30-official-doc-triage.md)
  { value: 'docs', label: '공문 판단함', path: '/tasks/docs', adminOnly: true },
] as const;

export type TaskPageValue = (typeof TASK_PAGES)[number]['value'];

/** 서랍을 눌렀을 때·`/tasks` 로 들어왔을 때 열리는 페이지 */
export const DEFAULT_TASK_PAGE: TaskPageValue = 'myWorks';

/** 업무 관리의 뿌리 주소 — 페이지가 아니라 넘겨 주는 자리다(구 주소 `?tab=` 를 여기서 받는다) */
export const TASKS_ROOT_PATH = '/tasks';

export function taskPagePath(page: TaskPageValue): string {
  return TASK_PAGES.find((p) => p.value === page)?.path ?? TASK_PAGES[0].path;
}

/** 이 페이지는 관리자 전용인가 */
export function isAdminOnlyPage(value: string): boolean {
  return TASK_PAGES.some((page) => page.value === value && 'adminOnly' in page && page.adminOnly);
}

/** 주소 마지막 조각(`/tasks/:page` 의 `:page`) → 페이지 값. 모르는 조각이면 null */
export function taskPageFromSegment(segment: string | null | undefined): TaskPageValue | null {
  if (!segment) return null;
  const found = TASK_PAGES.find((page) => page.path === `${TASKS_ROOT_PATH}/${segment}`);
  return found ? found.value : null;
}

// ----------------------------------------
// 업무 목록의 범위 — 구 「내 업무 관리」·「업무 검색」을 합친 자리
// ----------------------------------------

/**
 * 업무 목록 안의 범위. 주소 `?scope=all` 이 전체 업무다(없으면 내가 매니저인 업무).
 * ⚠️ 범위마다 **할 수 있는 일이 다르다** — 전체 업무는 남의 업무도 보이는 곳이라 담당자 명단을
 *    숨기고(인원 수만), 상태 토글·진행 화면이 없다(종전 업무 검색 그대로). 합친 것은 «입구»이지 권한이 아니다.
 */
export const WORK_LIST_SCOPES = [
  { value: 'mine', label: '내가 책임자인 업무' },
  { value: 'all', label: '전체 업무' },
] as const;

export type WorkListScope = (typeof WORK_LIST_SCOPES)[number]['value'];

export const WORK_LIST_SCOPE_PARAM = 'scope';

export function workListScopeFrom(raw: string | null | undefined): WorkListScope {
  return raw === 'all' ? 'all' : 'mine';
}

// ----------------------------------------
// 보기(화면) 값 — 안내·내부 분기가 쓰는 값
// ----------------------------------------

/**
 * 화면 하나하나의 값. 페이지와 거의 같지만 **업무 목록은 범위에 따라 두 보기**다
 * (`myWorks` = 내가 매니저인 업무, `works` = 전체 업무 — 종전 탭 값 그대로라 구 주소·안내가 그대로 맞는다).
 * 사용 방법 안내(`TaskGuideDialog tab=`)는 이 값으로 고른다.
 */
export const TASK_TABS = [
  { value: 'workflow', label: '업무 흐름' },
  { value: 'timeline', label: '타임라인' },
  { value: 'myWorks', label: '내가 책임자인 업무' },
  { value: 'works', label: '전체 업무' },
  { value: 'budget', label: '예산' },
  { value: 'map', label: '학교 전체', adminOnly: true },
  { value: 'docs', label: '공문 판단함', adminOnly: true },
] as const;

export type TaskTabValue = (typeof TASK_TABS)[number]['value'];

/** 페이지 + 범위 → 보기 */
export function taskViewOf(page: TaskPageValue, scope: WorkListScope): TaskTabValue {
  return page === 'myWorks' && scope === 'all' ? 'works' : page;
}

/** 보기 → 그 보기를 여는 주소(범위 포함) */
export function taskViewHref(view: TaskTabValue): string {
  if (view === 'works') return `${taskPagePath('myWorks')}?${WORK_LIST_SCOPE_PARAM}=all`;
  return taskPagePath(view);
}

// ----------------------------------------
// 구 주소 대응 — `/tasks?tab=…` 북마크·밖으로 나간 링크
// ----------------------------------------

/**
 * 예전에 `/tasks?tab=` 으로 '내 할 일'을 가리키던 값들 → `/my-tasks`.
 * `myTasks` 는 2026-09-20~21 사이의 현행 값이었고, 나머지는 그 이전의 구 값이다.
 */
export const MY_TASKS_TABS: Record<string, typeof MY_TASKS_PATH> = {
  myTasks: MY_TASKS_PATH,
  myWork: MY_TASKS_PATH,
  integrated: MY_TASKS_PATH,
  analytics: MY_TASKS_PATH,
};

/**
 * 탭 시절보다 더 오래된 값 → 보기 값. 저장된 딥링크는 DB 에 0건이었으므로(공지 본문·알림 meta 전수 확인)
 * 받아 줄 것은 **사용자 북마크와 밖으로 나간 링크**뿐이다.
 */
export const LEGACY_TASK_TABS: Record<string, TaskTabValue> = {
  myEvents: 'myWorks',
  events: 'works',
};

const VIEW_VALUES = new Set<string>(TASK_TABS.map((tab) => tab.value));

/** 이 `?tab=` 값은 '내 할 일'을 가리키는가 — 참이면 `/my-tasks` 로 보내야 한다 */
export function isMyTasksTab(raw: string | null | undefined): boolean {
  return !!raw && Object.prototype.hasOwnProperty.call(MY_TASKS_TABS, raw);
}

/**
 * 구 주소 `/tasks?tab=…` 의 탭 값 → 지금의 보기. 모르는 값·없는 값이면 기본 페이지.
 * ⚠️ `isAdmin` 이 거짓이면 관리자 전용 보기는 기본 페이지로 — 주소 직접 입력의 방어선.
 */
export function viewFromLegacyTab(raw: string | null | undefined, isAdmin: boolean): TaskTabValue {
  const resolved: TaskTabValue = !raw
    ? DEFAULT_TASK_PAGE
    : VIEW_VALUES.has(raw) ? (raw as TaskTabValue) : LEGACY_TASK_TABS[raw] ?? DEFAULT_TASK_PAGE;
  return !isAdmin && isAdminOnlyPage(resolved) ? DEFAULT_TASK_PAGE : resolved;
}

/**
 * `/tasks/:page` 의 조각 → 실제로 열 페이지. 모르는 조각이면 기본 페이지, 관리자 전용인데 관리자가
 * 아니면 기본 페이지. 결과가 조각과 다르면 화면은 그 주소로 고쳐 쓴다(새로고침·공유 때 같은 자리로).
 */
export function resolveTaskPage(segment: string | null | undefined, isAdmin: boolean): TaskPageValue {
  const page = taskPageFromSegment(segment) ?? DEFAULT_TASK_PAGE;
  return !isAdmin && isAdminOnlyPage(page) ? DEFAULT_TASK_PAGE : page;
}
