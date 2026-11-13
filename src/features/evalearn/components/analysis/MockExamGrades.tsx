import React, { useState, useMemo } from 'react';
import { EvalearnStudent } from '../../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell,
} from 'recharts';
import { TrendingUp, Table2, BarChart3, Target, Activity, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawLineProps } from '@/lib/chartAnimation';
import { getExamGrade, averageExamGrade } from '../../utils/mockResult';
import { useStudentReferenceGrades, examKey } from '../../hooks/useStudentReferenceGrades';

interface MockExamGradesProps {
  student: EvalearnStudent;
}

const SUBJECT_COLORS: Record<string, string> = {
  '전과목': '#22c55e',
  '국어': '#3b82f6',
  '수학': '#ef4444',
  '영어': '#f59e0b',
  '한국사': '#8b5cf6',
  '사회탐구': '#14b8a6',
  '과학탐구': '#ec4899',
  '선택1': '#f97316',
  '선택2': '#06b6d4',
  '제2외국어': '#84cc16',
};

const FALLBACK_COLORS = [
  '#6366f1', '#a855f7', '#d946ef', '#f43f5e', '#0ea5e9',
  '#10b981', '#eab308', '#78716c', '#64748b', '#dc2626',
];

const getSubjectColor = (subject: string, index: number): string => {
  return SUBJECT_COLORS[subject] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
};

// 수학 계열(수학/확률과통계/미적분/기하)과 국어 계열(국어/언어와매체/화법과작문)은
// 차트에서 하나의 라인으로 통합. 한 시험에 동일 계열 과목이 중복되지 않는다는 전제.
const SUBJECT_GROUP_MAP: Record<string, string> = {
  '수학': '수학',
  '확률과통계': '수학',
  '미적분': '수학',
  '기하': '수학',
  '국어': '국어',
  '언어와매체': '국어',
  '화법과작문': '국어',
};

const getSubjectGroup = (subject: string): string => {
  return SUBJECT_GROUP_MAP[subject] ?? subject;
};

// 한 시험(exam)에서 특정 그룹에 속하는 과목 점수를 1개 반환 (없으면 null)
const pickGroupedScore = <T,>(
  exam: { subjects: Record<string, any> },
  groupName: string,
  extractor: (s: any) => T | null | undefined
): T | null => {
  for (const [subj, score] of Object.entries(exam.subjects)) {
    if (getSubjectGroup(subj) === groupName) {
      const v = extractor(score);
      if (v !== null && v !== undefined) return v;
    }
  }
  return null;
};

const pickSourceSubject = (
  exam: { subjects: Record<string, any> },
  groupName: string,
  extractor: (s: any) => any
): string | null => {
  for (const [subj, score] of Object.entries(exam.subjects)) {
    if (getSubjectGroup(subj) === groupName) {
      const v = extractor(score);
      if (v !== null && v !== undefined) {
        return subj !== groupName ? subj : null;
      }
    }
  }
  return null;
};

const SRC_PREFIX = '__src_';

