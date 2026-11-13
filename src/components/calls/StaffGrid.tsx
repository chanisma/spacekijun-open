import { ExtensionEntry } from '@/types/calls';

interface StaffCardProps {
  entry: ExtensionEntry;
}

/**
 * 담당자 카드. 이름·업무를 훑기 좋게 행 목록 대신 카드로 배치한다
 * (담당자는 내선번호만 있어 번호 열이 짧다).
 */
const StaffCard = ({ entry }: StaffCardProps) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 transition-colors hover:border-violet-200 hover:bg-violet-50/40">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold leading-snug text-slate-900">{entry.name}</span>
        {entry.isLead && (
          <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
            부장
          </span>
        )}
      </div>
      {entry.duty && <p className="mt-0.5 text-xs leading-snug text-slate-500">{entry.duty}</p>}
    </div>

    <span className="shrink-0 font-mono text-base font-bold tracking-tight text-slate-700">
      {entry.extension}
    </span>
  </div>
);

interface StaffGridProps {
  entries: ExtensionEntry[];
}

export const StaffGrid = ({ entries }: StaffGridProps) => (
  <div className="grid grid-cols-1 gap-2 p-1.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
    {entries.map((entry) => (
      <StaffCard key={entry.id} entry={entry} />
    ))}
  </div>
);
