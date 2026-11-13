// 동아리 화면의 카드·카드 제목 (2026-11-12) — 업무노트(「한 장 보기」·「오늘」)와 같은 톤:
// 제목 = 14px 진한 회색(넓은 페이지 카드용). 공용 SectionLabel(11px 대문자)은 모달처럼 좁은 곳용이라 모달에서는 그대로 쓴다.
import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white p-4 sm:p-5', className)}>{children}</div>;
}

export function PanelTitle({ icon: Icon, children, trailing }: {
  icon?: ComponentType<{ className?: string }>; children: ReactNode; trailing?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2">
      <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-800">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
        <span className="min-w-0 truncate">{children}</span>
      </h3>
      {trailing}
    </div>
  );
}

/** 라벨 위 · 큰 숫자 아래 (업무노트 «지금 할 것» 타일) */
export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'amber' | 'rose' }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-slate-500">{label}</p>
      <p className={cn('mt-0.5 text-2xl font-bold tabular-nums', tone === 'amber' ? 'text-amber-700' : tone === 'rose' ? 'text-rose-600' : 'text-slate-900')}>{value}</p>
      {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
