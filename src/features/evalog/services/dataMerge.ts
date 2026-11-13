/**
 * 데이터 병합 및 중복 처리 유틸리티
 * 기존 데이터와 새 데이터를 병합하고 중복을 처리합니다.
 */

import { Student } from '../types';

export type MergeStrategy = 'keep-existing' | 'replace' | 'merge' | 'ask-user';

export interface DuplicateInfo {
  studentNo: string;
  existingStudent: Partial<Student>;
  newStudent: Partial<Student>;
  conflicts: string[];
}

export interface MergeResult {
  merged: Partial<Student>[];
  duplicates: DuplicateInfo[];
  added: number;
  updated: number;
  skipped: number;
}

/**
 * 두 학생 데이터 비교하여 차이점 찾기
 */
function findConflicts(
  existing: Partial<Student>,
  newData: Partial<Student>
): string[] {
  const conflicts: string[] = [];

  // 기본 정보 비교
  if (existing.name !== newData.name) {
    conflicts.push(`성명: "${existing.name}" → "${newData.name}"`);
  }



  // 배열 데이터 비교 (개수만 비교)
  const existingGradesCount = existing.section6_academic_development?.length || 0;
  const newGradesCount = newData.section6_academic_development?.length || 0;
  if (existingGradesCount !== newGradesCount) {
    conflicts.push(`교과성적: ${existingGradesCount}개 → ${newGradesCount}개`);
  }

  const existingActivitiesCount = existing.section5_creative_activities?.length || 0;
  const newActivitiesCount = newData.section5_creative_activities?.length || 0;
  if (existingActivitiesCount !== newActivitiesCount) {
    conflicts.push(`창의적체험활동: ${existingActivitiesCount}개 → ${newActivitiesCount}개`);
  }

  const existingVolunteerCount = existing.volunteer_activities?.length || 0;
  const newVolunteerCount = newData.volunteer_activities?.length || 0;
  if (existingVolunteerCount !== newVolunteerCount) {
    conflicts.push(`봉사활동: ${existingVolunteerCount}개 → ${newVolunteerCount}개`);
  }

  const existingBehaviorCount = existing.section8_behavior_characteristics?.length || 0;
  const newBehaviorCount = newData.section8_behavior_characteristics?.length || 0;
  if (existingBehaviorCount !== newBehaviorCount) {
    conflicts.push(`행동특성: ${existingBehaviorCount}개 → ${newBehaviorCount}개`);
  }

  return conflicts;
}

/**
 * 두 학생 데이터 병합
 */
function mergeStudentData(
  existing: Partial<Student>,
  newData: Partial<Student>,
  strategy: MergeStrategy
): Partial<Student> {
  if (strategy === 'keep-existing') {
    return existing;
  }

  if (strategy === 'replace') {
    return {
      ...newData,
      uploadedAt: existing.uploadedAt, // 원래 업로드 시간 유지
      lastModified: new Date().toISOString()
    };
  }

  // 'merge' 전략: 더 완전한 데이터 선택
  return {
    studentNo: existing.studentNo,
    name: newData.name || existing.name,
    // schoolName, department, ipsiType, ipsiUnit removed

    // 배열 데이터는 더 많은 쪽 선택
    section6_academic_development:
      (newData.section6_academic_development?.length || 0) > (existing.section6_academic_development?.length || 0)
        ? newData.section6_academic_development
        : existing.section6_academic_development,

    section5_creative_activities:
      (newData.section5_creative_activities?.length || 0) >
        (existing.section5_creative_activities?.length || 0)
        ? newData.section5_creative_activities
        : existing.section5_creative_activities,

    volunteer_activities:
      (newData.volunteer_activities?.length || 0) >
        (existing.volunteer_activities?.length || 0)
        ? newData.volunteer_activities
        : existing.volunteer_activities,

    section8_behavior_characteristics:
      (newData.section8_behavior_characteristics?.length || 0) > (existing.section8_behavior_characteristics?.length || 0)
        ? newData.section8_behavior_characteristics
        : existing.section8_behavior_characteristics,

    section2_attendance:
      (newData.section2_attendance?.length || 0) >
        (existing.section2_attendance?.length || 0)
        ? newData.section2_attendance
        : existing.section2_attendance,

    uploadedAt: existing.uploadedAt,
    lastModified: new Date().toISOString()
  };
}

/**
 * 학생 데이터 목록 병합
 */
