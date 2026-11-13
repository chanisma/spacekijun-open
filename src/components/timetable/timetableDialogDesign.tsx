import type { ComponentType } from 'react';

export { SectionLabel } from '@/components/tasks/dialogDesign';

export const DIALOG_HEADER_CLASS = 'shrink-0 space-y-0 border-b border-slate-100 bg-white px-5 py-5 pr-12 sm:px-7 sm:py-6 sm:pr-14';
export const DIALOG_FOOTER_CLASS = 'shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-7';
export const FOOTER_BUTTON_CLASS = 'h-9 gap-1.5 rounded-xl px-3 text-xs sm:text-sm';
export const FOOTER_NEUTRAL_CLASS = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';
export const FOOTER_DESTRUCTIVE_CLASS = 'text-rose-600 hover:bg-rose-50 hover:text-rose-700';

export function TitleIconChip({ icon: Icon }: {
  icon: ComponentType<{ className?: string }>;
  tone?: 'blue' | 'emerald' | 'indigo';
}) {
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
    <Icon className="h-5 w-5" />
  </span>;
}
