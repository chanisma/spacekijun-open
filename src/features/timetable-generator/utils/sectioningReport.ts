import { sectionStudents, type SectioningResult } from '../algorithm/sectioning';
import type {
  Lesson,
  Placement,
  SectioningDiagnostics,
  SectioningOfferingRow,
  SectioningRoundReport,
} from '../types';

function electiveRosterCounts(lessons: Lesson[]): Map<string, { subjectName: string; classLabel: string | null; count: number }> {
  const m = new Map<string, { subjectName: string; classLabel: string | null; count: number }>();
  for (const l of lessons) {
    if (!l.isElective) continue;
    if (!m.has(l.offeringId)) {
      m.set(l.offeringId, { subjectName: l.subjectName, classLabel: l.classLabel, count: l.studentCodes.length });
    }
  }
  return m;
}

/** sectioning 결과로 선택과목 lesson 로스터를 갱신한다. */
export function lessonsWithSectioning(lessons: Lesson[], sec: SectioningResult): Lesson[] {
  const byOff = new Map<string, string[]>();
  for (const [code, m] of sec.assignment) for (const off of m.values()) {
    (byOff.get(off) ?? byOff.set(off, []).get(off)!).push(code);
  }
  return lessons.map((l) => {
    if (!l.isElective) return l;
    const codes = byOff.get(l.offeringId) ?? [];
    return { ...l, studentCodes: codes, studentCount: codes.length };
  });
}

export function buildOfferingRosterRows(beforeLessons: Lesson[], afterLessons: Lesson[]): SectioningOfferingRow[] {
  const before = electiveRosterCounts(beforeLessons);
  const after = electiveRosterCounts(afterLessons);
  const ids = new Set([...before.keys(), ...after.keys()]);
  const rows: SectioningOfferingRow[] = [];
  for (const offeringId of ids) {
    const b = before.get(offeringId);
    const a = after.get(offeringId);
    rows.push({
      offeringId,
      subjectName: a?.subjectName ?? b?.subjectName ?? offeringId,
      classLabel: a?.classLabel ?? b?.classLabel ?? null,
      beforeCount: b?.count ?? 0,
      afterCount: a?.count ?? 0,
    });
  }
  return rows.sort((x, y) =>
    x.subjectName.localeCompare(y.subjectName, 'ko') || (x.classLabel ?? '').localeCompare(y.classLabel ?? '', 'ko'));
}

export function roundFromSectioning(
  round: number,
  beforeT0: number,
  beforeT1: number,
  afterT0: number,
  afterT1: number,
  accepted: boolean,
  sec: SectioningResult,
): SectioningRoundReport {
  return {
    round,
    beforeT0,
    beforeT1,
    afterT0,
    afterT1,
    accepted,
    studentConflicts: sec.studentConflicts,
    conflictedStudents: sec.conflictedStudents,
    capacityOverflow: sec.capacityOverflow,
    studentsAssigned: sec.studentsAssigned,
    electiveSubjects: sec.electiveSubjects,
    electiveOfferings: sec.electiveOfferings,
  };
}

export function buildSectioningFinalReport(
  originalLessons: Lesson[],
  finalLessons: Lesson[],
  placements: Placement[],
): SectioningDiagnostics['final'] {
  if (!originalLessons.some((l) => l.isElective)) return null;
  const sec = sectionStudents(finalLessons, placements);
  const rosterChanges = buildOfferingRosterRows(originalLessons, lessonsWithSectioning(finalLessons, sec));
  let changedOfferings = 0;
  let studentsMoved = 0;
  for (const r of rosterChanges) {
    if (r.beforeCount !== r.afterCount) {
      changedOfferings++;
      studentsMoved += Math.abs(r.afterCount - r.beforeCount);
    }
  }
  studentsMoved = Math.round(studentsMoved / 2);
  return {
    studentConflicts: sec.studentConflicts,
    conflictedStudents: sec.conflictedStudents,
    capacityOverflow: sec.capacityOverflow,
    rosterChanges,
    changedOfferings,
    studentsMoved,
  };
}

/** 저장본/미리보기용 — diagnostics 없을 때 placements 기준 재계산 */
export function buildSectioningDiagnosticsFromPlacements(
  originalLessons: Lesson[],
  currentLessons: Lesson[],
  placements: Placement[],
): SectioningDiagnostics {
  return {
    attempts: [],
    final: buildSectioningFinalReport(originalLessons, currentLessons, placements),
  };
}
