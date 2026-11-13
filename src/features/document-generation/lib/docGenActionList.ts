// ========================================
// 문서 생성 목록의 순수 판정 (2026-09-08)
//
// 이 화면은 이제 **`document.spec_fill` WORK 를 전부** 보여 준다 — 문서 생성 메뉴에서
// 만든 것(`config.origin='docgen'`)과 **업무 관리에서 만든 것**(워크플로 캔버스 노드,
// 업무 제출 양식 `origin='submission'`)이 한 목록에 선다.
//
// ── 범위 판정을 클라이언트가 다시 쓰지 않는다 ───────────────────────────────
// `task_action_select_teachers` 가 이미
//     내가 만든 것  OR  (교직원 AND (origin ≠ 'docgen' OR visibility='public'))
// 이므로, `action_type` 과 `archived_at` 만 걸고 **한 번** 조회하면 서버가 이미 허용한 것이
// 그대로 온다. 종전의 두 조회(내 것 / 남의 공개분)는 그 정책을 클라이언트에 복제한 것이라
// 정책이 바뀌면 조용히 어긋난다. 목록을 넓힌다고 새 권한이 생기는 것이 아니다 —
// 업무 관리에서 만든 WORK 는 원래부터 전 교직원이 읽고 공유 실행할 수 있었다.
//
// ── 관리 권한은 만든 자리에 남는다 (사용자 결정 2026-09-08) ─────────────────
// 업무 연결·해제는 **업무 관리에서만** 한다. 그래서 업무에서 만들어진 방식은 여기서
// 실행만 하고 이름 수정·삭제·공개 전환은 하지 않는다(RLS 로는 소유자에게 열려 있지만,
// 그 행을 지우면 업무의 WORK 노드가 함께 사라진다 — 지우는 자리는 한 곳이어야 한다).
// ========================================

import { getTaskActionDefinition } from '@/features/task-workflow/actionRegistry';
import type { TaskAction } from '@/features/task-workflow/types';

export const SPEC_FILL_WORK_TYPE = 'document.spec_fill';

/** config.origin 마커 — 문서 생성 메뉴에서 만든 행에만 붙는다 */
export const DOCGEN_ORIGIN = 'docgen';

/** 어디서 만들어진 방식인가 — 관리 권한과 세그먼트가 여기서 갈린다 */
export type DocGenSource = 'docgen' | 'task';

type ConfigOnly = Pick<TaskAction, 'config'>;

export function docGenActionSource(action: ConfigOnly): DocGenSource {
  return (action.config as { origin?: unknown } | null)?.origin === DOCGEN_ORIGIN ? 'docgen' : 'task';
}

/**
 * `config.visibility === 'public'` 인가 — **원시 키 읽기**다.
 * 서버 정본은 위 SELECT 정책이고, 그 정책은 `origin='docgen'` 행에서만 이 값을 본다.
 * 목록 노출 판정에는 이것 말고 `isListedForOthers` 를 쓸 것.
 */
export function isDocGenPublic(action: ConfigOnly): boolean {
  return (action.config as { visibility?: unknown } | null)?.visibility === 'public';
}

/**
 * **남의 문서 생성 목록에 이 방식이 서는가** — 공개 토글이 실제로 정하는 것.
 *
 * 기본값이 출신에 따라 반대인 것은 **양쪽 모두 현행 동작을 보존**하기 위해서다:
 *   · `docgen` : 값이 없으면 **비공개**. 서버 RLS 가 정본이라 남에게 행 자체가 안 온다.
 *   · 업무 쪽  : 값이 없으면 **공개**. 이 행은 원래 전 교직원이 읽고 공유 실행하던 것이라,
 *               기본을 비공개로 뒤집으면 목록에 세우기로 한 결정(2026-09-08)이 되돌려진다.
 *
 * **업무 쪽 행에서 이 값은 "목록에 세울지"만 정한다** — 서버 접근 권한이 아니다.
 * `task_action_select_teachers` 는 `origin ≠ 'docgen'` 행에 visibility 를 묻지 않으므로,
 * 감춰도 그 업무의 WORK 패널에서는 종전대로 보이고 실행된다. **그래야 한다** —
 * 담당자가 못 쓰게 되면 업무가 깨진다. 화면 문구가 이 차이를 그대로 말해야 한다.
 */
export function isListedForOthers(action: ConfigOnly): boolean {
  const visibility = (action.config as { visibility?: unknown } | null)?.visibility;
  return docGenActionSource(action) === 'docgen' ? visibility === 'public' : visibility !== 'private';
}

/**
 * 이름 수정·삭제·공개 전환을 이 화면에서 할 수 있는가 = **내가 만들었는가**(2026-09-08).
 *
 * 종전에는 `origin='docgen'` 도 요구했다(업무의 WORK 노드를 여기서 지우면 그 업무에서도
 * 사라지므로 지우는 자리를 한 곳으로 두려던 것). 사용자 결정으로 **소유자에게 돌려줬다** —
 * 서버는 원래부터 소유자에게 열려 있었고(`task_action_update_own`/`delete_own`), 삭제가
 * 업무에까지 미치는 것은 **감출 일이 아니라 삭제 전에 말할 일**이다(`DocGenDeleteDialog`).
 */
export function canManageDocGenAction(
  action: Pick<TaskAction, 'config' | 'created_by'>,
  userId: string | null | undefined,
): boolean {
  return !!userId && action.created_by === userId;
}

