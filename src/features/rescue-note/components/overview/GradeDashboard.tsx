import { useMemo } from 'react';
import { useGradeRoster } from '../../hooks/useRescueRoster';
import { useTagDefinitions } from '../../hooks/useTagDefinitions';
import { StudentRoster } from './StudentRoster';
import type { CrisisDashboardRow, RescueRosterRow } from '../../services/rescueRoster';

interface Props {
  grade: number;
  /** 해당 학년에 존재하는 반 번호 목록 */
  classNums: number[];
}

export function GradeDashboard({ grade, classNums }: Props) {
  const rosterQ = useGradeRoster(grade, classNums);
  const defsQ = useTagDefinitions();

  const rows = useMemo<RescueRosterRow[]>(() => rosterQ.data ?? [], [rosterQ.data]);

  // 위기 = 현재 상태가 주의(open) 또는 관찰(monitoring)
  const openCount = rows.filter((r) => r.status === 'open').length;
  const monitoringCount = rows.filter((r) => r.status === 'monitoring').length;
  const crisisCount = openCount + monitoringCount;
  const total = rows.length;

  // 반별 위기 인원 (상태 기준)
  const perClass = useMemo(() => {
    const map = new Map<number, { total: number; crisis: number }>();
    classNums.forEach((c) => map.set(c, { total: 0, crisis: 0 }));
    rows.forEach((r) => {
      const e = map.get(r.classNum) ?? { total: 0, crisis: 0 };
      e.total += 1;
      if (r.status === 'open' || r.status === 'monitoring') e.crisis += 1;
      map.set(r.classNum, e);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([classNum, v]) => ({ classNum, ...v }));
  }, [rows, classNums]);
  const maxClassCrisis = Math.max(1, ...perClass.map((c) => c.crisis));

  // 태그별 분포 (학년 전체)
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => r.tagKeys.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1)));
    return counts;
  }, [rows]);

  // 위기 학생 목록 (StudentRoster 재사용 — CrisisDashboardRow 형태로 매핑)
  const crisisRows = useMemo<CrisisDashboardRow[]>(
    () =>
      rows
        .filter((r) => r.status === 'open' || r.status === 'monitoring')
        .map((r) => ({ ...r, homeroomName: null }))
        .sort((a, b) => {
          if (a.status === 'open' && b.status !== 'open') return -1;
          if (b.status === 'open' && a.status !== 'open') return 1;
          return a.classNum - b.classNum || a.numberInClass - b.numberInClass;
        }),
    [rows]
  );

  if (rosterQ.isLoading || defsQ.isLoading) {
    return <div className="p-6 text-slate-400 text-sm">불러오는 중...</div>;
  }
  if (rosterQ.isError) {
    return <div className="p-6 text-red-600 text-sm">학년 데이터를 불러올 수 없습니다.</div>;
  }

  const card = (label: string, value: number, accent?: string) => (
    <div className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-4 hover:shadow-md transition-all">
      <div className="text-xs font-medium text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold text-slate-800 ${accent ?? ''}`}>{value}</div>
    </div>
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
          {grade}학년 대시보드
        </h2>
        <span className="text-xs text-slate-400">{classNums.length}개 반 · 총 {total}명</span>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {card('총원', total)}
        {card('위기', crisisCount, crisisCount > 0 ? 'text-red-500' : '')}
        {card('주의', openCount, openCount > 0 ? 'text-red-500' : '')}
        {card('관찰', monitoringCount, monitoringCount > 0 ? 'text-amber-500' : '')}
      </div>

      {/* 반별 위기 인원 비교 */}
      <div className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-bold text-slate-700 mb-3">반별 위기 인원</h3>
        <div className="space-y-2">
          {perClass.map((c) => (
            <div key={c.classNum} className="flex items-center gap-3">
              <span className="text-xs font-mono font-medium text-slate-600 w-10 shrink-0">{c.classNum}반</span>
              <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all"
                  style={{ width: `${(c.crisis / maxClassCrisis) * 100}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 w-16 shrink-0 text-right">
                <span className="font-semibold text-slate-700">{c.crisis}</span>
                <span className="text-slate-400"> / {c.total}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 태그별 분포 */}
      <div className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-bold text-slate-700 mb-3">태그별 분포</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(defsQ.data ?? []).map((d) => {
            const count = tagCounts.get(d.key) ?? 0;
            return (
              <span
                key={d.key}
                className="inline-flex items-center gap-1.5 text-xs text-slate-700"
                title={d.description ?? d.label}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${d.color}`} aria-hidden />
                <span>{d.label}</span>
                <span className={count > 0 ? 'font-bold text-slate-800' : 'text-slate-300'}>
                  {count}명
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* 위기 학생 목록 */}
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-2">위기 학생 ({crisisRows.length}명)</h3>
        <StudentRoster rows={crisisRows} />
      </div>
    </div>
  );
}
