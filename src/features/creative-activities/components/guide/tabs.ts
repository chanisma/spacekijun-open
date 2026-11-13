/**
 * 창체 세그먼트 상수 — 컴포넌트 파일(`shared.tsx`)과 분리해 둔다.
 *
 * 한 파일이 컴포넌트와 상수를 함께 내보내면 fast-refresh 가 깨진다
 * (업무 관리 안내의 `tabs.ts`, evalearn 의 `panelChromeStyles.ts` 가 같은 이유로 갈라져 있다).
 */

/**
 * 실제 `ActivitiesHeader` 의 세그먼트 순서 그대로.
 *
 * 두 번째 칸은 **역할에 따라 라벨이 다르다** — 교사는 `내 담당`, 학생은 `내 활동`
 * (`CreativeActivitiesPage` 의 `mineLabel`). 목업은 교사 화면을 그리므로 `내 담당`을 쓰고,
 * 그 사실은 안내 문구가 말한다.
 */
export const SCOPES = ['전체', '내 담당', '제안함', '탐구 탐색'];

/** 씬이 `ScopeBar active={SCOPE.browse}` 처럼 이름으로 쓴다 */
export const SCOPE = { browse: 0, mine: 1, proposals: 2, explore: 3 } as const;
