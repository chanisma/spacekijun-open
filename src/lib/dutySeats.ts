// ========================================
// 업무분장(자리 ↔ 사람) — 순수 로직 단일 출처
// 표 = duty_seat / duty_seat_holder (supabase/migrations/20260923153000_duty_seats.sql)
// 기간 판정은 DB duty_holder_active() 와 같은 규칙이어야 한다: NULL = 열린 끝.
// ========================================

export type DutySeatKind = 'head' | 'admin' | 'duty' | 'support';

export const DUTY_SEAT_KIND_LABEL: Record<DutySeatKind, string> = {
  admin: '관리자',
  head: '부장',
  duty: '업무 담당',
  support: '지원',
};

export const DUTY_SEAT_KIND_ORDER: DutySeatKind[] = ['admin', 'head', 'duty', 'support'];

/**
 * 관리자 자리는 **교장 → 교감** 순이다 (2026-09-24 사용자 규약).
 *
 * ⚠️ `sort_order` 에 기대면 안 된다 — 시드가 artifact 의 등장 순서를 그대로 옮겨 라이브는
 * 교감(0) → 교장(1) 이다. 정렬을 데이터에 맡기면 화면마다 순서가 갈린다.
 */
const ADMIN_SEAT_RANK: Record<string, number> = { 교장: 0, 교감: 1 };

export function adminSeatRank(name: string): number {
  return ADMIN_SEAT_RANK[name] ?? 50;
}

/** 자리 정렬 — 종류(관리자·부장·담당·지원) → 관리자는 교장·교감 → 저장된 순서 → 이름 */
export function compareDutySeats(
  a: Pick<DutySeat, 'name' | 'kind' | 'sort_order'>,
  b: Pick<DutySeat, 'name' | 'kind' | 'sort_order'>,
): number {
  const byKind = DUTY_SEAT_KIND_ORDER.indexOf(a.kind) - DUTY_SEAT_KIND_ORDER.indexOf(b.kind);
  if (byKind !== 0) return byKind;
  if (a.kind === 'admin') {
    const byRank = adminSeatRank(a.name) - adminSeatRank(b.name);
    if (byRank !== 0) return byRank;
  }
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko');
}

export interface DutySeatArea {
  name: string;
  edufine_task: string | null;
}

export interface DutySeatHolder {
  id: string;
  seat_id: string;
  resource_id: string | null;
  holder_name: string;
  role: 'primary' | 'co';
  start_date: string | null;
  end_date: string | null;
  note: string | null;
}

export interface DutySeat {
  id: string;
  academic_year: number;
  name: string;
  department_id: string | null;
  kind: DutySeatKind;
  areas: DutySeatArea[];
  sort_order: number;
  note: string | null;
  meta: Record<string, unknown>;
  holders: DutySeatHolder[];
}

/** YYYY-MM-DD (로컬 날짜) */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 담당 기간 판정 — DB duty_holder_active 와 같은 규칙.
 * 문자열 비교로 충분하다(YYYY-MM-DD). NULL 은 열린 끝 — `between` 식으로 쓰면 조용히 빠진다.
 */
export function isHolderActive(
  holder: Pick<DutySeatHolder, 'start_date' | 'end_date'>,
  onDate: string,
): boolean {
  if (holder.start_date && holder.start_date > onDate) return false;
  if (holder.end_date && holder.end_date < onDate) return false;
  return true;
}

/** 그 날짜의 담당자(정 먼저) */
export function activeHolders(seat: Pick<DutySeat, 'holders'>, onDate: string): DutySeatHolder[] {
  return seat.holders
    .filter((h) => isHolderActive(h, onDate))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1));
}

/**
 * 학년도의 "기준일" — 오늘이 그 학년도 안이면 오늘, 아니면 그 학년도의 끝(2월 말) 또는 시작(3월 1일).
 * 지난 학년도를 볼 때 "오늘" 기준으로 풀면 모든 기간이 끝나 담당자가 비어 보인다.
 */
export function referenceDateForYear(academicYear: number, today: Date = new Date()): string {
  const start = `${academicYear}-03-01`;
  const end = `${academicYear + 1}-02-28`;
  const key = toDateKey(today);
  if (key < start) return start;
  if (key > end) return end;
  return key;
}

export function formatHolderPeriod(holder: Pick<DutySeatHolder, 'start_date' | 'end_date'>): string | null {
  const fmt = (v: string) => v.slice(5).replace('-', '.');
  if (!holder.start_date && !holder.end_date) return null;
  if (holder.start_date && holder.end_date) return `${fmt(holder.start_date)}~${fmt(holder.end_date)}`;
  if (holder.start_date) return `${fmt(holder.start_date)}~`;
  return `~${fmt(holder.end_date!)}`;
}

/** areas 텍스트(한 줄에 "영역 | 단위과제") ↔ 배열 */
export function parseAreasText(text: string): DutySeatArea[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, task] = line.split('|').map((part) => part.trim());
      return { name, edufine_task: task ? task : null };
    })
    .filter((a) => a.name);
}

export function areasToText(areas: DutySeatArea[]): string {
  return areas.map((a) => (a.edufine_task ? `${a.name} | ${a.edufine_task}` : a.name)).join('\n');
}

export function normalizeAreas(value: unknown): DutySeatArea[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      if (!name) return null;
      const task = typeof record.edufine_task === 'string' && record.edufine_task.trim()
        ? record.edufine_task.trim()
        : null;
      return { name, edufine_task: task };
    })
    .filter((a): a is DutySeatArea => a !== null);
}

/**
 * 정합 점검: 부장 자리(kind=head)의 현 담당자 ↔ `부장` 태그 보유자.
 * 태그는 권한 함수들이 읽으므로 자리를 바꿔도 자동으로 따라가지 않는다 — 차이만 드러낸다.
 */
export function compareHeadsWithTag(
  seats: DutySeat[],
  tagHolderIds: string[],
  onDate: string,
): { seatOnly: { seat: string; name: string; resourceId: string }[]; tagOnly: string[] } {
  const seatHeadIds = new Map<string, { seat: string; name: string }>();
  for (const seat of seats) {
    if (seat.kind !== 'head') continue;
    for (const h of activeHolders(seat, onDate)) {
      if (h.resource_id) seatHeadIds.set(h.resource_id, { seat: seat.name, name: h.holder_name });
    }
  }
  const tagSet = new Set(tagHolderIds);
  const seatOnly = [...seatHeadIds.entries()]
    .filter(([id]) => !tagSet.has(id))
    .map(([resourceId, v]) => ({ ...v, resourceId }));
  const tagOnly = tagHolderIds.filter((id) => !seatHeadIds.has(id));
  return { seatOnly, tagOnly };
}
