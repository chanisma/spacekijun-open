/**
 * 데이터 검증 유틸리티
 * PDF에서 추출한 데이터의 유효성을 검증
 */

import { Student } from '../../types';
import { Section6Record, Section5Record, Section8Record, Section2Record, VolunteerRecord } from '../../types/pdfTypes';
import { PDFParseError } from '../../types/pdf';

/**
 * 검증 결과 타입
 */
export interface ValidationResult {
  valid: boolean;
  errors: PDFParseError[];
  warnings: string[];
}

function addError(
  errors: PDFParseError[],
  field: string,
  message: string,
  severity: 'error' | 'warning' = 'error'
): void {
  errors.push({ field, message, severity });
}

/**
 * Validate Subject Grade (Section 6)
 */
export function validateSubjectGrade(grade: Section6Record, index: number): ValidationResult {
  const errors: PDFParseError[] = [];
  const warnings: string[] = [];

  const fieldPrefix = `section6_academic_development[${index}]`;

  // Required Field Check
  if (!grade.subject || grade.subject.trim().length === 0) {
    addError(errors, `${fieldPrefix}.subject`, '과목명이 누락되었습니다.');
  }

  // Semester Validation
  // If semester is null, it's an error unless acceptable
  if (!grade.semester) {
    // addError(errors, `${fieldPrefix}.semester`, '학기 정보가 누락되었습니다.');
    // Allow loose validation for now
  }

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings
  };
}

/**
 * 창의적 체험활동 검증
 */
export function validateCreativeActivity(activity: Section5Record, index: number): ValidationResult {
  const errors: PDFParseError[] = [];
  const warnings: string[] = [];

  const fieldPrefix = `section5_creative_activities[${index}]`;

  // 학년 검증
  if (activity.grade < 1 || activity.grade > 3) {
    addError(errors, `${fieldPrefix}.grade`, `학년이 범위를 벗어났습니다: ${activity.grade} (1-3 사이여야 함)`);
  }

  // 카테고리 검증
  const validCategories = ['자율활동', '동아리활동', '진로활동', '봉사활동'];
  if (!validCategories.includes(activity.type)) {
    addError(errors, `${fieldPrefix}.type`, `활동 카테고리가 올바르지 않습니다: ${activity.type}`);
  }

  // 내용 검증
  if (!activity.content || activity.content.trim().length === 0) {
    addError(errors, `${fieldPrefix}.content`, '활동 내용이 누락되었습니다.', 'warning');
  }

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings
  };
}

/**
 * 봉사활동 검증
 */
export function validateVolunteerActivity(activity: VolunteerRecord, index: number): ValidationResult {
  const errors: PDFParseError[] = [];
  const warnings: string[] = [];

  const fieldPrefix = `volunteer_activities[${index}]`;

  // 학년 검증
  if (activity.grade < 1 || activity.grade > 3) {
    addError(errors, `${fieldPrefix}.grade`, `학년이 범위를 벗어났습니다: ${activity.grade} (1-3 사이여야 함)`);
  }

  // 시간 검증
  if (activity.hours !== null && activity.hours < 0) {
    addError(errors, `${fieldPrefix}.hours`, `봉사 시간이 음수입니다: ${activity.hours}`);
  }

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings
  };
}

/**
 * 행동특성 검증
 */
export function validateBehaviorRecord(record: Section8Record, index: number): ValidationResult {
  const errors: PDFParseError[] = [];
  const warnings: string[] = [];

  const fieldPrefix = `section8_behavior_characteristics[${index}]`;

  // 학년 검증
  if (record.grade < 1 || record.grade > 3) {
    addError(errors, `${fieldPrefix}.grade`, `학년이 범위를 벗어났습니다: ${record.grade} (1-3 사이여야 함)`);
  }

  // 내용 검증
  if (!record.content || record.content.trim().length === 0) {
    addError(errors, `${fieldPrefix}.content`, '행동특성 내용이 누락되었습니다.', 'warning');
  }

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings
  };
}

/**
 * 출결상황 검증
 */
export function validateAttendanceRecord(record: Section2Record, index: number): ValidationResult {
  const errors: PDFParseError[] = [];
  const warnings: string[] = [];

  const fieldPrefix = `section2_attendance[${index}]`;

  // 학년 검증
  if (record.grade < 1 || record.grade > 3) {
    addError(errors, `${fieldPrefix}.grade`, `학년이 범위를 벗어났습니다: ${record.grade} (1-3 사이여야 함)`);
  }

  // 출결 일수 검증
  if (record.schoolDays < 0) {
    addError(errors, `${fieldPrefix}.schoolDays`, `수업일수가 음수입니다: ${record.schoolDays}`);
  }

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings
  };
}

/**
 * 전체 Student 객체 검증
 */
export function validateStudent(student: Partial<Student>): ValidationResult {
  const allErrors: PDFParseError[] = [];
  const allWarnings: string[] = [];

  // 기본 정보 검증
  if (!student.section1_personal_info?.name && !student.name) {
    allErrors.push({ field: 'name', message: '성명이 누락되었습니다.', severity: 'error' });
  }

  // 교과 성적 검증 (Section 6)
  student.section6_academic_development?.forEach((grade, index) => {
    const result = validateSubjectGrade(grade, index);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  });

  // 창의적 체험활동 검증 (Section 5)
  student.section5_creative_activities?.forEach((activity, index) => {
    const result = validateCreativeActivity(activity, index);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  });

  // 봉사활동 검증
  student.volunteer_activities?.forEach((activity, index) => {
    const result = validateVolunteerActivity(activity, index);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  });

  // 행동특성 검증 (Section 8)
  student.section8_behavior_characteristics?.forEach((record, index) => {
    const result = validateBehaviorRecord(record, index);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  });

  // 출결상황 검증 (Section 2)
  student.section2_attendance?.forEach((record, index) => {
    const result = validateAttendanceRecord(record, index);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  });

  return {
    valid: allErrors.filter(e => e.severity === 'error').length === 0,
    errors: allErrors,
    warnings: allWarnings
  };
}

/**
 * 데이터 완성도 계산 (0-100%)
 */
export function calculateCompleteness(student: Partial<Student>): number {
  let totalFields = 0;
  let filledFields = 0;

  // 기본 정보
  totalFields += 1;
  if (student.name) filledFields++;

  // 교과 성적
  const gradeCount = student.section6_academic_development?.length || 0;
  totalFields += Math.max(1, gradeCount);
  filledFields += gradeCount;

  // 창의적 체험활동
  const activityCount = student.section5_creative_activities?.length || 0;
  totalFields += Math.max(1, activityCount);
  filledFields += activityCount;

  // 봉사활동
  const volunteerCount = student.volunteer_activities?.length || 0;
  totalFields += Math.max(1, volunteerCount);
  filledFields += volunteerCount;

  // 행동특성
  const behaviorCount = student.section8_behavior_characteristics?.length || 0;
  totalFields += Math.max(1, behaviorCount);
  filledFields += behaviorCount;

  // 출결상황
  const attendanceCount = student.section2_attendance?.length || 0;
  totalFields += Math.max(1, attendanceCount);
  filledFields += attendanceCount;

  return Math.round((filledFields / totalFields) * 100);
}
