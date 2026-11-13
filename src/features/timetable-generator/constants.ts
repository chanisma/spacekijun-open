import type {
  GridConfig,
  RunMode,
  SubjectCategory,
  TimetableOptions,
  TimetableWeights,
} from './types';

export const ALL_GRADES: ReadonlyArray<1 | 2 | 3> = [1, 2, 3];

/** 학교 표준 주간 격자: 월~금 5일 × 7교시 (student_timetable / teacher_timetable와 일치) */
export const DEFAULT_GRID: GridConfig = { days: 5, periodsPerDay: 7 };

export const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

/**
 * 창의적 체험활동(창체). 명단이 없고 학년 동시 블록으로 운영되므로 일반 강좌처럼
 * 솔버 변수로 두지 않고 FixedBlock(고정 칸 점유)으로 처리한다. teacher_timetable의
 * activity_type autonomy/club/career와 대응.
 */
// 진로활동은 정규 배치 대상이라 제외 목록에서 뺀다 (사용자 요구). 나머지 창체는 미배치.
export const ACTIVITY_SUBJECTS: ReadonlySet<string> = new Set([
  '자율활동',
  '자율·자치활동',
  '자치활동',
  '동아리활동',
  '봉사활동',
  '창의적 체험활동',
  '창체',
  '학급자치',
]);

/** 창체 여부 (공백 표기 변형에 강건 — "동아리 활동" ↔ "동아리활동"). 솔버 배치 대상에서 제외 */
export function isActivitySubject(name: string): boolean {
  const n = name.replace(/\s+/g, '');
  for (const a of ACTIVITY_SUBJECTS) if (a.replace(/\s+/g, '') === n) return true;
  return false;
}

// 교과 분류 키워드 (exam-schedule와 동일 기준)
const MAJOR_KOREAN = ['국어', '문학', '독서', '화법', '언어와 매체', '주제 탐구 독서'];
const MAJOR_MATH = ['수학', '대수', '미적분', '기하', '확률과 통계', '경제 수학', '인공지능 수학'];
const MAJOR_ENGLISH = ['영어', '영어권', '영어 독해'];
const SCIENCE = ['물리', '화학', '생명과학', '지구과학', '통합과학', '과학탐구', '과학사'];
const SOCIAL = ['사회', '한국사', '세계사', '지리', '윤리', '정치', '경제', '법', '통합사회'];
const FOREIGN = ['일본어', '중국어', '독일어', '프랑스어', '한문', '스페인어', '러시아어'];
const ARTS_PE = ['음악', '미술', '체육', '스포츠', '연극', '미술사'];

export function categorizeSubject(name: string): SubjectCategory {
  const n = name.replace(/\s+/g, '');
  const has = (list: string[]) => list.some((k) => n.includes(k.replace(/\s+/g, '')));
  if (has(MAJOR_KOREAN)) return 'major-korean';
  if (has(MAJOR_MATH)) return 'major-math';
  if (has(MAJOR_ENGLISH)) return 'major-english';
  if (has(SCIENCE)) return 'science';
  if (has(SOCIAL)) return 'social';
  if (has(FOREIGN)) return 'foreign';
  if (has(ARTS_PE)) return 'arts-pe';
  return 'other';
}

export function isMajorCategory(c: SubjectCategory): boolean {
  return c === 'major-korean' || c === 'major-math' || c === 'major-english';
}

export const DEFAULT_WEIGHTS: TimetableWeights = {
  studentGap: 60, // 학생 중간 공강은 가장 강하게 회피 (체감 품질의 핵심)
  subjectSameDay: 30,
  subjectConsecutive: 8,
  teacherGap: 6,
  dailyBalance: 10,
  majorClustering: 15,
  electiveBlockMisalign: 12,
  // 교사 하루 부하 상한 초과는 강하게 회피 (사용자 핵심 요구). 단 학생 공강(60)을 압도하지
  // 않도록 균형 — 한 교사가 하루 6개(초과 2)면 70점으로 1~2칸 이동을 강하게 유도.
  teacherDailyLoad: 35,
  // 3연속 회피. hard.teacherConsecutive가 켜지면 하드로 강제되므로 이 가중치는
  // 소프트 모드(플래그 off)에서만 의미가 있다. 아래 두 항목도 동일.
  teacherConsecutive: 14,
  teacherLastPeriod: 20,
  teacherSubjectConsecutive: 18,
};

