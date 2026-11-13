// ========================================
// 업무 진행 모달 — 반자동 파이프라인 (2026-09-27, 같은 날 페이지 → 모달)
//
// 근거 = docs/plans/2026-09-27-task-automation-research.md · docs/features/work-pipeline.md
//   · 사람 = 결정·버튼·외부 처리 / 엔진 = 단계 진행·데이터 흐름·계산·점검 / AI = 버튼을 눌렀을 때만
//   · **완료 체크를 여기 두지 않는다** — 수행 진입점이 둘이면 «제출 없이 완료» 같은 우회로를 두 곳에서
//     지켜야 한다(CLAUDE.md 2026-09-04 사고). 완료는 [할 일 상세]가 맡는다.
//
// 페이지가 아니라 모달인 이유(사용자 요청 «진행 화면을 모달로 구성해야 보기 좋을 것»):
//   진입점이 전부 다른 화면 위(내 업무 관리·업무 상세·할 일 상세)라, 페이지로 옮기면 보던 자리를 잃는다.
//   종전에 피하려던 «모달 안 모달»(작업 러너·할 일 상세가 이 위에 뜬다)은 **겹쳐 띄우기**라 안전하다 —
//   Radix 레이어 사본이 하나로 합쳐져 있고(docs/nested-modal-pitfalls.md §0) 뒤로가기는 맨 위 하나만 닫는다.
//
// ⚠️ 이 모달은 다른 모달 **안에서** 열린다(할 일 상세·업무 상세). 바깥을 닫고 여는 «바꿔치기»로 만들지 말 것.
// ⚠️ 스크롤은 DialogContent 의 기본 viewport 가 맡는다(머리글·바닥글은 data-slot 으로 sticky).
//    안쪽 선택기는 viewport 가 아니라 바깥 표면(overflow: visible)으로 포털되므로 잘리지 않는다 —
//    본문에 따로 overflow 영역을 만들면 휴대폰 전체화면의 세로 flex 규칙(modal.css `.grid`)도 비껴간다.
// ========================================

