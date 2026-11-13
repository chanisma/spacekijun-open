// ========================================
// Task Work Detail Dialog Component
// 업무 상세 정보 및 연결된 업무 관리
// 디자인 = TaskDetailDialog 규약(dialogDesign.tsx): 헤더/본문/푸터 3단 +
// 마이크로 라벨 섹션 + 동작 버튼은 전부 푸터 ghost.
// ========================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Work, Task } from '@/types/tasks';
import { useWorkDetailJsonb, useDeleteTaskJsonb, useDeleteWorkJsonb, useUpdateWorkJsonb } from '@/hooks/useTasksJsonb';
import { useCanDeleteTask, useCanDeleteWork, useCanEditWork, useCanEditTask } from '@/hooks/usePermissions';
import { useWorkFiles, useDeleteWorkFile } from '@/hooks/useTaskFiles';
import { EnhancedFileList } from '@/components/ui/file-list';
import { TaskDetailDialog } from './TaskDetailDialog';
import { TaskEditDialog } from './TaskEditDialog';
import { WorkPipelineDialog } from './pipeline/WorkPipelineDialog';
import { WorkKnowledgeSection } from './WorkKnowledgeSection';
import { useToast } from '@/hooks/use-toast';
import { getTaskDeadlineInfo } from '@/lib/taskDeadlines';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_DESTRUCTIVE_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
} from './dialogDesign';
import { cn } from '@/lib/utils';
import { workCompleteConfirmMessage } from '@/lib/taskStatus';
import {
  AlignLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Edit,
  Loader2,
  File,
  ListChecks,
  MoreHorizontal,
  Plus,
  Tag,
  Trash2,
  User,
  X,
  History,
  Route,
  Undo2,
} from 'lucide-react';

interface WorkDetailDialogProps {
  work: Work | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (work: Work) => void;
  onDelete?: (workId: string) => void;
}

