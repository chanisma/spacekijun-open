/**
 * Class Assignment Feature - Constants
 * 학급 배정 시스템 상수 정의
 */

import type { ClassAssignmentConfig } from '../types/class-assignment.types';

// ============================================================================
// Algorithm Constants
// ============================================================================

export type AlgorithmType = 'random' | 'gradeBased' | 'serpentine' | 'stratified';

export const AVAILABLE_ALGORITHMS: {
  id: AlgorithmType;
  name: string;
  description: string;
}[] = [
  {
    id: 'random',
    name: '무작위 배정',
    description: '학생들을 완전히 무작위로 반에 배정합니다.',
  },
  {
    id: 'gradeBased',
    name: '성적순 배정',
    description: '성적순으로 정렬 후 순차적으로 반에 배정합니다. (1→2→3→1→2→3)',
  },
  {
    id: 'serpentine',
    name: '뱀식 배정',
    description: '성적순으로 지그재그 방식으로 배정합니다. (1→2→3→3→2→1)',
  },
  {
    id: 'stratified',
    name: '계층화 배정 (권장)',
    description: '성적을 상/중/하 그룹으로 나눈 후 각 그룹에서 뱀식으로 배정합니다.',
  },
];

// 특수반 배정 모드
export type SpecialClassMode = 'none' | 'preset' | 'combination' | 'clustering';

export const SPECIAL_CLASS_MODES: {
  id: SpecialClassMode;
  name: string;
  description: string;
}[] = [
  {
    id: 'none',
    name: '사용 안함',
    description: '특수반 없이 일반 배정만 수행합니다.',
  },
  {
    id: 'preset',
    name: '프리셋 기반',
    description: '과학중점반, 사회중점반 등 미리 정의된 과목군으로 배정합니다.',
  },
  {
    id: 'combination',
    name: '과목 조합 매칭',
    description: '특정 과목 조합(예: 물리+화학)을 선택한 학생을 같은 반에 배정합니다.',
  },
  {
    id: 'clustering',
    name: '과목 클러스터링',
    description: '유사한 과목 선택 패턴의 학생들을 자동으로 같은 반에 그룹화합니다.',
  },
];

export const DEFAULT_ALGORITHM: AlgorithmType = 'stratified';

// ============================================================================
// Configuration Defaults
// ============================================================================

export const DEFAULT_CONFIG: ClassAssignmentConfig = {
  grade: 1,
  classCount: 9,
  algorithm: 'stratified',
  constraints: {
    balanceGender: false,  // 여학교이므로 불필요
    balancePerformance: true,
    keepFriendsTogether: false,
    separateList: [],
  },
  specialClasses: [],
};

export const GRADE_OPTIONS = [
  { value: 1, label: '1학년' },
  { value: 2, label: '2학년' },
  { value: 3, label: '3학년' },
];

export const CLASS_COUNT_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}반`,
}));

// ============================================================================
// Excel Export/Import Constants
// ============================================================================

export const STUDENT_LIST_HEADERS = [
  '학번',
  '이름',
  '학년',
  '기존반',
  '기존번호',
  '배정반',
  '배정번호',
  '평균등급',
  '비고',
];

export const CLASS_LIST_HEADERS = [
  '번호',
  '학번',
  '이름',
  '기존반',
  '평균등급',
];

export const IMPORT_REQUIRED_HEADERS = ['학번', '이름', '학년'];

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEY = 'class-assignment-state';
export const COURSE_DATA_KEY = 'course-analyze-students';

// ============================================================================
// History & Undo/Redo
// ============================================================================

export const MAX_HISTORY = 50;

// ============================================================================
// Statistics Thresholds
// ============================================================================

export const BALANCE_THRESHOLDS = {
  gradeVariance: 0.5,    // 반별 평균 성적 편차 허용치
  sizeVariance: 2,       // 반별 인원수 편차 허용치
  originClassRatio: 0.3, // 같은 출신반 비율 최대치
};

// ============================================================================
// Special Class Presets
// ============================================================================

export const SPECIAL_CLASS_PRESETS = [
  {
    name: '과학중점반',
    targetSubjects: ['물리학', '화학', '생명과학', '지구과학', '과학탐구실험'],
    minSubjectCount: 2,
  },
  {
    name: '사회중점반',
    targetSubjects: ['정치와법', '경제', '사회·문화', '세계지리', '동아시아사', '세계사'],
    minSubjectCount: 2,
  },
  {
    name: '예체능반',
    targetSubjects: ['미술', '음악', '체육', '연극', '무용'],
    minSubjectCount: 1,
  },
];

// ============================================================================
// UI Constants
// ============================================================================

export const CONSTRAINT_TYPES = {
  SEPARATE: 'separate',   // 분리 제약: 두 학생이 같은 반 불가
  COMBINE: 'combine',     // 결합 제약: 두 학생이 반드시 같은 반
} as const;

export const DRAG_TYPES = {
  STUDENT: 'student',
} as const;
