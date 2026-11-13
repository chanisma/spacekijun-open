/**
 * 에듀파인 «사업관리카드(예산)» 엑셀 → 사업·산출내역 (2026-11-10)
 *
 * 카드 모양(2026 목적사업 카드 실측 — docs/plans/2026-11-10-budget-management.md):
 *   머리 두 줄: «세부사업/세부항목/원가통계비목 | 산출내역 | 예산현액(A) | 집행 … | 예산잔액(A-B)»
 *              «지출품의금액 | 원인행위금액(B) | 집행률(B/A) | 지출결의금액 | 지급액»
 *   본문: A열의 **앞 공백 수가 계층**이다 — 합계(1) > 세부사업(4) > 세부항목=사업(7) > 비목(10, B열에 산출내역)
 *
 * ⚠️ 열 위치를 숫자로 적지 않는다 — 머리글 글자로 찾는다(양식이 다른 카드에서도 버티게).
 * ⚠️ 사업 행의 금액(부모)과 산출내역 합이 어긋나는 카드가 실제로 있다(2026: 원인행위 52,880원) —
 *    부모 값은 `cardTotal` 로 남겨 대조만 하고, 사업 총액은 줄 합계로 쓴다.
 * 순수 함수 — 화면·회귀가 같은 것을 부른다(`scripts/budget-test/run.mts`).
 */

export type BudgetKind = 'purpose' | 'total' | 'basic';

export interface CardAmounts {
  budget: number; // 예산현액
  pumui: number; // 지출품의
  wonin: number; // 원인행위
  jichul: number; // 지출결의
  jigeup: number; // 지급
}

export interface CardLine extends CardAmounts {
  expenseItem: string | null; // 비목
  name: string; // 산출내역
  cardKey: string;
}

export interface CardProject {
  name: string;
  groupName: string | null; // 세부사업
  kind: BudgetKind;
  cardKey: string;
  cardTotal: CardAmounts; // 카드의 사업 행 값(대조용)
  lineTotal: CardAmounts; // 산출내역 합
  mismatch: Partial<Record<keyof CardAmounts, number>>; // 사업 행 − 줄 합 (0 아닌 것만)
  lines: CardLine[];
}

export interface ParsedCard {
  projects: CardProject[];
  cardDate: string | null; // 파일 이름의 YYYYMMDD → YYYY-MM-DD
  warnings: string[];
}

const ZERO: CardAmounts = { budget: 0, pumui: 0, wonin: 0, jichul: 0, jigeup: 0 };
const AMOUNT_KEYS: (keyof CardAmounts)[] = ['budget', 'pumui', 'wonin', 'jichul', 'jigeup'];

/** 머리글 글자 → 칸. 앞의 것이 먼저 맞는다 */
const HEADER_PATTERNS: Record<'name' | 'detail' | keyof CardAmounts, RegExp> = {
  name: /세부사업|세부항목|비목/,
  detail: /산출내역/,
  budget: /예산현액/,
  pumui: /지출품의/,
  wonin: /원인행위/,
  jichul: /지출결의/,
  jigeup: /지급액|지급/,
};

type Cell = string | number | boolean | null | undefined;

const text = (v: Cell): string => (v === null || v === undefined ? '' : String(v));

/** 이름 비교용 — 공백·가운뎃점 차이를 없앤다 */
export function normalizeCardName(raw: string): string {
  return raw.replace(/[\s\u00a0]+/g, '').replace(/[·ㆍ・]/g, '.').toLowerCase();
}

export function kindOfProjectName(name: string): BudgetKind {
  const n = name.replace(/\s+/g, '');
  if (n.startsWith('[목적]')) return 'purpose';
  if (n.startsWith('[총액배분]')) return 'total';
  return 'basic';
}

/** 화면 표시용 — 앞의 [목적]·[총액배분] 표시를 뗀다(종류 배지가 대신 말한다) */
export function displayProjectName(name: string): string {
  return name.replace(/^\s*\[(목적|총액배분)\]\s*/, '').trim();
}

function toAmount(v: Cell): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
  const s = text(v).replace(/[,\s원]/g, '');
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function indentOf(v: Cell): number {
  const s = text(v);
  const m = s.match(/^[\s\u00a0\u3000]*/);
  return m ? m[0].length : 0;
}

