import { createPortal } from 'react-dom';
import { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderKanban,
  Plus,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useReorderTasksJsonb, useUpdateTaskJsonb, useWorksJsonb } from '@/hooks/useTasksJsonb';
import { useCurrentUserResourceId } from '@/hooks/usePermissions';
import { planStepPlacement, type StepOrderTask, type StepPlacement } from '@/lib/taskOrder';
import { toast } from '@/lib/toast';
import { WorkDetailDialog } from './WorkDetailDialog';
import { WorkEditDialog } from './WorkEditDialog';
import { WorkCard } from './WorkCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskWorkflowEntityLinks } from '@/features/task-workflow/hooks/useTaskWorkflows';
import { useConnectedWorkTaskIds } from '@/features/task-workflow/hooks/useTaskActions';
import type { Task, Work } from '@/types/tasks';

interface WorkFilters {
  status: string;
  keyword: string;
  manager_id: string;
  department: string;
}

interface WorkListProps {
  toolbarContainer?: HTMLElement | null;
  limit?: number;
  filters?: WorkFilters;
  onCreateWork?: () => void;
  /** 할 일 제목 → 상세 모달. 없으면 업무 상세를 연다 */
  onTaskDetail?: (task: Task) => void;
  /** 할 일 [수정] → 편집 창(그 업무의 매니저에게만 보인다) */
  onTaskEdit?: (task: Task) => void;
}

interface WorkListItem extends Work {
  manager_id?: string;
  manager?: {
    id: string;
    name: string;
  } | null;
  total_assignees?: number;
  completed_assignees?: number;
}

function workMatchesKeyword(work: WorkListItem, keyword: string): boolean {
  const normalizedKeyword = keyword.toLocaleLowerCase('ko-KR').trim();
  if (!normalizedKeyword) return true;

  const searchableValues = [
    work.name,
    work.description,
    work.meta?.department,
    ...(work.keywords || []),
    ...(work.meta?.managers || []).map(manager => manager.name),
    ...(work.tasks || []).flatMap(task => [
      task.title,
      task.description,
      ...(task.meta?.assignees || []).map(assignee => assignee.name),
    ]),
  ];

  return searchableValues.some(value =>
    value?.toLocaleLowerCase('ko-KR').includes(normalizedKeyword)
  );
}

function getSortedWorks(works: WorkListItem[]): WorkListItem[] {
  return [...works].sort((first, second) => {
    return (
      new Date(second.updated_at || second.created_at).getTime() -
      new Date(first.updated_at || first.created_at).getTime()
    );
  });
}

