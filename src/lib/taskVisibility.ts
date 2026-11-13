// ========================================
// 할 일의 «담당자에게 보이는 날» — 판정 단일 출처 (2026-10-05)
//
// 업무의 「대기」 상태를 대신한다(사용자 결정 — 업무가 아니라 **할 일 단위**). 종전 「대기」는
// 매니저가 «시작»으로 바꿔야만 담당자에게 보였다 → 잊으면 담당자는 영영 모른다. 날짜는 **저절로** 열린다.
//
// 저장 = `task.meta.visibleFrom` ('YYYY-MM-DD', 없거나 빈 값 = 바로 보임).
// 서버 `get_my_tasks_jsonb` 가 **같은 규칙**으로 담당자 목록에서 거른다(마이그레이션
// `20261005120000_task_visible_from.sql`) — 날짜 기준은 둘 다 **한국 날짜**다. 한쪽만 바꾸면
// 홈과 내 할 일이 서로 다른 날에 열린다(오류 없음).
//
// ⚠️ 이것은 «지금 볼 필요 없는 일을 치우는» 화면 편의이지 비밀이 아니다 — 업무 목록의 «전체 업무»는
//    교직원 전원이 보므로 거기서는 보인다. 매니저 화면(업무 목록·타임라인·흐름)은 언제나 보이고
//    「10/20부터 보임」 칩을 단다.
// ========================================

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

interface VisibilityLike {
  meta?: { visibleFrom?: string | null } | null;
}

/** 저장된 «보이는 날» — 형식이 틀리면 없는 것으로 본다(서버도 같은 정규식으로 거른다) */
export function taskVisibleFrom(task: VisibilityLike | null | undefined): string | null {
  const raw = task?.meta?.visibleFrom;
  return typeof raw === 'string' && DATE_KEY.test(raw) ? raw : null;
}

/** 오늘(한국 날짜) 'YYYY-MM-DD' — 서버의 `(now() at time zone 'Asia/Seoul')::date` 와 같은 날 */
export function todayKeyKst(now: Date = new Date()): string {
  // en-CA 는 'YYYY-MM-DD' 로 찍는다. 브라우저 시간대가 한국이 아니어도 한국 날짜로 판정한다
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** 담당자에게 아직 안 보이는가 — 보이는 날이 오늘보다 뒤일 때만 참 */
export function isHiddenFromAssignees(task: VisibilityLike | null | undefined, today: string = todayKeyKst()): boolean {
  const from = taskVisibleFrom(task);
  return !!from && from > today;
}

/** 매니저 화면의 칩 문구 — 「10/20부터 보임」 */
export function visibleFromLabel(task: VisibilityLike | null | undefined): string | null {
  const from = taskVisibleFrom(task);
  if (!from) return null;
  return `${Number(from.slice(5, 7))}/${Number(from.slice(8, 10))}부터 보임`;
}

/**
 * 편집 창 검증 — 보이는 날이 첫 마감보다 늦으면 담당자는 마감이 지난 뒤에야 할 일을 본다.
 * 막는 이유를 문장으로 돌려준다(없으면 null).
 */
export function visibleFromError(visibleFrom: string, deadlines: string[]): string | null {
  if (!visibleFrom) return null;
  if (!DATE_KEY.test(visibleFrom)) return '«담당자에게 보이는 날»의 날짜 형식이 올바르지 않습니다.';
  const first = [...deadlines].filter((d) => DATE_KEY.test(d)).sort()[0];
  if (first && visibleFrom > first) {
    return `«담당자에게 보이는 날»(${visibleFrom})이 첫 마감(${first})보다 늦습니다 — 담당자는 마감이 지난 뒤에야 이 할 일을 보게 됩니다.`;
  }
  return null;
}
