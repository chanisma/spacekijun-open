/**
 * 대입 전형 추이 분석 유틸리티
 * - 연도별 집계 데이터에 선형 외삽(linear extrapolation) 적용
 * - 다음 해 경쟁률·내신컷·수능백분위 예측
 * - 계열/전형 단위 트렌드 요약
 *
 * 기존 gradeAnalysisUtils.calcLinearRegression 패턴 확장
 */

import { calcLinearRegression, classifyTrend, type TrendType } from './gradeAnalysisUtils';

// ─── 타입 정의 ───

/** 연도별 집계된 전형 지표 (1행 = 1년) */
export interface YearlyAdmissionMetrics {
  year: number;
  /** 평균 경쟁률 */
  avg_competition_rate: number | null;
  /** 평균 내신 GPA 컷 (9등급제) */
  avg_gpa_cutoff: number | null;
  /** 평균 수능 백분위 */
  avg_csat_percentile: number | null;
  /** 총 모집인원 */
  total_quota: number | null;
  /** 총 지원자 수 */
  total_applicants: number | null;
  /** 평균 충원 합격자 */
  avg_additional_accepted: number | null;
  /** 데이터 건수 (집계에 사용된 전형 수) */
  record_count: number;
}

/** 단일 지표의 외삽 결과 */
export interface ExtrapolationResult {
  /** 예측 대상 연도 */
  target_year: number;
  /** 예측값 */
  predicted: number;
  /** 선형회귀 기울기 (연간 변화량) */
  slope: number;
  /** R² (적합도, 0~1) */
  r2: number;
  /** 추세 방향 */
  trend: TrendType;
  /** 입력 데이터 포인트 수 */
  data_points: number;
  /** 신뢰도 라벨 */
  confidence: 'high' | 'medium' | 'low';
  /** 원본 연도별 값 배열 [{ year, value }] */
  series: { year: number; value: number }[];
}

/** 전체 전형 지표 외삽 결과 묶음 */
export interface AdmissionExtrapolation {
  target_year: number;
  competition_rate: ExtrapolationResult | null;
  gpa_cutoff: ExtrapolationResult | null;
  csat_percentile: ExtrapolationResult | null;
  total_quota: ExtrapolationResult | null;
  total_applicants: ExtrapolationResult | null;
  additional_accepted: ExtrapolationResult | null;
  /** 분석 요약 마크다운 */
  summary_md: string;
}

// ─── 핵심 함수 ───

/**
 * 단일 지표 시계열에 선형 외삽을 적용하여 다음 해 예측값 산출
 *
 * @param series  - 연도-값 쌍 배열 (최소 2개 이상, null 제외 후)
 * @param targetYear - 예측 대상 연도
 * @param options - 추가 옵션 (값 하한/상한 클램핑)
 * @returns ExtrapolationResult 또는 데이터 부족 시 null
 */
