/**
 * 품의 정리 — 순수 로직 단일 출처 (2026-10-12)
 *
 * 신청 품목(N) → 품의 품목(1) 로 묶고, 품의 품목을 공문 품목으로 바꾼다.
 * 화면·공문·회귀가 같은 정의를 쓰도록 계산은 전부 여기 둔다(React·supabase 비의존 —
 * Node 회귀가 그대로 import 한다).
 */
import type {
  PurchaseColumn,
  PurchaseColumnType,
  PurchaseItemRow,
  PurchaseOrderBatch,
  PurchaseOrderBatchStatus,
  PurchaseOrderColumn,
  PurchaseOrderField,
  PurchaseOrderLine,
  PurchaseOrderLineInput,
  PurchaseOrderLink,
} from '../types';
import type { OfficialDocumentItem, SelectedPurchaseItem } from './officialDocument';
import { resolveColumnRoles } from './officialDocument';
import { EMPTY_ITEM_NAME_LABEL, suggestUnifiedName } from './itemNameBulk';

// =================================================
// 차수 상태
// =================================================
export const BATCH_STATUS_ORDER: PurchaseOrderBatchStatus[] = ['draft', 'submitted', 'purchased'];

export const BATCH_STATUS_LABEL: Record<PurchaseOrderBatchStatus, string> = {
  draft: '작성 중',
  submitted: '품의 완료',
  purchased: '구매 완료',
};

/** 상태 색 규약: 슬레이트=예정/대기 · 블루=진행 · 에메랄드=완료 */
export const BATCH_STATUS_COLOR: Record<PurchaseOrderBatchStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-50 text-blue-700',
  purchased: 'bg-emerald-50 text-emerald-700',
};

/**
 * 차수를 이 상태로 바꿀 때 연결된 신청 품목에 일어나는 일 — 서버
 * `set_purchase_order_batch_status` 와 같은 규칙이고, 확인 문구로 쓴다.
 * 되돌리기(→ 작성 중 · 품의 완료)는 품목 상태를 건드리지 않는다.
 */
export function batchStatusEffect(
  from: PurchaseOrderBatchStatus,
  to: PurchaseOrderBatchStatus,
): string | null {
  if (from === to) return null;
  const forward = BATCH_STATUS_ORDER.indexOf(to) > BATCH_STATUS_ORDER.indexOf(from);
  if (to === 'submitted' && forward) {
    return "연결된 신청 품목 중 '제출됨·검토중'인 것이 '승인'으로 바뀝니다.";
  }
  if (to === 'purchased') {
    return "연결된 신청 품목 중 '불가'가 아닌 것이 모두 '완료'로 바뀝니다.";
  }
  return '신청 품목의 상태는 바뀌지 않습니다. 필요하면 신청 관리에서 직접 고쳐 주세요.';
}

