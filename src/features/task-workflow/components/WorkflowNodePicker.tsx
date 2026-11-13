import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarRange,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  Plus,
  Search,
  StickyNote,
  X,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SearchableMultiSelect,
  type SearchableMultiSelectItem,
} from '@/components/ui/searchable-multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Department } from '@/hooks/useDepartments';
import { cn } from '@/lib/utils';
import { useCreateWorkJsonb, useCreateTaskJsonb } from '@/hooks/useTasksJsonb';
import type { Work, Task } from '@/types/tasks';
import {
  WorkflowActionPickerPanel,
  type WorkflowActionPickerSource,
} from './WorkflowActionPickerPanel';
import type { TaskAction } from '../types';

type PickerMode = 'works' | 'tasks' | 'new' | 'actions';
type NewItemKind = 'event' | 'task' | 'note';

interface Manager {
  id: string;
  name: string;
}

interface WorkflowNodePickerProps {
  works: Work[];
  managers: Manager[];
  departments: Department[];
  defaultDepartmentId: string | null;
  onClose: () => void;
  onAddWork: (work: Work, tasks: Task[]) => void;
  onAddTask: (task: Task, work: Work) => void;
  onAddNote: (content: string, color: 'amber' | 'blue' | 'green' | 'violet') => void;
  /**
   * 할 일 노드의 + 를 끌어 놓았을 때만 채워진다 — 그때만 「작업」 탭이 뜬다(n8n 방식).
   * 다른 곳에서 연 선택기에는 작업 탭이 없다(어느 할 일에 붙일지 정해지지 않았다).
   */
  actionSource?: WorkflowActionPickerSource | null;
  onAddAction?: (action: TaskAction) => void;
}