export function extrapolateSeries(
  series: { year: number; value: number }[],
  targetYear: number,
  options: { min?: number; max?: number; trendThreshold?: number } = {},
): ExtrapolationResult | null {
  // null/NaN 제거 및 연도 오름차순 정렬
  const valid = series
    .filter((s) => s.value != null && !isNaN(s.value))
    .sort((a, b) => a.year - b.year);

  if (valid.length < 2) return null;

  const values = valid.map((s) => s.value);
  const years = valid.map((s) => s.year);

  // 연도 인덱스 기반 선형회귀 (기존 calcLinearRegression 활용)
  // calcLinearRegression는 0-indexed이므로, 연도를 인덱스로 변환
  const baseYear = years[0];
  const indices = years.map((y) => y - baseYear);

  // 직접 계산 (연도 간격이 불균등할 수 있으므로)
  const n = valid.length;
  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((s, x, i) => s + x * values[i], 0);
  const sumXX = indices.reduce((s, x) => s + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R²
  const meanY = sumY / n;
  const ssRes = values.reduce((s, y, i) => s + (y - (slope * indices[i] + intercept)) ** 2, 0);
  const ssTot = values.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  // 예측값 산출
  const targetIndex = targetYear - baseYear;
  let predicted = slope * targetIndex + intercept;

  // 값 클램핑 (경쟁률 < 0 방지 등)
  if (options.min !== undefined) predicted = Math.max(options.min, predicted);
  if (options.max !== undefined) predicted = Math.min(options.max, predicted);

  // 추세 분류 (경쟁률/인원은 증가=up, 등급은 gradeAnalysisUtils 기준)
  const threshold = options.trendThreshold ?? 0.05;
  let trend: TrendType;
  if (slope > threshold) trend = 'up';
  else if (slope < -threshold) trend = 'down';
  else trend = 'stable';

  // 신뢰도: R² + 데이터 포인트 수 기반
  const confidence = assessConfidence(r2, n);

  return {
    target_year: targetYear,
    predicted: Math.round(predicted * 100) / 100,
    slope: Math.round(slope * 1000) / 1000,
    r2: Math.round(r2 * 1000) / 1000,
    trend,
    data_points: n,
    confidence,
    series: valid,
  };
}

/**
 * 연도별 집계 데이터 전체에 선형 외삽을 일괄 적용
 *
 * @param yearlyData - 연도별 집계 배열 (YearlyAdmissionMetrics[])
 * @param targetYear - 예측 대상 연도 (기본: 마지막 연도 + 1)
 * @returns 전체 지표의 외삽 결과 + 마크다운 요약
 */
export function extrapolateAdmissionMetrics(
  yearlyData: YearlyAdmissionMetrics[],
  targetYear?: number,
): AdmissionExtrapolation {
  const sorted = [...yearlyData].sort((a, b) => a.year - b.year);
  const defaultTarget = sorted.length > 0 ? sorted[sorted.length - 1].year + 1 : new Date().getFullYear() + 1;
  const tYear = targetYear ?? defaultTarget;

  // 각 지표별 시계열 추출 & 외삽
  const competitionRate = extrapolateSeries(
    sorted.filter((d) => d.avg_competition_rate != null).map((d) => ({ year: d.year, value: d.avg_competition_rate! })),
    tYear,
    { min: 0 }, // 경쟁률 음수 방지
  );

  const gpaCutoff = extrapolateSeries(
    sorted.filter((d) => d.avg_gpa_cutoff != null).map((d) => ({ year: d.year, value: d.avg_gpa_cutoff! })),
    tYear,
    { min: 1, max: 9 }, // 9등급제 범위
  );

  const csatPercentile = extrapolateSeries(
    sorted.filter((d) => d.avg_csat_percentile != null).map((d) => ({ year: d.year, value: d.avg_csat_percentile! })),
    tYear,
    { min: 0, max: 100 }, // 백분위 범위
  );

  const totalQuota = extrapolateSeries(
    sorted.filter((d) => d.total_quota != null).map((d) => ({ year: d.year, value: d.total_quota! })),
    tYear,
    { min: 0 },
  );

  const totalApplicants = extrapolateSeries(
    sorted.filter((d) => d.total_applicants != null).map((d) => ({ year: d.year, value: d.total_applicants! })),
    tYear,
    { min: 0 },
  );

  const additionalAccepted = extrapolateSeries(
    sorted.filter((d) => d.avg_additional_accepted != null).map((d) => ({ year: d.year, value: d.avg_additional_accepted! })),
    tYear,
    { min: 0 },
  );

  // 마크다운 요약 생성
  const summary_md = buildExtrapolationSummary(tYear, {
    competition_rate: competitionRate,
    gpa_cutoff: gpaCutoff,
    csat_percentile: csatPercentile,
    total_quota: totalQuota,
    total_applicants: totalApplicants,
    additional_accepted: additionalAccepted,
  });

  return {
    target_year: tYear,
    competition_rate: competitionRate,
    gpa_cutoff: gpaCutoff,
    csat_percentile: csatPercentile,
    total_quota: totalQuota,
    total_applicants: totalApplicants,
    additional_accepted: additionalAccepted,
    summary_md,
  };
}

// ─── 보조 함수 ───

/** R² 및 데이터 포인트 수 기반 신뢰도 평가 */
function assessConfidence(r2: number, dataPoints: number): 'high' | 'medium' | 'low' {
  if (dataPoints >= 4 && r2 >= 0.7) return 'high';
  if (dataPoints >= 3 && r2 >= 0.4) return 'medium';
  return 'low';
}

/** 추세 방향을 한글 라벨로 변환 */
function trendLabel(trend: TrendType, metricType: 'rate' | 'grade' | 'score'): string {
  // grade(등급): 숫자 증가 = 하락, 숫자 감소 = 상승
  if (metricType === 'grade') {
    if (trend === 'up') return '하락 (등급↑)';
    if (trend === 'down') return '상승 (등급↓)';
    return '유지';
  }
  // rate/score: 숫자 증가 = 상승
  if (trend === 'up') return '상승↑';
  if (trend === 'down') return '하락↓';
  return '유지→';
}

/** 신뢰도 이모지 */
function confidenceEmoji(c: 'high' | 'medium' | 'low'): string {
  if (c === 'high') return '●';
  if (c === 'medium') return '◐';
  return '○';
}

/** 외삽 결과를 마크다운 테이블 행으로 변환 */
function formatResultRow(
  label: string,
  unit: string,
  result: ExtrapolationResult | null,
  metricType: 'rate' | 'grade' | 'score',
): string {
  if (!result) return `| ${label} | - | - | - | 데이터 부족 |`;

  const seriesStr = result.series.map((s) => `${s.year}: ${s.value}`).join(' → ');
  const trendStr = trendLabel(result.trend, metricType);
  const confStr = `${confidenceEmoji(result.confidence)} ${result.confidence}`;

  return `| ${label} | ${result.predicted}${unit} | ${trendStr} (기울기 ${result.slope > 0 ? '+' : ''}${result.slope}/년) | R²=${result.r2} | ${confStr} (n=${result.data_points}) |`;
}

/** 전체 외삽 결과를 마크다운 요약으로 생성 */
function buildExtrapolationSummary(
  targetYear: number,
  results: {
    competition_rate: ExtrapolationResult | null;
    gpa_cutoff: ExtrapolationResult | null;
    csat_percentile: ExtrapolationResult | null;
    total_quota: ExtrapolationResult | null;
    total_applicants: ExtrapolationResult | null;
    additional_accepted: ExtrapolationResult | null;
  },
): string {
  const lines: string[] = [];

  lines.push(`### ${targetYear}년 예측 (선형 외삽)`);
  lines.push('');
  lines.push('| 지표 | 예측값 | 추세 | 적합도 | 신뢰도 |');
  lines.push('|------|--------|------|--------|--------|');

  lines.push(formatResultRow('경쟁률', ':1', results.competition_rate, 'rate'));
  lines.push(formatResultRow('내신컷(70%)', '등급', results.gpa_cutoff, 'grade'));
  lines.push(formatResultRow('수능백분위', '%', results.csat_percentile, 'score'));
  lines.push(formatResultRow('모집인원', '명', results.total_quota, 'rate'));
  lines.push(formatResultRow('지원자수', '명', results.total_applicants, 'rate'));
  lines.push(formatResultRow('충원합격', '명', results.additional_accepted, 'rate'));

  lines.push('');
  lines.push('> ※ 선형 외삽 기반 단순 추세 연장 — 정책 변경·입시 제도 개편 시 괴리 가능');

  // 주요 인사이트 자동 생성
  const insights: string[] = [];

  if (results.competition_rate?.trend === 'up') {
    insights.push(`- 경쟁률 상승 추세: 연평균 +${results.competition_rate.slope}/년 증가 → 지원 시 상향 조정 유의`);
  } else if (results.competition_rate?.trend === 'down') {
    insights.push(`- 경쟁률 하락 추세: 연평균 ${results.competition_rate.slope}/년 감소 → 진입 기회 확대 가능`);
  }

  if (results.gpa_cutoff?.trend === 'down') {
    // 등급 숫자 감소 = 커트라인 상승 (더 높은 성적 요구)
    insights.push(`- 내신컷 강화 추세: 커트라인이 연평균 ${Math.abs(results.gpa_cutoff.slope)}등급씩 상승 → 성적 관리 강화 필요`);
  } else if (results.gpa_cutoff?.trend === 'up') {
    insights.push(`- 내신컷 완화 추세: 커트라인이 연평균 +${results.gpa_cutoff.slope}등급씩 하락 → 합격 가능성 확대`);
  }

  if (results.total_quota?.trend === 'down' && results.total_quota.slope < -5) {
    insights.push(`- 모집인원 감소 추세: 연 ${Math.abs(Math.round(results.total_quota.slope))}명씩 축소 → 경쟁 심화 예상`);
  }

  if (insights.length > 0) {
    lines.push('');
    lines.push('**주요 시사점**:');
    lines.push(...insights);
  }

  return lines.join('\n');
}

// ─── 집계 헬퍼 (SQL 결과 → YearlyAdmissionMetrics 변환) ───

/** 개별 전형 레코드 (univ_admissions 테이블 1행) */
export interface AdmissionRecord {
  year: number;
  university_name: string;
  department: string;
  admission_period: string;
  admission_type: string;
  admission_category: string;
  quota: number;
  applicants: number;
  competition_rate: number;
  gpa_cutoff: number;
  csat_percentile: number;
  additional_accepted: number;
}

/**
 * 개별 전형 레코드 배열을 연도별 집계 지표로 변환
 *
 * @param records - univ_admissions 쿼리 결과
 * @param filter  - 집계 전 필터 (전형유형, 계열 등)
 * @returns 연도별 집계 배열
 */
export function aggregateByYear(
  records: AdmissionRecord[],
  filter?: {
    admissionCategory?: string;     // '교과' | '종합' | '수능'
    admissionPeriod?: string;       // '수시' | '정시%'
    minCompetitionRate?: number;    // 경쟁률 최솟값 필터
  },
): YearlyAdmissionMetrics[] {
  let filtered = records;

  if (filter?.admissionCategory) {
    filtered = filtered.filter((r) => r.admission_category === filter.admissionCategory);
  }
  if (filter?.admissionPeriod) {
    if (filter.admissionPeriod.includes('%')) {
      const prefix = filter.admissionPeriod.replace('%', '');
      filtered = filtered.filter((r) => r.admission_period.startsWith(prefix));
    } else {
      filtered = filtered.filter((r) => r.admission_period === filter.admissionPeriod);
    }
  }
  if (filter?.minCompetitionRate !== undefined) {
    filtered = filtered.filter((r) => r.competition_rate >= filter.minCompetitionRate!);
  }

  // 연도별 그룹핑
  const byYear = new Map<number, AdmissionRecord[]>();
  for (const r of filtered) {
    const group = byYear.get(r.year) || [];
    group.push(r);
    byYear.set(r.year, group);
  }

  const result: YearlyAdmissionMetrics[] = [];

  for (const [year, group] of byYear) {
    const validCompRate = group.filter((r) => r.competition_rate > 0);
    const validGpa = group.filter((r) => r.gpa_cutoff > 0);
    const validCsat = group.filter((r) => r.csat_percentile > 0);

    result.push({
      year,
      avg_competition_rate: validCompRate.length > 0
        ? Math.round((validCompRate.reduce((s, r) => s + r.competition_rate, 0) / validCompRate.length) * 100) / 100
        : null,
      avg_gpa_cutoff: validGpa.length > 0
        ? Math.round((validGpa.reduce((s, r) => s + r.gpa_cutoff, 0) / validGpa.length) * 100) / 100
        : null,
      avg_csat_percentile: validCsat.length > 0
        ? Math.round((validCsat.reduce((s, r) => s + r.csat_percentile, 0) / validCsat.length) * 100) / 100
        : null,
      total_quota: group.reduce((s, r) => s + (r.quota || 0), 0),
      total_applicants: group.reduce((s, r) => s + (r.applicants || 0), 0),
      avg_additional_accepted: group.length > 0
        ? Math.round((group.reduce((s, r) => s + (r.additional_accepted || 0), 0) / group.length) * 100) / 100
        : null,
      record_count: group.length,
    });
  }

  return result.sort((a, b) => a.year - b.year);
}

/**
 * 전형유형별 비교 외삽 — 교과/종합/정시를 한번에 비교
 *
 * @param records - 전체 전형 레코드
 * @param targetYear - 예측 대상 연도
 * @returns 전형유형별 외삽 결과 + 비교 마크다운
 */
export function extrapolateByAdmissionType(
  records: AdmissionRecord[],
  targetYear?: number,
): {
  교과: AdmissionExtrapolation;
  종합: AdmissionExtrapolation;
  정시: AdmissionExtrapolation;
  comparison_md: string;
} {
  const 교과Data = aggregateByYear(records, { admissionCategory: '교과', admissionPeriod: '수시' });
  const 종합Data = aggregateByYear(records, { admissionCategory: '종합', admissionPeriod: '수시' });
  const 정시Data = aggregateByYear(records, { admissionPeriod: '정시%' });

  const 교과 = extrapolateAdmissionMetrics(교과Data, targetYear);
  const 종합 = extrapolateAdmissionMetrics(종합Data, targetYear);
  const 정시 = extrapolateAdmissionMetrics(정시Data, targetYear);

  const tYear = 교과.target_year;

  // 비교 마크다운
  const lines: string[] = [];
  lines.push(`### 전형유형별 ${tYear}년 예측 비교`);
  lines.push('');
  lines.push('| 전형 | 예측 경쟁률 | 예측 내신컷 | 추세 | 데이터 |');
  lines.push('|------|-----------|-----------|------|--------|');

  for (const [label, ext] of [['수시 교과', 교과], ['수시 종합', 종합], ['정시', 정시]] as const) {
    const cr = ext.competition_rate;
    const gpa = ext.gpa_cutoff;
    const crStr = cr ? `${cr.predicted}:1` : '-';
    const gpaStr = gpa ? `${gpa.predicted}등급` : '-';
    const trendStr = cr ? trendLabel(cr.trend, 'rate') : '-';
    const nStr = cr ? `${cr.data_points}년` : '0년';
    lines.push(`| ${label} | ${crStr} | ${gpaStr} | ${trendStr} | ${nStr} |`);
  }

  lines.push('');
  lines.push('> 교과 = 내신 위주, 종합 = 서류+면접, 정시 = 수능 위주');

  return {
    교과,
    종합,
    정시,
    comparison_md: lines.join('\n'),
  };
}
