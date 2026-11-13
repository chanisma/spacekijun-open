/**
 * 정규화 시간표(teacher_timetable / student_timetable) 읽기 공용 유틸.
 *
 * 배경: 사용자 화면은 오랫동안 학기 개념이 없는 `resource.meta.section`(교사) /
 * `resource.meta.timetable`(학생) 스냅샷을 읽었다. 2026-07-28 부터 읽기는 학년도·학기
 * 키를 가진 정규화 테이블로 옮겼고(학사력 = `useTimetableTerm`), meta 는 다른 기능
 * (교사 CSV import, 회의 가능시간 검색, 시험 감독 보조 소스 등)을 위해 dual-write 로 남는다.
 *
 * 섹션명 파생이 이 파일의 핵심이다 — UI 가 보는 문자열이 바뀌지 않아야 하므로
 * `meta.section` 의 키 형식을 정확히 재현한다.
 */

/** teacher_timetable 한 행에서 파생 가능한 최소 필드 */
export interface TeacherTimetableSlotLike {
  subject_name: string;
  grade: number;
  class_label: string | null;
}

/**
 * `resource.meta.section` 의 키와 동일한 섹션명을 만든다.
 *
 * 형식: `"{과목명} {학년}-{분반}"` (예: `"공통수학1 1-3"`)
 *
 * 라이브 2026-1 실측으로 등가성이 확인됐다: 이 공식으로 만든 (교사, 섹션명) 387쌍이
 * `meta.section` 키 집합과 양방향 차이 0. 마이그레이션
 * 20260728010000_timetable_academic_term.sql 의 SQL 파생식과 반드시 같은 규칙을 유지해야 한다.
 *
 * 주의: `class_label` 에는 `"3학년 4반 한문"` 같은 비표준 값이 있다(CLAUDE.md 기재).
 * 그대로 이어붙이는 것이 정답이다 — `section` 테이블의 행 이름이 실제로 그 형태이기 때문.
 */
export function teacherSectionName(slot: TeacherTimetableSlotLike): string {
  return `${slot.subject_name} ${slot.grade}-${slot.class_label ?? ''}`;
}

/**
 * `class_label` 에서 반 번호를 뽑는다.
 *
 * 대부분은 `"4"` 같은 숫자 문자열이지만 `"3학년 4반 한문"` 형태가 라이브에 6슬롯 있다
 * (CLAUDE.md 기재). `section.meta->>'class'` 가 정본이고 이 함수는 **section 행이 없을 때의
 * 폴백**이다 — 2026-2 처럼 새 학기 분반이 아직 `section` 에 없으면 화면이 학년·반을
 * 통째로 잃어 수업 교체 후보 탐색이 불가능해지기 때문.
 */
export function classNumberFromLabel(classLabel: string | null | undefined): string | undefined {
  if (!classLabel) return undefined;
  const trimmed = classLabel.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(\d+)\s*반/);
  return match ? match[1] : undefined;
}

/**
 * 요일·교시를 구 `meta.section.time` 의 시간코드 문자열로 되돌린다.
 *
 * 예: (2, 2) → `"22"` (화요일 2교시). `TimetableEntry.weekday_time` 과 교체 수업의
 * 시간 키 매칭이 이 형식을 그대로 쓰기 때문에 유지가 필요하다.
 */
export function weekdayTimeCode(weekday: number, period: number): string {
  return `${weekday}${period}`;
}
