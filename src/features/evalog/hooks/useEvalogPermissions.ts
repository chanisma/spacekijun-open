import { useMemo } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUnifiedAuth } from '@/services/hooks/useUnifiedAuth';
import { useResourceTagAssignments } from '@/hooks/useResourceTags';
import { useEvalogTagPermissions } from './useEvalogTagPermissions';
import type { Student } from '../types';
import type { EvalogGranularPermissions, EvalogPermissionKey } from '../types/permissions';
import { EVALOG_PERMISSION_KEYS, mapSubjectGroupToPermissionKey } from '../types/permissions';

interface ParsedTag {
  grade: number | null;
  classNum: number | null;
  isFullAccess: boolean; // "부장" 등 전체 접근 태그
}

const GRADE_HEAD_PATTERN = /^(\d+)학년\s*부장$/; // "2학년 부장" → 그 학년 한정

/**
 * 태그 문자열을 파싱하여 학년/반 정보를 추출
 * - "2학년 3반" → { grade: 2, classNum: 3 }
 * - "2학년 담임" → { grade: 2, classNum: null }
 * - "2학년" → { grade: 2, classNum: null }
 * - "2학년 부장" → { grade: 2, classNum: null }  (학년 한정 — 그 학년 전체)
 * - "부장"(학년 없음, 예: 교무부장) → { isFullAccess: true }
 *
 * 주의: "N학년 부장"은 "부장"을 부분 포함하므로, 학년 한정 판정을 일반 "부장"
 * 전체 접근보다 먼저 해야 한다.
 */
function parseTag(tagName: string): ParsedTag {
  // 학년 부장: 그 학년 전체(반 무관) — 일반 "부장"보다 먼저 검사
  const gradeHead = tagName.match(GRADE_HEAD_PATTERN);
  if (gradeHead) {
    return { grade: parseInt(gradeHead[1], 10), classNum: null, isFullAccess: false };
  }

  // 학년 없는 "부장" 태그(교무부장 등)는 전체 접근
  if (tagName.includes('부장')) {
    return { grade: null, classNum: null, isFullAccess: true };
  }

  const gradeMatch = tagName.match(/(\d+)학년/);
  const classMatch = tagName.match(/(\d+)반/);

  if (!gradeMatch) {
    return { grade: null, classNum: null, isFullAccess: false };
  }

  const grade = parseInt(gradeMatch[1], 10);
  const classNum = classMatch ? parseInt(classMatch[1], 10) : null;

  return { grade, classNum, isFullAccess: false };
}

/**
 * 교사의 태그가 학생의 학년/반과 매칭되는지 확인
 */
function isTagMatchingStudent(
  parsedTags: ParsedTag[],
  studentGrade?: number,
  studentClassNum?: number
): boolean {
  if (!studentGrade) return false;

  return parsedTags.some(tag => {
    // 전체 접근 태그 (부장)
    if (tag.isFullAccess) return true;

    // 학년이 매칭되지 않으면 false
    if (tag.grade !== studentGrade) return false;

    // 반이 지정되지 않은 태그 (학년 전체 or 담임) → 학년만 매칭
    if (tag.classNum === null) return true;

    // 반까지 지정된 태그 → 학년+반 매칭
    return tag.classNum === studentClassNum;
  });
}

/**
 * Evalog 비교과 탭에 대한 태그 기반 권한을 확인하는 훅
 * - Admin → 전체 접근
 * - 태그 매칭 → 전체 접근
 * - 태그 미매칭 → 비교과(activities) 탭 블러 처리
 */
export function useEvalogPermissions(student: Student | null) {
  const { isAdmin } = useAuth();
  const { user } = useUnifiedAuth();

  const resourceId = user?.primaryResource?.id;
  const resourceIds = useMemo(
    () => (resourceId ? [resourceId] : []),
    [resourceId]
  );

  const { data: tagAssignments, isLoading: isTagsLoading } =
    useResourceTagAssignments(resourceIds);

  const { data: tagPermissions, isLoading: isPermLoading } =
    useEvalogTagPermissions();

  const isLoading = isTagsLoading || isPermLoading;

  // 태그-학년반 매칭 여부 (checkPermission 내부에서 사용)
  const canViewActivities = useMemo(() => {
    if (isAdmin) return true;
    if (!student) return true;
    if (isLoading || !tagAssignments) return false; // fail-closed: 로딩 중 접근 차단
    if (!resourceId) return false;

    const tags = tagAssignments.get(resourceId);
    if (!tags || tags.length === 0) return false;

    const parsedTags = tags.map(t => parseTag(t.name));
    return isTagMatchingStudent(parsedTags, student.grade, student.classNum);
  }, [isAdmin, student, isLoading, tagAssignments, resourceId]);

  // 사용자의 태그 ID 목록
  const userTagIds = useMemo(() => {
    if (!resourceId || !tagAssignments) return new Set<string>();
    const tags = tagAssignments.get(resourceId);
    if (!tags) return new Set<string>();
    return new Set(tags.map(t => t.id));
  }, [resourceId, tagAssignments]);

  /**
   * 특정 권한 키에 대해 접근 가능한지 확인
   * 1. Admin → true
   * 2. 태그-학년반 미매칭 → false
   * 3. 해당 영역에 DB 설정 없음 → true (하위 호환)
   * 4. DB 설정 있음 → 사용자 태그가 허용 목록에 있는지 확인
   */
  const checkPermission = useMemo(() => {
    return (key: EvalogPermissionKey): boolean => {
      if (isAdmin) return true;
      if (!student) return true;
      if (isLoading || !tagAssignments || !tagPermissions) return false; // fail-closed

      // 태그-학년반 미매칭이면 전체 블러
      if (!canViewActivities) return false;

      // 학년별 권한 체크: compositeKey = `${key}@${grade}`
      const studentGrade = student.grade;
      if (!studentGrade) return true; // 학년 정보 없으면 허용

      const compositeKey = `${key}@${studentGrade}`;
      const allowedTagIds = tagPermissions.get(compositeKey);

      // DB에 해당 영역+학년 설정이 없으면 → 모든 매칭 교사에게 공개
      if (!allowedTagIds || allowedTagIds.size === 0) return true;

      // DB 설정이 있으면 → 사용자 태그가 허용 목록에 있는지 확인
      for (const tagId of userTagIds) {
        if (allowedTagIds.has(tagId)) return true;
      }
      return false;
    };
  }, [isAdmin, student, isLoading, tagAssignments, tagPermissions, canViewActivities, userTagIds]);

  // 세분화 권한 객체
  const permissions: EvalogGranularPermissions = useMemo(() => ({
    attendance: checkPermission('attendance'),
    autonomy: checkPermission('autonomy'),
    club: checkPermission('club'),
    career_activity: checkPermission('career_activity'),
    volunteer: checkPermission('volunteer'),
    behavior: checkPermission('behavior'),
    canViewSeteuk: (subjectGroup: string) => {
      const key = mapSubjectGroupToPermissionKey(subjectGroup);
      return checkPermission(key);
    },
  }), [checkPermission]);

  return {
    permissions,
    isLoading,
  };
}
