import React, { useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { AnalysisStudentData } from '../../hooks/useAnalysisData';
import type { StudentDashboardData } from '@/hooks/useStudentDashboard';
import { calcWeightedAverage } from '@/features/evalog/utils/gradeAnalysisUtils';
import { normalize, gradeToScore, average, getMaxGrade, CHART_COLORS, calcTotalAbsent, asRecordArray } from '../../utils/analysisUtils';

interface Props {
  data: AnalysisStudentData[];
  dashboardStudents: StudentDashboardData[];
  afterschoolCounts?: Record<string, number>;
  grade?: number;
}

interface ClassMetrics {
  className: string;
  academic: number;      // 학업 점수 (100점 환산)
  attendance: number;    // 출결 점수 (100점 환산)
  volunteer: number;     // 봉사 점수
  studyRoom: number;     // 자습실 참여율
  afterschool: number;   // 방과후 수강수
  rawAcademic: number;   // 원본 등급
  rawAbsent: number;     // 원본 결석
  rawVolunteer: number;  // 원본 봉사시간
  rawStudyRoom: number;  // 원본 참여율
  rawAfterschool: number; // 원본 수강수
  count: number;
}

const RADAR_INDICATORS: { label: string; key: keyof ClassMetrics }[] = [
  { label: '학업', key: 'academic' },
  { label: '출결', key: 'attendance' },
  { label: '봉사', key: 'volunteer' },
  { label: '자습실', key: 'studyRoom' },
  { label: '방과후', key: 'afterschool' },
];

export const ClassComparisonAnalysis: React.FC<Props> = ({ data, dashboardStudents, afterschoolCounts, grade }) => {
  const analysis = useMemo(() => {
    if (!grade) return null;

    // 학급별 그룹핑
    const classGroups: Record<number, {
      grades: number[];
      absents: number[];
      volunteers: number[];
      studyRates: number[];
      afterschoolCounts: number[];
      count: number;
    }> = {};

    // 분석 데이터로 학업/출결/봉사 계산
    data.forEach(student => {
      if (student.grade !== grade) return;
      const cls = student.class_num;
      if (!classGroups[cls]) classGroups[cls] = { grades: [], absents: [], volunteers: [], studyRates: [], afterschoolCounts: [], count: 0 };
      classGroups[cls].count++;

      // 학업 성적 (원본 등급 그대로 사용)
      const records = (student.academic_development || [])
        .filter(r => r.category === 'regular' && r.rank != null)
        .map(r => ({ rank: r.rank!, units: r.units }));
      if (records.length > 0) {
        classGroups[cls].grades.push(calcWeightedAverage(records));
      }

      // 출결 (결석일수) — attendance/volunteer는 갓 등록된 1학년 등 아직 데이터가 안 채워진
      // 행에서 배열이 아니라 초기값 {}(객체)로 남아있을 수 있어 asRecordArray로 방어한다.
      const totalAbsent = calcTotalAbsent(asRecordArray(student.attendance));
      classGroups[cls].absents.push(totalAbsent);

      // 봉사
      const totalVolunteer = asRecordArray<{ hours?: number }>(student.volunteer)
        .reduce((sum, v) => sum + (v.hours || 0), 0);
      classGroups[cls].volunteers.push(totalVolunteer);
    });

    // 대시보드 데이터로 자습실/방과후 계산
    dashboardStudents.forEach(student => {
      if (student.grade !== grade) return;
      const cls = student.class_num;
      if (!classGroups[cls]) return;

      classGroups[cls].studyRates.push(student.attendance_rate || 0);
      const aCount = afterschoolCounts?.[student.student_code] || 0;
      classGroups[cls].afterschoolCounts.push(aCount);
    });

    // 지표 계산
    const rawMetrics = Object.entries(classGroups).map(([cls, g]) => ({
      className: `${cls}반`,
      classNum: parseInt(cls),
      rawAcademic: g.grades.length > 0 ? average(g.grades) : 5,
      rawAbsent: average(g.absents),
      rawVolunteer: average(g.volunteers),
      rawStudyRoom: g.studyRates.length > 0 ? average(g.studyRates) : 0,
      rawAfterschool: average(g.afterschoolCounts),
      count: g.count,
    }));

    // 정규화 (0~100)
    const mgv = getMaxGrade(data);
    const metrics: ClassMetrics[] = rawMetrics.map(m => ({
      className: m.className,
      academic: gradeToScore(m.rawAcademic, mgv),
      attendance: Math.max(0, 100 - m.rawAbsent * 10), // 결석 적을수록 좋음
      volunteer: normalize(m.rawVolunteer, 0, Math.max(...rawMetrics.map(r => r.rawVolunteer), 1)),
      studyRoom: m.rawStudyRoom,
      afterschool: normalize(m.rawAfterschool, 0, Math.max(...rawMetrics.map(r => r.rawAfterschool), 1)),
      rawAcademic: parseFloat(m.rawAcademic.toFixed(2)),
      rawAbsent: parseFloat(m.rawAbsent.toFixed(1)),
      rawVolunteer: parseFloat(m.rawVolunteer.toFixed(1)),
      rawStudyRoom: parseFloat(m.rawStudyRoom.toFixed(1)),
      rawAfterschool: parseFloat(m.rawAfterschool.toFixed(1)),
      count: m.count,
    }));

    return { metrics };
  }, [data, dashboardStudents, afterschoolCounts, grade]);

  if (!grade) {
    return (
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">학년을 선택해주세요.</p>
        <p className="text-xs text-muted-foreground mt-1">왼쪽 사이드바에서 학년을 선택하면 학급별 비교 분석을 확인할 수 있습니다.</p>
      </div>
    );
  }

  if (!analysis || analysis.metrics.length === 0) {
    return (
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 레이더 차트 — 반별로 분리된 카드 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4">{grade}학년 학급별 종합 비교</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {analysis.metrics.map((m, i) => {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const radarRows = RADAR_INDICATORS.map(({ label, key }) => ({
              indicator: label,
              value: parseFloat((m[key] as number).toFixed(1)),
            }));
            return (
              <div key={m.className} className="bg-white/40 rounded-lg border border-white/30 p-2">
                <p className="text-xs font-semibold text-center mb-1">{m.className}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarRows}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="indicator" tick={{ fontSize: 10 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
                    <Radar name={m.className} dataKey="value" stroke={color} fill={color} fillOpacity={0.35} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      </div>

      {/* 지표별 비교 바 차트 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4">학급별 지표 비교</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={analysis.metrics} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="className" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="academic" name="학업" fill={CHART_COLORS[0]} />
            <Bar dataKey="attendance" name="출결" fill={CHART_COLORS[1]} />
            <Bar dataKey="volunteer" name="봉사" fill={CHART_COLORS[2]} />
            <Bar dataKey="studyRoom" name="자습실" fill={CHART_COLORS[3]} />
            <Bar dataKey="afterschool" name="방과후" fill={CHART_COLORS[4]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 상세 테이블 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">학급별 상세 지표</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">학급</th>
                <th className="text-center py-2 px-2">학생 수</th>
                <th className="text-center py-2 px-2">평균 등급</th>
                <th className="text-center py-2 px-2">평균 결석</th>
                <th className="text-center py-2 px-2">평균 봉사(h)</th>
                <th className="text-center py-2 px-2">자습실(%)</th>
                <th className="text-center py-2 px-2">방과후(과목)</th>
              </tr>
            </thead>
            <tbody>
              {analysis.metrics.map(m => (
                <tr key={m.className} className="border-b border-muted/30 hover:bg-white/30">
                  <td className="py-1.5 px-2 font-medium">{m.className}</td>
                  <td className="text-center py-1.5 px-2">{m.count}</td>
                  <td className="text-center py-1.5 px-2 font-semibold">{m.rawAcademic}</td>
                  <td className="text-center py-1.5 px-2">{m.rawAbsent}일</td>
                  <td className="text-center py-1.5 px-2">{m.rawVolunteer}h</td>
                  <td className="text-center py-1.5 px-2">{m.rawStudyRoom}%</td>
                  <td className="text-center py-1.5 px-2">{m.rawAfterschool}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
