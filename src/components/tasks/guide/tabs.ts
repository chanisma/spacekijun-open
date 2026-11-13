/**
 * 안내 씬이 쓰는 상수 — 컴포넌트 파일(`shared.tsx`)과 분리해 둔다.
 *
 * 한 파일이 컴포넌트와 상수를 함께 내보내면 fast-refresh 가 깨진다
 * (evalearn 의 `panelChromeStyles.ts` 가 같은 이유로 갈라져 있다).
 *
 * **값·라벨의 정본은 `@/lib/taskTabs`** 다. 여기서 베껴 쓰면 목업 머리글이 실제 화면과
 * 조용히 어긋난다(씬은 렌더에 성공하고 그림만 틀린다).
 *
 * 2026-10-05 업무 관리의 탭 줄이 없어졌다(페이지 + 사이드바 서랍). 목업 머리글의 왼쪽은 이제
 * **업무 목록의 범위 전환**뿐이고, 다른 페이지(흐름·타임라인·학교 전체)는 비어 있다 — 실제 머리글과 같다.
 */
import { WORK_LIST_SCOPES, type TaskTabValue } from '@/lib/taskTabs';

/** 업무 목록 범위 라벨 — 실제 머리글의 범위 전환과 같은 순서 */
export const SCOPE_LABELS = WORK_LIST_SCOPES.map((scope) => scope.label);

/** 씬이 `TabBar active={TAB.myWorks}` 처럼 **보기 이름**으로 쓴다 */
export const TAB: Record<TaskTabValue, TaskTabValue> = {
  workflow: 'workflow',
  timeline: 'timeline',
  myWorks: 'myWorks',
  works: 'works',
  budget: 'budget',
  map: 'map',
  docs: 'docs',
};
