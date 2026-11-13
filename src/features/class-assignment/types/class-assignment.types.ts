/**
 * Class Assignment Feature - TypeScript Type Definitions
 * 학급 배정 시스템 타입 정의
 */

// ============================================================================
// Student Types
// ============================================================================

export interface CourseSelections {
  semester1: string[];
  semester2: string[];
}

export interface StudentData {
  student_code: string;      // Format: "00-00472"
  name: string;
  grade: number;
  class_num: number;
  number: number;
  gender?: 'M' | 'F';
  courseSelections?: CourseSelections;
}

export interface CourseAnalyzeStudent {
  id: string | number;
  name: string;
  class: number;
  number: number;
  semester1: string[];
  semester2: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

export type AlgorithmType = 'random' | 'gradeBased' | 'serpentine' | 'stratified';

// 특수반 배정 모드
export type SpecialClassMode = 'none' | 'preset' | 'combination' | 'clustering';

export interface ClassAssignmentConfig {
  grade: number;
  classCount: number;
  algorithm: AlgorithmType;
  constraints: AssignmentConstraints;
  specialClasses: SpecialClassConfig[];
}

export interface AssignmentConstraints {
  balanceGender: boolean;
  balancePerformance: boolean;
  keepFriendsTogether: boolean;
  separateList: string[][];  // List of student pairs to keep separate
  excludedStudents: string[];  // Student codes to exclude from assignment
  separateSameNames: boolean;  // Auto-separate students with same name
}

export interface SpecialClassConfig {
  classNum: number;
  name: string;
  targetSubjects: string[];
  minSubjectCount: number;
}

// ============================================================================
// Assignment Result Types
// ============================================================================

export interface ClassAssignment {
  classNum: number;
  students: StudentData[];
  specialClass?: boolean;
  specialConfig?: SpecialClassConfig;
}

export interface AssignmentResult {
  assignments: ClassAssignment[];
  statistics: AssignmentStatistics;
  timestamp: Date;
}

export interface AssignmentStatistics {
  totalStudents: number;
  classCount: number;
  avgClassSize: number;
  genderBalance: {
    classNum: number;
    maleCount: number;
    femaleCount: number;
  }[];
  specialClassStats?: {
    classNum: number;
    targetedCount: number;
    assignedCount: number;
  }[];
}

// Extended StudentData with averageGrade
export interface StudentDataWithGrade extends StudentData {
  averageGrade?: number;
}

// History entry for undo/redo
export interface AssignmentHistoryEntry {
  assignments: ClassAssignment[];
  classOrder?: number[];
  timestamp: Date;
  description: string;
}
