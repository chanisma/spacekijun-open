/**
 * 학교 업무 지도 — 축을 골라 보는 피벗 집계의 **단일 출처** (2026-09-24).
 *
 * ⚠️ **이 화면은 업무량을 재지 않는다 (사용자 결정).** 모든 업무가 이 시스템에 올라와 있지
 * 않으므로(라이브: 등록 부서 36개 중 **4개**, 교직원 68명 중 매니저 **6명**) 여기서 나오는
 * 숫자는 «학교가 하는 일»이 아니라 **«시스템에 올라온 일»**이다. 그래서 값 이름도 「올라온
 * 업무/할 일」이고, 화면은 그 사실을 상시 문구로 말한다. 빈 행을 지우지 않는 이유도 같다 —
 * 빈 칸이 "여기는 아직 시스템 밖"이라는 **이 지도의 본래 메시지**다.
 *
 * ⚠️ **사람 축을 두지 않는다 (사용자 결정 + 로드맵 원칙 2).** 개인별 업무량 비교표가 되기
 * 때문이다. 대신 **업무분장 자리**로 세운다 — 자리는 담당자가 바뀌어도 남으므로 작년·올해가
 * 같은 행에서 비교되고, 인사이동이 지도를 흔들지 않는다.
 */
import { activeHolders, type DutySeat } from './dutySeats';
import { getTaskDeadlines } from './taskDeadlines';

// ---------- 입력 모양 (화면이 가진 것 그대로) ----------

export interface PivotAssignee {
  id?: string | null;
  status?: string | null;
}

