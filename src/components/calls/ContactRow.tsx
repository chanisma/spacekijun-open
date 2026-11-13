import { Phone, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toTelHref } from '@/lib/callsDirectory';
import { ExtensionEntry } from '@/types/calls';

interface ContactRowProps {
  /** 장소·부서 항목 전용. 담당자(duty 보유)는 `StaffGrid`가 카드로 렌더링한다 */
  entry: ExtensionEntry;
}

export const ContactRow = ({ entry }: ContactRowProps) => {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50">
      {/* 이름 / 업무 / 안내 — 좁은 카드에서도 잘리지 않도록 줄바꿈을 허용한다 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          {entry.isFax && <Printer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span
            className={cn(
              'text-sm leading-snug',
              entry.isLead ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'
            )}
          >
            {entry.name}
          </span>
        </div>
        {entry.note && (
          <p className="mt-0.5 text-xs leading-snug text-amber-600">{entry.note}</p>
        )}
      </div>

      {/* 번호 */}
      <div className="flex shrink-0 items-center gap-1.5">
        {entry.extension && (
          <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-700">
            {entry.extension}
          </span>
        )}

        {entry.phone && (
          <a
            href={toTelHref(entry.phone)}
            title={`${entry.phone} 전화 걸기`}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-1.5 py-1 font-mono text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
              entry.isFax
                ? 'text-slate-500 hover:bg-slate-100'
                : 'text-emerald-700 hover:bg-emerald-50'
            )}
          >
            {!entry.isFax && <Phone className="h-3.5 w-3.5 shrink-0" />}
            {entry.phone}
          </a>
        )}

        {!entry.extension && !entry.phone && (
          <span className="px-2 text-sm text-slate-300">—</span>
        )}
      </div>
    </div>
  );
};
