// 새 학기 시간표 생성기(timetable-generator)의 도메인 모델.
//
// 핵심 설계: 강좌(course_offering)를 credits개의 "수업 교시 인스턴스(Lesson)"로
// 분해해 각 인스턴스를 격자의 한 칸(요일×교시)에 배치한다. 이로써 exam-schedule의
// "1과목=1슬롯" CSP/SA 기계를 거의 그대로 재사용한다. 충돌그래프의 간선은
// (학생 공유) ∨ (교사 공유) ∨ (교실 공유)로 통합되어, "인접 변수는 다른 칸"
// 한 규칙이 학생·교사·교실 동시충돌을 모두 막는다.

export type Grade = 1 | 2 | 3;

// 시험솔버와 동일한 교과 분류 (주요교과 판별·분산에 사용)
export type SubjectCategory =
  | 'major-korean'
  | 'major-math'
  | 'major-english'
  | 'science'
  | 'social'
  | 'foreign'
  | 'arts-pe'
  | 'other';

/** 주간 격자 크기. dayIndex 0..days-1(월=0), period 1..periodsPerDay */
export interface GridConfig {
  days: number; // 보통 5 (월~금)
  periodsPerDay: number; // 보통 7
}

/**
 * 하나의 수업 교시 인스턴스 = CSP 변수.
 * credits=C 강좌는 같은 (offeringId, teacherId, studentCodes, roomId)를 공유하는
 * C개의 Lesson으로 펼쳐진다. 같은 강좌의 인스턴스들은 학생·교사를 전부 공유하므로
 * 충돌그래프에서 서로 인접 → 자동으로 서로 다른 칸에 놓인다.
 */
export interface Lesson {
  id: string; // `${offeringId}#${k}` (k=1..credits)
  offeringId: string;
  /** 합성 공통수업 ID가 가리키는 실제 course_offering 행들 (구 저장본은 재구성). */
  sourceOfferingIds?: string[];
  subjectName: string;
  grade: Grade;
  /** homeroom-bound 강좌의 반 라벨 ("6반"). 선택과목/재편성이면 null 가능 */
  classLabel: string | null;
  /** 담당 교사 resource.id. 미지정이면 교사충돌 제약에서 제외 */
  teacherId: string | null;
  teacherName: string | null;
  /** 교실 식별자. 교실충돌(roomConflict) 모델을 켤 때만 사용, 없으면 null */
  roomId: string | null;
  /** 수강생 키(resource.id 또는 student_code). 저장 시 제거되고 studentCount만 보존 */
  studentCodes: string[];
  /** PII 제거 저장본에서 보존되는 수강 인원 (전체, 선택과목은 여러 반 합계) */
  studentCount?: number;
  /** 학급별 수강 인원 (classKey "학년-반" → 인원). 현재 보는 반 기준 표시에 사용 */
  studentCountByClass?: Record<string, number>;
  category: SubjectCategory;
  isMajor: boolean;
  /** 여러 반 재편성 선택과목 여부 (동시 블록 정렬 소프트 제약 대상) */
  isElective: boolean;
  /**
   * 이 수업이 점유하는 학급 키 "학년-반" 목록 (예: 공통=["1-6"], 선택=여러 반).
   * 입력 빌드에서 수강생의 학급으로부터 계산. 반별 공강·분산 채점과 전개에 사용.
   */
  classKeys: string[];
  /**
   * 이 Lesson이 배치될 수 없는 칸 "dayIndex|period"의 합집합.
   * = 학년/반 차단칸 ∪ 담당교사 불가시간 ∪ 창체/고정 점유칸.
   * 입력 빌드 단계에서 정적으로 계산해 도메인에서 바로 제외한다.
   */
  blockedCells: string[];
}

/**
 * 창체(자율·동아리·진로) 및 수기 고정 = 변수가 아니라 칸 점유물.
 * 솔버는 이 칸들을 blockedCells로 받아 회피하고, 전개 시 학생/교사 행으로 함께 출력한다.
 */
export interface FixedBlock {
  id: string;
  label: string; // "동아리활동" 등
  grade: Grade;
  /** grade=학년 전체 동시 / class=특정 반 */
  scope: 'grade' | 'class';
  classLabel: string | null;
  teacherId: string | null;
  teacherName: string | null;
  cells: Array<{ dayIndex: number; period: number }>;
}

/** 특정 Lesson을 특정 칸에 고정 (수기 조정) */
export interface PinnedLesson {
  lessonId: string;
  dayIndex: number;
  period: number;
}

