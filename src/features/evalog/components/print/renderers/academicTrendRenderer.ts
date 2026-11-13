import type { Student } from '../../../types';
import { generateLineChart, generateLegend } from '../chartUtils';

const CATEGORY_COLORS: Record<string, string> = {
  '전과목': '#22c55e',
  '국어': '#3b82f6',
  '수학': '#ef4444',
  '영어': '#f59e0b',
  '사회': '#8b5cf6',
  '과학': '#14b8a6',
};

const CATEGORIES = ['전과목', '국어', '수학', '영어', '사회', '과학'] as const;
const SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];

function gradeToNumber(grade: number | string): number {
  if (typeof grade === 'number') return grade;
  if (grade === 'A') return 1;
  if (grade === 'B') return 2;
  if (grade === 'C') return 3;
  if (grade === 'D') return 4;
  if (grade === 'E') return 5;
  return 0;
}

function matchesCategory(subjectGroup: string, category: string): boolean {
  if (category === '전과목') return true;
  if (subjectGroup.startsWith('기술') || subjectGroup.includes('제2외국어') ||
    subjectGroup.includes('한문') || subjectGroup === '한국사') {
    return false;
  }
  return subjectGroup.includes(category);
}

export function renderAcademicTrend(student: Student): string | null {
  const records = student.section6_academic_development;
  if (!records || records.length === 0) return null;

  const regularSubjects = records
    .filter(s => ['regular', 'pe_arts', 'pe_arts_experiment', 'general'].includes(s.category) && !(s.grade === 3 && s.semester === 2))
    .map(s => ({
      category: s.subject_group,
      grade: s.rank || s.achievement || 0,
      semester: `${s.grade}-${s.semester}`,
      rank: s.rank,
    }));

  // Determine grading system
  const admissionYear = student.section1_personal_info?.admissionYear
    ? parseInt(String(student.section1_personal_info.admissionYear).replace(/[^0-9]/g, ''))
    : 0;
  const isGrade5System = admissionYear >= 2025;
  const yMax = isGrade5System ? 5 : 9;

  const trendData = SEMESTERS.map(semester => {
    const entry: Record<string, number | null> = {};
    CATEGORIES.forEach(category => {
      const subjects = regularSubjects.filter(s =>
        s.semester === semester && matchesCategory(s.category, category)
      );
      const forAvg = subjects.filter(s => s.rank !== null && s.rank !== undefined);
      if (forAvg.length > 0) {
        const avg = forAvg.reduce((sum, s) => sum + gradeToNumber(s.grade), 0) / forAvg.length;
        entry[category] = parseFloat(avg.toFixed(2));
      } else {
        entry[category] = null;
      }
    });
    return entry;
  });

  const lines = CATEGORIES.map(cat => ({
    label: cat,
    color: CATEGORY_COLORS[cat],
    strokeWidth: cat === '전과목' ? 3 : 2,
    values: trendData.map(d => d[cat]),
  }));

  const hasAnyData = lines.some(l => l.values.some(v => v !== null));
  if (!hasAnyData) return null;

  const yTicks: number[] = [];
  for (let i = 1; i <= yMax; i++) yTicks.push(i);

  const svgChart = generateLineChart(SEMESTERS, lines, {
    yMin: 1,
    yMax,
    yReversed: true,
    yTicks,
  });

  const legend = generateLegend(
    CATEGORIES.map(cat => ({ label: cat, color: CATEGORY_COLORS[cat] }))
  );

  const gradeLabel = isGrade5System ? ' (5등급제)' : '';

  return `
    <div class="print-section">
      <div class="print-section-title">
        <span class="tab-badge">교과성적</span>
        교과별 추이도${gradeLabel}
      </div>
      <div class="chart-container">${svgChart}</div>
      ${legend}
    </div>
  `;
}
