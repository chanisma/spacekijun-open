import React, { useState, useMemo } from 'react';
import { Student } from '../../types';
import { Section6Record } from '../../types/pdfTypes';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus, Info, ChevronDown, ChevronUp,
  Target, BarChart3, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawLineProps } from '@/lib/chartAnimation';
import {
  calcLinearRegression,
  classifyTrend,
  calcConsecutiveTrend,
  calcWeightedAverage,
  classifyGapType,
  GAP_TYPE_INFO,
  MATCHABLE_CATEGORIES,
  is5GradeSystem,
  convert5To9Grade,
  maxGrade,
  mockSubjectToCategory,
  type TrendType,
  type GapType,
} from '../../utils/gradeAnalysisUtils';

interface GradeAnalysisProps {
  student: Student;
}

// ─── 색상 상수 ───

const SUBJECT_COLORS: Record<string, string> = {
  '전과목': '#22c55e',
  '국어': '#3b82f6',
  '수학': '#ef4444',
  '영어': '#f59e0b',
  '한국사': '#8b5cf6',
  '사회': '#14b8a6',
  '과학': '#ec4899',
  '사회탐구': '#14b8a6',
  '과학탐구': '#ec4899',
};

const FALLBACK_COLORS = [
  '#6366f1', '#a855f7', '#d946ef', '#f43f5e', '#0ea5e9',
  '#10b981', '#eab308', '#78716c', '#64748b', '#dc2626',
];

const getSubjectColor = (subject: string, index: number): string => {
  return SUBJECT_COLORS[subject] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
};

// 수학 계열(수학/확률과통계/미적분/기하)과 국어 계열(국어/언어와매체/화법과작문)은
// 차트에서 하나의 라인으로 통합. 한 시험에 동일 계열 과목 중복 없음 전제.
const SUBJECT_GROUP_MAP: Record<string, string> = {
  '수학': '수학', '확률과통계': '수학', '미적분': '수학', '기하': '수학',
  '국어': '국어', '언어와매체': '국어', '화법과작문': '국어',
};

const getSubjectGroup = (subject: string): string => {
  return SUBJECT_GROUP_MAP[subject] ?? subject;
};

const pickGroupedGrade = (
  exam: { subjects: Record<string, any> },
  groupName: string
): { value: number | null; source: string | null } => {
  for (const [subj, score] of Object.entries(exam.subjects)) {
    if (getSubjectGroup(subj) === groupName) {
      if (score?.grade !== null && score?.grade !== undefined) {
        return { value: score.grade, source: subj !== groupName ? subj : null };
      }
    }
  }
  return { value: null, source: null };
};

// 그룹에 속한 과목 중 특정 필드(standard_score | percentile)의 값을 추출
const pickGroupedField = (
  exam: { subjects: Record<string, any> },
  groupName: string,
  field: 'standard_score' | 'percentile' | 'grade'
): number | null => {
  for (const [subj, score] of Object.entries(exam.subjects)) {
    if (getSubjectGroup(subj) === groupName) {
      const v = score?.[field];
      if (v !== null && v !== undefined) return v;
    }
  }
  return null;
};

const SRC_PREFIX = '__src_';

// 학생 자신의 과거 (x, 등급) 쌍으로 학습한 선형 변환식으로 예측 등급을 계산
// pairs가 부족하면 표준 백분위 컷(percentile일 때만)으로 fallback
const PERCENTILE_CUTS = [96, 89, 77, 60, 40, 23, 11, 4]; // index i → 등급 i+1의 하한 백분위

const percentileToGradeStandard = (p: number): number => {
  for (let i = 0; i < PERCENTILE_CUTS.length; i++) {
    if (p >= PERCENTILE_CUTS[i]) return i + 1;
  }
  return 9;
};

const predictGradeFromSignal = (
  pairs: Array<[number, number]>, // [(value, grade), ...]
  predictedValue: number,
  fallbackTransform?: (v: number) => number,
): number | null => {
  if (pairs.length >= 2) {
    // (value, grade) 선형회귀로 학생별 변환식 학습
    const n = pairs.length;
    const sumX = pairs.reduce((s, [x]) => s + x, 0);
    const sumY = pairs.reduce((s, [, y]) => s + y, 0);
    const sumXY = pairs.reduce((s, [x, y]) => s + x * y, 0);
    const sumXX = pairs.reduce((s, [x]) => s + x * x, 0);
    const denom = n * sumXX - sumX * sumX;
    if (denom !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      const g = slope * predictedValue + intercept;
      return Math.max(1, Math.min(9, g));
    }
  }
  if (fallbackTransform) {
    return Math.max(1, Math.min(9, fallbackTransform(predictedValue)));
  }
  return null;
};

const getGradeColor = (grade: number): string => {
  if (grade <= 2) return 'bg-emerald-50 text-emerald-700';
  if (grade <= 4) return 'bg-blue-50 text-blue-700';
  if (grade <= 6) return 'bg-amber-50 text-amber-700';
  if (grade <= 8) return 'bg-orange-50 text-orange-700';
  return 'bg-red-50 text-red-700';
};

const getGradeColor5 = (grade: number): string => {
  if (grade <= 1) return 'bg-emerald-50 text-emerald-700'; // A
  if (grade <= 2) return 'bg-blue-50 text-blue-700';       // B
  if (grade <= 3) return 'bg-amber-50 text-amber-700';     // C
  if (grade <= 4) return 'bg-orange-50 text-orange-700';   // D
  return 'bg-red-50 text-red-700';                          // E
};

const getTrendIcon = (trend: TrendType) => {
  switch (trend) {
    case 'up': return <TrendingUp size={16} className="text-emerald-600" />;
    case 'down': return <TrendingDown size={16} className="text-red-500" />;
    default: return <Minus size={16} className="text-slate-400" />;
  }
};

const getTrendLabel = (trend: TrendType) => {
  switch (trend) {
    case 'up': return '상승';
    case 'down': return '하락';
    default: return '유지';
  }
};

const getTrendColor = (trend: TrendType) => {
  switch (trend) {
    case 'up': return 'text-emerald-600 bg-emerald-50';
    case 'down': return 'text-red-600 bg-red-50';
    default: return 'text-slate-500 bg-slate-50';
  }
};

// ─── 접기/펼치기 Info 박스 ───

const InfoBox: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
      >
        <Info size={14} />
        <span className="font-medium">{title}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-slate-600 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
};

// ─── 섹션 접기/펼치기 래퍼 ───

const CollapsibleSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}> = ({ title, icon, defaultOpen = true, children, badge }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-panel p-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between mb-0 pb-2 border-b border-gray-100/50"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            {icon}
          </div>
          <h3 className="font-semibold text-slate-800">{title}</h3>
          {badge}
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
};

// ─── 메인 컴포넌트 ───

const GradeAnalysis: React.FC<GradeAnalysisProps> = ({ student }) => {
  const hasMockData = !!student.mock_result && student.mock_result.length > 0;
  const hasAcademicData = !!student.section6_academic_development && student.section6_academic_development.length > 0;

  if (!hasMockData && !hasAcademicData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <BarChart3 size={48} className="text-slate-300" />
        <p className="text-sm font-medium">성적 데이터가 없습니다</p>
        <p className="text-xs text-slate-400">모의고사 또는 교과성적 데이터가 필요합니다</p>
      </div>
    );
  }

  return (
    <div className="relative isolate">
      <div className="space-y-8">
        {hasMockData && <SectionA student={student} />}
        {hasMockData && hasAcademicData && <SectionB student={student} />}
        {hasAcademicData && <SectionC student={student} />}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// 섹션 A: 성적 추이 분석 & 성장 예측
// ═══════════════════════════════════════════

const SectionA: React.FC<{ student: Student }> = ({ student }) => {
  const [activeSubjects, setActiveSubjects] = useState<Set<string>>(new Set());
  const [activePctSubjects, setActivePctSubjects] = useState<Set<string>>(new Set());

  const sortedExams = useMemo(() =>
    [...(student.mock_result || [])]
      .sort((a, b) => {
        if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
        if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
        return a.exam_month - b.exam_month;
      }),
    [student.mock_result]
  );

  const examLabels = useMemo(() =>
    sortedExams.map(e => `${e.exam_grade}-${e.exam_month}월`),
    [sortedExams]
  );

  const CHART_EXCLUDED = ['공통과학', '공통사회', '과학탐구', '사회탐구'];
  // 수학/국어 계열 과목은 그룹명(수학, 국어)으로 통합하여 한 라인으로 표시
  const chartSubjects = useMemo(() => {
    const set = new Set<string>();
    sortedExams.forEach(exam => {
      Object.keys(exam.subjects).forEach(s => {
        if (!CHART_EXCLUDED.includes(s)) set.add(getSubjectGroup(s));
      });
    });
    return Array.from(set);
  }, [sortedExams]);

  // Initialize defaults
  useMemo(() => {
    if (chartSubjects.length > 0 && activeSubjects.size === 0) {
      const defaults = chartSubjects.filter(s =>
        ['국어', '수학', '영어'].includes(s)
      );
      setActiveSubjects(new Set(defaults.length > 0 ? defaults : chartSubjects.slice(0, 3)));
    }
  }, [chartSubjects]);

  // 과목별 분석 데이터
  const subjectAnalysis = useMemo(() => {
    return chartSubjects.map((subject, idx) => {
      // 수학/국어 계열은 그룹 단위로 통합된 시계열로 회귀
      const grades = sortedExams
        .map(e => pickGroupedField(e, subject, 'grade'))
        .filter((g): g is number => g !== null);

      if (grades.length < 2) return null;

      const trend = classifyTrend(grades);
      const consecutive = calcConsecutiveTrend(grades);
      const regression = calcLinearRegression(grades);

      // 등급 기반 예측 (fallback)
      const predictedGradeRaw = regression.predict(grades.length);

      // 백분위/표준점수 시계열 수집 (등급과 인덱스 짝 맞춤 위해 모든 시험 순회)
      const percentilePairs: Array<[number, number]> = []; // (백분위, 등급)
      const standardPairs: Array<[number, number]> = [];   // (표준점수, 등급)
      const percentileSeries: number[] = [];
      const standardSeries: number[] = [];

      sortedExams.forEach(exam => {
        const g = pickGroupedField(exam, subject, 'grade');
        const p = pickGroupedField(exam, subject, 'percentile');
        const s = pickGroupedField(exam, subject, 'standard_score');
        if (p !== null) percentileSeries.push(p);
        if (s !== null) standardSeries.push(s);
        if (g !== null && p !== null) percentilePairs.push([p, g]);
        if (g !== null && s !== null) standardPairs.push([s, g]);
      });

      // 백분위/표준점수 회귀로 다음 값 예측 → 등급 환산
      let predictedFromPercentile: number | null = null;
      let nextPercentileValue: number | null = null;
      if (percentileSeries.length >= 2) {
        const pReg = calcLinearRegression(percentileSeries);
        // 백분위는 0~100으로 clamp
        nextPercentileValue = Math.max(0, Math.min(100, pReg.predict(percentileSeries.length)));
        predictedFromPercentile = predictGradeFromSignal(percentilePairs, nextPercentileValue, percentileToGradeStandard);
      }

      let predictedFromStandard: number | null = null;
      if (standardSeries.length >= 2) {
        const sReg = calcLinearRegression(standardSeries);
        const nextStd = sReg.predict(standardSeries.length);
        predictedFromStandard = predictGradeFromSignal(standardPairs, nextStd);
      }

      // 우선순위: 백분위 → 표준점수 → 등급 fallback
      let predictedSource: 'percentile' | 'standard' | 'grade' = 'grade';
      let predictedContinuous: number = predictedGradeRaw;
      if (predictedFromPercentile !== null) {
        predictedSource = 'percentile';
        predictedContinuous = predictedFromPercentile;
      } else if (predictedFromStandard !== null) {
        predictedSource = 'standard';
        predictedContinuous = predictedFromStandard;
      }

      const predictedNext = Math.max(1, Math.min(9, Math.round(predictedContinuous)));

      return {
        subject,
        grades,
        trend,
        consecutive,
        regression,
        predictedNext,
        predictedContinuous: parseFloat(predictedContinuous.toFixed(2)),
        predictedSource,
        percentileSeries,
        nextPercentile: nextPercentileValue !== null ? parseFloat(nextPercentileValue.toFixed(1)) : null,
        color: getSubjectColor(subject, idx),
      };
    }).filter((d): d is NonNullable<typeof d> => d !== null);
  }, [chartSubjects, sortedExams]);

  // 추이 차트 데이터 (예측 포함, 수학/국어 계열은 그룹 단위로 통합)
  const trendData = useMemo(() => {
    const data = sortedExams.map((exam, i) => {
      const entry: any = { label: examLabels[i], type: 'actual' };
      chartSubjects.forEach(subject => {
        const picked = pickGroupedGrade(exam, subject);
        entry[subject] = picked.value;
        if (picked.source) entry[`${SRC_PREFIX}${subject}`] = picked.source;
      });
      return entry;
    });

    // 예측 데이터 추가
    const predEntry: any = { label: '예측', type: 'predicted' };
    let hasPrediction = false;
    subjectAnalysis.forEach(sa => {
      if (activeSubjects.has(sa.subject)) {
        predEntry[sa.subject] = sa.predictedNext;
        hasPrediction = true;
      }
    });
    if (hasPrediction) data.push(predEntry);

    return data;
  }, [sortedExams, examLabels, chartSubjects, subjectAnalysis, activeSubjects]);

  // 백분위 데이터가 있는 과목만 별도 차트 노출 대상
  const percentileSubjects = useMemo(() =>
    subjectAnalysis.filter(sa => sa.percentileSeries.length >= 2).map(sa => sa.subject),
    [subjectAnalysis]
  );

  // 백분위 차트 기본 활성화 (등급 차트와 같은 과목 우선)
  useMemo(() => {
    if (percentileSubjects.length > 0 && activePctSubjects.size === 0) {
      const defaults = percentileSubjects.filter(s => ['국어', '수학', '영어'].includes(s));
      setActivePctSubjects(new Set(defaults.length > 0 ? defaults : percentileSubjects.slice(0, 3)));
    }
  }, [percentileSubjects]);

  // 백분위 추이 데이터 (예측 포함)
  const percentileTrendData = useMemo(() => {
    if (percentileSubjects.length === 0) return [];
    const data = sortedExams.map((exam, i) => {
      const entry: any = { label: examLabels[i], type: 'actual' };
      percentileSubjects.forEach(subject => {
        // 백분위 값이 있는 변형 과목을 직접 찾아서 값과 source를 함께 추출
        for (const [subj, score] of Object.entries(exam.subjects)) {
          if (getSubjectGroup(subj) === subject && score?.percentile !== null && score?.percentile !== undefined) {
            entry[subject] = score.percentile;
            if (subj !== subject) entry[`${SRC_PREFIX}${subject}`] = subj;
            break;
          }
        }
        if (entry[subject] === undefined) entry[subject] = null;
      });
      return entry;
    });

    const predEntry: any = { label: '예측', type: 'predicted' };
    let hasPrediction = false;
    subjectAnalysis.forEach(sa => {
      if (activePctSubjects.has(sa.subject) && sa.nextPercentile !== null) {
        predEntry[sa.subject] = sa.nextPercentile;
        hasPrediction = true;
      }
    });
    if (hasPrediction) data.push(predEntry);
    return data;
  }, [sortedExams, examLabels, percentileSubjects, subjectAnalysis, activePctSubjects]);

  const togglePctSubject = (subject: string) => {
    setActivePctSubjects(prev => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  };

  const toggleSubject = (subject: string) => {
    setActiveSubjects(prev => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  };

  return (
    <CollapsibleSection
      title="성적 추이 분석 & 성장 예측"
      icon={<TrendingUp size={18} />}
      badge={
        <span className="text-[10px] font-normal text-slate-400 ml-2">모의고사 기반</span>
      }
    >
      <InfoBox title="분석 원리 보기">
        <p className="mb-1"><strong>3중 회귀 예측</strong>: 등급 외에도 표준점수·백분위가 있으면 각각 선형회귀로 다음 값을 예측한 뒤, 학생 본인의 과거 (값, 등급) 쌍으로 학습한 변환식으로 등급화합니다.</p>
        <p className="mb-1"><strong>우선순위</strong>: 백분위 → 표준점수 → 등급 (백분위/표준점수가 등급보다 연속적이라 미세 추세를 더 잘 잡습니다). 영어·한국사처럼 절대평가 과목은 등급만 사용합니다.</p>
        <p className="mb-1"><strong>추세 분류</strong>: 등급 회귀선 기울기로 상승/유지/하락을 판별합니다. (등급 숫자가 감소하면 성적 상승)</p>
        <p><strong>연속 추세</strong>: 최근 시험부터 역순으로 같은 방향의 변화가 연속된 횟수를 계산합니다.</p>
      </InfoBox>

      {/* 과목 토글 */}
      <div className="mb-6 flex flex-wrap gap-2">
        {chartSubjects.map((subject, idx) => (
          <button
            key={subject}
            onClick={() => toggleSubject(subject)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
              activeSubjects.has(subject)
                ? "bg-white border-gray-200 shadow-sm"
                : "bg-transparent border-transparent text-gray-400 saturate-0 opacity-60 hover:opacity-100 hover:bg-gray-50"
            )}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getSubjectColor(subject, idx) }} />
            <span style={{ color: activeSubjects.has(subject) ? '#1e293b' : 'inherit' }}>{subject}</span>
          </button>
        ))}
      </div>

      {/* 추이 라인차트 + 예측 점선 */}
      <div className="h-[300px] w-full mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis domain={[1, 9]} reversed ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              content={(props: any) => {
                const { active, payload, label } = props;
                if (!active || !payload || payload.length === 0) return null;
                const dataEntries = payload.filter((p: any) => !p.dataKey?.startsWith?.(SRC_PREFIX));
                const isPredicted = payload[0]?.payload?.type === 'predicted';
                return (
                  <div style={{
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    border: 'none',
                    fontSize: '12px',
                    padding: '8px 12px',
                  }}>
                    <div style={{ color: '#475569', fontWeight: 500, marginBottom: 4 }}>{label}</div>
                    {dataEntries.map((entry: any) => {
                      const src = entry.payload?.[`${SRC_PREFIX}${entry.dataKey}`];
                      const v = entry.value;
                      const valueText = v !== null && v !== undefined
                        ? `${isPredicted ? '(예측) ' : ''}${typeof v === 'number' ? v.toFixed(1) : v}등급`
                        : '-';
                      return (
                        <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color }} />
                          <span style={{ color: '#1e293b' }}>
                            {entry.dataKey} {valueText}
                            {src ? <span style={{ color: '#94a3b8', marginLeft: 4 }}>({src})</span> : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            {chartSubjects.map((subject, idx) => (
              activeSubjects.has(subject) && (
                <Line
                  key={subject}
                  {...drawLineProps}
                  type="monotone"
                  dataKey={subject}
                  stroke={getSubjectColor(subject, idx)}
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, index } = props;
                    if (cy === null || cy === undefined) return <React.Fragment key={index} />;
                    const isPredicted = index === trendData.length - 1 && trendData[index]?.type === 'predicted';
                    return (
                      <circle
                        key={index}
                        cx={cx} cy={cy} r={isPredicted ? 5 : 4}
                        fill={isPredicted ? 'transparent' : '#fff'}
                        stroke={getSubjectColor(subject, idx)}
                        strokeWidth={isPredicted ? 2 : 2}
                        strokeDasharray={isPredicted ? '3 3' : undefined}
                      />
                    );
                  }}
                  connectNulls
                />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 백분위 추이 & 예측 (백분위 데이터가 있는 과목만) */}
      {percentileSubjects.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-700">백분위 추이 & 예측</p>
            <span className="text-[10px] text-slate-400">상대평가 과목만 · 높을수록 좋음</span>
          </div>

          {/* 과목 토글 */}
          <div className="mb-3 flex flex-wrap gap-2">
            {percentileSubjects.map((subject, idx) => {
              const colorIdx = chartSubjects.indexOf(subject);
              return (
                <button
                  key={subject}
                  onClick={() => togglePctSubject(subject)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                    activePctSubjects.has(subject)
                      ? "bg-white border-gray-200 shadow-sm"
                      : "bg-transparent border-transparent text-gray-400 saturate-0 opacity-60 hover:opacity-100 hover:bg-gray-50"
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getSubjectColor(subject, colorIdx >= 0 ? colorIdx : idx) }} />
                  <span style={{ color: activePctSubjects.has(subject) ? '#1e293b' : 'inherit' }}>{subject}</span>
                </button>
              );
            })}
          </div>

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={percentileTrendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={35}
                />
                <Tooltip
                  content={(props: any) => {
                    const { active, payload, label } = props;
                    if (!active || !payload || payload.length === 0) return null;
                    const dataEntries = payload.filter((p: any) => !p.dataKey?.startsWith?.(SRC_PREFIX));
                    const isPredicted = payload[0]?.payload?.type === 'predicted';
                    return (
                      <div style={{
                        backgroundColor: 'rgba(255,255,255,0.95)',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        border: 'none',
                        fontSize: '12px',
                        padding: '8px 12px',
                      }}>
                        <div style={{ color: '#475569', fontWeight: 500, marginBottom: 4 }}>{label}</div>
                        {dataEntries.map((entry: any) => {
                          const src = entry.payload?.[`${SRC_PREFIX}${entry.dataKey}`];
                          const v = entry.value;
                          const valueText = v !== null && v !== undefined
                            ? `${isPredicted ? '(예측) ' : ''}${typeof v === 'number' ? v.toFixed(1) : v}%`
                            : '-';
                          return (
                            <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color }} />
                              <span style={{ color: '#1e293b' }}>
                                {entry.dataKey} {valueText}
                                {src ? <span style={{ color: '#94a3b8', marginLeft: 4 }}>({src})</span> : null}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                />
                {/* 9등급 표준 컷 기준선 (96, 89, 77) */}
                <ReferenceLine y={96} stroke="#cbd5e1" strokeDasharray="2 4" label={{ value: '1등급', position: 'right', fontSize: 9, fill: '#94a3b8' }} />
                <ReferenceLine y={77} stroke="#cbd5e1" strokeDasharray="2 4" label={{ value: '3등급', position: 'right', fontSize: 9, fill: '#94a3b8' }} />
                {percentileSubjects.map((subject) => {
                  const colorIdx = chartSubjects.indexOf(subject);
                  const color = getSubjectColor(subject, colorIdx >= 0 ? colorIdx : 0);
                  return (
                    activePctSubjects.has(subject) && (
                      <Line
                        key={subject}
                        {...drawLineProps}
                        type="monotone"
                        dataKey={subject}
                        stroke={color}
                        strokeWidth={2}
                        dot={(props: any) => {
                          const { cx, cy, index } = props;
                          if (cy === null || cy === undefined) return <React.Fragment key={index} />;
                          const isPred = index === percentileTrendData.length - 1 && percentileTrendData[index]?.type === 'predicted';
                          return (
                            <circle
                              key={index}
                              cx={cx} cy={cy} r={isPred ? 5 : 4}
                              fill={isPred ? 'transparent' : '#fff'}
                              stroke={color}
                              strokeWidth={2}
                              strokeDasharray={isPred ? '3 3' : undefined}
                            />
                          );
                        }}
                        connectNulls
                      />
                    )
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-1">
            * 백분위는 회차별 상대평가라 미세 변동도 잡아냅니다. 점선 원은 다음 시험 예측치.
          </p>
        </div>
      )}

      {/* 모멘텀 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
        {subjectAnalysis
          .filter(sa => activeSubjects.has(sa.subject))
          .map(sa => (
            <div key={sa.subject} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">{sa.subject}</span>
                <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold", getTrendColor(sa.trend))}>
                  {getTrendIcon(sa.trend)}
                  {getTrendLabel(sa.trend)}
                </div>
              </div>
              <div className="text-[10px] text-slate-500 space-y-0.5">
                <div>최근 등급: <span className="font-bold text-slate-700">{sa.grades[sa.grades.length - 1]}</span></div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span>예측 등급:</span>
                  <span className="font-bold text-blue-600">{sa.predictedNext}</span>
                  <span className="text-slate-300">({sa.predictedContinuous})</span>
                  <span
                    className={cn(
                      "px-1 py-px rounded text-[9px] font-medium",
                      sa.predictedSource === 'percentile' ? 'bg-blue-50 text-blue-600'
                        : sa.predictedSource === 'standard' ? 'bg-purple-50 text-purple-600'
                        : 'bg-slate-100 text-slate-500'
                    )}
                    title={
                      sa.predictedSource === 'percentile' ? '백분위 회귀로 예측'
                        : sa.predictedSource === 'standard' ? '표준점수 회귀로 예측'
                        : '등급 회귀로 예측 (표준점수·백분위 데이터 없음)'
                    }
                  >
                    {sa.predictedSource === 'percentile' ? '백분위'
                      : sa.predictedSource === 'standard' ? '표준점수'
                      : '등급'}
                  </span>
                </div>
                {sa.consecutive.count > 0 && (
                  <div className={cn("font-medium", sa.consecutive.direction === 'up' ? 'text-emerald-600' : sa.consecutive.direction === 'down' ? 'text-red-500' : 'text-slate-400')}>
                    {sa.consecutive.count}회 연속 {getTrendLabel(sa.consecutive.direction)}
                  </div>
                )}
              </div>
            </div>
          ))
        }
      </div>

      {/* 요약 텍스트 */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
        <p className="text-xs font-semibold text-slate-700 mb-2">분석 요약</p>
        <div className="text-xs text-slate-600 space-y-1">
          {subjectAnalysis
            .filter(sa => activeSubjects.has(sa.subject))
            .map(sa => {
              const { consecutive } = sa;
              if (consecutive.count >= 2) {
                return (
                  <p key={sa.subject}>
                    <span className="font-semibold" style={{ color: sa.color }}>{sa.subject}</span>은(는){' '}
                    <span className={cn("font-bold", consecutive.direction === 'up' ? 'text-emerald-600' : 'text-red-500')}>
                      {consecutive.count}회 연속 {getTrendLabel(consecutive.direction)} 중
                    </span>
                    {sa.predictedNext !== sa.grades[sa.grades.length - 1] && (
                      <span>이며, 다음 시험 예측 등급은 <span className="font-bold text-blue-600">{sa.predictedNext}등급</span>입니다.</span>
                    )}
                  </p>
                );
              }
              return (
                <p key={sa.subject}>
                  <span className="font-semibold" style={{ color: sa.color }}>{sa.subject}</span>:{' '}
                  현재 {sa.grades[sa.grades.length - 1]}등급, 추세 {getTrendLabel(sa.trend)},
                  예측 {sa.predictedNext}등급
                </p>
              );
            })
          }
        </div>
      </div>
    </CollapsibleSection>
  );
};

// ═══════════════════════════════════════════
// 섹션 B: 내신 vs 모의고사 괴리 분석
// ═══════════════════════════════════════════

const SectionB: React.FC<{ student: Student }> = ({ student }) => {
  const academicRecords = student.section6_academic_development || [];
  const mockResults = student.mock_result || [];
  const use5Grade = is5GradeSystem(student.grade);

  // 내신 카테고리별 평균 등급 (regular 과목만, 원본 스케일)
  const academicByCategory = useMemo(() => {
    const map: Record<string, { totalWeighted: number; totalUnits: number }> = {};

    academicRecords
      .filter(r => r.category === 'regular' && r.rank !== null && r.rank !== undefined)
      .forEach(r => {
        // subject_group → 카테고리 매핑
        let category: string | null = null;
        for (const cat of MATCHABLE_CATEGORIES) {
          if (r.subject_group === cat || r.subject_group.includes(cat) ||
            (cat === '사회' && (r.subject_group.includes('사회') || r.subject_group === '역사')) ||
            (cat === '과학' && r.subject_group.includes('과학'))) {
            category = cat;
            break;
          }
        }
        if (!category) return;

        if (!map[category]) map[category] = { totalWeighted: 0, totalUnits: 0 };
        map[category].totalWeighted += r.rank! * r.units;
        map[category].totalUnits += r.units;
      });

    const result: Record<string, number> = {};
    Object.entries(map).forEach(([cat, data]) => {
      if (data.totalUnits > 0) {
        result[cat] = parseFloat((data.totalWeighted / data.totalUnits).toFixed(2));
      }
    });
    return result;
  }, [academicRecords]);

  // 모의고사 카테고리별 평균 등급 (마지막 시험 기준, 항상 9등급제)
  const mockByCategory = useMemo(() => {
    if (mockResults.length === 0) return {};

    const sorted = [...mockResults].sort((a, b) => {
      if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
      return a.exam_month - b.exam_month;
    });
    const latestExam = sorted[sorted.length - 1];

    const result: Record<string, number> = {};

    Object.entries(latestExam.subjects).forEach(([subject, score]) => {
      const category = mockSubjectToCategory(subject);
      if (category && score.grade !== null) {
        result[category] = score.grade;
      }
    });
    return result;
  }, [mockResults]);

  // 매칭된 과목 괴리 데이터
  const gapData = useMemo(() => {
    const categories = MATCHABLE_CATEGORIES.filter(
      cat => academicByCategory[cat] !== undefined && mockByCategory[cat] !== undefined
    );

    return categories.map(cat => {
      const rawAcademic = academicByCategory[cat];
      // 5등급제: 9등급 환산하여 비교
      const convertedAcademic = use5Grade ? convert5To9Grade(rawAcademic) : rawAcademic;
      const mockGrade = mockByCategory[cat];
      const gap = parseFloat((convertedAcademic - mockGrade).toFixed(2));

      return {
        category: cat,
        rawAcademicGrade: rawAcademic,
        academicGrade: convertedAcademic,
        mockGrade,
        gap,
        gapType: classifyGapType(convertedAcademic, mockGrade),
      };
    });
  }, [academicByCategory, mockByCategory, use5Grade]);

  // 전체 유형 판정 (과목별 투표)
  const overallType = useMemo((): GapType => {
    if (gapData.length === 0) return 'A';
    const votes: Record<GapType, number> = { A: 0, B: 0, C: 0, D: 0 };
    gapData.forEach(d => votes[d.gapType]++);
    return (Object.entries(votes) as [GapType, number][])
      .sort((a, b) => b[1] - a[1])[0][0];
  }, [gapData]);

  if (gapData.length === 0) {
    return (
      <CollapsibleSection title="내신 vs 모의고사 괴리 분석" icon={<Target size={18} />}>
        <div className="text-center py-10 text-slate-400 text-sm">
          내신과 모의고사 과목을 매칭할 수 없습니다.
        </div>
      </CollapsibleSection>
    );
  }

  // 차트 데이터 (비교를 위해 동일한 9등급 스케일 사용)
  const chartData = gapData.map(d => ({
    name: d.category,
    '내신 (환산)': parseFloat(d.academicGrade.toFixed(1)),
    모의고사: d.mockGrade,
  }));

  return (
    <CollapsibleSection
      title="내신 vs 모의고사 괴리 분석"
      icon={<Target size={18} />}
      badge={
        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full ml-2", GAP_TYPE_INFO[overallType].bgColor, GAP_TYPE_INFO[overallType].color)}>
          종합: {GAP_TYPE_INFO[overallType].label}
        </span>
      }
    >
      <InfoBox title="분석 원리 보기">
        <p className="mb-1"><strong>과목 매칭</strong>: 내신의 subject_group과 모의고사 과목명을 매칭합니다. (국어↔국어, 사회↔사회탐구 등)</p>
        {use5Grade && (
          <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="font-semibold text-amber-800 mb-1">5등급제 → 9등급 환산 적용</p>
            <p className="text-[10px] mb-1">2025년 이후 입학생은 내신이 5등급제(성취평가제)로 적용됩니다. 모의고사(9등급 상대평가)와 비교를 위해 근사 환산합니다.</p>
            <p className="text-[10px]">A(1)→2, B(2)→4, C(3)→5, D(4)→7, E(5)→8 (소수점은 선형 보간)</p>
          </div>
        )}
        <p className="mb-1"><strong>4유형 분류</strong> (환산 9등급 기준):</p>
        <ul className="ml-4 list-disc space-y-0.5">
          <li><strong>A(양호)</strong>: 내신·모의 모두 3등급 이내</li>
          <li><strong>B(내신형)</strong>: 내신 3등급 이내, 모의 4등급 이상</li>
          <li><strong>C(수능형)</strong>: 모의 3등급 이내, 내신 4등급 이상</li>
          <li><strong>D(보강 필요)</strong>: 둘 다 4등급 이상</li>
        </ul>
      </InfoBox>

      {use5Grade && (
        <div className="mb-4 px-3 py-2 bg-amber-50/60 border border-amber-100 rounded-lg flex items-center gap-2">
          <Info size={14} className="text-amber-600 shrink-0" />
          <p className="text-[11px] text-amber-700">
            5등급제 내신을 9등급으로 환산하여 비교합니다. 성취평가제와 상대평가의 차이로 근사치입니다.
          </p>
        </div>
      )}

      {/* 괴리도 비교 바차트 */}
      <div className="h-[250px] w-full mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis domain={[1, 9]} reversed ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: 'none', fontSize: '12px',
              }}
              formatter={(value: any, name: string) => [`${typeof value === 'number' ? value.toFixed(1) : value}등급`, name]}
            />
            <ReferenceLine y={3} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: '3등급', position: 'right', fontSize: 10, fill: '#94a3b8' }} />
            <Bar dataKey="내신 (환산)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24} />
            <Bar dataKey="모의고사" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={24} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-1">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-blue-500 inline-block" /> 내신{use5Grade ? ' (9등급 환산)' : ''}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded bg-amber-500 inline-block" /> 모의고사
          </span>
        </div>
      </div>

      {/* 4유형 분류 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
        {gapData.map(d => {
          const info = GAP_TYPE_INFO[d.gapType];
          return (
            <div key={d.category} className={cn("rounded-xl border p-3 shadow-sm", info.bgColor, 'border-white/50')}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">{d.category}</span>
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/80", info.color)}>
                  {info.label}
                </span>
              </div>
              <div className="text-[10px] text-slate-600 space-y-0.5">
                {use5Grade ? (
                  <div>내신: <span className="font-bold">{d.rawAcademicGrade}</span>등급 <span className="text-slate-400">→ 환산 {d.academicGrade.toFixed(1)}</span></div>
                ) : (
                  <div>내신: <span className="font-bold">{d.academicGrade}</span>등급</div>
                )}
                <div>모의: <span className="font-bold">{d.mockGrade}</span>등급</div>
                <div>차이: <span className={cn("font-bold", d.gap > 0 ? 'text-red-500' : d.gap < 0 ? 'text-emerald-600' : 'text-slate-400')}>
                  {d.gap > 0 ? '+' : ''}{d.gap}
                </span></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 적합도 요약 */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
        <p className="text-xs font-semibold text-slate-700 mb-2">수시/정시 적합도</p>
        <div className="text-xs text-slate-600 space-y-1">
          <p className={cn("font-medium", GAP_TYPE_INFO[overallType].color)}>
            {GAP_TYPE_INFO[overallType].recommendation}
          </p>
          {gapData.map(d => (
            <p key={d.category}>
              <span className="font-semibold">{d.category}</span>:
              {use5Grade
                ? <> 내신 {d.rawAcademicGrade}등급(환산 {d.academicGrade.toFixed(1)})</>
                : <> 내신 {d.academicGrade}등급</>
              }
              {' '} / 모의 {d.mockGrade}등급
              {d.gap !== 0 && (
                <span className={cn("ml-1", d.gap > 0 ? 'text-red-500' : 'text-emerald-600')}>
                  ({d.gap > 0 ? '내신 약세' : '내신 우세'} {Math.abs(d.gap).toFixed(1)})
                </span>
              )}
            </p>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
};

// ═══════════════════════════════════════════
// 섹션 C: 과목별 경쟁력 분석 & 수강 시뮬레이션
// ═══════════════════════════════════════════

interface FutureSubject {
  id: string;
  subjectGroup: string;
  label: string;
  grade: number;
  units: number;
}

const SectionC: React.FC<{ student: Student }> = ({ student }) => {
  const academicRecords = student.section6_academic_development || [];
  const use5Grade = is5GradeSystem(student.grade);
  const gradeMax = maxGrade(use5Grade);

  // regular 과목만 추출 (등급 있는 것)
  const regularRecords = useMemo(() =>
    academicRecords.filter(r => r.category === 'regular' && r.rank !== null && r.rank !== undefined),
    [academicRecords]
  );

  // 현재 가중 평균 등급
  const currentWeightedAvg = useMemo(() =>
    calcWeightedAverage(regularRecords.map(r => ({ rank: r.rank, units: r.units }))),
    [regularRecords]
  );

  const currentTotalUnits = useMemo(() =>
    regularRecords.reduce((sum, r) => sum + r.units, 0),
    [regularRecords]
  );

  const currentWeightedSum = useMemo(() =>
    regularRecords.reduce((sum, r) => sum + r.rank! * r.units, 0),
    [regularRecords]
  );

  // 교과군별 평균 등급 (미래 과목 기본 등급 설정에 사용)
  const groupAvgGrades = useMemo(() => {
    const map: Record<string, { totalWeighted: number; totalUnits: number }> = {};
    regularRecords.forEach(r => {
      const group = normalizeSubjectGroup(r.subject_group);
      if (!map[group]) map[group] = { totalWeighted: 0, totalUnits: 0 };
      map[group].totalWeighted += r.rank! * r.units;
      map[group].totalUnits += r.units;
    });
    const result: Record<string, number> = {};
    Object.entries(map).forEach(([group, data]) => {
      if (data.totalUnits > 0) {
        result[group] = Math.round(data.totalWeighted / data.totalUnits);
      }
    });
    return result;
  }, [regularRecords]);

  // 사용 가능한 교과군 목록
  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    regularRecords.forEach(r => set.add(normalizeSubjectGroup(r.subject_group)));
    return Array.from(set).sort();
  }, [regularRecords]);

  // 미래 과목 시뮬레이션 상태
  const [futureSubjects, setFutureSubjects] = useState<FutureSubject[]>([]);

  // 긍정적 영향을 주는 기본 등급 계산 (현재 가중평균보다 낮은 값)
  const getDefaultGrade = (group: string): number => {
    const flooredAvg = Math.max(1, Math.floor(currentWeightedAvg));
    const groupAvg = groupAvgGrades[group];
    // 교과군 평균과 전체 가중평균 중 낮은(좋은) 값 사용
    if (groupAvg !== undefined) {
      return Math.max(1, Math.min(flooredAvg, Math.floor(groupAvg)));
    }
    return flooredAvg;
  };

  // 초기 미래 과목 설정 (교과군별 하나씩)
  const initFutureSubjects = () => {
    const subjects: FutureSubject[] = availableGroups.map(group => ({
      id: `future-${group}-${Date.now()}`,
      subjectGroup: group,
      label: `${group} (신규)`,
      grade: getDefaultGrade(group),
      units: 4,
    }));
    setFutureSubjects(subjects);
  };

  // 초기화
  useMemo(() => {
    if (availableGroups.length > 0 && futureSubjects.length === 0) {
      initFutureSubjects();
    }
  }, [availableGroups]);

  // 미래 과목 추가
  const addFutureSubject = () => {
    const group = availableGroups[0] || '기타';
    setFutureSubjects(prev => [...prev, {
      id: `future-custom-${Date.now()}`,
      subjectGroup: group,
      label: `${group} (추가)`,
      grade: getDefaultGrade(group),
      units: 4,
    }]);
  };

  // 미래 과목 삭제
  const removeFutureSubject = (id: string) => {
    setFutureSubjects(prev => prev.filter(s => s.id !== id));
  };

  // 미래 과목 수정
  const updateFutureSubject = (id: string, field: 'grade' | 'units' | 'subjectGroup', value: number | string) => {
    setFutureSubjects(prev => prev.map(s => {
      if (s.id !== id) return s;
      if (field === 'subjectGroup') {
        const newGroup = value as string;
        return { ...s, subjectGroup: newGroup, label: `${newGroup} (신규)`, grade: getDefaultGrade(newGroup) };
      }
      return { ...s, [field]: value };
    }));
  };

  // 시뮬레이션 결과 계산
  const simulationResult = useMemo(() => {
    if (futureSubjects.length === 0) return null;

    const futureWeightedSum = futureSubjects.reduce((sum, s) => sum + s.grade * s.units, 0);
    const futureTotalUnits = futureSubjects.reduce((sum, s) => sum + s.units, 0);

    const newTotalUnits = currentTotalUnits + futureTotalUnits;
    const newWeightedSum = currentWeightedSum + futureWeightedSum;
    const newWeightedAvg = newTotalUnits > 0 ? newWeightedSum / newTotalUnits : 0;
    const change = newWeightedAvg - currentWeightedAvg;

    // 교과군별 시뮬레이션 영향
    const groupImpact = futureSubjects.map(s => {
      const singleNewSum = currentWeightedSum + s.grade * s.units;
      const singleNewUnits = currentTotalUnits + s.units;
      const singleNewAvg = singleNewUnits > 0 ? singleNewSum / singleNewUnits : 0;
      return {
        ...s,
        impact: singleNewAvg - currentWeightedAvg,
      };
    });

    return { newWeightedAvg, change, futureWeightedSum, futureTotalUnits, groupImpact };
  }, [futureSubjects, currentWeightedAvg, currentTotalUnits, currentWeightedSum]);

  // 과목별 Z점수 (등급 기반)
  const subjectZScores = useMemo(() => {
    if (regularRecords.length === 0) return [];

    const allRanks = regularRecords.map(r => r.rank!);
    const mean = allRanks.reduce((a, b) => a + b, 0) / allRanks.length;
    const variance = allRanks.reduce((sum, v) => sum + (v - mean) ** 2, 0) / allRanks.length;
    const stdDev = Math.sqrt(variance);

    const latestBySemester = new Map<string, Section6Record>();
    regularRecords.forEach(r => {
      const key = r.subject;
      const existing = latestBySemester.get(key);
      if (!existing || r.grade > existing.grade || (r.grade === existing.grade && r.semester > existing.semester)) {
        latestBySemester.set(key, r);
      }
    });

    return Array.from(latestBySemester.values()).map(r => {
      const zScore = stdDev > 0 ? -((r.rank! - mean) / stdDev) : 0;
      return {
        subject: r.subject,
        subjectGroup: r.subject_group,
        rank: r.rank!,
        units: r.units,
        zScore: parseFloat(zScore.toFixed(2)),
        semester: `${r.grade}-${r.semester}`,
      };
    }).sort((a, b) => b.zScore - a.zScore);
  }, [regularRecords]);

  if (regularRecords.length === 0) {
    return (
      <CollapsibleSection title="과목별 경쟁력 분석 & 수강 시뮬레이션" icon={<Zap size={18} />}>
        <div className="text-center py-10 text-slate-400 text-sm">
          교과 성적(등급) 데이터가 없습니다.
        </div>
      </CollapsibleSection>
    );
  }

  const zChartData = subjectZScores.map((sz) => ({
    name: sz.subject,
    zScore: sz.zScore,
    fill: sz.zScore >= 0 ? '#22c55e' : '#ef4444',
  }));

  return (
    <CollapsibleSection
      title="과목별 경쟁력 분석 & 수강 시뮬레이션"
      icon={<Zap size={18} />}
      badge={
        <span className="text-[10px] font-normal text-slate-400 ml-2">
          현재 가중 평균: <span className="font-bold text-slate-700">{currentWeightedAvg.toFixed(2)}</span>
          <span className="text-slate-300 mx-1">|</span>
          총 이수단위: <span className="font-bold text-slate-700">{currentTotalUnits}</span>
        </span>
      }
    >
      <InfoBox title="분석 원리 보기">
        <p className="mb-1"><strong>Z점수</strong>: 해당 학생의 전 과목 등급 평균/표준편차를 기준으로, 각 과목이 평균 대비 얼마나 좋은지(+) 또는 나쁜지(-)를 나타냅니다.</p>
        <p className="mb-1"><strong>수강 시뮬레이션</strong>: 앞으로 수강할 과목의 등급과 이수단위를 설정하여, 전체 가중 평균에 미치는 영향을 미리 확인합니다.</p>
        <p><strong>교과군별 기본 등급</strong>: 해당 교과군에서 지금까지 받은 등급의 평균을 반올림한 값으로 자동 설정됩니다.</p>
      </InfoBox>

      {/* Z점수 바차트 */}
      <div className="mb-6">
        <p className="text-xs text-slate-500 mb-3 font-medium">과목별 Z점수 (평균 대비 상대적 강약점)</p>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={zChartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={35} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: 'none', fontSize: '12px',
                }}
                formatter={(value: any) => [`${Number(value).toFixed(2)}`, 'Z점수']}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
              <Bar dataKey="zScore" radius={[4, 4, 0, 0]}>
                {zChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-1">* 양수(+) = 평균보다 우수, 음수(-) = 평균보다 미흡</p>
      </div>

      {/* 교과군별 현재 평균 등급 요약 */}
      <div className="mb-6">
        <p className="text-xs text-slate-500 mb-3 font-medium">교과군별 현재 평균 등급</p>
        <div className="flex flex-wrap gap-2">
          {availableGroups.map(group => (
            <div key={group} className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-100 shadow-sm text-xs">
              <span className="font-medium text-slate-700">{group}</span>
              <span className={cn("px-1.5 py-0.5 rounded font-bold text-[10px]", use5Grade ? getGradeColor5(groupAvgGrades[group] ?? 3) : getGradeColor(groupAvgGrades[group] ?? 5))}>
                {(groupAvgGrades[group] ?? 0).toFixed(0)}등급
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 수강 시뮬레이션 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-500 font-medium">미래 수강 과목 시뮬레이션</p>
          <div className="flex gap-2">
            <button
              onClick={initFutureSubjects}
              className="px-2.5 py-1 text-[10px] font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              초기화
            </button>
            <button
              onClick={addFutureSubject}
              className="px-2.5 py-1 text-[10px] font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
            >
              + 과목 추가
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100/60 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                <th className="py-3 px-4 text-left font-medium">교과군</th>
                <th className="py-3 px-2 text-center font-medium">목표 등급</th>
                <th className="py-3 px-2 text-center font-medium">이수단위</th>
                <th className="py-3 px-2 text-center font-medium">개별 영향</th>
                <th className="py-3 px-2 text-center font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {futureSubjects.map(s => {
                const impact = simulationResult?.groupImpact.find(g => g.id === s.id);
                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4">
                      <select
                        value={s.subjectGroup}
                        onChange={(e) => updateFutureSubject(s.id, 'subjectGroup', e.target.value)}
                        className="appearance-none bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-medium text-slate-700 cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                      >
                        {availableGroups.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                        <option value="기타">기타</option>
                      </select>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <select
                        value={s.grade}
                        onChange={(e) => updateFutureSubject(s.id, 'grade', Number(e.target.value))}
                        className={cn(
                          "appearance-none border rounded-lg px-2 py-1 text-xs font-bold cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500/30 w-16 text-center",
                          use5Grade ? getGradeColor5(s.grade) : getGradeColor(s.grade)
                        )}
                      >
                        {Array.from({ length: gradeMax }, (_, i) => i + 1).map(g => (
                          <option key={g} value={g}>{g}등급</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        value={s.units}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                          updateFutureSubject(s.id, 'units', val);
                        }}
                        className="w-14 text-center border border-gray-200 rounded-lg px-1 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                        min={1}
                        max={10}
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      {impact && (
                        <span className={cn("font-bold text-[11px]",
                          impact.impact < 0 ? 'text-emerald-600' : impact.impact > 0 ? 'text-red-500' : 'text-slate-400'
                        )}>
                          {impact.impact < 0 ? '' : '+'}{impact.impact.toFixed(4)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() => removeFutureSubject(s.id)}
                        className="text-slate-300 hover:text-red-400 transition-colors text-sm"
                        title="삭제"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">* 교과군, 등급, 이수단위를 자유롭게 변경하여 다양한 시나리오를 확인하세요</p>
      </div>

      {/* 시뮬레이션 결과 */}
      {simulationResult && (
        <div className={cn(
          "rounded-xl border p-4 shadow-sm",
          simulationResult.change < 0 ? 'bg-emerald-50 border-emerald-100' :
            simulationResult.change > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'
        )}>
          <p className="text-xs font-semibold text-slate-700 mb-3">시뮬레이션 결과</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/70 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-1">현재 가중평균</p>
              <p className="text-lg font-bold text-slate-700">{currentWeightedAvg.toFixed(2)}</p>
              <p className="text-[10px] text-slate-400">{currentTotalUnits}단위</p>
            </div>
            <div className="bg-white/70 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-1">변경 후 가중평균</p>
              <p className={cn("text-lg font-bold",
                simulationResult.change < 0 ? 'text-emerald-600' :
                  simulationResult.change > 0 ? 'text-red-600' : 'text-slate-700'
              )}>
                {simulationResult.newWeightedAvg.toFixed(2)}
              </p>
              <p className="text-[10px] text-slate-400">{currentTotalUnits + simulationResult.futureTotalUnits}단위</p>
            </div>
            <div className="bg-white/70 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-1">변화량</p>
              <p className={cn("text-lg font-bold",
                simulationResult.change < 0 ? 'text-emerald-600' :
                  simulationResult.change > 0 ? 'text-red-600' : 'text-slate-400'
              )}>
                {simulationResult.change < 0 ? '' : '+'}{simulationResult.change.toFixed(4)}
              </p>
              <p className="text-[10px] text-slate-400">
                {simulationResult.change < 0 ? '개선' : simulationResult.change > 0 ? '하락' : '변화없음'}
              </p>
            </div>
            <div className="bg-white/70 rounded-lg p-3 text-center">
              <p className="text-[10px] text-slate-500 mb-1">추가 과목</p>
              <p className="text-lg font-bold text-slate-700">{futureSubjects.length}</p>
              <p className="text-[10px] text-slate-400">{simulationResult.futureTotalUnits}단위 추가</p>
            </div>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
};

/** subject_group 정규화 (AcademicGrades.tsx의 카테고리 분류와 일치) */
function normalizeSubjectGroup(group: string): string {
  if (group.includes('국어')) return '국어';
  if (group.includes('수학')) return '수학';
  if (group.includes('영어')) return '영어';
  if (group.includes('사회') || group.includes('도덕')) return '사회';
  if (group.includes('과학')) return '과학';
  if (group.includes('체육')) return '체육';
  // 한국사, 기술·가정, 제2외국어, 한문, 예술, 정보 등은 모두 기타
  return '기타';
}

export default GradeAnalysis;
