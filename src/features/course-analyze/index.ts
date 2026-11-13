/**
 * Course Analyze Feature - 메인 진입점
 *
 * 학생 과목 선택 분석 시스템
 * - iframe 방식에서 React 컴포넌트로 마이그레이션
 * - 번들된 xlsx 라이브러리 사용 (CDN 로딩 제거)
 * - Lovable 플랫폼 호환
 */

// Main Page Component
export { CourseAnalyzePage } from './components/CourseAnalyzePage';

// Context & Hooks
export {
  CourseAnalyzeProvider,
  useCourseAnalyze,
  useCourseAnalyzeData,
  useCourseAnalyzeFilter,
  useCourseAnalyzeSubjects,
  useCourseAnalyzeSearch,
  useCourseAnalyzeComparison
} from './context';

// Individual Hooks
export {
  useCourseData,
  useStudentFilter,
  useSubjectAnalysis,
  useCombinationSearch,
  useRoundComparison
} from './hooks';

// Types
export type {
  Student,
  StudentFilter,
  SubjectConfiguration,
  SubjectCategory,
  SubjectCount,
  AnalysisTab,
  UnifiedDataFormat,
  StudentViolation,
  StudentChange,
  RoundComparison
} from './types/course.types';

// Utilities
export {
  DEFAULT_SUBJECT_CATEGORIES,
  SCIENCE_HIERARCHY,
  classifySubjectsByCategories,
  convertSubjectConfiguration
} from './utils/subjectUtils';

export {
  parseFile,
  loadFileFromUrl,
  validateFile,
  downloadAsJson,
  exportToUnifiedFormat
} from './utils/fileUtils';