import { useCallback, useMemo, useRef, useState } from 'react';
import { CalendarClock, ExternalLink, ListChecks, Route, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { TaskActionPanel } from '@/features/task-workflow/components/TaskActionPanel';
import { UpstreamContextsProvider, UPSTREAM_CONTEXT_PREFIX, type UpstreamContext } from '@/features/task-workflow/context/UpstreamContexts';
import { useCanEditTask } from '@/hooks/usePermissions';
import { useCanWriteTaskOutput, useResolvedOutputs, useWorkPipeline } from '@/hooks/useWorkPipeline';
import {
  defaultTaskId,
  effectiveOutputKind,
  isOneTimeTask,
  oneTimeTasks,
  outputHasContent,
  outputToText,
  previousStageOf,
  stageIndexOfTask,
  stageNumber,
} from '@/lib/workPipeline';
import { getTaskDeadlineInfo } from '@/lib/taskDeadlines';
import { toast } from '@/lib/toast';
import { PipelineStageBar } from './PipelineStageBar';
import { TaskOutputSection } from './TaskOutputSection';
import { UpstreamPanel } from './UpstreamPanel';
import { WorkCheckPanel } from './WorkCheckPanel';

const STATUS_LABEL: Record<string, string> = { pending: '진행 중', completed: '완료', cancelled: '취소' };

const UNSAVED_WARNING = '저장하지 않은 «남기는 것»이 있습니다. 한 번 더 누르면 저장하지 않고';

export interface WorkPipelineDialogProps {
  /** 진행할 업무(event id). null 이면 아무것도 그리지 않는다 */
  workId: string | null;
  /** 처음 고를 할 일. 없거나 이 업무의 할 일이 아니면 «지금 할 단계»의 첫 할 일 */
  initialTaskId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkPipelineDialog({ workId, initialTaskId = null, open, onOpenChange }: WorkPipelineDialogProps) {
  // 저장하지 않은 산출물 — 닫으면 사라지므로 한 번 멈춘다(두 번째 닫기에 닫는다).
  // 뒤로가기도 같은 규칙이다: onOpenChange(false) 를 거부하면 모달이 남고 다음 뒤로가기도 페이지를 떠나지 않는다.
  const dirtyRef = useRef(false);
  const closeArmed = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    if (!dirty) closeArmed.current = false;
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (dirtyRef.current && !closeArmed.current) {
      closeArmed.current = true;
      toast.warning(`${UNSAVED_WARNING} 닫습니다.`);
      return;
    }
    dirtyRef.current = false;
    closeArmed.current = false;
    onOpenChange(false);
  };

  return (
    <Dialog open={open && !!workId} onOpenChange={handleOpenChange}>
      <DialogContent
        // 데스크톱 = 넓은 작업 공간(단계 줄 + 두 열), 휴대폰 = 전체화면(max-w 에서 자동 유도 — dialog-layout.ts)
        className="max-h-[92vh] min-w-0 max-w-6xl gap-0 p-0"
        hideCloseButton
      >
        {workId && (
          <WorkPipelineBody
            // 업무·시작 할 일이 바뀌면 새로 — 선택·초안이 다른 업무로 새지 않게
            key={`${workId}:${initialTaskId ?? ''}`}
            workId={workId}
            initialTaskId={initialTaskId}
            onDirtyChange={onDirtyChange}
            onClose={() => handleOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WorkPipelineBody({
  workId,
  initialTaskId,
  onDirtyChange: reportDirty,
  onClose,
}: {
  workId: string;
  initialTaskId: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const { work, isLoading, error, tasks, stages, actions, outputByTask } = useWorkPipeline(workId);
  const [detailOpen, setDetailOpen] = useState(false);
  const [requested, setRequested] = useState<string | null>(initialTaskId);

  // 순서 없는 할 일(일회성) — 단계 사슬이 아니라 따로 묶는다(적대적 검증 2026-09-27)
  const unordered = useMemo(() => oneTimeTasks(tasks), [tasks]);

  // 지워진 할 일을 가리키면 조용히 기본값으로
  const selectedId = useMemo(() => {
    if (requested && tasks.some((t) => t.id === requested)) return requested;
    return defaultTaskId(stages, unordered);
  }, [requested, tasks, stages, unordered]);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  // 저장하지 않은 산출물 — 다른 할 일로 옮기면 사라지므로 한 번 멈춘다(두 번째 누름에 옮긴다)
  const dirtyRef = useRef(false);
  const pendingSwitch = useRef<string | null>(null);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    reportDirty(dirty);
  }, [reportDirty]);

  const select = (taskId: string) => {
    if (taskId === selectedId) return;
    if (dirtyRef.current && pendingSwitch.current !== taskId) {
      pendingSwitch.current = taskId;
      toast.warning(`${UNSAVED_WARNING} 옮깁니다.`);
      return;
    }
    pendingSwitch.current = null;
    onDirtyChange(false);
    setRequested(taskId);
  };

  const prevStage = selected ? previousStageOf(stages, selected.id) : null;
  const stageIdx = selected ? stageIndexOfTask(stages, selected.id) : -1;

  const { data: canManage = false } = useCanEditTask(
    { id: selected?.id ?? '', event_id: workId, created_by: selected?.created_by },
    { enabled: !!selected },
  );
  const { data: canWrite = false } = useCanWriteTaskOutput(selected?.id ?? null);

  // 지금 할 일 + 앞 단계 할 일만 원천에서 풀어 온다(전부 읽지 않는다)
  const resolveTargets = useMemo(
    () => (selected ? [selected, ...(prevStage?.tasks ?? [])] : []),
    [selected, prevStage],
  );
  const resolved = useResolvedOutputs(resolveTargets, actions, outputByTask, canManage);
  const current = resolved[0];
  const upstreamKey = resolved.slice(1).map((r) => `${r.task.id}:${r.outputs.map((o) => `${o.sourceKey}@${o.updatedAt ?? ''}`).join(',')}`).join('|');
  const upstream = useMemo(
    () => resolved.slice(1).map((r) => ({ taskTitle: r.task.title, outputs: r.outputs })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upstreamKey],
  );
  const upstreamLoading = resolved.slice(1).some((r) => r.isLoading);

  // 앞 단계 산출물 → 스펙 문서 맥락(러너가 «앞 단계» 맥락으로 기본 포함한다)
  // ⚠️ **일부만 보이는 원천(unavailable)은 넣지 않는다** — 비공개 수합의 내 줄만 넣으면 AI 가 남들이 빈칸으로
  //    답한 것처럼 쓴다(적대적 검증 2026-09-27). id 는 이름이 아니라 원천 키로 — 작업 이름을 바꿔도 같다.
  const upstreamContexts = useMemo<UpstreamContext[]>(
    () => upstream.flatMap((u) => u.outputs
      .filter((o) => !o.unavailable && outputHasContent(o.body) && o.body.kind !== 'signal' && o.body.kind !== 'file')
      .map((o) => ({
        id: `${UPSTREAM_CONTEXT_PREFIX}${o.taskId}:${o.sourceKey}`,
        title: `${u.taskTitle} · ${o.sourceLabel}`,
        body: outputToText(o.body),
      }))),
    [upstream],
  );

  const selectedActions = useMemo(
    () => (selected ? actions.filter((a) => a.task_id === selected.id) : []),
    [actions, selected],
  );

  const deadline = selected ? getTaskDeadlineInfo({ due_date: selected.due_date ?? null, meta: selected.meta }) : null;
  const ownKind = selected ? effectiveOutputKind(selected, actions) : 'signal';
  const completed = tasks.filter((t) => t.status === 'completed').length;

  return (
    <>
      {/* 머리글 — 기능명이 아니라 «어느 업무인가»(CLAUDE.md UI §1) */}
      <DialogHeader className={DIALOG_HEADER_CLASS}>
        <div className="flex items-start gap-3">
          <TitleIconChip icon={Route} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold text-slate-900" title={work?.name}>
              {work?.name ?? (isLoading ? '불러오는 중…' : '업무를 찾지 못했습니다')}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-[11px] text-slate-500">
              {work ? (
                <>
                  단계별 진행 · 할 일 {tasks.length}개 · 완료 {completed} · 단계 {stages.length}
                  {/* 휴대폰에서는 머리글이 두 줄이 되어 본문을 밀어낸다 — 안내 문장은 넓은 화면에서만 */}
                  <span className="hidden sm:inline"> — 앞 단계가 남긴 것을 받아 이 단계를 진행합니다</span>
                </>
              ) : '단계별 진행'}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-3 px-3 py-3 sm:px-5 sm:py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-2xl" />
          </>
        ) : error || !work ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">업무를 찾지 못했습니다.</p>
            <p className="mt-1 text-xs text-slate-500">{error ? (error as Error).message : '지워졌거나 볼 수 없는 업무입니다.'}</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100">
              <ListChecks className="h-8 w-8 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-slate-700">할 일이 없습니다.</p>
            <p className="mt-1 text-xs text-slate-500">업무 목록에서 할 일을 추가하면 여기서 단계별로 진행합니다.</p>
          </div>
        ) : (
          <>
            <PipelineStageBar stages={stages} unordered={unordered} selectedTaskId={selectedId} onSelect={select} />

            {/* ⚠️ 휴대폰에서도 열을 minmax(0,1fr) 로 못 박는다 — 암묵적 auto 트랙은 자식의 최소 내용 폭(안쪽 표의
                min-w-max)까지 늘어나 **화면 전체가 가로로 밀린다**(2026-09-27 스크린샷 검사에서 390px → 441px) */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
              {/* 지금 단계 작업 공간 */}
              {selected && (
                <div className="relative min-w-0 space-y-4 overflow-hidden rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
                  <div
                    className={cn(
                      'absolute inset-x-0 top-0 h-1',
                      selected.status === 'completed' ? 'bg-emerald-500'
                        : selected.status === 'cancelled' ? 'bg-slate-300'
                          : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400',
                    )}
                  />
                  <div className="flex flex-wrap items-start gap-2 pt-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-blue-700">
                        {isOneTimeTask(selected) || stageIdx < 0 ? '순서 없는 할 일' : `${stageNumber(stageIdx)} 단계`}
                      </p>
                      <h3 className="break-words text-base font-semibold text-slate-900">{selected.title}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 font-medium',
                            selected.status === 'completed' ? 'bg-emerald-50 text-emerald-700'
                              : selected.status === 'cancelled' ? 'bg-rose-50 text-rose-700'
                                : 'bg-blue-50 text-blue-700',
                          )}
                        >
                          {STATUS_LABEL[selected.status] ?? selected.status}
                        </span>
                        {deadline?.effective ? (
                          <span className="flex items-center gap-1">
                            <CalendarClock className="h-3.5 w-3.5" />
                            {deadline.isMulti ? `${deadline.total}회 · 다음 ` : ''}{deadline.effective.slice(5).replace('-', '/')}
                          </span>
                        ) : (
                          <span className="text-amber-600">마감일 없음</span>
                        )}
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDetailOpen(true)}>
                      <ExternalLink className="mr-1 h-3.5 w-3.5" /> 할 일 상세 · 완료
                    </Button>
                  </div>

                  {selected.description?.trim() && selected.description.trim() !== selected.title.trim() && (
                    <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                      {selected.description}
                    </p>
                  )}

                  {/* 작업 — 러너가 앞 단계 산출물을 «앞 단계» 맥락으로 받는다. 러너 모달은 이 모달 위에 겹쳐 뜬다 */}
                  <UpstreamContextsProvider value={upstreamContexts}>
                    <TaskActionPanel
                      taskId={selected.id}
                      taskTitle={selected.title}
                      workflowId={null}
                      defaultMode="use"
                      allowManage={false}
                      embedded
                    />
                  </UpstreamContextsProvider>
                  {selectedActions.length === 0 && (
                    <p className="text-[11px] text-slate-400">
                      연결된 작업이 없습니다. 작업(입력 받기·메시지·문서 작성…)은 할 일 편집 창의 [작업]에서 연결합니다.
                    </p>
                  )}

                  <TaskOutputSection
                    // 할 일마다 새로 — 초안·행 고르기·AI 표 정리 상태가 다른 할 일로 새지 않게
                    key={selected.id}
                    onDirtyChange={onDirtyChange}
                    workId={workId}
                    task={selected}
                    actions={actions}
                    resolved={current?.outputs ?? []}
                    manual={outputByTask.get(selected.id) ?? null}
                    canManage={canManage}
                    canWrite={canWrite}
                    upstream={upstream.flatMap((u) => u.outputs)}
                  />
                </div>
              )}

              <div className="min-w-0 space-y-4">
                <div className="rounded-2xl border bg-card p-3 shadow-sm">
                  {selected && (
                    <UpstreamPanel
                      // 할 일마다 새로 — 확인 상자·AI 결과가 형제 할 일로 새면 **보고 있지 않은 작업**을 바꾼다
                      key={selected.id}
                      isOneTime={isOneTimeTask(selected)}
                      workId={workId}
                      currentTaskId={selected.id}
                      upstream={upstream}
                      actions={selectedActions}
                      ownKind={ownKind}
                      canManage={canManage}
                      loading={upstreamLoading}
                      isFirstStage={!prevStage}
                    />
                  )}
                </div>
                <div className="rounded-2xl border bg-card p-3 shadow-sm">
                  <WorkCheckPanel
                    work={{ id: work.id, name: work.name, description: work.description, status: work.status }}
                    tasks={tasks}
                    actions={actions}
                    onSelectTask={select}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <DialogFooter className={DIALOG_FOOTER_CLASS}>
        <Button variant="ghost" onClick={onClose} className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}>
          <X className="h-3.5 w-3.5" />
          닫기
        </Button>
      </DialogFooter>

      {/* 할 일 상세 — 이 모달 위에 겹쳐 뜬다(바꿔치기 아님). 진행 화면으로 가는 링크는 자기 자신이라 끈다 */}
      <TaskDetailDialog task={selected} open={detailOpen} onOpenChange={setDetailOpen} showPipelineLink={false} />
    </>
  );
}
