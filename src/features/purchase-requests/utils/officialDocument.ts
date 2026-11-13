/**
 * 구매 신청 → 공문 본문 초안 (순수 로직, React 비의존)
 *
 * 왜 순수 모듈인가
 *  - 미리보기·복사·다운로드·인쇄·AI 프롬프트가 **같은 정의**를 써야 한다.
 *    화면마다 문장을 다시 조립하면 "미리보기와 내려받은 파일이 다른" 상태가 생긴다.
 *  - 회귀 테스트가 그대로 import 한다: `npx tsx scripts/purchase-requests-test/run-official-document.mts`
 *
 * **본문에 넣지 않는 것들**(사용자 지시로 차례차례 걷어냈다, 2026-09-02)
 *  - 제목·학교명·수신·경유·기안자·기안일·결재란 → 문서관리시스템(에듀파인) 양식 필드
 *  - 예산 과목 → 같은 이유
 *  - 품목 표 → 본문이 아니라 **붙임**으로 나간다(`buildItemsTsv` 로 뽑아 한글·엑셀에 붙인다)
 * 그래서 사용자 입력은 구매 목적·사유 / 관련 근거 / 붙임 셋뿐이다.
 */
import { PurchaseColumn, PurchaseItemRow } from '../types';

// =================================================
// 금액 한글 표기 — 공문은 위·변조 방지를 위해 금액을 한글로 병기한다
// =================================================
const DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const SMALL_UNITS = ['', '십', '백', '천'];
const BIG_UNITS = ['', '만', '억', '조', '경'];

/** 4자리 그룹 → 한글. 십·백·천 앞의 '일'은 생략한다(십오 O, 일십오 X). */
function groupToKorean(group: number): string {
  const s = String(group);
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const d = Number(s[i]);
    if (d === 0) continue;
    const unit = SMALL_UNITS[s.length - 1 - i];
    out += d === 1 && unit ? unit : DIGITS[d] + unit;
  }
  return out;
}

/**
 * 452300 → '사십오만이천삼백'
 *
 * 만·억 단위의 '일'은 **남긴다**(일만오천 O, 만오천 X) — 금액 표기 관행이고,
 * 앞자리가 비면 위조하기 쉬운 표기가 된다.
 */
export function numberToKoreanAmount(value: number): string {
  const raw = Number(value) || 0;
  const n = Math.floor(Math.abs(raw));
  if (n === 0) return '영';
  const groups: number[] = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 10000);
    rest = Math.floor(rest / 10000);
  }
  let out = '';
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (groups[i] === 0) continue;
    out += groupToKorean(groups[i]) + BIG_UNITS[i];
  }
  return (raw < 0 ? '마이너스' : '') + out;
}

// =================================================
// 신청 항목 → 공문 품목
// =================================================
export interface PurchaseColumnRoles {
  name?: PurchaseColumn;
  spec?: PurchaseColumn;
  url?: PurchaseColumn;
  price?: PurchaseColumn;
  qty?: PurchaseColumn;
  note?: PurchaseColumn;
}

/**
 * 페이지 컬럼에서 공문에 쓸 역할을 찾는다.
 *
 * 기본 양식(DEFAULT_COLUMNS)은 id 로 정확히 잡히고, 관리자가 직접 만든 커스텀
 * 페이지는 타입·이름으로 추정한다. **못 찾으면 undefined 로 두고 그 칸을 비운다** —
 * 엉뚱한 열을 단가로 오인해 금액을 계산하는 것보다 낫다.
 */
export function resolveColumnRoles(columns: PurchaseColumn[]): PurchaseColumnRoles {
  const byId = (id: string) => columns.find((c) => c.id === id);
  const byName = (...keywords: string[]) =>
    columns.find((c) => keywords.some((k) => c.name.replace(/\s/g, '').includes(k)));
  const numbers = columns.filter((c) => c.type === 'number');

  const name =
    byId('default-name') ?? byName('물품', '품명', '품목') ?? columns.find((c) => c.type === 'text');
  const spec = byId('default-option') ?? byName('옵션', '규격', '사양');
  const url = byId('default-url') ?? columns.find((c) => c.type === 'url');
  const price = byId('default-price') ?? byName('단가', '가격', '금액') ?? numbers[0];
  const qty = byId('default-qty') ?? byName('개수', '수량') ?? numbers.find((c) => c.id !== price?.id);
  const note = byId('default-note') ?? byName('비고', '사유', '이유');

  return { name, spec, url, price, qty, note };
}