export function WorkDetailDialog({
  work,
  open,
  onOpenChange,
  onEdit,
  onDelete
}: WorkDetailDialogProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  /** 업무 진행 모달 — 이 상세 위에 겹쳐 뜬다 */
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const { data: workDetail, isLoading, refetch } = useWorkDetailJsonb(
    work?.id || '',
    { enabled: !!work?.id && open }
  );

  const { data: workFiles = [], refetch: refetchFiles } = useWorkFiles(work?.id || '');
  const deleteWorkFileMutation = useDeleteWorkFile();

  const deleteTaskMutation = useDeleteTaskJsonb();
  const deleteWorkMutation = useDeleteWorkJsonb();
  const updateWorkMutation = useUpdateWorkJsonb();
  const { toast } = useToast();

  // Check if user can edit/delete work - only when work exists
  const { data: canEditWork } = useCanEditWork(
    work ? { id: work.id } : { id: '' },
    { enabled: !!work?.id }
  );
  const { data: canDeleteWork } = useCanDeleteWork(
    work ? { id: work.id } : { id: '' },
    { enabled: !!work?.id }
  );

  if (!work) return null;

  // 최신 데이터 우선 사용
  const currentWork = workDetail || work;

  // 업무 상태 네 가지를 모두 담는다 — 'pending'(대기)이 빠져 있어 영문 `pending` 이 칩에 그대로 보였다(2026-10-05)
  const statusChip = {
    // 옛 대기 업무는 진행 중으로 보인다(대기 은퇴, 2026-10-05). 키를 지우면 영문 `pending` 이 칩에 그대로 보인다
    pending: { label: '진행 중', className: 'border-blue-200 bg-blue-50 text-blue-700' },
    active: { label: '진행 중', className: 'border-blue-200 bg-blue-50 text-blue-700' },
    completed: { label: '완료', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    cancelled: { label: '취소', className: 'border-rose-200 bg-rose-50 text-rose-600' },
  }[currentWork.status] ?? { label: currentWork.status, className: 'border-slate-200 bg-slate-50 text-slate-600' };

  const managers: Array<{ id?: string; name: string }> =
    Array.isArray(currentWork.meta?.managers) && currentWork.meta.managers.length > 0
      ? currentWork.meta.managers
      : currentWork.manager_name
        ? [{ name: currentWork.manager_name }]
        : [];

  const tasks: Task[] = workDetail?.tasks ?? [];
  const completedTasks = tasks.filter(task => {
    if (task.meta?.assignees && task.meta.assignees.length > 0) {
      return task.meta.assignees.every(a => a.status === 'completed');
    }
    return task.status === 'completed';
  }).length;
  const taskProgressPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setTaskDetailOpen(true);
  };

  const handleTaskEdit = (task: Task) => {
    setEditingTask(task);
    setTaskEditOpen(true);
  };

  const handleTaskSuccess = () => {
    refetch();
    setTaskEditOpen(false);
    setEditingTask(null);
  };

  const handleAddTask = () => {
    setEditingTask(null);
    setTaskEditOpen(true);
  };

  const handleDeleteTask = async (taskId: string, taskTitle: string) => {
    if (window.confirm(`"${taskTitle}" 할 일을 삭제하시겠습니까?`)) {
      try {
        await deleteTaskMutation.mutateAsync(taskId);
        refetch();
        toast({
          title: "할 일 삭제 완료",
          description: `"${taskTitle}" 할 일이 삭제되었습니다.`,
        });
      } catch (error) {
        console.error('Task deletion failed:', error);
        toast({
          title: "삭제 실패",
          description: error instanceof Error ? error.message : '할 일 삭제 중 오류가 발생했습니다.',
          variant: "destructive",
        });
      }
    }
  };

  /**
   * 업무 **전체** 상태 토글 — 편집 권한(`canEditWork`)이 있을 때만. 할 일 상세의 상태 칩과
   * 같은 규칙: 완료 ↔ 진행중(취소 상태에서 누르면 완료). 할 일·담당자 상태는 건드리지 않는다.
   * `useUpdateWorkJsonb` 는 넘긴 필드만 쓴다(undefined 는 요청 본문에서 빠진다).
   */
  const handleToggleWorkStatus = async () => {
    // 진행 중 ↔ 완료(옛 대기 업무는 진행 중과 같다 — 대기 은퇴, 2026-10-05)
    const next = currentWork.status === 'completed' ? 'active' : 'completed';
    if (next === 'completed') {
      const message = workCompleteConfirmMessage(currentWork.name, tasks);
      if (message && !window.confirm(message)) return;
    }
    try {
      await updateWorkMutation.mutateAsync({ id: currentWork.id, data: { status: next } });
      // 목록(works-jsonb)은 훅이 무효화한다 — 이 창은 상세 쿼리를 따로 읽으므로 직접 다시 받는다
      await refetch();
    } catch (error) {
      toast({
        title: '상태 변경 실패',
        description: error instanceof Error ? error.message : '업무 상태를 변경하지 못했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteWork = async () => {
    if (window.confirm(`"${work?.name}" 업무를 삭제하시겠습니까?\n연결된 모든 할 일도 함께 삭제됩니다.`)) {
      try {
        await deleteWorkMutation.mutateAsync(work!.id);
        onOpenChange(false);
        onDelete?.(work!.id);
        toast({
          title: "업무 삭제 완료",
          description: `"${work?.name}" 업무가 삭제되었습니다.`,
        });
      } catch (error) {
        console.error('Work deletion failed:', error);
        toast({
          title: "삭제 실패",
          description: error instanceof Error ? error.message : '업무 삭제 중 오류가 발생했습니다.',
          variant: "destructive",
        });
      }
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    try {
      await deleteWorkFileMutation.mutateAsync({ workId: work!.id, fileId });
      refetchFiles();
      toast({
        title: "파일 삭제 완료",
        description: `"${fileName}" 파일이 삭제되었습니다.`
      });
    } catch (error) {
      toast({
        title: "파일 삭제 실패",
        description: "파일 삭제 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  };

  const handleDownloadFile = (fileUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] min-w-0 max-w-3xl overflow-y-auto overflow-x-hidden p-0" hideCloseButton>
        {/* 헤더 — 제목 + 상태 칩 (동작 버튼은 전부 푸터로) */}
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="flex min-w-0 flex-1 items-center gap-2.5 text-base sm:text-lg">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <Calendar className="h-4 w-4" />
              </div>
              <span className="min-w-0 break-words leading-snug">{currentWork.name}</span>
            </DialogTitle>
            {/* 상태 칩 — 편집 권한이 있으면 그 자리에서 완료/진행을 토글한다(할 일 상세와 같은 방식).
                권한이 없으면 읽기 전용 배지 */}
            {canEditWork ? (
              <button
                type="button"
                onClick={() => void handleToggleWorkStatus()}
                disabled={updateWorkMutation.isPending}
                title={currentWork.status === 'completed'
                  ? '진행 중으로 되돌리기'
                  : '이 업무를 완료로 표시 (할 일 상태는 그대로)'}
                className={cn(
                  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium',
                  'transition-colors hover:brightness-95 disabled:opacity-60',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1',
                  statusChip.className,
                )}
              >
                {updateWorkMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : currentWork.status === 'completed' ? (
                  <Undo2 className="h-3 w-3" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {statusChip.label}
              </button>
            ) : (
              <Badge variant="outline" className={cn('h-6 shrink-0 rounded-full px-2.5 text-xs font-medium', statusChip.className)}>
                {statusChip.label}
              </Badge>
            )}
          </div>
          {/* 핵심 메타 한 줄 — 부서·연도·할 일 수 */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-[46px] text-xs text-slate-500">
            {currentWork.meta?.department && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                {currentWork.meta.department}
              </span>
            )}
            {currentWork.meta?.year && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {currentWork.meta.year}년
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3.5 w-3.5 text-slate-400" />
              할 일 {tasks.length}개
            </span>
            {/* 지난 업무 가져오기로 만든 업무 — 이름만 적어 두면 «어떻게 하는 거였죠»에 답하지
                못한다. 원본 id 가 있으면 **눌러서 작년 업무를 연다**(2026-09-24). 딥링크로
                보내는 이유: 이 다이얼로그를 띄우는 자리가 다섯 곳이라 콜백을 다섯 번 잇게 된다. */}
            {typeof currentWork.meta?.rolledOverFrom?.name === 'string' && (
              typeof currentWork.meta.rolledOverFrom.workId === 'string' ? (
                <Link
                  to={`/tasks/mine?work=${encodeURIComponent(currentWork.meta.rolledOverFrom.workId)}`}
                  className="inline-flex min-w-0 max-w-full items-center gap-1 rounded text-slate-500 underline-offset-2 hover:text-blue-600 hover:underline"
                  title={`작년 업무 열기 — ${currentWork.meta.rolledOverFrom.name}`}
                  onClick={() => onOpenChange(false)}
                >
                  <History className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">원본 {currentWork.meta.rolledOverFrom.name}</span>
                </Link>
              ) : (
                <span
                  className="inline-flex min-w-0 max-w-full items-center gap-1"
                  title={`지난 업무 가져오기로 만들었습니다 — 원본: ${currentWork.meta.rolledOverFrom.name}`}
                >
                  <History className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">원본 {currentWork.meta.rolledOverFrom.name}</span>
                </span>
              )
            )}
          </div>
        </DialogHeader>

        <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
          {/* 설명 */}
          <section className="space-y-2">
            <SectionLabel icon={AlignLeft}>설명</SectionLabel>
            <p className={cn(
              'whitespace-pre-wrap break-words text-sm leading-relaxed',
              currentWork.description ? 'text-slate-700' : 'text-slate-400'
            )}>
              {currentWork.description || '설명이 없습니다.'}
            </p>
          </section>

          {/* 관리자 — 담당자와 같은 truncate 그리드 칩 */}
          <section className="space-y-2">
            <SectionLabel icon={User}>책임자{managers.length > 0 && ` ${managers.length}명`}</SectionLabel>
            {managers.length > 0 ? (
              <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
                {managers.map((manager, index) => (
                  <div
                    key={manager.id || index}
                    title={manager.name}
                    className="flex min-w-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/40 px-2 py-1.5 text-xs text-emerald-800"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="min-w-0 truncate font-medium">{manager.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">미지정</p>
            )}
          </section>

          {/* 키워드 */}
          {currentWork.keywords && currentWork.keywords.length > 0 && (
            <section className="space-y-2">
              <SectionLabel icon={Tag}>키워드</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {currentWork.keywords.map((keyword: string, index: number) => (
                  <Badge key={index} variant="outline" className="rounded-md text-xs font-normal text-slate-500">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* 연결된 할 일 — 요약(진행률) + 행 목록 */}
          <section className="space-y-2">
            <SectionLabel
              icon={ListChecks}
              trailing={
                <span className="flex items-center gap-2">
                  {tasks.length > 0 && (
                    <span className="text-xs tabular-nums text-slate-500">
                      <span className="font-semibold text-emerald-600">{completedTasks}</span>
                      /{tasks.length} 완료
                    </span>
                  )}
                  {canEditWork && (
                    <Button onClick={handleAddTask} size="sm" className="h-7 gap-1 px-2 text-xs">
                      <Plus className="h-3 w-3" />
                      할 일 추가
                    </Button>
                  )}
                </span>
              }
            >
              연결된 할 일
            </SectionLabel>

            {tasks.length > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
                  style={{ width: `${taskProgressPct}%` }}
                />
              </div>
            )}

            {isLoading ? (
              <div className="py-6 text-center">
                <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <p className="mt-2 text-xs text-slate-500">할 일 정보를 불러오는 중...</p>
              </div>
            ) : tasks.length > 0 ? (
              <div className="space-y-1.5">
                {tasks.map((task, index) => {
                  const isOneTimeTask = task.type === 'one_time' || task.order_index === 0;
                  const orderNumber = task.order_index != null ? task.order_index : 0;
                  const isCompleted = task.meta?.assignees && task.meta.assignees.length > 0
                    ? task.meta.assignees.every(a => a.status === 'completed')
                    : task.status === 'completed';
                  const assignees = task.meta?.assignees ?? [];
                  const info = getTaskDeadlineInfo(task);
                  const due = info.effective ?? task.due_date;

                  return (
                    <div
                      key={task.id || index}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
                        isCompleted
                          ? 'border-emerald-200/70 bg-emerald-50/40 hover:bg-emerald-50/70'
                          : 'border-slate-200/70 bg-slate-50/40 hover:bg-slate-100/60'
                      )}
                      onClick={() => handleTaskClick(task)}
                    >
                      {/* Numbered circle badge */}
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-sm">
                        {isOneTimeTask ? (
                          <div className="h-1.5 w-1.5 rounded-full bg-white" />
                        ) : (
                          <span className="text-xs font-bold">{orderNumber}</span>
                        )}
                      </div>

                      {/* Content area */}
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium">{task.title}</h4>
                        <p className="text-[11px] text-slate-500">
                          {due && (
                            <>
                              마감 {new Date(due).toLocaleDateString('ko-KR')}
                              {info.isMulti && ` (${info.passed + 1}/${info.total}회)`}
                            </>
                          )}
                          {due && assignees.length > 0 && ' · '}
                          {assignees.length > 0 && (
                            <>
                              담당 {assignees.length}명
                              {' '}
                              <span className={cn('tabular-nums', isCompleted ? 'text-emerald-600' : '')}>
                                ({assignees.filter(a => a.status === 'completed').length}/{assignees.length})
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex shrink-0 items-center gap-0.5">
                        <TaskEditButton task={task} onTaskEdit={handleTaskEdit} />
                        <TaskDeleteButton task={task} onDeleteTask={handleDeleteTask} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed py-8 text-center">
                <ListChecks className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">이 업무에 연결된 할 일이 없습니다.</p>
                {canEditWork && (
                  <Button onClick={handleAddTask} variant="outline" size="sm" className="mt-3 h-8 gap-1.5 px-3 text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    첫 할 일 추가하기
                  </Button>
                )}
              </div>
            )}
          </section>

          {/* 업무 지식(2026-10-24) — 이 업무와 지난 해들(계보)의 절차·요령·주의. 책임자에게만 보인다(서버 판정) */}
          <WorkKnowledgeSection workId={currentWork.id} tasks={tasks.map((t) => ({ id: t.id, title: t.title }))} />

          {/* 첨부파일 — 없으면 한 줄만(할 일 상세와 같은 규칙 — 빈 목록 컴포넌트가 큰 빈 상태를 그렸다) */}
          {workFiles.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <File className="h-3.5 w-3.5" />
              첨부파일 없음
            </p>
          ) : (
          <section className="space-y-2">
            <SectionLabel icon={File}>첨부파일 {workFiles.length}</SectionLabel>
            <EnhancedFileList
              documents={workFiles.map(file => ({
                id: file.id,
                file_name: file.name,
                file_type: file.type || 'unknown',
                file_size: file.size || 0,
                storage_path: file.url || '',
                upload_status: 'completed' as const,
                created_at: file.uploaded_at,
                updated_at: file.uploaded_at,
                user_id: file.uploaded_by || '',
                title: file.name,
                meta: {}
              }))}
              loading={false}
              onDownload={async (doc) => {
                const file = workFiles.find(f => f.id === doc.id);
                if (file) {
                  handleDownloadFile(file.url, file.name);
                }
              }}
              onDelete={async (id) => {
                const file = workFiles.find(f => f.id === id);
                if (file) {
                  handleDeleteFile(id, file.name);
                }
              }}
              onUpdate={async () => {}}
              enableRename={false}
              enableDelete={false}
              enableBulkActions={false}
              enableSearch={false}
              enableViewModeToggle={false}
              showBreadcrumb={false}
              showBadges={false}
              showFileSize={true}
              showModifiedDate={true}
              showDirectoryColumn={false}
              compactMode={true}
              maxHeight="280px"
              defaultViewMode="list"
              emptyStateMessage="첨부된 파일이 없습니다."
            />
          </section>
          )}
        </div>

        {/* 푸터 — 모든 동작 버튼을 같은 ghost 디자인으로 통일 */}
        <div className={DIALOG_FOOTER_CLASS}>
          {canDeleteWork && (
            <Button
              variant="ghost"
              onClick={handleDeleteWork}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_DESTRUCTIVE_CLASS)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </Button>
          )}
          {canEditWork && onEdit && (
            <Button
              variant="ghost"
              onClick={() => onEdit(currentWork)}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            >
              <Edit className="h-3.5 w-3.5" />
              수정
            </Button>
          )}
          {/* 업무 진행(2026-09-27) — 이 상세를 닫지 않고 **위에 겹쳐** 연다(docs/nested-modal-pitfalls.md) */}
          <Button
            variant="ghost"
            onClick={() => setPipelineOpen(true)}
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
          >
            <Route className="h-3.5 w-3.5" />
            단계별 진행
          </Button>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
          >
            <X className="h-3.5 w-3.5" />
            닫기
          </Button>
        </div>
      </DialogContent>

      {/* Task Detail Dialog */}
      <TaskDetailDialog
        task={selectedTask}
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        onEdit={handleTaskEdit}
      />

      {/* Task Edit Dialog */}
      <TaskEditDialog
        workId={work?.id || ''}
        task={editingTask}
        open={taskEditOpen}
        onOpenChange={setTaskEditOpen}
        onSuccess={handleTaskSuccess}
      />

      {/* 업무 진행 */}
      <WorkPipelineDialog
        workId={currentWork?.id ?? null}
        open={pipelineOpen}
        onOpenChange={setPipelineOpen}
      />
    </Dialog>
  );
}

// Task edit button component with permission check
function TaskEditButton({
  task,
  onTaskEdit
}: {
  task: Task;
  onTaskEdit: (task: Task) => void;
}) {
  const { data: canEditTask } = useCanEditTask({
    id: task.id,
    event_id: task.event_id,
    created_by: task.created_by
  });

  if (!canEditTask) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onTaskEdit(task);
      }}
      className="h-7 w-7 p-0 text-slate-500 hover:text-slate-700"
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </Button>
  );
}

// Task delete button component with permission check
function TaskDeleteButton({
  task,
  onDeleteTask
}: {
  task: Task;
  onDeleteTask: (taskId: string, taskTitle: string) => void;
}) {
  const { data: canDeleteTask } = useCanDeleteTask({
    id: task.id,
    event_id: task.event_id,
    created_by: task.created_by
  });

  if (!canDeleteTask) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onDeleteTask(task.id, task.title);
      }}
      className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
