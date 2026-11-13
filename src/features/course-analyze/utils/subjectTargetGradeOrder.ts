/**
 * 과목별 선택 탭 — 한 학년이 여러 학년 과목을 고를 때(1학년 → 2·3학년 과목)의 표시 순서.
 *
 * 입력은 이미 "과목군 → 과목명" 순으로 정렬돼 온다(dataProcessor.calculateSubjectCounts).
 * 그 과목군 순서는 그대로 두고, 과목군 안에서만 "대상 학년 → 원래 순서(과목명)" 로 다시 세운다.
 * 대상 학년을 모르는 과목은 그 과목군의 맨 뒤로 보낸다(숨기지 않는다).
 */
import { normalizeSubjectName } from './subjectUtils';

export interface CategorizedSubject {
  subjectName: string;
  category: string;
}

/** subject → 대상 학년. 표기 차이('경제 수학'≡'경제수학')를 무시하고 찾는다. */
export function makeTargetGradeLookup(map: Record<string, number>) {
  const normalized = new Map<string, number>();
  for (const [name, grade] of Object.entries(map)) normalized.set(normalizeSubjectName(name), grade);
  return (subjectName: string): number | undefined =>
    map[subjectName] ?? normalized.get(normalizeSubjectName(subjectName));
}

export function orderByCategoryThenTargetGrade<T extends CategorizedSubject>(
  items: readonly T[],
  targetGradeOf: (subjectName: string) => number | undefined,
): T[] {
  const categoryRank = new Map<string, number>();
  items.forEach((item) => {
    if (!categoryRank.has(item.category)) categoryRank.set(item.category, categoryRank.size);
  });
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const byCategory = categoryRank.get(a.item.category)! - categoryRank.get(b.item.category)!;
      if (byCategory !== 0) return byCategory;
      const ga = targetGradeOf(a.item.subjectName) ?? Number.MAX_SAFE_INTEGER;
      const gb = targetGradeOf(b.item.subjectName) ?? Number.MAX_SAFE_INTEGER;
      if (ga !== gb) return ga - gb;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