export const DEFAULT_OPTIONS: TimetableOptions = {
  runMode: 'standard',
  hard: {
    teacherConflict: true,
    studentConflict: true,
    roomConflict: false, // 교실 데이터 정비 전까지 기본 비활성
    subjectDailyCap: true,
    // 교사 부하 제약 4종 — 하드 강제가 기본 (사용자 요구: 하루 최대 4개, 3연속 금지,
    // 7교시 주 3개까지, 같은 분반-같은 교사 연속 금지). 시드 탐색 에너지에 직접 통합된다.
    teacherDailyCap: true,
    teacherConsecutive: true,
    teacherLastPeriodCap: true,
    teacherSubjectConsecutive: true,
  },
  maxPerSubjectPerDay: 1,
  maxPerTeacherPerDay: 4,
  maxConsecutivePerTeacher: 2,
  maxLastPeriodPerTeacher: 3,
  // 조이기 단계 분반 구성원 교체: 분반당 인원 변동 ±2명 이내 (0=비활성)
  maxResectionShift: 2,
  // 제한된 격자에서 배치와 분반을 함께 탐색하고 정체 시 다른 초기 배치를 시도한다.
  strategy: 'coordinated',
};

/**
 * 실행 모드별 예산. 시간표는 변수가 수백~천 개라 시험(수십 개)보다 큰 예산이 필요하다.
 * cspSeeds는 한 시드 생성이 비싸 적게, SA는 길게 돌린다.
 */
export const RUN_MODE_LIMITS: Record<
  RunMode,
  { cspSeeds: number; saMaxIter: number; timeBudgetMs: number }
> = {
  quick: { cspSeeds: 2, saMaxIter: 4000, timeBudgetMs: 6000 },
  standard: { cspSeeds: 4, saMaxIter: 20000, timeBudgetMs: 25000 },
  thorough: { cspSeeds: 8, saMaxIter: 60000, timeBudgetMs: 60000 },
  // 최정밀: 정확도 최우선 (총 10~30분 허용). timeBudgetMs는 runSolver 1회 예산이고,
  // exact 파이프라인의 스테이지별 예산은 EXACT_BUDGET에서 별도 관리한다.
  exact: { cspSeeds: 8, saMaxIter: 60000, timeBudgetMs: 60000 },
};

/**
 * 'exact'(최정밀) 모드 스테이지별 예산 (ms).
 *  A) relaxRetry — 완화(부하 4종 OFF) 다중 시드 solve→section→re-solve로 기본충돌 0 확보
 *  B) repair — 교사-하드 LNS+MILP 수리 × Kempe 조이기 포트폴리오 (위반 0 도달 시 조기 종료)
 *  C) fullMilp — 전체 인스턴스 MILP (0위반 증명 / infeasible 판정 / incumbent)
 * 총합 ≈ 20분 상한. 위반 0에 도달하면 즉시 종료하므로 실제 실행은 훨씬 짧을 수 있다.
 */
export const EXACT_BUDGET = {
  relaxAttempts: 4, // 완화 솔브 최대 시드 수 (tier0=0 나오면 즉시 다음 단계)
  repairMs: 480_000, // Stage B 총 예산 (8분)
  repairRoundMs: 60_000, // Stage B 한 라운드(LNS 또는 Kempe) 예산
  fullMilpMs: 300_000, // Stage C 예산 (5분)
} as const;

export const ELITE_ARCHIVE_SIZE = 5;
export const HAMMING_DIVERSITY_RATIO = 0.2;

export const SA_CONFIG = {
  Tstart: 60,
  Tend: 0.05,
  alpha: 0.96,
  reportEvery: 200,
} as const;

