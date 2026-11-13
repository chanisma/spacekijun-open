/**
 * 2026년 3학년 모의고사까지의 한시적 구조 처리.
 *
 * 3학년은 공통(subject='공통')에 국어·수학이 섞여 있고, 학생이 선택한
 * 선택과목(국어: 화법과작문/언어와매체, 수학: 미적분/확률과통계/기하)에
 * 대응되는 major_category로만 공통 행을 골라야 한다.
 *
 *  - 국어 트랙 공통 카테고리: 독서, 문학       (problem_number 1~34)
 *  - 수학 트랙 공통 카테고리: 수학Ⅰ, 수학Ⅱ    (problem_number 1~22)
 *  - 선택과목은 별도 행으로 저장 (problem_number 35~45 / 23~30)
 *
 * 2027학년도부터는 모든 학년이 통합형으로 전환 예정 → 이 모듈 전체 제거.
 * 제거 시: SUNSET_YEAR, KOREAN_*, MATH_* 상수와 resolveGrade3Split() 호출부
 * (현재 evalearnService.fetchMockProblems 한 곳)을 같이 정리.
 */

export const SUNSET_YEAR = 2026;

const KOREAN_ELECTIVE_LIST = ['화법과작문', '언어와매체'] as const;
const MATH_ELECTIVE_LIST = ['미적분', '확률과통계', '기하'] as const;

const KOREAN_ELECTIVES = new Set<string>(KOREAN_ELECTIVE_LIST);
const MATH_ELECTIVES = new Set<string>(MATH_ELECTIVE_LIST);

const KOREAN_COMMON_MAJORS = ['독서', '문학'] as const;
const MATH_COMMON_MAJORS = ['수학Ⅰ', '수학Ⅱ'] as const;

export interface Grade3Split {
  /** 선택과목 — mock_problems.subject 매칭값 (공백 없음 형태). */
  electiveSubject: string;
  /** subject='공통' 행 중 이 트랙으로 인정할 major_category 화이트리스트. */
  commonMajorCategories: readonly string[];
}

/**
 * 3학년 + SUNSET_YEAR 이하 + 분리 대상 선택과목일 때만 split 정보를 반환.
 * 그 외(다른 학년, 2027+ 시험, 영어/탐구 등)는 null → 호출자는 기존 단일 쿼리 사용.
 */
export function resolveGrade3Split(
  studentGrade: number,
  year: number,
  dbSubject: string
): Grade3Split | null {
  if (studentGrade !== 3 || year > SUNSET_YEAR) return null;

  if (KOREAN_ELECTIVES.has(dbSubject)) {
    return { electiveSubject: dbSubject, commonMajorCategories: KOREAN_COMMON_MAJORS };
  }
  if (MATH_ELECTIVES.has(dbSubject)) {
    return { electiveSubject: dbSubject, commonMajorCategories: MATH_COMMON_MAJORS };
  }
  return null;
}

/**
 * 3학년 mock_result.subjects에는 '국어'/'수학' 키 대신 학생이 선택한 선택과목 키
 * (화법과작문/언어와매체 또는 미적분/확률과통계/기하)만 존재한다. UI에서 '국어'/'수학'
 * 슬롯 등급을 표시하려 할 때 이 함수로 실제 룩업 키를 보정한다. 다른 과목(영어 등)
 * 또는 1·2학년/2027+에선 입력 그대로 반환.
 */
export function resolveCoreSubjectKey(
  studentGrade: number,
  year: number,
  coreSubject: string,
  subjectsMap: Record<string, unknown> | null | undefined
): string {
  if (!subjectsMap || studentGrade !== 3 || year > SUNSET_YEAR) return coreSubject;
  if (coreSubject === '국어') {
    return KOREAN_ELECTIVE_LIST.find((k) => k in subjectsMap) ?? coreSubject;
  }
  if (coreSubject === '수학') {
    return MATH_ELECTIVE_LIST.find((k) => k in subjectsMap) ?? coreSubject;
  }
  return coreSubject;
}
