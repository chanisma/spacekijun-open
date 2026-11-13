import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import type { AnalysisStudentData } from '../../hooks/useAnalysisData';
import { subjectGroupToCategory } from '@/features/course-analyze/utils/gradeMapping';
import { CHART_COLORS } from '../../utils/analysisUtils';
import { filterElectiveSubjects } from '../../utils/electiveSubjects';

interface Props {
  data: AnalysisStudentData[];
}

export const SubjectSelectionAnalysis: React.FC<Props> = ({ data }) => {
  const analysis = useMemo(() => {
    /** 과목 -> { 교과군, 수강 학생 } */
    const subjectInfo = new Map<string, { group: string | null; students: Set<string> }>();
    const categoryCount: Record<string, number> = {};
    const studentSubjects: Record<string, Set<string>> = {}; // studentId → subjects

    data.forEach(student => {
      const careerSubjects = new Set<string>();

      (student.academic_development || []).forEach(r => {
        if (r.category !== 'career') return;

        const subject = r.subject;
        const info = subjectInfo.get(subject) ?? { group: r.subject_group ?? null, students: new Set<string>() };
        info.students.add(student.id);
        subjectInfo.set(subject, info);
        careerSubjects.add(subject);

        const cat = subjectGroupToCategory(r.subject_group);
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      });

      if (careerSubjects.size > 0) {
        studentSubjects[student.id] = careerSubjects;
      }
    });

    const totalStudents = Object.keys(studentSubjects).length;

    /*
      인기·조합 분석은 **선택의 신호가 있는 과목**만 본다.
      예체능·외국어와 사실상 전원이 듣는 과목을 그대로 세면 상위권이 통째로 그것들로 채워져
      "무엇이 인기인가"에 답하지 못한다(판정 근거는 utils/electiveSubjects).
    */
    const electiveEntries = filterElectiveSubjects(
      [...subjectInfo.entries()].map(([subject, info]) => ({
        subject,
        subjectGroup: info.group,
        count: info.students.size,
      })),
      totalStudents
    );
    const electiveNames = new Set(electiveEntries.map(e => e.subject));

    // 인기 과목 TOP 10
    const popularSubjects = [...electiveEntries]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 교과군별 분포 — 여기는 편성 전체의 모습이라 거르지 않는다
    const categoryData = Object.entries(categoryCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 과목 조합 분석 (자주 함께 수강하는 과목 쌍) — 인기 과목과 같은 모집단을 쓴다.
    // 안 거르면 전원 수강 과목끼리의 쌍(음악 연주 + 스포츠 생활)이 항상 1위가 된다.
    const pairCounts: Record<string, number> = {};
    Object.values(studentSubjects).forEach(subjects => {
      const subjectArr = Array.from(subjects).filter(s => electiveNames.has(s));
      for (let i = 0; i < subjectArr.length; i++) {
        for (let j = i + 1; j < subjectArr.length; j++) {
          const pair = [subjectArr[i], subjectArr[j]].sort().join(' + ');
          pairCounts[pair] = (pairCounts[pair] || 0) + 1;
        }
      }
    });

    const topPairs = Object.entries(pairCounts)
      .map(([pair, count]) => ({ pair, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      popularSubjects,
      categoryData,
      topPairs,
      totalStudents,
      /** 제외된 과목 수 — 조용히 거르지 않고 화면에 밝힌다 */
      excludedCount: subjectInfo.size - electiveEntries.length,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <p className="text-sm text-muted-foreground">
          진로선택과목 수강 학생: <span className="font-semibold text-foreground">{analysis.totalStudents}명</span>
        </p>
        {/* 무엇을 뺐는지 밝힌다 — 조용히 거르면 숫자가 왜 다른지 알 길이 없다 */}
        {analysis.excludedCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            인기 과목·조합에서는 <strong className="font-medium">예체능·외국어</strong>와
            <strong className="font-medium"> 사실상 전원이 듣는 과목</strong>을 제외했습니다
            ({analysis.excludedCount}개). 선택이 아닌 과목이 상위를 차지하는 것을 막기 위함입니다.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 인기 과목 TOP 10 */}
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4">인기 과목 TOP 10</h3>
          {analysis.popularSubjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">데이터가 없습니다.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(250, analysis.popularSubjects.length * 28)}>
              <BarChart data={analysis.popularSubjects} layout="vertical" margin={{ left: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="subject" width={75} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number) => [`${value}명`, '수강 학생 수']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {analysis.popularSubjects.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 교과군별 분포 */}
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4">교과군별 선택 분포</h3>
          {analysis.categoryData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">데이터가 없습니다.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={analysis.categoryData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {analysis.categoryData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value}건`, '수강 건수']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 과목 조합 분석 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">자주 함께 수강하는 과목 조합 TOP 10</h3>
        {analysis.topPairs.length === 0 ? (
          <p className="text-xs text-muted-foreground">조합 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">순위</th>
                  <th className="text-left py-2 px-2">과목 조합</th>
                  <th className="text-center py-2 px-2">동시 수강 학생 수</th>
                </tr>
              </thead>
              <tbody>
                {analysis.topPairs.map((row, i) => (
                  <tr key={row.pair} className="border-b border-muted/30 hover:bg-white/30">
                    <td className="py-1.5 px-2 font-medium">{i + 1}</td>
                    <td className="py-1.5 px-2">{row.pair}</td>
                    <td className="text-center py-1.5 px-2 font-semibold">{row.count}명</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
