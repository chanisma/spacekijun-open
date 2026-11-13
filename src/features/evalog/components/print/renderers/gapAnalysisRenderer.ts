import type { Student } from '../../../types';
import {
  calcWeightedAverage,
  classifyGapType,
  GAP_TYPE_INFO,
  MATCHABLE_CATEGORIES,
  is5GradeSystem,
  convert5To9Grade,
  type GapType,
} from '../../../utils/gradeAnalysisUtils';
import { generateBarChart } from '../chartUtils';

const CATEGORY_COLORS: Record<string, string> = {
  '국어': '#3b82f6',
  '수학': '#ef4444',
  '영어': '#f59e0b',
  '한국사': '#8b5cf6',
  '사회': '#14b8a6',
  '과학': '#ec4899',
};

export function renderGapAnalysis(student: Student): string | null {
  const academic = student.section6_academic_development;
  const mocks = student.mock_result;
  if (!academic || academic.length === 0 || !mocks || mocks.length === 0) return null;

  // Compute academic averages by category
  const sortedExams = [...mocks].sort((a, b) => {
    if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
    if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
    return a.exam_month - b.exam_month;
  });
  const latestExam = sortedExams[sortedExams.length - 1];

  // Build per-category comparison
  type ComparisonRow = {
    category: string;
    academicGrade: number;
    mockGrade: number;
    gap: number;
    gapType: GapType;
  };

  const matchMap: Record<string, string> = {
    '국어': '국어',
    '수학': '수학',
    '영어': '영어',
    '한국사': '한국사',
    '사회': '사회탐구',
    '과학': '과학탐구',
  };

  const comparisons: ComparisonRow[] = [];

  for (const cat of MATCHABLE_CATEGORIES) {
    // Academic: weighted average for this category
    const catRecords = academic
      .filter(r => r.category === 'regular' && r.subject_group.includes(cat) && r.rank !== null);

    if (catRecords.length === 0) continue;

    const academicAvg = calcWeightedAverage(
      catRecords.map(r => ({ rank: r.rank, units: r.units }))
    );

    // Convert 5-grade if needed
    let academicGrade9 = academicAvg;
    // Check if student is in 5-grade system (grade 1 in 2025+)
    const studentGrade = catRecords[0]?.grade;
    if (studentGrade && is5GradeSystem(studentGrade)) {
      academicGrade9 = convert5To9Grade(academicAvg);
    }

    // Mock: latest exam grade for matching subject
    const mockSubjectName = matchMap[cat];
    const mockScore = latestExam.subjects[mockSubjectName];
    if (!mockScore || mockScore.grade === null) continue;

    const gap = mockScore.grade - academicGrade9;
    const gapType = classifyGapType(academicGrade9, mockScore.grade);

    comparisons.push({
      category: cat,
      academicGrade: parseFloat(academicGrade9.toFixed(2)),
      mockGrade: mockScore.grade,
      gap: parseFloat(gap.toFixed(2)),
      gapType,
    });
  }

  if (comparisons.length === 0) return null;

  // Overall gap type
  const avgAcademic = comparisons.reduce((s, c) => s + c.academicGrade, 0) / comparisons.length;
  const avgMock = comparisons.reduce((s, c) => s + c.mockGrade, 0) / comparisons.length;
  const overallGapType = classifyGapType(avgAcademic, avgMock);
  const overallInfo = GAP_TYPE_INFO[overallGapType];

  // Bar chart: academic vs mock by subject
  const barData = comparisons.flatMap(c => [
    { label: `${c.category}\n(내신)`, value: c.academicGrade, color: CATEGORY_COLORS[c.category] || '#64748b' },
    { label: `${c.category}\n(모의)`, value: c.mockGrade, color: (CATEGORY_COLORS[c.category] || '#64748b') + '80' },
  ]);

  const maxVal = Math.max(...comparisons.map(c => Math.max(c.academicGrade, c.mockGrade)), 5);
  const barSvg = generateBarChart(barData, { yMax: Math.ceil(maxVal) + 1 });

  // Table rows
  const tableRows = comparisons.map(c => {
    const info = GAP_TYPE_INFO[c.gapType];
    const gapSign = c.gap > 0 ? '+' : '';
    return `<tr>
      <td class="text-left" style="font-weight:600">${c.category}</td>
      <td>${c.academicGrade.toFixed(2)}</td>
      <td>${c.mockGrade}</td>
      <td style="font-weight:700;${c.gap > 0 ? 'color:#dc2626' : c.gap < 0 ? 'color:#059669' : ''}">${gapSign}${c.gap.toFixed(2)}</td>
      <td><span class="grade-badge gap-type-${c.gapType}" style="padding:2px 8px">${info.label}</span></td>
    </tr>`;
  }).join('');

  // Overall summary row
  const overallGapSign = (avgMock - avgAcademic) > 0 ? '+' : '';
  const overallGap = avgMock - avgAcademic;

  return `
    <div class="print-section">
      <div class="print-section-title">
        <span class="tab-badge">성적분석</span>
        내신 vs 모의고사 괴리 분석
      </div>

      <div style="margin-bottom:16px;padding:10px 14px;border-radius:8px;${overallInfo.bgColor.replace('bg-', 'background:')}" class="gap-type-${overallGapType}" style="padding:10px 14px;border-radius:8px;margin-bottom:16px">
        <div style="font-weight:700;font-size:12px;margin-bottom:4px">종합 판정: ${overallInfo.label}</div>
        <div style="font-size:11px;color:#475569">${overallInfo.description} — ${overallInfo.recommendation}</div>
        <div style="font-size:10px;color:#64748b;margin-top:4px">내신 평균: ${avgAcademic.toFixed(2)} | 모의 평균: ${avgMock.toFixed(2)} | 괴리: ${overallGapSign}${overallGap.toFixed(2)}</div>
      </div>

      <div class="chart-container">${barSvg}</div>

      <table style="margin-top:12px">
        <thead>
          <tr>
            <th style="text-align:left">과목</th>
            <th>내신등급</th>
            <th>모의등급</th>
            <th>괴리</th>
            <th>유형</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          <tr class="total-row">
            <td class="text-left">전체 평균</td>
            <td>${avgAcademic.toFixed(2)}</td>
            <td>${avgMock.toFixed(2)}</td>
            <td style="font-weight:700">${overallGapSign}${overallGap.toFixed(2)}</td>
            <td><span class="grade-badge gap-type-${overallGapType}">${overallInfo.label}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
