import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Building2, Clock3, Loader2, Network, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { Department } from '@/hooks/useDepartments';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import type { Work } from '@/types/tasks';
import {
  useCreateTaskWorkflow,
  useDeleteTaskWorkflow,
  useTaskWorkflowGraph,
  useTaskWorkflows,
  useUpdateTaskWorkflow,
} from '../hooks/useTaskWorkflows';
import type { TaskWorkflow } from '../types';
import { WorkflowCanvas } from './WorkflowCanvas';

interface Manager {
  id: string;
  name: string;
}

interface TaskWorkflowTabProps {
  works: Work[];
  managers: Manager[];
  departments: Department[];
  selectedDepartmentId: string | null;
  requestedWorkflowId?: string | null;
  onDepartmentChange: (departmentId: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenWork: (actionId: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function TaskWorkflowTab({
  works,
  managers,
  departments,
  selectedDepartmentId,
  requestedWorkflowId = null,
  onDepartmentChange,
  onDirtyChange,
  onOpenWork,
  onOpenTask,
}: TaskWorkflowTabProps) {
  const { data: workflows = [], isLoading, isError, refetch } = useTaskWorkflows(selectedDepartmentId);
  // 전체 교사 읽기 공유(2026-07-26): 수정·삭제는 생성자 또는 admin만
  const { user, isAdmin } = useAuth();
  const canEditWorkflow = useCallback(
    (workflow: TaskWorkflow) => Boolean(user && (workflow.owner_id === user.id || isAdmin)),
    [user, isAdmin],
  );
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    requestedWorkflowId
  );
  const handledRequestedWorkflowId = useRef<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDepartmentId, setNewWorkflowDepartmentId] = useState('none');
  const [editingWorkflow, setEditingWorkflow] = useState<TaskWorkflow | null>(null);
  const [editWorkflowName, setEditWorkflowName] = useState('');
  const [editWorkflowDepartmentId, setEditWorkflowDepartmentId] = useState('none');
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const createWorkflow = useCreateTaskWorkflow();
  const updateWorkflow = useUpdateTaskWorkflow();
  const deleteWorkflow = useDeleteTaskWorkflow();
  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null;
  const graphQuery = useTaskWorkflowGraph(selectedWorkflowId);
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name])
  );

  const setDirtyState = useCallback((dirty: boolean) => {
    setHasUnsavedChanges(dirty);
    onDirtyChange?.(dirty);
  }, [onDirtyChange]);

  useEffect(() => {
    if (workflows.length === 0) {
      setSelectedWorkflowId(null);
      return;
    }

    if (
      requestedWorkflowId &&
      handledRequestedWorkflowId.current !== requestedWorkflowId &&
      workflows.some(workflow => workflow.id === requestedWorkflowId)
    ) {
      handledRequestedWorkflowId.current = requestedWorkflowId;
      setSelectedWorkflowId(requestedWorkflowId);
      return;
    }

    if (!selectedWorkflowId || !workflows.some((workflow) => workflow.id === selectedWorkflowId)) {
      setSelectedWorkflowId(workflows[0].id);
    }
  }, [requestedWorkflowId, selectedWorkflowId, workflows]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [hasUnsavedChanges]);

  // 앱 안 링크로 떠날 때도 묻는다 (2026-10-05 — 탭이 페이지가 되면서 사이드바 서랍이 곧 «탭 전환»이 됐다).
  // BrowserRouter 라 useBlocker 가 없다 → 문서 캡처 단계에서 내부 링크 클릭을 먼저 받는다. React 의 위임
  // 리스너(루트)보다 앞이라, 취소하면 preventDefault + stopPropagation 으로 <Link> 의 이동까지 막힌다.
  // 뒤로가기(popstate)는 막지 못한다 — 그때는 beforeunload 도 뜨지 않으므로 알려진 한계다.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (!window.confirm('저장하지 않은 업무 흐름 변경사항이 있습니다. 이 페이지를 떠날까요?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', guardLink, true);
    return () => document.removeEventListener('click', guardLink, true);
  }, [hasUnsavedChanges]);

  const selectWorkflow = (workflowId: string) => {
    if (workflowId === selectedWorkflowId) return;
    if (hasUnsavedChanges && !window.confirm('저장하지 않은 변경사항이 있습니다. 다른 흐름으로 이동할까요?')) {
      return;
    }
    setDirtyState(false);
    setSelectedWorkflowId(workflowId);
  };

  const openCreateDialog = () => {
    setNewWorkflowDepartmentId(selectedDepartmentId ?? 'none');
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!newWorkflowName.trim()) return;
    if (
      hasUnsavedChanges &&
      !window.confirm('저장하지 않은 변경사항이 있습니다. 새 흐름으로 이동할까요?')
    ) {
      return;
    }

    try {
      const workflow = await createWorkflow.mutateAsync({
        name: newWorkflowName,
        departmentId:
          newWorkflowDepartmentId === 'none' ? null : newWorkflowDepartmentId,
      });
      if (selectedDepartmentId && workflow.department_id !== selectedDepartmentId) {
        onDepartmentChange(workflow.department_id);
      }
      setDirtyState(false);
      setSelectedWorkflowId(workflow.id);
      setNewWorkflowName('');
      setCreateOpen(false);
      toast.success('새 업무 흐름을 만들었습니다.');
    } catch (error) {
      console.error(error);
      toast.error('업무 흐름을 만들지 못했습니다.');
    }
  };

  const openEditDialog = (workflow: TaskWorkflow) => {
    if (hasUnsavedChanges) {
      toast.info('캔버스의 변경사항을 먼저 저장한 뒤 업무 흐름 정보를 수정하세요.');
      return;
    }
    setEditingWorkflow(workflow);
    setEditWorkflowName(workflow.name);
    setEditWorkflowDepartmentId(workflow.department_id ?? 'none');
  };

  const handleUpdate = async () => {
    if (!editingWorkflow || !editWorkflowName.trim()) return;

    try {
      const workflow = await updateWorkflow.mutateAsync({
        workflowId: editingWorkflow.id,
        name: editWorkflowName,
        departmentId:
          editWorkflowDepartmentId === 'none' ? null : editWorkflowDepartmentId,
        previousDepartmentId: editingWorkflow.department_id,
      });
      setSelectedWorkflowId(workflow.id);
      if (selectedDepartmentId && workflow.department_id !== selectedDepartmentId) {
        onDepartmentChange(workflow.department_id);
      }
      setEditingWorkflow(null);
    } catch (error) {
      console.error(error);
      toast.error('업무 흐름 정보를 수정하지 못했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!deleteWorkflowId) return;
    const isDeletingSelectedWorkflow = selectedWorkflowId === deleteWorkflowId;
    try {
      await deleteWorkflow.mutateAsync(deleteWorkflowId);
      if (isDeletingSelectedWorkflow) {
        setSelectedWorkflowId(null);
        setDirtyState(false);
      }
      setDeleteWorkflowId(null);
    } catch (error) {
      console.error(error);
      // 권한 부족 등 서버가 알려주는 사유를 그대로 보여준다(그냥 실패로 뭉개지 않음)
      toast.error(error instanceof Error ? error.message : '업무 흐름을 삭제하지 못했습니다.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex gap-4">
        <Skeleton className="h-[736px] w-60 rounded-2xl" />
        <Skeleton className="h-[736px] flex-1 rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50/40 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="mt-2 text-sm font-medium text-slate-700">업무 흐름 목록을 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row">
        <aside className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-[736px] lg:w-60">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Workflow className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-800">업무 흐름</h2>
                <p className="text-[10px] text-slate-400">업무 흐름 {workflows.length}개</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-blue-600 hover:bg-blue-50"
              onClick={openCreateDialog}
              aria-label="새 업무 흐름"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="max-h-52 flex-1 lg:max-h-none">
            <div className="flex gap-2 p-2 lg:flex-col">
              {workflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className={cn(
                    'group relative min-w-48 rounded-xl border transition-colors lg:min-w-0',
                    selectedWorkflowId === workflow.id
                      ? 'border-blue-200 bg-blue-50/80'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  )}
                >
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 pr-16 text-left"
                    onClick={() => selectWorkflow(workflow.id)}
                  >
                    <span className="block truncate text-sm font-semibold text-slate-700">{workflow.name}</span>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                      {workflow.department_id ? (
                        <>
                          <Building2 className="h-3 w-3" />
                          <span className="truncate">
                            {departmentNames.get(workflow.department_id) ?? '알 수 없는 부서'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock3 className="h-3 w-3" />
                          {new Date(workflow.updated_at).toLocaleDateString('ko-KR')}
                        </>
                      )}
                      {user && workflow.owner_id !== user.id && (
                        <span className="ml-auto shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-500">
                          {workflow.owner_name ?? '다른 교사'}
                        </span>
                      )}
                    </span>
                  </button>
                  {canEditWorkflow(workflow) && (
                    <div
                      className={cn(
                        'absolute right-1.5 top-1.5 flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
                        selectedWorkflowId === workflow.id && 'opacity-100'
                      )}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full text-slate-400 hover:bg-blue-100 hover:text-blue-600"
                        onClick={() => openEditDialog(workflow)}
                        aria-label={`${workflow.name} 수정`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full text-slate-300 hover:bg-red-50 hover:text-red-500"
                        onClick={() => setDeleteWorkflowId(workflow.id)}
                        aria-label={`${workflow.name} 삭제`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="hidden border-t border-slate-100 p-3 text-[10px] leading-4 text-slate-400 lg:block">
            노드 오른쪽의 +를 끌어 연결하거나 빈 작업대를 우클릭해 다음 노드를 추가하세요.
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {workflows.length === 0 ? (
            <div className="flex h-[736px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-gradient-to-br from-white to-blue-50/40 px-6 text-center">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-blue-600 shadow-lg ring-1 ring-slate-100">
                <Network className="h-9 w-9" />
                <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
                  <Plus className="h-4 w-4" />
                </span>
              </div>
              <h2 className="mt-5 text-xl font-bold text-slate-800">할 일의 연결을 그려보세요</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                업무와 할 일을 자유롭게 배치하고 선후 관계, 의존성, 인계 흐름을 연결해 학교 할 일의 전체 구조를 파악할 수 있습니다.
              </p>
              <Button className="mt-5 bg-blue-600 hover:bg-blue-700" onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />첫 업무 흐름 만들기
              </Button>
            </div>
          ) : selectedWorkflow && graphQuery.data ? (
            <WorkflowCanvas
              key={selectedWorkflow.id}
              workflow={selectedWorkflow}
              graph={graphQuery.data}
              works={works}
              managers={managers}
              departments={departments}
              readOnly={!canEditWorkflow(selectedWorkflow)}
              onDirtyChange={setDirtyState}
              onOpenWork={onOpenWork}
              onOpenTask={onOpenTask}
              onCopied={(newWorkflowId) => {
                setDirtyState(false);
                setSelectedWorkflowId(newWorkflowId);
              }}
            />
          ) : graphQuery.isError ? (
            <div className="flex h-[736px] flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50/40 text-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="mt-2 text-sm text-slate-600">업무 흐름 내용을 불러오지 못했습니다.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void graphQuery.refetch()}>
                다시 시도
              </Button>
            </div>
          ) : (
            <div className="flex h-[736px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          )}
        </main>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 업무 흐름</DialogTitle>
            <DialogDescription>파악하려는 업무 흐름의 이름과 관련 부서를 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newWorkflowName}
              onChange={(event) => setNewWorkflowName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreate();
              }}
              placeholder="예: 신학기 준비 업무 흐름"
              autoFocus
            />
            <Select value={newWorkflowDepartmentId} onValueChange={setNewWorkflowDepartmentId}>
              <SelectTrigger>
                <div className="flex min-w-0 items-center">
                  <Building2 className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                  <SelectValue placeholder="관련 부서 선택" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">부서 미지정</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!newWorkflowName.trim() || createWorkflow.isPending}
              onClick={() => void handleCreate()}
            >
              {createWorkflow.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              만들기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingWorkflow)}
        onOpenChange={(open) => {
          if (!open && !updateWorkflow.isPending) setEditingWorkflow(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>업무 흐름 수정</DialogTitle>
            <DialogDescription>업무 흐름의 이름과 관련 부서를 변경합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editWorkflowName}
              onChange={(event) => setEditWorkflowName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleUpdate();
              }}
              placeholder="업무 흐름 이름"
              autoFocus
            />
            <Select value={editWorkflowDepartmentId} onValueChange={setEditWorkflowDepartmentId}>
              <SelectTrigger>
                <div className="flex min-w-0 items-center">
                  <Building2 className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                  <SelectValue placeholder="관련 부서 선택" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">부서 미지정</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={updateWorkflow.isPending}
              onClick={() => setEditingWorkflow(null)}
            >
              취소
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!editWorkflowName.trim() || updateWorkflow.isPending}
              onClick={() => void handleUpdate()}
            >
              {updateWorkflow.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteWorkflowId)} onOpenChange={(open) => !open && setDeleteWorkflowId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 흐름을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              캔버스의 노드와 연결 정보가 모두 삭제됩니다. 원본 업무와 할 일은 삭제되지 않으며,
              작업의 실행·검수 이력도 보존됩니다(이 업무 흐름과의 연결만 끊깁니다).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void handleDelete()}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
