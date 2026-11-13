import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignmentCourseLabel, assignmentCourseOptions, overlapsDay, validateSchoolLifeDraft, type AssignmentCourse, type SchoolLifeContext, type SchoolLifeDraft } from '../types';

const context: SchoolLifeContext = { user_id: 'student-a', role: 'student', academic_year: 2026, can_create: true, classes: [{ grade: 1, class_num: 1 }] };
const draft: SchoolLifeDraft = { title: '학급 준비물', description: '', visibility: 'homeroom', academic_year: 2026, grade: 1, class_num: 1, starts_at: '2026-09-09T09:00:00+09:00', ends_at: '2026-09-09T10:00:00+09:00', date_only: false };

test('과제일정은 학생이 수업 하나를 지정해야 하며 개인·학급 일정에는 수업을 지정하지 않는다', () => {
  const assignment: SchoolLifeDraft = { ...draft, visibility: 'assignment', grade: null, class_num: null, course_offering_id: 'course-a' };
  assert.equal(validateSchoolLifeDraft(assignment, context), null);
  assert.notEqual(validateSchoolLifeDraft({ ...assignment, course_offering_id: null }, context), null);
  assert.notEqual(validateSchoolLifeDraft(assignment, { ...context, role: 'teacher' }), null);
  assert.notEqual(validateSchoolLifeDraft({ ...assignment, grade: 1 }, context), null);
  assert.notEqual(validateSchoolLifeDraft({ ...draft, course_offering_id: 'course-a' }, context), null);
});

test('과목·학급·교사를 구분하고 내 수업을 먼저 표시하며 선택 값은 수업 ID를 사용한다', () => {
  const course: AssignmentCourse = { id: 'a', academic_year: 2026, semester: 2, grade: 1,
    subject_name: '수학', class_label: '1반', classroom: null, teacher_name: '김교사' };
  const otherTeacher = { ...course, id: 'b', teacher_name: '이교사', is_enrolled: true };
  const otherClass = { ...course, id: 'c', class_label: '2반' };
  const options = assignmentCourseOptions([course, otherClass, otherTeacher]);
  assert.equal(options[0].value, 'b');
  assert.equal(options[0].description, '내 수업');
  assert.equal(new Set(options.map((item) => item.label)).size, 3);
  assert.equal(assignmentCourseLabel(course), '수학 · 1학년 1반 · 김교사');
  assert.equal(assignmentCourseLabel({ ...course, class_label: null, classroom: '1학년 A반' }), '수학 · 1학년 A반 · 김교사');
});

test('소속 학급 일정과 본인 개인 일정만 유효하다', () => {
  assert.equal(validateSchoolLifeDraft(draft, context), null);
  assert.notEqual(validateSchoolLifeDraft({ ...draft, class_num: 2 }, context), null);
  assert.equal(validateSchoolLifeDraft({ ...draft, visibility: 'personal', grade: null, class_num: null }, context), null);
  assert.notEqual(validateSchoolLifeDraft({ ...draft, visibility: 'personal' }, context), null);
});
test('담임은 부여된 여러 학급만 선택할 수 있다', () => {
  const teacher = { ...context, role: 'teacher', classes: [{ grade: 1, class_num: 1 }, { grade: 2, class_num: 3 }] };
  assert.equal(validateSchoolLifeDraft({ ...draft, grade: 2, class_num: 3 }, teacher), null);
  assert.notEqual(validateSchoolLifeDraft({ ...draft, grade: 2, class_num: 4 }, teacher), null);
});
test('학급 정보가 없어도 개인 일정은 가능하며 학급 일정은 불가하다', () => {
  const noClass = { ...context, classes: [] };
  assert.notEqual(validateSchoolLifeDraft(draft, noClass), null);
  assert.equal(validateSchoolLifeDraft({ ...draft, visibility: 'personal', grade: null, class_num: null }, noClass), null);
});
test('빈 제목·역전 시간·잘못된 날짜·이전 학년도·권한 없음을 거부한다', () => {
  for (const invalid of [{ ...draft, title: '  ' }, { ...draft, title: 'x'.repeat(121) }, { ...draft, ends_at: '2026-09-08' },
    { ...draft, starts_at: 'invalid' }, { ...draft, academic_year: 2025 }, { ...draft, description: 'x'.repeat(4001) }]) {
    assert.notEqual(validateSchoolLifeDraft(invalid, context), null);
  }
  assert.notEqual(validateSchoolLifeDraft(draft, { ...context, can_create: false }), null);
});
test('여러 날에 걸친 일정은 중간 날짜와 겹치고 범위 밖에는 나타나지 않는다', () => {
  const event = { starts_at: new Date(2026, 8, 8, 9).toISOString(), ends_at: new Date(2026, 8, 10, 18).toISOString() };
  assert.equal(overlapsDay(event, new Date(2026, 8, 9)), true);
  assert.equal(overlapsDay(event, new Date(2026, 8, 10)), true);
  assert.equal(overlapsDay(event, new Date(2026, 8, 11)), false);
  assert.equal(overlapsDay(event, new Date(2026, 8, 7)), false);
});
