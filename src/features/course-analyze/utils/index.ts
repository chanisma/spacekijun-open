/**
 * Course Analyze Utils - 유틸리티 모듈 인덱스
 */

// Types
export * from '../types/course.types';

// Subject Utilities
export {
  DEFAULT_SUBJECT_CATEGORIES,
  SCIENCE_HIERARCHY,
  classifySubjectsByCategories,
  convertSubjectConfiguration,
  filterSubjectsByConfiguration,
  getCategoryDisplayOrder,
  debounce
} from './subjectUtils';

// Data Processor
export {
  parseUnifiedData,
  parseLegacyExcelData,
  parseStudentData,
  getLastRoundStudentsForGrade,
  getClassNumber,
  formatStudentNumber,
  getStudentsByClass,
  getStudentsWithSameSubjectsInBothSemesters,
  calculateEnrollmentData,
  getSubjectsAtMaxCapacity,
  getScienceHierarchyViolations,
  getAvailableRoundsForGrade,
  mapRoundIdToNumber,
  filterStudents,
  calculateSubjectCounts,
  findStudentsBySubjectCombination
} from './dataProcessor';

// File Utilities
export {
  detectFileType,
  isValidFileType,
  parseJsonFile,
  parseExcelFile,
  parseFile,
  downloadAsJson,
  exportToUnifiedFormat,
  loadFileFromUrl,
  validateFile,
  MAX_FILE_SIZE,
  ACCEPTED_FILE_TYPES
} from './fileUtils';
