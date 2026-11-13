import type { ExamScheduleInput, Grade, PreflightReport } from '../types';
import { gradeInputOf } from '../utils/multiGrade';

const MAX_AUTO_VARIANTS = 24;
const MAX_VARIANTS_PER_GRADE = 8;

function sum(xs: number[]): number {
  return xs.reduce((acc, x) => acc + x, 0);
}

function balanceCost(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = sum(xs) / xs.length;
  return xs.reduce((acc, x) => acc + (x - mean) ** 2, 0);
}

function enumerateCounts(
  minByDay: number[],
  maxByDay: number[],
  total: number,
): number[][] {
  const out: number[][] = [];

  function visit(idx: number, remaining: number, acc: number[]): void {
    if (idx === minByDay.length) {
      if (remaining === 0) out.push([...acc]);
      return;
    }

    const restMin = sum(minByDay.slice(idx + 1));
    const restMax = sum(maxByDay.slice(idx + 1));
    const lo = Math.max(minByDay[idx], remaining - restMax);
    const hi = Math.min(maxByDay[idx], remaining - restMin);

    for (let count = lo; count <= hi; count++) {
      acc.push(count);
      visit(idx + 1, remaining - count, acc);
      acc.pop();
    }
  }

  visit(0, total, []);
  return out;
}

/** 한 학년의 일차별 시험 개수 후보들 (선호 순서대로, 최대 MAX_VARIANTS_PER_GRADE개) */
function expandGradeVariants(
  input: ExamScheduleInput,
  grade: Grade,
  minTotalSlots: number,
): number[][] {
  const gradeInput = gradeInputOf(input, grade);
  const days = gradeInput.days;
  const enforceEveryDay =
    input.options.requireExamEveryDay && input.options.hardConstraints.examEveryDay;
  const minByDay = days.map((d) =>
    enforceEveryDay && d.availablePeriods.length > 0 ? 1 : 0,
  );
  const maxByDay = days.map((d) => d.availablePeriods.length);
  const capacity = sum(maxByDay);
  const totalSubjects = gradeInput.subjects.length;

  const minTotal = Math.max(minTotalSlots, sum(minByDay));
  const maxTotal = input.options.allowConcurrentElectives
    ? Math.min(totalSubjects, capacity)
    : totalSubjects;

  if (minTotal > maxTotal) return [];

  const byTotal = new Map<number, number[][]>();
  for (let total = minTotal; total <= maxTotal; total++) {
    const counts = enumerateCounts(minByDay, maxByDay, total)
      .sort((a, b) => balanceCost(a) - balanceCost(b));
    if (counts.length > 0) byTotal.set(total, counts);
  }

  const totals = Array.from(byTotal.keys()).sort((a, b) =>
    input.options.preferConcurrentElectives ? a - b : b - a,
  );
  const selected: number[][] = [];

  while (selected.length < MAX_VARIANTS_PER_GRADE) {
    let pushed = false;
    for (const total of totals) {
      const counts = byTotal.get(total);
      const next = counts?.shift();
      if (!next) continue;
      selected.push(next);
      pushed = true;
      if (selected.length >= MAX_VARIANTS_PER_GRADE) break;
    }
    if (!pushed) break;
  }

  return selected;
}

function applyCounts(
  input: ExamScheduleInput,
  countsByGrade: Map<Grade, number[]>,
): ExamScheduleInput {
  const gradeInputs: ExamScheduleInput['gradeInputs'] = {};
  for (const g of input.grades) {
    const gradeInput = gradeInputOf(input, g);
    const counts = countsByGrade.get(g);
    gradeInputs[g] = counts
      ? {
          ...gradeInput,
          days: gradeInput.days.map((day, idx) => ({
            ...day,
            examCount: counts[idx] ?? day.examCount,
          })),
        }
      : gradeInput;
  }
  return {
    ...input,
    options: { ...input.options, examCountMode: 'fixed' },
    gradeInputs,
  };
}

/**
 * 자동 시험 개수 탐색. 학년별로 균형 우선 정렬된 후보 시퀀스를 만든 뒤,
 * 인덱스 단위로 묶어(cartesian 폭발 방지) 최대 MAX_AUTO_VARIANTS개의
 * 전 학년 조합을 생성한다. i번째 조합 = 각 학년의 (i mod 후보 수)번째 후보.
 */
export function expandExamCountVariants(
  input: ExamScheduleInput,
  preflight: PreflightReport,
): ExamScheduleInput[] {
  if (input.options.examCountMode !== 'auto') return [input];
  if (input.grades.length === 0) return [];

  const perGrade = new Map<Grade, number[][]>();
  for (const g of input.grades) {
    const minSlots =
      preflight.byGrade.find((x) => x.grade === g)?.minSlotsRequired ?? 0;
    const variants = expandGradeVariants(input, g, minSlots);
    if (variants.length === 0) return [];
    perGrade.set(g, variants);
  }

  const maxLen = Math.max(
    ...input.grades.map((g) => perGrade.get(g)!.length),
  );
  const combos = Math.min(MAX_AUTO_VARIANTS, maxLen === 0 ? 0 : Math.max(maxLen, 1));

  const out: ExamScheduleInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < combos; i++) {
    const countsByGrade = new Map<Grade, number[]>();
    const sigParts: string[] = [];
    for (const g of input.grades) {
      const variants = perGrade.get(g)!;
      const counts = variants[i % variants.length];
      countsByGrade.set(g, counts);
      sigParts.push(`${g}:${counts.join(',')}`);
    }
    const sig = sigParts.join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(applyCounts(input, countsByGrade));
  }

  return out;
}