/** 소프트 제약 가중치 (클수록 강하게 회피) */
export interface TimetableWeights {
  /** 학생의 수업 사이 빈 교시(중간 공강) 1칸당 */
  studentGap: number;
  /** 같은 과목이 같은 날 2회 이상 (subjectOncePerDay가 soft일 때) */
  subjectSameDay: number;
  /** 같은 과목 연속 교시 (블록수업 아닌 경우) */
  subjectConsecutive: number;
  /** 교사의 수업 사이 빈 교시 1칸당 */
  teacherGap: number;
  /** 반별 일일 수업 수 편차 (고르게 분산) */
  dailyBalance: number;
  /** 주요교과 같은 날 집중 */
  majorClustering: number;
  /** 선택과목이 같은 학년 안에서 동시 정렬되지 못한 정도 */
  electiveBlockMisalign: number;
  /** 교사 하루 수업이 상한(maxPerTeacherPerDay)을 초과한 칸 1개당 */
  teacherDailyLoad: number;
  /** 교사 연속 수업이 상한(maxConsecutivePerTeacher)을 넘는 칸 1개당 (3연속 회피) */
  teacherConsecutive: number;
  /** 교사 주간 마지막 교시(7교시) 수업이 상한(maxLastPeriodPerTeacher)을 넘는 개당 (구 저장본 호환 optional) */
  teacherLastPeriod?: number;
  /** 같은 교사·같은 분반(offering) 인접 교시 쌍 1개당 (구 저장본 호환 optional) */
  teacherSubjectConsecutive?: number;
}

export interface TimetableHardOptions {
  /** 같은 교사 동시 수업 금지 */
  teacherConflict: boolean;
  /** 수강생 동시 수업 금지 (사실상 항상 켜짐) */
  studentConflict: boolean;
  /** 같은 교실 동시 사용 금지 (roomId가 있을 때만 의미) */
  roomConflict: boolean;
  /** 같은 과목 하루 maxPerSubjectPerDay 초과 금지 */
  subjectDailyCap: boolean;
  /**
   * 교사 하루 최대 수업 수(maxPerTeacherPerDay) 하드 강제.
   * (아래 3종 포함 — optional인 이유: 구 저장본(input_payload)엔 키가 없어 undefined=off로 재현)
   */
  teacherDailyCap?: boolean;
  /** 교사 3연속 수업 금지(maxConsecutivePerTeacher 초과 run 금지) 하드 강제 */
  teacherConsecutive?: boolean;
  /** 교사 주간 마지막 교시(7교시) 수업 수 상한(maxLastPeriodPerTeacher) 하드 강제 */
  teacherLastPeriodCap?: boolean;
  /** 같은 교사·같은 분반(offering) 인접 교시 연속 배치 금지 하드 강제 */
  teacherSubjectConsecutive?: boolean;
}

/**
 * 실행 모드. 'exact'(최정밀)는 분 단위 예산으로 MILP(HiGHS) 기반 수리·증명 단계를
 * 추가해 하드 제약(교사 부하 4종 포함) 완전 0위반을 목표로 한다 — 정확도 최우선.
 */
export type RunMode = 'quick' | 'standard' | 'thorough' | 'exact';

/**
 * Phase-1 초기해(seed) 탐색 전략. 슬랙0(avail=χ) 실데이터에서 전략별 강도가 다르다.
 *  - 'min-conflicts': 기본 국소탐색(+Metropolis·스왑·kick). 빠르나 슬랙0서 floor에 갇힐 수 있음.
 *  - 'block-aware': 선택과목 블록(선택군)을 collapse해 같은 칸 정렬 후 min-conflicts. 변수 축소.
 *  - 'enhanced-local': tabu·large-neighborhood·하드 페널티 SA로 floor 돌파 시도.
 *  - 'cp-sat': 제약/ILP 솔버(정확). 슬랙0을 가장 안정적으로 풀지만 무겁다.
 */
export type SolverStrategy = 'min-conflicts' | 'block-aware' | 'enhanced-local' | 'cp-sat' | 'coordinated' | 'staged-cpsat';

