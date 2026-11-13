// 과제 단위(task units, 2026-08-12): 할 일을 "사람"이 아니라 "과제 명칭" 단위로 나눠
// 받아야 할 때(예: 과목별 평가계획서 수합) 쓰는 유틸. 저장 모델 —
//   - `task.meta.units: [{key, label}]` — 과제 단위 목록(1개 이상일 때만 존재)
//   - `task.meta.unitProgress: {unitKey: {assigneeId: {status, completed_at}}}` —
//     항목의 존재 자체가 "배정/자기 선택(claim)"이고 status가 수행 상태다
//   - `task.meta.assignees` = 담당자 범주(pool). 범주에 든 사람이 내 할 일로 인식하고,
//     단위를 직접 선택(claim)할 수 있다. 담당자 개인 상태는 "내 단위를 하나 이상 갖고
//     전부 완료"로 파생되고, task.status는 "모든 단위가 담당자를 갖고 전부 완료"로
//     파생된다(사람 기준이 아님 — 범주에만 있고 단위를 안 가진 사람은 완료를 막지 않는다).
// 서버 정본은 `set_task_unit_status` RPC(선택/해제/완료 토글을 원자적으로 처리 —
// JSONB read-modify-write 경쟁을 클라이언트에서 하면 동시 선택이 서로를 지운다).
// 다중 마감(meta.deadlines)과는 함께 쓸 수 없다(회차×단위 조합 폭발 — UI·저장·RPC 3중 방어).

export interface TaskUnit {
  key: string;
  label: string;
}

export interface UnitRecord {
  status: 'pending' | 'completed';
  completed_at?: string | null;
}

/** {unitKey: {assigneeResourceId: record}} — 항목 존재 = 그 단위의 담당(배정/자기 선택) */
export type UnitProgressMap = Record<string, Record<string, UnitRecord>>;

export interface TaskUnitLike {
  meta?: Record<string, unknown> | null;
}

/** task의 과제 단위 목록(없으면 빈 배열). 형식이 어긋난 항목은 걸러낸다. */
export function getTaskUnits(task: TaskUnitLike): TaskUnit[] {
  const raw = task.meta && (task.meta as { units?: unknown }).units;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (u): u is TaskUnit =>
      !!u &&
      typeof u === 'object' &&
      typeof (u as TaskUnit).key === 'string' &&
      (u as TaskUnit).key.length > 0 &&
      typeof (u as TaskUnit).label === 'string'
  );
}

export function isUnitTask(task: TaskUnitLike): boolean {
  return getTaskUnits(task).length > 0;
}

/** task의 단위별 수행 기록(없으면 빈 객체) */
export function getUnitProgress(task: TaskUnitLike): UnitProgressMap {
  const raw = task.meta && (task.meta as { unitProgress?: unknown }).unitProgress;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as UnitProgressMap)
    : {};
}

/** 특정 단위를 맡은(배정/선택한) 담당자 id 목록 */
export function unitHolderIds(progress: UnitProgressMap, unitKey: string): string[] {
  return Object.keys(progress[unitKey] ?? {});
}

/** 단위 완료 판정 — 담당자가 1명 이상이고 전원 완료 */
export function isUnitCompleted(progress: UnitProgressMap, unitKey: string): boolean {
  const holders = Object.values(progress[unitKey] ?? {});
  return holders.length > 0 && holders.every((r) => r?.status === 'completed');
}

export function isUnitCompletedBy(
  progress: UnitProgressMap,
  unitKey: string,
  assigneeId: string
): boolean {
  return progress[unitKey]?.[assigneeId]?.status === 'completed';
}

/** 단위 전체 진행 집계(카드 "단위 N/M" 표시용) */
export function unitCompletionStats(
  units: TaskUnit[],
  progress: UnitProgressMap
): { completed: number; total: number } {
  return {
    completed: units.filter((u) => isUnitCompleted(progress, u.key)).length,
    total: units.length,
  };
}

/** 이 담당자가 맡은 단위 목록 */
export function unitsOfAssignee(
  units: TaskUnit[],
  progress: UnitProgressMap,
  assigneeId: string
): TaskUnit[] {
  return units.filter((u) => Boolean(progress[u.key]?.[assigneeId]));
}

/** 아직 아무도 맡지 않은 단위 목록(범주 담당자의 선택 후보) */
export function unclaimedUnits(units: TaskUnit[], progress: UnitProgressMap): TaskUnit[] {
  return units.filter((u) => unitHolderIds(progress, u.key).length === 0);
}

interface AssigneeStatusLike {
  id: string;
  status?: string;
  completed_at?: string | null;
  [key: string]: unknown;
}

/**
 * 단위 기록에서 담당자 개인 상태 파생 — "내 단위가 1개 이상 있고 전부 완료"라야 완료.
 * 범주에만 있고 단위를 안 가진 사람은 pending(선택할 몫이 남았다는 뜻)으로 둔다.
 * cancelled 담당자는 그대로 두고, 단위 할 일이 아니면 원본 유지(다중 마감 파생과 동일 규약).
 */
