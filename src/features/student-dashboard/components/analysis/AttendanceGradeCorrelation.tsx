import React, { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from 'recharts';
import type { AnalysisStudentData } from '../../hooks/useAnalysisData';
import { calcWeightedAverage } from '@/features/evalog/utils/gradeAnalysisUtils';
import { pearsonCorrelation, average, CHART_COLORS, gradeColor, getMaxGrade, calcTotalAbsent, asRecordArray } from '../../utils/analysisUtils';
import type { AttendanceRecord } from '../../utils/analysisUtils';

interface Props {
  data: AnalysisStudentData[];
}

/** 출결 레코드 필터 (학년별) */
function filterByAttGrade(records: AttendanceRecord[], attGrade: number | null): AttendanceRecord[] {
  if (attGrade === null) return records;
  return records.filter(a => a.grade === attGrade);
}

/** 출결 항목별 합산 */
function sumSubRecord(records: AttendanceRecord[], key: 'absence' | 'tardiness' | 'earlyLeave' | 'classSkip'): { disease: number; unapproved: number; other: number; total: number } {
  let disease = 0, unapproved = 0, other = 0;
  records.forEach(a => {
    const sub = a[key];
    if (!sub) return;
    disease += sub.disease || 0;
    unapproved += sub.unapproved || 0;
    other += sub.other || 0;
  });
  return { disease, unapproved, other, total: disease + unapproved + other };
}

interface DetailedStudentPoint {
  name: string;
  id: string;
  grade: number;
  classNum: number;
  avgGrade: number;
  absence: { disease: number; unapproved: number; other: number; total: number };
  tardiness: { disease: number; unapproved: number; other: number; total: number };
  earlyLeave: { disease: number; unapproved: number; other: number; total: number };
  classSkip: { disease: number; unapproved: number; other: number; total: number };
  totalIssues: number; // 결석+지각+조퇴+수업결손 합계
  schoolDays: number;
}

const ABSENCE_BANDS = [
  { label: '무결석(0)', min: 0, max: 0 },
  { label: '양호(1-3)', min: 1, max: 3 },
  { label: '주의(4-7)', min: 4, max: 7 },
  { label: '위험(8+)', min: 8, max: Infinity },
];

const BAND_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

type ViewMode = 'absence' | 'all';

export const AttendanceGradeCorrelation: React.FC<Props> = ({ data }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('absence');
  const [attGradeFilter, setAttGradeFilter] = useState<number | null>(null); // null = 전체

  // 출결 데이터에 존재하는 학년 목록
  const availableAttGrades = useMemo(() => {
    const grades = new Set<number>();
    data.forEach(s => asRecordArray<AttendanceRecord>(s.attendance).forEach(a => { if (a.grade) grades.add(a.grade); }));
    return [...grades].sort((a, b) => a - b);
  }, [data]);

  const analysis = useMemo(() => {
    const points: DetailedStudentPoint[] = [];

    data.forEach(student => {
      const records = (student.academic_development || [])
        .filter(r => r.category === 'regular' && r.rank != null)
        .map(r => ({ rank: r.rank!, units: r.units }));
      if (records.length === 0) return;
      const avgGrade = calcWeightedAverage(records);

      const attendance = filterByAttGrade(asRecordArray<AttendanceRecord>(student.attendance), attGradeFilter);
      const absence = sumSubRecord(attendance, 'absence');
      const tardiness = sumSubRecord(attendance, 'tardiness');
      const earlyLeave = sumSubRecord(attendance, 'earlyLeave');
      const classSkip = sumSubRecord(attendance, 'classSkip');
      const totalIssues = absence.total + tardiness.total + earlyLeave.total + classSkip.total;
      const schoolDays = attendance.reduce((sum, a) => sum + (a.schoolDays || 0), 0);

      points.push({
        name: student.name,
        id: student.id,
        grade: student.grade,
        classNum: student.class_num,
        avgGrade: parseFloat(avgGrade.toFixed(2)),
        absence,
        tardiness,
        earlyLeave,
        classSkip,
        totalIssues,
        schoolDays,
      });
    });

    // 상관계수 (결석 vs 등급)
    const absCorr = pearsonCorrelation(
      points.map(p => p.absence.total),
      points.map(p => p.avgGrade),
    );
    // 상관계수 (출결 종합 vs 등급)
    const totalCorr = pearsonCorrelation(
      points.map(p => p.totalIssues),
      points.map(p => p.avgGrade),
    );

    const maxGradeValue = getMaxGrade(data);
    const riskGradeThreshold = maxGradeValue === 5 ? 4 : 5;

    // --- 결석 구간별 평균등급 ---
    const bandData = ABSENCE_BANDS.map((band, i) => {
      const bandStudents = points.filter(
        p => p.absence.total >= band.min && p.absence.total <= band.max,
      );
      return {
        label: band.label,
        avgGrade: bandStudents.length > 0 ? parseFloat(average(bandStudents.map(s => s.avgGrade)).toFixed(2)) : 0,
        count: bandStudents.length,
        color: BAND_COLORS[i],
      };
    }).filter(b => b.count > 0);

    // --- 결석 유형별 비율 (전체 합산) ---
    const totalAbsence = { disease: 0, unapproved: 0, other: 0 };
    points.forEach(p => {
      totalAbsence.disease += p.absence.disease;
      totalAbsence.unapproved += p.absence.unapproved;
      totalAbsence.other += p.absence.other;
    });
    const absenceTypePie = [
      { name: '질병', value: totalAbsence.disease, color: '#3b82f6' },
      { name: '무단', value: totalAbsence.unapproved, color: '#ef4444' },
      { name: '기타', value: totalAbsence.other, color: '#94a3b8' },
    ].filter(d => d.value > 0);

    // --- 출결 유형별 전체 현황 (결석/지각/조퇴/수업결손) ---
    const issueTypeSummary = [
      { type: '결석', total: points.reduce((s, p) => s + p.absence.total, 0), color: '#ef4444' },
      { type: '지각', total: points.reduce((s, p) => s + p.tardiness.total, 0), color: '#f59e0b' },
      { type: '조퇴', total: points.reduce((s, p) => s + p.earlyLeave.total, 0), color: '#8b5cf6' },
      { type: '수업결손', total: points.reduce((s, p) => s + p.classSkip.total, 0), color: '#06b6d4' },
    ];

    // --- 위험 학생 (결석 기반 + 종합 기반) ---
    const riskStudents = points
      .filter(p => (p.absence.total >= 4 || p.totalIssues >= 10) && p.avgGrade >= riskGradeThreshold)
      .sort((a, b) => b.totalIssues - a.totalIssues || b.avgGrade - a.avgGrade);

    // --- 무단결석 학생 (별도 관리 대상) ---
    const unapprovedStudents = points
      .filter(p => p.absence.unapproved > 0)
      .sort((a, b) => b.absence.unapproved - a.absence.unapproved);

    // --- 추세선 ---
    const scatterKey = viewMode === 'absence' ? 'absence.total' : 'totalIssues';
    const scatterPoints = points.map(p => ({
      ...p,
      xValue: viewMode === 'absence' ? p.absence.total : p.totalIssues,
    }));

    let trendLineData: { x: number; y: number }[] = [];
    if (scatterPoints.length >= 2) {
      const xVals = scatterPoints.map(p => p.xValue);
      const yVals = scatterPoints.map(p => p.avgGrade);
      const n = xVals.length;
      const sumX = xVals.reduce((a, b) => a + b, 0);
      const sumY = yVals.reduce((a, b) => a + b, 0);
      const sumXY = xVals.reduce((s, x, i) => s + x * yVals[i], 0);
      const sumXX = xVals.reduce((s, x) => s + x * x, 0);
      const denom = n * sumXX - sumX * sumX;
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;
        const sorted = [...xVals].sort((a, b) => a - b);
        const minX = sorted[0];
        const maxX = sorted[sorted.length - 1];
        trendLineData = [
          { x: minX, y: parseFloat((slope * minX + intercept).toFixed(2)) },
          { x: maxX, y: parseFloat((slope * maxX + intercept).toFixed(2)) },
        ];
      }
    }

    // --- 학생별 상세 테이블 (출결 이슈가 있는 학생만, 상위 20명) ---
    const detailStudents = [...points]
      .filter(p => p.totalIssues > 0)
      .sort((a, b) => b.totalIssues - a.totalIssues)
      .slice(0, 20);

    // --- 개근 학생 수 ---
    const perfectAttendance = points.filter(p => p.totalIssues === 0).length;

    // --- 학년별 출결 추이 (필터 없이 전체 데이터 사용) ---
    const gradeYearTrend: { gradeYear: string; absence: number; tardiness: number; earlyLeave: number; classSkip: number; total: number; count: number }[] = [];
    const gradeYearMap: Record<number, { absence: number; tardiness: number; earlyLeave: number; classSkip: number; count: number }> = {};
    data.forEach(student => {
      asRecordArray<AttendanceRecord>(student.attendance).forEach(a => {
        const g = a.grade;
        if (!g) return;
        if (!gradeYearMap[g]) gradeYearMap[g] = { absence: 0, tardiness: 0, earlyLeave: 0, classSkip: 0, count: 0 };
        const ab = a.absence;
        const td = a.tardiness;
        const el = a.earlyLeave;
        const cs = a.classSkip;
        gradeYearMap[g].absence += (ab?.disease || 0) + (ab?.unapproved || 0) + (ab?.other || 0);
        gradeYearMap[g].tardiness += (td?.disease || 0) + (td?.unapproved || 0) + (td?.other || 0);
        gradeYearMap[g].earlyLeave += (el?.disease || 0) + (el?.unapproved || 0) + (el?.other || 0);
        gradeYearMap[g].classSkip += (cs?.disease || 0) + (cs?.unapproved || 0) + (cs?.other || 0);
        gradeYearMap[g].count++;
      });
    });
    Object.entries(gradeYearMap)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([g, v]) => {
        gradeYearTrend.push({
          gradeYear: `${g}학년`,
          absence: parseFloat((v.absence / v.count).toFixed(1)),
          tardiness: parseFloat((v.tardiness / v.count).toFixed(1)),
          earlyLeave: parseFloat((v.earlyLeave / v.count).toFixed(1)),
          classSkip: parseFloat((v.classSkip / v.count).toFixed(1)),
          total: parseFloat(((v.absence + v.tardiness + v.earlyLeave + v.classSkip) / v.count).toFixed(1)),
          count: v.count,
        });
      });

    return {
      points, scatterPoints, absCorr, totalCorr, bandData,
      absenceTypePie, issueTypeSummary,
      riskStudents, unapprovedStudents, detailStudents,
      trendLineData, maxGradeValue, riskGradeThreshold,
      perfectAttendance, gradeYearTrend,
    };
  }, [data, viewMode, attGradeFilter]);

  const corrLabel = (r: number) =>
    Math.abs(r) > 0.5 ? '강한 상관' : Math.abs(r) > 0.3 ? '중간 상관' : '약한 상관';

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground">분석 대상</p>
          <p className="text-xl font-bold text-foreground">{analysis.points.length}명</p>
        </div>
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground">개근 학생</p>
          <p className="text-xl font-bold text-emerald-600">{analysis.perfectAttendance}명</p>
          <p className="text-[10px] text-muted-foreground">{analysis.points.length > 0 ? ((analysis.perfectAttendance / analysis.points.length) * 100).toFixed(0) : 0}%</p>
        </div>
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground">결석-성적 상관</p>
          <p className="text-xl font-bold text-foreground">{analysis.absCorr.toFixed(3)}</p>
          <p className="text-[10px] text-muted-foreground">{corrLabel(analysis.absCorr)}</p>
        </div>
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground">종합출결-성적 상관</p>
          <p className="text-xl font-bold text-foreground">{analysis.totalCorr.toFixed(3)}</p>
          <p className="text-[10px] text-muted-foreground">{corrLabel(analysis.totalCorr)}</p>
        </div>
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-muted-foreground">위험 학생</p>
          <p className="text-xl font-bold text-rose-600">{analysis.riskStudents.length}명</p>
          <p className="text-[10px] text-muted-foreground">출결+성적 복합 위험</p>
        </div>
      </div>

      {/* 출결 학년 필터 */}
      {availableAttGrades.length > 1 && (
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground">출결 학년:</span>
            <button
              onClick={() => setAttGradeFilter(null)}
              className={`px-3 py-1 text-xs rounded-full transition-all ${
                attGradeFilter === null
                  ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm'
                  : 'bg-white/50 text-slate-600 hover:bg-white/80'
              }`}
            >
              전체 (누적)
            </button>
            {availableAttGrades.map(g => (
              <button
                key={g}
                onClick={() => setAttGradeFilter(g)}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  attGradeFilter === g
                    ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm'
                    : 'bg-white/50 text-slate-600 hover:bg-white/80'
                }`}
              >
                {g}학년
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {attGradeFilter === null
              ? '모든 학년의 출결 데이터를 누적하여 분석합니다.'
              : `${attGradeFilter}학년 시기의 출결 데이터만 분석합니다.`}
          </p>
        </div>
      )}

      {/* 학년별 출결 추이 */}
      {analysis.gradeYearTrend.length > 1 && attGradeFilter === null && (
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4">학년별 평균 출결 추이</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analysis.gradeYearTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="gradeYear" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number, name: string) => [`${value}건/인`, name]}
                labelFormatter={(label, payload) => `${label} (${payload?.[0]?.payload?.count}명)`}
              />
              <Legend />
              <Bar dataKey="absence" name="결석" stackId="a" fill="#ef4444" />
              <Bar dataKey="tardiness" name="지각" stackId="a" fill="#f59e0b" />
              <Bar dataKey="earlyLeave" name="조퇴" stackId="a" fill="#8b5cf6" />
              <Bar dataKey="classSkip" name="수업결손" stackId="a" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground mt-1 text-center">1인당 평균 출결 이슈 건수 (학년별 추이)</p>
        </div>
      )}

      {/* 출결 유형별 현황 바 + 결석 사유별 파이 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4">출결 유형별 현황 (전체 합산)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analysis.issueTypeSummary} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="type" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [`${value}건`, '합계']} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {analysis.issueTypeSummary.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* 인라인 수치 */}
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {analysis.issueTypeSummary.map(d => (
              <div key={d.type} className="flex items-center gap-1 text-[10px]">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span>{d.type}: {d.total}건</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-4">결석 사유별 비율</h3>
          {analysis.absenceTypePie.length === 0 ? (
            <div className="flex items-center justify-center h-[200px]">
              <p className="text-sm text-muted-foreground">결석 데이터가 없습니다.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={analysis.absenceTypePie}
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, value, percent }) => `${name} ${value}건 (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {analysis.absenceTypePie.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value}건`]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 보기 모드 전환 + 산점도 */}
      <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">출결 vs 평균등급</h3>
          <div className="flex items-center gap-1 bg-white/50 px-2 py-1 rounded-full border border-white/40">
            <button
              onClick={() => setViewMode('absence')}
              className={`px-3 py-1 text-[11px] rounded-full transition-all ${viewMode === 'absence' ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              결석일수만
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 text-[11px] rounded-full transition-all ${viewMode === 'all' ? 'bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              종합 (결석+지각+조퇴+결손)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 산점도 */}
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="xValue"
                type="number"
                name={viewMode === 'absence' ? '결석일수' : '출결이슈 합계'}
                tick={{ fontSize: 11 }}
                label={{ value: viewMode === 'absence' ? '결석일수' : '출결이슈 합계(일)', position: 'bottom', fontSize: 11, offset: -5 }}
              />
              <YAxis
                dataKey="avgGrade"
                type="number"
                domain={[1, analysis.maxGradeValue]}
                reversed
                name="평균등급"
                tick={{ fontSize: 11 }}
                label={{ value: '평균등급', angle: -90, position: 'insideLeft', fontSize: 11 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0]?.payload as DetailedStudentPoint & { xValue: number };
                  if (!item) return null;
                  return (
                    <div className="bg-white/95 backdrop-blur-sm border border-white/40 rounded-lg shadow-lg p-2.5 text-xs">
                      <p className="font-semibold mb-1">{item.name} ({item.grade}-{item.classNum})</p>
                      <p>평균등급: <span className="font-medium">{item.avgGrade}등급</span></p>
                      <p>결석: <span className="font-medium">{item.absence.total}일</span> (질병{item.absence.disease}/무단{item.absence.unapproved}/기타{item.absence.other})</p>
                      <p>지각: {item.tardiness.total} | 조퇴: {item.earlyLeave.total} | 결손: {item.classSkip.total}</p>
                    </div>
                  );
                }}
              />
              {analysis.trendLineData.length === 2 && (
                <ReferenceLine
                  segment={[
                    { x: analysis.trendLineData[0].x, y: analysis.trendLineData[0].y },
                    { x: analysis.trendLineData[1].x, y: analysis.trendLineData[1].y },
                  ]}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                />
              )}
              <Scatter data={analysis.scatterPoints} fill="#6366f1" fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>

          {/* 결석 구간별 평균등급 */}
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={analysis.bandData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis reversed domain={[1, analysis.maxGradeValue]} tick={{ fontSize: 11 }} label={{ value: '평균등급', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(2)}등급`, '평균등급']}
                labelFormatter={(label, payload) => `${label} (${payload?.[0]?.payload?.count}명)`}
              />
              <Bar dataKey="avgGrade" radius={[4, 4, 0, 0]}>
                {analysis.bandData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 무단결석 학생 */}
      {analysis.unapprovedStudents.length > 0 && (
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 text-rose-700">무단결석 학생 ({analysis.unapprovedStudents.length}명)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">학생</th>
                  <th className="text-center py-2 px-2">학년-반</th>
                  <th className="text-center py-2 px-2">무단결석</th>
                  <th className="text-center py-2 px-2">질병결석</th>
                  <th className="text-center py-2 px-2">총 결석</th>
                  <th className="text-center py-2 px-2">평균등급</th>
                </tr>
              </thead>
              <tbody>
                {analysis.unapprovedStudents.map(s => (
                  <tr key={s.id} className="border-b border-muted/30 hover:bg-white/30">
                    <td className="py-1.5 px-2 font-medium">{s.name}</td>
                    <td className="text-center py-1.5 px-2">{s.grade}-{s.classNum}</td>
                    <td className="text-center py-1.5 px-2 font-semibold text-rose-600">{s.absence.unapproved}일</td>
                    <td className="text-center py-1.5 px-2">{s.absence.disease}일</td>
                    <td className="text-center py-1.5 px-2 font-semibold">{s.absence.total}일</td>
                    <td className={`text-center py-1.5 px-2 font-semibold ${gradeColor(s.avgGrade)}`}>{s.avgGrade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 출결 종합 상세 (이슈 있는 학생 TOP 20) */}
      {analysis.detailStudents.length > 0 && (
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">출결 이슈 상세 (상위 {analysis.detailStudents.length}명)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">학생</th>
                  <th className="text-center py-2 px-2">학년-반</th>
                  <th className="text-center py-2 px-2 text-rose-600">결석</th>
                  <th className="text-center py-2 px-2 text-amber-600">지각</th>
                  <th className="text-center py-2 px-2 text-violet-600">조퇴</th>
                  <th className="text-center py-2 px-2 text-cyan-600">수업결손</th>
                  <th className="text-center py-2 px-2 font-semibold">합계</th>
                  <th className="text-center py-2 px-2">평균등급</th>
                </tr>
              </thead>
              <tbody>
                {analysis.detailStudents.map(s => (
                  <tr key={s.id} className="border-b border-muted/30 hover:bg-white/30">
                    <td className="py-1.5 px-2 font-medium">{s.name}</td>
                    <td className="text-center py-1.5 px-2">{s.grade}-{s.classNum}</td>
                    <td className="text-center py-1.5 px-2">
                      <span className={s.absence.total > 0 ? 'text-rose-600 font-semibold' : ''}>{s.absence.total}</span>
                      {s.absence.unapproved > 0 && (
                        <span className="ml-0.5 text-[9px] text-rose-500">(무단{s.absence.unapproved})</span>
                      )}
                    </td>
                    <td className="text-center py-1.5 px-2">
                      <span className={s.tardiness.total > 0 ? 'text-amber-600' : ''}>{s.tardiness.total}</span>
                    </td>
                    <td className="text-center py-1.5 px-2">
                      <span className={s.earlyLeave.total > 0 ? 'text-violet-600' : ''}>{s.earlyLeave.total}</span>
                    </td>
                    <td className="text-center py-1.5 px-2">
                      <span className={s.classSkip.total > 0 ? 'text-cyan-600' : ''}>{s.classSkip.total}</span>
                    </td>
                    <td className="text-center py-1.5 px-2 font-bold">{s.totalIssues}</td>
                    <td className={`text-center py-1.5 px-2 font-semibold ${gradeColor(s.avgGrade)}`}>{s.avgGrade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 위험 학생 목록 */}
      {analysis.riskStudents.length > 0 && (
        <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 text-rose-700">출결-성적 복합 위험 학생</h3>
          <p className="text-[10px] text-muted-foreground mb-2">결석 4일+ 또는 출결이슈 10건+, 평균 {analysis.riskGradeThreshold}등급+</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">학생</th>
                  <th className="text-center py-2 px-2">학년-반</th>
                  <th className="text-center py-2 px-2">결석</th>
                  <th className="text-center py-2 px-2">출결합계</th>
                  <th className="text-center py-2 px-2">평균등급</th>
                  <th className="text-center py-2 px-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {analysis.riskStudents.map(s => (
                  <tr key={s.id} className="border-b border-muted/30 hover:bg-white/30">
                    <td className="py-1.5 px-2 font-medium">{s.name}</td>
                    <td className="text-center py-1.5 px-2">{s.grade}-{s.classNum}</td>
                    <td className="text-center py-1.5 px-2 font-semibold text-rose-600">{s.absence.total}일</td>
                    <td className="text-center py-1.5 px-2 font-semibold">{s.totalIssues}건</td>
                    <td className={`text-center py-1.5 px-2 font-semibold ${gradeColor(s.avgGrade)}`}>{s.avgGrade}</td>
                    <td className="text-center py-1.5 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        s.absence.unapproved > 0 ? 'bg-rose-100 text-rose-700'
                          : s.absence.total >= 8 ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {s.absence.unapproved > 0 ? '무단결석' : s.absence.total >= 8 ? '위험' : '주의'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