export function cardDateFromFileName(fileName: string | null | undefined): string | null {
  const m = (fileName ?? '').match(/(20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo}-${d}`;
}

interface Columns {
  header: number; // 첫 머리글 줄
  bodyStart: number;
  name: number;
  detail: number;
  amounts: Record<keyof CardAmounts, number>;
}

function findColumns(rows: Cell[][]): Columns | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r] ?? [];
    const detail = row.findIndex((c) => HEADER_PATTERNS.detail.test(text(c)));
    const budget = row.findIndex((c) => HEADER_PATTERNS.budget.test(text(c)));
    if (detail < 0 || budget < 0) continue;
    // 머리글은 두 줄일 수 있다(집행 아래 품의·원인행위…) — 두 줄을 겹쳐 찾는다
    const next = rows[r + 1] ?? [];
    const width = Math.max(row.length, next.length);
    const find = (re: RegExp) => {
      for (let c = 0; c < width; c++) {
        if (re.test(text(row[c])) || re.test(text(next[c]))) return c;
      }
      return -1;
    };
    const nameCol = row.findIndex((c) => HEADER_PATTERNS.name.test(text(c)));
    const amounts = {
      budget,
      pumui: find(HEADER_PATTERNS.pumui),
      wonin: find(HEADER_PATTERNS.wonin),
      jichul: find(HEADER_PATTERNS.jichul),
      jigeup: find(HEADER_PATTERNS.jigeup),
    };
    const secondIsHeader = AMOUNT_KEYS.some((k) => k !== 'budget' && HEADER_PATTERNS[k].test(text(next[amounts[k]])));
    return {
      header: r,
      bodyStart: r + (secondIsHeader ? 2 : 1),
      name: nameCol >= 0 ? nameCol : 0,
      detail,
      amounts,
    };
  }
  return null;
}

function amountsOf(row: Cell[], cols: Columns): CardAmounts {
  const out = { ...ZERO };
  for (const k of AMOUNT_KEYS) {
    const c = cols.amounts[k];
    out[k] = c >= 0 ? toAmount(row[c]) : 0;
  }
  return out;
}

function addAmounts(a: CardAmounts, b: CardAmounts): CardAmounts {
  const out = { ...a };
  for (const k of AMOUNT_KEYS) out[k] += b[k];
  return out;
}

/**
 * 시트(`XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })`) → 사업 목록.
 * 산출내역 줄의 «바로 위 계층 행»이 사업이고, 그 위가 세부사업이다.
 */
export function parseBudgetCard(rows: Cell[][], fileName?: string | null): ParsedCard {
  const warnings: string[] = [];
  const cols = findColumns(rows);
  if (!cols) {
    return { projects: [], cardDate: cardDateFromFileName(fileName), warnings: ['머리글(산출내역·예산현액)을 찾지 못했습니다 — 사업관리카드(예산) 파일인지 확인해 주세요'] };
  }
  for (const k of AMOUNT_KEYS) {
    if (cols.amounts[k] < 0) warnings.push(`«${{ budget: '예산현액', pumui: '지출품의', wonin: '원인행위', jichul: '지출결의', jigeup: '지급액' }[k]}» 열을 찾지 못해 0으로 읽었습니다`);
  }

  // 계층 스택: [{indent, name, amounts}]
  const stack: { indent: number; name: string; amounts: CardAmounts }[] = [];
  const projects = new Map<string, CardProject>();
  const order: string[] = [];

  for (let r = cols.bodyStart; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const rawName = text(row[cols.name]);
    const detail = text(row[cols.detail]).trim();
    if (!rawName.trim() && !detail) continue;
    const indent = indentOf(row[cols.name]);
    const name = rawName.trim();
    if (/^합\s*계$/.test(name) && !detail) continue;

    if (!detail) {
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      stack.push({ indent, name, amounts: amountsOf(row, cols) });
      continue;
    }

    // 산출내역 줄 — 자기보다 얕은 마지막 행이 사업
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (!parent) {
      warnings.push(`${r + 1}행 «${detail}» 의 사업을 찾지 못해 건너뛰었습니다`);
      continue;
    }
    const grand = stack.length >= 2 ? stack[stack.length - 2] : null;
    const projectKey = normalizeCardName(parent.name);
    let project = projects.get(projectKey);
    if (!project) {
      project = {
        name: parent.name,
        groupName: grand?.name ?? null,
        kind: kindOfProjectName(parent.name),
        cardKey: projectKey,
        cardTotal: parent.amounts,
        lineTotal: { ...ZERO },
        mismatch: {},
        lines: [],
      };
      projects.set(projectKey, project);
      order.push(projectKey);
    }
    const expenseItem = name || null;
    const baseKey = normalizeCardName(`${expenseItem ?? ''}|${detail}`);
    let cardKey = baseKey;
    let n = 2;
    while (project.lines.some((l) => l.cardKey === cardKey)) cardKey = `${baseKey}#${n++}`;
    const amounts = amountsOf(row, cols);
    project.lines.push({ expenseItem, name: detail, cardKey, ...amounts });
    project.lineTotal = addAmounts(project.lineTotal, amounts);
  }

  const list = order.map((k) => projects.get(k)!);
  for (const p of list) {
    for (const k of AMOUNT_KEYS) {
      const diff = p.cardTotal[k] - p.lineTotal[k];
      if (diff !== 0) p.mismatch[k] = diff;
    }
  }
  return { projects: list, cardDate: cardDateFromFileName(fileName), warnings };
}

// ── 다시 올릴 때 짝짓기 ─────────────────────────────────────────────────────

export interface ExistingLine {
  id: string;
  name: string;
  expense_item: string | null;
  card_key: string | null;
  budget_amount: number;
  pumui: number;
  wonin: number;
  manual_override: boolean;
  origin: 'card' | 'manual';
}

export type LineChange = 'new' | 'changed' | 'same';

export interface LineMatch {
  card: CardLine;
  lineId: string | null;
  change: LineChange;
  /** 바뀐 칸: 예산현액·품의·원인행위 */
  diffs: { field: 'budget' | 'pumui' | 'wonin'; before: number; after: number }[];
  overwritesManual: boolean;
}

export interface CardDiff {
  matches: LineMatch[];
  /** 지금 사업에 있는데 카드에 없는 줄(카드에서 온 줄만) */
  missing: ExistingLine[];
}

/** 카드 줄 ↔ 지금 산출내역: card_key 가 같으면 짝, 아니면 (비목, 이름) 정규화가 같으면 짝 */
export function diffCardWithLines(card: CardLine[], existing: ExistingLine[]): CardDiff {
  const used = new Set<string>();
  const byKey = new Map(existing.filter((l) => l.card_key).map((l) => [l.card_key as string, l]));
  const matches: LineMatch[] = card.map((c) => {
    let hit = byKey.get(c.cardKey);
    if (hit && used.has(hit.id)) hit = undefined;
    if (!hit) {
      hit = existing.find((l) => !used.has(l.id)
        && normalizeCardName(l.name) === normalizeCardName(c.name)
        && normalizeCardName(l.expense_item ?? '') === normalizeCardName(c.expenseItem ?? ''));
    }
    if (!hit) {
      hit = existing.find((l) => !used.has(l.id) && normalizeCardName(l.name) === normalizeCardName(c.name));
    }
    if (!hit) return { card: c, lineId: null, change: 'new' as const, diffs: [], overwritesManual: false };
    used.add(hit.id);
    const diffs: LineMatch['diffs'] = [];
    if (hit.budget_amount !== c.budget) diffs.push({ field: 'budget', before: hit.budget_amount, after: c.budget });
    if (hit.pumui !== c.pumui) diffs.push({ field: 'pumui', before: hit.pumui, after: c.pumui });
    if (hit.wonin !== c.wonin) diffs.push({ field: 'wonin', before: hit.wonin, after: c.wonin });
    return {
      card: c,
      lineId: hit.id,
      change: diffs.length ? 'changed' : 'same',
      diffs,
      overwritesManual: hit.manual_override && diffs.some((d) => d.field !== 'budget'),
    };
  });
  const missing = existing.filter((l) => !used.has(l.id) && l.origin === 'card');
  return { matches, missing };
}

/** RPC `budget_apply_card` 에 보낼 모양 */
export function cardPayload(project: CardProject, matches: LineMatch[], cardDate: string | null) {
  return {
    card_date: cardDate,
    card_total: project.cardTotal,
    lines: matches.map((m) => ({
      line_id: m.lineId,
      name: m.card.name,
      expense_item: m.card.expenseItem,
      card_key: m.card.cardKey,
      budget: m.card.budget,
      pumui: m.card.pumui,
      wonin: m.card.wonin,
      jichul: m.card.jichul,
      jigeup: m.card.jigeup,
    })),
  };
}