export interface PivotTask {
  id: string;
  title: string;
  type?: string | null;
  status?: string | null;
  due_date?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface PivotWork {
  id: string;
  name: string;
  status?: string | null;
  meta?: Record<string, unknown> | null;
  tasks?: PivotTask[] | null;
}

/** 사람 → 분장 자리. 업무의 매니저를 자리로 옮길 때 쓴다 */
export interface SeatLookup {
  /** 자리 id → 표시 이름(부서 포함) */
  label: Map<string, string>;
  /** 사람(resource id) → 그 사람이 맡은 자리 id 들 */
  byResource: Map<string, string[]>;
  /**
   * 자리 id → 부서 **이름** (같은 부서 자리를 먼저 고르는 데 쓴다).
   *
   * ⚠️ id 가 아니라 이름이다 — `work.meta.department` 가 이름을 담기 때문이다
   * (`TaskManagement` 의 부서 필터가 `=== selectedDepartment.name` 로 비교한다).
   * id 를 넣으면 비교가 **영원히 거짓**이 되어 자리가 둘인 사람의 업무가 조용히
   * 엉뚱한 자리로 간다 — 오류는 나지 않는다.
   */
  department: Map<string, string | null>;
  /** 자리 id → 정렬 순서 */
  order: Map<string, number>;
  /** 자리 id → 종류 */
  kind: Map<string, string>;
  /** 자리 id → 자리 이름만(부서 접두 없이) — 부서로 묶으면 부서 이름이 중복된다 */
  shortLabel: Map<string, string>;
  /** 자리 id → 지금 그 자리를 맡은 사람들 */
  holders: Map<string, string[]>;
}

export const UNASSIGNED_SEAT = '__no_seat__';
export const UNKNOWN_BUCKET = '__none__';
/** 마감이 없는 할 일이 들어가는 열 — **빼면 합계가 조용히 안 맞는다** */
export const NO_DUE_BUCKET = '__no_due__';

// ---------- 축 ----------

export type RowAxisId = 'seat' | 'department' | 'work' | 'status' | 'taskType';
export type ColAxisId = 'month' | 'quarter' | 'term' | 'status' | 'taskType' | 'none';
export type MeasureId = 'tasks' | 'works' | 'overdue' | 'completion';

export const ROW_AXES: { id: RowAxisId; label: string }[] = [
  { id: 'seat', label: '업무분장' },
  { id: 'department', label: '부서' },
  { id: 'work', label: '업무' },
  { id: 'status', label: '상태' },
  { id: 'taskType', label: '할 일 유형' },
];

export const COL_AXES: { id: ColAxisId; label: string }[] = [
  { id: 'month', label: '월' },
  { id: 'quarter', label: '분기' },
  { id: 'term', label: '학기' },
  { id: 'status', label: '상태' },
  { id: 'taskType', label: '할 일 유형' },
  { id: 'none', label: '나누지 않음' },
];

export const MEASURES: { id: MeasureId; label: string; hint: string }[] = [
  { id: 'tasks', label: '올라온 할 일', hint: '이 시스템에 등록된 할 일 수' },
  { id: 'works', label: '올라온 업무', hint: '이 시스템에 등록된 업무 수' },
  { id: 'overdue', label: '기한 초과', hint: '마감이 지났는데 끝나지 않은 할 일' },
  { id: 'completion', label: '완료율', hint: '완료한 할 일 ÷ 전체 할 일' },
];

const STATUS_LABEL: Record<string, string> = {
  pending: '진행 중', active: '진행 중', completed: '완료', cancelled: '취소',
};
const TASK_TYPE_LABEL: Record<string, string> = {
  procedural: '절차형', one_time: '일회성',
};

// ---------- 날짜 버킷 ----------

/** `YYYY-MM-DD` 로 — timestamptz 를 그대로 자르면 시간대에 따라 하루가 밀린다 */
export function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 학년도 = 3월 시작. 1·2월은 앞 해의 학년도에 속한다 */
export function academicYearOf(dateKey: string): number {
  const [y, m] = dateKey.split('-').map(Number);
  return m >= 3 ? y : y - 1;
}

/** 학년도 안에서 몇 번째 달인가(0 = 3월 … 11 = 2월) */
export function academicMonthIndex(dateKey: string): number {
  const month = Number(dateKey.slice(5, 7));
  return (month - 3 + 12) % 12;
}

export function monthBucket(dateKey: string): string {
  return String(Number(dateKey.slice(5, 7)));
}

export function quarterBucket(dateKey: string): string {
  const index = academicMonthIndex(dateKey);
  return `${Math.floor(index / 3) + 1}`;
}

/** 1학기 = 3~8월, 2학기 = 9~2월 (학사력 기간이 설정돼 있으면 화면이 그 값을 넘긴다) */
export function termBucket(dateKey: string): string {
  return academicMonthIndex(dateKey) < 6 ? '1' : '2';
}

export function columnLabel(axis: ColAxisId, bucket: string): string {
  if (bucket === NO_DUE_BUCKET) return '기한 없음';
  if (bucket === UNKNOWN_BUCKET) return '미지정';
  if (axis === 'month') return `${bucket}월`;
  if (axis === 'quarter') return `${bucket}분기`;
  if (axis === 'term') return `${bucket}학기`;
  if (axis === 'status') return STATUS_LABEL[bucket] ?? bucket;
  if (axis === 'taskType') return TASK_TYPE_LABEL[bucket] ?? bucket;
  return '전체';
}

// ---------- 자리 결정 ----------

/**
 * 업무 → 분장 자리.
 *
 * 매니저(사람)를 거치지만 **화면에 서는 것은 자리**다. 한 사람이 자리를 둘 이상 가지면
 * **업무의 부서와 같은 부서의 자리를 먼저** 고르고, 그래도 여럿이면 **첫 자리 하나만** 쓴다.
 * ⚠️ 나눠 세지 않는다 — 업무 하나가 두 자리에 반씩 잡히면 합계가 실제보다 커진다.
 */
export function seatOfWork(work: PivotWork, seats: SeatLookup): string {
  const meta = (work.meta ?? {}) as { managers?: unknown; department?: unknown };
  const managers = Array.isArray(meta.managers) ? meta.managers : [];
  const workDept = typeof meta.department === 'string' ? meta.department : null;

  const candidates: string[] = [];
  for (const manager of managers) {
    const id = (manager as { id?: unknown })?.id;
    if (typeof id !== 'string') continue;
    for (const seatId of seats.byResource.get(id) ?? []) {
      if (!candidates.includes(seatId)) candidates.push(seatId);
    }
  }
  if (candidates.length === 0) return UNASSIGNED_SEAT;
  if (candidates.length === 1) return candidates[0];

  const sameDept = candidates.filter((seatId) => seats.department.get(seatId) === workDept);
  const pool = sameDept.length > 0 ? sameDept : candidates;
  // 결정적이어야 한다 — 정렬 순서가 같으면 id 로 가른다(렌더마다 행이 바뀌면 안 된다)
  return [...pool].sort(
    (a, b) => (seats.order.get(a) ?? 0) - (seats.order.get(b) ?? 0) || a.localeCompare(b),
  )[0];
}

// ---------- 집계 ----------

export interface PivotCell {
  row: string;
  col: string;
  /** 이 칸에 든 할 일 */
  taskIds: string[];
  /** 이 칸에 든 업무 */
  workIds: Set<string>;
  completed: number;
  overdue: number;
}

export interface PivotRow {
  key: string;
  label: string;
  /** 구획 이름 — 업무분장 축은 **부서**로 묶는다(2026-09-24 사용자 결정) */
  group?: string;
  /** 구획 정렬값 — 부서 안에서는 부장이 먼저 */
  groupOrder?: number;
  /** 지금 그 자리를 맡은 사람 — 자리 축에서만 채운다 */
  holders?: string[];
  /** 그 행에 걸린 후보 수(집계와 별개) */
  candidates?: number;
  order: number;
  cells: Map<string, PivotCell>;
  total: PivotCell;
}

export interface PivotResult {
  rows: PivotRow[];
  columns: string[];
  total: PivotCell;
  /** 채택률 — 이 지도가 답할 수 있는 유일한 «전체» 이야기 */
  coverage: { filled: number; all: number };
}

export interface PivotInput {
  works: PivotWork[];
  seats: SeatLookup;
  rowAxis: RowAxisId;
  colAxis: ColAxisId;
  /** 오늘(기한 초과 판정) — 테스트가 고정할 수 있게 받는다 */
  today: string;
  /** 끝난 업무·할 일을 뺄 것인가 */
  openOnly?: boolean;
  /**
   * 행 키 → 후보 수(`countCandidatesByRow`). **집계에 섞지 않고 행에 얹기만** 한다 —
   * 「올라온 것」과 「올라올 수 있는 것」이 한 숫자가 되면 이 화면의 요점이 사라진다.
   */
  candidateCounts?: Map<string, number> | null;
  /**
   * 이 학년도의 할 일만 센다(3월 시작). 주면 **다른 해는 빠진다**.
   *
   * ⚠️ 없으면 학년도가 섞인다 — 열이 달 이름뿐이라 2025-11 과 2026-11 이 **같은 칸**에
   * 쌓인다(라이브 11월 칸에 2025년 1건 + 2026년 14건). 오류가 아니라 틀린 숫자다.
   */
  academicYear?: number | null;
  /**
   * 부서 축에서 **자료가 없어도 그릴** 부서 이름 전부 (2026-09-24 사용자 요청).
   * 자리 축의 「빈 자리도 그린다」와 같은 이유 — 빈 줄이 사라지면 "전부 올라와 있다"로 보인다.
   */
  allDepartments?: string[];
}

function emptyCell(row: string, col: string): PivotCell {
  return { row, col, taskIds: [], workIds: new Set(), completed: 0, overdue: 0 };
}

function addToCell(cell: PivotCell, task: PivotTask, workId: string, today: string) {
  cell.taskIds.push(task.id);
  cell.workIds.add(workId);
  if (task.status === 'completed') cell.completed += 1;
  else if (isOverdue(task, today)) cell.overdue += 1;
}

/**
 * 기한 초과인가 — **다중 마감은 `due_date` 가 «다음 회차»의 사본**이라 그것만 보면 이미 끝낸
 * 회차까지 초과로 센다. 회차가 있으면 남은 회차 중 가장 이른 것을 본다.
 */
export function isOverdue(task: PivotTask, today: string): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') return false;
  const rounds = getTaskDeadlines(task as never);
  const keys = rounds.length > 0 ? rounds : [toDateKey(task.due_date)].filter(Boolean as never);
  if (keys.length === 0) return false;
  return (keys as string[]).some((key) => key < today);
}

