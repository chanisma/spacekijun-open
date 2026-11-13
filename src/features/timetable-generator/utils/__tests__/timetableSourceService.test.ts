import assert from 'node:assert/strict';

declare const test: (name: string, run: () => Promise<void>) => void;
declare const jest: { mock: (path: string, factory: () => unknown) => void };

const tables: Record<string, Record<string, unknown>[]> = {};
const reads: string[] = [];
jest.mock('@/integrations/supabase/client', () => ({ supabase: {
  from(table: string) {
    reads.push(table);
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let start = 0, end = Number.POSITIVE_INFINITY;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.order = () => q;
    q.eq = (key: string, value: unknown) => { filters.push(r => r[key] === value); return q; };
    q.in = (key: string, values: unknown[]) => { filters.push(r => values.includes(r[key])); return q; };
    q.range = (a: number, b: number) => { start = a; end = b; return q; };
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({
      data: (tables[table] ?? []).filter(r => filters.every(f => f(r))).slice(start, end + 1), error: null,
    }));
    return q;
  },
} }));

function reset() {
  reads.length = 0;
  const offering = { id: 'course', academic_year: 2026, semester: 2, grade: 2,
    subject_name: '주제 탐구 독서', credits: 3, class_label: '1반', teacher_resource_id: 'teacher', teacher_name: 'teacher' };
  tables.course_offering = [offering];
  tables.student_enrollment = [{ academic_year: 2026, semester: 2, course_offering_id: 'course',
    student_resource_id: 'extra', student_grade: 2, student_class: '1반', student_no: 1, student_name: 'extra' }];
  tables.student_timetable = Array.from({ length: 1001 }, (_, i) => ({ id: `r${i}`, academic_year: 2026, semester: 2,
    resource_id: `s${i}`, student_grade: 2, student_class: 1, student_no: i, student_name: `s${i}`,
    day_of_week: 1, period: 1, subject: offering.subject_name, teacher_resource_id: 'teacher', teacher_name: 'teacher', course_offering_id: null }));
  // Another term must not leak into the selected semester.
  tables.student_timetable.push({ ...tables.student_timetable[0], id: 'old', resource_id: 'old', semester: 1 });
  tables.teacher_timetable = [{ academic_year: 2026, semester: 2, grade: 2, day_of_week: 1, period: 1,
    subject_name: offering.subject_name, teacher_resource_id: 'teacher', course_offering_id: 'course' }];
}

test('구 시간표 기준 저장본의 복원은 선택 학기의 학생 시간표를 1000행 이후까지 읽는다', async () => {
  reset();
  const { fetchTimetableSourceData } = await import('../../services/timetablePlanService');
  const result = await fetchTimetableSourceData(2026, 2, [2], 'student-timetable');
  assert.equal(result.basis, 'student-timetable');
  assert.equal(result.enrollments.length, 1001);
  assert(result.enrollments.every(e => e.student_resource_id !== 'extra' && e.student_resource_id !== 'old'));
  assert.equal(result.offerings[0].credits, 1);
  assert.equal(reads.filter(t => t === 'student_timetable').length, 2);
});

test('기본 생성은 수강 명단을 유지하며 운영 시간표에 없는 과목도 임의로 제외하지 않는다', async () => {
  reset();
  const { fetchTimetableSourceData } = await import('../../services/timetablePlanService');
  const result = await fetchTimetableSourceData(2026, 2, [2]);
  assert.equal(result.basis, 'enrollment');
  assert.deepEqual(result.enrollments.map(e => e.student_resource_id), ['extra']);
  assert(!reads.includes('student_timetable'));
});
