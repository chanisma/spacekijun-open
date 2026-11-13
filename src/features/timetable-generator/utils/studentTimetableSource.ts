import { isActivitySubject } from '../constants';
import type { EnrollmentRow, OfferingRow } from './buildInput';

export interface StudentSourceRow {
  resource_id: string | null;
  student_grade: number;
  student_class: number | null;
  student_no: number | null;
  student_name: string | null;
  day_of_week: number;
  period: number;
  subject: string;
  teacher_resource_id: string | null;
  teacher_name: string | null;
  course_offering_id: string | null;
}

export interface TeacherSourceRow {
  grade: number;
  day_of_week: number;
  period: number;
  subject_name: string;
  teacher_resource_id: string | null;
  course_offering_id: string | null;
}

const subjectKey = (s: string) => s.replace(/\s+/g, '');
const excluded = (s: string) => isActivitySubject(s) || s.includes('공동');
const slotKey = (grade: number, day: number, period: number, subject: string, teacher: string | null) =>
  JSON.stringify([grade, day, period, subjectKey(subject), teacher]);

/** The student's current timetable determines membership, hours and teacher split.
 * Enrollment is only a fallback for resolving a real offering ID for a course
 * already present in that timetable; it never adds a student's course. */
export function sourceFromStudentTimetable(
  originalOfferings: OfferingRow[], previousEnrollments: EnrollmentRow[],
  rows: StudentSourceRow[], teacherRows: TeacherSourceRow[],
) {
  if (!rows.length) throw new Error('해당 학기의 학생 시간표가 없습니다. 편성 기준을 확인해 주세요.');
  const originals = new Map(originalOfferings.map(o => [o.id, o]));
  const matches = (id: string, grade: number, subject: string) => {
    const o = originals.get(id);
    return o?.grade === grade && subjectKey(o.subject_name) === subjectKey(subject);
  };
  const teacherLinks = new Map<string, Set<string>>();
  for (const t of teacherRows) {
    if (!t.course_offering_id || !matches(t.course_offering_id, t.grade, t.subject_name)) continue;
    const key = slotKey(t.grade, t.day_of_week, t.period, t.subject_name, t.teacher_resource_id);
    const ids = teacherLinks.get(key) ?? new Set<string>();
    ids.add(t.course_offering_id);
    teacherLinks.set(key, ids);
  }
  const enrollmentLinks = new Map<string, Set<string>>();
  for (const e of previousEnrollments) {
    const o = originals.get(e.course_offering_id);
    if (!o || !e.student_resource_id) continue;
    const key = JSON.stringify([e.student_resource_id, o.grade, subjectKey(o.subject_name)]);
    const ids = enrollmentLinks.get(key) ?? new Set<string>();
    ids.add(o.id);
    enrollmentLinks.set(key, ids);
  }
  const courses = new Map<string, StudentSourceRow[]>();
  const occupied = new Set<string>();
  for (const row of rows) {
    if (excluded(row.subject)) continue;
    if (!row.resource_id || !Number.isInteger(row.day_of_week) || row.day_of_week < 1 || row.day_of_week > 5 ||
      !Number.isInteger(row.period) || row.period < 1 || row.period > 7 || !row.teacher_resource_id) {
      throw new Error(`학생 시간표 '${row.subject}'의 학생·교사·요일·교시 정보가 누락되거나 유효하지 않습니다.`);
    }
    const cell = JSON.stringify([row.resource_id, row.day_of_week, row.period]);
    if (occupied.has(cell)) throw new Error('현재 학생 시간표에 중복 수업이 있습니다. 입력 시간표를 먼저 정리해 주세요.');
    occupied.add(cell);
    const key = JSON.stringify([row.resource_id, row.student_grade, subjectKey(row.subject)]);
    const list = courses.get(key) ?? [];
    list.push(row);
    courses.set(key, list);
  }
  const groups = new Map<string, { slots: StudentSourceRow[]; students: StudentSourceRow[]; ids: Set<string> }>();
  for (const [courseKey, unsorted] of courses) {
    const slots = [...unsorted].sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period);
    const first = slots[0];
    const signature = JSON.stringify([first.student_grade, subjectKey(first.subject),
      slots.map(r => [r.day_of_week, r.period, r.teacher_resource_id])]);
    const group = groups.get(signature) ?? { slots, students: [], ids: new Set<string>() };
    group.students.push(first);
    for (const row of slots) {
      let ids: Set<string> | undefined;
      if (row.course_offering_id && matches(row.course_offering_id, row.student_grade, row.subject)) {
        ids = new Set([row.course_offering_id]);
      } else {
        ids = teacherLinks.get(slotKey(row.student_grade, row.day_of_week, row.period, row.subject, row.teacher_resource_id));
        if (!ids?.size) ids = enrollmentLinks.get(courseKey);
      }
      if (ids?.size !== 1) throw new Error(`'${row.subject}'의 원본 강좌를 하나로 식별할 수 없습니다. 강좌 연결을 확인해 주세요.`);
      for (const id of ids) group.ids.add(id);
    }
    groups.set(signature, group);
  }
  const offerings: OfferingRow[] = [];
  const enrollments: EnrollmentRow[] = [];
  const usedIds = new Set<string>();
  for (const group of groups.values()) {
    const first = group.slots[0];
    const ids = [...group.ids].sort();
    // Stable under day/period movement; real IDs remain separate for finalization.
    const id = `tt:${ids.join(',')}:${group.slots.length}`;
    if (usedIds.has(id)) throw new Error(`'${first.subject}'의 동일 강좌에 서로 다른 수업 패턴이 있습니다. 강좌 연결을 확인해 주세요.`);
    usedIds.add(id);
    const split = new Map<string, { teacher_resource_id: string; teacher_name: string | null; lessons: number }>();
    for (const row of group.slots) {
      const teacher = row.teacher_resource_id!;
      const entry = split.get(teacher) ?? { teacher_resource_id: teacher, teacher_name: row.teacher_name, lessons: 0 };
      entry.lessons++;
      split.set(teacher, entry);
    }
    const original = originals.get(ids[0])!;
    offerings.push({ ...original, id, sourceOfferingIds: ids, grade: first.student_grade,
      subject_name: first.subject.trim(), credits: group.slots.length,
      teacher_resource_id: first.teacher_resource_id, teacher_name: first.teacher_name,
      meta: { teacher_split: [...split.values()].sort((a, b) => a.teacher_resource_id.localeCompare(b.teacher_resource_id)) } });
    for (const student of group.students) enrollments.push({ course_offering_id: id,
      student_resource_id: student.resource_id, student_grade: student.student_grade,
      student_class: student.student_class, student_no: student.student_no, student_name: student.student_name });
  }
  return { offerings, enrollments, originalOfferings, basis: 'student-timetable' as const };
}
