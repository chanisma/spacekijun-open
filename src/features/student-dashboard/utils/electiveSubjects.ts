/**
 * "인기 과목"에 넣을 수 있는 과목인가 — 진로선택과목 분석용 필터.
 *
 * 진로선택과목 기록(`academic_development` 의 `category='career'`)을 그대로 세면
 * 상위권이 통째로 **선택이 아닌 과목**으로 채워진다. 라이브 실측 상위 5개가
 * 음악 연주 447 · 미술 창작 447 · 스포츠 생활 447 · 체육 탐구 425 · 미술 감상과 비평 343 인데,
 * 447 은 사실상 전원이다. 전원이 듣는 과목은 "인기"가 아니라 편성이다.
 *
 * 세 가지를 뺀다:
 *  ① **예체능**(예술·체육) — 학생이 고른 결과가 아니라 학년 공통으로 배정되는 경우가 대부분
 *  ② **외국어**(영어 교과군 전체 + 제2외국어) — 위와 같은 이유. 한문은 외국어가 아니라 남긴다
 *  ③ **사실상 전원이 듣는 과목** — 비율이 임계 이상이면 선택의 의미가 없다
 *
 * ①②는 이름/교과군으로 판정하고 ③은 코호트 대비 비율로 판정한다. 셋 다 순수 함수라
 * 회귀로 못 박을 수 있다(`scripts/elective-subjects-test`).
 */

/** 예체능 교과군 — `subject_group` 원문 값 */
export const ARTS_PE_GROUPS = ['예술', '체육'] as const;

/** 영어 교과군 — 교과군 이름 전체가 외국어다 */
export const ENGLISH_GROUP = '영어';

/**
 * 제2외국어 과목명 키워드.
 *
 * 교과군이 `기술・가정/제2외국어/한문/교양` 처럼 **여러 영역이 묶여 있어** 교과군만으로는
 * 가를 수 없다(같은 군에 인공지능 기초·가정과학·프로그래밍이 함께 있다). 과목명으로 가른다.
 */
export const SECOND_LANGUAGE_KEYWORDS = [
  '중국어', '일본어', '독일어', '프랑스어', '스페인어', '러시아어', '아랍어', '베트남어',
] as const;

/**
 * "사실상 전원이 듣는다"의 경계.
 *
 * 100% 로 두면 결석·전입으로 한두 명이 빠진 과목이 그대로 통과한다(체육 탐구 425/447 = 95%).
 * 반대로 너무 낮추면 실제로 인기 있는 과목까지 지운다.
 */
export const UNIVERSAL_SUBJECT_RATIO = 0.9;

/** 표본이 이보다 작으면 비율 판정을 하지 않는다 — 몇 명 규모에서는 비율이 요동친다 */
export const MIN_COHORT_FOR_RATIO = 10;

export interface ElectiveSubjectEntry {
  subject: string;
  subjectGroup: string | null | undefined;
  /** 이 과목을 들은 학생 수 */
  count: number;
}

export function isArtsOrPeGroup(group: string | null | undefined): boolean {
  if (!group) return false;
  return (ARTS_PE_GROUPS as readonly string[]).includes(group);
}

export function isForeignLanguage(group: string | null | undefined, subject: string): boolean {
  if (group === ENGLISH_GROUP) return true;
  return SECOND_LANGUAGE_KEYWORDS.some((k) => subject.includes(k));
}

/**
 * 이 과목이 "학생의 선택"을 나타내는가 — 예체능·외국어 제외.
 * 수강 인원과 무관한 판정이라 코호트 크기를 몰라도 쓸 수 있다.
 */
export function isElectiveSignalSubject(group: string | null | undefined, subject: string): boolean {
  return !isArtsOrPeGroup(group) && !isForeignLanguage(group, subject);
}

/**
 * 인기 과목 후보만 남긴다.
 *
 * @param cohortSize 진로선택과목 기록이 하나라도 있는 학생 수(=비율의 분모)
 */
export function filterElectiveSubjects<T extends ElectiveSubjectEntry>(
  entries: T[],
  cohortSize: number
): T[] {
  const useRatio = cohortSize >= MIN_COHORT_FOR_RATIO;
  const cap = cohortSize * UNIVERSAL_SUBJECT_RATIO;
  return entries.filter((e) => {
    if (!isElectiveSignalSubject(e.subjectGroup, e.subject)) return false;
    if (useRatio && e.count >= cap) return false;
    return true;
  });
}