/** 다음 차수 이름 — 기존 「N차 품의」 중 가장 큰 N + 1. 숫자가 없으면 개수 + 1 */
export function nextBatchTitle(batches: Pick<PurchaseOrderBatch, 'title'>[]): string {
  let max = 0;
  for (const b of batches) {
    const m = /^\s*(\d+)\s*차/.exec(b.title);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const n = Math.max(max, batches.length) + 1;
  return `${n}차 품의`;
}

// =================================================
// 금액
// =================================================
/** 단가·수량이 **모두** 있을 때만 계산한다 — 하나라도 비면 금액을 만들어내지 않는다 */
export function lineAmount(line: Pick<PurchaseOrderLine, 'unit_price' | 'qty'>): number | null {
  if (line.unit_price === null || line.unit_price === undefined) return null;
  if (line.qty === null || line.qty === undefined) return null;
  return Number(line.unit_price) * Number(line.qty);
}

export interface LinesTotal {
  total: number;
  /** 단가나 수량이 비어 합계에 들어가지 못한 품목 수 — 0 이 아니면 합계가 불완전하다 */
  missing: number;
}

export function sumLines(lines: Pick<PurchaseOrderLine, 'unit_price' | 'qty'>[]): LinesTotal {
  let total = 0;
  let missing = 0;
  for (const l of lines) {
    const a = lineAmount(l);
    if (a === null) missing += 1;
    else total += a;
  }
  return { total, missing };
}

// =================================================
// 연결
// =================================================
/** 신청 품목 키 — ManagerView 의 선택 키와 같은 모양 */
export const purchaseItemKey = (requestId: string, rowId: string) => `${requestId}::${rowId}`;

interface RequestLike {
  id: string;
  items: PurchaseItemRow[] | null | undefined;
}

/**
 * 살아 있는 연결만 남긴다. 신청자가 품목 행을 지우면 연결이 고아로 남는다
 * (row_id 는 JSONB 안의 값이라 FK 를 걸 수 없다) — 그런 연결은 세지도 보여주지도 않는다.
 * 신청 목록에 없는 신청(그 사이 삭제)도 마찬가지다.
 */
export function liveLinks(links: PurchaseOrderLink[], requests: RequestLike[]): PurchaseOrderLink[] {
  const rowsByRequest = new Map<string, Set<string>>();
  for (const r of requests) {
    rowsByRequest.set(r.id, new Set((r.items || []).map((row) => row.id)));
  }
  return links.filter((l) => rowsByRequest.get(l.request_id)?.has(l.row_id) ?? false);
}

export function linksByLine(links: PurchaseOrderLink[]): Map<string, PurchaseOrderLink[]> {
  const map = new Map<string, PurchaseOrderLink[]>();
  for (const l of links) {
    const arr = map.get(l.line_id) || [];
    arr.push(l);
    map.set(l.line_id, arr);
  }
  return map;
}

// =================================================
// 선택한 신청 품목 → 새 품의 품목 초안
// =================================================
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

/** 모두 같은 값이면 그 값, 하나라도 다르거나 비면 fallback */
function common<T>(values: T[], fallback: T): T {
  if (values.length === 0) return fallback;
  const first = values[0];
  return values.every((v) => v === first) ? first : fallback;
}

export const EMPTY_LINE_INPUT: PurchaseOrderLineInput = {
  name: '',
  spec: null,
  unit_price: null,
  qty: null,
  usage_period: null,
  vendor: null,
  url: null,
  payment_method: null,
  budget_item: null,
  note: null,
};

/**
 * 고른 신청 품목으로 품의 품목 초안을 만든다. **사람이 고치는 출발점**이지 확정값이 아니다.
 *
 * - 품명 = 가장 많이 쓰인 물품명(물품명 일괄 변경과 같은 규칙)
 * - 규격·단가 = 모두 같을 때만 채운다(다르면 비워 두고 사람이 정한다 — 평균을 내면 거짓 단가가 된다)
 * - 수량 = 품목마다 수량 열 값(비었거나 열이 없으면 1)의 합
 *   (실제 신청 대부분이 「ChatGPT」처럼 수량 없이 들어온다 → 1인 1개로 센다)
 * - 구매처 링크 = 처음 나온 링크
 */
export function draftLineFromSelection(
  selection: SelectedPurchaseItem[],
  columns: PurchaseColumn[],
): PurchaseOrderLineInput {
  const roles = resolveColumnRoles(columns);
  const rows = selection.map((s) => s.row);

  const name = suggestUnifiedName(rows.map((r) => cellText(r, roles.name)));
  const spec = common(rows.map((r) => cellText(r, roles.spec)), '');
  const prices = rows.map((r) => cellNumber(r, roles.price));
  const unitPrice = prices.every((p) => p !== null) ? common(prices, null) : null;

  // 품목마다 수량 열 값, 비었으면 1 — 올리기·내리기의 수량 증감(itemQty)과 같은 규칙
  const qty = selection.reduce((sum, s) => sum + itemQty(s.row, columns), 0);

  const url = rows.map((r) => cellText(r, roles.url)).find(Boolean) ?? '';

  return {
    ...EMPTY_LINE_INPUT,
    name,
    spec: spec || null,
    unit_price: unitPrice,
    qty: rows.length > 0 ? qty : null,
    url: url || null,
  };
}

/** 저장 직전 정리 — 빈 문자열은 null, 숫자는 유한·0 이상만 */
export function normalizeLineInput(input: PurchaseOrderLineInput): PurchaseOrderLineInput {
  const text = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    return t ? t : null;
  };
  const num = (v: number | string | null | undefined) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    name: (input.name ?? '').trim(),
    spec: text(input.spec),
    unit_price: num(input.unit_price),
    qty: num(input.qty),
    usage_period: text(input.usage_period),
    vendor: text(input.vendor),
    url: text(input.url),
    payment_method: text(input.payment_method),
    budget_item: text(input.budget_item),
    note: text(input.note),
  };
}

