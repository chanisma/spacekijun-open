/**
 * 방과후 수강 내역을 "언제 들었나"로 묶는 단일 출처.
 *
 * ## 학년·학년도는 유도된다
 * `afterschool_enrollments` 에는 학년도 컬럼이 없다. 대신 두 값이 있다.
 *  - `student_number` = **수강 당시** 학번(5자리, 첫 자리가 그때의 학년)
 *  - `student_id`     = 학적 코드 `YY-1CCNN`(앞 두 자리가 입학연도)
 * 따라서 `학년도 = 입학연도 + 학년 - 1`.
 * 라이브 전수 검증(2026-09-04): student_id 가 붙은 1,378행 **전부** `student_number`
 * 가 그 학생 `resource.meta.snum{학년}` 과 정확히 일치했다(불일치 0건). 즉 학번의
 * 첫 자리를 학년으로 읽는 것은 추정이 아니라 학교 기록과 맞물린 사실이다.
 *
 * ## 학기는 유도할 수 없다 — 지어내지 말 것
 * `cate_id` 는 리로스쿨 개설 카테고리 일련번호일 뿐 이름도 기간도 저장돼 있지 않고,
 * `collected_at` 은 수집 시각이라 2025학년도분이 2026-01-25 에 **1년치 통째로** 들어와
 * 학기 구분이 남아 있지 않다. 그래서 그룹은 **학년도·학년까지만** 나누고 학기를 추정해
 * 라벨로 적지 않는다(2026-09-04 사용자 결정). 학기 정보가 생기면 그때 한 축을 더한다.
 *
 * ## `- 복사` 는 강좌가 아니라 카테고리 복제 흔적이다
 * 리로스쿨에서 개설 카테고리를 통째로 복사하면 강좌명 뒤에 ` - 복사` 가 붙는다
 * (라이브 116행). 그중 114행은 같은 학생·같은 학년에 **접미사 없는 쌍**이 함께 있어
 * 같은 수강이 두 번 보인다. 접미사 있는 쪽을 버리고, 쌍이 없는 2행은 이름만 정리해
 * 남긴다. **접미사가 없는 같은 이름끼리는 합치지 않는다** — 그건 실제 재수강이다
 * (예: 2026학년도 2학년 `수학 심화반` 이 cate 47·53 두 차례).
 */

/** 그룹화에 필요한 최소 필드. `AfterSchoolEnrollment` 가 그대로 들어맞는다. */
export interface AfterschoolEnrollmentLike {
  id: string;
  student_id: string | null;
  student_number: string | null;
  course_name: string;
  cate_id: number;
}

export interface AfterschoolTerm {
  /** 입학연도 (2000 + 학적 코드 앞 두 자리) */
  admissionYear: number;
  /** 수강 당시 학년 (1~3) */
  grade: number;
  /** 수강 학년도 = admissionYear + grade - 1 */
  academicYear: number;
}

/** 한 학년 안에서 같은 강좌를 묶은 항목. */
export interface AfterschoolCourseEntry {
  /** 정규화된 강좌명 (`- 복사` 접미사 제거) */
  courseName: string;
  /** 이 학년에 등록된 횟수. 2 이상이면 실제 재수강 */
  times: number;
  /** 등록된 개설 카테고리들 (오름차순 = 시간순) */
  cateIds: number[];
  /** 원본 행 id들 (React key·추적용) */
  enrollmentIds: string[];
}

export interface AfterschoolTermGroup {
  /** `2026-2` 형식. 유도 실패분은 `unknown` */
  key: string;
  academicYear: number | null;
  grade: number | null;
  /** `2026학년도 · 2학년` / `학년 미상` */
  label: string;
  courses: AfterschoolCourseEntry[];
  /** 서로 다른 강좌 수 (= courses.length) */
  courseCount: number;
  /** 등록 건수 합계 (재수강 포함, 복제 흔적 제외) */
  enrollmentCount: number;
}

const COPY_SUFFIX = /\s*-\s*복사\s*$/;
const STUDENT_ID_PREFIX = /^(\d{2})-/;

/** `단원명 - 복사` 처럼 카테고리 복제로 붙은 접미사인가. */
export function hasCopySuffix(courseName: string): boolean {
  return COPY_SUFFIX.test(courseName);
}

/** 표시용 강좌명 — 복제 접미사를 떼고 공백을 정리한다. */
export function normalizeCourseName(courseName: string): string {
  return courseName.replace(COPY_SUFFIX, '').replace(/\s+/g, ' ').trim();
}

