import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts';
import type { AnalysisStudentData } from '../../hooks/useAnalysisData';
import { calcWeightedAverage, classifyGapType, convert5To9Grade, GRADE_5_TO_9_MAP, GAP_TYPE_INFO, GapType } from '@/features/evalog/utils/gradeAnalysisUtils';
import { average, getMaxGrade } from '../../utils/analysisUtils';

/**
 * 1·2학년(5등급제) 전용 괴리 유형 판정 — 원점수 기준(9등급 환산 없이).
 * 내신 5등급제는 2등급 이내, 모의고사 9등급제는 4등급 이내를 "양호"로 본다.
 * (3학년은 기존 classifyGapType의 9등급 스케일 기준을 그대로 사용)
 */
function classifyGapType5Grade(academicGrade5: number, mockGrade9: number): GapType {
  const isAcademicGood = academicGrade5 <= 2;
  const isMockGood = mockGrade9 <= 4;

  if (isAcademicGood && isMockGood) return 'A'; // 양호 (둘 다 상위)
  if (isAcademicGood && !isMockGood) return 'B'; // 내신형 (내신만 좋음)
  if (!isAcademicGood && isMockGood) return 'C'; // 수능형 (모의만 좋음)
  return 'D'; // 위험 (둘 다 하위)
}

interface Props {
  data: AnalysisStudentData[];
}

interface StudentGapData {
  name: string;
  id: string;
  academicGrade: number;
  mockGrade: number;
  gapType: 'A' | 'B' | 'C' | 'D';
  gap: number;
}

const GAP_COLORS: Record<string, string> = {
  A: '#10b981',
  B: '#3b82f6',
  C: '#f59e0b',
  D: '#ef4444',
};

