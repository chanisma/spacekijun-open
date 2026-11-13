import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { drawLineProps, fadeLineProps } from '@/lib/chartAnimation';
import { Student, Evaluation } from '../../types';

interface EvaluationChartsProps {
  student: Student | null;
  evaluation: Evaluation | null;
  allStudents?: Student[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const EvaluationCharts: React.FC<EvaluationChartsProps> = ({
  student,
  evaluation,
  allStudents = []
}) => {
  if (!student || !evaluation) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>평가 데이터가 없습니다</p>
      </div>
    );
  }

  // 워크시트 점수 데이터
  const worksheetScores = evaluation.worksheets.map((ws) => ({
    category: ws.category,
    score: ws.score,
    maxScore: ws.maxScore,
    percentage: (ws.score / ws.maxScore) * 100
  }));

  // 세부 항목 점수 데이터
  const detailedScores = evaluation.worksheets.flatMap((ws) =>
    ws.subItems.map((item) => ({
      name: item.name,
      category: ws.category,
      score: item.score,
      maxScore: 100
    }))
  );

  // 레이더 차트용 데이터
  const radarData = evaluation.worksheets.map((ws) => ({
    subject: ws.category,
    score: (ws.score / ws.maxScore) * 100,
    fullMark: 100
  }));

  // 분포 데이터 (파이 차트)
  const distributionData = worksheetScores.map((ws) => ({
    name: ws.category,
    value: ws.percentage
  }));

  // 학생 비교 데이터 (다른 학생들과 비교)
  const comparisonData = allStudents
    .filter((s) => s.totalScore !== null)
    .map((s) => ({
      name: s.name,
      score: s.totalScore,
      isCurrentStudent: s.id === student.id
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <div className="space-y-6">
      {/* 카테고리별 점수 막대 차트 */}
      <div className="bg-card p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">카테고리별 점수</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={worksheetScores}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" />
            <YAxis />
            <Tooltip
              formatter={(value: any, name: string) => {
                if (name === 'percentage') return `${value.toFixed(1)}%`;
                return value;
              }}
            />
            <Legend />
            <Bar dataKey="score" fill="#3b82f6" name="점수" />
            <Bar dataKey="maxScore" fill="#e5e7eb" name="만점" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 레이더 차트 */}
      <div className="bg-card p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">역량 분석</h3>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis angle={90} domain={[0, 100]} />
            <Radar
              name="점수"
              dataKey="score"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.6}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* 점수 분포 파이 차트 */}
      <div className="bg-card p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">점수 분포</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={distributionData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }: any) => `${name} ${((percent as number) * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {distributionData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: any) => `${value.toFixed(1)}%`} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 학생 비교 차트 */}
      {comparisonData.length > 1 && (
        <div className="bg-card p-4 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4">학생 점수 비교</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparisonData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip />
              <Bar
                dataKey="score"
                fill="#3b82f6"
                shape={(props: any) => {
                  const fill = props.payload.isCurrentStudent ? '#3b82f6' : '#e5e7eb';
                  return <rect {...props} fill={fill} />;
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 세부 항목 점수 라인 차트 */}
      <div className="bg-card p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">세부 항목 점수</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={detailedScores}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
            />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Line
              {...drawLineProps}
              type="monotone"
              dataKey="score"
              stroke="#3b82f6"
              name="점수"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 6 }}
            />
            <Line
              {...fadeLineProps}
              type="monotone"
              dataKey="maxScore"
              stroke="#e5e7eb"
              name="만점"
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 통계 요약 */}
      <div className="bg-card p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">통계 요약</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">총점</p>
            <p className="text-2xl font-bold text-primary">
              {student.totalScore?.toFixed(1)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">평균</p>
            <p className="text-2xl font-bold">
              {(
                worksheetScores.reduce((sum, ws) => sum + ws.percentage, 0) /
                worksheetScores.length
              ).toFixed(1)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">최고 영역</p>
            <p className="text-lg font-semibold text-green-600">
              {worksheetScores.reduce((max, ws) =>
                ws.percentage > (max?.percentage || 0) ? ws : max
              ).category}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">개선 필요</p>
            <p className="text-lg font-semibold text-orange-600">
              {worksheetScores.reduce((min, ws) =>
                ws.percentage < (min?.percentage || 100) ? ws : min
              ).category}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationCharts;