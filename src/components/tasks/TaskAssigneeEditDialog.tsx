/**
 * 담당자 바꾸기 — 내 업무 관리 표의 담당자 칸에서 연다 (2026-10-01 사용자 요청: 마감일처럼 담당자도).
 *
 * 마감일 칸은 고르는 즉시 저장하지만 담당자는 그러면 안 된다 — 이름 하나 고를 때마다 저장되면
 * 다섯 명을 넣는 동안 할 일이 다섯 번 바뀌고, 잘못 누른 제외가 곧바로 완료 기록을 지운다.
 * 그래서 고르는 것은 자유롭게, **저장은 한 번**이다. 무엇이 바뀌는지(추가·제외·사라지는 완료)를
 * 저장 버튼 위에 먼저 보여 준다.
 *
 * 규칙(상태 보존·회차/단위 파생·뺄 수 없는 단위 담당자)은 전부 `planAssigneeEdit` 에 있다 —
 * 여기서는 미리 보기와 쓰기 호출만 한다.
 *
 * ⚠️ `DialogContent` 에 overflow 를 주지 말 것 — 사람 선택 드롭다운이 이 안으로 포털되므로
 *    모달 경계에서 잘린다(CLAUDE.md Gotchas).
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, UserMinus, UserPlus, Users } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { useResources } from '@/hooks/useTasks';
import { useUpdateTaskAssigneesJsonb } from '@/hooks/useTasksJsonb';
import { planAssigneeEdit } from '@/lib/taskAssigneeEdit';
import { getTaskUnits } from '@/lib/taskUnits';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/tasks';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip,
} from './dialogDesign';

interface TaskAssigneeEditDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function assigneeIdsOf(task: Task | null): string[] {
  return (task?.meta?.assignees ?? []).map((a) => a.id);
}

export function TaskAssigneeEditDialog({ task, open, onOpenChange }: TaskAssigneeEditDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const { data: resources } = useResources();
  const mutation = useUpdateTaskAssigneesJsonb();

  // 열 때마다 지금 담당자로 시작한다(닫았다 다시 열면 고르던 것을 버린다)
  useEffect(() => {
    if (open) setSelected(assigneeIdsOf(task));
  }, [open, task]);

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of resources ?? []) map[r.id] = r.name;
    return map;
  }, [resources]);

  const plan = useMemo(
    () => (task ? planAssigneeEdit(task, selected, (id) => names[id]) : null),
    [task, selected, names],
  );

  if (!task || !plan) return null;

  const hasUnits = getTaskUnits(task).length > 0;
  const removedCompleted = plan.removed.filter((p) => p.status === 'completed');
  const blocked = plan.blockedUnitHolders.length > 0;
  const saving = mutation.isPending;

  const save = async () => {
    try {
      await mutation.mutateAsync({ taskId: task.id, nextIds: selected, names });
      onOpenChange(false);
    } catch (error) {
      // 실패하면 모달을 남긴다 — 고른 명단을 잃지 않고 다시 시도할 수 있게
      toast.error(error instanceof Error ? error.message : '담당자를 바꾸지 못했습니다.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIconChip icon={Users} />
            담당자 바꾸기
          </DialogTitle>
          <DialogDescription className="truncate text-left" title={task.title}>
            {task.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4 py-4 sm:px-6">
          <SearchableMultiSelect
            filterByTeacher
            includeTagOptions
            selectedValues={selected}
            onSelectionChange={setSelected}
            placeholder="담당자를 검색하거나 선택하세요"
            pickerTitle="담당자 선택"
            searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
            emptyText="검색된 담당자가 없습니다"
            maxSelectedDisplay={3}
            disabled={saving}
          />

          {hasUnits && (
            <p className="text-[11px] leading-relaxed text-slate-500">
              과제 단위 할 일입니다 — 단위를 맡은 사람은 편집 창에서 단위를 먼저 정리해야 뺄 수 있습니다.
            </p>
          )}

          {plan.changed && (
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
              {plan.added.length > 0 && (
                <p className="flex items-start gap-1.5 text-emerald-700">
                  <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">
                    추가 {plan.added.length}명 · {plan.added.map((p) => p.name).join(', ')}
                  </span>
                </p>
              )}
              {plan.removed.length > 0 && (
                <p className="flex items-start gap-1.5 text-rose-700">
                  <UserMinus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">
                    제외 {plan.removed.length}명 · {plan.removed.map((p) => p.name).join(', ')}
                  </span>
                </p>
              )}
              {removedCompleted.length > 0 && (
                <p className="flex items-start gap-1.5 text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 break-words">
                    {removedCompleted.map((p) => p.name).join(', ')} 님은 이미 완료했습니다 — 빼면 그 완료 기록도 사라집니다.
                  </span>
                </p>
              )}
            </div>
          )}

          {blocked && (
            <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">
                {plan.blockedUnitHolders.map((p) => p.name).join(', ')} 님은 과제 단위를 맡고 있어 여기서 뺄 수 없습니다.
              </span>
            </p>
          )}
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 text-white hover:bg-blue-700')}
            disabled={!plan.changed || blocked || saving}
            onClick={() => void save()}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