export interface TimetableOptions {
  runMode: RunMode;
  randomSeed?: number;
  hard: TimetableHardOptions;
  /** 같은 과목의 하루 최대 교시 수 (보통 1) */
  maxPerSubjectPerDay: number;
  /**
   * 한 교사의 하루 최대 수업 수 (기본 4). hard.teacherDailyCap이 켜지면 하드 제약으로
   * 시드 탐색 에너지·SA 무브·최종 검증에 강제되고, 꺼져 있으면 teacherDailyLoad 가중치 소프트.
   * 주의: 주당 20교시 교사는 4×5=여유 0이라 하드 모드에서 매일 정확히 4개가 강제된다.
   */
  maxPerTeacherPerDay?: number;
  /**
   * 한 교사의 연속 수업 허용 길이 (기본 2 = 3연속 금지). hard.teacherConsecutive가 켜지면
   * 하드, 꺼져 있으면 teacherConsecutive 가중치 소프트.
   */
  maxConsecutivePerTeacher?: number;
  /**
   * 한 교사의 주간 마지막 교시(7교시) 수업 수 상한 (기본 3).
   * hard.teacherLastPeriodCap이 켜지면 하드 강제.
   */
  maxLastPeriodPerTeacher?: number;
  /**
   * 조이기(tighten) 단계의 분반 구성원 교체 허용 폭 (기본 2).
   * 교사 부하 위반을 풀기 위해 학생을 같은 과목의 다른 분반으로 옮기되,
   * 각 분반 인원이 초기 편성에서 ±이 값 이내로만 변하게 제한한다. 0이면 교체 비활성.
   */
  maxResectionShift?: number;
  /** Phase-1 seed 탐색 전략 (기본 'min-conflicts'). UI에서 선택 가능. */
  strategy?: SolverStrategy;
}

/**
 * 전 학년 통합 입력. 학년 간 학생은 겹치지 않지만 교사·교실이 학년을 결합하므로
 * (충돌그래프 간선이 학년을 가로지른다) 한 번에 통합 솔브한다.
 */
export interface TimetableInput {
  academicYear: number;
  /** 구 저장본의 미지정 값은 기존 수강 명단 기준이다. */
  sourceBasis?: 'student-timetable' | 'enrollment';
  semester: number;
  grades: Grade[];
  grid: GridConfig;
  lessons: Lesson[];
  fixedBlocks: FixedBlock[];
  pinned: PinnedLesson[];
  options: TimetableOptions;
  weights: TimetableWeights;
}

/** 배치 결과 한 칸 */
export interface Placement {
  lessonId: string;
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
  /** 전 학생 중간 공강 칸 수 합 */
  studentGapTotal: number;
  /** 한 학생의 하루 최대 중간 공강 */
  studentGapMax: number;
  /** 전 교사 중간 공강 칸 수 합 */
  teacherGapTotal: number;
  /** 한 교사의 하루 최대 수업 수 (전 교사·전 요일 중 최댓값) */
  teacherMaxDaily: number;
  /** 교사 하루 수업이 상한을 넘은 칸 수 합 (teacherDailyLoad 벌점 count와 동일) */
  teacherOverCap: number;
  /** 교사 연속 수업이 상한을 넘은 칸 수 합 (teacherConsecutive 벌점 count와 동일) */
  teacherConsecutiveTotal: number;
  /** 교사 주간 마지막 교시(7교시) 수업이 상한을 넘은 개수 합 (구 저장본 호환 optional) */
  teacherLastPeriodOver?: number;
  /** 같은 교사·같은 분반 인접 교시 쌍 수 합 (구 저장본 호환 optional) */
  teacherSubjectAdjacent?: number;
  /** 배치 완료된 Lesson 수 */
  placedLessons: number;
  /** 전체 Lesson 수 */
  totalLessons: number;
  hardFeasible: boolean;
}

export interface TimetableCandidate {
  id: string;
  grades: Grade[];
  placements: Placement[];
  scoreBreakdown: ScoreBreakdown;
  metrics: CandidateMetrics;
  createdAt: string;
  /** Canonical student indices, not student identifiers; refuse stale enrollment. */
  sectionRoster?: { fingerprint: string; byOffering: Record<string, number[]> };
}

export interface PreflightReport {
  totalLessons: number;
  totalCells: number;
  feasible: boolean;
  warnings: string[];
  /** 개인 식별자 없이 집계한 입력 시수 초과. 탐색 시간 만료와 구분한다. */
  studentCapacityIssues?: { grade: number; students: number; required: number; available: number; excess: number }[];
}

/**
 * 구조적 불가능 인증서 — 특정 교사(또는 전체 인스턴스)가 현 하드 제약 하에서
 * "0위반 배치가 수학적으로 불가능"함을 증명하는 진단. 솔버는 이 경우에도
 * 최소 위반 시간표를 제시하되, UI가 원인(교사·과목·제약)을 명시해 입력 조정을 안내한다.
 */