/** 자리 하나의 행 모양 — 집계 경로와 「빈 자리 채우기」가 **같은 함수**를 써야 둘이 안 갈린다 */
function seatRowMeta(seatId: string, seats: SeatLookup) {
  if (seatId === UNASSIGNED_SEAT) {
    return {
      key: seatId, label: '분장 자리 없음', group: '분장 자리 없음',
      groupOrder: Number.MAX_SAFE_INTEGER, holders: [] as string[],
      order: Number.MAX_SAFE_INTEGER,
    };
  }
  const kind = seats.kind.get(seatId) ?? 'duty';
  return {
    key: seatId,
    label: seats.shortLabel.get(seatId) ?? seats.label.get(seatId) ?? '(사라진 자리)',
    // 부서로 묶는다 — 부서가 없는 자리(교장·교감·도서관 등)는 따로 모은다
    group: seats.department.get(seatId) ?? '부서 없음',
    groupOrder: seats.department.get(seatId) ? 0 : 1,
    holders: seats.holders.get(seatId) ?? [],
    // 부서 안에서는 부장이 먼저, 그다음 저장된 순서
    order: (kind === 'head' ? 0 : 1) * 10_000 + (seats.order.get(seatId) ?? 0),
  };
}

function rowsOfTask(
  input: PivotInput,
  work: PivotWork,
  task: PivotTask,
  seatId: string,
): { key: string; label: string; group?: string; order: number } {
  const { rowAxis, seats } = input;
  if (rowAxis === 'seat') return seatRowMeta(seatId, seats);
  if (rowAxis === 'department') {
    // 값이 이미 부서 «이름»이다(위 SeatLookup.department 주석 참고) — 이름표를 다시 찾지 않는다
    const dept = (work.meta as { department?: unknown } | null)?.department;
    const key = typeof dept === 'string' && dept ? dept : UNKNOWN_BUCKET;
    return { key, label: key === UNKNOWN_BUCKET ? '부서 없음' : key, order: 0 };
  }
  if (rowAxis === 'work') return { key: work.id, label: work.name, order: 0 };
  if (rowAxis === 'status') {
    const key = task.status ?? UNKNOWN_BUCKET;
    return { key, label: STATUS_LABEL[key] ?? key, order: 0 };
  }
  const key = task.type ?? UNKNOWN_BUCKET;
  return { key, label: TASK_TYPE_LABEL[key] ?? key, order: 0 };
}

