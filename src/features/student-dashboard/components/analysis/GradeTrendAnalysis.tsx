import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';
import type { AnalysisStudentData } from '../../hooks/useAnalysisData';
import { calcWeightedAverage, calcLinearRegression } from '@/features/evalog/utils/gradeAnalysisUtils';
import { subjectGroupToCategory } from '@/features/course-analyze/utils/gradeMapping';
import { sortSemesters, semesterLabel, CHART_COLORS } from '../../utils/analysisUtils';

interface Props {
  data: AnalysisStudentData[];
  /** 설정 시에만 학기별 상위 20위 추이 차트를 표시한다 (전체 학년 보기는 5·9등급제가 섞여 순위 비교가 무의미해짐) */
  grade?: number;
}

const SUBJECT_FILTERS = ['전체', '국어', '수학', '영어', '사회', '과학'] as const;
const TOP_N = 20;

/** recharts <Line dot={...}>가 각 데이터 포인트마다 넘겨주는 값 중 실제 쓰는 것만 정의 */
interface LineDotRenderProps {
  cx?: number;
  cy?: number;
  value?: number | null;
  index?: number;
}

/** recharts <Line label={{content}}>가 넘겨주는 값 중 실제 쓰는 것만 정의 */
interface LineLabelRenderProps {
  x?: number;
  y?: number;
  value?: number | null;
  index?: number;
}

/** 학생 id(student_code)를 CHART_COLORS 인덱스로 결정적으로 매핑 — 과목군 필터를 바꿔도
 *  top20IdList의 구성·순서가 달라질 뿐 이 해시는 id만으로 정해지므로 학생 색이 유지된다. */
function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
}