// =================================================
// 품의 품목 → 공문 품목
// =================================================
/**
 * 차수의 품의 품목을 공문 품목으로 바꾼다. 공문 다이얼로그는 이 결과를 **그대로** 쓴다
 * (같은 물품 합치기는 하지 않는다 — 품의 품목이 이미 사람이 묶은 단위다).
 *
 * - 규격 칸 = 규격 · 이용 기간 (구독형 소프트웨어는 기간이 곧 규격이다)
 * - 구매처 칸 = 구매처와 링크
 * - 신청자 = 연결된 신청 품목의 신청자(중복 제거, 연결 순서)
 */
export function linesToDocumentItems(
  lines: PurchaseOrderLine[],
  links: PurchaseOrderLink[],
  requesterNameByRequest: Map<string, string>,
): OfficialDocumentItem[] {
  const byLine = linksByLine(links);
  return [...lines]
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((line) => {
      const requesters: string[] = [];
      for (const l of byLine.get(line.id) || []) {
        const name = requesterNameByRequest.get(l.request_id);
        if (name && !requesters.includes(name)) requesters.push(name);
      }
      const unitPrice = line.unit_price === null ? null : Number(line.unit_price);
      const qty = line.qty === null ? null : Number(line.qty);
      const vendor = line.vendor?.trim() || '';
      const url = line.url?.trim() || '';
      return {
        sourceKeys: [line.id],
        name: line.name,
        spec: [line.spec?.trim(), line.usage_period?.trim()].filter(Boolean).join(' · '),
        unitPrice,
        qty,
        amount: lineAmount(line),
        requesters,
        url: vendor && url ? `${vendor} (${url})` : vendor || url,
        note: line.note?.trim() || '',
      };
    });
}

// =================================================
// 실제 품목
// =================================================
/** 값이 하나라도 있는 행만 "실제 품목"으로 취급한다 — 신청 관리 화면과 같은 기준 */
export function meaningfulItemRows(
  items: PurchaseItemRow[] | null | undefined,
  columns: PurchaseColumn[],
): PurchaseItemRow[] {
  return (items || []).filter((row) =>
    columns.some((c) => {
      const v = row.cells?.[c.id];
      return v !== '' && v !== null && v !== undefined;
    }),
  );
}

// =================================================
// 품의 표의 열 (2026-10-12 후속 — 사용자가 열을 더하고 고친다)
// =================================================
/**
 * 품의 품목의 실제 DB 칸 전체 — 표에 넣을 수 있는 «준비된 열» 목록이다.
 * 값이 DB 컬럼에 있어 공문(규격·이용 기간 → 규격 칸, 구매처·링크 → 구매처 칸)이 읽는다.
 */
export const FIELD_ORDER_COLUMNS: PurchaseOrderColumn[] = [
  { id: 'f-name', name: '품명', type: 'text', field: 'name' },
  { id: 'f-spec', name: '규격', type: 'text', field: 'spec' },
  { id: 'f-unit_price', name: '단가', type: 'number', field: 'unit_price' },
  { id: 'f-qty', name: '수량', type: 'number', field: 'qty' },
  { id: 'f-usage_period', name: '이용 기간', type: 'text', field: 'usage_period' },
  { id: 'f-vendor', name: '구매처', type: 'text', field: 'vendor' },
  { id: 'f-url', name: '링크', type: 'url', field: 'url' },
  { id: 'f-payment_method', name: '결제 방법', type: 'text', field: 'payment_method' },
  { id: 'f-budget_item', name: '예산 과목', type: 'text', field: 'budget_item' },
  { id: 'f-note', name: '비고', type: 'text', field: 'note' },
];