/**
 * 한 행에서 수강 학년도·학년을 유도한다. 학번이나 학적 코드가 규격에서 벗어나면 null.
 * (null 이면 화면은 "학년 미상" 그룹으로 보낸다 — 조용히 버리지 않는다.)
 */
export function deriveAfterschoolTerm(
  row: Pick<AfterschoolEnrollmentLike, 'student_id' | 'student_number'>,
): AfterschoolTerm | null {
  const idMatch = row.student_id?.match(STUDENT_ID_PREFIX);
  if (!idMatch) return null;

  const digits = row.student_number?.trim() ?? '';
  if (!/^\d{5}$/.test(digits)) return null;

  const grade = Number(digits[0]);
  if (grade < 1 || grade > 3) return null;

  const admissionYear = 2000 + Number(idMatch[1]);
  return { admissionYear, grade, academicYear: admissionYear + grade - 1 };
}

function groupLabel(term: AfterschoolTerm | null): string {
  if (!term) return '학년 미상';
  return `${term.academicYear}학년도 · ${term.grade}학년`;
}

/**
 * 수강 내역을 학년도·학년별로 묶는다. 최신 학년이 맨 위, "학년 미상"은 항상 맨 아래.
 * 그룹 안의 강좌는 처음 등록된 개설 차수(cate_id) 순.
 */
export function groupAfterschoolByTerm(
  rows: readonly AfterschoolEnrollmentLike[],
): AfterschoolTermGroup[] {
  const buckets = new Map<string, { term: AfterschoolTerm | null; rows: AfterschoolEnrollmentLike[] }>();

  for (const row of rows) {
    const term = deriveAfterschoolTerm(row);
    const key = term ? `${term.academicYear}-${term.grade}` : 'unknown';
    const bucket = buckets.get(key);
    if (bucket) bucket.rows.push(row);
    else buckets.set(key, { term, rows: [row] });
  }

  const groups: AfterschoolTermGroup[] = [];

  for (const [key, { term, rows: bucketRows }] of buckets) {
    // 1) 복제 흔적 제거 — 같은 그룹에 접미사 없는 쌍이 있는 `X - 복사` 만 버린다.
    const plainNames = new Set(
      bucketRows.filter((r) => !hasCopySuffix(r.course_name)).map((r) => normalizeCourseName(r.course_name)),
    );
    const kept = bucketRows.filter(
      (r) => !(hasCopySuffix(r.course_name) && plainNames.has(normalizeCourseName(r.course_name))),
    );

    // 2) 같은 강좌명끼리 합치되 횟수를 남긴다(재수강이 사라지지 않게).
    //    먼저 한 번 정렬해 둔다 — 그래야 cateIds·enrollmentIds 가 서로 대응하는 순서로
    //    쌓이고, 결과가 페치 순서에 흔들리지 않는다(React key 도 안정).
    const ordered = [...kept].sort(
      (a, b) => a.cate_id - b.cate_id || a.course_name.localeCompare(b.course_name, 'ko') || a.id.localeCompare(b.id),
    );
    const byCourse = new Map<string, AfterschoolCourseEntry>();
    for (const row of ordered) {
      const courseName = normalizeCourseName(row.course_name);
      const entry = byCourse.get(courseName);
      if (entry) {
        entry.times += 1;
        entry.cateIds.push(row.cate_id);
        entry.enrollmentIds.push(row.id);
      } else {
        byCourse.set(courseName, {
          courseName,
          times: 1,
          cateIds: [row.cate_id],
          enrollmentIds: [row.id],
        });
      }
    }

    const courses = [...byCourse.values()].sort(
      (a, b) => a.cateIds[0] - b.cateIds[0] || a.courseName.localeCompare(b.courseName, 'ko'),
    );

    groups.push({
      key,
      academicYear: term?.academicYear ?? null,
      grade: term?.grade ?? null,
      label: groupLabel(term),
      courses,
      courseCount: courses.length,
      enrollmentCount: kept.length,
    });
  }

  return groups.sort((a, b) => {
    if (a.academicYear === null) return 1;
    if (b.academicYear === null) return -1;
    return b.academicYear - a.academicYear || (b.grade ?? 0) - (a.grade ?? 0);
  });
}

/** 그룹 전체에서 서로 다른 강좌 수 — 요약 타일이 목록과 같은 수를 말하게 한다. */
export function totalAfterschoolCourseCount(groups: readonly AfterschoolTermGroup[]): number {
  return groups.reduce((sum, g) => sum + g.courseCount, 0);
}
