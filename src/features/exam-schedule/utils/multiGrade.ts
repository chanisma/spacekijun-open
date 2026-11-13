import type {
  DayConfig,
  ExamScheduleInput,
  ExamSubject,
  Grade,
  GradeInput,
  LegacyExamScheduleInput,
  ScheduleCandidate,
  SupervisionConfig,
} from '../types';
import {
  ALL_GRADES,
  DEFAULT_OPTIONS,
  DEFAULT_SUPERVISION,
  DEFAULT_WEIGHTS,
  LEGACY_ROOM_COUNT,
} from '../constants';

export function emptyGradeInput(examDays = 3): GradeInput {
  return {
    examDays,
    subjects: [],
    days: Array.from({ length: examDays }, (_, i) => ({
      dayIndex: i,
      examCount: 2,
      availablePeriods: [1, 2, 3],
    })),
    pinned: [],
  };
}

/** input에 포함된 모든 학년의 과목을 평탄화 */
export function allSubjects(input: ExamScheduleInput): ExamSubject[] {
  return input.grades.flatMap((g) => input.gradeInputs[g]?.subjects ?? []);
}

export function gradeInputOf(input: ExamScheduleInput, grade: Grade): GradeInput {
  return input.gradeInputs[grade] ?? emptyGradeInput();
}

/** 모든 학년의 고정 배치를 평탄화 */
export function allPinned(input: ExamScheduleInput) {
  return input.grades.flatMap((g) => input.gradeInputs[g]?.pinned ?? []);
}

/**
 * 과목의 응시자 수. 위저드 진행 중엔 studentCodes로, PII가 제거된
 * 저장본에서는 보존된 studentCount로 계산한다.
 */
export function subjectStudentCount(subject: ExamSubject): number {
  return subject.studentCodes.length > 0
    ? subject.studentCodes.length
    : (subject.studentCount ?? 0);
}

/**
 * 한 슬롯에 배치된 과목 1개의 시험실 수요.
 * - classrooms: 공통(전체 응시) 과목 — 각 반에서 응시, 시험실 수 = 학년 반 수 (고정)
 * - pool: 선택과목 — 자기 학년의 일반 교실을 먼저 쓰고 부족분만 공유 고사실 풀로
 * grade: 선택과목이 쓸 수 있는 "자기 학년 일반 교실"을 판정하는 데 필요.
 */
export type SlotDemandEntry =
  | { key: string; kind: 'classrooms'; grade: Grade; rooms: number }
  | { key: string; kind: 'pool'; grade: Grade; students: number };

export interface SlotSupervisionResult {
  /** 사용 시험실 수 합계 (반 시험실 + 일반 교실 + 고사실, 풀 부족 시 추정치 포함) */
  rooms: number;
  /** 필요 감독 인원 = rooms × supervisorsPerRoom */
  supervisors: number;
  /** 자기 학년 일반 교실 + 공유 고사실 풀로 모든 선택과목을 수용 가능한가 */
  fits: boolean;
  /** key(과목)별 사용 시험실 수 — 합은 rooms와 일치 (가산적) */
  roomsByKey: Map<string, number>;
}

/** 과목 → 슬롯 수요 엔트리 변환. 공통/선택 구분의 단일 진입점. */
export function subjectDemandEntry(
  subject: ExamSubject,
  sup: SupervisionConfig,
): SlotDemandEntry {
  if (subject.scope === 'all') {
    const rooms =
      sup.classCountByGrade[subject.grade] ??
      Math.max(1, Math.ceil(subjectStudentCount(subject) / 28));
    return { key: subject.id, kind: 'classrooms', grade: subject.grade, rooms };
  }
  return {
    key: subject.id,
    kind: 'pool',
    grade: subject.grade,
    students: subjectStudentCount(subject),
  };
}

/** 일반 교실 1실의 시험 수용 인원. 고사실 풀의 최대 정원을 일반 교실 정원의
 * 대리값으로 쓴다(둘 다 표준 교실). 풀이 비면 28명으로 가정. */
function classroomCapacity(pool: number[]): number {
  return pool.length > 0 ? Math.max(...pool) : 28;
}

const roomPoolCache = new WeakMap<SupervisionConfig, number[]>();

