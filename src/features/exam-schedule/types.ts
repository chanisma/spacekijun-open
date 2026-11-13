export type Grade = 1 | 2 | 3;

export type ExamScopeType = 'all' | 'elective';

export type SubjectCategory =
  | 'major-korean'
  | 'major-math'
  | 'major-english'
  | 'science'
  | 'social'
  | 'foreign'
  | 'arts-pe'
  | 'other';

export type MajorSpreadPolicy = 'one-per-day' | 'no-consecutive' | 'off';

export type RunMode = 'quick' | 'standard' | 'thorough';
export type ExamCountMode = 'fixed' | 'auto';

export interface HardConstraintOptions {
  examEveryDay: boolean;
  maxExamsPerStudentPerDay: boolean;
  majorSubjectsSpread: boolean;
  electiveConcurrency: boolean;
}

export interface ExamSubject {
  id: string;
  grade: Grade;
  name: string;
  scope: ExamScopeType;
  studentCodes: string[];
  /**
   * 응시자 수. 저장 시 studentCodes(PII)는 제거되지만 이 값은 보존되어
   * 저장본 미리보기에서도 감독 수요를 계산할 수 있다.
   */
  studentCount?: number;
  category: SubjectCategory;
  isMajor: boolean;
}

export interface DayConfig {
  dayIndex: number;
  examCount: number;
  availablePeriods: number[];
}

export interface PinnedAssignment {
  subjectId: string;
  dayIndex: number;
  period: number;
}

export interface AlgorithmWeights {
  examEveryDay: number;
  twoExamsInARow: number;
  threePlusExamsPerDay: number;
  majorClustering: number;
  majorConsecutive: number;
  unevenLoad: number;
  earlyMorningHard: number;
  studentEmptyDay: number;
  electiveConcurrency: number;
  /** 감독 수요가 가용 인원을 넘는 1명·1슬롯당 페널티 (감독 hard OFF일 때 적용) */
  supervisorOverflow: number;
  /** 슬롯별 감독 수요 피크 1명당 페널티 — 피크 평탄화 유도 */
  supervisorPeak: number;
}

export interface GradeInput {
  examDays: number;
  subjects: ExamSubject[];
  days: DayConfig[];
  pinned: PinnedAssignment[];
}

/** 시험실 티어: 같은 정원을 가진 시험실 묶음 (예: 30명×20실) */
export interface RoomTier {
  capacity: number;
  count: number;
}

/**
 * 시험 감독 인력·시험실 제약 설정.
 *
 * 과목 유형별 시험실 산정:
 * - 공통(전체 응시) 과목: 모든 학생이 자기 반에서 응시 → 시험실 수 = 그 학년의
 *   반 수(classCountByGrade). 별도 고사실 풀을 소비하지 않는다.
 * - 선택과목: 응시자가 지정 고사실로 이동 → 정원이 서로 다른 고사실 풀
 *   (roomTiers)에서 응시자가 많은 과목부터 큰 교실을 greedy로 소비
 *   (시험실 1실 = 1과목).
 *
 * 감독 수요 = (반 시험실 + 고사실) × supervisorsPerRoom, 전 학년 합산.
 * 이 제약이 학년 간 시간표를 결합하는 유일한 cross-grade 제약이다.
 */
export interface SupervisionConfig {
  enabled: boolean;
  /** 한 교시에 동시 투입 가능한 감독 교사 수 */
  availableSupervisors: number;
  /** 시험실 1실당 감독 인원 */
  supervisorsPerRoom: number;
  /** 학년별 반 수 — 공통(전체 응시) 과목의 시험실 수 */
  classCountByGrade: Partial<Record<Grade, number>>;
  /** 선택과목용 고사실 풀 (정원별 묶음) */
  roomTiers: RoomTier[];
  /** true면 수요 초과 후보를 hard 게이트로 제외, false면 soft penalty */
  hard: boolean;
  /** @deprecated v2 단일 정원 저장본 호환 — normalize에서 roomTiers로 변환됨 */
  roomCapacity?: number;
}

