/**
 * 유사도 분석의 **대조 대상 범위** 판정 — 같은 학년 학생만.
 *
 * ── 규칙 (2026-09-12 사용자 결정) ───────────────────────────────────────────
 * 유사도 분석은 **같은 학년 학생의 기록만** 대조한다. 이 기능이 답하려는 질문이
 * "교사가 같은 문장을 여러 학생에게 썼는가" 이고, 그 위험은 **같은 학년을 같은 시기에
 * 함께 쓸 때** 생긴다. 다른 학년·졸업생 기록까지 끌어오면 관계 없는 일치가 섞여 들어와
 * 정작 봐야 할 일치가 묻힌다.
 *
 * ── 학년을 어느 값으로 판정하는가 (전수 측정, 2026-09-12) ───────────────────
 * | 후보 | 결과 |
 * |---|---|
 * | `student_basic_info.grade` | 871행 중 **639행만** 값이 있다(나머지는 졸업생·자퇴생) |
 * | `student_no` 첫 자리 | **871행 전부** `^[1-3][0-9]{4}$` 이고 `grade` 와 **불일치 0건** |
 * | 학적 코드(`id`) 앞 두 자리 = 입학연도 | **전입생에서 틀린다** — `00-00645`(한선우)는 25학번이지만 3학년 |
 * | `student_no` 첫 자리만으로 필터 | **졸업생이 섞인다** — 23학번 231명의 `student_no` 가 `3` 으로 시작(작년 학반번이 그대로 남아 있다) |
 *
 * 그래서 **대상 학생의 학년은 `grade` → `student_no` 첫 자리** 순으로 판정하고(둘은
 * 충돌하지 않는다), **후보 명단은 `resource`(type='student' ∧ status='active')에서
 * 같은 학년을 가져온다**. 실측으로 `resource` 재학생 630명과 `student_basic_info.grade`
 * 는 **불일치 0건**이고, `resource` 쪽이 졸업생·자퇴생을 자동으로 뺀다
 * (`student_basic_info` 는 생기부 저장소라 그들을 계속 보관한다 — CLAUDE.md 의 규칙).
 *
 * **React·supabase 비의존.** 회귀 = `npx tsx scripts/evalog-similarity-cohort-test/run.mts`.
 */

/** 학년으로 인정하는 값. */
export type CohortGrade = 1 | 2 | 3;

const isCohortGrade = (value: unknown): value is CohortGrade =>
  value === 1 || value === 2 || value === 3;

/** 학년 판정에 필요한 최소 필드. 화면의 `Student`·DB 행 양쪽을 받는다. */
export interface GradeBearing {
  grade?: number | string | null;
  /** 현재 학반번 5자리(`30108` = 3학년 1반 8번). 첫 자리가 학년이다. */
  studentNo?: string | null;
}

/**
 * 학생의 **현재 학년**.
 *
 * `grade` 가 먼저다(정본). 없으면 `student_no` 첫 자리로 떨어진다 — 두 값은 실측에서
 * 충돌이 0건이고, `grade` 만 쓰면 값이 빈 행에서 학년을 통째로 잃는다.
 * **학적 코드(`studentId`)의 입학연도로는 유도하지 않는다** — 전입생에서 틀린다.
 */
export function resolveStudentGrade(student: GradeBearing | null | undefined): CohortGrade | null {
  if (!student) return null;

  const raw = student.grade;
  const asNumber = typeof raw === 'string' ? Number(raw.trim()) : raw;
  if (isCohortGrade(asNumber)) return asNumber;

  const no = String(student.studentNo ?? '').trim();
  if (/^[1-3]\d{4}$/.test(no)) {
    const digit = Number(no[0]);
    if (isCohortGrade(digit)) return digit;
  }
  return null;
}

/**
 * 같은 학년인가. 학년을 판정할 수 없는 쪽은 **대조에서 뺀다**(false).
 *
 * fail-closed 인 이유: 학년을 모르는 기록을 끼워 넣으면 그 일치가 다른 학년에서 온
 * 것인지 알 수 없고, 유사도 결과는 "이 문장을 다른 학생에게도 썼다"는 **판단 근거**로
 * 쓰이므로 출처가 불분명한 항목이 섞이면 안 된다.
 */
export function isSameGrade(
  a: GradeBearing | null | undefined,
  b: GradeBearing | null | undefined,
): boolean {
  const ga = resolveStudentGrade(a);
  const gb = resolveStudentGrade(b);
  return ga !== null && ga === gb;
}

/** 같은 학년 학생만 남긴다. 자기 자신은 호출부에서 따로 제외한다(id 필드가 화면마다 다르다). */
export function filterSameGrade<T extends GradeBearing>(
  students: T[],
  grade: CohortGrade | null,
): T[] {
  if (grade === null) return [];
  return students.filter((s) => resolveStudentGrade(s) === grade);
}

/**
 * PostgREST 한 요청의 행 상한.
 *
 * **이 상한은 오류가 아니라 부분 결과로 온다** — 넘기면 조용히 잘린다(CLAUDE.md 의
 * 반복 사고). 같은 학년으로 좁혀도 3학년은 세특 **7,021행**·창체 **1,953행**이라
 * 한 번에 받을 수 없으므로 반드시 페이징한다.
 */
export const SIMILARITY_PAGE_SIZE = 1000;

/**
 * 페이징 구간 목록. `total` 을 미리 알 때 쓴다(`count: 'exact'`).
 * 0행이면 빈 배열 — 요청을 한 번도 보내지 않는다.
 */
export function pageRanges(total: number, pageSize = SIMILARITY_PAGE_SIZE): [number, number][] {
  if (!Number.isFinite(total) || total <= 0) return [];
  const ranges: [number, number][] = [];
  for (let from = 0; from < total; from += pageSize) {
    ranges.push([from, Math.min(from + pageSize, total) - 1]);
  }
  return ranges;
}
