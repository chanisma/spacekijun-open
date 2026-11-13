/**
 * Subject Assignment Types - 과목별 반 배정 타입 정의
 * class-assignment 전용 (course-analyze 의존성 제거)
 */

// ============================================================================
// Student Type
// ============================================================================

export interface Student {
  id: string | number;
  name: string;
  contact?: string;
  submitTime?: string;
  modifyTime?: string;
  year: number;           // 학년 (1, 2, 3)
  class: number;          // 반
  number: number;         // 번호
  round: number;          // 차수
  semester1: string[];    // 1학기 선택 과목
  semester2: string[];    // 2학기 선택 과목
  grade: number;          // 성적 등급 (평균)
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

export interface SubjectAssignmentHistoryEntry {
  assignments: SubjectAssignment[];
  timestamp: Date;
  description: string;
}

// ============================================================================
// Data Parser Types
// ============================================================================

export interface SubjectConfiguration {
  categories: Record<string, {
    subjects: string[];
    displayOrder?: number;
  }>;
  uncategorized?: string[];
}

export interface UnifiedDataFormat {
  fileType: 'kijun_unified_export' | 'unified';
  version?: string;
  studentData: (string | number)[][];
  subjectConfiguration?: SubjectConfiguration;
}
