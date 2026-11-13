import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { AnalysisStudentData } from '../../hooks/useAnalysisData';
import type { StudentDashboardData } from '@/hooks/useStudentDashboard';
import { CHART_COLORS, average, asRecordArray } from '../../utils/analysisUtils';

interface Props {
  data: AnalysisStudentData[];
  dashboardStudents: StudentDashboardData[];
  afterschoolCounts?: Record<string, number>;
}

export const ComprehensiveActivityAnalysis: React.FC<Props> = ({ data, dashboardStudents, afterschoolCounts }) => {
  const analysis = useMemo(() => {
    // 봉사 시간 분포
    const volunteerHours: number[] = [];
    data.forEach(student => {
      const total = asRecordArray<{ hours?: number }>(student.volunteer).reduce((sum, v) => sum + (v.hours || 0), 0);
      volunteerHours.push(total);
    });

    const volunteerDist = [
      { range: '0시간', count: volunteerHours.filter(h => h === 0).length },
      { range: '1-10', count: volunteerHours.filter(h => h >= 1 && h <= 10).length },
      { range: '11-20', count: volunteerHours.filter(h => h >= 11 && h <= 20).length },
      { range: '21-30', count: volunteerHours.filter(h => h >= 21 && h <= 30).length },
      { range: '31+', count: volunteerHours.filter(h => h > 30).length },
    ].filter(d => d.count > 0);

    // 독서 분포
    const readingCounts: number[] = [];
    data.forEach(student => {
      const count = (student.reading || []).length;
      readingCounts.push(count);
    });

    const readingDist = [
      { range: '0권', count: readingCounts.filter(c => c === 0).length },
      { range: '1-5', count: readingCounts.filter(c => c >= 1 && c <= 5).length },
      { range: '6-10', count: readingCounts.filter(c => c >= 6 && c <= 10).length },
      { range: '11-20', count: readingCounts.filter(c => c >= 11 && c <= 20).length },
      { range: '21+', count: readingCounts.filter(c => c > 20).length },
    ].filter(d => d.count > 0);

    // 자습실 참여 분포
    const studyRoomRates: number[] = [];
    dashboardStudents.forEach(s => {
      studyRoomRates.push(s.attendance_rate || 0);
    });

    const studyRoomDist = [
      { range: '0%', count: studyRoomRates.filter(r => r === 0).length },
      { range: '1-25%', count: studyRoomRates.filter(r => r > 0 && r <= 25).length },
      { range: '26-50%', count: studyRoomRates.filter(r => r > 25 && r <= 50).length },
      { range: '51-75%', count: studyRoomRates.filter(r => r > 50 && r <= 75).length },
      { range: '76-100%', count: studyRoomRates.filter(r => r > 75).length },
    ].filter(d => d.count > 0);

    // 방과후 분포
    const asCounts: number[] = [];
    if (afterschoolCounts) {
      Object.values(afterschoolCounts).forEach(c => asCounts.push(c));
    }

    const afterschoolDist = [
      { range: '0과목', count: asCounts.filter(c => c === 0).length },
      { range: '1-2', count: asCounts.filter(c => c >= 1 && c <= 2).length },
      { range: '3-4', count: asCounts.filter(c => c >= 3 && c <= 4).length },
      { range: '5+', count: asCounts.filter(c => c >= 5).length },
    ].filter(d => d.count > 0);

    // 요약 통계
    const totalVolunteer = volunteerHours.reduce((a, b) => a + b, 0);
    const totalReading = readingCounts.reduce((a, b) => a + b, 0);
    const studyRoomParticipants = studyRoomRates.filter(r => r > 0).length;
    const totalAfterschool = asCounts.reduce((a, b) => a + b, 0);

    return {
      volunteerDist,
      readingDist,
      studyRoomDist,
      afterschoolDist,
      summary: {
        totalVolunteer: parseFloat(totalVolunteer.toFixed(1)),
        avgVolunteer: volunteerHours.length > 0 ? parseFloat(average(volunteerHours).toFixed(1)) : 0,
        totalReading,
        avgReading: readingCounts.length > 0 ? parseFloat(average(readingCounts).toFixed(1)) : 0,
        studyRoomParticipants,
        studyRoomTotal: studyRoomRates.length,
        avgStudyRoomRate: studyRoomRates.length > 0 ? parseFloat(average(studyRoomRates).toFixed(1)) : 0,
        totalAfterschool,
        avgAfterschool: asCounts.length > 0 ? parseFloat(average(asCounts).toFixed(1)) : 0,
      },
    };
  }, [data, dashboardStudents, afterschoolCounts]);

  const MiniBarChart: React.FC<{ data: { range: string; count: number }[]; title: string; colorIndex: number }> = ({
    data: chartData, title, colorIndex,
  }) => (
    <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {chartData.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">데이터 없음</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="range" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => [`${value}명`, '학생 수']} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={CHART_COLORS[colorIndex]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">총 봉사시간</p>
          <p className="text-xl font-bold text-indigo-600">{analysis.summary.totalVolunteer}h</p>
          <p className="text-[10px] text-muted-foreground">평균 {analysis.summary.avgVolunteer}h/인</p>
        </div>
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">총 독서 수</p>
          <p className="text-xl font-bold text-violet-600">{analysis.summary.totalReading}권</p>
          <p className="text-[10px] text-muted-foreground">평균 {analysis.summary.avgReading}권/인</p>
        </div>
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">자습실 참여</p>
          <p className="text-xl font-bold text-teal-600">{analysis.summary.studyRoomParticipants}명</p>
          <p className="text-[10px] text-muted-foreground">평균 출석률 {analysis.summary.avgStudyRoomRate}%</p>
        </div>
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">방과후 수강</p>
          <p className="text-xl font-bold text-pink-600">{analysis.summary.totalAfterschool}건</p>
          <p className="text-[10px] text-muted-foreground">평균 {analysis.summary.avgAfterschool}과목/인</p>
        </div>
      </div>

      {/* 4개 미니 차트 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MiniBarChart data={analysis.volunteerDist} title="봉사시간 분포" colorIndex={0} />
        <MiniBarChart data={analysis.readingDist} title="독서 권수 분포" colorIndex={1} />
        <MiniBarChart data={analysis.studyRoomDist} title="자습실 출석률 분포" colorIndex={7} />
        <MiniBarChart data={analysis.afterschoolDist} title="방과후 수강 과목수 분포" colorIndex={4} />
      </div>
    </div>
  );
};
