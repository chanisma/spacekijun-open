// 대입 전형 변경사항 — 원본 레코드 파싱·정규화 (순수).
//
// 출처 = jinhak.esteacher.kr/jinhak2028.html 의 `<script id="records-data">` JSON.
// 적재 스크립트와 화면이 **같은 파서**를 써야 하므로 여기 한 곳에만 둔다.
//
// React·DB 비의존 순수 모듈 — Node 회귀 테스트와 적재 스크립트가 그대로 import 한다.

/** 원본 JSON 한 건 (사이트가 내려주는 모양 그대로) */
export interface RawChangeRecord {
  id: string;
  sheet: string;
  row: number;
  category: string;
  comparison: string;
  region: string;
  university: string;
  keywords: string[];
  item: string;
  afterLabel: string;
  beforeLabel: string;
  after: string;
  before: string;
  changeType: string;
  keywordText: string;
}

/** DB `admission_change` 한 행 (snake_case) */
export interface AdmissionChangeRow {
  id: string;
  sheet: string;
  source_row: number | null;
  category: string;
  comparison: string;
  after_year: number | null;
  before_year: number | null;
  region: string | null;
  university: string;
  admission_item: string | null;
  keywords: string[];
  after_text: string;
  before_text: string | null;
  change_type: string;
  source_url: string;
  source_date: string | null;
}

/** 화면에서 쓰는 camelCase 형태 */
export interface AdmissionChange {
  id: string;
  category: string;
  comparison: string;
  afterYear: number | null;
  beforeYear: number | null;
  university: string;
  admissionItem: string | null;
  keywords: string[];
  afterText: string;
  beforeText: string | null;
  changeType: string;
}

export const CHANGE_SOURCE_URL = 'https://jinhak.esteacher.kr/jinhak2028.html';

/**
 * `'2028↔2027'` → `{ after: 2028, before: 2027 }`.
 *
 * 화살표 문자가 원본에서 `↔`/`->`/`→` 로 흔들릴 수 있어 **문자가 아니라 4자리 연도 2개**를
 * 뽑는다. 라벨(`afterLabel`='2028 대입')에서 뽑지 않는 이유는 시트마다 라벨 표기가
 * 다르기 때문(`'2028 대입'` vs `'2027'`).
 */