export function WorkflowNodePicker({
  works,
  managers,
  departments,
  defaultDepartmentId,
  onClose,
  onAddWork,
  onAddTask,
  onAddNote,
  actionSource = null,
  onAddAction,
}: WorkflowNodePickerProps) {
  const [mode, setMode] = useState<PickerMode>(actionSource ? 'actions' : 'works');
  const [query, setQuery] = useState('');
  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [newKind, setNewKind] = useState<NewItemKind>('event');
  const [workName, setWorkName] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId ?? '');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskWorkId, setWorkId] = useState('');
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>([]);
  const [taskType, setTaskType] = useState<'procedural' | 'one_time'>('procedural');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteColor, setNoteColor] = useState<'amber' | 'blue' | 'green' | 'violet'>('amber');

  const createWork = useCreateWorkJsonb();
  const createTask = useCreateTaskJsonb();
  const queryClient = useQueryClient();
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const selectedDepartment = departments.find((department) => department.id === departmentId) ?? null;
  const managerItems = useMemo<SearchableMultiSelectItem[]>(
    () =>
      managers.map((manager) => ({
        value: manager.id,
        label: manager.name,
        description: '교직원',
      })),
    [managers]
  );
  const departmentWorks = useMemo(
    () =>
      selectedDepartment
        ? works.filter((work) => work.meta?.department === selectedDepartment.name)
        : [],
    [works, selectedDepartment]
  );

  const filteredWorks = useMemo(
    () =>
      departmentWorks.filter((work) => {
        if (!normalizedQuery) return true;
        return (
          work.name.toLocaleLowerCase('ko-KR').includes(normalizedQuery) ||
          (work.tasks ?? []).some((task) =>
            task.title.toLocaleLowerCase('ko-KR').includes(normalizedQuery)
          )
        );
      }),
    [departmentWorks, normalizedQuery]
  );

  const filteredTasks = useMemo(
    () =>
      departmentWorks.flatMap((work) =>
        (work.tasks ?? [])
          .filter((task) => {
            if (!normalizedQuery) return true;
            return `${task.title} ${work.name}`.toLocaleLowerCase('ko-KR').includes(normalizedQuery);
          })
          .map((task) => ({ task, work }))
      ),
    [departmentWorks, normalizedQuery]
  );

  const handleDepartmentChange = (value: string) => {
    setDepartmentId(value);
    setExpandedWorkId(null);
    setSelectedTaskIds(new Set());
    setWorkId('');
  };

  const toggleTask = (taskId: string) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleCreateWork = async () => {
    if (!workName.trim() || managerIds.length === 0 || !selectedDepartment) return;

    try {
      const selectedManagers = managerIds.flatMap((managerId) => {
        const manager = managers.find((item) => item.id === managerId);
        return manager ? [{ id: manager.id, name: manager.name }] : [];
      });
      const result = await createWork.mutateAsync({
        name: workName.trim(),
        description: workDescription.trim() || undefined,
        manager_id: managerIds[0],
        meta: {
          department: selectedDepartment.name,
          managers: selectedManagers,
        },
      });
      onAddWork({ ...result, tasks: [], progress_percentage: 0 } as Work, []);
      toast.success('새 업무를 만들고 흐름에 추가했습니다.');
    } catch (error) {
      console.error(error);
      toast.error('업무를 만들지 못했습니다.');
    }
  };

  const handleCreateTask = async () => {
    const parentWork = departmentWorks.find((work) => work.id === taskWorkId);
    if (
      !taskTitle.trim() ||
      !taskDescription.trim() ||
      taskAssigneeIds.length === 0 ||
      !selectedDepartment ||
      !parentWork
    ) {
      return;
    }

    try {
      const assignedAt = new Date().toISOString();
      const task = await createTask.mutateAsync({
        event_id: parentWork.id,
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        type: taskType,
        order_index:
          taskType === 'procedural'
            ? Math.max(
                -1,
                ...(parentWork.tasks ?? [])
                  .filter((task) => task.type === 'procedural')
                  .map((task) => task.order_index ?? 0)
              ) + 1
            : 0,
        due_date: taskDueDate || undefined,
        meta: {
          assignees: taskAssigneeIds.map((assigneeId) => ({
            id: assigneeId,
            name: managers.find((manager) => manager.id === assigneeId)?.name,
            status: 'pending' as const,
            assigned_at: assignedAt,
          })),
        },
      });
      onAddTask(task as Task, parentWork);
      void queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
      toast.success('새 할 일을 만들고 흐름에 추가했습니다.');
    } catch (error) {
      console.error(error);
      toast.error('할 일을 만들지 못했습니다.');
    }
  };

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    onAddNote(noteContent.trim(), noteColor);
  };

  return (
    <div className="absolute inset-y-3 left-3 z-30 flex w-[360px] max-w-[calc(100%_-_1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">노드 추가</h2>
          <p className="text-[11px] text-slate-400">기존 할 일을 가져오거나 새로 만드세요</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className={cn('grid gap-1 border-b border-slate-100 bg-slate-50/60 p-2', actionSource ? 'grid-cols-4' : 'grid-cols-3')}>
        {([
          ...(actionSource ? ([['actions', '작업']] as const) : []),
          ['works', '업무'],
          ['tasks', '할 일'],
          ['new', '새로 만들기'],
        ] as Array<readonly [PickerMode, string]>).map(([value, label]) => (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 rounded-lg text-xs',
              mode === value ? 'bg-white font-semibold text-blue-600 shadow-sm' : 'text-slate-500'
            )}
            onClick={() => setMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {mode !== 'actions' && (mode !== 'new' || newKind !== 'note') && (
        <div className="border-b border-slate-100 px-3 py-2.5">
          <Label className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-600">
            <Building2 className="h-3.5 w-3.5" />
            부서
          </Label>
          <Select value={departmentId} onValueChange={handleDepartmentChange}>
            <SelectTrigger className="h-9 rounded-xl">
              <SelectValue placeholder="부서를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {mode !== 'new' && mode !== 'actions' && (
        <div className="border-b border-slate-100 p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={mode === 'works' ? '업무 또는 포함 할 일 검색' : '할 일 검색'}
              className="h-9 rounded-xl border-slate-200 pl-9 text-sm"
              autoFocus
            />
          </div>
        </div>
      )}

      {mode === 'actions' && actionSource && onAddAction && (
        <WorkflowActionPickerPanel source={actionSource} onAddAction={onAddAction} />
      )}

      {mode !== 'actions' && (
      <ScrollArea className="min-h-0 flex-1">
        {mode === 'works' && (
          <div className="space-y-2 p-3">
            {filteredWorks.map((work) => {
              const expanded = expandedWorkId === work.id;
              const selectedTasks = (work.tasks ?? []).filter((task) => selectedTaskIds.has(task.id));
              return (
                <div key={work.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-3 text-left hover:bg-slate-50"
                    onClick={() => setExpandedWorkId(expanded ? null : work.id)}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                      <CalendarRange className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-700">{work.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        포함 할 일 {(work.tasks ?? []).length}개
                      </span>
                    </span>
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {expanded && (
                    <div className="border-t border-slate-100 bg-slate-50/60 p-2">
                      {(work.tasks ?? []).length > 0 ? (
                        <div className="mb-2 max-h-52 space-y-1 overflow-y-auto">
                          {(work.tasks ?? []).map((task) => (
                            <label
                              key={task.id}
                              className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white"
                            >
                              <Checkbox
                                checked={selectedTaskIds.has(task.id)}
                                onCheckedChange={() => toggleTask(task.id)}
                                className="mt-0.5"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-slate-600">
                                  {task.title}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {task.type === 'one_time' ? '일회성' : '절차적'}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="mb-2 px-2 py-3 text-center text-xs text-slate-400">포함 할 일 없음</p>
                      )}
                      <Button
                        size="sm"
                        className="h-8 w-full rounded-lg bg-indigo-600 text-xs hover:bg-indigo-700"
                        onClick={() => onAddWork(work, selectedTasks)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        업무{selectedTasks.length > 0 ? ` + 선택 할 일 ${selectedTasks.length}개` : '만'} 추가
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredWorks.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-400">
                {selectedDepartment ? '검색된 업무가 없습니다' : '부서를 선택해주세요'}
              </p>
            )}
          </div>
        )}

        {mode === 'tasks' && (
          <div className="space-y-1.5 p-3">
            {filteredTasks.map(({ task, work }) => (
              <button
                key={task.id}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-sky-300 hover:bg-sky-50/40"
                onClick={() => onAddTask(task, work)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-700">{task.title}</span>
                  <span className="block truncate text-[11px] text-slate-400">{work.name}</span>
                </span>
                <Plus className="h-4 w-4 text-slate-400" />
              </button>
            ))}
            {filteredTasks.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-400">
                {selectedDepartment ? '검색된 할 일이 없습니다' : '부서를 선택해주세요'}
              </p>
            )}
          </div>
        )}

        {mode === 'new' && (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {([
                ['event', CalendarRange, '업무'],
                ['task', CalendarDays, '할 일'],
                ['note', StickyNote, '메모'],
              ] as const).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setNewKind(value)}
                  className={cn(
                    'flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-medium',
                    newKind === value ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {newKind === 'event' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="workflow-work-name">업무명</Label>
                  <Input
                    id="workflow-work-name"
                    value={workName}
                    onChange={(event) => setWorkName(event.target.value)}
                    placeholder="예: 2학기 교육과정 설명회"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="workflow-event-description">설명</Label>
                  <Textarea
                    id="workflow-event-description"
                    value={workDescription}
                    onChange={(event) => setWorkDescription(event.target.value)}
                    placeholder="업무의 목적이나 범위"
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>책임자 (여러 명 선택 가능)</Label>
                  <SearchableMultiSelect
                    items={managerItems}
                    selectedValues={managerIds}
                    onSelectionChange={setManagerIds}
                    placeholder="책임자를 검색하거나 선택하세요"
                    searchPlaceholder="담당자 이름 검색"
                    emptyText="검색된 담당자가 없습니다"
                    maxSelectedDisplay={2}
                  />
                </div>
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={
                    !workName.trim() ||
                    !selectedDepartment ||
                    managerIds.length === 0 ||
                    createWork.isPending
                  }
                  onClick={() => void handleCreateWork()}
                >
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  {createWork.isPending ? '생성 중...' : '업무 생성 후 추가'}
                </Button>
              </div>
            )}

            {newKind === 'task' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>소속 업무</Label>
                  <Select value={taskWorkId} onValueChange={setWorkId}>
                    <SelectTrigger><SelectValue placeholder="업무 선택" /></SelectTrigger>
                    <SelectContent>
                      {departmentWorks.map((work) => (
                        <SelectItem key={work.id} value={work.id}>{work.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="workflow-task-title">할 일명</Label>
                  <Input
                    id="workflow-task-title"
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    placeholder="예: 가정통신문 초안 작성"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="workflow-task-description">설명</Label>
                  <Textarea
                    id="workflow-task-description"
                    value={taskDescription}
                    onChange={(event) => setTaskDescription(event.target.value)}
                    placeholder="할 일의 목적과 완료 기준을 입력하세요"
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>담당자 (여러 명 선택 가능)</Label>
                  <SearchableMultiSelect
                    items={managerItems}
                    selectedValues={taskAssigneeIds}
                    onSelectionChange={setTaskAssigneeIds}
                    placeholder="담당자를 검색하거나 선택하세요"
                    searchPlaceholder="담당자 이름 검색"
                    emptyText="검색된 담당자가 없습니다"
                    maxSelectedDisplay={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>할 일 유형</Label>
                    <Select
                      value={taskType}
                      onValueChange={(value: 'procedural' | 'one_time') => setTaskType(value)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="procedural">절차적</SelectItem>
                        <SelectItem value="one_time">일회성</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="workflow-task-date">마감일</Label>
                    <Input
                      id="workflow-task-date"
                      type="date"
                      value={taskDueDate}
                      onChange={(event) => setTaskDueDate(event.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full bg-sky-600 hover:bg-sky-700"
                  disabled={
                    !taskTitle.trim() ||
                    !taskDescription.trim() ||
                    !selectedDepartment ||
                    !taskWorkId ||
                    taskAssigneeIds.length === 0 ||
                    createTask.isPending
                  }
                  onClick={() => void handleCreateTask()}
                >
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  {createTask.isPending ? '생성 중...' : '할 일 생성 후 추가'}
                </Button>
              </div>
            )}

            {newKind === 'note' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="workflow-note">흐름 메모</Label>
                  <Textarea
                    id="workflow-note"
                    value={noteContent}
                    onChange={(event) => setNoteContent(event.target.value)}
                    placeholder="이 단계의 목적, 주의사항, 의사결정 기준을 적으세요."
                    rows={6}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {(['amber', 'blue', 'green', 'violet'] as const).map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNoteColor(color)}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border-2',
                        color === 'amber' && 'bg-amber-200',
                        color === 'blue' && 'bg-blue-200',
                        color === 'green' && 'bg-emerald-200',
                        color === 'violet' && 'bg-violet-200',
                        noteColor === color ? 'border-slate-600' : 'border-white'
                      )}
                    >
                      {noteColor === color && <Check className="h-3.5 w-3.5 text-slate-700" />}
                    </button>
                  ))}
                </div>
                <Button
                  className="w-full bg-amber-500 text-white hover:bg-amber-600"
                  disabled={!noteContent.trim()}
                  onClick={handleAddNote}
                >
                  <StickyNote className="mr-2 h-4 w-4" />메모 추가
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      )}
    </div>
  );
}
