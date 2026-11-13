/**
 * Analysis Aggregation Utilities
 * 프론트엔드에서 분석 결과를 집계하는 유틸리티 함수들
 */
import type {
  ActivityWithAnalysis,
  GradeGroup,
  CategoryGroup,
  CategoryTopGroup,
  GradeSubGroup,
  CrossPattern,
  GrowthTrajectory,
  StrengthAnalysis,
} from '../types/analysis';

// ─── 학년/카테고리별 그룹핑 ─────────────────

export function aggregateByGradeCategory(
  activities: ActivityWithAnalysis[]
): GradeGroup[] {
  const gradeMap = new Map<number, Map<string, ActivityWithAnalysis[]>>();

  for (const activity of activities) {
    if (!gradeMap.has(activity.grade)) {
      gradeMap.set(activity.grade, new Map());
    }
    const catMap = gradeMap.get(activity.grade)!;
    if (!catMap.has(activity.category)) {
      catMap.set(activity.category, []);
    }
    catMap.get(activity.category)!.push(activity);
  }

  const grades = Array.from(gradeMap.keys()).sort((a, b) => a - b);

  return grades.map(grade => {
    const catMap = gradeMap.get(grade)!;
    const categories: CategoryGroup[] = Array.from(catMap.entries())
      .sort(([a], [b]) => getCategoryOrder(a) - getCategoryOrder(b))
      .map(([category, items]) => ({ category, activities: items }));

    return { grade, categories };
  });
}

// ─── 카테고리 → 학년 그룹핑 (활동 유형 우선) ─────────

/** raw category → 표시용 최상위 카테고리 매핑 */
const TOP_CATEGORY_MAP: Record<string, string> = {
  regular: '교과활동',
  career: '교과활동',
  pe_arts: '교과활동',
  pe_arts_experiment: '교과활동',
  자율활동: '자율활동',
  동아리활동: '동아리활동',
  진로활동: '진로활동',
  '행동특성및종합의견': '행동특성및종합의견',
  '행동특성': '행동특성및종합의견',
};

/** 표시용 카테고리 정렬 순서 */
const TOP_CATEGORY_ORDER: Record<string, number> = {
  '자율활동': 0,
  '진로활동': 1,
  '동아리활동': 2,
  '행동특성및종합의견': 3,
  '교과활동': 4,
};

export function getTopCategory(rawCategory: string): string {
  return TOP_CATEGORY_MAP[rawCategory] ?? rawCategory;
}

/** 교과활동 하위 라벨 (regular/career/pe_arts 구분 표시용) */
export const SUBJECT_SUBTYPE_LABEL: Record<string, string> = {
  regular: '일반선택',
  career: '진로선택',
  pe_arts: '체육예술',
  pe_arts_experiment: '체육예술',
};

export function aggregateByCategoryGrade(
  activities: ActivityWithAnalysis[]
): CategoryTopGroup[] {
  // topCategory → grade → activities
  const topMap = new Map<string, Map<number, ActivityWithAnalysis[]>>();
  // topCategory → raw categories set (for metadata)
  const rawSetMap = new Map<string, Set<string>>();

  for (const activity of activities) {
    const top = getTopCategory(activity.category);
    if (!topMap.has(top)) {
      topMap.set(top, new Map());
      rawSetMap.set(top, new Set());
    }
    rawSetMap.get(top)!.add(activity.category);

    const gradeMap = topMap.get(top)!;
    if (!gradeMap.has(activity.grade)) {
      gradeMap.set(activity.grade, []);
    }
    gradeMap.get(activity.grade)!.push(activity);
  }

  const tops = Array.from(topMap.keys()).sort(
    (a, b) => getTopCategoryOrder(a) - getTopCategoryOrder(b)
  );

  return tops.map(top => {
    const gradeMap = topMap.get(top)!;
    const grades: GradeSubGroup[] = Array.from(gradeMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([grade, items]) => ({ grade, activities: items }));

    return {
      category: top,
      rawCategories: Array.from(rawSetMap.get(top)!),
      grades,
    };
  });
}

function getTopCategoryOrder(category: string): number {
  return TOP_CATEGORY_ORDER[category] ?? 99;
}

// ─── 교차 패턴 탐지 ─────────────────────────

