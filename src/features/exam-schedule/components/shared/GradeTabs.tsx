import React from 'react';
import { cn } from '@/lib/utils';
import type { Grade } from '../../types';

export const GRADE_ACCENTS: Record<Grade, { active: string; idle: string; chip: string }> = {
  1: {
    active: 'bg-sky-600 text-white shadow-sm',
    idle: 'bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200',
    chip: 'bg-sky-100 text-sky-700',
  },
  2: {
    active: 'bg-violet-600 text-white shadow-sm',
    idle: 'bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200',
    chip: 'bg-violet-100 text-violet-700',
  },
  3: {
    active: 'bg-amber-600 text-white shadow-sm',
    idle: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200',
    chip: 'bg-amber-100 text-amber-700',
  },
};

/**
 * 위저드 전반에서 공용으로 쓰는 학년 탭. 학년별 고유 색상을 유지해
 * "지금 어느 학년을 편집 중인지"를 시각적으로 고정시킨다.
 */
export function GradeTabs({
  grades,
  active,
  onSelect,
  badge,
}: {
  grades: Grade[];
  active: Grade;
  onSelect: (g: Grade) => void;
  /** 탭 우측에 표시할 보조 정보 (예: 선택 과목 수) */
  badge?: (g: Grade) => React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {grades.map((g) => {
        const isActive = g === active;
        const accent = GRADE_ACCENTS[g];
        return (
          <button
            key={g}
            type="button"
            onClick={() => onSelect(g)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              isActive ? cn(accent.active, 'border-transparent') : accent.idle,
            )}
          >
            {g}학년
            {badge && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  isActive ? 'bg-white/25 text-white' : accent.chip,
                )}
              >
                {badge(g)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