export const GradeTrendAnalysis: React.FC<Props> = ({ data, grade }) => {
  const [subjectFilter, setSubjectFilter] = useState<string>('전체');
  const [hoveredStudentId, setHoveredStudentId] = useState<string | null>(null);

  const analysis = useMemo(() => {
    const studentTrends: { name: string; id: string; semesters: string[]; grades: number[]; slope: number }[] = [];
    // 학생별 학기별 평균 등급 (상위 20위 산정 + 추이 차트 공용)
    const semGradesByStudent: Record<string, Record<string, number>> = {};
    const nameById: Record<string, string> = {};

    data.forEach(student => {
      const bySem: Record<string, { rank: number; units: number }[]> = {};
      (student.academic_development || []).forEach(r => {
        if (r.category !== 'regular' || r.rank == null) return;
        if (subjectFilter !== '전체' && subjectGroupToCategory(r.subject_group) !== subjectFilter) return;

        const semKey = `${r.grade}-${r.semester}`;
        if (!bySem[semKey]) bySem[semKey] = [];
        bySem[semKey].push({ rank: r.rank, units: r.units });
      });

      const semesters = sortSemesters(Object.keys(bySem));
      const gradeValues: number[] = [];

      semesters.forEach(sem => {
        const avg = calcWeightedAverage(bySem[sem]);
        if (avg > 0) {
          gradeValues.push(avg);
          if (!semGradesByStudent[student.id]) semGradesByStudent[student.id] = {};
          semGradesByStudent[student.id][sem] = avg;
          nameById[student.id] = student.name;
        }
      });

      if (gradeValues.length >= 2) {
        const reg = calcLinearRegression(gradeValues);
        studentTrends.push({
          name: student.name,
          id: student.id,
          semesters,
          grades: gradeValues,
          slope: reg.slope,
        });
      }
    });

    // 성적 향상/하락 TOP 5 (slope 기준, 음수 slope = 등급 감소 = 향상)
    // 학생별로 자신의 학기 순서만 비교하므로 5등급제/9등급제가 섞여도 척도 문제가 없다.
    const sorted = [...studentTrends].sort((a, b) => a.slope - b.slope);
    const topImproved = sorted.slice(0, 5).filter(s => s.slope < 0);
    const topDeclined = sorted.slice(-5).reverse().filter(s => s.slope > 0);

    // 학기별 상위 20위 추이 — 각 학기마다 등급 낮은(=성적 좋은) 순 20명을 뽑아 합집합으로 모으고,
    // 그 학생들의 학기별 등급을 한 그래프에 선(라인)으로 겹쳐 그린다.
    const allSemesters = sortSemesters(
      Array.from(new Set(Object.values(semGradesByStudent).flatMap(s => Object.keys(s))))
    );
    const top20Ids = new Set<string>();
    allSemesters.forEach(sem => {
      const ranked = Object.entries(semGradesByStudent)
        .filter(([, sems]) => sems[sem] != null)
        .sort(([, a], [, b]) => a[sem] - b[sem])
        .slice(0, TOP_N);
      ranked.forEach(([id]) => top20Ids.add(id));
    });
    const top20IdList = Array.from(top20Ids).sort((a, b) => nameById[a].localeCompare(nameById[b], 'ko'));
    const top20ChartData = allSemesters.map(sem => {
      const row: Record<string, string | number | null> = { semester: sem, label: semesterLabel(sem) };
      top20IdList.forEach(id => { row[id] = semGradesByStudent[id]?.[sem] ?? null; });
      return row;
    });
    return { topImproved, topDeclined, top20IdList, top20ChartData, nameById };
  }, [data, subjectFilter]);

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">과목군:</span>
          {SUBJECT_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setSubjectFilter(f)}
              className={`px-3 py-1 text-xs rounded-full transition-all ${
                subjectFilter === f
                  ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm'
                  : 'bg-white/50 text-slate-600 hover:bg-white/80'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* 학기별 상위 20위 추이 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4">학기별 성적 상위 20위 추이</h3>
        {!grade ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">학년을 선택해주세요.</p>
            <p className="text-xs text-muted-foreground mt-1">
              왼쪽 사이드바에서 학년을 선택하면 상위 20위 추이를 확인할 수 있습니다. (등급제가 다른 학년을 섞으면 순위 비교가 무의미해집니다.)
            </p>
          </div>
        ) : analysis.top20IdList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">데이터가 없습니다.</p>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={analysis.top20ChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis reversed domain={['dataMin', 'dataMax']} tick={{ fontSize: 11 }} />
              <Legend
                wrapperStyle={{ fontSize: 11, cursor: 'pointer' }}
                onClick={(entry) => setHoveredStudentId(prev => (entry.id === prev ? null : entry.id ?? null))}
                payload={analysis.top20IdList.map(id => ({
                  value: analysis.nameById[id] || id,
                  type: 'line' as const,
                  color: colorForId(id),
                  id,
                }))}
              />
              {/* 호버 중인 학생의 선을 배열 맨 뒤로 보내 마지막에 그려지게 함 (SVG는 나중에 그린 요소가 위로 온다) —
                  겹친 다른 학생의 선·점에 가려지지 않도록 하는 z-order 트릭. Legend는 위에서 이미 고정 payload를 줬으므로
                  이 재정렬의 영향을 받지 않는다. */}
              {[...analysis.top20IdList]
                .sort((a, b) => (a === hoveredStudentId ? 1 : b === hoveredStudentId ? -1 : 0))
                .map((id) => {
                const color = colorForId(id);
                const isHovered = hoveredStudentId === id;
                const studentName = analysis.nameById[id] || id;
                return (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    name={studentName}
                    stroke={color}
                    strokeWidth={isHovered ? 3 : 1.5}
                    connectNulls
                    isAnimationActive={false}
                    activeDot={false}
                    dot={(dotProps: LineDotRenderProps) => {
                      const { cx, cy, value, index } = dotProps;
                      if (cx == null || cy == null || value == null) return <React.Fragment key={`dot-${id}-${index}`} />;
                      return (
                        <g key={`dot-${id}-${index}`}>
                          {/* 히트 영역: 실제 그리는 원(r=3)보다 넓게 잡아 마우스를 올리기 쉽게 함 */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={8}
                            fill="transparent"
                            onMouseEnter={() => setHoveredStudentId(id)}
                            onMouseLeave={() => setHoveredStudentId(null)}
                            style={{ cursor: 'pointer' }}
                          />
                          <circle cx={cx} cy={cy} r={3} fill={color} stroke="#fff" strokeWidth={1} pointerEvents="none" />
                        </g>
                      );
                    }}
                    label={isHovered ? {
                      content: ({ x, y, value, index }: LineLabelRenderProps) => {
                        if (x == null || y == null || value == null) return <React.Fragment key={`label-${id}-${index}`} />;
                        const text = `${studentName} ${value.toFixed(2)}등급`;
                        return (
                          <text
                            key={`label-${id}-${index}`}
                            x={x}
                            y={y + 22}
                            textAnchor="middle"
                            fontSize={18}
                            fontWeight={700}
                            fill={color}
                            stroke="#fff"
                            strokeWidth={4}
                            paintOrder="stroke"
                            style={{ pointerEvents: 'none' }}
                          >
                            {text}
                          </text>
                        );
                      },
                    } : undefined}
                    onMouseEnter={() => setHoveredStudentId(id)}
                    onMouseLeave={() => setHoveredStudentId(null)}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 향상/하락 TOP 5 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 text-emerald-700">성적 향상 TOP 5</h3>
          {analysis.topImproved.length === 0 ? (
            <p className="text-xs text-muted-foreground">해당 학생 없음</p>
          ) : (
            <div className="space-y-2">
              {analysis.topImproved.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between text-xs p-2 bg-emerald-50/50 rounded-lg">
                  <span className="font-medium">{i + 1}. {s.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {s.grades[0]?.toFixed(1)} → {s.grades[s.grades.length - 1]?.toFixed(1)}
                    </span>
                    <span className="text-emerald-600 font-semibold">
                      {Math.abs(s.slope).toFixed(2)}/학기
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 text-rose-700">성적 하락 TOP 5</h3>
          {analysis.topDeclined.length === 0 ? (
            <p className="text-xs text-muted-foreground">해당 학생 없음</p>
          ) : (
            <div className="space-y-2">
              {analysis.topDeclined.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between text-xs p-2 bg-rose-50/50 rounded-lg">
                  <span className="font-medium">{i + 1}. {s.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {s.grades[0]?.toFixed(1)} → {s.grades[s.grades.length - 1]?.toFixed(1)}
                    </span>
                    <span className="text-rose-600 font-semibold">
                      +{s.slope.toFixed(2)}/학기
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
