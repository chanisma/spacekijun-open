import type { Student } from '../../../types';
import { generateLineChart, generateLegend, generateBarChart } from '../chartUtils';

const SUBJECT_COLORS: Record<string, string> = {
  '국어': '#3b82f6', '수학': '#ef4444', '영어': '#f59e0b',
  '한국사': '#8b5cf6', '사회탐구': '#14b8a6', '과학탐구': '#ec4899',
};
const FALLBACK_COLORS = ['#6366f1', '#a855f7', '#d946ef', '#f43f5e', '#0ea5e9', '#10b981', '#eab308', '#78716c', '#64748b', '#dc2626'];
const CHART_EXCLUDED = ['공통과학', '공통사회', '과학탐구', '사회탐구'];

// 수학/국어 계열 통합 (한 시험에 동일 계열 중복 없음 전제)
const SUBJECT_GROUP_MAP: Record<string, string> = {
  '수학': '수학', '확률과통계': '수학', '미적분': '수학', '기하': '수학',
  '국어': '국어', '언어와매체': '국어', '화법과작문': '국어',
};

function getSubjectGroup(s: string): string {
  return SUBJECT_GROUP_MAP[s] ?? s;
}

function pickGroupedValue<T>(
  exam: { subjects: Record<string, any> },
  group: string,
  extractor: (s: any) => T | null | undefined,
): T | null {
  for (const [subj, score] of Object.entries(exam.subjects)) {
    if (getSubjectGroup(subj) === group) {
      const v = extractor(score);
      if (v !== null && v !== undefined) return v;
    }
  }
  return null;
}

function getColor(s: string, i: number): string {
  return SUBJECT_COLORS[s] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];
}

function getSortedExams(student: Student) {
  return [...(student.mock_result || [])].sort((a, b) => {
    if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
    if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
    return a.exam_month - b.exam_month;
  });
}

function getChartSubjects(student: Student): string[] {
  const set = new Set<string>();
  (student.mock_result || []).forEach(exam => {
    Object.keys(exam.subjects).forEach(s => {
      if (!CHART_EXCLUDED.includes(s)) set.add(getSubjectGroup(s));
    });
  });
  return Array.from(set);
}

// ─── 표준점수 추이 ───
export function renderMockStandardTrend(student: Student): string | null {
  const sorted = getSortedExams(student);
  if (sorted.length === 0) return null;
  const subjects = getChartSubjects(student);
  const labels = sorted.map(e => `${e.exam_grade}-${e.exam_month}월`);

  const lines = subjects.map((subject, idx) => ({
    label: subject,
    color: getColor(subject, idx),
    values: sorted.map(exam => pickGroupedValue(exam, subject, s => s?.standard_score)),
  }));

  const hasData = lines.some(l => l.values.some(v => v !== null));
  if (!hasData) return null;

  const allValues = lines.flatMap(l => l.values).filter((v): v is number => v !== null);
  const yMin = Math.floor(Math.min(...allValues) / 10) * 10;
  const yMax = Math.ceil(Math.max(...allValues) / 10) * 10;
  const yTicks: number[] = [];
  for (let i = yMin; i <= yMax; i += 10) yTicks.push(i);

  const svg = generateLineChart(labels, lines, { yMin, yMax, yReversed: false, yTicks });
  const legend = generateLegend(subjects.map((s, i) => ({ label: s, color: getColor(s, i) })));

  return `
    <div class="print-section">
      <div class="print-section-title"><span class="tab-badge">모의고사</span>표준점수 추이</div>
      <div class="chart-container">${svg}</div>
      ${legend}
    </div>
  `;
}

// ─── 백분위 추이 ───
export function renderMockPercentileTrend(student: Student): string | null {
  const sorted = getSortedExams(student);
  if (sorted.length === 0) return null;
  const subjects = getChartSubjects(student);
  const labels = sorted.map(e => `${e.exam_grade}-${e.exam_month}월`);

  const lines = subjects.map((subject, idx) => ({
    label: subject,
    color: getColor(subject, idx),
    values: sorted.map(exam => pickGroupedValue(exam, subject, s => s?.percentile)),
  }));

  const hasData = lines.some(l => l.values.some(v => v !== null));
  if (!hasData) return null;

  const svg = generateLineChart(labels, lines, {
    yMin: 0, yMax: 100, yReversed: false,
    yTicks: [0, 20, 40, 60, 80, 100],
  });
  const legend = generateLegend(subjects.map((s, i) => ({ label: s, color: getColor(s, i) })));

  return `
    <div class="print-section">
      <div class="print-section-title"><span class="tab-badge">모의고사</span>백분위 추이</div>
      <div class="chart-container">${svg}</div>
      ${legend}
    </div>
  `;
}

// ─── 성적 변동성 분석 ───
function calcStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function renderMockVolatility(student: Student): string | null {
  const sorted = getSortedExams(student);
  if (sorted.length < 2) return null;
  const subjects = getChartSubjects(student);
  const labels = sorted.map(e => `${e.exam_grade}-${e.exam_month}월`);

  // Std dev bar chart
  const volatilityData = subjects
    .map((subject, idx) => {
      const grades = sorted
        .map(e => pickGroupedValue(e, subject, s => s?.grade))
        .filter((g): g is number => g !== null);
      if (grades.length < 2) return null;
      return { label: subject, value: parseFloat(calcStdDev(grades).toFixed(2)), color: getColor(subject, idx) };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => b.value - a.value);

  if (volatilityData.length === 0) return null;

  const barSvg = generateBarChart(volatilityData);

  // Delta table
  const deltaRows = subjects.map(subject => {
    const deltas: (number | null)[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) { deltas.push(null); continue; }
      const curr = pickGroupedValue(sorted[i], subject, s => s?.grade);
      const prev = pickGroupedValue(sorted[i - 1], subject, s => s?.grade);
      if (curr != null && prev != null) deltas.push(prev - curr);
      else deltas.push(null);
    }
    if (!deltas.some(d => d !== null)) return '';

    const cells = deltas.map(d => {
      if (d === null) return '<td><span style="color:#cbd5e1">-</span></td>';
      if (d > 0) return `<td style="color:#059669;font-weight:700">+${d}</td>`;
      if (d < 0) return `<td style="color:#dc2626;font-weight:700">${d}</td>`;
      return '<td style="color:#94a3b8">0</td>';
    }).join('');

    return `<tr><td class="text-left" style="font-weight:500">${subject}</td>${cells}</tr>`;
  }).filter(Boolean).join('');

  const headerCells = labels.map(l => `<th style="white-space:nowrap">${l}</th>`).join('');

  return `
    <div class="print-section">
      <div class="print-section-title"><span class="tab-badge">모의고사</span>성적 변동성 분석</div>
      <p style="font-size:10px;color:#64748b;margin-bottom:8px">과목별 등급 표준편차 (값이 클수록 변동이 큼)</p>
      <div class="chart-container">${barSvg}</div>
      <p style="font-size:10px;color:#64748b;margin:12px 0 8px">직전 시험 대비 등급 변화 (+ 상승, - 하락)</p>
      <table>
        <thead><tr><th style="text-align:left">과목</th>${headerCells}</tr></thead>
        <tbody>${deltaRows}</tbody>
      </table>
    </div>
  `;
}