export interface ExamScheduleOptions {
  allowConcurrentElectives: boolean;
  preferConcurrentElectives: boolean;
  requireExamEveryDay: boolean;
  examCountMode: ExamCountMode;
  maxExamsPerStudentPerDay: number;
  majorSubjectsSpread: MajorSpreadPolicy;
  preferEarlyMajor: boolean;
  randomSeed?: number;
  runMode: RunMode;
  hardConstraints: HardConstraintOptions;
}

/**
 * 전 학년 통합 입력. 시험 일수(일차 수)는 전 학년이 공유하고,
 * 일차별 시험 개수·사용 교시·과목·고정 배치는 학년별로 독립이다.
 */
export interface ExamScheduleInput {
  /** 포함 학년 (오름차순). 단일 학년 생성도 grades=[g] 형태로 표현 */
  grades: Grade[];
  gradeInputs: Partial<Record<Grade, GradeInput>>;
  supervision: SupervisionConfig;
  options: ExamScheduleOptions;
  weights: AlgorithmWeights;
}

/** 저장 payload 하위호환용 — v1(단일 학년) 입력 형태 */
export interface LegacyExamScheduleInput {
  grade: Grade;
  gradeInput: GradeInput;
  options: ExamScheduleOptions;
  weights: AlgorithmWeights;
}

export interface SlotAssignment {
  subjectId: string;
  dayIndex: number;
  period: number;
}

export interface HardViolation {
  id: string;
  count: number;
  detail?: string;
}

export interface SoftPenalty {
  id: string;
  count: number;
  weight: number;
  penalty: number;
  details?: string[];
}

export interface ScoreBreakdown {
  total: number;
  hard: HardViolation[];
  soft: SoftPenalty[];
}

export interface CandidateMetrics {
  avgExamsPerStudent: number;
  maxExamsPerStudentInOneDay: number;
  studentLoadStdev: number;
  majorClusterCount: number;
  /** 슬롯별 감독 수요의 최댓값 (감독 제약 비활성화 시 0) */
  peakSupervisorDemand: number;
  hardFeasible: boolean;
}

export interface ScheduleCandidate {
  id: string;
  grades: Grade[];
  assignments: SlotAssignment[];
  dayConfigsByGrade?: Partial<Record<Grade, DayConfig[]>>;
  scoreBreakdown: ScoreBreakdown;
  metrics: CandidateMetrics;
  createdAt: string;
  /** @deprecated v1 단일 학년 후보 하위호환 */
  grade?: Grade;
  /** @deprecated v1 단일 학년 후보 하위호환 */
  dayConfigs?: DayConfig[];
}

export interface GradePreflight {
  grade: Grade;
  totalSubjects: number;
  totalSlots: number;
  maxClique: number;
  minSlotsRequired: number;
}

export interface SupervisionPreflight {
  available: number;
  /** 단일 과목 최대 감독 수요 — 이 값이 available을 넘으면 절대 배치 불가 */
  maxSubjectDemand: number;
  /** 전체 과목 감독 수요 합 */
  totalDemand: number;
  /** 슬롯 수 × 가용 인원 = 전체 공급 상한 */
  totalCapacity: number;
  /** 사용 가능한 시험실 총 수 */
  totalRooms: number;
  /** 시험실 총 수용 인원 (Σ 정원×실수) */
  totalSeats: number;
  feasible: boolean;
}

export interface PreflightReport {
  totalSubjects: number;
  totalSlots: number;
  maxClique: number;
  minSlotsRequired: number;
  byGrade: GradePreflight[];
  supervision: SupervisionPreflight | null;
  feasible: boolean;
  warnings: string[];
}

export interface SolverDiagnostics {
  elapsedMs: number;
  csp: {
    seedsAttempted: number;
    feasibleSeeds: number;
    uniqueSeeds: number;
    duplicateSeeds: number;
    selectedSeeds: number;
    variantsExplored: number;
  };
  sa: { iterations: number; acceptedMoves: number };
  preflight?: PreflightReport;
  reason?: string;
}

export interface ScheduleRunResult {
  candidates: ScheduleCandidate[];
  diagnostics: SolverDiagnostics;
}

export type SolverProgressPhase = 'init' | 'csp' | 'sa' | 'finalize';

