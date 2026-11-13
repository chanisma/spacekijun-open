/**
 * 물품명 일괄 변경 보조 로직 (순수, React 비의존)
 *
 * 매니저가 발주 직전에 하는 일의 대부분은 **표기 통일**이다 —
 * "화이트보드마카" · "화이트 보드마카" · "보드마카(검정)" 이 한 발주서에 섞여 들어온다.
 * 그래서 일괄 변경 다이얼로그는 "무엇을 무엇으로 바꾸는지"를 먼저 보여주고,
 * 기본값으로 **가장 많이 쓰인 표기**를 제안한다(대개 그게 정답이다).
 */

export interface NameCount {
  name: string;
  count: number;
}

/** 이름이 빈 품목의 표시 이름. 화면·본문과 같은 문구를 쓴다. */
export const EMPTY_ITEM_NAME_LABEL = '(물품명 없음)';

const display = (name: string) => name.trim() || EMPTY_ITEM_NAME_LABEL;

/**
 * 선택한 품목들의 물품명 분포.
 *
 * 정렬 = **건수 많은 순 → 먼저 나온 순**. 건수만으로 정렬하면 동점일 때 순서가
 * 실행마다 흔들려(V8 sort 는 안정 정렬이지만 입력 순서에 의존) 같은 화면이 달라 보인다.
 */
export function summarizeNameCounts(names: string[]): NameCount[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const raw of names) {
    const name = display(raw);
    if (!counts.has(name)) order.push(name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return order
    .map((name) => ({ name, count: counts.get(name) ?? 0 }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.name) - order.indexOf(b.name));
}

/**
 * 통일할 이름의 기본 제안 = **가장 많이 쓰인 표기**(동점이면 먼저 나온 것).
 *
 * 빈 이름만 있으면 제안하지 않는다 — `(물품명 없음)` 을 그대로 저장해 버리면
 * 사람이 적은 것처럼 보이는 가짜 물품명이 남는다.
 */
export function suggestUnifiedName(names: string[]): string {
  const top = summarizeNameCounts(names)[0];
  if (!top || top.name === EMPTY_ITEM_NAME_LABEL) return '';
  return top.name;
}

/**
 * 이미 전부 같은 이름이면 바꿀 것이 없다(버튼을 잠근다).
 *
 * 빈 목록은 **false** — `every` 의 공허참에 기대면 "이미 통일됨"이라는 잘못된 사유가
 * 화면에 뜬다(대상이 없는 것과 이미 같은 것은 다른 상태다).
 */
export function isAlreadyUnified(names: string[], nextName: string): boolean {
  const target = nextName.trim();
  if (!target || names.length === 0) return false;
  return names.every((n) => n.trim() === target);
}