/** 매니저가 고쳐 쓸 수 있는 '물품명' 열. 없으면 편집 UI 자체를 내지 않는다. */
export function resolveItemNameColumn(columns: PurchaseColumn[]): PurchaseColumn | undefined {
  return resolveColumnRoles(columns).name;
}

export interface OfficialDocumentItem {
  /** 원본 추적용 — 병합된 항목은 여러 개를 가진다 */
  sourceKeys: string[];
  name: string;
  spec: string;
  unitPrice: number | null;
  qty: number | null;
  /** 단가·수량이 모두 있을 때만 계산 */
  amount: number | null;
  requesters: string[];
  url: string;
  note: string;
}

export interface SelectedPurchaseItem {
  requestId: string;
  requesterName: string;
  row: PurchaseItemRow;
}

const cellText = (row: PurchaseItemRow, col?: PurchaseColumn): string => {
  if (!col) return '';
  const v = row.cells?.[col.id];
  return v === null || v === undefined ? '' : String(v).trim();
};

const cellNumber = (row: PurchaseItemRow, col?: PurchaseColumn): number | null => {
  if (!col) return null;
  const v = row.cells?.[col.id];
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * 선택 품목 → 공문 품목.
 *
 * `merge=true` 는 **물품명·규격·단가가 모두 같을 때만** 합친다. 단가가 다르면
 * 사실상 다른 물건이거나 신청자가 다른 곳에서 찾은 것이라 합계가 틀어진다.
 */
export function toDocumentItems(
  selection: SelectedPurchaseItem[],
  columns: PurchaseColumn[],
  options: { merge?: boolean } = {},
): OfficialDocumentItem[] {
  const roles = resolveColumnRoles(columns);

  const base: OfficialDocumentItem[] = selection.map((sel) => {
    const unitPrice = cellNumber(sel.row, roles.price);
    const qty = cellNumber(sel.row, roles.qty);
    return {
      sourceKeys: [`${sel.requestId}::${sel.row.id}`],
      name: cellText(sel.row, roles.name),
      spec: cellText(sel.row, roles.spec),
      unitPrice,
      qty,
      amount: unitPrice !== null && qty !== null ? unitPrice * qty : null,
      requesters: sel.requesterName ? [sel.requesterName] : [],
      url: cellText(sel.row, roles.url),
      note: cellText(sel.row, roles.note),
    };
  });

  return options.merge ? mergeDocumentItems(base) : base;
}

/**
 * 같은 물품 합치기 — **물품명·규격·단가가 모두 같을 때만** 합친다.
 * 공문 다이얼로그가 '포함 품목'에서 뺀 뒤 합치므로 변환과 분리해 둔다.
 */
export function mergeDocumentItems(base: OfficialDocumentItem[]): OfficialDocumentItem[] {
  const map = new Map<string, OfficialDocumentItem>();
  for (const item of base) {
    const key = JSON.stringify([item.name, item.spec, item.unitPrice]);
    const found = map.get(key);
    if (!found) {
      map.set(key, { ...item, sourceKeys: [...item.sourceKeys], requesters: [...item.requesters] });
      continue;
    }
    found.sourceKeys.push(...item.sourceKeys);
    found.qty = (found.qty ?? 0) + (item.qty ?? 0);
    found.amount = found.unitPrice !== null ? found.unitPrice * found.qty : null;
    for (const r of item.requesters) if (!found.requesters.includes(r)) found.requesters.push(r);
    if (item.note && !found.note.includes(item.note)) {
      found.note = found.note ? `${found.note}; ${item.note}` : item.note;
    }
    if (!found.url) found.url = item.url;
  }
  return Array.from(map.values());
}

export function sumDocumentAmount(items: OfficialDocumentItem[]): number {
  return items.reduce((sum, it) => sum + (it.amount ?? 0), 0);
}

export function sumDocumentQty(items: OfficialDocumentItem[]): number {
  return items.reduce((sum, it) => sum + (it.qty ?? 0), 0);
}

/** 물품이 이 개수 이상이면 본문에 다 적지 않고 '○○ 외 N개' 로 줄인다 (사용자 지시) */
export const ITEM_NAME_SUMMARY_THRESHOLD = 4;

/**
 * 본문 '구매 물품' 항목에 쓸 문구.
 *
 * - 3개 이하 → 물품명을 모두 나열 (`보드마카, A4용지, 비커 250mL`)
 * - 4개 이상 → `보드마카 외 6개` (뒤 숫자는 **나머지 개수**, 즉 전체−1)
 *
 * 이름이 빈 품목도 `(물품명 없음)` 으로 세어 남긴다 — 조용히 빠지면 본문의
 * 물품 수와 붙임 표의 행 수가 어긋난다.
 */
export function summarizeDocumentItemNames(items: OfficialDocumentItem[]): string {
  if (items.length === 0) return '';
  const names = items.map((it) => it.name.trim() || '(물품명 없음)');
  if (names.length < ITEM_NAME_SUMMARY_THRESHOLD) return names.join(', ');
  return `${names[0]} 외 ${names.length - 1}개`;
}

// =================================================
// 공문 본문
// =================================================
/**
 * 공문 **본문**을 만드는 데 필요한 입력만 담는다 (2026-09-02 축소).
 *
 * **제목·학교명·수신·경유·기안자·기안일·결재란·예산 과목은 일부러 없다** — 문서관리시스템
 * (에듀파인)의 양식 필드라 본문에 쓸 자리가 없고, 여기서 받으면 같은 정보를 두 번 적게 된다.
 */
export interface OfficialDocumentForm {
  /** 관련 근거 — 비면 '관련' 항목 자체를 쓰지 않는다 */
  basis: string;
  /** 구매 목적·사유. 본문의 뼈대라 사실상 유일한 필수 입력 */
  purpose: string;
  /** 붙임 — 비면 붙임 줄을 쓰지 않고 마지막 항목 끝에 '끝.'을 붙인다 */
  attachment: string;
  includeRequester: boolean;
  includeUrl: boolean;
  mergeSameItems: boolean;
}

export const DEFAULT_OFFICIAL_DOCUMENT_FORM: OfficialDocumentForm = {
  basis: '',
  purpose: '',
  attachment: '',
  includeRequester: true,
  includeUrl: false,
  mergeSameItems: false,
};

export const formatKrw = (n: number): string => `${Math.round(n).toLocaleString('ko-KR')}원`;

/** '금 452,300원(금사십오만이천삼백원)' — 공문 금액 표기 관행 */
export function formatOfficialAmount(n: number): string {
  return `금 ${Math.round(n).toLocaleString('ko-KR')}원(금${numberToKoreanAmount(n)}원)`;
}

/**
 * 붙임 표 (TSV — 탭 구분).
 *
 * 본문에는 표를 넣지 않으므로 **이것이 붙임 문서의 원본**이다. 탭 구분이라
 * 한글·엑셀에 붙이면 표로 들어간다.
 */
/**
 * 붙임 표의 열 구성. 기본값 = 종전 표(규격 있음 · 비고 없음).
 * 품의 정리에서 만드는 공문은 품의 표의 기본 열(품명·단가·수량·비고)을 따른다 —
 * `orderTsvLayout` (2026-10-12 사용자 지시: 규격 제외 · 비고 추가).
 */
export interface ItemsTsvLayout {
  includeSpec: boolean;
  includeNote: boolean;
}

export const DEFAULT_TSV_LAYOUT: ItemsTsvLayout = { includeSpec: true, includeNote: false };

/** 품의 공문 — 비고는 늘, 규격은 적은 품목이 하나라도 있을 때만(빈 열을 붙임에 남기지 않는다) */
export function orderTsvLayout(items: OfficialDocumentItem[]): ItemsTsvLayout {
  return { includeSpec: items.some((it) => !!it.spec.trim()), includeNote: true };
}

export function buildItemsTsv(
  items: OfficialDocumentItem[],
  form: OfficialDocumentForm,
  layout: ItemsTsvLayout = DEFAULT_TSV_LAYOUT,
): string {
  const headers = ['연번', '물품명'];
  if (layout.includeSpec) headers.push('규격/옵션');
  headers.push('단가', '수량', '금액');
  if (layout.includeNote) headers.push('비고');
  if (form.includeRequester) headers.push('신청자');
  if (form.includeUrl) headers.push('구매처');

  const rows = items.map((item, idx) => {
    const cells = [String(idx + 1), item.name || '(물품명 없음)'];
    if (layout.includeSpec) cells.push(item.spec);
    cells.push(
      item.unitPrice !== null ? item.unitPrice.toLocaleString('ko-KR') : '',
      item.qty !== null ? item.qty.toLocaleString('ko-KR') : '',
      item.amount !== null ? item.amount.toLocaleString('ko-KR') : '',
    );
    // 탭·줄바꿈이 비고에 섞이면 표 칸이 밀린다
    if (layout.includeNote) cells.push(item.note.replace(/[\t\r\n]+/g, ' '));
    if (form.includeRequester) cells.push(item.requesters.join(', '));
    if (form.includeUrl) cells.push(item.url);
    return cells;
  });

  const totalRow = ['합계', ''];
  if (layout.includeSpec) totalRow.push('');
  totalRow.push(
    '',
    sumDocumentQty(items).toLocaleString('ko-KR'),
    sumDocumentAmount(items).toLocaleString('ko-KR'),
  );
  if (layout.includeNote) totalRow.push('');
  if (form.includeRequester) totalRow.push('');
  if (form.includeUrl) totalRow.push('');

  return [headers, ...rows, totalRow].map((r) => r.join('\t')).join('\n');
}

/**
 * 공문 **본문** 초안 (AI 없이 만드는 기본값 · AI 다듬기의 입력).
 *
 * 항목 번호(1./가.)는 행정업무운영 편람의 항목 구분 체계를 따른다.
 * 제목·두문(학교명·수신·경유)·결문(기안자·날짜)·품목 표는 **쓰지 않는다**.
 *
 * 끝 표시는 편람대로 붙임 유무에 따라 자리가 달라진다 —
 * 붙임이 있으면 붙임 표시문 뒤, 없으면 **본문 마지막 글자 뒤**.
 */
export function buildOfficialDocumentText(
  form: OfficialDocumentForm,
  items: OfficialDocumentItem[],
): string {
  const lines: string[] = [];

  let no = 1;
  if (form.basis.trim()) {
    lines.push(`${no}. 관련: ${form.basis.trim()}`);
    no += 1;
  }
  const purpose = form.purpose.trim() || '교육활동 운영';
  lines.push(
    `${no}. ${purpose}에 필요한 물품을 아래와 같이 구매하고자 하오니 검토하여 주시기 바랍니다.`,
    '',
  );

  // 가·나·다… 는 실제로 출력되는 항목 수를 따라간다(항목을 더하거나 빼도 부호가 안 어긋난다)
  const subLabels = ['가', '나', '다', '라', '마', '바'];
  let sub = 0;
  const pushSub = (text: string) => lines.push(`  ${subLabels[sub++]}. ${text}`);

  pushSub(`구매 목적: ${purpose}`);
  pushSub(`구매 물품: ${summarizeDocumentItemNames(items) || '없음'}`);
  pushSub(`소요 예산: ${formatOfficialAmount(sumDocumentAmount(items))}`);

  const attachment = form.attachment.trim();
  if (attachment) {
    lines.push('', `붙임  ${attachment}  끝.`);
  } else {
    // 붙임이 없으면 본문 마지막 글자에서 두 칸 띄고 끝 표시(행정업무운영 편람)
    lines[lines.length - 1] += '  끝.';
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
