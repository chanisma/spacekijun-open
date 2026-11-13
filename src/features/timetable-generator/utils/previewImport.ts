import { z } from 'zod';
import { buildConflictGraph } from '../algorithm/conflictGraph';
import { evaluateFull } from '../algorithm/score';
import { DEFAULT_OPTIONS, DEFAULT_WEIGHTS } from '../constants';
import type { Grade, Placement, TimetableCandidate, TimetableInput } from '../types';

interface PreviewPacket {
  title: string;
  capturedAt: string;
  input: Omit<TimetableInput, 'weights' | 'options'> & {
    options: Pick<TimetableInput['options'], 'hard' | 'maxPerSubjectPerDay' | 'maxPerTeacherPerDay' | 'maxConsecutivePerTeacher' | 'maxLastPeriodPerTeacher'>;
  };
  placements: Placement[];
  rosters: Record<string, string[]>;
  students: { id: string; name: string; grade: Grade; classNum: number }[];
}

const grade = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const id = z.string().min(1);
const placement = z.object({ lessonId: id, dayIndex: z.number().int().nonnegative(), period: z.number().int().positive() });
const lesson = z.object({
  id, offeringId: id, sourceOfferingIds: z.array(id).optional(), subjectName: id, grade,
  classLabel: z.string().nullable(), teacherId: id, teacherName: id, roomId: z.string().nullable(),
  studentCodes: z.array(id), category: z.enum(['major-korean', 'major-math', 'major-english', 'science', 'social', 'foreign', 'arts-pe', 'other']),
  isMajor: z.boolean(), isElective: z.boolean(), classKeys: z.array(id), blockedCells: z.array(z.string().regex(/^\d+\|\d+$/)),
});
const packet = z.object({
  format: z.literal('timetable-preview-v1'), title: id, capturedAt: z.string().datetime(),
  input: z.object({
    academicYear: z.number().int().min(2000).max(2200), semester: z.union([z.literal(1), z.literal(2)]),
    sourceBasis: z.literal('enrollment'), grades: z.array(grade).min(1),
    grid: z.object({ days: z.number().int().min(1).max(7), periodsPerDay: z.number().int().min(1).max(12) }),
    lessons: z.array(lesson).min(1).max(5000), fixedBlocks: z.array(z.never()).length(0), pinned: z.array(placement),
    options: z.object({
      hard: z.object({ teacherConflict: z.literal(true), studentConflict: z.literal(true), roomConflict: z.boolean(),
        subjectDailyCap: z.literal(true), teacherDailyCap: z.literal(true), teacherConsecutive: z.literal(true),
        teacherLastPeriodCap: z.literal(true), teacherSubjectConsecutive: z.literal(true) }),
      maxPerSubjectPerDay: z.number().int().positive(), maxPerTeacherPerDay: z.number().int().positive(),
      maxConsecutivePerTeacher: z.number().int().positive(), maxLastPeriodPerTeacher: z.number().int().nonnegative(),
    }),
  }),
  placements: z.array(placement).max(5000), rosters: z.record(z.array(id)),
  students: z.array(z.object({ id, name: id, grade, classNum: z.number().int().positive() })).max(10000),
});

/** File-only snapshot. No database, persistence, resectioning or finalization. */
export function parseTimetablePreview(text: string) {
  const parsed = packet.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('지원하는 검증 배치 파일이 아닙니다. 파일 형식과 필수 항목을 확인해 주세요.');
  // This repository disables strictNullChecks, which makes Zod infer required
  // fields as optional. The successful runtime schema check supplies this type.
  const data = parsed.data as PreviewPacket;
  const original: TimetableInput = {
    ...data.input, fixedBlocks: [], weights: { ...DEFAULT_WEIGHTS },
    options: { ...DEFAULT_OPTIONS, ...data.input.options },
  };
  const students = new Map(data.students.map(s => [s.id, s]));
  const ids = new Set(original.lessons.map(l => l.id));
  const placed = new Set(data.placements.map(p => p.lessonId));
  if (students.size !== data.students.length || ids.size !== original.lessons.length || placed.size !== ids.size ||
      data.placements.length !== ids.size || data.placements.some(p => !ids.has(p.lessonId) ||
        p.dayIndex >= original.grid.days || p.period > original.grid.periodsPerDay)) {
    throw new Error('학생·수업·배치에 중복, 누락 또는 범위 오류가 있습니다.');
  }
  const lessons = original.lessons.map(l => {
    if (!original.grades.includes(l.grade)) throw new Error('수업의 학년이 선택 학년에 포함되어 있지 않습니다.');
    const roster = data.rosters[l.offeringId];
    if (!roster || new Set(roster).size !== roster.length || (l.isElective && roster.length > 35)) {
      throw new Error('분반 명단이 누락되었거나 중복·정원 초과가 있습니다.');
    }
    if (!l.isElective && [...roster].sort().join('\n') !== [...l.studentCodes].sort().join('\n')) {
      throw new Error('공통수업 명단이 원본과 다릅니다.');
    }
    const counts: Record<string, number> = {};
    for (const code of roster) {
      const student = students.get(code);
      if (!student || student.grade !== l.grade) throw new Error('분반 명단의 학생 정보 또는 학년이 일치하지 않습니다.');
      const key = `${student.grade}-${student.classNum}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return { ...l, studentCodes: roster, studentCount: roster.length, studentCountByClass: counts,
      classKeys: roster.length ? Object.keys(counts).sort() : l.classKeys };
  });
  const curriculum = (items: typeof lessons | TimetableInput['lessons']) => {
    const counts = new Map<string, number>();
    for (const l of items) for (const student of l.studentCodes) {
      const key = JSON.stringify([student, l.grade, l.subjectName]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return JSON.stringify([...counts].sort(([a], [b]) => a.localeCompare(b)));
  };
  if (curriculum(original.lessons) !== curriculum(lessons)) throw new Error('학생별 수강 과목 또는 주당 시수가 원본과 다릅니다.');
  const input = { ...original, lessons };
  const graph = buildConflictGraph(lessons, { teacher: true, room: input.options.hard.roomConflict });
  const { score, metrics } = evaluateFull(data.placements, { input, graph });
  if (!metrics.hardFeasible || score.hard.some(h => h.count > 0)) throw new Error('배치에 공강·충돌·교사 부하 등 필수 제약 위반이 있습니다.');
  const candidate: TimetableCandidate = { id: 'local-preview', grades: input.grades, placements: data.placements,
    scoreBreakdown: score, metrics, createdAt: data.capturedAt };
  const enrolled = new Set(lessons.flatMap(l => l.studentCodes));
  return { title: data.title, capturedAt: data.capturedAt, original, input, candidate,
    studentDirectory: new Map([...students].filter(([key]) => enrolled.has(key))) };
}

export type TimetablePreview = ReturnType<typeof parseTimetablePreview>;
