/**
 * 서명자 구분 색 — 이름에서 **결정론적으로** 고른다.
 *
 * 같은 사람은 늘 같은 색이어야 문서 위 칸(색 테두리)과 진행 현황(색 점)이 서로 이어진다.
 * 무작위·순번 배정이면 목록을 다시 불러올 때마다 색이 바뀌어 그 연결이 끊긴다.
 * (창체 분야 색과 같은 방식)
 *
 * 값은 dataviz 검증기 통과본이다: 인접쌍 최악 ΔE 10.3(deutan)·30.8(normal), 흰 바탕 대비 3:1 이상.
 * **색을 바꾸려면 `scripts/validate_palette.js` 를 다시 돌릴 것.**
 * 색 단독으로 의미를 나르지 않는다 — 칸마다 이름표가 함께 붙는다.
 */
export const SIGNER_COLORS = [
  '#4f46e5', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#7c3aed',
] as const;

export function signerColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return SIGNER_COLORS[hash % SIGNER_COLORS.length];
}