export const HARD_CONSTRAINT_LABELS: Record<string, string> = {
  invalidPlacement: '잘못된 수업 또는 격자 밖 배치',
  studentConflict: '학생 동시 수업 충돌',
  teacherConflict: '교사 동시 수업 충돌',
  roomConflict: '교실 동시 사용 충돌',
  subjectDailyCap: '같은 과목 하루 중복',
  blockedCell: '차단 칸(공강/창체) 침범',
  pinnedViolation: '고정 배치 위반',
  unplaced: '미배치 수업',
  teacherDailyOver: '교사 하루 수업 초과(최대 4개)',
  teacherTripleRun: '교사 3연속 수업',
  teacherLastPeriodOver: '교사 7교시 수업 초과(주 3개)',
  teacherSubjectAdjacent: '같은 분반-같은 교사 연속 배치',
};

/**
 * 하드 위반 계층 중 tier1(교사 부하 4종)의 hard 항목 id.
 * tier0(학생/교사 동시수업·차단칸·하루중복·미배치·고정위반)은 절대불가,
 * tier1은 강한 선호 — 후보 비교·UI 표시가 이 구분을 공유한다.
 */
export const TEACHER_HARD_TIER1_IDS: ReadonlySet<string> = new Set([
  'teacherDailyOver',
  'teacherTripleRun',
  'teacherLastPeriodOver',
  'teacherSubjectAdjacent',
]);

export const SOFT_CONSTRAINT_LABELS: Record<string, string> = {
  studentGap: '학생 중간 공강',
  subjectSameDay: '같은 과목 같은 날 중복',
  subjectConsecutive: '같은 과목 연속 교시',
  teacherGap: '교사 중간 공강',
  dailyBalance: '반별 일일 수업 편차',
  majorClustering: '주요교과 같은 날 집중',
  electiveBlockMisalign: '선택과목 블록 비정렬',
  teacherDailyLoad: '교사 하루 수업 과다(상한 초과)',
  teacherConsecutive: '교사 연속 수업 과다(3연속)',
  teacherLastPeriod: '교사 7교시 수업 과다(주 상한 초과)',
  teacherSubjectConsecutive: '같은 분반-같은 교사 연속 배치',
};

/**
 * 교사 부하 하드 제약 4종 일괄 OFF — 순수 채색 벤치마크(회귀 스크립트)용.
 * `options: { hard: TEACHER_HARD_OFF }`처럼 넘기면 buildTimetableInput이
 * DEFAULT_OPTIONS.hard와 merge하므로 나머지 하드 플래그는 기본값을 유지한다.
 */
export const TEACHER_HARD_OFF = {
  teacherDailyCap: false,
  teacherConsecutive: false,
  teacherLastPeriodCap: false,
  teacherSubjectConsecutive: false,
} as const;

/**
 * 학교 고정 공강(균일 공강) 기본값 — 사용자 지정 운영 원칙.
 * 1·3학년: 월4·화4·수4·금4·금5 (5칸, 가용 30) / 2학년: 월4·화4·금4·금5 (4칸, 가용 31).
 * UI 신규 생성 화면의 초기값이며, 학년 탭에서 칸을 눌러 조정할 수 있다.
 */
export const DEFAULT_BLOCKED_BY_GRADE: Record<1 | 2 | 3, ReadonlyArray<{ dayIndex: number; period: number }>> = {
  1: [
    { dayIndex: 0, period: 4 },
    { dayIndex: 1, period: 4 },
    { dayIndex: 2, period: 4 },
    { dayIndex: 4, period: 4 },
    { dayIndex: 4, period: 5 },
  ],
  2: [
    { dayIndex: 0, period: 4 },
    { dayIndex: 1, period: 4 },
    { dayIndex: 4, period: 4 },
    { dayIndex: 4, period: 5 },
  ],
  3: [
    { dayIndex: 0, period: 4 },
    { dayIndex: 1, period: 4 },
    { dayIndex: 2, period: 4 },
    { dayIndex: 4, period: 4 },
    { dayIndex: 4, period: 5 },
  ],
};
