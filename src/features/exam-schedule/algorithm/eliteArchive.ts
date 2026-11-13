import type { ScheduleCandidate, SlotAssignment } from '../types';
import { ELITE_ARCHIVE_SIZE, HAMMING_DIVERSITY_RATIO } from '../constants';

interface EliteEntry {
  candidate: ScheduleCandidate;
}

const SCORE_EPSILON = 1e-6;

export class EliteArchive {
  private entries: EliteEntry[] = [];

  constructor(
    private readonly maxSize: number = ELITE_ARCHIVE_SIZE,
    private readonly diversityRatio: number = HAMMING_DIVERSITY_RATIO,
  ) {}

  size(): number {
    return this.entries.length;
  }

  list(): ScheduleCandidate[] {
    return this.entries
      .map((e) => e.candidate)
      .sort((a, b) => a.scoreBreakdown.total - b.scoreBreakdown.total);
  }

  tryAdmit(candidate: ScheduleCandidate): boolean {
    if (!candidate.metrics.hardFeasible) return false;

    const sameDayStructure = this.findSameDayStructure(candidate);
    if (sameDayStructure) {
      if (
        candidate.scoreBreakdown.total + SCORE_EPSILON <
        sameDayStructure.candidate.scoreBreakdown.total
      ) {
        const idx = this.entries.indexOf(sameDayStructure);
        this.entries[idx] = { candidate };
        return true;
      }
      return false;
    }

    if (this.entries.length < this.maxSize) {
      // Check diversity vs existing
      if (this.passesDiversity(candidate)) {
        this.entries.push({ candidate });
        return true;
      }
      // If new candidate is better than the closest neighbor, replace it
      const closest = this.findMostSimilar(candidate);
      if (closest && candidate.scoreBreakdown.total < closest.candidate.scoreBreakdown.total) {
        const idx = this.entries.indexOf(closest);
        this.entries[idx] = { candidate };
        return true;
      }
      return false;
    }

    // Archive full
    const worst = this.entries.reduce((a, b) =>
      a.candidate.scoreBreakdown.total > b.candidate.scoreBreakdown.total ? a : b,
    );
    if (
      candidate.scoreBreakdown.total - worst.candidate.scoreBreakdown.total >
      SCORE_EPSILON
    ) {
      return false;
    }
    if (this.passesDiversity(candidate, worst)) {
      const idx = this.entries.indexOf(worst);
      this.entries[idx] = { candidate };
      return true;
    }
    // Replace most-similar entry only if new is better than that entry
    const closest = this.findMostSimilar(candidate);
    if (closest && candidate.scoreBreakdown.total < closest.candidate.scoreBreakdown.total) {
      const idx = this.entries.indexOf(closest);
      this.entries[idx] = { candidate };
      return true;
    }
    return false;
  }

  private findSameDayStructure(candidate: ScheduleCandidate): EliteEntry | null {
    const signature = dayStructureSignature(candidate);
    return (
      this.entries.find((entry) => dayStructureSignature(entry.candidate) === signature) ??
      null
    );
  }

  private passesDiversity(candidate: ScheduleCandidate, exclude?: EliteEntry): boolean {
    const threshold = Math.max(
      1,
      Math.floor(this.diversityRatio * candidate.assignments.length),
    );
    for (const e of this.entries) {
      if (exclude && e === exclude) continue;
      if (hammingDistance(candidate.assignments, e.candidate.assignments) < threshold) {
        return false;
      }
    }
    return true;
  }

  private findMostSimilar(candidate: ScheduleCandidate): EliteEntry | null {
    let best: EliteEntry | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const e of this.entries) {
      const d = hammingDistance(candidate.assignments, e.candidate.assignments);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }
}

export function hammingDistance(a: SlotAssignment[], b: SlotAssignment[]): number {
  const mb = new Map<string, string>();
  for (const x of b) mb.set(x.subjectId, `${x.dayIndex}|${x.period}`);
  let diff = 0;
  for (const x of a) {
    const slot = mb.get(x.subjectId);
    if (!slot || slot !== `${x.dayIndex}|${x.period}`) diff++;
  }
  return diff;
}

export function dayStructureSignature(candidate: ScheduleCandidate): string {
  // 학년별 day 구조 (시험 개수·활성 교시) 시그니처
  const gradeParts: string[] = [];
  const byGrade = candidate.dayConfigsByGrade;
  if (byGrade) {
    for (const gradeKey of Object.keys(byGrade).sort()) {
      const configs = byGrade[Number(gradeKey) as keyof typeof byGrade] ?? [];
      const days = [...configs]
        .sort((a, b) => a.dayIndex - b.dayIndex)
        .map(
          (d) =>
            `${d.dayIndex}:count=${d.examCount}:active=${[...d.availablePeriods]
              .sort((a, b) => a - b)
              .join(',')}`,
        )
        .join(';');
      gradeParts.push(`g${gradeKey}[${days}]`);
    }
  } else if (candidate.dayConfigs) {
    // v1 후보 하위호환
    const days = [...candidate.dayConfigs]
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .map(
        (d) =>
          `${d.dayIndex}:count=${d.examCount}:active=${[...d.availablePeriods]
            .sort((a, b) => a - b)
            .join(',')}`,
      )
      .join(';');
    gradeParts.push(`g${candidate.grade ?? '?'}[${days}]`);
  }

  // 셀 배치 시그니처 — subjectId가 학년 접두사를 포함하므로 전역으로 충분히 유일
  const cellMap = new Map<string, string[]>();
  for (const a of candidate.assignments) {
    const k = `${a.dayIndex}|${a.period}`;
    const arr = cellMap.get(k) ?? [];
    arr.push(a.subjectId);
    cellMap.set(k, arr);
  }
  const cells = Array.from(cellMap.entries())
    .map(([k, subjects]) => `${k}:${subjects.sort().join(',')}`)
    .sort()
    .join(';');

  return `${gradeParts.join('||')}##${cells}`;
}

export function selectDistinctDayStructures(
  candidates: ScheduleCandidate[],
  limit: number,
): ScheduleCandidate[] {
  const out: ScheduleCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of [...candidates].sort(
    (a, b) => a.scoreBreakdown.total - b.scoreBreakdown.total,
  )) {
    const signature = dayStructureSignature(candidate);
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push(candidate);
    if (out.length >= limit) break;
  }
  return out;
}
