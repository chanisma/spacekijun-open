/**
 * 공문 판단함 — 목록 판정의 단일 출처 (2026-10-30). 화면은 그리기만 한다.
 * 설계 = docs/plans/2026-10-30-official-doc-triage.md
 */
import type { OfficialDoc } from '@/features/official-docs/officialDocService';

export const INBOX_FILTERS = [
  { value: 'pending', label: '판단 대기' },
  { value: 'action', label: '처리 필요' },
  { value: 'decided', label: '결정됨' },
  { value: 'all', label: '전체' },
] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number]['value'];

/** 처리가 필요하다고 본 문서인가 — LLM 판정 우선, 없으면 규칙 판정의 수준(의무) */
export function needsAction(doc: OfficialDoc): boolean {
  const t = doc.triage;
  if (!t) return false;
  if (typeof t.needs_action === 'boolean') return t.needs_action;
  return t.result?.rules?.수준 === '의무';
}

export function matchesFilter(doc: OfficialDoc, filter: InboxFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'decided') return !!doc.decision;
  if (filter === 'pending') return !doc.decision;
  return !doc.decision && needsAction(doc);
}

/**
 * 드롭다운 필터(2026-10-30) — 성격 · 의무 여부 · 발신 구분 · 기한 · 담당(결재권자) · 결정 종류.
 * 값 '' = 전체. 판정이 없는 문서는 성격·의무 여부에서 «미판정»(NONE)으로 고른다.
 */
export const NONE = '__none__';
export interface InboxFacets {
  nature: string;
  obligation: string;
  sender: '' | 'official' | 'other';
  deadline: '' | 'overdue' | 'd3' | 'd7' | 'has' | 'none';
  approver: string;
  decision: string;
}
export const EMPTY_FACETS: InboxFacets = { nature: '', obligation: '', sender: '', deadline: '', approver: '', decision: '' };

export const FACET_LABELS: Record<keyof InboxFacets, string> = {
  nature: '성격',
  obligation: '의무 여부',
  sender: '발신',
  deadline: '기한',
  approver: '담당',
  decision: '결정',
};

const NATURE_ORDER = ['제출', '추천', '설문', '참석', '실시', '지침', '기회', '홍보', '무관', '업무'];
const OBLIGATION_ORDER = ['의무', '해당 시', '협조', '선택', '없음'];
const SENDER_LABELS = { official: '교육기관·학교·대학', other: '그 밖의 기관' } as const;
const DEADLINE_LABELS = { overdue: '기한 지남', d3: '3일 이내', d7: '7일 이내', has: '기한 있음', none: '기한 없음' } as const;

function natureOf(doc: OfficialDoc): string {
  return doc.triage?.nature ?? doc.triage?.result?.nature ?? NONE;
}
function obligationOf(doc: OfficialDoc): string {
  return doc.triage?.result?.obligation ?? NONE;
}
/** 발신 구분 — 판정(odt-3~)이 남긴 sender_official. 없으면 모름(어느 쪽에도 안 걸린다) */
function senderKind(doc: OfficialDoc): 'official' | 'other' | null {
  const v = doc.triage?.result?.sender_official;
  return typeof v === 'boolean' ? (v ? 'official' : 'other') : null;
}
function deadlineMatches(doc: OfficialDoc, want: InboxFacets['deadline'], today: Date): boolean {
  const days = daysUntil(doc.triage?.deadline, today);
  if (want === 'none') return days === null;
  if (days === null) return false;
  if (want === 'overdue') return days < 0;
  if (want === 'd3') return days >= 0 && days <= 3;
  if (want === 'd7') return days >= 0 && days <= 7;
  return true;
}

export function matchesFacets(doc: OfficialDoc, f: InboxFacets, today: Date = new Date()): boolean {
  if (f.nature && natureOf(doc) !== f.nature) return false;
  if (f.obligation && obligationOf(doc) !== f.obligation) return false;
  if (f.sender && senderKind(doc) !== f.sender) return false;
  if (f.deadline && !deadlineMatches(doc, f.deadline, today)) return false;
  if (f.approver && (doc.approver_name || NONE) !== f.approver) return false;
  if (f.decision && (doc.decision?.decision ?? NONE) !== f.decision) return false;
  return true;
}

