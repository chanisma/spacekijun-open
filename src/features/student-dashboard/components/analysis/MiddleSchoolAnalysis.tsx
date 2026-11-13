import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { AnalysisStudentData } from '../../hooks/useAnalysisData';
import { calcWeightedAverage } from '@/features/evalog/utils/gradeAnalysisUtils';
import { subjectGroupToCategory } from '@/features/course-analyze/utils/gradeMapping';
import { CHART_COLORS, gradeColor, average, getMaxGrade } from '../../utils/analysisUtils';

interface Props {
  data: AnalysisStudentData[];
}

const SUBJECT_FILTERS = ['전체', '국어', '수학', '영어', '사회', '과학'] as const;

export const MiddleSchoolAnalysis: React.FC<Props> = ({ data }) => {
  const [subjectFilter, setSubjectFilter] = useState<string>('전체');

  const analysis = useMemo(() => {
    // 중학교별 그룹핑
    const groups: Record<string, { students: AnalysisStudentData[]; grades: number[] }> = {};

    data.forEach(student => {
      const middleSchool = student.section1_personal_info?.middleSchool || '미입력';
      if (!groups[middleSchool]) groups[middleSchool] = { students: [], grades: [] };
      groups[middleSchool].students.push(student);

      // 가중평균 계산 (원본 등급 그대로 사용)
      const records = (student.academic_development || [])
        .filter(r => {
          if (r.category !== 'regular' || r.rank == null) return false;
          if (subjectFilter === '전체') return true;
          return subjectGroupToCategory(r.subject_group) === subjectFilter;
        })
        .map(r => ({ rank: r.rank!, units: r.units }));

      if (records.length > 0) {
        groups[middleSchool].grades.push(calcWeightedAverage(records));
      }
    });

    // 차트 데이터 생성 (평균등급 오름차순 = 성적 좋은 순)
    const chartData = Object.entries(groups)
      .filter(([, g]) => g.grades.length > 0)
      .map(([school, g]) => ({
        school,
        avgGrade: parseFloat(average(g.grades).toFixed(2)),
        count: g.students.length,
        validCount: g.grades.length,
      }))
      .sort((a, b) => a.avgGrade - b.avgGrade);

    const maxGradeValue = getMaxGrade(data);

    return { chartData, groups, maxGradeValue };
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

      {/* 차트 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4">출신 중학교별 평균 등급</h3>
        {analysis.chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">데이터가 없습니다.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, analysis.chartData.length * 32)}>
            <BarChart data={analysis.chartData} layout="vertical" margin={{ left: 80, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" domain={[0, analysis.maxGradeValue]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="school" width={75} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(2)}등급`, '평균 등급']}
                labelFormatter={(label) => {
                  const item = analysis.chartData.find(d => d.school === label);
                  return `${label} (${item?.validCount}명)`;
                }}
              />
              <Bar dataKey="avgGrade" radius={[0, 4, 4, 0]}>
                {analysis.chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 요약 테이블 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">중학교별 요약</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">중학교</th>
                <th className="text-center py-2 px-2">학생 수</th>
                <th className="text-center py-2 px-2">성적 유효</th>
                <th className="text-center py-2 px-2">평균 등급</th>
              </tr>
            </thead>
            <tbody>
              {analysis.chartData.map(row => (
                <tr key={row.school} className="border-b border-muted/30 hover:bg-white/30">
                  <td className="py-1.5 px-2 font-medium">{row.school}</td>
                  <td className="text-center py-1.5 px-2">{row.count}</td>
                  <td className="text-center py-1.5 px-2">{row.validCount}명</td>
                  <td className={`text-center py-1.5 px-2 font-semibold ${gradeColor(row.avgGrade)}`}>
                    {row.avgGrade.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {analysis.chartData.some(d => d.count < 3) && (
          <p className="text-[10px] text-muted-foreground mt-2">* 3명 미만 그룹은 통계적 유의성이 낮을 수 있습니다.</p>
        )}
      </div>
    </div>
  );
};