export const MockVsSchoolAnalysis: React.FC<Props> = ({ data }) => {
  const analysis = useMemo(() => {
    const students: StudentGapData[] = [];

    data.forEach(student => {
      // 내신 평균 (원본 등급 그대로 사용)
      const records = (student.academic_development || [])
        .filter(r => r.category === 'regular' && r.rank != null)
        .map(r => ({ rank: r.rank!, units: r.units }));
      if (records.length === 0) return;
      const academicGrade = calcWeightedAverage(records);

      // 모의고사 평균
      const mockResults = student.mock_result || [];
      if (mockResults.length === 0) return;

      const mockGrades: number[] = [];
      mockResults.forEach(exam => {
        const subjects = exam.subjects;
        if (subjects && typeof subjects === 'object') {
          Object.values(subjects).forEach((sub: any) => {
            if (sub?.grade != null) mockGrades.push(sub.grade);
          });
        }
      });
      if (mockGrades.length === 0) return;
      const mockGrade = average(mockGrades);

      // classifyGapType은 동일한 9등급 스케일을 전제로 함. 5등급제(1·2학년) 내신은
      // convert5To9Grade로 9등급 환산 후 넘겨야 모의고사(항상 9등급제)와 비교가 성립한다.
      const maxG = getMaxGrade([student]);
      const academicGrade9 = maxG === 5 ? convert5To9Grade(academicGrade) : academicGrade;
      // 유형 판정(A~D)만은 1·2학년(5등급제)의 경우 9등급 환산을 거치지 않고 원점수 기준
      // (내신 2등급 이내 / 모의고사 4등급 이내)을 직접 적용한다 — 5등급제는 내신 자체가
      // 성취평가제라 9등급 환산 시 "양호" 경계가 실제 체감 등급과 어긋나는 문제 보정.
      const gapType = maxG === 5
        ? classifyGapType5Grade(academicGrade, mockGrade)
        : classifyGapType(academicGrade9, mockGrade);

      students.push({
        name: student.name,
        id: student.id,
        academicGrade: parseFloat(academicGrade.toFixed(2)),
        mockGrade: parseFloat(mockGrade.toFixed(2)),
        gapType,
        // 괴리도도 9등급 환산값 기준 — 5등급 원점수를 그대로 빼면 5등급제 학생의
        // 괴리가 실제보다 작아 보이는(또는 커 보이는) 왜곡이 생긴다.
        gap: parseFloat(Math.abs(academicGrade9 - mockGrade).toFixed(2)),
      });
    });

    // 유형별 분포
    const typeCounts = { A: 0, B: 0, C: 0, D: 0 };
    students.forEach(s => typeCounts[s.gapType]++);

    const pieData = Object.entries(typeCounts)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({
        name: `${GAP_TYPE_INFO[type as keyof typeof GAP_TYPE_INFO].label} (${type})`,
        value: count,
        type,
      }));

    // 괴리도 큰 학생 (gap 기준 내림차순)
    const highGapStudents = [...students]
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 10);

    const maxGradeValue = getMaxGrade(data);

    return { students, pieData, highGapStudents, totalWithMock: students.length, totalStudents: data.length, maxGradeValue };
  }, [data]);

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <p className="text-sm text-muted-foreground">
          비교 가능: <span className="font-semibold text-foreground">{analysis.totalWithMock}</span> / {analysis.totalStudents}명
          (모의고사 데이터 보유 학생)
        </p>
      </div>

      {analysis.totalWithMock === 0 ? (
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">모의고사 데이터가 있는 학생이 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 산점도 */}
            <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-4">내신 vs 모의고사 등급</h3>
              <ResponsiveContainer width="100%" height={320}>
                <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="academicGrade"
                    type="number"
                    domain={[1, analysis.maxGradeValue]}
                    name="내신"
                    tick={{ fontSize: 11 }}
                    label={{ value: `내신 등급 (${analysis.maxGradeValue}등급제)`, position: 'bottom', fontSize: 11, offset: -5 }}
                  />
                  <YAxis
                    dataKey="mockGrade"
                    type="number"
                    domain={[1, 9]}
                    name="모의고사"
                    tick={{ fontSize: 11 }}
                    label={{ value: '모의고사 등급 (9등급제)', angle: -90, position: 'insideLeft', fontSize: 11 }}
                  />
                  <ReferenceLine x={analysis.maxGradeValue === 5 ? 2 : 3} stroke="#e5e7eb" strokeDasharray="3 3" />
                  <ReferenceLine y={3} stroke="#e5e7eb" strokeDasharray="3 3" />
                  {/* 대응선: 내신=모의고사 "동일 위치"를 뜻하는 선. 9등급제(3학년)는 y=x가 곧 그 뜻이지만,
                      5등급제(1·2학년) 내신은 스케일이 달라 y=x를 그리면 5등급 구간에만 갇혀 버린다.
                      GRADE_5_TO_9_MAP(=convert5To9Grade가 쓰는 환산표)을 따라 꺾은선으로 그려야
                      "내신 등급대로면 모의고사가 몇 등급이어야 하는지"를 정확히 표시한다. */}
                  {analysis.maxGradeValue === 9 ? (
                    <ReferenceLine
                      segment={[{ x: 1, y: 1 }, { x: 9, y: 9 }]}
                      stroke="#94a3b8"
                      strokeDasharray="5 5"
                      strokeWidth={1}
                    />
                  ) : (
                    GRADE_5_TO_9_MAP.slice(0, -1).map(([x1, y1], i) => {
                      const [x2, y2] = GRADE_5_TO_9_MAP[i + 1];
                      return (
                        <ReferenceLine
                          key={`diag-${i}`}
                          segment={[{ x: x1, y: y1 }, { x: x2, y: y2 }]}
                          stroke="#94a3b8"
                          strokeDasharray="5 5"
                          strokeWidth={1}
                        />
                      );
                    })
                  )}
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0]?.payload;
                      if (!item) return null;
                      return (
                        <div className="bg-white/95 backdrop-blur-sm border border-white/40 rounded-lg shadow-lg p-2.5 text-xs">
                          <p className="font-semibold mb-1">{item.name} ({GAP_TYPE_INFO[item.gapType].label})</p>
                          <p className="text-muted-foreground">내신: <span className="font-medium text-foreground">{item.academicGrade.toFixed(2)}등급</span></p>
                          <p className="text-muted-foreground">모의고사: <span className="font-medium text-foreground">{item.mockGrade.toFixed(2)}등급</span></p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={analysis.students} name="학생">
                    {analysis.students.map((s, i) => (
                      <Cell key={i} fill={GAP_COLORS[s.gapType]} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              {/* 범례 */}
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {Object.entries(GAP_TYPE_INFO).map(([type, info]) => (
                  <div key={type} className="flex items-center gap-1 text-[10px]">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GAP_COLORS[type] }} />
                    <span>{type}: {info.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 유형 분포 파이 차트 */}
            <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-4">유형별 분포</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={analysis.pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {analysis.pieData.map((d, i) => (
                      <Cell key={i} fill={GAP_COLORS[d.type]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>

              {/* 유형 설명 */}
              <div className="space-y-2 mt-3">
                {Object.entries(GAP_TYPE_INFO).map(([type, info]) => (
                  <div key={type} className={`text-[10px] p-2 rounded-lg ${info.bgColor}`}>
                    <span className={`font-semibold ${info.color}`}>{type} ({info.label})</span>
                    : {info.recommendation}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 괴리도 큰 학생 목록 */}
          <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">내신-모의고사 괴리도 TOP 10</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">학생</th>
                    <th className="text-center py-2 px-2">내신</th>
                    <th className="text-center py-2 px-2">모의고사</th>
                    <th className="text-center py-2 px-2">괴리도</th>
                    <th className="text-center py-2 px-2">유형</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.highGapStudents.map(s => (
                    <tr key={s.id} className="border-b border-muted/30 hover:bg-white/30">
                      <td className="py-1.5 px-2 font-medium">{s.name}</td>
                      <td className="text-center py-1.5 px-2">{s.academicGrade}</td>
                      <td className="text-center py-1.5 px-2">{s.mockGrade}</td>
                      <td className="text-center py-1.5 px-2 font-semibold">{s.gap}</td>
                      <td className="text-center py-1.5 px-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${GAP_TYPE_INFO[s.gapType].bgColor} ${GAP_TYPE_INFO[s.gapType].color}`}>
                          {GAP_TYPE_INFO[s.gapType].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
