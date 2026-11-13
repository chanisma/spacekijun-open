import type { PreflightReport, TimetableInput } from '../types';
import { cellKeyStr, enumerateCells } from './csp';

/** 여러 집합의 교집합 크기 */
function intersectionSize(sets: Set<string>[]): number {
  if (sets.length === 0) return 0;
  let acc = sets[0];
  for (let i = 1; i < sets.length; i++) {
    const next = new Set<string>();
    for (const x of sets[i]) if (acc.has(x)) next.add(x);
    acc = next;
    if (acc.size === 0) break;
  }
  return acc.size;
}

/**
 * 배치 전 필요조건 검사. 충분조건은 아니지만 흔한 over-constraint(교사 과부하,
 * 학생 과부하, 차단으로 도메인 소진, 일수 부족)를 미리 잡아 무의미한 솔브를 막는다.
 */
export function runPreflight(input: TimetableInput): PreflightReport {
  const warnings: string[] = [];
  const totalCells = enumerateCells(input.grid).length;
  const totalLessons = input.lessons.length;

  // 1) 도메인 소진 (모든 칸 차단)
  for (const l of input.lessons) {
    const blocked = new Set(l.blockedCells);
    if (blocked.size >= totalCells) {
      warnings.push(`'${l.subjectName}'(${l.grade}학년${l.classLabel ? ` ${l.classLabel}` : ''}) 배치 가능한 칸이 없습니다 (모든 칸 차단).`);
    }
  }

  // 2) 교사 과부하 — 교사의 모든 수업은 서로 다른 칸이어야 한다
  const teacherLessonCount = new Map<string, number>();
  const teacherBlockedSets = new Map<string, Set<string>[]>();
  const teacherName = new Map<string, string>();
  for (const l of input.lessons) {
    if (!l.teacherId) continue;
    teacherLessonCount.set(l.teacherId, (teacherLessonCount.get(l.teacherId) ?? 0) + 1);
    const arr = teacherBlockedSets.get(l.teacherId) ?? [];
    arr.push(new Set(l.blockedCells));
    teacherBlockedSets.set(l.teacherId, arr);
    if (l.teacherName) teacherName.set(l.teacherId, l.teacherName);
  }
  if (input.options.hard.teacherConflict) {
    for (const [tid, count] of teacherLessonCount) {
      // 교사 불가시간 = 그 교사 모든 수업의 차단 칸 교집합
      const unavail = intersectionSize(teacherBlockedSets.get(tid) ?? []);
      const available = totalCells - unavail;
      if (count > available) {
        warnings.push(
          `교사 과부하: '${teacherName.get(tid) ?? tid.slice(0, 8)}'의 주당 수업 ${count}교시 > 배치 가능 ${available}칸. 분반·시수를 조정하거나 교사 불가시간을 줄여주세요.`,
        );
      }
    }
  }

  // 2b) 교사 하루 상한 하드 모드의 주간 용량 — 주당 수업 > 상한×일수면 절대 불가능
  if (input.options.hard.teacherDailyCap) {
    const cap = input.options.maxPerTeacherPerDay ?? 4;
    const weeklyMax = cap * input.grid.days;
    for (const [tid, count] of teacherLessonCount) {
      if (count > weeklyMax) {
        warnings.push(
          `교사 하루 상한 불가능: '${teacherName.get(tid) ?? tid.slice(0, 8)}'의 주당 수업 ${count}교시 > 하루 ${cap}개×${input.grid.days}일=${weeklyMax}. 하루 최대 수업 수를 늘리거나 이 교사의 시수를 조정해 주세요.`,
        );
      }
    }
  }

  // 3) 학생 과부하 — 한 학생의 수업은 모두 서로 다른 칸이어야 하고, 그 학생의 모든
  //    수업이 공통으로 막힌 칸(공강 등)은 쓸 수 없다. load > (전체 − 공통 차단)이면 불가능.
  const studentLoad = new Map<string, number>();
  const studentBlockedSets = new Map<string, Set<string>[]>();
  const studentGrade = new Map<string, number>();
  for (const l of input.lessons) {
    const bset = new Set(l.blockedCells);
    for (const code of l.studentCodes) {
      studentLoad.set(code, (studentLoad.get(code) ?? 0) + 1);
      const arr = studentBlockedSets.get(code) ?? [];
      arr.push(bset);
      studentBlockedSets.set(code, arr);
      if (!studentGrade.has(code)) studentGrade.set(code, l.grade);
    }
  }
  const capacityGroups = new Map<string, NonNullable<PreflightReport['studentCapacityIssues']>[number]>();
  for (const [code, load] of studentLoad) {
    const avail = totalCells - intersectionSize(studentBlockedSets.get(code) ?? []);
    const over = load - avail;
    if (over > 0) {
      const grade = studentGrade.get(code)!;
      const key = `${grade}|${load}|${avail}`;
      const group = capacityGroups.get(key) ?? { grade, students: 0, required: load, available: avail, excess: over };
      group.students++;
      capacityGroups.set(key, group);
    }
  }
  const studentCapacityIssues = [...capacityGroups.values()].sort((a, b) => a.grade - b.grade || b.excess - a.excess);
  for (const issue of studentCapacityIssues) {
    warnings.push(`학생 시수 초과(입력 데이터 오류): ${issue.grade}학년 ${issue.students}명이 주 ${issue.required}교시를 수강하나 공강 제외 가용 칸은 ${issue.available}칸입니다 (${issue.excess}교시 초과). 수강 명단의 과목·중복 등록·시수를 확인해 주세요. 현재 입력과 제약으로는 배치할 수 없습니다.`);
  }

  // 4) 같은 과목 하루 한도 vs 일수
  if (input.options.hard.subjectDailyCap) {
    const offeringCount = new Map<string, { n: number; name: string; grade: number }>();
    for (const l of input.lessons) {
      const e = offeringCount.get(l.offeringId) ?? { n: 0, name: l.subjectName, grade: l.grade };
      e.n++;
      offeringCount.set(l.offeringId, e);
    }
    const cap = input.options.maxPerSubjectPerDay * input.grid.days;
    for (const { n, name, grade } of offeringCount.values()) {
      if (n > cap) {
        warnings.push(
          `'${name}'(${grade}학년) 주당 ${n}교시는 하루 ${input.options.maxPerSubjectPerDay}회×${input.grid.days}일=${cap}칸 한도를 넘습니다.`,
        );
      }
    }
  }

  return {
    totalLessons,
    totalCells,
    feasible: warnings.length === 0 && totalLessons > 0,
    warnings: totalLessons === 0 ? ['배치할 수업이 없습니다.'] : warnings,
    studentCapacityIssues,
  };
}