function colOfTask(axis: ColAxisId, task: PivotTask): string {
  if (axis === 'none') return 'all';
  if (axis === 'status') return task.status ?? UNKNOWN_BUCKET;
  if (axis === 'taskType') return task.type ?? UNKNOWN_BUCKET;
  const key = toDateKey(task.due_date);
  if (!key) return NO_DUE_BUCKET;
  if (axis === 'month') return monthBucket(key);
  if (axis === 'quarter') return quarterBucket(key);
  return termBucket(key);
}

/**
 * 그 할 일이 속한 학년도.
 *
 * 마감일이 정본이고, 없으면 업무의 `meta.year`, 그래도 없으면 업무가 만들어진 학년도를 쓴다.
 * ⚠️ **«모름»을 만들지 않는다** — 모름을 모든 해에 넣으면 겹쳐 세고, 어느 해에도 안 넣으면
 * 마감 없는 할 일 33건이 조용히 사라진다. 셋째 폴백이 그 선택을 없앤다.
 */
export function academicYearOfTask(work: PivotWork, task: PivotTask): number | null {
  const due = toDateKey(task.due_date);
  if (due) return academicYearOf(due);
  const metaYear = Number((work.meta as { year?: unknown } | null)?.year);
  if (Number.isFinite(metaYear) && metaYear > 2000) return metaYear;
  const created = toDateKey((work as { created_at?: string }).created_at);
  return created ? academicYearOf(created) : null;
}

