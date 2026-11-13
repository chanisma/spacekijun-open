import React from 'react';
import { cn } from '@/lib/utils';
import type { WizardStep } from '../../hooks/useExamScheduleStore';

interface Step {
  id: WizardStep;
  label: string;
}

const STEPS: Step[] = [
  { id: 'basic', label: '기초 정보' },
  { id: 'insights', label: '대상 분석' },
  { id: 'scope', label: '과목 범위' },
  { id: 'periods', label: '교시 설정' },
  { id: 'pinned', label: '고정/옵션' },
  { id: 'generate', label: '생성' },
  { id: 'compare', label: 'TOP 5 비교' },
  { id: 'edit', label: '최종 편집' },
];

export function WizardNav({
  current,
  onNavigate,
}: {
  current: WizardStep;
  onNavigate?: (s: WizardStep) => void;
}) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
      {STEPS.map((s, i) => {
        const reached = i <= currentIndex;
        const active = i === currentIndex;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!onNavigate || i > currentIndex}
              onClick={() => onNavigate?.(s.id)}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1 transition-colors',
                active && 'bg-amber-600 text-white shadow-sm',
                !active && reached && 'bg-amber-100 text-amber-800 hover:bg-amber-200',
                !reached && 'bg-muted text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                  active && 'bg-white text-amber-700',
                  !active && reached && 'bg-amber-600 text-white',
                  !reached && 'bg-muted-foreground/40 text-white',
                )}
              >
                {i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span className="hidden sm:inline-block h-px w-4 bg-muted-foreground/30" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
