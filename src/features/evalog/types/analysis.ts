/**
 * AI Activity Analysis Types
 * Solar Pro 4 기반 학생 세부능력 및 특기사항 분석 결과
 */

/** DB에 저장되는 분석 결과 JSONB 구조 */
export interface AnalysisResult {
  version: number;
  analyzed_at: string;
  model: string;
  what: string[];
  why: string[];
  how: string[];
  keywords: string[];
  competencies: string[];
  summary: string;
}

/** 분석 대상 필터 */
export interface AnalysisFilter {
  grade?: number;
  semester?: number;
  category?: string;
  studentId?: string;
  onlyUnanalyzed?: boolean;
}

/** 배치 분석 진행 상태 */
export interface AnalysisProgress {
  current: number;
  total: number;
  currentStudentName?: string;
  currentSubject?: string;
  status: 'idle' | 'analyzing' | 'saving' | 'done' | 'error' | 'cancelled' | 'paused' | 'retrying';
  successCount: number;
  failCount: number;
  skipCount: number;
  /** 현재 재시도 횟수 (해당 레코드) */
  retryAttempt?: number;
  /** 연속 실패 횟수 (circuit breaker 표시용) */
  consecutiveFailures?: number;
  /** 청크 휴식 중 표시 */
  chunkPauseRemaining?: number;
}

/** 분석 통계 */
export interface AnalysisStats {
  total: number;
  analyzed: number;
  unanalyzed: number;
}

/** student_detailed_activities row + analysis 포함 */
export interface ActivityWithAnalysis {
  id: string;
  student_id: string;
  student_name?: string;
  grade: number;
  semester: number | null;
  category: string;
  subject_name: string;
  content: string;
  analysis: AnalysisResult | null;
}

/** 프론트엔드 집계용: 학년/카테고리별 그룹 */
export interface AggregatedAnalysis {
  grade: number;
  category: string;
  activities: ActivityWithAnalysis[];
}

/** 학년별 그룹 */
export interface GradeGroup {
  grade: number;
  categories: CategoryGroup[];
}

/** 카테고리별 그룹 */
export interface CategoryGroup {
  category: string;
  activities: ActivityWithAnalysis[];
}

/** 학년별 서브 그룹 (카테고리 → 학년 구조용) */
export interface GradeSubGroup {
  grade: number;
  activities: ActivityWithAnalysis[];
}

/** 카테고리 최상위 그룹 (활동 유형 → 학년 서브그룹) */
export interface CategoryTopGroup {
  /** 표시용 카테고리명 (예: '교과활동', '자율활동') */
  category: string;
  /** 원본 category 값들 (교과활동은 regular/career/pe_arts 포함) */
  rawCategories: string[];
  grades: GradeSubGroup[];
}

/** 교차 패턴 (여러 카테고리에 공통 등장하는 키워드) */
export interface CrossPattern {
  keyword: string;
  categories: string[];
  count: number;
}

/** 성장 궤적 (학년 간 변화) */
export interface GrowthTrajectory {
  grade: number;
  keywords: string[];
  competencies: string[];
  newKeywords: string[];
  newCompetencies: string[];
}

/** 강점/성장영역 분석 */
export interface StrengthAnalysis {
  topCompetencies: { name: string; count: number }[];
  topKeywords: { name: string; count: number }[];
  growthAreas: string[];
}
