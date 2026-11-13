import type { Student } from '../../../types';
import { generateLineChart, generateLegend } from '../chartUtils';
import { calcLinearRegression, classifyTrend, calcConsecutiveTrend } from '../../../utils/gradeAnalysisUtils';

const SUBJECT_COLORS: Record<string, string> = {
  '전과목': '#22c55e', '국어': '#3b82f6', '수학': '#ef4444',
  '영어': '#f59e0b', '한국사': '#8b5cf6', '사회탐구': '#14b8a6', '과학탐구': '#ec4899',
};
const FALLBACK_COLORS = ['#6366f1', '#a855f7', '#d946ef', '#f43f5e', '#0ea5e9', '#10b981', '#eab308'];
const CHART_EXCLUDED = ['공통과학', '공통사회', '과학탐구', '사회탐구'];

// 수학/국어 계열 통합 (한 시험에 동일 계열 중복 없음 전제)
const SUBJECT_GROUP_MAP: Record<string, string> = {
  '수학': '수학', '확률과통계': '수학', '미적분': '수학', '기하': '수학',
  '국어': '국어', '언어와매체': '국어', '화법과작문': '국어',
};

function getSubjectGroup(s: string): string {
  return SUBJECT_GROUP_MAP[s] ?? s;
}

function getColor(s: string, i: number): string {
  return SUBJECT_COLORS[s] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
}

const TREND_LABELS: Record<string, string> = { up: '상승', down: '하락', stable: '유지' };
const TREND_COLORS: Record<string, string> = { up: '#059669', down: '#dc2626', stable: '#64748b' };

export function renderTrendPrediction(student: Student): string | null {
  const exams = student.mock_result;
  if (!exams || exams.length < 2) return null;

  const sorted = [...exams].sort((a, b) => {
    if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
    if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
    return a.exam_month - b.exam_month;
  });

  const labels = sorted.map(e => `${e.exam_grade}-${e.exam_month}월`);
  // 수학/국어 계열은 그룹명으로 통합 (한 시험 내 중복 없음 전제)
  const subjects = new Set<string>();
  sorted.forEach(exam => {
    Object.keys(exam.subjects).forEach(s => {
      if (!CHART_EXCLUDED.includes(s)) subjects.add(getSubjectGroup(s));
    });
  });
  const chartSubjects = ['전과목', ...Array.from(subjects)];

  // Build trend data + predictions
  const lines = chartSubjects.map((subject, idx) => {
    const values = sorted.map(exam => {
      if (subject === '전과목') {
        const grades = Object.values(exam.subjects).map(s => s.grade).filter((g): g is number => g !== null);
        return grades.length > 0 ? parseFloat((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2)) : null;
      }
      // 해당 그룹에 속하는 과목 중 등급이 있는 첫 항목 반환
      for (const [subj, score] of Object.entries(exam.subjects)) {
        if (getSubjectGroup(subj) === subject && score?.grade !== null && score?.grade !== undefined) {
          return score.grade;
        }
      }
      return null;
    });

    return {
      label: subject,
      color: getColor(subject, idx),
      strokeWidth: subject === '전과목' ? 3 : 2,
      values,
    };
  });

  // Add prediction point
  const extLabels = [...labels, '예측'];
  const extLines = lines.map(line => {
    const valid = line.values.filter((v): v is number => v !== null);
    let predicted: number | null = null;
    if (valid.length >= 2) {
      const reg = calcLinearRegression(valid);
      predicted = parseFloat(Math.max(1, Math.min(9, reg.predict(valid.length))).toFixed(2));
    }
    return { ...line, values: [...line.values, predicted] };
  });

  const svg = generateLineChart(extLabels, extLines, {
    yMin: 1, yMax: 9, yReversed: true,
    yTicks: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    width: 750,
  });
  const legend = generateLegend(chartSubjects.map((s, i) => ({ label: s, color: getColor(s, i) })));

  // Momentum cards
  const momentumRows = chartSubjects.slice(0, 8).map((subject, idx) => {
    const values = lines[idx].values.filter((v): v is number => v !== null);
    if (values.length < 2) return '';

    const trend = classifyTrend(values);
    const consecutive = calcConsecutiveTrend(values);
    const reg = calcLinearRegression(values);
    const predicted = Math.max(1, Math.min(9, reg.predict(values.length)));

    return `<tr>
      <td class="text-left" style="font-weight:600">${subject}</td>
      <td style="color:${TREND_COLORS[trend]};font-weight:700">${TREND_LABELS[trend]}</td>
      <td>${consecutive.count > 0 ? `${consecutive.count}회 연속` : '-'}</td>
      <td>${values[values.length - 1].toFixed(2)}</td>
      <td style="font-weight:600">${predicted.toFixed(2)}</td>
    </tr>`;
  }).filter(Boolean).join('');

  return `
    <div class="print-section">
      <div class="print-section-title"><span class="tab-badge">성적분석</span>성적 추이 분석 & 성장 예측</div>
      <div class="chart-container">${svg}</div>
      ${legend}
      <p style="font-size:9px;color:#94a3b8;text-align:center;margin-top:4px">* 마지막 점은 선형회귀 기반 예측값</p>
      ${momentumRows ? `
      <table style="margin-top:12px">
        <thead><tr>
          <th style="text-align:left">과목</th>
          <th>추세</th>
          <th>연속성</th>
          <th>현재</th>
          <th>예측</th>
        </tr></thead>
        <tbody>${momentumRows}</tbody>
      </table>` : ''}
    </div>
  `;
}
