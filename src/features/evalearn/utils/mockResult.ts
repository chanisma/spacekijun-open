/**
 * 모의고사 공식 성적(`student_basic_info.mock_result`) 판독 — **단일 출처**.
 *
 * 리로스쿨 성적 적재는 **미응시 과목을 `null` 이 아니라 `0` 으로 남긴다**
 * (2026-07 서시우 영어 = `{grade: 0, raw_score: 0, percentile: null}`).
 * 등급은 1~9 만 존재하므로 `0` 은 성적이 아니라 "응시하지 않음"이다.
 *
 * 이걸 `!= null` 로만 거르면 두 가지가 조용히 깨진다:
 *   1. 화면에 **"0등급"** 이라는 없는 등급이 찍힌다(시험 목록 배지에서 실제 발생)
 *   2. 전과목 평균 등급에 0 이 섞여 **실제보다 좋아 보인다**
 *      (서시우 2026-07: 실제 (4+7)/2 = 5.5 인데 (0+4+7)/3 = 3.67 로 표시)
 *   등급은 낮을수록 좋으므로 2번은 눈에 띄지 않게 학생을 과대평가한다.
 *
 * 라이브 실측(2026-09-03): grade=0 셀 20개(2026-07 11 · 2026-06 3 · 2026-05 3 · 2024-06 3).
 * grade=0 은 항상 raw_score=0 과 함께 나타난다(both_zero == grade_zero).
 */
import type { MockExamSubjectScore } from '@/features/evalog/types/student';

/** 유효한 석차등급 범위. 이 밖의 값(0 포함)은 성적이 아니다. */
export const MIN_EXAM_GRADE = 1;
export const MAX_EXAM_GRADE = 9;

export function isValidExamGrade(grade: number | null | undefined): grade is number {
  return (
    typeof grade === 'number' &&
    Number.isFinite(grade) &&
    grade >= MIN_EXAM_GRADE &&
    grade <= MAX_EXAM_GRADE
  );
}

/** 과목 성적에서 등급을 읽는다. 미응시(0)·결측은 null. */
export function getExamGrade(
  score: Pick<MockExamSubjectScore, 'grade'> | null | undefined
): number | null {
  return isValidExamGrade(score?.grade) ? (score!.grade as number) : null;
}

/**
 * 그 과목을 실제로 응시했는가.
 *
 * 판정은 **등급 유효성**으로 한다. `raw_score === 0` 은 진짜 0점일 수도 있어 단독으로는
 * 미응시 근거가 못 되지만, `grade === 0` 은 존재하지 않는 등급이라 결정적이다.
 */
export function hasTakenSubject(
  score: Pick<MockExamSubjectScore, 'grade'> | null | undefined
): boolean {
  return getExamGrade(score) !== null;
}

/**
 * ── 과목 키가 두 파일에서 다르게 온다 (2026-09-03 확인) ─────────────────────
 *
 * `mock_marking`(마킹표)과 `mock_result`(성적표)는 **다른 파일에서 적재**돼 과목 이름 표기가
 * 어긋난다. 화면은 마킹 키로 성적을 찾으므로, 어긋나면 **등급이 통째로 안 보인다**
 * (오류가 아니라 빈칸이라 아무도 눈치채지 못한다). 라이브 실측 3갈래:
 *
 *   가운뎃점     성적 `사회·문화`   ↔ 마킹 `사회문화`      331명
 *   로마/아라비아 성적 `생명과학1`   ↔ 마킹 `생명과학Ⅰ`    159명(생명·화학·지구·물리 합)
 *   통합과목 별칭 성적 `공통사회`·`통합사회`·`사회` ↔ 마킹 `사회탐구`   최대 632명
 *
 * 그래서 `subjects[key]` 로 바로 꺼내지 말고 **`findExamSubjectScore()`를 쓸 것**.
 */

/**
 * 표기 흔들림 제거: 가운뎃점·공백 삭제 + 로마숫자 -> 아라비아.
 *
 * 두 출처의 과목명을 **같은 것끼리 묶어야 하는 곳**(성적표 ↔ 마킹, 6월 ↔ 9월)에서
 * 비교 키로 쓴다. 이름을 화면에 보여줄 때 쓰는 값이 아니다.
 */
export function canonicalSubjectKey(subject: string): string {
  return subject
    .replace(/[·․‧∙・ㆍ]/g, '')
    .replace(/\s+/g, '')
    .replace(/Ⅰ/g, '1')
    .replace(/Ⅱ/g, '2')
    .replace(/Ⅲ/g, '3');
}

/**
 * 같은 것을 가리키는 이름 묶음. 1·2학년 통합과목은 성적표가 회차마다 다른 이름을 쓴다.
 * 정규화만으로는 못 잇는 경우라 명시적으로 적는다.
 */
const SUBJECT_SYNONYMS: string[][] = [
  ['사회탐구', '공통사회', '통합사회', '사회'],
  ['과학탐구', '공통과학', '통합과학', '과학'],
];

const SYNONYM_LOOKUP = new Map<string, string[]>();
for (const group of SUBJECT_SYNONYMS) {
  for (const name of group) SYNONYM_LOOKUP.set(canonicalSubjectKey(name), group);
}

/**
 * 마킹 과목 키로 성적표에서 그 과목 점수를 찾는다.
 *
 * 순서: 정확 일치 -> 표기 정규화 -> 통합과목 별칭.
 * 정확 일치를 맨 앞에 두어, 같은 학생에게 두 이름이 다 있으면 원래 이름이 이긴다.
 */
export function findExamSubjectScore<T>(
  subjects: Record<string, T> | null | undefined,
  markingKey: string
): T | undefined {
  if (!subjects) return undefined;
  if (markingKey in subjects) return subjects[markingKey];

  const target = canonicalSubjectKey(markingKey);
  const entries = Object.entries(subjects);

  for (const [key, value] of entries) {
    if (canonicalSubjectKey(key) === target) return value;
  }

  const group = SYNONYM_LOOKUP.get(target);
  if (group) {
    const canonicalGroup = new Set(group.map(canonicalSubjectKey));
    for (const [key, value] of entries) {
      if (canonicalGroup.has(canonicalSubjectKey(key))) return value;
    }
  }

  return undefined;
}

/**
 * 두 과목 이름이 같은 과목인가 — `findExamSubjectScore` 와 **같은 규칙**(표기 정규화 + 통합과목 별칭).
 * 마킹 키와 성적표 키를 합칠 때 같은 과목이 두 번 세어지지 않게 쓴다.
 */
export function isSameExamSubject(a: string, b: string): boolean {
  const ka = canonicalSubjectKey(a);
  const kb = canonicalSubjectKey(b);
  if (ka === kb) return true;
  const group = SYNONYM_LOOKUP.get(ka);
  return group != null && group.some((name) => canonicalSubjectKey(name) === kb);
}

/** 마킹 키로 성적표 등급을 읽는다(표기 흔들림 흡수 + 미응시 0 제거). */
export function findExamGrade(
  subjects: Record<string, Pick<MockExamSubjectScore, 'grade'>> | null | undefined,
  markingKey: string
): number | null {
  return getExamGrade(findExamSubjectScore(subjects, markingKey));
}

/** 응시한 과목들의 평균 등급. 응시 과목이 없으면 null. */
export function averageExamGrade(
  scores: Array<Pick<MockExamSubjectScore, 'grade'> | null | undefined>
): number | null {
  const grades = scores.map(getExamGrade).filter((g): g is number => g !== null);
  if (grades.length === 0) return null;
  return parseFloat((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2));
}
