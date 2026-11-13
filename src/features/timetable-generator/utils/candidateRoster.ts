import type { Lesson, TimetableCandidate, TimetableInput } from '../types';
import { sectionStudents } from '../algorithm/sectioning';
import { lessonsWithSectioning } from './sectioningReport';

function canonical(lessons: Lesson[]) {
  const students = [...new Set(lessons.flatMap(l => l.studentCodes))].sort();
  const text = JSON.stringify(lessons.map(l => [l.id, l.grade, l.subjectName, l.teacherId, [...l.studentCodes].sort()])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  // A deterministic stale-data checksum, not an authentication signature.
  let hash = 14695981039346656037n;
  for (let i = 0; i < text.length; i++) hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(i))) * 1099511628211n);
  return { students, fingerprint: hash.toString(16) };
}

export function applyCandidateRosters(lessons: Lesson[], rosters: Record<string, string[]>): Lesson[] {
  const curriculum = (items: Lesson[]) => {
    const counts = new Map<string, number>();
    for (const l of items) for (const s of l.studentCodes) {
      const k = JSON.stringify([s, l.grade, l.subjectName]);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return JSON.stringify([...counts].sort(([a], [b]) => a.localeCompare(b)));
  };
  const classByStudent = new Map<string, string>();
  for (const l of lessons) if (!l.isElective && l.classKeys.length === 1) {
    for (const s of l.studentCodes) classByStudent.set(s, l.classKeys[0]);
  }
  const restored = lessons.map(l => {
    const codes = rosters[l.offeringId];
    if (!codes || !Array.isArray(codes) || codes.some(s => typeof s !== 'string') || new Set(codes).size !== codes.length || (l.isElective && codes.length > 35)) {
      throw new Error('분반 명단 누락·중복 또는 정원 초과입니다.');
    }
    if (!l.isElective && JSON.stringify([...codes].sort()) !== JSON.stringify([...l.studentCodes].sort())) {
      throw new Error('공통수업의 수강 명단이 변경되었습니다.');
    }
    const counts: Record<string, number> = {};
    for (const s of codes) {
      const ck = classByStudent.get(s);
      if (ck) counts[ck] = (counts[ck] ?? 0) + 1;
    }
    return { ...l, studentCodes: [...codes], studentCount: codes.length,
      ...(codes.every(s => classByStudent.has(s)) ? { studentCountByClass: counts, classKeys: Object.keys(counts).sort() } : {}) };
  });
  if (curriculum(restored) !== curriculum(lessons)) throw new Error('원본 학생별 수강 과목·시수가 보존되지 않았습니다.');
  return restored;
}

export function encodeCandidateRoster(input: TimetableInput, rosters: Record<string, string[]>): NonNullable<TimetableCandidate['sectionRoster']> {
  applyCandidateRosters(input.lessons, rosters);
  const { students, fingerprint } = canonical(input.lessons);
  const indices = new Map(students.map((s, i) => [s, i]));
  return { fingerprint, byOffering: Object.fromEntries(Object.entries(rosters).map(([offering, codes]) => [offering, codes.map(s => {
    const index = indices.get(s);
    if (index == null) throw new Error('원본에 없는 학생입니다.');
    return index;
  })])) };
}

export function candidateLessons(input: TimetableInput, candidate: TimetableCandidate): Lesson[] {
  if (!candidate.sectionRoster) return lessonsWithSectioning(input.lessons, sectionStudents(input.lessons, candidate.placements));
  const { students, fingerprint } = canonical(input.lessons);
  if (fingerprint !== candidate.sectionRoster.fingerprint) throw new Error('저장 이후 수강 명단 또는 교사 배정이 변경되었습니다. 다시 생성해 주세요.');
  const rosters = Object.fromEntries(Object.entries(candidate.sectionRoster.byOffering).map(([oid, indices]) => [oid, indices.map(i => {
    if (!Number.isInteger(i) || i < 0 || i >= students.length) throw new Error('저장된 분반 명단의 학생 번호가 잘못되었습니다.');
    return students[i];
  })]));
  return applyCandidateRosters(input.lessons, rosters);
}