export interface InfeasibilityCertificate {
  /** 대상 교사 resource.id. 전체 인스턴스 판정이면 null */
  teacherId: string | null;
  teacherName: string | null;
  /** 'closed-form'=폐형 하한 위반(즉시 계산), 'exact'=교사 단독 MILP infeasible 증명, 'global'=전체 MILP infeasible */
  kind: 'closed-form' | 'exact' | 'global';
  /** 사람이 읽는 원인 설명 (제약·과목·시수 명시) */
  reason: string;
}

/** 선택과목 sectioning 1라운드 진행 내역 */
export interface SectioningRoundReport {
  round: number;
  beforeT0: number;
  beforeT1: number;
  afterT0: number;
  afterT1: number;
  /** 재솔브 결과가 채택됐는지 */
  accepted: boolean;
  studentConflicts: number;
  conflictedStudents: number;
  capacityOverflow: number;
  studentsAssigned: number;
  electiveSubjects: number;
  electiveOfferings: number;
}

/** 분반별 명단 변화 (선택과목 offering) */
export interface SectioningOfferingRow {
  offeringId: string;
  subjectName: string;
  classLabel: string | null;
  beforeCount: number;
  afterCount: number;
}

/** 솔브 1회 시도 내 sectioning 라운드 묶음 */
export interface SectioningAttemptReport {
  label: string;
  applied: boolean;
  rounds: SectioningRoundReport[];
}

export interface SectioningDiagnostics {
  attempts: SectioningAttemptReport[];
  final: {
    studentConflicts: number;
    conflictedStudents: number;
    capacityOverflow: number;
    rosterChanges: SectioningOfferingRow[];
    /** 명단이 바뀐 분반 수 */
    changedOfferings: number;
    /** |after−before| 합 / 2 (학생 이동 건수 근사) */
    studentsMoved: number;
  } | null;
}

export interface SolverDiagnostics {
  elapsedMs: number;
  csp: {
    seedsAttempted: number;
    feasibleSeeds: number;
    selectedSeeds: number;
  };
  sa: { iterations: number; acceptedMoves: number };
  preflight?: PreflightReport;
  reason?: string;
  /** 구조적 불가능 인증서 (exact 진단). 존재하면 0위반이 불가능한 이유를 UI에 노출 */
  infeasibility?: InfeasibilityCertificate[];
  /** 선택과목 학생 재분반(sectioning) 진행 내역 */
  sectioning?: SectioningDiagnostics;
}

export interface TimetableRunResult {
  candidates: TimetableCandidate[];
  diagnostics: SolverDiagnostics;
}

export type SolverProgressPhase = 'init' | 'csp' | 'sa' | 'finalize';

export interface SolverProgress {
  phase: SolverProgressPhase;
  current: number;
  total: number;
  message?: string;
}

/** 공강 진단 — 학년별 무충돌 가능성과 권장 공강(추정). probe.ts 참조. */
export interface GradeProbe {
  grade: Grade;
  lessons: number;
  /** 한 학생이 듣는 최대 수업 수 = 클리크 하한 */
  maxStudentLoad: number;
  /** 현재 공강(배치 금지) 칸 수 */
  currentBlocked: number;
  /** 현재 가용 칸 수 */
  currentAvail: number;
  /** 현재 공강에서 무충돌 배치가 가능한가 */
  feasibleAtCurrent: boolean;
  /** 무충돌 가능한 최대 공강 칸 수(추정). null=공강 0에서도 불가 */
  recommendedMaxBlocked: number | null;
}

export interface ProbeReport {
  totalCells: number;
  grades: GradeProbe[];
}

export type WorkerInbound =
  | { type: 'run'; input: TimetableInput; initial?: Placement[] }
  | { type: 'probe'; input: TimetableInput };

export type WorkerOutbound =
  | { type: 'progress'; progress: SolverProgress }
  | { type: 'result'; result: TimetableRunResult }
  | { type: 'probe-result'; report: ProbeReport }
  | { type: 'error'; message: string };

export interface SavedTimetablePlan {
  id: string;
  academic_year: number;
  semester: number;
  title: string;
  status: 'draft' | 'finalized' | 'archived';
  input_payload: TimetableInput;
  candidates: TimetableCandidate[];
  selected_candidate_id: string | null;
  finalized_placements: Placement[] | null;
  diagnostics: SolverDiagnostics | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