export function deriveAssigneesFromUnits<T extends AssigneeStatusLike>(
  units: TaskUnit[],
  progress: UnitProgressMap,
  assignees: T[]
): T[] {
  if (units.length === 0) return assignees;
  return assignees.map((a) => {
    if ((a.status ?? 'pending') === 'cancelled') return a;
    const mine = unitsOfAssignee(units, progress, a.id);
    const done = mine.length > 0 && mine.every((u) => isUnitCompletedBy(progress, u.key, a.id));
    if (done && a.status === 'completed') return a;
    return {
      ...a,
      status: done ? 'completed' : 'pending',
      completed_at: done ? (a.completed_at ?? new Date().toISOString()) : null,
    };
  });
}

/** task.status 파생(표시·검증용 — 정본은 서버 RPC의 동일 규칙): 모든 단위 완료 */
export function deriveTaskStatusFromUnits(
  units: TaskUnit[],
  progress: UnitProgressMap
): 'pending' | 'completed' {
  return units.length > 0 && units.every((u) => isUnitCompleted(progress, u.key))
    ? 'completed'
    : 'pending';
}

/** 단위 목록·범주 밖의 고아 기록 제거(단위/범주 편집 시 정리) */
export function pruneUnitProgress(
  progress: UnitProgressMap,
  units: TaskUnit[],
  poolAssigneeIds: string[]
): UnitProgressMap {
  const keepUnit = new Set(units.map((u) => u.key));
  const keepAssignee = new Set(poolAssigneeIds);
  const out: UnitProgressMap = {};
  for (const [unitKey, holders] of Object.entries(progress)) {
    if (!keepUnit.has(unitKey)) continue;
    const kept: Record<string, UnitRecord> = {};
    for (const [assigneeId, record] of Object.entries(holders ?? {})) {
      if (keepAssignee.has(assigneeId)) kept[assigneeId] = record;
    }
    out[unitKey] = kept;
  }
  return out;
}

/** 편집 폼의 단위 행(단위 + 지정 담당자들)에서 unitProgress 재구성 — 기존 수행 상태 보존 */
export function buildUnitProgressFromRows(
  rows: Array<{ key: string; assigneeIds: string[] }>,
  existing: UnitProgressMap
): UnitProgressMap {
  const out: UnitProgressMap = {};
  for (const row of rows) {
    const holders: Record<string, UnitRecord> = {};
    for (const assigneeId of row.assigneeIds) {
      holders[assigneeId] = existing[row.key]?.[assigneeId] ?? { status: 'pending' };
    }
    out[row.key] = holders;
  }
  return out;
}

/**
 * 저장용 meta 조각 — 단위가 1개 이상이면 배열, 아니면 **null**을 명시한다.
 * (task update 경로가 meta 얕은 병합이라 키를 빼는 것만으로는 기존 값이 지워지지 않는다 —
 * buildDeadlinePayload와 같은 규약.)
 */
export function buildUnitsPayload(
  units: TaskUnit[],
  progress: UnitProgressMap,
  poolAssigneeIds: string[]
): { units: TaskUnit[] | null; unitProgress: UnitProgressMap | null } {
  if (units.length === 0) return { units: null, unitProgress: null };
  const pruned = pruneUnitProgress(progress, units, poolAssigneeIds);
  return { units, unitProgress: pruned };
}

/** 단위 key 생성 — 라벨을 바꿔도 수행 기록이 따라오도록 라벨과 무관한 안정 키를 쓴다 */
export function newUnitKey(): string {
  return `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export interface UnitPasteResult {
  rows: Array<{ label: string; assigneeIds: string[]; matchedNames: string[] }>;
  unmatchedNames: string[];
}

/**
 * 붙여넣기 텍스트 파싱(순수 함수 — UI·supabase 비의존이라 회귀 스크립트에서 직접 검증).
 * 줄마다 단위 1개. 엑셀 복사면 탭이 열 구분자다:
 * 1열 = 단위명, 나머지 열 = 담당자명(쉼표·가운뎃점 병기 허용). 탭이 없으면 라벨만.
 * teacherByName은 공백 제거 이름 → 리소스 id 맵.
 */
export function parseUnitPaste(
  text: string,
  teacherByName: Map<string, string>
): UnitPasteResult {
  const rows: UnitPasteResult['rows'] = [];
  const unmatched = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('\t').map((c) => c.trim());
    const label = cells[0];
    if (!label) continue;
    const assigneeIds: string[] = [];
    const matchedNames: string[] = [];
    for (const cell of cells.slice(1)) {
      for (const name of cell.split(/[,、·;]+/).map((n) => n.trim()).filter(Boolean)) {
        const id = teacherByName.get(name.replace(/\s+/g, ''));
        if (id) {
          if (!assigneeIds.includes(id)) {
            assigneeIds.push(id);
            matchedNames.push(name);
          }
        } else {
          unmatched.add(name);
        }
      }
    }
    rows.push({ label, assigneeIds, matchedNames });
  }
  return { rows, unmatchedNames: [...unmatched] };
}