/**
 * 기본 열 = **공문에 필요한 것만** (사용자 요구 2026-10-12 — 열이 너무 많았다). 품의 공문의 붙임 표도
 * 같은 구성이다(utils/officialDocument.buildItemsTsv 의 includeNote · 규격은 적은 품목이 있을 때만).
 * 품명 · 단가 · 수량 · 비고 (+ 계산 열 금액) — 같은 날 사용자 지시로 규격을 빼고 비고를 넣었다.
 * 나머지(규격·이용 기간·구매처·링크·결제 방법·예산 과목)는 [+]에서 필요할 때 넣는다.
 */
export const DEFAULT_ORDER_COLUMNS: PurchaseOrderColumn[] = FIELD_ORDER_COLUMNS.filter((c) =>
  (['name', 'unit_price', 'qty', 'note'] as PurchaseOrderField[]).includes(c.field!),
);

/**
 * 숨길 수 없는 열 — 금액(단가×수량)과 공문의 '구매 물품'·'소요 예산'이 이 셋을 읽는다.
 * 숨기면 금액이 조용히 빈다.
 */
export const LOCKED_ORDER_FIELDS: PurchaseOrderField[] = ['name', 'unit_price', 'qty'];

const FIELD_SET = new Set<PurchaseOrderField>(FIELD_ORDER_COLUMNS.map((c) => c.field!));
const COLUMN_TYPES = new Set<PurchaseColumnType>(['text', 'number', 'url']);

export const isLockedColumn = (col: PurchaseOrderColumn) =>
  !!col.field && LOCKED_ORDER_FIELDS.includes(col.field);

/**
 * 저장된 열 정의를 그릴 수 있는 모양으로 정리한다.
 * - 빈 정의 → 기본 열
 * - 모르는 기본 칸·중복 id·중복 기본 칸은 버린다(옛 값·손으로 고친 값에도 깨지지 않게)
 * - 기본 칸의 종류는 DB 컬럼이 정한다 — 단가를 글자 열로 바꾸면 금액이 깨진다
 * - 잠긴 열(품명·단가·수량)이 빠져 있으면 **되살린다** — 빠진 채 두면 금액이 빈다
 */
export function resolveOrderColumns(saved: unknown): PurchaseOrderColumn[] {
  if (!Array.isArray(saved) || saved.length === 0) {
    return DEFAULT_ORDER_COLUMNS.map((c) => ({ ...c }));
  }
  const out: PurchaseOrderColumn[] = [];
  const ids = new Set<string>();
  const fields = new Set<PurchaseOrderField>();
  for (const raw of saved) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Partial<PurchaseOrderColumn>;
    if (typeof c.id !== 'string' || !c.id || ids.has(c.id)) continue;
    const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : '이름 없는 열';
    if (c.field !== undefined) {
      if (!FIELD_SET.has(c.field) || fields.has(c.field)) continue;
      const def = FIELD_ORDER_COLUMNS.find((d) => d.field === c.field)!;
      out.push({ id: c.id, name, type: def.type, field: c.field });
      fields.add(c.field);
    } else {
      const type = COLUMN_TYPES.has(c.type as PurchaseColumnType)
        ? (c.type as PurchaseColumnType)
        : 'text';
      out.push({ id: c.id, name, type });
    }
    ids.add(c.id);
  }
  for (const field of LOCKED_ORDER_FIELDS) {
    if (fields.has(field)) continue;
    const def = FIELD_ORDER_COLUMNS.find((d) => d.field === field)!;
    const col = { ...def, id: ids.has(def.id) ? `${def.id}-restored` : def.id };
    if (field === 'name') out.unshift(col);
    else out.push(col);
  }
  return out;
}

/** 표에 아직 없는 준비된 열 — [+]에서 한 번에 넣는다(뺐던 열의 값은 지우지 않았으므로 되살아난다) */
export function availableFieldColumns(cols: PurchaseOrderColumn[]): PurchaseOrderColumn[] {
  const present = new Set(cols.map((c) => c.field).filter(Boolean));
  return FIELD_ORDER_COLUMNS.filter((d) => !present.has(d.field));
}

