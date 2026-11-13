import type {
  ExamScheduleInput,
  Grade,
  GradePreflight,
  PreflightReport,
  SupervisionPreflight,
} from '../types';
import { buildConflictGraph } from './conflictGraph';
import {
  allSubjects,
  buildRoomPool,
  gradeInputOf,
  slotSupervision,
  subjectDemandEntry,
} from '../utils/multiGrade';
import { enumerateUnionSlots } from './csp';

/**
 * Greedy lower bound on the chromatic number of a graph: for each iteration,
 * pick the highest-degree vertex and add it to the clique if all current
 * clique members are connected to it. This is a heuristic, not exact, but
 * tight enough to detect the K_n complete-graph case (universal common
 * subjects) which is the most common over-constraint scenario.
 */
function greedyMaxClique(adjacency: Map<string, Set<string>>, nodes: string[]): number {
  if (nodes.length === 0) return 0;
  const sorted = [...nodes].sort(
    (a, b) => (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0),
  );
  const clique: string[] = [];
  for (const v of sorted) {
    const adj = adjacency.get(v) ?? new Set<string>();
    if (clique.every((c) => adj.has(c))) clique.push(v);
  }
  return clique.length;
}

interface GradeCheckResult {
  preflight: GradePreflight;
  feasible: boolean;
  warnings: string[];
}

function checkGrade(
  input: ExamScheduleInput,
  grade: Grade,
  multiGrade: boolean,
): GradeCheckResult {
  const { options } = input;
  const gradeInput = gradeInputOf(input, grade);
  const subjects = gradeInput.subjects;
  const totalSubjects = subjects.length;
  const autoExamCounts = options.examCountMode === 'auto';
  const enforceEveryDay =
    options.requireExamEveryDay && options.hardConstraints.examEveryDay;
  const prefix = multiGrade ? `${grade}학년: ` : '';

  const totalSlots = gradeInput.days.reduce(
    (acc, d) => acc + (autoExamCounts ? d.availablePeriods.length : d.examCount),
    0,
  );
  const periodsAvailable = gradeInput.days.reduce(
    (acc, d) => acc + d.availablePeriods.length,
    0,
  );

  const graph = buildConflictGraph(subjects);
  const nodeIds = subjects.map((s) => s.id);
  const maxClique = greedyMaxClique(graph.adjacency, nodeIds);

  const requiredDays = enforceEveryDay ? gradeInput.days.length : 0;
  const minSlotsRequired = Math.max(
    maxClique,
    options.allowConcurrentElectives ? Math.min(1, totalSubjects) : totalSubjects,
    requiredDays,
  );

  const studentLoads = Array.from(graph.studentToSubjects.values()).map((arr) => arr.length);
  const maxStudentLoad = studentLoads.length ? Math.max(...studentLoads) : 0;
  const dailyCap = options.maxExamsPerStudentPerDay;
  const minDaysForLoad =
    options.hardConstraints.maxExamsPerStudentPerDay && dailyCap > 0
      ? Math.ceil(maxStudentLoad / dailyCap)
      : 0;

  const warnings: string[] = [];
  if (totalSubjects === 0) warnings.push(`${prefix}시험 과목이 0개입니다.`);
  if (gradeInput.days.length < minDaysForLoad) {
    warnings.push(
      `${prefix}학생 부담 초과: 최대 ${maxStudentLoad}과목을 응시하는 학생이 있어 일일 한도 ${dailyCap}개 기준 최소 ${minDaysForLoad}일이 필요한데 현재 ${gradeInput.days.length}일만 설정되어 있습니다. 시험 일수를 늘리거나 일일 한도를 완화해 주세요.`,
    );
  }
  if (totalSlots < minSlotsRequired) {
    warnings.push(
      `${prefix}슬롯 부족: 최소 ${minSlotsRequired}개 슬롯이 필요하지만 현재 ${totalSlots}개만 사용할 수 있습니다. ` +
        (maxClique > 1
          ? `(서로 응시자가 겹치는 과목 ${maxClique}개가 동시 충돌하기 때문에 서로 다른 슬롯에 배치되어야 합니다.) `
          : '') +
        '일차별 시험 개수를 늘리거나, 응시 과목 수를 줄여주세요.',
    );
  }
  if (periodsAvailable < minSlotsRequired) {
    warnings.push(
      `${prefix}사용 가능 교시 부족: 활성 교시 합계 ${periodsAvailable}개로는 최소 슬롯 ${minSlotsRequired}개를 채울 수 없습니다.`,
    );
  }
  if (enforceEveryDay) {
    if (totalSubjects < requiredDays) {
      warnings.push(
        `${prefix}매일 시험 배치 불가: 시험 과목 ${totalSubjects}개로 ${requiredDays}일 모두에 최소 1과목을 배치할 수 없습니다.`,
      );
    }
    for (const day of gradeInput.days) {
      if (!autoExamCounts && day.examCount < 1) {
        warnings.push(
          `${prefix}매일 시험 배치 위반: ${day.dayIndex + 1}일차 시험 개수가 0개입니다. 최소 1개로 설정해 주세요.`,
        );
      }
      if (day.availablePeriods.length === 0) {
        warnings.push(
          `${prefix}매일 시험 배치 위반: ${day.dayIndex + 1}일차에 사용할 수 있는 교시가 없습니다.`,
        );
      }
    }
  }

  // Pinned conflict check (학년 내 학생 충돌)
  const pinnedSlotMap = new Map<string, string>();
  for (const p of gradeInput.pinned) {
    const key = `${p.dayIndex}|${p.period}`;
    const existing = pinnedSlotMap.get(key);
    if (existing) {
      const subA = subjects.find((s) => s.id === existing);
      const subB = subjects.find((s) => s.id === p.subjectId);
      if (subA && subB) {
        const setA = new Set(subA.studentCodes);
        const overlap = subB.studentCodes.some((c) => setA.has(c));
        if (overlap) {
          warnings.push(
            `${prefix}고정 충돌: '${subA.name}'과 '${subB.name}'은 같은 슬롯(${p.dayIndex + 1}일차 ${p.period}교시)에 고정되어 있는데 응시자가 겹칩니다.`,
          );
        }
      }
    } else {
      pinnedSlotMap.set(key, p.subjectId);
    }
  }

  // Pinned period must be active
  for (const p of gradeInput.pinned) {
    const day = gradeInput.days.find((d) => d.dayIndex === p.dayIndex);
    if (!day || !day.availablePeriods.includes(p.period)) {
      const sub = subjects.find((s) => s.id === p.subjectId);
      warnings.push(
        `${prefix}고정 무효: '${sub?.name ?? p.subjectId}'이 비활성 교시(${p.dayIndex + 1}일차 ${p.period}교시)에 고정되어 있습니다.`,
      );
    }
  }

  const feasible =
    totalSubjects > 0 &&
    totalSlots >= minSlotsRequired &&
    periodsAvailable >= minSlotsRequired &&
    gradeInput.days.length >= minDaysForLoad &&
    (!enforceEveryDay ||
      (totalSubjects >= requiredDays &&
        gradeInput.days.every(
          (d) => d.availablePeriods.length > 0 && (autoExamCounts || d.examCount >= 1),
        )));

  return {
    preflight: { grade, totalSubjects, totalSlots, maxClique, minSlotsRequired },
    feasible,
    warnings,
  };
}

