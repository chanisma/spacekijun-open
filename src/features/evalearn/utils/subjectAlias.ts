/**
 * 마킹 과목명 -> `mock_problems.subject` 변환.
 *
 * 종전엔 `hooks/useMockData` 안에 있었는데, 서비스 계층(referenceGradeService)에서도 필요해
 * 유틸로 뺐다 — 서비스가 훅을 import 하면 의존 방향이 뒤집히고 순환이 생긴다.
 */

/** 마킹은 묶음 이름(사회탐구)으로 오는데 문항 표는 실제 과목명(통합사회)으로 들어 있다 */
export const SUBJECT_ALIAS: Record<string, string> = {
  '과학탐구': '통합과학',
  '사회탐구': '통합사회',
};

export function toDbSubject(subject: string): string {
  if (SUBJECT_ALIAS[subject]) return SUBJECT_ALIAS[subject];
  return subject
    .replace(/Ⅰ/g, '1')
    .replace(/Ⅱ/g, '2')
    .replace(/Ⅲ/g, '3');
}
