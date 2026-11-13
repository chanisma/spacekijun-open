import { Eye, Users, Lock } from 'lucide-react';
import { RESCUE_VISIBILITY, VISIBILITY_LABELS, type RescueVisibility } from '../../constants';

const ICON_MAP = {
  [RESCUE_VISIBILITY.TEAM]: Users,
  [RESCUE_VISIBILITY.COUNSELOR_AUTHOR]: Eye,
  [RESCUE_VISIBILITY.AUTHOR_ONLY]: Lock,
};

interface Props {
  visibility: RescueVisibility;
}

export function VisibilityBadge({ visibility }: Props) {
  const Icon = ICON_MAP[visibility];
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border border-slate-200 bg-slate-50 text-slate-500">
      <Icon className="w-2.5 h-2.5" aria-hidden />
      <span>공개: {VISIBILITY_LABELS[visibility]}</span>
    </span>
  );
}
