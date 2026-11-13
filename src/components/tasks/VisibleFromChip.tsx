// 할 일이 아직 담당자에게 안 보일 때 매니저 화면에 다는 칩 — 「10/20부터 보임」 (2026-10-05)
// 판정은 src/lib/taskVisibility.ts 하나. 날짜가 지나면 칩은 저절로 사라진다(담당자에게 이미 보이므로).
import { EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isHiddenFromAssignees, visibleFromLabel } from '@/lib/taskVisibility';
import type { Task } from '@/types/tasks';

export function VisibleFromChip({ task, className }: { task: Pick<Task, 'meta'>; className?: string }) {
  if (!isHiddenFromAssignees(task)) return null;
  const label = visibleFromLabel(task);
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200',
        className,
      )}
      title="이 날까지는 담당자의 내 할 일·홈에 나타나지 않습니다. 그날 저절로 나타납니다."
    >
      <EyeOff className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
