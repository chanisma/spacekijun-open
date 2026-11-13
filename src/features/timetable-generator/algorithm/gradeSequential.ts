import type { Grade, Lesson, Placement, TimetableInput } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// 학년 순차 분해 (grade-sequential decomposition).
//
// 배경: 전 학년 통합 인스턴스(교차 교사 31/54명)는 교사 하드 4종과 함께면 예산 내
// 0위반을 못 찾는 경우가 많다(실측: 814 lessons standard에서 feasibleSeeds=0).
// 반면 **학년별 부분문제는 하드 4종 포함 실측 완전해가 존재·발견 가능**(g1 4.5s,
// g2·g3 각 ~120s). 학생은 학년 간 미공유이므로 학년 결합의 유일한 고리는 교차 교사다.
//
// 아이디어: 학년을 하나씩 풀고, 이미 배치된 학년의 "교차 교사 수업"을 다음 학년
// 부분문제에 **팬텀 pinned lesson**으로 주입한다. 팬텀은 명단이 비어 학생 간선이
// 없지만, 교사 간선(같은 칸 금지)과 교사 부하 상태(하루 상한·3연속·7교시·같은과목
// 인접)에는 실제 수업과 똑같이 접힌다(pinned fold 경로 재사용).
//
// 정합성: 학년 g_j를 풀 때 그 교사의 "g_j 수업 ∪ 앞서 배치된 모든 수업"이 함께
// 계수되므로, 모든 학년이 성공하면 합집합은 구성상 전역 하드-실현가능이다.
// ─────────────────────────────────────────────────────────────────────────────

/** 팬텀 lesson id 접두사 — 실 lesson id(`${offeringId}#k`)와 충돌하지 않는 형태 */
export const PHANTOM_PREFIX = 'phantom::';

export function isPhantomLessonId(id: string): boolean {
  return id.startsWith(PHANTOM_PREFIX);
}

/**
 * grade 부분문제 입력 구성: 그 학년 lesson + (이미 배치된 학년들에서) 이 학년에도
 * 수업이 있는 교사의 수업을 팬텀 pinned로 주입.
 */
export function buildGradeSubInput(
  input: TimetableInput,
  grade: Grade,
  solvedPlacements: Placement[],
  lessonById: Map<string, Lesson>,
): TimetableInput {
  const gradeLessons = input.lessons.filter((l) => l.grade === grade);
  const teachers = new Set<string>();
  for (const l of gradeLessons) if (l.teacherId) teachers.add(l.teacherId);

  const phantoms: Lesson[] = [];
  const phantomPinned: TimetableInput['pinned'] = [];
  for (const p of solvedPlacements) {
    const src = lessonById.get(p.lessonId);
    if (!src?.teacherId || !teachers.has(src.teacherId)) continue;
    const pid = `${PHANTOM_PREFIX}${p.lessonId}`;
    phantoms.push({
      ...src,
      id: pid,
      offeringId: `${PHANTOM_PREFIX}${src.offeringId}`,
      studentCodes: [],
      studentCount: 0,
      studentCountByClass: {},
      classKeys: [],
      blockedCells: [],
    });
    phantomPinned.push({ lessonId: pid, dayIndex: p.dayIndex, period: p.period });
  }

  const gradeIds = new Set(gradeLessons.map((l) => l.id));
  return {
    ...input,
    grades: [grade],
    lessons: [...gradeLessons, ...phantoms],
    pinned: [...input.pinned.filter((pn) => gradeIds.has(pn.lessonId)), ...phantomPinned],
  };
}

/** 어려운 학년(수업 수 많은 순) 먼저 — 제약이 덜 쌓인 상태에서 풀게 한다 */
export function orderGradesByDifficulty(input: TimetableInput): Grade[] {
  const count = new Map<Grade, number>();
  for (const l of input.lessons) count.set(l.grade, (count.get(l.grade) ?? 0) + 1);
  return [...input.grades].sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0));
}