/** 고사실 풀을 정원 내림차순 배열로 전개 (SupervisionConfig 객체 단위 메모) */
export function buildRoomPool(sup: SupervisionConfig): number[] {
  const cached = roomPoolCache.get(sup);
  if (cached) return cached;
  const pool: number[] = [];
  for (const tier of [...(sup.roomTiers ?? [])].sort((a, b) => b.capacity - a.capacity)) {
    const count = Math.max(0, Math.floor(tier.count));
    const capacity = Math.max(1, Math.floor(tier.capacity));
    for (let i = 0; i < count; i++) pool.push(capacity);
  }
  roomPoolCache.set(sup, pool);
  return pool;
}

/**
 * 슬롯(일차×교시) 단위 감독·시험실 수요 계산.
 *
 * - 공통 과목: 각 반에서 응시 → 자기 학년 반 수만큼 시험실 고정 사용.
 * - 선택과목: **자기 학년의 일반 교실을 먼저** 쓰고(같은 학년 공통과목이 점유한
 *   교실 제외), 부족분만 **전 학년 공유 고사실 풀**로 넘긴다 (시험실 1실 = 1과목).
 *   예) 2학년 선택과목은 2학년 9개 반 교실 + 공유 고사실을 함께 쓸 수 있다.
 *   풀까지 모자라면 fits=false로 표시하되 남은 인원은 최소 정원으로 시험실 수를
 *   추정해 수치는 항상 의미를 가진다.
 *
 * 같은 학년의 공통과목과 선택과목은 응시자가 겹쳐(학생 충돌) 한 슬롯에 공존할 수
 * 없으므로, 보통 학년은 슬롯마다 "공통 모드"(반 수 시험실) 또는 "선택 모드"(일반
 * 교실+풀) 중 하나다. 방어적으로 공통이 쓴 교실은 선택 가용 교실에서 제외한다.
 */
export function slotSupervision(
  entries: SlotDemandEntry[],
  sup: SupervisionConfig,
  pool: number[] = buildRoomPool(sup),
): SlotSupervisionResult {
  const roomsByKey = new Map<string, number>();
  if (!sup.enabled) return { rooms: 0, supervisors: 0, fits: true, roomsByKey };

  let rooms = 0;
  let fits = true;
  const homeroomCap = classroomCapacity(pool);
  const fallbackCapacity = pool.length > 0 ? pool[pool.length - 1] : 28;

  // 공통 과목: 반 시험실 고정 사용. 학년별로 점유 교실 수를 기록해 두면
  // 선택과목이 같은 학년의 "남은 일반 교실"만 쓰도록 제한할 수 있다.
  const commonRoomsByGrade = new Map<Grade, number>();
  for (const entry of entries) {
    if (entry.kind !== 'classrooms') continue;
    const used = Math.max(0, entry.rooms);
    rooms += used;
    roomsByKey.set(entry.key, (roomsByKey.get(entry.key) ?? 0) + used);
    commonRoomsByGrade.set(entry.grade, (commonRoomsByGrade.get(entry.grade) ?? 0) + used);
  }

  // 선택과목: 학년별로 묶어 자기 학년 일반 교실 먼저, 공유 고사실 풀은 나중.
  const electivesByGrade = new Map<Grade, Array<{ key: string; students: number }>>();
  for (const e of entries) {
    if (e.kind !== 'pool' || e.students <= 0) continue;
    const arr = electivesByGrade.get(e.grade) ?? [];
    arr.push({ key: e.key, students: e.students });
    electivesByGrade.set(e.grade, arr);
  }

  // 공유 고사실 풀은 전 학년이 함께 소비 — 학년 루프 밖에서 인덱스를 이어 쓴다.
  let poolIdx = 0;
  for (const [grade, els] of electivesByGrade) {
    const classCount = sup.classCountByGrade[grade] ?? 0;
    const ownTotal = Math.max(0, classCount - (commonRoomsByGrade.get(grade) ?? 0));
    let ownUsed = 0;
    // 응시자 많은 과목부터 큰 교실을 우선 쓰도록 정렬
    els.sort((a, b) => b.students - a.students);
    for (const el of els) {
      let remaining = el.students;
      let used = 0;
      while (remaining > 0) {
        if (ownUsed < ownTotal) {
          remaining -= homeroomCap;
          ownUsed++;
          used++;
        } else if (poolIdx < pool.length) {
          remaining -= pool[poolIdx];
          poolIdx++;
          used++;
        } else {
          fits = false;
          used += Math.ceil(remaining / fallbackCapacity);
          remaining = 0;
        }
      }
      rooms += used;
      roomsByKey.set(el.key, (roomsByKey.get(el.key) ?? 0) + used);
    }
  }

  return {
    rooms,
    supervisors: rooms * Math.max(1, sup.supervisorsPerRoom),
    fits,
    roomsByKey,
  };
}