let columnSeq = 0;
/** 사용자 열 id — 값을 이름이 아니라 id 로 찾으므로 열 이름을 바꿔도 값이 남는다 */
export function newCustomColumnId(): string {
  columnSeq += 1;
  return `c-${Date.now().toString(36)}-${columnSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function moveColumn(
  cols: PurchaseOrderColumn[],
  id: string,
  dir: -1 | 1,
): PurchaseOrderColumn[] {
  const i = cols.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cols.length) return cols;
  const next = [...cols];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// =================================================
// 셀 읽기·쓰기
// =================================================
export type OrderCellValue = string | number | null;

export function readOrderCell(line: PurchaseOrderLine, col: PurchaseOrderColumn): OrderCellValue {
  const v = col.field ? line[col.field] : line.extra?.[col.id];
  return v === undefined ? null : (v as OrderCellValue);
}

/** 입력 글자 → 저장 값. 숫자 열은 콤마·'원'을 지우고 0 이상만, 빈 칸은 null */
export function parseOrderCell(
  col: PurchaseOrderColumn,
  raw: string,
): { ok: true; value: OrderCellValue } | { ok: false; reason: string } {
  const text = raw.trim();
  if (col.field === 'name') {
    return text ? { ok: true, value: text } : { ok: false, reason: '품명은 비울 수 없습니다.' };
  }
  if (!text) return { ok: true, value: null };
  if (col.type === 'number') {
    const n = Number(text.replace(/[,원\s]/g, ''));
    if (!Number.isFinite(n)) return { ok: false, reason: `'${col.name}'에는 숫자를 적어 주세요.` };
    if (n < 0) return { ok: false, reason: `'${col.name}'은 0 이상이어야 합니다.` };
    return { ok: true, value: n };
  }
  return { ok: true, value: text };
}

/** 한 행에 쓸 패치 — 기본 칸은 그 컬럼, 사용자 열은 `extra` 전체 */
export type LinePatch = Partial<Record<PurchaseOrderField, OrderCellValue>> & {
  extra?: Record<string, OrderCellValue>;
};

/**
 * 셀 여러 개 → 행 하나의 패치. 사용자 열은 `extra` 를 통째로 다시 쓰므로 **지금 행의 extra 위에**
 * 덮는다 — 빈 객체에 쓰면 같은 행의 다른 사용자 열 값이 지워진다.
 */
export function buildLinePatch(
  line: PurchaseOrderLine,
  cells: { col: PurchaseOrderColumn; value: OrderCellValue }[],
): LinePatch {
  const patch: LinePatch = {};
  let extra: Record<string, OrderCellValue> | null = null;
  for (const { col, value } of cells) {
    if (col.field) {
      (patch as Record<string, OrderCellValue>)[col.field] = value;
    } else {
      extra = extra ?? { ...(line.extra || {}) };
      extra[col.id] = value;
    }
  }
  if (extra) patch.extra = extra;
  return patch;
}

/** 화면 표시용 글자 */
export function formatOrderCell(col: PurchaseOrderColumn, value: OrderCellValue): string {
  if (value === null || value === undefined || value === '') return '';
  if (col.type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('ko-KR') : String(value);
  }
  return String(value);
}

/**
 * 엑셀에서 복사한 글자(탭·줄바꿈) → 2차원 배열. 끝의 빈 줄 하나는 버린다
 * (엑셀은 복사 끝에 줄바꿈을 붙인다 — 그대로 두면 아래 행 하나가 빈 값으로 덮인다).
 */
export function parseClipboardGrid(text: string): string[][] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  if (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
  return rows.map((r) => r.split('\t'));
}

// =================================================
// ▲ 올리기 · 내리기 · 합치기 계획 (DB 쓰기 전에 순수하게 계산)
// =================================================
/** 같은 물품 판정 — 대소문자·띄어쓰기·문장부호 무시 (`chat GPT` = `ChatGPT`) */
export function normalizeItemName(name: string): string {
  return name.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** 신청 품목 한 행의 수량 — 수량 열 값, 비었거나 열이 없으면 1 */
export function itemQty(row: PurchaseItemRow, columns: PurchaseColumn[]): number {
  const n = cellNumber(row, resolveColumnRoles(columns).qty);
  return n !== null && n > 0 ? n : 1;
}

export const applyQtyDelta = (qty: number | null, delta: number): number | null =>
  qty === null || qty === undefined ? null : Math.max(0, Number(qty) + delta);

export interface AddToBatchPlan {
  /** 새로 만들 품의 품목 + 거기 붙일 신청 품목 */
  creates: { values: PurchaseOrderLineInput; items: SelectedPurchaseItem[] }[];
  /** 같은 이름의 기존 품목에 붙일 신청 품목 */
  appends: { lineId: string; items: SelectedPurchaseItem[] }[];
  /** 기존 품목의 수량 변화 — 붙는 품목은 +, 다른 품목에서 옮겨 나가는 품목은 − */
  qtyDelta: Map<string, number>;
  /** 이미 이 차수의 같은 품목에 있어 건너뛴 수 */
  skipped: number;
  /** 다른 품의 품목에서 옮겨 오는 수 */
  moved: number;
}

/**
 * 고른 신청 품목을 차수에 올린다 (대화상자 없이 — 값은 표에서 고친다).
 *
 * - **같은 물품끼리 한 줄로 묶는다**(normalizeItemName). 차수에 이미 같은 이름의 품목이 있으면
 *   새 줄을 만들지 않고 거기에 붙인다 — ChatGPT 를 두 번에 나눠 올려도 한 줄이다.
 * - 수량은 붙는 품목만큼 늘린다. 품목 수량이 비어 있으면 그대로 둔다(사람이 아직 안 정한 값).
 * - 이미 다른 품의 품목에 있던 신청 품목은 옮기고, 원래 품목의 수량을 그만큼 줄인다.
 */
export function planAddToBatch(
  selection: SelectedPurchaseItem[],
  columns: PurchaseColumn[],
  batchLines: PurchaseOrderLine[],
  links: PurchaseOrderLink[],
): AddToBatchPlan {
  const roles = resolveColumnRoles(columns);
  const lineByName = new Map<string, PurchaseOrderLine>();
  const ordered = [...batchLines].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
  for (const l of ordered) {
    const key = normalizeItemName(l.name);
    if (!lineByName.has(key)) lineByName.set(key, l);
  }
  const linkByItem = new Map(links.map((l) => [purchaseItemKey(l.request_id, l.row_id), l]));

  const groups = new Map<string, SelectedPurchaseItem[]>();
  const qtyDelta = new Map<string, number>();
  const bump = (lineId: string, d: number) =>
    qtyDelta.set(lineId, (qtyDelta.get(lineId) ?? 0) + d);
  let skipped = 0;
  let moved = 0;

  for (const s of selection) {
    const key = normalizeItemName(cellText(s.row, roles.name));
    const target = lineByName.get(key);
    const existing = linkByItem.get(purchaseItemKey(s.requestId, s.row.id));
    if (existing && target && existing.line_id === target.id) {
      skipped += 1;
      continue;
    }
    if (existing) {
      moved += 1;
      bump(existing.line_id, -itemQty(s.row, columns));
    }
    const arr = groups.get(key) || [];
    arr.push(s);
    groups.set(key, arr);
  }

  const creates: AddToBatchPlan['creates'] = [];
  const appends: AddToBatchPlan['appends'] = [];
  for (const [key, items] of groups) {
    const target = lineByName.get(key);
    if (target) {
      appends.push({ lineId: target.id, items });
      bump(target.id, items.reduce((n, s) => n + itemQty(s.row, columns), 0));
    } else {
      const values = draftLineFromSelection(items, columns);
      creates.push({ values: { ...values, name: values.name || EMPTY_ITEM_NAME_LABEL }, items });
    }
  }
  for (const [k, v] of qtyDelta) if (v === 0) qtyDelta.delete(k);
  return { creates, appends, qtyDelta, skipped, moved };
}

/**
 * 여러 품목을 하나로 합친다 — 표에서 맨 위 품목이 남는다(그 품명·단가·나머지 칸 유지).
 * 수량은 모두 숫자일 때만 더하고, 하나라도 비었으면 남는 품목의 수량을 그대로 둔다.
 */
export function planMergeLines(
  lines: PurchaseOrderLine[],
): { keep: PurchaseOrderLine; remove: PurchaseOrderLine[]; qty: number | null } | null {
  if (lines.length < 2) return null;
  const sorted = [...lines].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
  const [keep, ...remove] = sorted;
  const allNumeric = sorted.every((l) => l.qty !== null && l.qty !== undefined);
  const qty = allNumeric ? sorted.reduce((n, l) => n + Number(l.qty), 0) : keep.qty;
  return { keep, remove, qty };
}