export function detectCrossPatterns(
  activities: ActivityWithAnalysis[],
  minCategories: number = 3
): CrossPattern[] {
  // keyword → 등장 카테고리 Set
  const keywordCategories = new Map<string, Set<string>>();

  for (const activity of activities) {
    if (!activity.analysis) continue;
    for (const keyword of activity.analysis.keywords) {
      if (!keywordCategories.has(keyword)) {
        keywordCategories.set(keyword, new Set());
      }
      keywordCategories.get(keyword)!.add(activity.category);
    }
  }

  const patterns: CrossPattern[] = [];
  for (const [keyword, categories] of keywordCategories) {
    if (categories.size >= minCategories) {
      patterns.push({
        keyword,
        categories: Array.from(categories),
        count: categories.size,
      });
    }
  }

  return patterns.sort((a, b) => b.count - a.count);
}

// ─── 성장 궤적 분석 ─────────────────────────

export function analyzeGrowthTrajectory(
  activities: ActivityWithAnalysis[]
): GrowthTrajectory[] {
  // 학년별 키워드/역량 수집
  const gradeData = new Map<number, { keywords: Set<string>; competencies: Set<string> }>();

  for (const activity of activities) {
    if (!activity.analysis) continue;
    if (!gradeData.has(activity.grade)) {
      gradeData.set(activity.grade, { keywords: new Set(), competencies: new Set() });
    }
    const data = gradeData.get(activity.grade)!;
    activity.analysis.keywords.forEach(k => data.keywords.add(k));
    activity.analysis.competencies.forEach(c => data.competencies.add(c));
  }

  const grades = Array.from(gradeData.keys()).sort((a, b) => a - b);
  const trajectories: GrowthTrajectory[] = [];
  let prevKeywords = new Set<string>();
  let prevCompetencies = new Set<string>();

  for (const grade of grades) {
    const data = gradeData.get(grade)!;
    const newKeywords = difference(data.keywords, prevKeywords);
    const newCompetencies = difference(data.competencies, prevCompetencies);

    trajectories.push({
      grade,
      keywords: Array.from(data.keywords),
      competencies: Array.from(data.competencies),
      newKeywords: Array.from(newKeywords),
      newCompetencies: Array.from(newCompetencies),
    });

    prevKeywords = new Set([...prevKeywords, ...data.keywords]);
    prevCompetencies = new Set([...prevCompetencies, ...data.competencies]);
  }

  return trajectories;
}

// ─── 강점/성장영역 분석 ─────────────────────

export function identifyStrengths(
  activities: ActivityWithAnalysis[]
): StrengthAnalysis {
  const competencyCount = new Map<string, number>();
  const keywordCount = new Map<string, number>();

  for (const activity of activities) {
    if (!activity.analysis) continue;
    for (const c of activity.analysis.competencies) {
      competencyCount.set(c, (competencyCount.get(c) || 0) + 1);
    }
    for (const k of activity.analysis.keywords) {
      keywordCount.set(k, (keywordCount.get(k) || 0) + 1);
    }
  }

  const topCompetencies = Array.from(competencyCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topKeywords = Array.from(keywordCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 1회만 등장하는 역량은 성장영역 후보
  const growthAreas = Array.from(competencyCount.entries())
    .filter(([, count]) => count === 1)
    .map(([name]) => name)
    .slice(0, 5);

  return { topCompetencies, topKeywords, growthAreas };
}

// ─── CSV 내보내기 ────────────────────────────

export function exportAnalysisToCSV(activities: ActivityWithAnalysis[]): string {
  const headers = [
    '학생ID', '학년', '학기', '카테고리', '과목', '요약',
    'What', 'Why', 'How', '키워드', '역량', '분석일시',
  ];

  const rows = activities
    .filter(a => a.analysis)
    .map(a => {
      const an = a.analysis!;
      return [
        a.student_id,
        String(a.grade),
        a.semester != null ? String(a.semester) : '',
        a.category,
        a.subject_name,
        an.summary,
        an.what.join('; '),
        an.why.join('; '),
        an.how.join('; '),
        an.keywords.join(', '),
        an.competencies.join(', '),
        an.analyzed_at,
      ];
    });

  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const csvLines = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ];

  // BOM for Korean Excel compatibility
  return '\uFEFF' + csvLines.join('\n');
}

// ─── Helpers ────────────────────────────────

function difference<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of setA) {
    if (!setB.has(item)) result.add(item);
  }
  return result;
}

const CATEGORY_ORDER: Record<string, number> = {
  regular: 0,
  자율활동: 1,
  동아리활동: 2,
  진로활동: 3,
  '행동특성및종합의견': 4,
};

function getCategoryOrder(category: string): number {
  return CATEGORY_ORDER[category] ?? 99;
}