export function activeFacetCount(f: InboxFacets): number {
  return Object.values(f).filter(Boolean).length;
}

export interface FacetOption { value: string; label: string; count: number }

/**
 * 드롭다운 항목 + 건수. 건수는 «그 칸만 빼고 나머지 조건은 다 건» 결과로 센다(고르면 몇 건이 남는지).
 * 건수 0 인 항목은 숨기되, 지금 고른 값은 남긴다.
 */
export function facetOptions(docs: OfficialDoc[], f: InboxFacets, key: keyof InboxFacets, today: Date = new Date()): FacetOption[] {
  const rest = docs.filter((d) => matchesFacets(d, { ...f, [key]: '' }, today));
  const count = (value: string) => rest.filter((d) => matchesFacets(d, { ...EMPTY_FACETS, [key]: value } as InboxFacets, today)).length;
  let values: Array<{ value: string; label: string }>;
  if (key === 'nature') values = [...NATURE_ORDER.map((v) => ({ value: v, label: v })), { value: NONE, label: '미판정' }];
  else if (key === 'obligation') values = [...OBLIGATION_ORDER.map((v) => ({ value: v, label: v })), { value: NONE, label: '미판정' }];
  else if (key === 'sender') values = Object.entries(SENDER_LABELS).map(([value, label]) => ({ value, label }));
  else if (key === 'deadline') values = Object.entries(DEADLINE_LABELS).map(([value, label]) => ({ value, label }));
  else if (key === 'approver') {
    const names = [...new Set(docs.map((d) => d.approver_name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'ko'));
    values = [...names.map((n) => ({ value: n, label: n })), { value: NONE, label: '담당 없음' }];
  } else {
    values = [
      ...Object.entries(DECISION_LABELS).map(([value, label]) => ({ value, label })),
      { value: NONE, label: '아직 안 함' },
    ];
  }
  return values
    .map((v) => ({ ...v, count: count(v.value) }))
    .filter((v) => v.count > 0 || v.value === f[key]);
}

export function matchesQuery(doc: OfficialDoc, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [doc.title, doc.sender, doc.approver_name, doc.doc_no, doc.triage?.result?.summary]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

/** 기한까지 남은 날(오늘 = 0, 지남 = 음수). 기한이 없으면 null */
export function daysUntil(deadline: string | null | undefined, today: Date = new Date()): number | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const [y, m, d] = deadline.split('-').map(Number);
  const due = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / 86_400_000);
}

/**
 * 접수 등록일 기간 (2026-11-04) — 서버(list_official_docs)에 걸어 받는 양 자체를 줄인다.
 * 기본 = 최근 30일: 하루 ~30건 유입이라 «이번 학년도»를 기본으로 두면 연말엔 수천 건을 다시 받는다.
 * 기간 밖 판단 대기는 RPC 의 pending_outside 로 알려 잊히지 않게 한다.
 */
export const DATE_PRESETS = [
  { value: 'd7', label: '최근 7일' },
  { value: 'd30', label: '최근 30일' },
  { value: 'year', label: '이번 학년도' },
  { value: 'all', label: '전체 기간' },
  { value: 'custom', label: '직접 지정' },
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number]['value'];
export const DEFAULT_DATE_PRESET: DatePreset = 'd30';

