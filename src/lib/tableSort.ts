/**
 * 표 열 머리글 정렬 (순수 로직, React 비의존)
 *
 * 클릭 순환은 **오름차순 → 내림차순 → 해제** 3단계다. 해제가 있어야 "원래 순서"로
 * 돌아갈 길이 생긴다(별도 리셋 버튼을 두지 않아도 된다).
 *
 * **빈 값은 방향과 무관하게 항상 뒤로 보낸다.** 내림차순으로 바꿨더니 빈 칸이 위를
 * 덮는 표는 쓸모가 없다 — 정렬의 목적은 "값이 있는 것 중 큰/작은 것"을 보는 것이다.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

/** 머리글 클릭 1회 → 다음 상태. `null` = 정렬 해제(기본 순서) */
export function nextSortState(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

const isEmptyValue = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** 값 하나짜리 비교 — 숫자는 숫자로, 나머지는 한국어 로케일 문자열로 */
export function compareValues(a: unknown, b: unknown, numeric = false): number {
  if (numeric) {
    const na = Number(a);
    const nb = Number(b);
    const aOk = Number.isFinite(na);
    const bOk = Number.isFinite(nb);
    // 숫자 열에 글자가 섞여 있으면(자유 입력이라 있을 수 있다) 그것만 뒤로 민다
    if (aOk && bOk) return na - nb;
    if (aOk) return -1;
    if (bOk) return 1;
  }
  return String(a).localeCompare(String(b), 'ko');
}

/**
 * 방향까지 반영한 비교. **빈 값 처리는 방향 반전보다 먼저**라 항상 뒤로 간다.
 *
 * 반환값이 0이면 호출부의 `sort` 가 안정 정렬이므로 **기존 순서가 유지된다** —
 * 그래서 열 정렬과 기본 정렬(최근 수정순 등)이 자연스럽게 겹쳐 쓰인다.
 */
export function compareWithDirection(
  a: unknown,
  b: unknown,
  direction: SortDirection,
  numeric = false,
): number {
  const aEmpty = isEmptyValue(a);
  const bEmpty = isEmptyValue(b);
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) return 0;
    return aEmpty ? 1 : -1;
  }
  const base = compareValues(a, b, numeric);
  return direction === 'desc' ? -base : base;
}

/**
 * 정렬된 새 배열. `sort` 가 null 이면 **원본 순서 그대로**(복사본을 만들지 않는다).
 *
 * `getValue` 는 키에 해당하는 값을 꺼내고, `isNumeric` 은 그 키를 숫자로 볼지 알려 준다.
 */
export function sortRows<T>(
  rows: T[],
  sort: SortState | null,
  getValue: (row: T, key: string) => unknown,
  isNumeric?: (key: string) => boolean,
): T[] {
  if (!sort) return rows;
  const numeric = isNumeric?.(sort.key) ?? false;
  return [...rows].sort((a, b) =>
    compareWithDirection(getValue(a, sort.key), getValue(b, sort.key), sort.direction, numeric),
  );
}
