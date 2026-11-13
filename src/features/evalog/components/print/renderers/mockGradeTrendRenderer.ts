import type { Student } from '../../../types';
import type { MockExamResult } from '../../../types/pdfTypes';
import { generateLineChart, generateLegend } from '../chartUtils';

const SUBJECT_COLORS: Record<string, string> = {
  '전과목': '#22c55e',
  '국어': '#3b82f6',
  '수학': '#ef4444',
  '영어': '#f59e0b',
  '한국사': '#8b5cf6',
  '사회탐구': '#14b8a6',
  '과학탐구': '#ec4899',
};

const FALLBACK_COLORS = [
  '#6366f1', '#a855f7', '#d946ef', '#f43f5e', '#0ea5e9',
  '#10b981', '#eab308', '#78716c', '#64748b', '#dc2626',
];

const CHART_EXCLUDED = ['공통과학', '공통사회', '과학탐구', '사회탐구'];

// 수학/국어 계열 통합 (한 시험에 동일 계열 과목 중복 없음 전제)
const SUBJECT_GROUP_MAP: Record<string, string> = {
  '수학': '수학',
  '확률과통계': '수학',
  '미적분': '수학',
  '기하': '수학',
  '국어': '국어',
  '언어와매체': '국어',
  '화법과작문': '국어',
};

function getSubjectGroup(subject: string): string {
  return SUBJECT_GROUP_MAP[subject] ?? subject;
}

function getColor(subject: string, idx: number): string {
  return SUBJECT_COLORS[subject] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

export function renderMockGradeTrend(student: Student): string | null {
  const exams = student.mock_result;
  if (!exams || exams.length === 0) return null;

  const sorted = [...exams].sort((a, b) => {
    if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
    if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
    return a.exam_month - b.exam_month;
  });

  const labels = sorted.map(e => `${e.exam_grade}-${e.exam_month}월`);

  // Collect all subjects (excluding certain categories), 수학/국어 계열은 그룹명으로 통합
  const allSubjects = new Set<string>();
  sorted.forEach(exam => {
    Object.keys(exam.subjects).forEach(s => {
      if (!CHART_EXCLUDED.includes(s)) allSubjects.add(getSubjectGroup(s));
    });
  });
  const subjects = Array.from(allSubjects);

  // Build lines: 전과목 + grouped subjects
  const allLines = ['전과목', ...subjects];
  const lines = allLines.map((subject, idx) => ({
    label: subject,
    color: getColor(subject, idx),
    strokeWidth: subject === '전과목' ? 3 : 2,
    values: sorted.map(exam => {
      if (subject === '전과목') {
        const grades = Object.values(exam.subjects)
          .map(s => s.grade)
          .filter((g): g is number => g !== null);
        return grades.length > 0
          ? parseFloat((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2))
          : null;
      }
      // 해당 그룹에 속하는 과목 중 등급이 있는 첫 항목 반환 (시험 내 중복 없음)
      for (const [subj, score] of Object.entries(exam.subjects)) {
        if (getSubjectGroup(subj) === subject && score?.grade !== null && score?.grade !== undefined) {
          return score.grade;
        }
      }
      return null;
    }),
  }));

  const hasData = lines.some(l => l.values.some(v => v !== null));
  if (!hasData) return null;

  const svgChart = generateLineChart(labels, lines, {
    yMin: 1,
    yMax: 9,
    yReversed: true,
    yTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  });

  const legend = generateLegend(
    allLines.map((s, i) => ({ label: s, color: getColor(s, i) }))
  );

  return `
    <div class="print-section">
      <div class="print-section-title">
        <span class="tab-badge">모의고사</span>
        등급 추이도
      </div>
      <div class="chart-container">${svgChart}</div>
      ${legend}
    </div>
  `;
}
