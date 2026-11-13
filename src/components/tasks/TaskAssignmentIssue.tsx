import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { UserRoundX } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useInvalidateAfterSubmissionChange } from '@/hooks/useTaskSubmissions';
import type { Task } from '@/types/tasks';

export function TaskAssignmentIssueBadge({ task }: { task: Task }) {
  const count = Object.keys(task.meta.assignmentIssues ?? {}).filter((id) =>
    task.meta.assignees?.some((a) => a.id === id)
  ).length;
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700">
      <UserRoundX className="h-3.5 w-3.5" />
      담당자 확인 {count}건
    </span>
  );
}

export function TaskAssignmentIssueSummary({ task }: { task: Task }) {
  return (
    <>
      {Object.entries(task.meta.assignmentIssues ?? {})
        .filter(([id]) => task.meta.assignees?.some((a) => a.id === id))
        .map(([id, issue]) => (
          <div key={id} className="rounded-xl border border-amber-200 px-3 py-3 text-sm">
            <p className="font-medium text-amber-700">
              {task.meta.assignees?.find((a) => a.id === id)?.name ?? '담당자'} · 담당자 아님 표시
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{issue.reason}</p>
            <p className="mt-1 text-xs text-slate-400">
              {new Date(issue.reportedAt).toLocaleString('ko-KR')} · 할 일 수정에서 담당자를 조정할
              수 있습니다.
            </p>
          </div>
        ))}
    </>
  );
}

export function TaskAssignmentIssue({ task, resourceId }: { task: Task; resourceId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const issue = task.meta.assignmentIssues?.[resourceId];
  const invalidate = useInvalidateAfterSubmissionChange(task.id);
  const mutation = useMutation({
    mutationFn: async (next: string | null) => {
      const { error } = await supabase.rpc('report_task_assignment_issue', {
        p_task_id: task.id,
        p_reason: next,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_, next) => {
      await invalidate();
      setOpen(false);
      toast.success(
        next === null
          ? '담당자 아님 표시를 취소했습니다.'
          : '담당자 아님으로 표시했습니다. 책임자가 사유를 확인할 수 있습니다.'
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-xs text-slate-500"
        onClick={(e) => {
          e.stopPropagation();
          setReason(issue?.reason ?? '');
          setOpen(true);
        }}
      >
        <UserRoundX className="h-3.5 w-3.5" />
        {issue ? '담당자 아님 표시됨' : '제 담당 할 일이 아닙니다'}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!mutation.isPending) setOpen(next);
        }}
      >
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>담당자 아님 표시</DialogTitle>
            <DialogDescription>{task.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-6 py-5">
            <p className="text-sm leading-relaxed text-slate-500">
              잘못 배정된 할 일이라면 사유를 남겨 주세요. 책임자가 확인하고 담당자를 조정할 수
              있습니다. 배정과 완료 상태는 유지됩니다.
            </p>
            <Textarea
              aria-label="담당자가 아닌 사유"
              placeholder="예: 올해 이 할 일을 담당하지 않습니다."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              disabled={mutation.isPending}
            />
          </div>
          <DialogFooter className="border-t px-6 py-4">
            {issue && (
              <Button
                type="button"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(null)}
              >
                표시 취소
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              닫기
            </Button>
            <Button
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={mutation.isPending || !reason.trim()}
              onClick={() => mutation.mutate(reason.trim())}
            >
              {mutation.isPending ? '저장 중…' : '담당자 아님 표시'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