export type DocGenSegment = 'all' | 'mine' | 'task' | 'shared';

/**
 * 세그먼트는 **전체의 분할**이다(항목 하나는 정확히 한 칸에 든다) — 겹치면 세면서
 * 어디를 봐야 할지 알 수 없다. 기준은 "어디서 만들어 어디서 관리하는가":
 *   mine   = 내가 문서 생성에서 만든 것
 *   task   = 업무 관리에서 만들어진 것(내 것이든 남의 것이든)
 *   shared = 다른 사람이 문서 생성에서 만들어 공개한 것
 */
export function docGenActionSegment(
  action: Pick<TaskAction, 'config' | 'created_by'>,
  userId: string | null | undefined,
): Exclude<DocGenSegment, 'all'> {
  if (docGenActionSource(action) === 'task') return 'task';
  return userId && action.created_by === userId ? 'mine' : 'shared';
}

/**
 * WORK 유형 이름 그대로인 제목 — 워크플로 캔버스는 노드에 **이름을 묻지 않고**
 * `actionRegistry` 의 유형 제목을 그대로 넣는다(`bindTaskAction`). 그래서 업무에서 만들어진
 * 행은 라이브에서 전부 'HWPX 스펙 기반 문서 생성' 이고, 그대로 나열하면 **제목이 같은
 * 카드 여러 장**이 된다. 이 값과 같으면 제목이 아니라 유형 이름이라고 본다.
 */
export const GENERIC_SPEC_FILL_TITLE =
  getTaskActionDefinition(SPEC_FILL_WORK_TYPE)?.title ?? 'HWPX 스펙 기반 문서 생성';

/**
 * 카드에 적을 이름. 제목이 유형 이름뿐이면 **연결된 업무 → 양식 이름** 순으로 대신한다.
 * 지어내지 않는다 — 셋 다 없으면 원래 제목을 그대로 쓴다.
 */
export function docGenActionLabel(
  action: Pick<TaskAction, 'title'>,
  hints: { taskTitle?: string | null; templateName?: string | null } = {},
): string {
  const title = (action.title ?? '').trim();
  if (title && title !== GENERIC_SPEC_FILL_TITLE) return title;
  const fallback = (hints.taskTitle ?? '').trim() || (hints.templateName ?? '').trim();
  return fallback || title || '(제목 없음)';
}

export interface DocGenActionRow {
  action: TaskAction;
  source: DocGenSource;
  segment: Exclude<DocGenSegment, 'all'>;
  canManage: boolean;
  /** 카드 제목 — `docGenActionLabel` 규칙 적용 후 */
  label: string;
  taskTitle: string | null;
  templateName: string | null;
}

/** 세그먼트 표시 순서 = 목록 정렬 순서(내 것 먼저, 그다음 업무, 마지막 공유) */
const SEGMENT_RANK: Record<Exclude<DocGenSegment, 'all'>, number> = { mine: 0, task: 1, shared: 2 };

export function buildDocGenRows(
  actions: TaskAction[],
  options: {
    userId: string | null | undefined;
    /** task_id → 업무 제목. 못 읽는 업무(권한·삭제)는 없는 것으로 둔다 */
    taskTitles?: Map<string, string> | null;
    /**
     * 기본 양식 이름 — `config.defaultTemplate` 접근을 여기서 되풀이하지 않으려고
     * 호출부(`getDefaultTemplate`)에서 받는다. 같은 키를 두 곳에서 읽으면 갈라진다.
     */
    templateNameOf?: (action: TaskAction) => string | null;
  },
): DocGenActionRow[] {
  const { userId, taskTitles, templateNameOf } = options;
  return actions
    // 소유자가 목록에서 감춘 방식은 남에게 보이지 않는다 — 내 것은 늘 보인다(감춘 것을
    // 되돌릴 유일한 자리다. 관리자 미리보기 컨트롤과 같은 이유)
    .filter((action) => (userId && action.created_by === userId) || isListedForOthers(action))
    .map((action) => {
      const taskTitle = action.task_id ? taskTitles?.get(action.task_id) ?? null : null;
      const templateName = templateNameOf?.(action) ?? null;
      const segment = docGenActionSegment(action, userId);
      return {
        action,
        source: docGenActionSource(action),
        segment,
        canManage: canManageDocGenAction(action, userId),
        label: docGenActionLabel(action, { taskTitle, templateName }),
        taskTitle,
        templateName,
      };
    })
    .sort((a, b) => {
      const rank = SEGMENT_RANK[a.segment] - SEGMENT_RANK[b.segment];
      if (rank !== 0) return rank;
      return b.action.created_at.localeCompare(a.action.created_at);
    });
}

/**
 * 검색은 **카드에 실제로 보이는 것**을 대상으로 한다 — 이름·설명뿐 아니라 업무 제목과
 * 양식 이름까지. 업무에서 만들어진 행은 제목이 유형 이름이라, 그 둘을 빼면 검색으로
 * 찾을 수 있는 단서가 사실상 없다.
 */
export function filterDocGenRows(
  rows: DocGenActionRow[],
  filter: { segment: DocGenSegment; search?: string },
): DocGenActionRow[] {
  const q = (filter.search ?? '').trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.segment !== 'all' && row.segment !== filter.segment) return false;
    if (!q) return true;
    return [row.label, row.action.title, row.action.description, row.taskTitle, row.templateName]
      .some((v) => (v ?? '').toLowerCase().includes(q));
  });
}