export interface DateRange { from: string | null; to: string | null }

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' 에서 n 일 앞뒤(달력 계산만 — 시간대 무관) */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 고른 기간 → 서버에 넘길 날짜(한국 날짜, 양끝 포함). today = 한국 날짜 'YYYY-MM-DD' */
export function dateRangeOf(preset: DatePreset, today: string, custom: DateRange = { from: null, to: null }): DateRange {
  if (preset === 'all') return { from: null, to: null };
  if (preset === 'd7') return { from: shiftDateKey(today, -6), to: today };
  if (preset === 'd30') return { from: shiftDateKey(today, -29), to: today };
  if (preset === 'year') {
    // 학년도 = 3월 1일 시작(getCurrentAcademicYear 와 같은 규칙)
    const [y, m] = today.split('-').map(Number);
    return { from: `${m >= 3 ? y : y - 1}-03-01`, to: today };
  }
  const from = custom.from && DATE_KEY.test(custom.from) ? custom.from : null;
  const to = custom.to && DATE_KEY.test(custom.to) ? custom.to : null;
  // 거꾸로 넣으면 바꿔 준다(빈 목록보다 낫다)
  return from && to && from > to ? { from: to, to: from } : { from, to };
}

/** 표시 순서 — 처리 순(기본) · 접수 등록일 최신순 · 오래된순 */
export const DOC_SORTS = [
  { value: 'priority', label: '처리 순' },
  { value: 'newest', label: '최근 접수순' },
  { value: 'oldest', label: '오래된 접수순' },
] as const;
export type DocSort = (typeof DOC_SORTS)[number]['value'];

const byRegistered = (a: OfficialDoc, b: OfficialDoc) =>
  (a.registered_at ?? '').localeCompare(b.registered_at ?? '') || a.doc_no.localeCompare(b.doc_no);

export function sortDocs(docs: OfficialDoc[], sort: DocSort): OfficialDoc[] {
  const list = docs.slice();
  if (sort === 'newest') return list.sort((a, b) => byRegistered(b, a));
  if (sort === 'oldest') return list.sort(byRegistered);
  return list.sort(compareDocs);
}

/** 정렬: 판단 대기 먼저 → 처리 필요 → 기한 가까운 순 → 최근 등록 순 */
export function compareDocs(a: OfficialDoc, b: OfficialDoc): number {
  const pendA = a.decision ? 1 : 0;
  const pendB = b.decision ? 1 : 0;
  if (pendA !== pendB) return pendA - pendB;
  const actA = needsAction(a) ? 0 : 1;
  const actB = needsAction(b) ? 0 : 1;
  if (actA !== actB) return actA - actB;
  const dA = daysUntil(a.triage?.deadline) ?? Number.POSITIVE_INFINITY;
  const dB = daysUntil(b.triage?.deadline) ?? Number.POSITIVE_INFINITY;
  if (dA !== dB) return dA - dB;
  return (b.registered_at ?? '').localeCompare(a.registered_at ?? '');
}

export const DECISION_LABELS: Record<NonNullable<OfficialDoc['decision']>['decision'], string> = {
  ignore: '무시',
  info: '참고만',
  link_work: '업무에 연결',
  link_task: '할 일에 연결',
  create_work: '새 업무',
  reassign: '다른 사람에게',
};

export const UNCERTAIN_LABELS: Record<string, string> = {
  분장: '업무 분장이 모호',
  용어: '용어가 모호',
  대상: '대상이 모호',
  기한: '기한이 모호',
  업무: '맞는 업무가 없음',
};

/** 본문 → 덩어리. `| 칸 | 칸 |` 줄이 이어지면 표 하나(구분 줄 `| --- |` 은 버린다), 나머지는 줄 묶음 */
export function bodyBlocks(text: string): Array<{ table?: string[][]; lines?: string[] }> {
  const parts: Array<{ table?: string[][]; lines?: string[] }> = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const last = parts[parts.length - 1];
    if (/^\|.*\|$/.test(line)) {
      if (/^\|(\s*-{3,}\s*\|)+$/.test(line)) continue;
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      if (last?.table) last.table.push(cells);
      else parts.push({ table: [cells] });
    } else if (last?.lines) last.lines.push(raw);
    else parts.push({ lines: [raw] });
  }
  return parts;
}

/** 후속 공문의 원 공문(목록 안에 있으면) — 판정의 parent 첫 번째 */
export function parentDocOf(doc: OfficialDoc, docs: OfficialDoc[]): OfficialDoc | null {
  const no = doc.triage?.result?.parent?.[0]?.doc_no;
  return no ? docs.find((d) => d.doc_no === no) ?? null : null;
}
