// 수시 지원 학교 관리 (admission-wishlist) 도메인 타입
//
// 학생이 저장한 수시 지원 목록 한 행과, 거기에 매칭되는 참고 입시 데이터
// (교과 반영방법 / 종합 평가기준·면접 / adiga 커트라인·경쟁률)의 형태를 정의한다.
// 참고 데이터 JSONB는 get_admission_wishlist RPC가 조립해 내려주는 모양 그대로다.

/** 수시 전형 트랙 (정시 제외) */
export type AdmissionTrack = 'gyogwa' | 'jonghap';

/**
 * 수능최저 충족 여부의 **수동 판정** 값. NULL = 저장된 수동 판정 없음(= 자동 판정을 따름).
 * 자동 판정(모의 회차 성적 × gyogwa.csat 원문)을 지우는 게 아니라 그 위에 덮어쓴다.
 */
export type CsatCheckValue = 'meet' | 'fail';

/**
 * 지원 목록의 두 칸(tier).
 *  - apply    : 지원희망 — 수시 6회 지원에 대응하는 1~6지망 자리
 *  - interest : 관심대학 — 결정 전 담아 두는 후보
 * 지망 순번은 tier 안에서의 sort_order 이며, 칸을 옮기면 대상 칸 맨 뒤로 붙는다.
 * 두 칸은 **한 리스트**에 세로로 이어 그리고 배경색으로만 가른다(`WishlistList`).
 */
export type WishlistTier = 'apply' | 'interest';

export const TIER_LABELS: Record<WishlistTier, string> = {
  apply: '지원희망',
  interest: '관심대학',
};

/**
 * 수시 지원 가능 횟수 — 지망 자리 수 (교육부 수시 6회 제한).
 * 목록이 이 수를 넘어도 막지 않고 화면이 경고만 한다(원서 접수 전 정리 대상).
 */
export const MAX_APPLY_SLOTS = 6;

/**
 * 지원희망 + 관심대학을 **합쳐서** 담을 수 있는 총 수. **실제로 막는 유일한 상한**이다.
 *
 * 칸마다 상한을 두면(구 구현: 지원희망 6 · 관심대학 15) 지원희망 6 + 관심대학 15 인
 * 상태에서 **지원희망을 관심대학으로 내릴 수 없다**. 칸 이동은 총합을 바꾸지 않으므로
 * 총합만 제한하면 이동이 막힐 일이 없다. 규칙은 `utils/tierRules.ts`.
 */
export const MAX_TOTAL_SLOTS = 16;

export const TRACK_LABELS: Record<AdmissionTrack, string> = {
  gyogwa: '학생부교과',
  jonghap: '학생부종합',
};

/** 배지·칩용 약칭 (전체 라벨을 위치로 자르면 "학생부교과".slice(2)="부교과" 버그) */
export const TRACK_SHORT_LABELS: Record<AdmissionTrack, string> = {
  gyogwa: '교과',
  jonghap: '종합',
};

/** 교과 반영 교과목 한 건 (subjects_all 원소) */
export interface GyogwaSubject {
  unit?: string;
  subjects?: string;   // 예: "국,수,영,사,과,한"
  ratio?: string;
  admission?: string;
}
/** 진로선택 반영방법 한 건 (careers 원소) */
export interface GyogwaCareer {
  method?: string;     // 예: "성취도별 환산등급"
  subject?: string;    // 예: "반영 교과"
  criteria?: string;   // 예: "A=1등급, B=2등급, C=4등급"
  note?: string;
}

/** 교과 반영방법 (admission_gyogwa_criteria) — RPC gyogwa 컬럼 */
export interface GyogwaRef {
  id: string;
  region: string | null;
  university: string;
  admission: string | null;
  unit: string | null;
  method: string | null;
  method_tags: string[];
  unit_tags: string[];
  quota: number | null;
  quota_text: string | null;
  csat_status: string | null;
  has_csat: boolean;
  csat: string | null;          // 수능최저 원문 (판정용)
  subjects_all: GyogwaSubject[];
  careers: GyogwaCareer[];
}