const GroupedTooltip: React.FC<any> = ({ active, payload, label, valueFormatter }) => {
  if (!active || !payload || payload.length === 0) return null;
  const fmt = valueFormatter ?? ((v: any) => (v !== null && v !== undefined ? v : '-'));
  const dataEntries = payload.filter((p: any) => !p.dataKey?.startsWith?.(SRC_PREFIX));
  return (
    <div
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        border: 'none',
        fontSize: '12px',
        padding: '8px 12px',
      }}
    >
      <div style={{ color: '#475569', fontWeight: 500, marginBottom: 4 }}>{label}</div>
      {dataEntries.map((entry: any) => {
        const src = entry.payload?.[`${SRC_PREFIX}${entry.dataKey}`];
        const valueText = fmt(entry.value);
        return (
          <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, color: entry.color }}>
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
};

const getGradeColor = (grade: number | null): string => {
  if (grade === null) return '';
  if (grade <= 2) return 'bg-emerald-50 text-emerald-700';
  if (grade <= 4) return 'bg-blue-50 text-blue-700';
  if (grade <= 6) return 'bg-amber-50 text-amber-700';
  if (grade <= 8) return 'bg-orange-50 text-orange-700';
  return 'bg-red-50 text-red-700';
};

const calcStdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const MockExamGrades: React.FC<MockExamGradesProps> = ({ student }) => {
  const [activeGradeSubjects, setActiveGradeSubjects] = useState<Set<string>>(new Set());
  const [activeStdSubjects, setActiveStdSubjects] = useState<Set<string>>(new Set());
  const [activePctSubjects, setActivePctSubjects] = useState<Set<string>>(new Set());
  const [selectedRadarExam, setSelectedRadarExam] = useState<number>(-1);
  const [expandedExams, setExpandedExams] = useState<Set<string>>(new Set());

  // 공식 성적이 없는 회차의 참고 등급(EBS 예상 등급컷 기반)
  const referenceGrades = useStudentReferenceGrades(student);

  /**
   * 공식 성적 + **참고 등급 회차**를 합친 목록.
   *
   * 공식 성적 발표 전 회차(2026-09 등)는 `mock_result` 에 항목 자체가 없어 종전엔 추이에서
   * 통째로 빠졌다 — 가장 최근 시험이 그래프에 안 나오는 상태였다. 참고 등급이 계산된
   * 회차를 합성 항목으로 끼워 넣되, **등급만** 채운다(표준점수·백분위는 추정하지 않는다).
   */
  const sortedExams = useMemo(() => {
    const merged = [...(student.mock_result || [])];
    const seen = new Set(
      merged.map((r) => examKey(r.academic_year, r.exam_month, r.exam_grade))
    );

    for (const entry of student.mock_marking ?? []) {
      const key = examKey(entry.academic_year, entry.exam_month, entry.exam_grade);
      if (seen.has(key)) continue;
      const refs = referenceGrades.get(key);
      if (!refs || refs.size === 0) continue;

      merged.push({
        academic_year: entry.academic_year,
        exam_grade: entry.exam_grade,
        exam_month: entry.exam_month,
        subjects: Object.fromEntries(
          [...refs].map(([subject, ref]) => [
            subject,
            { grade: ref.grade, raw_score: ref.rawScore, standard_score: null, percentile: null },
          ])
        ),
      } as (typeof merged)[number]);
      seen.add(key);
    }

    return merged.sort((a, b) => {
      if (a.academic_year !== b.academic_year) return a.academic_year - b.academic_year;
      if (a.exam_grade !== b.exam_grade) return a.exam_grade - b.exam_grade;
      return a.exam_month - b.exam_month;
    });
  }, [student.mock_result, student.mock_marking, referenceGrades]);

  /** 참고 등급으로 채운 회차 — 라벨에 표시해 공식과 구분한다 */
  const referenceExamKeys = useMemo(() => {
    const official = new Set(
      (student.mock_result ?? []).map((r) => examKey(r.academic_year, r.exam_month, r.exam_grade))
    );
    return new Set([...referenceGrades.keys()].filter((k) => !official.has(k)));
  }, [student.mock_result, referenceGrades]);

  const examLabels = useMemo(() =>
    sortedExams.map(e => {
      const label = `${e.exam_grade}-${e.exam_month}월`;
      // 참고 등급 회차는 *를 붙여 축에서 바로 구분되게 한다
      return referenceExamKeys.has(examKey(e.academic_year, e.exam_month, e.exam_grade))
        ? `${label}*`
        : label;
    }),
    [sortedExams, referenceExamKeys]
  );

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    sortedExams.forEach(exam => {
      Object.keys(exam.subjects).forEach(s => set.add(s));
    });
    return Array.from(set);
  }, [sortedExams]);

  // 차트용: 특정 과목 제외 + 수학/국어 계열 그룹명으로 통합
  const CHART_EXCLUDED_SUBJECTS = ['공통과학', '공통사회', '과학탐구', '사회탐구'];
  const chartSubjects = useMemo(() => {
    const grouped = allSubjects
      .filter(s => !CHART_EXCLUDED_SUBJECTS.includes(s))
      .map(getSubjectGroup);
    return Array.from(new Set(grouped));
  }, [allSubjects]);

  useMemo(() => {
    if (chartSubjects.length > 0 && activeGradeSubjects.size === 0) {
      const coreDefaults = chartSubjects.filter(s =>
        ['국어', '수학', '영어', '한국사'].includes(s)
      );
      const defaults = coreDefaults.length > 0 ? coreDefaults : chartSubjects.slice(0, 4);
      setActiveGradeSubjects(new Set([...defaults, '전과목']));
      setActiveStdSubjects(new Set(defaults));
      setActivePctSubjects(new Set(defaults));
    }
  }, [chartSubjects]);

  if (!student.mock_result || student.mock_result.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <BarChart3 size={48} className="text-slate-300" />
        <p className="text-sm font-medium">모의고사 성적 데이터가 없습니다</p>
        <p className="text-xs text-slate-400">관리자 패널에서 모의고사 데이터를 업로드해 주세요</p>
      </div>
    );
  }

  const toggleSubject = (subject: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(subject)) {
        next.delete(subject);
      } else {
        next.add(subject);
      }
      return next;
    });
  };

  const renderToggleButtons = (subjects: string[], activeSet: Set<string>, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (
    <div className="mb-6 flex flex-wrap gap-2 justify-start">
      {subjects.map((subject, idx) => (
        <button
          key={subject}
          onClick={() => toggleSubject(subject, setter)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
            activeSet.has(subject)
              ? "bg-white border-gray-200 shadow-sm"
              : "bg-transparent border-transparent text-gray-400 saturate-0 opacity-60 hover:opacity-100 hover:bg-gray-50"
          )}
        >
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: getSubjectColor(subject, idx) }}
          />
          <span style={{ color: activeSet.has(subject) ? '#1e293b' : 'inherit' }}>
            {subject}
          </span>
        </button>
      ))}
    </div>
  );

  const renderGradeTrend = () => {
    const trendData = sortedExams.map((exam, i) => {
      const entry: any = { label: examLabels[i] };
      chartSubjects.forEach(subject => {
        entry[subject] = pickGroupedScore(exam, subject, s => getExamGrade(s));
        const src = pickSourceSubject(exam, subject, s => getExamGrade(s));
        if (src) entry[`${SRC_PREFIX}${subject}`] = src;
      });
      // 미응시(grade=0)를 빼지 않으면 평균이 실제보다 좋아진다 — 등급은 낮을수록 좋다
      entry['전과목'] = averageExamGrade(Object.values(exam.subjects));
      return entry;
    });

    const gradeChartSubjects = ['전과목', ...chartSubjects];

    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            <TrendingUp size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">등급 추이도</h3>
        </div>

        {renderToggleButtons(gradeChartSubjects, activeGradeSubjects, setActiveGradeSubjects)}

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[1, 9]}
                reversed
                ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9]}
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                content={
                  <GroupedTooltip
                    valueFormatter={(v: any) =>
                      v !== null && v !== undefined ? (typeof v === 'number' ? v.toFixed(2) : v) : '-'
                    }
                  />
                }
              />
              {gradeChartSubjects.map((subject, idx) => (
                activeGradeSubjects.has(subject) && (
                  <Line
                    key={subject}
                    {...drawLineProps}
                    type="monotone"
                    dataKey={subject}
                    stroke={getSubjectColor(subject, idx)}
                    strokeWidth={subject === '전과목' ? 3 : 2}
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    connectNulls
                  />
                )
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderScoreTable = () => {
    const toggleExam = (key: string) => {
      setExpandedExams(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
    };

    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            <Table2 size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">성적 데이터 테이블</h3>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100/60 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                <th className="py-3 px-4 text-left font-medium sticky left-0 bg-slate-50/80 z-10">시험</th>
                {allSubjects.map(subject => (
                  <th key={subject} className="py-3 px-3 text-center font-medium whitespace-nowrap" colSpan={1}>
                    {subject}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedExams.map((exam) => {
                const key = `${exam.academic_year}-${exam.exam_grade}-${exam.exam_month}`;
                const isExpanded = expandedExams.has(key);

                return (
                  <React.Fragment key={key}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => toggleExam(key)}
                    >
                      <td className="py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-white z-10 whitespace-nowrap">
                        <span className="inline-flex items-center justify-center w-5 h-5 mr-1.5 rounded-full bg-slate-100 text-slate-400 text-[10px]">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        {exam.academic_year}년 {exam.exam_grade}학년 {exam.exam_month}월
                      </td>
                      {allSubjects.map(subject => {
                        const score = exam.subjects[subject];
                        const gradeValue = getExamGrade(score);
                        return (
                          <td key={subject} className="py-3 px-3 text-center">
                            {gradeValue !== null ? (
                              <span className={cn(
                                "inline-block px-2 py-0.5 rounded text-xs font-bold",
                                getGradeColor(gradeValue)
                              )}>
                                {gradeValue}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && (
                      <>
                        <tr className="bg-slate-50/50">
                          <td className="py-2 px-4 pl-12 text-slate-500 sticky left-0 bg-slate-50/50 z-10">원점수</td>
                          {allSubjects.map(subject => {
                            const score = exam.subjects[subject];
                            return (
                              <td key={subject} className="py-2 px-3 text-center text-slate-600">
                                {score?.raw_score ?? '-'}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="bg-slate-50/50">
                          <td className="py-2 px-4 pl-12 text-slate-500 sticky left-0 bg-slate-50/50 z-10">표준점수</td>
                          {allSubjects.map(subject => {
                            const score = exam.subjects[subject];
                            return (
                              <td key={subject} className="py-2 px-3 text-center text-slate-600">
                                {score?.standard_score ?? '-'}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <td className="py-2 px-4 pl-12 text-slate-500 sticky left-0 bg-slate-50/50 z-10">백분위</td>
                          {allSubjects.map(subject => {
                            const score = exam.subjects[subject];
                            return (
                              <td key={subject} className="py-2 px-3 text-center text-slate-600">
                                {score?.percentile ?? '-'}
                              </td>
                            );
                          })}
                        </tr>
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderStandardScoreTrend = () => {
    const trendData = sortedExams.map((exam, i) => {
      const entry: any = { label: examLabels[i] };
      chartSubjects.forEach(subject => {
        entry[subject] = pickGroupedScore(exam, subject, s => s?.standard_score);
        const src = pickSourceSubject(exam, subject, s => s?.standard_score);
        if (src) entry[`${SRC_PREFIX}${subject}`] = src;
      });
      return entry;
    });

    const hasData = trendData.some(d =>
      chartSubjects.some(s => d[s] !== null)
    );
    if (!hasData) return null;

    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            <BarChart3 size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">표준점수 추이</h3>
        </div>

        {renderToggleButtons(chartSubjects, activeStdSubjects, setActiveStdSubjects)}

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<GroupedTooltip />} />
              {chartSubjects.map((subject, idx) => (
                activeStdSubjects.has(subject) && (
                  <Line
                    key={subject}
                    {...drawLineProps}
                    type="monotone"
                    dataKey={subject}
                    stroke={getSubjectColor(subject, idx)}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    connectNulls
                  />
                )
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderPercentileTrend = () => {
    const trendData = sortedExams.map((exam, i) => {
      const entry: any = { label: examLabels[i] };
      chartSubjects.forEach(subject => {
        entry[subject] = pickGroupedScore(exam, subject, s => s?.percentile);
        const src = pickSourceSubject(exam, subject, s => s?.percentile);
        if (src) entry[`${SRC_PREFIX}${subject}`] = src;
      });
      return entry;
    });

    const hasData = trendData.some(d =>
      chartSubjects.some(s => d[s] !== null)
    );
    if (!hasData) return null;

    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            <TrendingUp size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">백분위 추이</h3>
        </div>

        {renderToggleButtons(chartSubjects, activePctSubjects, setActivePctSubjects)}

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 20, 40, 60, 80, 100]}
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <Tooltip content={<GroupedTooltip />} />
              {chartSubjects.map((subject, idx) => (
                activePctSubjects.has(subject) && (
                  <Line
                    key={subject}
                    {...drawLineProps}
                    type="monotone"
                    dataKey={subject}
                    stroke={getSubjectColor(subject, idx)}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    connectNulls
                  />
                )
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderRadarChart = () => {
    if (sortedExams.length === 0) return null;

    const radarIdx = selectedRadarExam < 0 || selectedRadarExam >= sortedExams.length
      ? sortedExams.length - 1
      : selectedRadarExam;
    const selectedExam = sortedExams[radarIdx];
    // 수학/국어 계열 과목은 그룹명으로 통합 (한 시험 내 중복 없으므로 단순 매핑)
    const radarData = Object.entries(selectedExam.subjects)
      .map(([subject, score]) => ({ subject, grade: getExamGrade(score) }))
      .filter((d): d is { subject: string; grade: number } => d.grade !== null)
      .map(({ subject, grade }) => ({
        subject: getSubjectGroup(subject),
        grade,
        invertedGrade: 10 - grade,
      }));

    if (radarData.length < 3) return null;

    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-gray-100/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
              <Target size={18} />
            </div>
            <h3 className="font-semibold text-slate-800">과목간 성적 비교</h3>
          </div>
          <div className="relative">
            <select
              value={radarIdx}
              onChange={(e) => setSelectedRadarExam(Number(e.target.value))}
              className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-xs font-medium text-slate-700 shadow-sm cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {sortedExams.map((exam, i) => (
                <option key={i} value={i}>
                  {exam.academic_year}년 {exam.exam_grade}학년 {exam.exam_month}월
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontSize: 11, fill: '#475569' }}
              />
              <PolarRadiusAxis
                domain={[0, 9]}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickCount={5}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  border: 'none',
                  fontSize: '12px'
                }}
                formatter={(value: any, name: string) => {
                  if (name === 'invertedGrade') return [10 - value + '등급', '등급'];
                  return [value, name];
                }}
              />
              <Radar
                name="invertedGrade"
                dataKey="invertedGrade"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-center text-[10px] text-slate-400">
          * 바깥쪽일수록 높은 등급 (1등급)
        </div>
      </div>
    );
  };

  const renderVolatilityAnalysis = () => {
    if (sortedExams.length < 2) return null;

    // 과목별 등급 표준편차 (수학/국어 계열은 그룹 단위로 통합)
    const volatilityData = chartSubjects
      .map((subject, idx) => {
        const grades = sortedExams
          .map(e => pickGroupedScore(e, subject, s => getExamGrade(s)))
          .filter((g): g is number => g !== null);
        if (grades.length < 2) return null;
        return {
          subject,
          stdDev: parseFloat(calcStdDev(grades).toFixed(2)),
          color: getSubjectColor(subject, idx),
          examCount: grades.length,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => b.stdDev - a.stdDev);

    if (volatilityData.length === 0) return null;

    const deltaData: { subject: string; deltas: (number | null)[] }[] = chartSubjects.map(subject => {
      const deltas: (number | null)[] = [];
      for (let i = 0; i < sortedExams.length; i++) {
        if (i === 0) {
          deltas.push(null);
          continue;
        }
        const curr = pickGroupedScore(sortedExams[i], subject, s => getExamGrade(s));
        const prev = pickGroupedScore(sortedExams[i - 1], subject, s => getExamGrade(s));
        if (curr !== null && prev !== null) {
          deltas.push(prev - curr);
        } else {
          deltas.push(null);
        }
      }
      return { subject, deltas };
    });

    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100/50">
          <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
            <Activity size={18} />
          </div>
          <h3 className="font-semibold text-slate-800">성적 변동성 분석</h3>
        </div>

        <div className="mb-8">
          <p className="text-xs text-slate-500 mb-3">과목별 등급 표준편차 (값이 클수록 변동이 큼)</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volatilityData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="subject"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    border: 'none',
                    fontSize: '12px'
                  }}
                  formatter={(value: any) => [`${value}`, '표준편차']}
                />
                <Bar dataKey="stdDev" radius={[6, 6, 0, 0]}>
                  {volatilityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-3">직전 시험 대비 등급 변화 (+ 상승, - 하락)</p>
          <div className="overflow-x-auto rounded-xl border border-gray-100/60 shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                  <th className="py-3 px-4 text-left font-medium sticky left-0 bg-slate-50/80 z-10">과목</th>
                  {examLabels.map((label, i) => (
                    <th key={i} className="py-3 px-3 text-center font-medium whitespace-nowrap">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {deltaData.map(({ subject, deltas }) => {
                  const hasAnyDelta = deltas.some(d => d !== null);
                  if (!hasAnyDelta) return null;
                  return (
                    <tr key={subject} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-slate-700 sticky left-0 bg-white z-10">{subject}</td>
                      {deltas.map((delta, i) => (
                        <td key={i} className="py-2.5 px-3 text-center">
                          {delta === null ? (
                            <span className="text-slate-300">-</span>
                          ) : delta > 0 ? (
                            <span className="text-emerald-600 font-bold">+{delta}</span>
                          ) : delta < 0 ? (
                            <span className="text-red-500 font-bold">{delta}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative isolate p-4">
      <div className="space-y-8">
        {renderGradeTrend()}
        {renderScoreTable()}
        {renderStandardScoreTrend()}
        {renderPercentileTrend()}
        {renderRadarChart()}
        {renderVolatilityAnalysis()}
      </div>
    </div>
  );
};

export default MockExamGrades;
