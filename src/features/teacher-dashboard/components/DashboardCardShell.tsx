import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type Accent = 'blue' | 'green' | 'orange' | 'indigo' | 'violet';

const accentClasses: Record<Accent, { icon: string; badge: string }> = {
  blue: {
    icon: 'bg-sky-50 text-sky-700 ring-sky-100',
    badge: 'bg-sky-500',
  },
  green: {
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    badge: 'bg-emerald-500',
  },
  orange: {
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    badge: 'bg-amber-500',
  },
  indigo: {
    icon: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    badge: 'bg-indigo-500',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    badge: 'bg-violet-500',
  },
};

interface DashboardCardShellProps {
  title: string;
  icon: LucideIcon;
  accent?: Accent;
  description?: string;
  badge?: React.ReactNode;
  onAction?: () => void;
  actionLabel?: string;
  /** 헤더 오른쪽 액션 자리에 직접 넣는 요소(외부 링크 등 button으로 표현할 수 없는 동작용). */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function DashboardCardShell({
  title,
  icon: Icon,
  accent = 'indigo',
  description,
  badge,
  onAction,
  actionLabel = '자세히 보기',
  headerAction,
  children,
  className,
  contentClassName,
}: DashboardCardShellProps) {
  const colors = accentClasses[accent];

  return (
    <article className={cn('teacher-dashboard-surface flex h-full flex-col', className)}>
      <header className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn(
              'relative mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ring-1',
              colors.icon,
            )}>
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className={cn('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white', colors.badge)} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[17px] font-bold tracking-[-0.02em] text-slate-900 sm:text-lg">
                  {title}
                </h2>
                {badge}
              </div>
              {description && (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                  {description}
                </p>
              )}
            </div>
          </div>
          {(onAction || headerAction) && (
            <div className="flex flex-shrink-0 items-center gap-1">
              {headerAction}
              {onAction && (
                <button
                  type="button"
                  onClick={onAction}
                  className="group flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  aria-label={actionLabel}
                >
                  <span className="hidden sm:inline">전체</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <div className={cn('flex-1 px-5 pb-5 sm:px-6 sm:pb-6', contentClassName)}>{children}</div>
    </article>
  );
}

export function DashboardCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="불러오는 중">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse border-b border-slate-100 py-3 last:border-0">
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
