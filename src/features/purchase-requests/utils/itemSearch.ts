/**
 * 구매 신청 검색 판정 (순수, React 비의존)
 *
 * **왜 따로 있나**: 매니저 뷰의 목록 필터는 **신청건 단위**라 한 행만 맞아도 그 신청이
 * 통째로 통과한다. 신청건별 뷰에서는 그게 맞지만, 품목별 뷰에서 그대로 펼치면
 * `"GPT"` 를 검색했는데 **GPT 를 신청한 사람의 다른 품목까지 나온다**(2026-09-02 사용자 보고).
 * 그래서 품목별 뷰는 행마다 판정을 한 번 더 건다 — 두 판정이 **같은 검색어 해석**을
 * 쓰도록 여기 한 곳에 모아 둔다.
 */
import { PurchaseColumn, PurchaseItemRow } from '../types';

/**
 * 검색어 → 검색어 목록. **쉼표는 OR 로 읽는다**(사용자 요청 2026-09-02).
 *
 * `GPT, 클로드` → GPT 이거나 클로드. 발주 담당자가 여러 품목을 한 번에 훑는 게
 * 실제 사용법이라 AND 보다 OR 이 맞다(AND 는 한 셀에 두 단어가 다 있어야 해서 거의 0건이 된다).
 *
 * 전각 쉼표(`，`)도 받는다 — 한글 IME 에서 쉽게 섞여 들어온다.
 * 빈 조각은 버리므로 `"GPT,"` · `"GPT, ,클로드"` 도 안전하다.
 */
export function parseSearchTerms(query: string): string[] {
  return String(query ?? '')
    .split(/[,，]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

const rowHasTerm = (row: PurchaseItemRow, columns: PurchaseColumn[], term: string): boolean =>
  columns.some((c) => {
    const v = row.cells?.[c.id];
    return v !== undefined && v !== null && String(v).toLowerCase().includes(term);
  });

/**
 * 이 품목이 검색어에 걸리는가 (품목별 뷰).
 *
 * - 검색어가 비면 전부 통과.
 * - **신청자 이름이 맞으면 그 사람의 품목을 모두 남긴다** — 신청자는 모든 행이 공유하는
 *   속성이라 "이 선생님 것 보기"가 자연스러운 해석이다.
 * - 그 외에는 **그 행의 셀 값**만 본다(형제 행의 값으로 통과시키지 않는다).
 */
export function matchesItemQuery(
  row: PurchaseItemRow,
  columns: PurchaseColumn[],
  query: string,
  requesterName: string,
): boolean {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) return true;
  const name = (requesterName || '').toLowerCase();
  return terms.some((term) => name.includes(term) || rowHasTerm(row, columns, term));
}

/**
 * 이 신청건이 검색어에 걸리는가 (신청건별·신청자별 뷰).
 *
 * 품목 판정과 **같은 검색어 해석**을 쓴다 — 한쪽만 쉼표를 OR 로 읽으면 뷰를 바꿀 때
 * 결과 개수가 설명 없이 달라진다.
 */
export function matchesRequestQuery(
  rows: PurchaseItemRow[],
  columns: PurchaseColumn[],
  query: string,
  requesterName: string,
): boolean {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) return true;
  const name = (requesterName || '').toLowerCase();
  return terms.some(
    (term) => name.includes(term) || rows.some((row) => rowHasTerm(row, columns, term)),
  );
}