/** 열 순서 — 학년도는 3월부터다(1월이 맨 앞에 오면 학교 달력이 아니다) */
export function orderedColumns(axis: ColAxisId, used: Set<string>): string[] {
  const out: string[] = [];
  if (axis === 'none') out.push('all');
  else if (axis === 'month') for (let i = 0; i < 12; i += 1) out.push(String(((i + 2) % 12) + 1));
  else if (axis === 'quarter') out.push('1', '2', '3', '4');
  else if (axis === 'term') out.push('1', '2');
  else if (axis === 'status') out.push('pending', 'active', 'completed', 'cancelled');
  else out.push('procedural', 'one_time');

  const known = new Set(out);
  for (const key of used) if (!known.has(key) && key !== NO_DUE_BUCKET) out.push(key);
  // 기한 없음은 **항상 그린다** — 없는 열이면 합계가 조용히 안 맞는다
  if (axis === 'month' || axis === 'quarter' || axis === 'term') out.push(NO_DUE_BUCKET);
  return out;
}

/** 행 정렬 — 구획(부서) → 자리 순서 → 건수 → 이름. 두 곳에서 쓰므로 함수로 둔다 */
function sortRows(rows: PivotRow[]): PivotRow[] {
  return rows.sort(
    (a, b) =>
      (a.groupOrder ?? 0) - (b.groupOrder ?? 0)
      || (a.group ?? '').localeCompare(b.group ?? '', 'ko')
      || a.order - b.order
      || b.total.taskIds.length - a.total.taskIds.length
      || a.label.localeCompare(b.label, 'ko'),
  );
}

export function buildPivot(input: PivotInput): PivotResult {
  const rows = new Map<string, PivotRow>();
  const used = new Set<string>();
  const total = emptyCell('__total__', '__total__');
  const filledSeats = new Set<string>();

  for (const work of input.works) {
    if (input.openOnly && (work.status === 'completed' || work.status === 'cancelled')) continue;
    const seatId = seatOfWork(work, input.seats);
    for (const task of work.tasks ?? []) {
      if (input.openOnly && (task.status === 'completed' || task.status === 'cancelled')) continue;
      if (input.academicYear != null) {
        const taskYear = academicYearOfTask(work, task);
        if (taskYear !== null && taskYear !== input.academicYear) continue;
      }
      const meta = rowsOfTask(input, work, task, seatId);
      const col = colOfTask(input.colAxis, task);
      used.add(col);
      if (seatId !== UNASSIGNED_SEAT) filledSeats.add(seatId);

      let row = rows.get(meta.key);
      if (!row) {
        // ⚠️ 필드를 골라 담지 말 것 — `holders`·`groupOrder` 처럼 나중에 는 것이 조용히 빠진다.
        //    실제로 그렇게 해서 **업무가 있는 자리에만 담당자가 안 나왔다**(빈 자리 행은 멀쩡했다).
        row = { ...meta, cells: new Map(), total: emptyCell(meta.key, '__total__') };
        rows.set(meta.key, row);
      }
      let cell = row.cells.get(col);
      if (!cell) { cell = emptyCell(meta.key, col); row.cells.set(col, cell); }
      addToCell(cell, task, work.id, input.today);
      addToCell(row.total, task, work.id, input.today);
      addToCell(total, task, work.id, input.today);
    }
  }

  // 업무분장 축은 **비어 있는 자리도 전부 그린다** — 빈 행이 이 지도의 메시지다
  if (input.rowAxis === 'seat') {
    for (const seatId of input.seats.label.keys()) {
      if (rows.has(seatId)) continue;
      // ⚠️ 관리자(교장·교감)는 **빈 행을 그리지 않는다**(2026-09-24 사용자 결정) —
      //    업무를 맡는 자리가 아니라 지도에 늘 빈 줄로 남는다.
      //    다만 «집계에서 빼지는 않는다» — 실제로 업무가 걸리면(현재 라이브 0건) 행이 생긴다.
      //    무조건 빼면 그 업무가 어느 행에도 없어 **합계가 조용히 준다**.
      if (input.seats.kind.get(seatId) === 'admin') continue;
      const meta = seatRowMeta(seatId, input.seats);
      rows.set(seatId, { ...meta, cells: new Map(), total: emptyCell(seatId, '__total__') });
    }
  }

  // 부서 축도 마찬가지 — **업무가 없는 부서도 전부 그린다**(2026-09-24 사용자 요청).
  // 빠뜨리면 "업무를 올린 부서 4곳"만 보여 학교가 그게 전부인 것처럼 읽힌다(라이브 부서 36개).
  if (input.rowAxis === 'department') {
    for (const name of input.allDepartments ?? []) {
      if (rows.has(name)) continue;
      rows.set(name, {
        key: name, label: name, order: 0,
        cells: new Map(), total: emptyCell(name, '__total__'),
      });
    }
  }

  const ordered = sortRows([...rows.values()]);

  // 후보는 행별 개수만 붙인다 — 집계(합계·열)에는 절대 섞지 않는다.
  // 섞으면 «올라온 것»과 «올라올 수 있는 것»이 한 숫자가 되어 이 화면의 요점이 사라진다.
  if (input.candidateCounts) {
    // ⚠️ **후보만 있는 행도 만든다** (2026-09-25) — 올라온 업무가 하나도 없는 자리·부서,
    //    그리고 「분장 자리 없음」·「부서 없음」이 그렇다. 안 만들면 그 후보는 어느 줄에도
    //    없이 화면에서 사라진다(실측 57건·30건). 이 화면의 요점이 바로 그 빈 줄이다.
    for (const [key, count] of input.candidateCounts) {
      if (count <= 0 || rows.has(key)) continue;
      const meta = input.rowAxis === 'seat'
        ? seatRowMeta(key, input.seats)
        : {
            key, label: key === UNKNOWN_BUCKET ? '부서 없음' : key,
            order: 0, group: undefined, groupOrder: undefined, holders: [] as string[],
          };
      rows.set(key, { ...meta, cells: new Map(), total: emptyCell(key, '__total__') });
    }
    // 행이 늘었으니 정렬을 다시 — 위 `ordered` 는 이 행들을 모른다
    ordered.length = 0;
    ordered.push(...sortRows([...rows.values()]));
    for (const row of ordered) row.candidates = input.candidateCounts.get(row.key) ?? 0;
  }

  return {
    rows: ordered,
    columns: orderedColumns(input.colAxis, used),
    total,
    coverage: { filled: filledSeats.size, all: input.seats.label.size },
  };
}