export function WorkList({ limit, filters, onCreateWork, toolbarContainer, onTaskDetail, onTaskEdit }: WorkListProps) {
  const queryClient = useQueryClient();
  const { data: currentUserResourceId } = useCurrentUserResourceId();
  const updateTask = useUpdateTaskJsonb();
  const reorderTasks = useReorderTasksJsonb();
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [expandedWorks, setExpandedWorks] = useState<Set<string>>(new Set());

  const { data: works, isLoading } = useWorksJsonb({
    status: filters?.status === 'all' ? undefined : filters?.status,
    limit: limit || 50,
  });

  const filteredWorks = useMemo(() => {
    const matchingWorks = ((works || []) as WorkListItem[]).filter(work => {
      if (!filters) return true;

      if (!workMatchesKeyword(work, filters.keyword)) return false;

      if (
        filters.department !== 'all' &&
        work.meta?.department !== filters.department
      ) {
        return false;
      }

      if (filters.manager_id !== 'all') {
        const matchesLegacyManager = work.manager_id === filters.manager_id;
        const matchesManagerMetadata = work.meta?.managers?.some(
          manager => manager.id === filters.manager_id
        );
        if (!matchesLegacyManager && !matchesManagerMetadata) return false;
      }

      return true;
    });

    return getSortedWorks(matchingWorks);
  }, [works, filters]);

  const workflowWorkIds = useMemo(
    () => filteredWorks.map(work => work.id),
    [filteredWorks]
  );
  const workflowTaskIds = useMemo(
    () =>
      filteredWorks.flatMap(work =>
        (work.tasks || []).map(task => task.id)
      ),
    [filteredWorks]
  );
  const { data: workflowLinks = { works: {}, tasks: {} } } =
    useTaskWorkflowEntityLinks(workflowWorkIds, workflowTaskIds);
  const { data: workConnectedTaskIds } = useConnectedWorkTaskIds(workflowTaskIds);

  const hasActiveFilters = Boolean(
    filters &&
      (filters.status !== 'all' ||
        filters.keyword.trim() !== '' ||
        filters.manager_id !== 'all' ||
        filters.department !== 'all')
  );
  const handleWorkSelect = (work: Work) => {
    setSelectedWork(work);
    setDetailOpen(true);
  };

  const handleWorkEdit = (work: Work) => {
    setEditingWork(work);
    setEditOpen(true);
  };

  // 마감일 칸 — 내 업무 관리와 같은 동작(매니저만, 다중 마감은 표가 편집 창으로 보낸다)
  const handleDueDateChange = async (taskId: string, due: string | null) => {
    await updateTask.mutateAsync({ id: taskId, data: { due_date: due } as never });
    // useUpdateTaskJsonb 는 업무 목록(works-jsonb)을 무효화하지 않는다 — 이 탭은 그 목록을 그린다
    await queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
    toast.success(due ? `마감일을 ${due} 로 바꿨습니다` : '마감일을 지웠습니다');
  };

  // 순서 칸 — 옮기면 그 업무의 절차 번호를 1부터 다시 매긴다(계획 = taskOrder.ts)
  const handlePlacementChange = async (work: Work, taskId: string, target: StepPlacement) => {
    const changes = planStepPlacement((work.tasks || []) as StepOrderTask[], taskId, target);
    if (changes.length === 0) return;
    await reorderTasks.mutateAsync(changes);
  };

  const allExpanded = filteredWorks.length > 0 && filteredWorks.every(work => expandedWorks.has(work.id));
  const toggleAll = () =>
    setExpandedWorks(allExpanded ? new Set() : new Set(filteredWorks.map(work => work.id)));

  const toggleExpand = (workId: string) => {
    setExpandedWorks(previous => {
      const next = new Set(previous);
      if (next.has(workId)) next.delete(workId);
      else next.add(workId);
      return next;
    });
  };

  const toolbar = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {filteredWorks.length > 0 && (
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={toggleAll}>
          {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
          {allExpanded ? '모두 접기' : '모두 펼치기'}
        </Button>
      )}
      {onCreateWork && (
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 gap-1.5 bg-blue-600 px-3 text-xs text-white shadow-sm hover:bg-blue-700 sm:px-4 sm:text-sm"
          onClick={onCreateWork}
        >
          <Plus className="h-3.5 w-3.5" />
          새 업무
        </Button>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbarContainer ? createPortal(toolbar, toolbarContainer) : toolbarContainer === undefined ? toolbar : null}

      {filteredWorks.length > 0 ? (
        // 한 줄에 업무 하나 — 내 업무 관리와 같은 목록(2026-09-27). 2열 그리드는 펼친 할 일 표를 반쪽 폭에 가뒀다.
        <div className="space-y-3">
          {filteredWorks.map(work => (
            <WorkCard
              key={work.id}
              work={work}
              expanded={expandedWorks.has(work.id)}
              workflowLink={workflowLinks.works[work.id]}
              taskWorkflowLinks={workflowLinks.tasks}
              workConnectedTaskIds={workConnectedTaskIds}
              currentUserResourceId={currentUserResourceId}
              onSelect={handleWorkSelect}
              onViewDetail={handleWorkSelect}
              onToggle={() => toggleExpand(work.id)}
              onWorkEdit={handleWorkEdit}
              onTaskDetail={onTaskDetail}
              onTaskEdit={onTaskEdit}
              onDueDateChange={handleDueDateChange}
              onPlacementChange={handlePlacementChange}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 shadow-sm">
              {hasActiveFilters ? (
                <FolderKanban className="h-7 w-7" />
              ) : (
                <Calendar className="h-7 w-7" />
              )}
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              {hasActiveFilters ? '조건에 맞는 업무가 없습니다' : '첫 업무를 만들어보세요'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {hasActiveFilters
                ? '검색어 또는 필터 조건을 조정하면 다른 업무를 확인할 수 있습니다.'
                : '업무 안에 절차적 할 일과 일회성 할 일을 구성하고 진행 상황을 함께 관리할 수 있습니다.'}
            </p>
          </div>
        </div>
      )}

      <WorkDetailDialog
        work={selectedWork}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleWorkEdit}
      />

      <WorkEditDialog
        work={editingWork}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
