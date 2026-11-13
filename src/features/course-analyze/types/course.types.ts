/**
 * Course Analyze Feature - TypeScript Type Definitions
 * 학생 과목 선택 분석 시스템 타입 정의
 */

// ============================================================================
// Student Types
// ============================================================================

export interface Student {
  id: string | number;
  name: string;
  realID?: string;          // resource.meta.id (DB 학생코드, e.g., "00-00476")
  contact?: string;
  submitTime?: string;
  modifyTime?: string;
  year: number;           // 학년 (1, 2, 3)
  class: number;          // 반
  number: number;         // 번호
  round: number;          // 차수
  semester1: string[];    // 1학기 선택 과목
  semester2: string[];    // 2학기 선택 과목
  grade: number;          // 성적 등급 (평균) - JSON 파일 기준
}

// ============================================================================
// Database Grade Types (student_basic_info 연동)
// ============================================================================

export type GradeSource = 'json' | 'database' | 'both';

export interface DatabaseGradeData {
  studentCode: string;
  overallGrade: number;          // 전과목 가중 평균 등급
  subjectGroupGrades: Record<string, number>;  // 과목군별 평균 등급
  totalUnits: number;            // 총 이수 단위
  subjectCount: number;          // 과목 수
}

export interface StudentWithDbGrades extends Student {
  databaseGrade?: number;                      // DB 기반 평균 등급
  databaseSubjectGrades?: Record<string, number>;  // DB 과목군별 등급
  gradeSource: GradeSource;                    // 현재 사용 중인 성적 소스
  hasDatabaseGrade: boolean;                   // DB 성적 존재 여부
}

export interface GradeSourceStats {
  total: number;
  withDb: number;
  withoutDb: number;
  dbPercentage: number;
}

export interface StudentFilter {
  grade?: number;
  classNumber?: number;
  nameQuery?: string;
  hasSubject?: string;
  semester?: 'semester1' | 'semester2' | 'both';
}

// ============================================================================
// Subject Types
// ============================================================================

export type SubjectCategoryName =
  | '국어' | '영어' | '수학' | '역사' | '사회'
  | '물리' | '화학' | '생명' | '지구과학' | '과학기타'
  | '외국어' | '기술가정정보' | '교양' | '기타';

export interface SubjectCategory {
  name: SubjectCategoryName;
  subjects: string[];
  displayOrder?: number;
}

export interface SubjectConfiguration {
  categories: Record<string, {
    subjects: string[];
    displayOrder?: number;
  }>;
  uncategorized?: string[];
}

export interface SubjectEnrollment {
  maxCapacity: number;
  currentEnrollment: number;
}

export interface SubjectEnrollmentData {
  semester1: Map<string, SubjectEnrollment>;
  semester2: Map<string, SubjectEnrollment>;
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface SubjectCount {
  subjectName: string;
  semester1Count: number;
  semester2Count: number;
  totalCount: number;
  category: SubjectCategoryName | string;
}

export interface CategorizedSubjects {
  [category: string]: string[];
}

export interface ScienceHierarchyViolation {
  category: string;
  violation: 'missing_prerequisite' | 'same_semester';
  prerequisite: string;
  takenAdvanced: string[];
  description: string;
}

export interface StudentViolation {
  student: Student;
  violations: ScienceHierarchyViolation[];
}

export interface MaxCapacitySubject {
  name: string;
  maxCapacity: number;
  currentEnrollment: number;
}

export interface MaxCapacitySubjects {
  semester1: MaxCapacitySubject[];
  semester2: MaxCapacitySubject[];
}

// ============================================================================
// Round Comparison Types
// ============================================================================

export interface RoundData {
  roundNumber: number;
  students: Student[];
  uploadedAt?: Date;
}

export interface StudentChange {
  student: Student;
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface RoundComparison {
  round1: RoundData;
  round2: RoundData;
  changes: StudentChange[];
}

// ============================================================================
// Data Format Types
// ============================================================================

export interface UnifiedDataFormat {
  fileType: 'kijun_unified_export' | 'unified';
  version?: string;
  studentData: (string | number)[][];  // 헤더 포함 2D 배열
  subjectConfiguration?: SubjectConfiguration;
}

export interface CacheInfo {
  size: number;
  grades: (string | number)[];
  totalStudents: number;
}

// ============================================================================
// UI State Types
// ============================================================================

export type AnalysisTab =
  | 'subject-count'
  | 'combination-search'
  | 'in-depth'
  | 'class-view'
  | 'estimated-grade'
  | 'student-estimated-grade'
  | 'grade-distribution'
  | 'round-comparison'
  | 'class-management';

export interface UploadStatus {
  fileName: string;
  isUploading: boolean;
  progress?: number;
  error?: string;
  gradeRoundInfo?: {
    grade: number;
    round: number;
    studentCount: number;
  }[];
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface StudentListProps {
  students: Student[];
  onStudentSelect?: (student: Student) => void;
  selectedStudent?: Student | null;
  searchQuery?: string;
  consonantFilter?: string | null;
}

export interface AnalysisTabProps {
  students: Student[];
  currentGrade: number;
  subjectCategories: Record<string, string[]>;
}

export interface UploadZoneProps {
  onFileUpload: (file: File) => Promise<void>;
  isLoading?: boolean;
  acceptedFormats?: string[];
}

// ============================================================================
// Subject Assignment Types (과목별 반 배정)
// ============================================================================

export type SubjectAssignmentAlgorithm = 'random' | 'balanced' | 'stratified' | 'serpentine';

export interface SubjectConfig {
  subject: string;
  semester: 'semester1' | 'semester2';
  enrollmentCount: number;
  classCount: number;
  algorithm?: SubjectAssignmentAlgorithm;
}

export interface SubjectClass {
  classNum: number;
  students: Student[];
}

export interface SubjectAssignment {
  subjectName: string;
  semester: 'semester1' | 'semester2';
  classCount: number;
  classes: SubjectClass[];
  algorithm: SubjectAssignmentAlgorithm;
}

export interface SubjectAssignmentConfig {
  globalAlgorithm: SubjectAssignmentAlgorithm;
  balanceGrades: boolean;
  subjectConfigs: SubjectConfig[];
}

export interface SubjectAssignmentResult {
  assignments: SubjectAssignment[];
  timestamp: Date;
}

export interface SubjectAssignmentHistoryEntry {
  assignments: SubjectAssignment[];
  timestamp: Date;
  description: string;
}