/** v2(단일 roomCapacity)·부분 저장본을 현재 SupervisionConfig 형태로 정규화 */
export function normalizeSupervision(
  raw: Partial<SupervisionConfig> | undefined,
): SupervisionConfig {
  const merged = { ...DEFAULT_SUPERVISION, ...raw };
  if ((!raw?.roomTiers || raw.roomTiers.length === 0) && raw?.roomCapacity) {
    merged.roomTiers = [{ capacity: raw.roomCapacity, count: LEGACY_ROOM_COUNT }];
  }
  if (!merged.roomTiers || merged.roomTiers.length === 0) {
    merged.roomTiers = [...DEFAULT_SUPERVISION.roomTiers];
  }
  merged.classCountByGrade = {
    ...DEFAULT_SUPERVISION.classCountByGrade,
    ...raw?.classCountByGrade,
  };
  return merged;
}

/** DB grade 컬럼 값: 단일 학년이면 해당 학년, 복수면 0(통합) */
export function storedGradeValue(grades: Grade[]): 0 | Grade {
  return grades.length === 1 ? grades[0] : 0;
}

export function gradesLabel(grades: Grade[]): string {
  if (grades.length >= 3) return '전학년';
  if (grades.length === 0) return '-';
  return `${[...grades].sort((a, b) => a - b).join('·')}학년`;
}

function isLegacyInput(
  raw: ExamScheduleInput | LegacyExamScheduleInput,
): raw is LegacyExamScheduleInput {
  return (raw as LegacyExamScheduleInput).gradeInput !== undefined;
}

/**
 * 저장 payload 정규화. v1(단일 학년 {grade, gradeInput})과 v2(멀티 학년)를
 * 모두 v2 형태로 통일하고, 이후 버전에서 추가된 weights/supervision 키는
 * 기본값으로 채운다.
 */
export function normalizeScheduleInput(
  raw: ExamScheduleInput | LegacyExamScheduleInput,
): ExamScheduleInput {
  if (isLegacyInput(raw)) {
    return {
      grades: [raw.grade],
      gradeInputs: { [raw.grade]: raw.gradeInput },
      supervision: { ...normalizeSupervision(undefined), enabled: false },
      options: { ...DEFAULT_OPTIONS, ...raw.options },
      weights: { ...DEFAULT_WEIGHTS, ...raw.weights },
    };
  }
  return {
    grades:
      raw.grades && raw.grades.length > 0
        ? [...raw.grades].sort((a, b) => a - b)
        : ALL_GRADES,
    gradeInputs: raw.gradeInputs ?? {},
    supervision: normalizeSupervision(raw.supervision),
    options: { ...DEFAULT_OPTIONS, ...raw.options },
    weights: { ...DEFAULT_WEIGHTS, ...raw.weights },
  };
}

/** v1 후보(grade/dayConfigs)를 v2 형태(grades/dayConfigsByGrade)로 정규화 */
export function normalizeCandidate(raw: ScheduleCandidate): ScheduleCandidate {
  if (raw.grades && raw.grades.length > 0) return raw;
  const grade = raw.grade ?? 1;
  const dayConfigsByGrade: Partial<Record<Grade, DayConfig[]>> | undefined =
    raw.dayConfigsByGrade ?? (raw.dayConfigs ? { [grade]: raw.dayConfigs } : undefined);
  return {
    ...raw,
    grades: [grade],
    dayConfigsByGrade,
    metrics: { peakSupervisorDemand: 0, ...raw.metrics },
  };
}

/** 후보의 dayConfig를 반영한 학년별 GradeInput 맵 생성 (미리보기/편집용) */
export function gradeInputsWithCandidateDays(
  input: ExamScheduleInput,
  candidate: ScheduleCandidate | null,
): Partial<Record<Grade, GradeInput>> {
  const out: Partial<Record<Grade, GradeInput>> = {};
  for (const g of input.grades) {
    const base = gradeInputOf(input, g);
    const days = candidate?.dayConfigsByGrade?.[g];
    out[g] = days ? { ...base, days } : base;
  }
  return out;
}