/** 칸의 값 하나 — 화면은 이 숫자만 그린다 */
export function measureOf(cell: PivotCell | undefined, measure: MeasureId): number {
  if (!cell) return 0;
  if (measure === 'tasks') return cell.taskIds.length;
  if (measure === 'works') return cell.workIds.size;
  if (measure === 'overdue') return cell.overdue;
  return cell.taskIds.length === 0 ? 0 : Math.round((cell.completed / cell.taskIds.length) * 100);
}

/** 분장 자리 목록 → 조회용 지도 */
export function buildSeatLookup(
  seats: DutySeat[],
  departmentLabel?: Map<string, string>,
  /** 담당자를 푸는 기준일(YYYY-MM-DD) — 지난 학년도를 볼 때 «오늘»로 풀면 전원 빈다 */
  onDate?: string,
): SeatLookup {
  const lookup: SeatLookup = {
    label: new Map(), byResource: new Map(), department: new Map(), order: new Map(),
    kind: new Map(), shortLabel: new Map(), holders: new Map(),
  };
  seats.forEach((seat, index) => {
    const dept = (seat.department_id ? departmentLabel?.get(seat.department_id) : null) ?? null;
    lookup.label.set(seat.id, dept ? `${dept} · ${seat.name}` : seat.name);
    lookup.shortLabel.set(seat.id, seat.name);
    lookup.department.set(seat.id, dept);
    lookup.order.set(seat.id, seat.sort_order ?? index);
    lookup.kind.set(seat.id, seat.kind);
    lookup.holders.set(
      seat.id,
      (onDate ? activeHolders(seat, onDate) : (seat.holders ?? []))
        .map((holder) => holder.holder_name)
        .filter(Boolean),
    );
    for (const holder of seat.holders ?? []) {
      if (!holder.resource_id) continue;
      const list = lookup.byResource.get(holder.resource_id) ?? [];
      if (!list.includes(seat.id)) list.push(seat.id);
      lookup.byResource.set(holder.resource_id, list);
    }
  });
  return lookup;
}