export function parseComparisonYears(comparison: string): { after: number | null; before: number | null } {
  const years = (comparison ?? '').match(/\d{4}/g);
  if (!years || years.length < 2) return { after: null, before: null };
  const a = Number(years[0]);
  const b = Number(years[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { after: null, before: null };
  // 원본 표기는 항상 '새 학년도↔옛 학년도' 순이지만, 뒤집혀 들어와도 큰 쪽을 after 로 본다.
  return a >= b ? { after: a, before: b } : { after: b, before: a };
}

/** 빈 문자열·공백만 있는 값은 null 로 (DB 에 ''와 NULL 이 섞이지 않게) */
function orNull(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** 원본 레코드 → DB 행 */
export function toChangeRow(r: RawChangeRecord, sourceDate: string | null): AdmissionChangeRow {
  const { after, before } = parseComparisonYears(r.comparison);
  return {
    id: r.id,
    sheet: r.sheet,
    source_row: Number.isFinite(r.row) ? r.row : null,
    category: r.category,
    comparison: r.comparison,
    after_year: after,
    before_year: before,
    // '미분류'는 지역이 없다는 뜻이라 null 로 접는다 (필터에서 가짜 선택지가 생기지 않게)
    region: r.region === '미분류' ? null : orNull(r.region),
    university: (r.university ?? '').trim(),
    admission_item: orNull(r.item),
    keywords: Array.isArray(r.keywords) ? r.keywords.filter(Boolean) : [],
    after_text: (r.after ?? '').trim(),
    before_text: orNull(r.before),
    change_type: r.changeType,
    source_url: CHANGE_SOURCE_URL,
    source_date: sourceDate,
  };
}

/**
 * 적재 전 검증. **오류를 조용히 넘기지 않는다** — 원본 사이트가 형식을 바꾸면
 * 여기서 걸려야지, 절반만 들어간 표가 상담에 쓰이면 안 된다.
 */
export function validateChangeRows(rows: AdmissionChangeRow[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.id) problems.push('id 없는 레코드');
    else if (seen.has(r.id)) problems.push(`id 중복: ${r.id}`);
    else seen.add(r.id);
    if (!r.university) problems.push(`${r.id}: 대학명 없음`);
    if (!r.after_text) problems.push(`${r.id}: 변경 후 내용 없음`);
    if (r.after_year == null || r.before_year == null) problems.push(`${r.id}: 연도쌍 파싱 실패 (${r.comparison})`);
    else if (r.after_year <= r.before_year) problems.push(`${r.id}: 연도 순서 이상 (${r.comparison})`);
  }
  return problems;
}

/** DB 행 → 화면용 */
export function mapChange(r: Record<string, unknown>): AdmissionChange {
  return {
    id: String(r.id),
    category: String(r.category ?? ''),
    comparison: String(r.comparison ?? ''),
    afterYear: r.after_year != null ? Number(r.after_year) : null,
    beforeYear: r.before_year != null ? Number(r.before_year) : null,
    university: String(r.university ?? ''),
    admissionItem: (r.admission_item as string | null) ?? null,
    keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
    afterText: String(r.after_text ?? ''),
    beforeText: (r.before_text as string | null) ?? null,
    changeType: String(r.change_type ?? ''),
  };
}

/* ───────────────────── 표시 규칙 ───────────────────── */

/** 변경 종류별 색 — 상태는 텍스트가 아니라 색으로 읽힌다(앱 전역 규약) */
export const CHANGE_TYPE_COLORS: Record<string, string> = {
  '신설/추가': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '폐지/삭제': 'bg-rose-50 text-rose-700 border-rose-200',
  '강화/확대': 'bg-amber-50 text-amber-700 border-amber-200',
  '완화/축소': 'bg-blue-50 text-blue-700 border-blue-200',
  '변경': 'bg-slate-50 text-slate-600 border-slate-200',
};

export function changeTypeColor(t: string): string {
  return CHANGE_TYPE_COLORS[t] ?? CHANGE_TYPE_COLORS['변경'];
}

/** `'#수능최저'` → `'수능최저'` (칩 라벨) */
export function keywordLabel(k: string): string {
  return k.replace(/^#/, '');
}

/**
 * 연도쌍별로 묶는다 (비교표가 `2028↔2027` / `2027↔2026` … 행으로 나뉜다).
 * 최신 연도쌍이 먼저 오도록 내림차순 정렬.
 */
export function groupByComparison(changes: AdmissionChange[]): Array<{ comparison: string; afterYear: number | null; items: AdmissionChange[] }> {
  const byKey = new Map<string, { comparison: string; afterYear: number | null; items: AdmissionChange[] }>();
  for (const c of changes) {
    const g = byKey.get(c.comparison) ?? { comparison: c.comparison, afterYear: c.afterYear, items: [] };
    g.items.push(c);
    byKey.set(c.comparison, g);
  }
  return Array.from(byKey.values()).sort((a, b) => (b.afterYear ?? 0) - (a.afterYear ?? 0));
}

/**
 * 비교표 셀에 넣을 한 줄 요약.
 * 전문을 그대로 넣으면(after 최대 251자 × 여러 건) 표가 세로로 무너지므로
 * **무엇이 바뀌었는지(키워드) + 몇 건인지**만 낸다. 전문은 상세 모달이 보여준다.
 */
export function summarizeChanges(changes: AdmissionChange[]): string {
  if (changes.length === 0) return '';
  const kws: string[] = [];
  for (const c of changes) {
    for (const k of c.keywords) {
      const label = keywordLabel(k);
      if (label && !kws.includes(label)) kws.push(label);
    }
  }
  const head = kws.slice(0, 3).join(' · ') || changes[0].changeType;
  const more = kws.length > 3 ? ` 외 ${kws.length - 3}` : '';
  return `${head}${more} (${changes.length}건)`;
}

/**
 * 인쇄·엑셀에 넣을 전문.
 * 화면은 요약만 보여주지만 **내보낸 파일에는 원문이 남아야 한다** — 상담 자료를 뽑아
 * 놓고 "여기 뭐가 바뀌었더라"를 다시 앱에서 찾게 만들면 안 된다.
 */
export function changesFullText(changes: AdmissionChange[]): string {
  return changes
    .map((c) => {
      const kw = c.keywords.map(keywordLabel).join('·');
      const head = [c.changeType, kw].filter(Boolean).join(' ');
      const before = c.beforeText ? `${c.beforeText} → ` : '';
      return `[${head}] ${before}${c.afterText}`;
    })
    .join('\n');
}