/**
 * 감독 인력·시험실 사전 검증.
 * - 공통 과목 = 학년 반 수(고정 시험실), 선택과목 = 고사실 풀 greedy 배정.
 * - 단일 과목 수요 > 가용 인원이거나 고사실 풀로 수용 불가면 배치 불가능.
 * - 전체 수요 합 > (합집합 슬롯 수 × 가용 인원)이면 총량 자체가 부족.
 * - 학년별 고정 배치가 같은 슬롯에 겹쳐 수요 초과를 확정하면 경고.
 * hard 모드에서만 생성을 차단하고, soft 모드에서는 경고만 낸다.
 */
function checkSupervision(input: ExamScheduleInput): {
  preflight: SupervisionPreflight | null;
  feasible: boolean;
  warnings: string[];
} {
  const sup = input.supervision;
  if (!sup.enabled) return { preflight: null, feasible: true, warnings: [] };

  const subjects = allSubjects(input);
  const warnings: string[] = [];
  const available = sup.availableSupervisors;
  const pool = buildRoomPool(sup);
  const totalRooms = pool.length;
  const totalSeats = pool.reduce((acc, c) => acc + c, 0);

  let feasible = true;
  const blockIfHard = () => {
    if (sup.hard) feasible = false;
  };

  if (totalRooms === 0 && subjects.some((s) => s.scope === 'elective')) {
    warnings.push(
      '선택과목 고사실이 설정되지 않았습니다. 감독 설정에서 고사실(정원×실 수)을 추가해 주세요.',
    );
    blockIfHard();
  }

  // 과목별 독립 수요 (전체 고사실 풀 가용 가정 — 낙관적 하한)
  let maxSubjectDemand = 0;
  let maxSubjectName = '';
  let totalDemand = 0;
  const demandById = new Map<string, number>();
  const unfittable: string[] = [];
  for (const s of subjects) {
    const res = slotSupervision([subjectDemandEntry(s, sup)], sup, pool);
    demandById.set(s.id, res.supervisors);
    totalDemand += res.supervisors;
    if (res.supervisors > maxSubjectDemand) {
      maxSubjectDemand = res.supervisors;
      maxSubjectName = `${s.grade}학년 ${s.name}`;
    }
    if (!res.fits) unfittable.push(`${s.grade}학년 ${s.name}`);
  }

  const unionSlots = enumerateUnionSlots(input);
  const totalCapacity = unionSlots.length * available;

  if (unfittable.length > 0) {
    warnings.push(
      `고사실 부족: ${unfittable.join(', ')} 과목은 고사실 풀(${totalRooms}실, 총 ${totalSeats}명) 전체를 써도 응시자를 수용할 수 없습니다. ` +
        '고사실을 추가하거나 정원을 키워주세요.',
    );
    blockIfHard();
  }
  if (maxSubjectDemand > available) {
    warnings.push(
      `감독 인원 부족: '${maxSubjectName}' 한 과목만으로 감독 ${maxSubjectDemand}명이 필요해 가용 인원 ${available}명을 초과합니다. ` +
        '가용 감독 인원을 늘리거나 반 수·고사실 구성을 확인해 주세요.',
    );
    blockIfHard();
  }
  if (totalDemand > totalCapacity) {
    warnings.push(
      `감독 총량 부족: 전체 과목 감독 수요 합계 ${totalDemand}명 > 공급 상한 ${totalCapacity}명(슬롯 ${unionSlots.length}개 × 가용 ${available}명). ` +
        '시험 일수·교시를 늘리거나 가용 감독 인원을 확대해 주세요.',
    );
    blockIfHard();
  }

  // 고정 배치 간 수요 합산 검사 (학년 간 고정이 같은 슬롯에 겹칠 때)
  const pinnedBySlot = new Map<string, string[]>();
  for (const g of input.grades) {
    for (const p of gradeInputOf(input, g).pinned) {
      const key = `${p.dayIndex}|${p.period}`;
      const arr = pinnedBySlot.get(key) ?? [];
      arr.push(p.subjectId);
      pinnedBySlot.set(key, arr);
    }
  }
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  for (const [key, ids] of pinnedBySlot.entries()) {
    const entries = ids
      .map((id) => subjectById.get(id))
      .filter((s): s is (typeof subjects)[number] => !!s)
      .map((s) => subjectDemandEntry(s, sup));
    const res = slotSupervision(entries, sup, pool);
    if (res.supervisors > available || !res.fits) {
      const [d, p] = key.split('|').map(Number);
      warnings.push(
        `고정 배치 초과: ${d + 1}일차 ${p}교시에 고정된 과목들이 시험실 ${res.rooms}실 · 감독 ${res.supervisors}명을 요구해 ` +
          `${res.fits ? `가용 ${available}명을 초과합니다.` : '고사실 풀로 수용할 수 없습니다.'}`,
      );
      blockIfHard();
    }
  }

  return {
    preflight: {
      available,
      maxSubjectDemand,
      totalDemand,
      totalCapacity,
      totalRooms,
      totalSeats,
      feasible,
    },
    feasible,
    warnings,
  };
}

export function runPreflight(input: ExamScheduleInput): PreflightReport {
  const multiGrade = input.grades.length > 1;
  const gradeResults = input.grades.map((g) => checkGrade(input, g, multiGrade));
  const supervision = checkSupervision(input);

  const warnings = [
    ...gradeResults.flatMap((r) => r.warnings),
    ...supervision.warnings,
  ];

  const byGrade = gradeResults.map((r) => r.preflight);
  const feasible =
    input.grades.length > 0 &&
    gradeResults.every((r) => r.feasible) &&
    supervision.feasible;

  if (input.grades.length === 0) {
    warnings.push('포함된 학년이 없습니다. 최소 1개 학년을 선택해 주세요.');
  }

  return {
    totalSubjects: byGrade.reduce((acc, g) => acc + g.totalSubjects, 0),
    totalSlots: byGrade.reduce((acc, g) => acc + g.totalSlots, 0),
    maxClique: byGrade.reduce((acc, g) => Math.max(acc, g.maxClique), 0),
    minSlotsRequired: byGrade.reduce((acc, g) => acc + g.minSlotsRequired, 0),
    byGrade,
    supervision: supervision.preflight,
    feasible,
    warnings,
  };
}
