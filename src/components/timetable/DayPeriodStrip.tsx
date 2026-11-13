/**
 * 하루(1~7교시)를 사각형 7개로 보여주는 인포그래픽.
 *
 * 교체·대체가 **그날 하루를 어떻게 바꾸는지**를 숫자 대신 모양으로 읽게 한다.
 * "3연강이 생깁니다" 같은 문장보다 칸이 붙어 있는 그림이 빠르다.
 *
 * 설계 주의: 교체는 두 사람 × 두 요일을 건드리는데 `월 2교시 ↔ 월 5교시` 처럼
 * **같은 요일 안에서** 맞바꾸는 경우가 흔하다. 그래서 스트립 하나가 추가(+)와 제거(−)를
 * 동시에 받을 수 있어야 한다 — 호출부가 두 요일이 같은지 따져서 넘긴다.
 */

import React from 'react';
import { cn } from '@/lib/utils';

/** 시간표 격자와 동일한 교시 수 (TimetableGrid) */
export const STRIP_PERIODS = 7;

export interface DayPeriodStripSlot {
  weekday: number;
  period: number;
}

interface DayPeriodStripProps {
  /** 예: "월요일" */
  title: string;
  /** 예: "김지은 선생님" */
  subtitle?: string;
  /** 이 사람의 주간 슬롯 전체 (요일로 걸러 쓴다) */
  slots: DayPeriodStripSlot[];
  weekday: number;
  /** 이 날 새로 맡는 교시 */
  added?: number;
  /** 이 날 빠지는 교시 — 결강(출장·개인일정)은 여러 교시가 한꺼번에 빠진다 */
  removed?: number | number[];
}

type CellKind = 'empty' | 'busy' | 'added' | 'removed';

const CELL_CLASS: Record<CellKind, string> = {
  empty: 'border border-dashed border-slate-200 bg-slate-50 text-slate-300',
  busy: 'border border-slate-200 bg-slate-100 text-slate-500',
  added: 'border border-emerald-500 bg-emerald-500 text-white shadow-sm',
  removed: 'border border-dashed border-slate-300 bg-white text-slate-300 line-through',
};

const CELL_TITLE: Record<CellKind, string> = {
  empty: '공강',
  busy: '기존 수업',
  added: '새로 맡는 수업',
  removed: '빠지는 수업',
};

export function DayPeriodStrip({
  title,
  subtitle,
  slots,
  weekday,
  added,
  removed,
}: DayPeriodStripProps) {
  const occupied = new Set(
    slots.filter((slot) => slot.weekday === weekday).map((slot) => slot.period)
  );

  const removedSet = new Set(Array.isArray(removed) ? removed : removed != null ? [removed] : []);

  const kindOf = (period: number): CellKind => {
    if (added === period) return 'added';
    if (removedSet.has(period)) return 'removed';
    return occupied.has(period) ? 'busy' : 'empty';
  };

  // 교체 후 그날 수업 수 — 칸을 세지 않고도 부담 변화를 읽게 한다
  const afterCount = Array.from({ length: STRIP_PERIODS }, (_, i) => i + 1).filter((period) => {
    const kind = kindOf(period);
    return kind === 'busy' || kind === 'added';
  }).length;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-medium text-slate-600">
          {title}
          {subtitle && <span className="ml-1 font-normal text-slate-400">{subtitle}</span>}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{afterCount}교시</span>
      </div>
      <div className="flex gap-1" role="img" aria-label={`${title} ${subtitle ?? ''} 교체 후 ${afterCount}교시`}>
        {Array.from({ length: STRIP_PERIODS }, (_, i) => i + 1).map((period) => {
          const kind = kindOf(period);
          return (
            <span
              key={period}
              title={`${period}교시 · ${CELL_TITLE[kind]}`}
              className={cn(
                'flex h-6 flex-1 items-center justify-center rounded text-[10px] font-medium tabular-nums transition-colors',
                CELL_CLASS[kind]
              )}
            >
              {period}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** 스트립 묶음 위에 한 번만 놓는 범례 */
export function DayPeriodStripLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
      <LegendItem kind="added">새로 맡음</LegendItem>
      <LegendItem kind="removed">빠짐</LegendItem>
      <LegendItem kind="busy">기존 수업</LegendItem>
      <LegendItem kind="empty">공강</LegendItem>
    </div>
  );
}

function LegendItem({ kind, children }: { kind: CellKind; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('h-2.5 w-2.5 rounded-[3px]', CELL_CLASS[kind])} />
      {children}
    </span>
  );
}
