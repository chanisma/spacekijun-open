import { TaskAssignmentIssue, TaskAssignmentIssueSummary } from './TaskAssignmentIssue';
// ========================================
// Task Detail Dialog Component
// 개별 할 일 상세 정보 및 관리
//
// 디자인 기준 모달 (2026-08-11 오버홀): 내 할 일 기능의 다른 모달(업무 상세 등)도
// 이 구성을 따른다 — 마이크로 라벨 섹션 헤더 + rounded-xl 패널 + 담당자는
// "요약(진행률) + 컴팩트 그리드 칩(truncate, 스크롤)" 패턴.
// 구 구현은 담당자마다 Badge에 이름+상태 텍스트를 넣어 인원이 많으면 세로 공간을
// 다 먹고 긴 이름이 상자를 넘었다.
// ========================================

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Task } from '@/types/tasks';
import {
  useDeleteTaskJsonb,
  useWorksJsonb,
  useToggleAssigneeStatusJsonb,
  useToggleDeadlineStatusJsonb,
  useToggleUnitStatusJsonb,
  useUpdateTaskJsonb,
  useUpdateTaskStatusJsonb,
} from '@/hooks/useTasksJsonb';
import { TaskEditDialog } from './TaskEditDialog';
import {
  getTaskUnits,
  getUnitProgress,
  isUnitCompleted,
  isUnitCompletedBy,
  unclaimedUnits,
  unitCompletionStats,
  unitHolderIds,
  unitsOfAssignee,
} from '@/lib/taskUnits';
import { useCanEditTask, useCanDeleteTask, useCurrentUserResourceId } from '@/hooks/usePermissions';
import { TaskActionPanel } from '@/features/task-workflow/components/TaskActionPanel';
import { CollectRespondDialog } from '@/features/task-workflow/components/collect/CollectRespondDialog';
import { useMyCollectRequests } from '@/features/task-workflow/hooks/useCollectInput';
import { pendingSubmitRequestsByTask, requestKindOf, requestVerb } from '@/lib/collectInput';
import { hasReportedNotMine } from '@/lib/taskAssignmentIssue';
import { VisibleFromChip } from './VisibleFromChip';
import { useTaskActionEntries } from '@/features/task-workflow/hooks/useTaskActions';
import { useTaskFiles } from '@/hooks/useTaskFiles';
import { EnhancedFileList } from '@/components/ui/file-list';
import { useToast } from '@/hooks/use-toast';
import {
  buildHandoverNotePatch,
  HANDOVER_NOTE_HINT,
  HANDOVER_NOTE_MAX,
  readHandoverNote,
} from '@/lib/handoverNote';
import { formatRoundLabel, getDeadlineProgress, getTaskDeadlineInfo, isRoundCompleted } from '@/lib/taskDeadlines';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_DESTRUCTIVE_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
} from './dialogDesign';
import { cn } from '@/lib/utils';
import {
  History,
  AlignLeft,
  CalendarDays,
  CheckCircle2,
  Edit,
  File,
  Inbox,
  Hand,
  Info,
  ListChecks,
  Loader2,
  Tag,
  Trash2,
  Undo2,
  Users,
  X,
  Route,
} from 'lucide-react';
import { WorkPipelineDialog } from './pipeline/WorkPipelineDialog';
import { useAuth } from '@/components/auth/AuthProvider';

interface TaskDetailDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (task: Task) => void;
  /**
   * [진행 화면] 링크를 보일까(기본 true). 업무 진행 화면 **안에서** 연 상세는 자기 자신으로 가는
   * 링크가 되므로 false 로 넘긴다.
   */
  showPipelineLink?: boolean;
}

