import type {
  AlgorithmWeights,
  ExamScheduleOptions,
  Grade,
  SubjectCategory,
  SupervisionConfig,
} from './types';

export const ALL_GRADES: Grade[] = [1, 2, 3];

/** 감독 시간표 등 인쇄물 머리글에 쓰는 학교명 */
export const SCHOOL_NAME = '샘플고등학교';

export const ACTIVITY_SUBJECT_BLOCKLIST: ReadonlySet<string> = new Set([
  '자율활동',
  '자율·자치활동',
  '동아리활동',
  '진로활동',
  '창체',
  '창의적 체험활동',
  '학급자치',
  '진로',
  '봉사활동',
  '봉사',
]);

export const MAJOR_KOREAN_KEYWORDS = ['국어', '문학', '독서', '화법', '언어와 매체', '주제 탐구 독서'];
export const MAJOR_MATH_KEYWORDS = ['수학', '대수', '미적분', '기하', '확률과 통계', '경제 수학', '인공지능 수학'];
export const MAJOR_ENGLISH_KEYWORDS = ['영어', '영어권', '영어 독해'];

export const SCIENCE_KEYWORDS = ['물리', '화학', '생명과학', '지구과학', '통합과학', '과학탐구'];
export const SOCIAL_KEYWORDS = [
  '사회', '한국사', '세계사', '지리', '윤리', '정치', '경제', '법', '통합사회', '사회와 문화',
];
export const FOREIGN_KEYWORDS = ['일본어', '중국어', '독일어', '프랑스어', '한문', '스페인어', '러시아어'];
export const ARTS_PE_KEYWORDS = ['음악', '미술', '체육', '스포츠', '연극', '미술사'];

export const DEFAULT_WEIGHTS: AlgorithmWeights = {
  examEveryDay: 80,
  twoExamsInARow: 5,
  threePlusExamsPerDay: 1000,
  majorClustering: 30,
  majorConsecutive: 5,
  unevenLoad: 10,
  earlyMorningHard: 5,
  studentEmptyDay: 50,
  electiveConcurrency: 20,
  supervisorOverflow: 400,
  supervisorPeak: 2,
};

/**
 * 감독 인력 기본값. availableSupervisors는 화면 진입 시 resource(type='teacher')
 * 수로 덮어쓰며, 사용자가 출제·결강 등을 감안해 직접 조정할 수 있다.
 * 시험실은 정원이 다른 티어 목록으로 정의한다 (기본: 28명 일반교실 30실).
 */
export const DEFAULT_SUPERVISION: SupervisionConfig = {
  enabled: true,
  availableSupervisors: 60,
  supervisorsPerRoom: 1,
  // 공통 과목은 각 반에서 응시 — 학년별 반 수 (DB student_basic_info로 자동 보정)
  classCountByGrade: { 1: 9, 2: 9, 3: 9 },
  // 선택과목 고사실 풀 (정원이 다른 교실 묶음)
  roomTiers: [{ capacity: 28, count: 12 }],
  hard: true,
};

/** v2(단일 roomCapacity) 저장본을 티어로 변환할 때 쓰는 실 수 — 사실상 무제한 의미 */
export const LEGACY_ROOM_COUNT = 100;

export const DEFAULT_OPTIONS: ExamScheduleOptions = {
  allowConcurrentElectives: true,
  preferConcurrentElectives: false,
  requireExamEveryDay: false,
  examCountMode: 'auto',
  maxExamsPerStudentPerDay: 2,
  majorSubjectsSpread: 'one-per-day',
  preferEarlyMajor: false,
  runMode: 'thorough',
  hardConstraints: {
    examEveryDay: false,
    maxExamsPerStudentPerDay: false,
    majorSubjectsSpread: false,
    electiveConcurrency: false,
  },
};

export const RUN_MODE_LIMITS: Record<ExamScheduleOptions['runMode'], {
  cspSeeds: number;
  saMaxIter: number;
  timeBudgetMs: number;
}> = {
  quick: { cspSeeds: 3, saMaxIter: 800, timeBudgetMs: 2000 },
  standard: { cspSeeds: 6, saMaxIter: 2500, timeBudgetMs: 10000 },
  thorough: { cspSeeds: 12, saMaxIter: 5000, timeBudgetMs: 30000 },
};

export const SOFT_CONSTRAINT_LABELS: Record<string, string> = {
  examEveryDay: '매일 최소 1과목 시험',
  twoExamsInARow: '연속 교시 시험',
  threePlusExamsPerDay: '하루 3개 이상',
  majorClustering: '주요교과 같은 날 집중',
  majorConsecutive: '주요교과 연속일',
  unevenLoad: '학생 부담 편차',
  earlyMorningHard: '1교시 주요과목',
  studentEmptyDay: '시험 없는 날 발생',
  electiveConcurrency: '선택과목 동시 배치',
  supervisorOverflow: '감독 인원 초과',
  supervisorPeak: '감독 수요 피크',
};

export const HARD_CONSTRAINT_LABELS: Record<string, string> = {
  studentConflict: '학생 동시 응시 충돌',
  pinnedAssignment: '고정 과목 위반',
  dailyExamCount: '일일 시험 수 불일치',
  examEveryDay: '매일 시험 배치 위반',
  studentDailyLimit: '학생당 일일 시험 수 한도 위반',
  majorSpreadHard: '주요교과 분산 정책 위반',
  electiveConcurrencyHard: '선택과목 동시 배치 정책 위반',
  dailyPeriodAvailability: '비활성 교시 사용',
  concurrentElectivePolicy: '동시 배치 정책 위반',
  supervisorCapacity: '감독 인원 한도 초과',
  examRoomShortage: '고사실(시험실) 부족',
};

export const ELITE_ARCHIVE_SIZE = 5;
export const HAMMING_DIVERSITY_RATIO = 0.3;

export const SA_CONFIG = {
  Tstart: 100,
  Tend: 0.1,
  alpha: 0.95,
  reportEvery: 50,
};

export function categorizeSubject(name: string): SubjectCategory {
  const n = name.replace(/\s+/g, '');
  if (MAJOR_KOREAN_KEYWORDS.some((k) => n.includes(k.replace(/\s+/g, '')))) return 'major-korean';
  if (MAJOR_MATH_KEYWORDS.some((k) => n.includes(k.replace(/\s+/g, '')))) return 'major-math';
  if (MAJOR_ENGLISH_KEYWORDS.some((k) => n.includes(k.replace(/\s+/g, '')))) return 'major-english';
  if (SCIENCE_KEYWORDS.some((k) => n.includes(k))) return 'science';
  if (SOCIAL_KEYWORDS.some((k) => n.includes(k))) return 'social';
  if (FOREIGN_KEYWORDS.some((k) => n.includes(k))) return 'foreign';
  if (ARTS_PE_KEYWORDS.some((k) => n.includes(k))) return 'arts-pe';
  return 'other';
}

export function isMajorCategory(c: SubjectCategory): boolean {
  return c === 'major-korean' || c === 'major-math' || c === 'major-english';
}