/** 면접 평가요소 한 건 (interview_blocks[].factors[]) */
export interface InterviewFactor {
  name: string;
  value?: number | null;
  ratio?: string;
  standard?: string | null;
  items?: string;            // 평가 항목 (예: "공동체역량 / 나눔과 배려")
  questions?: string[];      // 기출질문
}
/** 전형별 면접 블록 한 건 (interview_blocks[]) */
export interface InterviewBlock {
  admission?: string;
  time?: string;
  process?: string;          // 예: "평가위원 3인 / 개별면접"
  source?: string;           // 활용자료
  factors?: InterviewFactor[];
}

/** 종합 평가기준·면접 (admission_jonghap_criteria) — RPC jonghap 컬럼 */
export interface JonghapRef {
  code: string;
  name: string;
  region: string | null;
  recruitment: number | null;
  has_doc_eval: boolean;
  doc_top_factors: Array<{ name: string; value: number | null; standard: string | null }> | null;
  doc_parsed_ratios: unknown;
  doc_section_text: string | null;
  doc_content_tables: unknown;
  has_interview: boolean;
  interview_status: string | null;
  interview_methods: string[];
  interview_blocks: InterviewBlock[] | null;
  interview_top_factors: unknown;
  interview_primary_time: string | null;
  interview_primary_process: string | null;
  interview_primary_source: string | null;
}

/** adiga 커트라인·경쟁률 (admission_adiga_results) — RPC adiga 컬럼 */
export interface AdigaRef {
  id: string;
  university: string;
  major: string | null;
  track: string | null;
  program: string | null;
  field: string | null;
  domain: string | null;
  grade50: number | null;
  grade70: number | null;
  grade_quality: string | null;
  recruit_2026: number | null;
  competition_2026: number | null;
  real_competition_2026: number | null;
  waitlist_2026: number | null;
  fill_rate_2026: number | null;
  history: {
    trend?: { deltaFrom2025: number | null; range: number | null; direction: string | null };
    years?: Record<string, {
      grade50?: number; grade70?: number; recruit?: number;
      competition?: number; realCompetition?: number; fillRate?: number; waitlist?: number;
    }>;
  } | null;
}

/** get_admission_wishlist 한 행 (지원 항목 + 매칭 참고데이터) */
export interface WishlistItem {
  id: string;
  studentCode: string;
  track: AdmissionTrack;
  university: string;
  department: string | null;
  admissionName: string | null;
  memo: string | null;
  sortOrder: number;
  /** 지원희망(apply) / 관심대학(interest) */
  tier: WishlistTier;
  /** 대학별 환산점수 — 만점 척도가 대학마다 달라 자유 표기 (사용자 입력) */
  convertedScore: string | null;
  /** 면접·실기 등 학교 일정 — 기간 표기가 흔해 자유 텍스트 (사용자 입력) */
  interviewDate: string | null;
  /** 1차 합격자 발표일 (사용자 입력, YYYY-MM-DD) */
  firstAnnounceDate: string | null;
  /** 최종 합격자 발표일 (사용자 입력, YYYY-MM-DD) */
  finalAnnounceDate: string | null;
  /** 6월 모평 기준 수능최저 충족 — 사용자 직접 판정 (null = 자동 판정을 따름) */
  csatCheck6: CsatCheckValue | null;
  /** 9월 모평 기준 수능최저 충족 — 사용자 직접 판정 (null = 자동 판정을 따름) */
  csatCheck9: CsatCheckValue | null;
  createdAt: string;
  updatedAt: string;
  gyogwa: GyogwaRef | null;
  jonghap: JonghapRef | null;
  adiga: AdigaRef | null;
}

/** search_admission_programs 한 행 (입력 화면 검색 결과) */
export interface ProgramSearchResult {
  track: AdmissionTrack;
  refId: string;          // gyogwa_id 또는 jonghap_code
  university: string;
  department: string | null;
  admissionName: string | null;
  region: string | null;
  extra: Record<string, unknown>;
  score: number | null;
}