export interface SolverProgress {
  phase: SolverProgressPhase;
  current: number;
  total: number;
  message?: string;
}

export type WorkerInbound =
  | { type: 'run'; input: ExamScheduleInput };

export type WorkerOutbound =
  | { type: 'progress'; progress: SolverProgress }
  | { type: 'result'; result: ScheduleRunResult }
  | { type: 'error'; message: string };

// ── 감독 교사 배정 ─────────────────────────────────────────────

export type ExamType = 'regular' | 'mock';

export interface SupervisorTeacherRef {
  /** resource.id */
  id: string;
  name: string;
}

export type ExamRoomKind = 'classroom' | 'pool';

/**
 * 감독 배정의 단위 = 시험실 1실. 정규고사는 finalized_assignments에서
 * buildSlotRooms()로 전개하고(공통=반 교실, 선택=고사실 풀 greedy),
 * 모의고사는 반×교시 그리드로 전개한다.
 */
export interface SupervisorPlanRoom {
  roomId: string;
  dayIndex: number;
  period: number;
  /** 표시 라벨: "1학년 3반" | "고사실 1" */
  label: string;
  kind: ExamRoomKind;
  /** classroom이면 해당 반의 학년·반 번호 */
  grade: Grade | null;
  classNum: number | null;
  subjectIds: string[];
  subjectNames: string[];
  /** 좌석. 길이 = supervisorsPerRoom (모의고사는 항상 1). null = 미배정 */
  teachers: (SupervisorTeacherRef | null)[];
  /** 모의고사: 담임 고정 좌석 (해당 학년의 첫·마지막 교시) */
  homeroomRequired?: boolean;
}

/** exam_schedule.supervisor_assignments에 저장되는 감독 배정 plan */
export interface SupervisorPlan {
  version: 1;
  examType: ExamType;
  rooms: SupervisorPlanRoom[];
  /** 이 감독표에서 배정 대상에서 제외한 교사 resource id (임시 제외 — 출제·출장 등) */
  excludedTeacherIds?: string[];
  generatedAt: string;
}

/** 모의고사 교시 정의 */
export interface MockExamPeriod {
  period: number;
  /** 예: "국어", "수학" — 빈 문자열 허용 */
  label: string;
}

/** 모의고사 저장본의 input_payload (exam_type='mock') */
export interface MockExamInput {
  kind: 'mock';
  grades: Grade[];
  classCountByGrade: Partial<Record<Grade, number>>;
  periodsByGrade: Partial<Record<Grade, MockExamPeriod[]>>;
}

/** 교사 1명의 감독 배정용 정보 (resource + 태그 + section 파싱 결과) */
export interface SupervisionTeacher {
  /** resource.id */
  id: string;
  name: string;
  /** "N학년 M반" 태그에서 파싱한 담임 반 */
  homeroom: { grade: Grade; classNum: number } | null;
  /** `${과목명}|${학년}` -> 가르치는 분반 수 (meta.section 키 파싱) */
  sectionCounts: Record<string, number>;
}

/** 교사별 누적 감독 횟수 (확정된 다른 감독표 합산 + 수동 보정) */
export interface SupervisionLedgerEntry {
  teacherId: string;
  pastCount: number;
  adjustment: number;
}

export interface SavedExamSchedule {
  id: string;
  /** 0 = 복수 학년 통합, 1~3 = 단일 학년 */
  grade: 0 | Grade;
  title: string;
  status: 'draft' | 'finalized' | 'archived';
  exam_type: ExamType;
  input_payload: ExamScheduleInput | LegacyExamScheduleInput | MockExamInput;
  candidates: ScheduleCandidate[];
  selected_candidate_id: string | null;
  finalized_assignments: SlotAssignment[] | null;
  supervisor_assignments: SupervisorPlan | null;
  diagnostics: SolverDiagnostics | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function isMockExamInput(
  raw: SavedExamSchedule['input_payload'],
): raw is MockExamInput {
  return (raw as MockExamInput).kind === 'mock';
}

export interface SubjectCandidate {
  subject: string;
  student_count: number;
  student_codes: string[];
  is_universal: boolean;
}