export function mergeStudentLists(
  existingStudents: Partial<Student>[],
  newStudents: Partial<Student>[],
  strategy: MergeStrategy = 'merge'
): MergeResult {
  const result: MergeResult = {
    merged: [...existingStudents],
    duplicates: [],
    added: 0,
    updated: 0,
    skipped: 0
  };

  // 기존 학생들을 맵으로 변환 (빠른 조회)
  const existingMap = new Map<string, Partial<Student>>();
  existingStudents.forEach((student) => {
    if (student.studentNo) {
      existingMap.set(student.studentNo, student);
    }
  });

  newStudents.forEach((newStudent) => {
    if (!newStudent.studentNo) {
      result.skipped++;
      return;
    }

    const existing = existingMap.get(newStudent.studentNo);

    if (!existing) {
      // 새로운 학생 추가
      result.merged.push({
        ...newStudent,
        uploadedAt: newStudent.uploadedAt || new Date().toISOString(),
        lastModified: new Date().toISOString()
      });
      result.added++;
    } else {
      // 중복 학생 처리
      const conflicts = findConflicts(existing, newStudent);

      if (conflicts.length > 0) {
        result.duplicates.push({
          studentNo: newStudent.studentNo,
          existingStudent: existing,
          newStudent: newStudent,
          conflicts
        });
      }

      if (strategy !== 'ask-user') {
        // 자동 병합
        const merged = mergeStudentData(existing, newStudent, strategy);
        const index = result.merged.findIndex((s) => s.studentNo === newStudent.studentNo);
        if (index !== -1) {
          result.merged[index] = merged;
          result.updated++;
        }
      } else {
        // 사용자에게 물어봐야 함
        result.skipped++;
      }
    }
  });

  return result;
}

/**
 * 중복 학생 해결 (사용자 선택 반영)
 */
export function resolveDuplicate(
  merged: Partial<Student>[],
  duplicate: DuplicateInfo,
  choice: 'keep-existing' | 'use-new' | 'merge'
): Partial<Student>[] {
  const index = merged.findIndex((s) => s.studentNo === duplicate.studentNo);

  if (index === -1) {
    return merged;
  }

  let resolved: Partial<Student>;

  switch (choice) {
    case 'keep-existing':
      resolved = duplicate.existingStudent;
      break;
    case 'use-new':
      resolved = {
        ...duplicate.newStudent,
        uploadedAt: duplicate.existingStudent.uploadedAt,
        lastModified: new Date().toISOString()
      };
      break;
    case 'merge':
      resolved = mergeStudentData(
        duplicate.existingStudent,
        duplicate.newStudent,
        'merge'
      );
      break;
  }

  const newMerged = [...merged];
  newMerged[index] = resolved;
  return newMerged;
}

/**
 * 수험번호 중복 검사
 */
export function findDuplicateExamNos(students: Partial<Student>[]): string[] {
  const studentNos = new Set<string>();
  const duplicates = new Set<string>();

  students.forEach((student) => {
    if (student.studentNo) {
      if (studentNos.has(student.studentNo)) {
        duplicates.add(student.studentNo);
      } else {
        studentNos.add(student.studentNo);
      }
    }
  });

  return Array.from(duplicates);
}

/**
 * 중복 제거 (첫 번째 항목만 유지)
 */
export function removeDuplicates(students: Partial<Student>[]): Partial<Student>[] {
  const seen = new Set<string>();
  const unique: Partial<Student>[] = [];

  students.forEach((student) => {
    if (student.studentNo && !seen.has(student.studentNo)) {
      seen.add(student.studentNo);
      unique.push(student);
    }
  });

  return unique;
}

/**
 * 데이터 완성도 비교 (어떤 데이터가 더 완전한지)
 */
export function compareCompleteness(
  student1: Partial<Student>,
  student2: Partial<Student>
): number {
  const score1 = calculateCompletenessScore(student1);
  const score2 = calculateCompletenessScore(student2);
  return score1 - score2; // 양수면 student1이 더 완전함
}

function calculateCompletenessScore(student: Partial<Student>): number {
  let score = 0;

  // 기본 정보 (각 1점)
  if (student.studentNo) score++;
  if (student.name) score++;
  // if (student.schoolName) score++;
  // if (student.department) score++;
  // if (student.ipsiType) score++;
  // if (student.ipsiUnit) score++;

  // 배열 데이터 (개수에 비례)
  score += (student.section6_academic_development?.length || 0) * 0.1;
  score += (student.section5_creative_activities?.length || 0) * 0.1;
  score += (student.volunteer_activities?.length || 0) * 0.1;
  score += (student.section8_behavior_characteristics?.length || 0) * 0.1;
  score += (student.section2_attendance?.length || 0) * 0.1;

  return score;
}
