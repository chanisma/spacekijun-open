import { buildConflictGraph } from '../algorithm/conflictGraph';
import { evaluateFull } from '../algorithm/score';
import { sectionStudents } from '../algorithm/sectioning';
import { HARD_CONSTRAINT_LABELS, TEACHER_HARD_TIER1_IDS } from '../constants';
import type { TimetableSourceData } from '../services/timetablePlanService';
import type { Lesson, Placement, SavedTimetablePlan } from '../types';
import { buildTimetableInput } from './buildInput';
import { lessonsWithSectioning } from './sectioningReport';
import { candidateLessons } from './candidateRoster';

export interface ExpandedRows {
  studentRows: Record<string, unknown>[];
  teacherRows: Record<string, unknown>[];
}

/** 저장된 제약·교사 배분을 유지하고 최신 원본에서 명단과 실제 강좌 ID만 복원한다. */
export function restorePlanLessons(plan: SavedTimetablePlan, source: TimetableSourceData): Lesson[] {
  const input = plan.input_payload;
  if (input.sourceBasis && input.sourceBasis !== (source.basis ?? 'enrollment')) {
    throw new Error('저장된 시간표의 편성 기준과 불러온 원본이 다릅니다. 같은 기준으로 다시 불러와 주세요.');
  }
  if (input.academicYear !== plan.academic_year || input.semester !== plan.semester) {
    throw new Error('저장된 시간표와 생성 입력의 학년도·학기가 다릅니다. 시간표를 다시 생성해 주세요.');
  }
  const rebuilt = buildTimetableInput(source.offerings, source.enrollments, {
    academicYear: plan.academic_year,
    semester: plan.semester,
    grades: input.grades,
    options: input.options,
  });
  const byId = new Map(rebuilt.lessons.map((l) => [l.id, l]));
  if (byId.size !== input.lessons.length || input.lessons.some((l) => !byId.has(l.id))) {
    throw new Error('저장 이후 개설 강좌 또는 시수가 변경되었습니다. 시간표를 다시 생성해 주세요.');
  }
  if (plan.candidates?.some(c => c.sectionRoster) && input.lessons.some(l => byId.get(l.id)!.teacherId !== l.teacherId)) {
    throw new Error('저장 이후 교사 배정이 변경되었습니다. 시간표를 다시 생성해 주세요.');
  }
  return input.lessons.map((l) => ({
    ...l,
    sourceOfferingIds: byId.get(l.id)!.sourceOfferingIds,
    studentCodes: byId.get(l.id)!.studentCodes,
    studentCount: byId.get(l.id)!.studentCount,
    studentCountByClass: byId.get(l.id)!.studentCountByClass,
  }));
}

/** 모든 행을 메모리에서 검증·생성한 후에만 DB 쓰기를 허용한다. */
export function prepareTimetableFinalization(
  plan: SavedTimetablePlan,
  placements: Placement[],
  source: TimetableSourceData,
): ExpandedRows {
  const restored = restorePlanLessons(plan, source);
  const exactCandidate = plan.candidates?.find(c => c.sectionRoster && c.placements.length === placements.length &&
    c.placements.every(p => placements.some(q => q.lessonId === p.lessonId && q.dayIndex === p.dayIndex && q.period === p.period)));
  if (!exactCandidate && plan.candidates?.every(c => c.sectionRoster) && plan.candidates.length > 0) {
    throw new Error('검증된 분반 명단에 대응하는 배치를 찾을 수 없습니다. 후보를 다시 저장해 주세요.');
  }
  const sec = exactCandidate ? null : sectionStudents(restored, placements);
  if (sec && sec.capacityOverflow > 0) {
    throw new Error(`확정할 수 없습니다: 분반 정원 초과 ${sec.capacityOverflow}개 분반. 수강 명단과 분반 배정을 확인해 주세요.`);
  }
  const lessons = exactCandidate ? candidateLessons({ ...plan.input_payload, lessons: restored }, exactCandidate) : lessonsWithSectioning(restored, sec!);
  const input = { ...plan.input_payload, lessons };
  // 확정 시간표는 학생·교사 동시수업을 항상 금지한다. 부하 위반은 기존 정책대로 허용.
  input.options = { ...input.options, hard: { ...input.options.hard, teacherConflict: true } };
  const graph = buildConflictGraph(lessons, { teacher: true, room: input.options.hard.roomConflict });
  const { score } = evaluateFull(placements, { input, graph });
  const violations = score.hard.filter((h) => h.count > 0 && !TEACHER_HARD_TIER1_IDS.has(h.id));
  if (lessons.length === 0 || violations.length > 0) {
    throw new Error(`확정할 수 없습니다: ${violations.map((h) => `${HARD_CONSTRAINT_LABELS[h.id] ?? h.id} ${h.count}건`).join(', ') || '배치할 수업이 없습니다'}`);
  }

  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const offeringById = new Map((source.originalOfferings ?? source.offerings).map((o) => [o.id, o]));
  const studentById = new Map(source.enrollments.filter((e) => e.student_resource_id).map((e) => [e.student_resource_id!, e]));
  const studentRows: Record<string, unknown>[] = [];
  const teacherRows: Record<string, unknown>[] = [];
  for (const p of placements) {
    const l = lessonById.get(p.lessonId)!;
    const originals = (l.sourceOfferingIds ?? []).map((id) => offeringById.get(id)).filter((o) => o != null);
    const off = originals.find((o) => o.teacher_resource_id === l.teacherId) ?? originals[0];
    if (!off) throw new Error(`수업 '${l.subjectName}'의 원본 강좌를 찾을 수 없습니다.`);
    const common = {
      academic_year: plan.academic_year, semester: plan.semester,
      day_of_week: p.dayIndex + 1, period: p.period,
      teacher_name: l.teacherName, teacher_resource_id: l.teacherId,
      course_offering_id: off.id,
      meta: { source: 'timetable-generator', plan_id: plan.id },
    };
    teacherRows.push({
      ...common, grade: l.grade, subject_name: l.subjectName,
      class_label: l.classLabel, activity_type: 'subject', credits: off.credits,
    });
    for (const code of new Set(l.studentCodes)) {
      const e = studentById.get(code);
      if (!e) throw new Error(`수업 '${l.subjectName}'의 학생 명단을 복원할 수 없습니다.`);
      const label = String(e.student_class ?? '');
      const match = label.match(/(\d+)\s*반/) ?? label.match(/^(\d+)$/);
      studentRows.push({
        ...common, resource_id: code, student_grade: e.student_grade,
        student_class: match ? Number(match[1]) : null,
        student_no: e.student_no, student_name: e.student_name, subject: l.subjectName,
      });
    }
  }
  return { studentRows, teacherRows };
}