export function TaskDetailDialog({
  task: selectedTask,
  open,
  onOpenChange,
  onEdit,
  showPipelineLink = true,
}: TaskDetailDialogProps) {
  // 업무 진행(작업 러너·산출물 쓰기)은 교직원 기능이다 — 학생 시점에는 입구를 두지 않는다
  const { isStudentView } = useAuth();
  const { data: works } = useWorksJsonb();
  // A nested editor can replace every field, including title/type, not only status.
  const task: Task | null = (works ?? [])
    .flatMap((work: { tasks?: Task[] }) => work.tasks ?? [])
    .find(item => item.id === selectedTask?.id) ?? selectedTask;
  const { toast } = useToast();
  const deleteTaskMutation = useDeleteTaskJsonb();
  const { data: taskFiles = [] } = useTaskFiles(task?.id || 'disable-query');

  // 담당자 본인 액션(완료 토글·파일 제출)용. 토글 후 캐시가 갱신되면 화면도 따라가야
  // 하므로 prop으로 받은 캡처본 대신 works 캐시에서 라이브 task를 다시 찾는다.
  const { data: currentUserResourceId, isLoading: resourceLoading, isError: resourceError } = useCurrentUserResourceId();
  const toggleAssigneeMutation = useToggleAssigneeStatusJsonb();
  const toggleRoundMutation = useToggleDeadlineStatusJsonb();
  const toggleUnitMutation = useToggleUnitStatusJsonb();
  const updateTaskStatusMutation = useUpdateTaskStatusJsonb();
  const updateTaskMutation = useUpdateTaskJsonb();
  // 제출 받기 작업(2026-10-01) — 이 할 일에서 내가 아직 내지 않은 제출 요청. 있으면 «내 작업»의 완료 자리가 [제출하기]다
  // (서버가 내기 전 완료를 거부한다). 판정은 pendingSubmitRequestsByTask 단일 출처.
  const { data: myRequests = [] } = useMyCollectRequests(open);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  /** 값 제출 작성 화면 — 제출 다이얼로그와 형제로 뜬다(러너가 전체화면이라 중첩 불가) */
  // onEdit을 넘기지 않은 호출부(홈 대시보드 등)를 위해 편집 모달을 이 안에서 연다
  const [editOpen, setEditOpen] = useState(false);
  /** 업무 진행 모달 — 이 상세 위에 겹쳐 뜬다(바꿔치기 아님) */
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [updatingRound, setUpdatingRound] = useState<string | null>(null);
  const [updatingUnit, setUpdatingUnit] = useState<string | null>(null);
  /** 인계 노트 — 편집 중인 초안(null 이면 보기 모드). 저장은 meta 얕은 병합 경로 */
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  // Check if user can edit task
  const { data: canEditTask } = useCanEditTask(
    task ? {
      id: task.id,
      event_id: task.event_id,
      created_by: task.created_by
    } : { id: '', event_id: '', created_by: '' },
    { enabled: !!task?.id }
  );

  // Check if user can delete task
  const { data: canDeleteTask } = useCanDeleteTask(
    task ? {
      id: task.id,
      event_id: task.event_id,
      created_by: task.created_by
    } : { id: '', event_id: '', created_by: '' },
    { enabled: !!task?.id }
  );

  // 실질 작업 연결 여부 — 연결돼 있으면 본문에 '연결된 작업' 목록을 바로 보인다(2026-09-24:
  // 종전엔 푸터 버튼이 모달 위에 모달을 한 겹 더 띄웠다). 훅이므로 아래 early return보다 위에 있어야 한다.
  const workEntries = useTaskActionEntries(task ? [task.id] : []);
  const workEntry = task ? workEntries.get(task.id) : undefined;

  if (!task) return null;

  // 상태·담당자는 토글 직후 갱신돼야 하므로 라이브 데이터 우선(캐시에 없으면 prop 폴백)
  const live = task;

  // Use task.meta.assignees which includes names (after 2025-09-30 migration)
  const enrichedAssignees = live.meta?.assignees || [];

  const isOneTimeTask = task.type === 'one_time' || task.order_index === 0;
  const orderNumber = task.order_index != null ? task.order_index : 0;
  // 옛 제출 방식(task.meta.submission)은 2026-10-05 에 화면에서 걷어 냈다 — 운영 0건, 제출은 「제출 받기」 작업이 한다.
  // 집계 문구(«N/M 완료»)가 제출 할 일에서 «제출»로 바뀌던 분기도 함께 사라졌다.

  const completedCount = enrichedAssignees.filter(a => a.status === 'completed').length;
  const totalCount = enrichedAssignees.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const deadlineInfo = getTaskDeadlineInfo(live);
  const deadlineProgress = getDeadlineProgress(live);

  const myAssignee = currentUserResourceId
    ? enrichedAssignees.find(assignee => assignee.id === currentUserResourceId)
    : undefined;
  const myCompleted = myAssignee?.status === 'completed';
  // 수행할 수 없는 할 일 — 내 할 일 목록(MyTaskInbox)과 **같은 판정**(2026-10-05).
  // 종전엔 목록이 [상세 보기]로만 막고 상세는 [완료로 변경]을 그대로 보여, 매니저가 종료한 할 일·
  // 시작 전/취소된 업무의 할 일·'담당자 아님'을 표시한 할 일이 상세에서는 여전히 할 일처럼 보였다.
  // 이미 끝낸 사람은 막지 않는다(완료 취소는 목록과 같이 허용).
  const parentWork = (works ?? []).find((work: { id?: string }) => work.id === live?.event_id) as { status?: string } | undefined;
  const myActionBlockedReason: string | null = !myAssignee || myCompleted ? null
    : live?.status === 'cancelled' || parentWork?.status === 'cancelled' ? '취소된 할 일입니다.'
    : parentWork?.status === 'pending' ? '업무가 아직 시작 전(대기)입니다. 책임자가 시작하면 처리할 수 있습니다.'
    : live?.status === 'completed' || parentWork?.status === 'completed' ? '책임자가 이 할 일을 종료했습니다. 더 처리할 것이 없습니다.'
    : hasReportedNotMine(live, myAssignee.id) ? '담당자가 아니라고 표시한 할 일입니다. 책임자가 조정할 때까지 처리하지 않습니다.'
    : null;
  const roundMode = deadlineInfo.isMulti;
  const myRoundsDone = myAssignee
    ? deadlineInfo.deadlines.filter(d => isRoundCompleted(deadlineProgress, d, myAssignee.id)).length
    : 0;

  // 과제 단위 할 일(2026-08-12) — 진행 총량이 사람이 아니라 단위. 담당자 개인 상태는 파생값이라
  // 사람 토글(handleToggleMyStatus)을 쓰면 안 되고(서버 가드 0A000), 단위 토글로만 조작한다.
  const units = getTaskUnits(live);
  const unitProgress = getUnitProgress(live);
  const unitTask = units.length > 0;
  const unitStats = unitCompletionStats(units, unitProgress);
  const myUnits = myAssignee ? unitsOfAssignee(units, unitProgress, myAssignee.id) : [];
  const myUnitsDone = myAssignee
    ? myUnits.filter(unit => isUnitCompletedBy(unitProgress, unit.key, myAssignee.id)).length
    : 0;
  const freeUnits = unclaimedUnits(units, unitProgress);
  const assigneeNameById = new Map(enrichedAssignees.map(a => [a.id, a.name]));

  // 내 단위 선택/해제/완료 — 본인 명의로만(매니저 전원 조작은 카드 칩 경로)
  const handleUnitChange = async (unitKey: string, status: 'pending' | 'completed' | null) => {
    if (!myAssignee) return;
    setUpdatingUnit(unitKey);
    try {
      await toggleUnitMutation.mutateAsync({
        taskId: live.id,
        unitKey,
        assigneeId: myAssignee.id,
        status,
      });
    } catch (error) {
      toast({
        title: '단위 변경 실패',
        description: error instanceof Error ? error.message : '단위 상태를 변경하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUnit(null);
    }
  };

  const statusChip = {
    pending: { label: '진행 중', className: 'border-slate-200 bg-slate-50 text-slate-600' },
    completed: { label: '완료', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    cancelled: { label: '취소', className: 'border-rose-200 bg-rose-50 text-rose-600' },
  }[live.status] ?? { label: live.status, className: 'border-slate-200 bg-slate-50 text-slate-600' };

  /**
   * 할 일 **전체** 상태 토글 — 매니저·생성자·admin(`canEditTask`)만.
   *
   * 담당자 개인 상태는 건드리지 않는다(2026-08-22 사용자 결정): 담당자들이 제출하지 않았어도
   * 매니저가 완료로 바꾸면 그 할 일은 끝난 것이고, 그렇다고 담당자들을 제출 처리할 필요는 없다.
   * 대신 끝난 할 일은 담당자들의 '나의 할 일'에서 빠진다(판정 = `lib/taskStatus.getMyTaskStatus`).
   */
  const handleToggleTaskStatus = async () => {
    const next = live.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateTaskStatusMutation.mutateAsync({ taskId: live.id, status: next });
      toast({
        title: next === 'completed' ? '할 일을 완료로 표시했습니다.' : '할 일을 진행 중으로 되돌렸습니다.',
        description: next === 'completed'
          ? '담당자 개인 상태는 그대로 두고, 담당자들의 "나의 할 일"에서는 빠집니다.'
          : undefined,
      });
    } catch (error) {
      toast({
        title: '상태 변경 실패',
        description: error instanceof Error ? error.message : '할 일 상태를 변경하지 못했습니다.',
        variant: 'destructive',
      });
    }
  };

  // 내 상태 토글(단일 마감·비제출 할 일).
  // assigneeId를 넘겨 `set_task_assignee_status`를 쓴다 — 본인 전용 경로
  // (`update_assignee_status_meta`)는 **task.status를 재계산하지 않아** 전원이 끝내도
  // 할 일이 계속 진행 중으로 남는다(2026-08-22).
  const handleToggleMyStatus = async () => {
    if (!currentUserResourceId) return;
    try {
      await toggleAssigneeMutation.mutateAsync({
        taskId: live.id,
        status: myCompleted ? 'pending' : 'completed',
        assigneeId: currentUserResourceId,
      });
    } catch (error) {
      toast({
        title: '상태 변경 실패',
        description: error instanceof Error ? error.message : '상태를 변경하지 못했습니다.',
        variant: 'destructive',
      });
    }
  };

  // 내 회차 토글(다중 마감 할 일)
  const handleToggleMyRound = async (deadline: string) => {
    if (!myAssignee) return;
    setUpdatingRound(deadline);
    try {
      await toggleRoundMutation.mutateAsync({
        taskId: live.id,
        assigneeId: myAssignee.id,
        deadline,
        status: isRoundCompleted(deadlineProgress, deadline, myAssignee.id) ? 'pending' : 'completed',
      });
    } catch (error) {
      toast({
        title: '회차 변경 실패',
        description: error instanceof Error ? error.message : '회차 상태를 변경하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRound(null);
    }
  };

  const handleDeleteTask = async () => {
    if (!task) return;

    if (!confirm('이 할 일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    try {
      await deleteTaskMutation.mutateAsync(task.id);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : "할 일 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] min-w-0 max-w-3xl overflow-y-auto overflow-x-hidden p-0" hideCloseButton>
        {/* 헤더 — 제목 + 상태 칩 (동작 버튼은 전부 푸터로) */}
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="flex min-w-0 flex-1 items-center gap-2.5 text-base sm:text-lg">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/20">
                {isOneTimeTask ? (
                  <div className="h-2 w-2 rounded-full bg-white" />
                ) : (
                  <span className="text-sm font-bold">{orderNumber}</span>
                )}
              </div>
              <span className="min-w-0 break-words leading-snug">{task.title}</span>
            </DialogTitle>
            {/* 상태 칩 — 편집 권한이 있으면 그 자리에서 완료/진행을 토글한다(2026-08-22 사용자 요청).
                권한이 없으면 종전대로 읽기 전용 배지 */}
            {canEditTask ? (
              <button
                type="button"
                onClick={() => void handleToggleTaskStatus()}
                disabled={updateTaskStatusMutation.isPending}
                title={live.status === 'completed'
                  ? '진행 중으로 되돌리기'
                  : '이 할 일을 완료로 표시 (담당자 개인 상태는 그대로)'}
                className={cn(
                  'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium',
                  'transition-colors hover:brightness-95 disabled:opacity-60',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1',
                  statusChip.className,
                )}
              >
                {updateTaskStatusMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : live.status === 'completed' ? (
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
          {/* 핵심 메타 한 줄 — 마감·제출 방식 */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-[46px] text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              {deadlineInfo.total === 0
                ? '마감일 없음'
                : deadlineInfo.isMulti
                  ? `다음 마감 ${deadlineInfo.effective ? new Date(deadlineInfo.effective).toLocaleDateString('ko-KR') : '-'} · 총 ${deadlineInfo.total}회`
                  : new Date(deadlineInfo.deadlines[0]).toLocaleDateString('ko-KR')}
            </span>
            {/* 아직 담당자에게 안 보이는 할 일(2026-10-05 — 업무 「대기」를 대신함) */}
            <VisibleFromChip task={live} />
            {unitTask && (
              <span className="inline-flex items-center gap-1 font-medium text-sky-600">
                <ListChecks className="h-3.5 w-3.5" />
                과제 단위 {unitStats.total}개
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
          {/* 설명 */}
          <section className="space-y-2">
            <SectionLabel icon={AlignLeft}>설명</SectionLabel>
            <p className={cn(
              'whitespace-pre-wrap break-words text-sm leading-relaxed',
              task.description ? 'text-slate-700' : 'text-slate-400'
            )}>
              {task.description || '설명이 없습니다.'}
            </p>
          </section>

          {/* 인계 노트 — «작년에 뭐가 문제였나». 설명(무엇을 하는 일인가) 바로 아래에 둬서
              일을 시작하기 전에 읽히게 한다. 이 값은 지난 업무 가져오기로 내년에 따라간다
              (lib/workRollover.ts 규칙표의 `handoverNote: 'keep'`). */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel icon={History}>인계 노트</SectionLabel>
              {canEditTask && noteDraft === null && (
                <button
                  type="button"
                  className="text-[11px] font-medium text-blue-600 hover:underline"
                  onClick={() => setNoteDraft(readHandoverNote(live.meta))}
                >
                  {readHandoverNote(live.meta) ? '고치기' : '남기기'}
                </button>
              )}
            </div>
            {noteDraft === null ? (
              <p
                className={cn(
                  'whitespace-pre-wrap break-words rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-sm leading-relaxed',
                  readHandoverNote(live.meta) ? 'text-slate-700' : 'text-slate-400'
                )}
              >
                {readHandoverNote(live.meta) || (canEditTask ? HANDOVER_NOTE_HINT : '남긴 메모가 없습니다.')}
              </p>
            ) : (
              <div className="space-y-2">
                <Textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value.slice(0, HANDOVER_NOTE_MAX))}
                  placeholder={HANDOVER_NOTE_HINT}
                  rows={4}
                  autoFocus
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">
                    {noteDraft.length}/{HANDOVER_NOTE_MAX} · 내년에 이 업무를 가져오면 함께 따라갑니다
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={savingNote}
                      onClick={() => setNoteDraft(null)}
                    >
                      취소
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 bg-blue-600 text-xs hover:bg-blue-700"
                      disabled={savingNote}
                      onClick={async () => {
                        setSavingNote(true);
                        try {
                          await updateTaskMutation.mutateAsync({
                            id: live.id,
                            data: { meta: buildHandoverNotePatch(noteDraft) },
                          });
                          setNoteDraft(null);
                        } catch (error) {
                          toast({
                            title: '메모를 저장하지 못했습니다',
                            description: error instanceof Error ? error.message : undefined,
                            variant: 'destructive',
                          });
                        } finally {
                          setSavingNote(false);
                        }
                      }}
                    >
                      저장
                    </Button>
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* 연결된 작업 — 설명 → 작업 진행 → (아래) 완료로 변경 순으로 읽히게 담당자 위에 둔다.
              작업은 완료의 필요 조건이 아니다(사용자 결정) — 하지 않고도 완료로 바꿀 수 있다.
              제출 받기는 아래 내 작업 패널에 있으므로 목록에서 뺀다(embedded). */}
          {workEntry && (
            <TaskActionPanel
              taskId={live.id}
              taskTitle={live.title}
              workflowId={workEntry.workflowId}
              defaultMode="use"
              allowManage={false}
              embedded
            />
          )}

          {/* 담당자 — 요약(진행률) + 컴팩트 그리드 칩 */}
          <section className="space-y-2">
            <SectionLabel
              icon={Users}
              trailing={
                unitTask ? (
                  <span className="text-xs tabular-nums text-slate-500">
                    단위{' '}
                    <span className="font-semibold text-emerald-600">{unitStats.completed}</span>
                    /{unitStats.total} 완료
                  </span>
                ) : totalCount > 0 ? (
                  <span className="text-xs tabular-nums text-slate-500">
                    <span className="font-semibold text-emerald-600">{completedCount}</span>
                    /{totalCount} 완료
                  </span>
                ) : undefined
              }
            >
              담당자{totalCount > 0 && ` ${totalCount}명`}
            </SectionLabel>

            {!resourceLoading && !resourceError && !myAssignee && <p className="flex items-center gap-2 py-2 text-sm text-slate-500"><Users className="h-4 w-4" />이 할 일의 담당자가 아닙니다.</p>}
            {myAssignee && <TaskAssignmentIssue task={live} resourceId={myAssignee.id} />}
            {canEditTask && <TaskAssignmentIssueSummary task={live} />}
            {/* 내 작업 패널 — 담당자 본인만. 완료 처리(또는 파일 제출)를 상세에서 바로 한다 */}
            {myAssignee && myActionBlockedReason && (
              <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
                <Info className="h-3.5 w-3.5 shrink-0 text-slate-500" />{myActionBlockedReason}
              </p>
            )}
            {myAssignee && !myActionBlockedReason && (
              (() => {
                const pendingSubmits = task?.id ? pendingSubmitRequestsByTask(myRequests).get(task.id) ?? [] : [];
                if (pendingSubmits.length === 0) return null;
                // 요청마다 한 줄 — 칩은 «제출 2건 남음»인데 버튼이 첫 요청만 열던 것(2026-10-06).
                // 동사·결과는 종류마다: 실물은 낼 것이 화면에 없고 책임자가 받으면 완료다(requestVerb 단일 출처)
                return (
                  <div className="space-y-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2">
                    {pendingSubmits.map((request) => {
                      const physical = requestKindOf(request) === 'physical';
                      return (
                        <div key={request.action_id} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-xs text-indigo-900">
                            <Inbox className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                            <span className="truncate" title={request.action_title}>
                              {request.action_title} — {physical ? '아직 받지 않았습니다' : '아직 내지 않았습니다'}
                              <span className="text-indigo-500">{physical ? ' · 책임자가 받으면 완료됩니다' : ' · 내면 저절로 완료됩니다'}</span>
                            </span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant={physical ? 'outline' : 'default'}
                            onClick={() => setRequestActionId(request.action_id)}
                            className={physical
                              ? 'h-11 shrink-0 gap-1 border-indigo-200 px-2.5 text-xs text-indigo-700 sm:h-7'
                              : 'h-11 shrink-0 gap-1 bg-indigo-600 px-2.5 text-xs hover:bg-indigo-700 sm:h-7'}
                          >
                            <Inbox className="h-3 w-3" />{requestVerb(request)}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
            {myAssignee && !myActionBlockedReason && !(task?.id && pendingSubmitRequestsByTask(myRequests).has(task.id)) && (
              unitTask ? (
                /* 과제 단위 할 일: 내 단위 완료 토글 + 미선택 단위 직접 선택(카드 팝오버와 동일 동작) */
                <div className="space-y-1.5 rounded-lg border border-sky-200 bg-sky-50/40 px-3 py-2">
                  <span className="text-xs text-slate-600">
                    내 단위{' '}
                    <span className="font-semibold tabular-nums">
                      {myUnitsDone}/{myUnits.length}
                    </span>{' '}
                    완료
                    {freeUnits.length > 0 && ' · 아래에서 단위를 직접 선택할 수 있습니다'}
                  </span>
                  {myUnits.map(unit => {
                    const done = isUnitCompletedBy(unitProgress, unit.key, myAssignee.id);
                    const updating = updatingUnit === unit.key;
                    return (
                      <div
                        key={unit.key}
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-2.5 py-1.5',
                          done ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'
                        )}
                      >
                        <button
                          type="button"
                          disabled={toggleUnitMutation.isPending}
                          onClick={() => handleUnitChange(unit.key, done ? 'pending' : 'completed')}
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-wait',
                            done
                              ? 'border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'
                          )}
                        >
                          {updating ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : done ? (
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          ) : (
                            <Hand className="h-2.5 w-2.5" />
                          )}
                          {done ? '완료' : '완료로 표시'}
                        </button>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                          {unit.label}
                        </span>
                        <button
                          type="button"
                          title="선택 취소"
                          disabled={toggleUnitMutation.isPending}
                          onClick={() => handleUnitChange(unit.key, null)}
                          className="shrink-0 rounded p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {freeUnits.map(unit => {
                    const updating = updatingUnit === unit.key;
                    return (
                      <div
                        key={unit.key}
                        className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-2.5 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                          {unit.label}
                        </span>
                        <button
                          type="button"
                          disabled={toggleUnitMutation.isPending}
                          onClick={() => handleUnitChange(unit.key, 'pending')}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 transition hover:border-sky-400 hover:shadow-sm disabled:opacity-60"
                        >
                          {updating ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Hand className="h-2.5 w-2.5" />
                          )}
                          내가 하기
                        </button>
                      </div>
                    );
                  })}
                  {myUnits.length === 0 && freeUnits.length === 0 && (
                    <p className="text-xs text-slate-400">
                      모든 단위를 다른 담당자가 맡았습니다.
                    </p>
                  )}
                </div>
              ) : roundMode ? (
                <div className="space-y-1.5 rounded-lg border bg-slate-50/60 px-3 py-2">
                  <span className="text-xs text-slate-600">
                    내 회차{' '}
                    <span className="font-semibold tabular-nums">
                      {myRoundsDone}/{deadlineInfo.deadlines.length}
                    </span>{' '}
                    완료 · 회차를 눌러 변경
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {deadlineInfo.deadlines.map(deadline => {
                      const done = isRoundCompleted(deadlineProgress, deadline, myAssignee.id);
                      const updating = updatingRound === deadline;
                      return (
                        <button
                          key={deadline}
                          type="button"
                          disabled={toggleRoundMutation.isPending}
                          onClick={() => handleToggleMyRound(deadline)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-wait',
                            done
                              ? 'border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'
                          )}
                        >
                          {updating ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : done ? (
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          ) : null}
                          {formatRoundLabel(deadlineInfo.deadlines, deadline)}{done ? '' : ' · 완료하기'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg border px-3 py-2',
                    myCompleted ? 'border-emerald-200 bg-emerald-50/50' : 'bg-slate-50/60'
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs text-slate-700">
                    {myCompleted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    내 상태
                    <span className={cn('font-semibold', myCompleted ? 'text-emerald-700' : '')}>
                      {myCompleted ? '완료' : '진행 중'}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={myCompleted ? 'outline' : 'default'}
                    disabled={toggleAssigneeMutation.isPending}
                    onClick={handleToggleMyStatus}
                    className="h-7 shrink-0 gap-1 px-2.5 text-xs"
                  >
                    {toggleAssigneeMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : myCompleted ? null : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {myCompleted ? '진행으로 되돌리기' : '완료로 변경'}
                  </Button>
                </div>
              )
            )}

            {totalCount > 0 ? (
              <div className="space-y-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {/* 인원이 많아도 칩 하나는 한 줄 고정(truncate) + 전체는 스크롤로 제한.
                    한국 이름은 짧아 sm 4열·md 5열까지 안전(2026-08-13 사용자 결정) */}
                <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                  {enrichedAssignees.map((assignee) => {
                    const done = assignee.status === 'completed';
                    return (
                      <div
                        key={assignee.id}
                        title={`${assignee.name ?? '이름 없음'} · ${done ? '완료' : '진행 중'}`}
                        className={cn(
                          'flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs',
                          done
                            ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                            : 'border-slate-200 bg-slate-50/60 text-slate-600'
                        )}
                      >
                        <span className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          done ? 'bg-emerald-500' : 'bg-slate-300'
                        )} />
                        <span className="min-w-0 truncate font-medium">{assignee.name ?? '이름 없음'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : task.assignees && task.assignees.length > 0 ? (
              /* 2025-09-30 이전 레거시 데이터 — meta.assignees가 없고 assignees만 있는 경우 */
              <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                {task.assignees.map((assignee) => (
                  <div
                    key={assignee.id}
                    title={assignee.name}
                    className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-xs text-slate-600"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <span className="min-w-0 truncate font-medium">{assignee.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">미지정</p>
            )}
          </section>

          {/* 과제 단위 현황 — 단위별 진행 상태와 맡은 사람(이 다이얼로그는 담당자 명단을
              이미 노출하므로 단위↔담당 매핑도 같은 수준으로 보여준다) */}
          {unitTask && (
            <section className="space-y-2">
              <SectionLabel
                icon={ListChecks}
                trailing={
                  <span className="text-xs tabular-nums text-slate-500">
                    <span className="font-semibold text-emerald-600">{unitStats.completed}</span>
                    /{unitStats.total} 완료
                  </span>
                }
              >
                과제 단위 {unitStats.total}개
              </SectionLabel>
              <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {units.map(unit => {
                  const holderIds = unitHolderIds(unitProgress, unit.key);
                  const done = isUnitCompleted(unitProgress, unit.key);
                  const holderNames = holderIds
                    .map(id => assigneeNameById.get(id)?.trim() || '이름 없음')
                    .join(', ');
                  return (
                    <div
                      key={unit.key}
                      className={cn(
                        'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                        done
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : holderIds.length === 0
                            ? 'border-dashed border-slate-300 bg-slate-50/40'
                            : 'border-slate-200 bg-slate-50/60'
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          done ? 'bg-emerald-500' : holderIds.length === 0 ? 'bg-amber-400' : 'bg-slate-300'
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                        {unit.label}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 truncate text-[11px]',
                          done
                            ? 'text-emerald-700'
                            : holderIds.length === 0
                              ? 'text-amber-600'
                              : 'text-slate-500'
                        )}
                        title={holderNames || undefined}
                      >
                        {holderIds.length === 0 ? '담당자 미선택' : holderNames}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 다중 마감 회차 */}
          {deadlineInfo.isMulti && (
            <section className="space-y-2">
              <SectionLabel icon={CalendarDays}>
                마감 일정 · {deadlineInfo.passed}회 지남
              </SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {deadlineInfo.deadlines.map((d) => (
                  <Badge
                    key={d}
                    variant="outline"
                    className={cn(
                      'rounded-md text-xs font-normal',
                      d === deadlineInfo.effective
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : d < (deadlineInfo.effective ?? '')
                          ? 'text-slate-300 line-through'
                          : 'text-slate-500'
                    )}
                  >
                    {new Date(d).toLocaleDateString('ko-KR')}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* 키워드 */}
          {task.keywords && task.keywords.length > 0 && (
            <section className="space-y-2">
              <SectionLabel icon={Tag}>키워드</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {task.keywords.map((keyword, index) => (
                  <Badge key={index} variant="outline" className="rounded-md text-xs font-normal text-slate-500">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* 첨부파일 — 없으면 한 줄만(빈 목록 컴포넌트가 큰 빈 상태를 그렸다) */}
          {taskFiles.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <File className="h-3.5 w-3.5" />
              첨부파일 없음
            </p>
          ) : (
          <section className="space-y-2">
            <SectionLabel icon={File}>첨부파일 {taskFiles.length}</SectionLabel>
            <EnhancedFileList
              documents={taskFiles.map(file => ({
                id: file.id,
                file_name: file.name,
                file_type: file.type || 'unknown',
                file_size: file.size || 0,
                storage_path: file.url || '',
                upload_status: 'completed' as const,
                created_at: file.uploaded_at || new Date().toISOString(),
                updated_at: file.uploaded_at || new Date().toISOString(),
                user_id: file.uploaded_by || '',
                title: file.name,
                meta: {}
              }))}
              loading={false}
              onDownload={async (doc) => {
                window.open(doc.storage_path, '_blank');
              }}
              onDelete={async () => {}}
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
          {canDeleteTask && (
            <Button
              variant="ghost"
              onClick={handleDeleteTask}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_DESTRUCTIVE_CLASS)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </Button>
          )}
          {/* onEdit을 안 넘긴 호출부(홈 대시보드 등)에서도 수정이 되어야 한다 —
              종전에는 `onEdit &&` 조건 때문에 책임자에게도 버튼이 안 보였다(2026-08-22) */}
          {canEditTask && (
            <Button
              variant="ghost"
              onClick={() => (onEdit ? onEdit(task) : setEditOpen(true))}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            >
              <Edit className="h-3.5 w-3.5" />
              수정
            </Button>
          )}
          {/* 업무 진행(2026-09-27) — 담당자의 입구. 담당자는 내 할 일·홈에서 이 창을 열지 업무 상세를
              거치지 않는다. 앞 단계에서 넘어온 것을 보고 이 할 일이 남길 것을 적는 자리다.
              이 상세를 닫지 않고 **위에 겹쳐** 연다 — 닫으면 보던 할 일로 돌아온다(docs/nested-modal-pitfalls.md). */}
          {showPipelineLink && !isStudentView && live.event_id && (
            <Button
              variant="ghost"
              onClick={() => setPipelineOpen(true)}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            >
              <Route className="h-3.5 w-3.5" />
              단계별 진행
            </Button>
          )}
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

      {/* 편집 — onEdit을 넘기지 않은 호출부용 자체 경로. 상세를 닫지 않고 위에 쌓는다
          (두 Radix 모달을 같은 틱에 닫고 열면 body의 pointer-events가 복구되지 않을 수 있다) */}
      {editOpen && (
        <TaskEditDialog
          workId={live.event_id}
          task={live}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {/* 제출 받기 작업의 요청 창 — 내 할 일 「요청」과 같은 창을 제자리에서 연다(겹쳐 띄우기) */}
      <CollectRespondDialog
        actionId={requestActionId}
        open={requestActionId !== null}
        onOpenChange={(next) => { if (!next) setRequestActionId(null); }}
      />

      {/* 제출 — 상세에서는 담당자 본인 시점만 연다(매니저의 전원 현황은 카드 칩 경로) */}

      {/* 업무 진행 — 이 할 일을 고른 채 연다 */}
      {showPipelineLink && live.event_id && (
        <WorkPipelineDialog
          workId={live.event_id}
          initialTaskId={live.id}
          open={pipelineOpen}
          onOpenChange={setPipelineOpen}
        />
      )}
    </Dialog>
  );
}
