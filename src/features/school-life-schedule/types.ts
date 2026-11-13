export interface SchoolLifeClass { grade: number; class_num: number }
export interface SchoolLifeContext {
  user_id: string;
  role: string;
  academic_year: number;
  can_create: boolean;
  classes: SchoolLifeClass[];
}
export interface SchoolLifeEvent {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  date_only: boolean;
  visibility: 'personal' | 'homeroom' | 'assignment';
  course_offering_id?: string | null;
  course_offering?: AssignmentCourse | null;
  academic_year: number;
  grade: number | null;
  class_num: number | null;
  created_by: string;
}
export type SchoolLifeDraft = Omit<SchoolLifeEvent, 'id' | 'created_by' | 'course_offering'>;

export interface AssignmentCourse {
  id: string;
  academic_year: number;
  semester: number;
  grade: number | null;
  subject_name: string;
  class_label: string | null;
  classroom: string | null;
  teacher_name: string;
  is_enrolled?: boolean;
}

export function assignmentCourseLabel(course: AssignmentCourse): string {
  const classLabel = course.class_label
    ? `${course.grade}학년 ${course.class_label}`
    : course.classroom || '학급 미지정';
  return `${course.subject_name} · ${classLabel} · ${course.teacher_name || '담당 교사 미지정'}`;
}

export function assignmentCourseOptions(courses: AssignmentCourse[]) {
  return [...courses].sort((a, b) => Number(!!b.is_enrolled) - Number(!!a.is_enrolled)
    || assignmentCourseLabel(a).localeCompare(assignmentCourseLabel(b), 'ko', { numeric: true }))
    .map((course) => ({ value: course.id, label: assignmentCourseLabel(course),
      description: course.is_enrolled ? '내 수업' : '같은 학년 수업' }));
}

export function overlapsDay(event: Pick<SchoolLifeEvent, 'starts_at' | 'ends_at'>, date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return Date.parse(event.starts_at) < end.getTime() && Date.parse(event.ends_at) >= start.getTime();
}

export function validateSchoolLifeDraft(draft: SchoolLifeDraft, context: SchoolLifeContext): string | null {
  if (!context.can_create) return '일정을 추가할 권한이 없습니다.';
  if (!draft.title.trim() || draft.title.trim().length > 120) return '제목을 1~120자로 입력해 주세요.';
  if (draft.description.length > 4000) return '설명은 4,000자 이내로 입력해 주세요.';
  const start = Date.parse(draft.starts_at);
  const end = Date.parse(draft.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '종료 시각은 시작 시각 이후여야 합니다.';
  if (draft.visibility === 'homeroom' && draft.academic_year !== context.academic_year) return '현재 학년도의 학급 일정만 추가할 수 있습니다.';
  if (draft.visibility === 'homeroom' && !context.classes.some((c) => c.grade === draft.grade && c.class_num === draft.class_num)) return '소속 학급 또는 담당 학급을 선택해 주세요.';
  if (draft.visibility === 'personal' && (draft.grade !== null || draft.class_num !== null)) return '개인 일정에는 학급을 지정할 수 없습니다.';
  if (draft.visibility === 'assignment') {
    if (context.role !== 'student') return '학생만 과제일정을 추가할 수 있습니다.';
    if (!draft.course_offering_id) return '과목·학급·담당 교사를 선택해 주세요.';
    if (draft.grade !== null || draft.class_num !== null) return '과제일정의 대상은 선택한 수업으로 결정됩니다.';
  } else if (draft.course_offering_id) return '과제일정에만 수업을 지정할 수 있습니다.';
  if (!['personal', 'homeroom', 'assignment'].includes(draft.visibility)) return '공개 범위를 확인해 주세요.';
  return null;
}