/** get_class_wishlist_summary 한 행 (학생×지원항목) */
export interface ClassWishlistRow {
  studentCode: string;
  name: string;
  numberInClass: number | null;
  wishlistId: string | null;     // null = 지원 없음
  track: AdmissionTrack | null;
  university: string | null;
  department: string | null;
  admissionName: string | null;
  sortOrder: number | null;
  grade70: number | null;
  competition2026: number | null;
  field: string | null;
}

/** 학생 단위로 묶은 학급 위시리스트 (테이블 행) */
export interface ClassWishlistStudent {
  studentCode: string;
  name: string;
  numberInClass: number | null;
  applications: Array<{
    wishlistId: string;
    track: AdmissionTrack;
    university: string;
    department: string | null;
    admissionName: string | null;
    grade70: number | null;
    competition2026: number | null;
    field: string | null;
  }>;
}

/** search_admission_majors 한 행 (학과 단위 검색 결과 — adiga 기반) */
export interface MajorSearchResult {
  adigaId: string;
  university: string;
  major: string | null;
  program: string | null;
  field: string | null;
  domain: string | null;
  region: string | null;
  grade50: number | null;
  grade70: number | null;
  competition2026: number | null;
  recruit2026: number | null;
  /** 수능최저 (교과 best-match gyogwa 연결). 종합/무매칭이면 false/null */
  hasCsat: boolean;
  csat: string | null;
  csatStatus: string | null;
  score: number | null;
}

/** 학과 검색 정렬 기준 (search_admission_majors p_sort) */
export type MajorSortKey = 'grade70' | 'competition' | 'recruit' | 'score';

export const MAJOR_SORT_LABELS: Record<MajorSortKey, string> = {
  grade70: '70%컷 낮은순',
  competition: '경쟁률 낮은순',
  recruit: '모집인원 많은순',
  score: '검색 정확도순',
};

/** adiga 지역(권역) 선택지 — admission_adiga_results.region 13종 (교과) */
export const ADMISSION_REGIONS = [
  '서울', '경기', '인천', '강원', '대전', '충남', '충북',
  '대구경북', '부산울산경남', '광주전남', '전북', '제주', '미분류',
] as const;

/** 학과 검색 정렬·필터 옵션 (UI → RPC) */
export interface MajorSearchOptions {
  /** 선택 지역(권역). 빈 배열 = 전체 */
  regions: string[];
  /** 70%컷 하한 (이상). null = 무제한 */
  cutMin: number | null;
  /** 70%컷 상한 (이하). null = 무제한 */
  cutMax: number | null;
  /** 모집인원 최소 (이상). null = 무제한 */
  recruitMin: number | null;
  /** 정렬 기준 */
  sort: MajorSortKey;
}

export const DEFAULT_MAJOR_SEARCH_OPTIONS: MajorSearchOptions = {
  regions: [],
  cutMin: null,
  cutMax: null,
  recruitMin: null,
  sort: 'grade70',
};

/** 지원 항목 추가 입력 (학생 본인 또는 admin 대리) */
export interface NewWishlistInput {
  studentCode: string;
  /** 추가할 칸. 미지정이면 지원희망(apply) */
  tier?: WishlistTier;
  track: AdmissionTrack;
  university: string;
  department: string | null;
  admissionName: string | null;
  gyogwaId: string | null;
  jonghapCode: string | null;
  adigaId: string | null;
  memo: string | null;
}

/** 내 성적 대비 적합도 판정 결과 */
export type FitVerdict = 'safe' | 'fit' | 'reach' | 'danger' | 'unknown';

export const FIT_LABELS: Record<FitVerdict, string> = {
  safe: '안정',
  fit: '적정',
  reach: '소신',
  danger: '위험',
  unknown: '판정불가',
};

export const FIT_COLORS: Record<FitVerdict, string> = {
  safe: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  fit: 'bg-blue-50 text-blue-700 border-blue-200',
  reach: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-slate-50 text-slate-500 border-slate-200',
};
