import { DifficultyBand, DIFFICULTY_ORDER } from './difficulty';

export interface CategoryAggregate {
  majorCategory: string;
  subCategory: string;
  total: number;
  wrong: number;
  byDifficulty: Record<DifficultyBand, { wrong: number; total: number }>;
  byExam: Map<string, {
    wrong: number;
    total: number;
    year: number;
    month: number;
    byDifficulty: Record<DifficultyBand, { wrong: number; total: number }>;
  }>;
  score: number;
}

export interface TimelinePoint {
  examKey: string;
  examLabel: string;
  wrongRate: number;
  wrongCount: number;
  totalCount: number;
  byDifficulty: Record<DifficultyBand, {
    wrongRate: number | null;
    wrongCount: number;
    totalCount: number;
  }>;
}

export interface CategoryStat {
  majorCategory: string;
  subCategory: string;
  wrongCount: number;
  totalCount: number;
  rate: number;
  score: number;
  byDifficulty: Record<DifficultyBand, { wrong: number; total: number; rate: number }>;
  timeline: TimelinePoint[];
}

function emptyByDifficulty(): CategoryAggregate['byDifficulty'] {
  return {
    '상': { wrong: 0, total: 0 },
    '중': { wrong: 0, total: 0 },
    '하': { wrong: 0, total: 0 },
    '미분류': { wrong: 0, total: 0 },
  };
}

function emptyExamByDifficulty(): { [K in DifficultyBand]: { wrong: number; total: number } } {
  return {
    '상': { wrong: 0, total: 0 },
    '중': { wrong: 0, total: 0 },
    '하': { wrong: 0, total: 0 },
    '미분류': { wrong: 0, total: 0 },
  };
}

export function ensureAggregate(
  map: Map<string, CategoryAggregate>,
  key: string,
  major: string,
  sub: string
): CategoryAggregate {
  let agg = map.get(key);
  if (!agg) {
    agg = {
      majorCategory: major,
      subCategory: sub,
      total: 0,
      wrong: 0,
      byDifficulty: emptyByDifficulty(),
      byExam: new Map(),
      score: 0,
    };
    map.set(key, agg);
  }
  return agg;
}

export function ensureExamSlot(
  byExam: CategoryAggregate['byExam'],
  examKey: string,
  year: number,
  month: number
) {
  let slot = byExam.get(examKey);
  if (!slot) {
    slot = { wrong: 0, total: 0, year, month, byDifficulty: emptyExamByDifficulty() };
    byExam.set(examKey, slot);
  }
  return slot;
}

function shortExamLabel(year: number, month: number): string {
  return `${year % 100}.${month}`;
}

export function finalizeStats(agg: CategoryAggregate): CategoryStat {
  const byDifficulty = {} as CategoryStat['byDifficulty'];
  for (const band of DIFFICULTY_ORDER) {
    const slot = agg.byDifficulty[band];
    byDifficulty[band] = {
      wrong: slot.wrong,
      total: slot.total,
      rate: slot.total > 0 ? Math.round((slot.wrong / slot.total) * 100) : 0,
    };
  }

  const timeline: TimelinePoint[] = Array.from(agg.byExam.values())
    .sort((a, b) => (a.year - b.year) * 12 + (a.month - b.month))
    .map((slot) => {
      const tlByDifficulty = {} as TimelinePoint['byDifficulty'];
      for (const band of DIFFICULTY_ORDER) {
        const d = slot.byDifficulty[band];
        tlByDifficulty[band] = {
          wrongRate: d.total > 0 ? Math.round((d.wrong / d.total) * 100) : null,
          wrongCount: d.wrong,
          totalCount: d.total,
        };
      }
      return {
        examKey: `${slot.year}-${slot.month}`,
        examLabel: shortExamLabel(slot.year, slot.month),
        wrongRate: slot.total > 0 ? Math.round((slot.wrong / slot.total) * 100) : 0,
        wrongCount: slot.wrong,
        totalCount: slot.total,
        byDifficulty: tlByDifficulty,
      };
    });

  return {
    majorCategory: agg.majorCategory,
    subCategory: agg.subCategory,
    wrongCount: agg.wrong,
    totalCount: agg.total,
    rate: agg.total > 0 ? Math.round((agg.wrong / agg.total) * 100) : 0,
    score: Math.round(agg.score * 100) / 100,
    byDifficulty,
    timeline,
  };
}
