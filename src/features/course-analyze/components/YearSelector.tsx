/**
 * Year Selector Component - "신청 학년도" 선택
 *
 * 표시 의미: 사용자에게는 "신청을 진행한 학년도"를 보여준다 (학년 선택기와 같은 시점 기준 → 혼선 제거).
 * 내부 값(currentAcademicYear / availableAcademicYears)은 변환하지 않는다. 이들은 그대로
 * DB의 course_selection_round.academic_year(= 수강 연도)이며, RPC/분석 훅이 이 값을 그대로 소비한다.
 * 화면 라벨만 (값 − 1)로 변환한다.
 *
 * 전제(중요): round.academic_year = 신청연도 + 1 (가까운 수강 연도).
 *   - 현 1학년의 2·3학년 다년 신청은 group 레벨(group.academic_year=2027/2028)에 저장되고,
 *     round.academic_year는 항상 "가까운 수강연도"(= 신청연도 + 1)다. 따라서 (값 − 1) = 신청연도.
 *   - 만약 향후 "먼 수강연도"를 round.academic_year로 직접 저장하기 시작하면 이 라벨이 틀어진다.
 *     그때는 selection_year 컬럼을 신설해 근거로 삼아야 한다 (DB 마이그레이션).
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData } from '../context';
import { CalendarRange } from 'lucide-react';

export function YearSelector() {
  const {
    currentAcademicYear,
    availableAcademicYears,
    setCurrentAcademicYear,
    isLoading,
  } = useCourseAnalyzeData();

  // 방어적 정규화: null/string/중복이 섞여 들어와도 빈 뱃지나 중복 뱃지가 나오지 않도록.
  const years = React.useMemo(
    () => [...new Set(
      (availableAcademicYears ?? [])
        .map((y) => Number(y))
        .filter((n) => Number.isFinite(n))
    )].sort((a, b) => b - a),
    [availableAcademicYears]
  );

  // 내부 값(수강 연도) → 화면용 신청 학년도. 값 자체는 절대 바꾸지 않는다 (라벨 전용 변환).
  const toApplicationYear = (deliveryYear: number) => deliveryYear - 1;

  // 옵션이 비어있거나 1개뿐이면 단일 라벨 표시 (선택 의미 없음)
  if (years.length === 0) return null;

  if (years.length === 1) {
    const only = years[0];
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <CalendarRange size={12} className="text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">신청 학년도</span>
        </div>
        <div className="px-3 py-2 text-xs font-bold rounded-lg bg-white/60 border border-white/40 text-slate-600 text-center">
          {toApplicationYear(only)}학년도
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <CalendarRange size={12} className="text-slate-400" />
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">학년도</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {years.map((year) => {
          const isActive = currentAcademicYear === year;
          return (
            <button
              key={year}
              onClick={() => setCurrentAcademicYear(year)}
              disabled={isLoading || isActive}
              title={`${toApplicationYear(year)}학년도에 신청한 과목 선택`}
              className={cn(
                'px-3 py-2 text-xs font-bold rounded-lg transition-all duration-200 disabled:cursor-not-allowed',
                isActive
                  ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm scale-[1.02]'
                  : 'bg-white/60 hover:bg-white/80 text-slate-600 hover:text-slate-800 border border-white/40 hover:border-brand-100/50 hover:shadow-sm disabled:opacity-50'
              )}
            >
              {toApplicationYear(year)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
