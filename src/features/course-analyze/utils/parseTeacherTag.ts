/**
 * 교사 resource 태그 문자열 파싱.
 * - "N학년 부장" → { grade:N, classNum:null }  (학년 한정 — 그 학년 전체 반)
 * - "부장"(학년 없음, 예: 교무부장) → 전체 접근 (isFullAccess)
 * - "N학년 M반" → { grade:N, classNum:M }
 * - "N학년 담임" / "N학년" → { grade:N, classNum:null }
 * (useEvalogPermissions.parseTag / useRescueAccess HOMEROOM_TAG_PATTERN과 동일 규칙)
 *
 * 주의: "N학년 부장"은 "부장"을 부분 포함하므로, 학년 한정 판정을 일반 "부장"
 * 전체 접근보다 먼저 해야 한다.
 */
export interface ParsedTeacherTag {
  grade: number | null;
  classNum: number | null;
  isFullAccess: boolean;
}

const GRADE_HEAD_PATTERN = /^(\d+)학년\s*부장$/; // "2학년 부장" → 그 학년 한정

export function parseTeacherTag(tagName: string): ParsedTeacherTag {
  // 학년 부장: 그 학년 전체(반 무관) — 일반 "부장"보다 먼저 검사
  const gradeHead = tagName.match(GRADE_HEAD_PATTERN);
  if (gradeHead) {
    return { grade: parseInt(gradeHead[1], 10), classNum: null, isFullAccess: false };
  }
  // 학년 없는 부장(교무부장 등) → 전체 접근
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

export interface ManagedClass {
  grade: number;
  classNum: number;
}
