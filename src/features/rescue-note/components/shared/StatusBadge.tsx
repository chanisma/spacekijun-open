import { STATUS_LABELS, type RescueStatus } from '../../constants';

interface Props {
  status: RescueStatus;
}

const STATUS_PILL_CLASSES: Record<RescueStatus, string> = {
  open: 'bg-red-50 text-red-700 border-red-200',
  monitoring: 'bg-amber-50 text-amber-700 border-amber-200',
  closed: 'bg-slate-50 text-slate-500 border-slate-200',
};

const STATUS_DOT_CLASSES: Record<RescueStatus, string> = {
  open: 'bg-red-500',
  monitoring: 'bg-amber-500',
  closed: 'bg-slate-400',
};

export function StatusBadge({ status }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-white/60 ${STATUS_PILL_CLASSES[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_CLASSES[status]}`} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
