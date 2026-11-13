/**
 * TargetGradeFilter — "전체 / N학년 과목" 토글
 *
 * 1학년 신청처럼 한 라운드에 2학년·3학년 과목이 섞여 있을 때, 분석 탭에서
 * 과목 학년을 분리해 보기 위한 공용 토글 UI. 상태/판정 로직은
 * useTargetGradeFilter 훅이 담당하고, 이 컴포넌트는 표현만 책임진다.
 * (SubjectCountTab의 기존 토글과 동일한 스타일을 사용해 시각적 일관성 유지)
 */

import React from 'react';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TargetGradeFilterProps {
  targetGrades: number[];
  selected: number | null;
  onChange: (grade: number | null) => void;
  className?: string;
  /** 토글 앞 라벨 (기본: "과목 학년") */
  label?: string;
}

export function TargetGradeFilter({
  targetGrades,
  selected,
  onChange,
  className,
  label = '과목 학년',
}: TargetGradeFilterProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
        <Layers size={12} className="text-slate-400" />
        {label}
      </span>
      <div className="inline-flex rounded-lg border border-slate-200/60 bg-white/60 p-0.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
            selected === null
              ? 'bg-slate-700 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
          )}
        >
          전체
        </button>
        {targetGrades.map((grade) => (
          <button
            key={grade}
            type="button"
            onClick={() => onChange(grade)}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
              selected === grade
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
            )}
          >
            {grade}학년 과목
          </button>
        ))}
      </div>
    </div>
  );
}
