// ========================================
// 온톨로지 객체 주소 — 「한 장 보기」 경로의 단일 출처 (2026-11-08, P0)
//
// 객체 종류는 설계 문서 §2·§3 의 목록이다. P0 는 «업무» 한 장만 그린다(할 일은 업무 한 장 안에서 강조).
// 다른 종류(공문·일정·서명 …)는 P1 의 링크 층과 함께 연다 — 그 전에는 링크를 만들지 않는다.
// ========================================

export const WORK_HOME_PATH = '/work';
export const OBJECT_BASE_PATH = '/work/o';

// budget_project = 예산 관리의 사업(2026-11-10) — SQL CHECK 은 20261110110000_budget_links.sql 이 정본
export const OBJECT_TYPES = ['work', 'task', 'official_doc', 'meeting', 'signature_request', 'document', 'budget_project'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

/** P0 에서 한 장 보기를 그릴 수 있는 종류 */
export const VIEWABLE_OBJECT_TYPES: readonly ObjectType[] = ['work'];

export const OBJECT_TYPE_LABEL: Record<ObjectType, string> = {
  work: '업무',
  task: '할 일',
  official_doc: '공문',
  meeting: '일정',
  signature_request: '서명',
  document: '문서',
  budget_project: '예산',
};

export function isObjectType(raw: string | null | undefined): raw is ObjectType {
  return !!raw && (OBJECT_TYPES as readonly string[]).includes(raw);
}

/** 한 장 보기 주소. 업무 안의 할 일 하나를 강조하려면 focusTaskId */
export function objectHref(type: ObjectType, id: string, focusTaskId?: string | null): string {
  const base = `${OBJECT_BASE_PATH}/${type}/${encodeURIComponent(id)}`;
  return focusTaskId ? `${base}?task=${encodeURIComponent(focusTaskId)}` : base;
}
