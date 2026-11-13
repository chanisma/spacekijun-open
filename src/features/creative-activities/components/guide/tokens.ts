/**
 * 창체 안내 씬의 색 상수 — 컴포넌트 파일(`shared.tsx`)과 분리해 둔다.
 *
 * 한 파일이 컴포넌트와 상수를 함께 내보내면 fast-refresh 가 깨진다
 * (같은 이유로 세그먼트 상수는 `tabs.ts` 에 있다).
 *
 * **값의 정본은 앱 코드다.** 영역 색은 `utils/activityLabels.ts` 의 `AREA_TONES`
 * (자율·진로=amber · 동아리=violet · 봉사=emerald)를 tailwind 램프의 hex 로 옮긴 것이고,
 * 계보 색은 `N년째` 배지와 `이어가기` 가 쓰는 fuchsia 다. 앱에서 색이 바뀌면 여기도 고친다.
 */

export type AreaKey = 'autonomy_career' | 'club' | 'service';

export const AREA: Record<AreaKey, {
  label: string; fg: string; bg: string; bd: string; fill: string;
}> = {
  autonomy_career: { label: '자율·진로', fg: '#b45309', bg: '#fffbeb', bd: '#fde68a', fill: '#f59e0b' },
  club: { label: '동아리', fg: '#6d28d9', bg: '#f5f3ff', bd: '#ddd6fe', fill: '#8b5cf6' },
  service: { label: '봉사', fg: '#047857', bg: '#ecfdf5', bd: '#a7f3d0', fill: '#10b981' },
};

/** 계보 — 실제 화면의 `N년째` 배지와 `이어가기` 가 쓰는 fuchsia */
export const LINEAGE = { fg: '#a21caf', bg: '#fdf4ff', bd: '#f5d0fe' };
