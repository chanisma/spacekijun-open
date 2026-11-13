import type { ExamSubject, Grade, SubjectCategory } from '../types';
import { categorizeSubject } from '../constants';

export function buildExamSubject(
  raw: { name: string; studentCodes: string[]; isUniversal: boolean },
  grade: Grade,
): ExamSubject {
  const category = categorizeSubject(raw.name);
  // 주요교과 여부는 과목명/분류로 자동 선택하지 않고 사용자가 직접 지정한다.
  const isMajor = false;
  return {
    id: subjectId(grade, raw.name),
    grade,
    name: raw.name,
    scope: raw.isUniversal ? 'all' : 'elective',
    studentCodes: raw.studentCodes,
    studentCount: raw.studentCodes.length,
    category,
    isMajor,
  };
}

export function subjectId(grade: Grade, subjectName: string): string {
  return `g${grade}-${subjectName}`;
}

export function categoryLabel(c: SubjectCategory): string {
  switch (c) {
    case 'major-korean':
      return '국어';
    case 'major-math':
      return '수학';
    case 'major-english':
      return '영어';
    case 'science':
      return '과학';
    case 'social':
      return '사회';
    case 'foreign':
      return '제2외국어/한문';
    case 'arts-pe':
      return '예체능';
    case 'other':
      return '기타';
  }
}
