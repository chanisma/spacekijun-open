import type { ReactNode } from 'react';
import { CalendarDays, Check } from 'lucide-react';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import './schedule-compose.css';

export const scheduleComposeDialogClass = 'schedule-compose-dialog flex max-h-[92dvh] w-[calc(100%-1.5rem)] flex-col gap-0 border-slate-200/80 bg-white p-0 shadow-2xl sm:max-w-2xl sm:rounded-3xl';

export function ScheduleComposeHeader({ title, description, label }: { title: string; description: string; label: string }) {
  return (
    <DialogHeader className="shrink-0 space-y-0 border-b border-slate-100 px-5 py-5 text-left sm:px-7 sm:py-6">
      <div className="flex items-center gap-3.5 pr-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">{title}</DialogTitle>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{label}</span>
          </div>
          <DialogDescription className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">{description}</DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );
}

const tones = {
  green: 'text-emerald-600', purple: 'text-violet-600', orange: 'text-orange-600',
  pink: 'text-pink-600', teal: 'text-teal-600', indigo: 'text-indigo-600', amber: 'text-amber-600',
};

export function ScheduleTypeOption({ label, icon, tone, selected, disabled, title, onClick }: {
  label: string; icon: ReactNode; tone: keyof typeof tones; selected: boolean;
  disabled?: boolean; title?: string; onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={selected} disabled={disabled} title={title} onClick={onClick}
      className={cn('relative flex min-h-20 min-w-0 flex-col items-center justify-center gap-2 rounded-xl border px-1.5 py-3 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40',
        selected ? 'border-slate-900 bg-slate-50 text-slate-900' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50')}>
      <span className={cn('[&>svg]:h-[18px] [&>svg]:w-[18px]', tones[tone])} aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {selected && <Check className="absolute right-1.5 top-1.5 h-3 w-3 text-slate-900" aria-hidden="true" />}
    </button>
  );
}
