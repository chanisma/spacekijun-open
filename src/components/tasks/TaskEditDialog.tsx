// ========================================
// Task Edit Dialog Component
// 개별 할 일 생성/수정 폼
// ========================================

import { nextStepOrder, parseStepOrderInput } from '@/lib/taskOrder';
import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { PickerContent, PickerRoot, PickerTrigger } from '@/components/ui/responsive-picker';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  SearchableMultiSelect,
  SearchableMultiSelectItem,
} from '@/components/ui/searchable-multi-select';
import { CombinedFileUpload } from '@/components/ui/combined-file-upload';
import { EnhancedFileList } from '@/components/ui/file-list';
import { FileDeletionPreview } from '@/components/ui/file-deletion-preview';
import { useFileManagement } from '@/hooks/useFileManagement';
import type { Task, TaskFile } from '@/types/tasks';
import type { GoogleDriveFileInfo } from '@/components/ui/google-drive/GoogleDrivePicker';
import { useResources } from '@/hooks/useTasks';
import { useCreateTaskJsonb, useUpdateTaskJsonb } from '@/hooks/useTasksJsonb';
import { TaskActionsSection } from './TaskActionsSection';
import { TaskActionRunnerDialog } from '@/features/task-workflow/components/TaskActionPanel';
import { getTaskActionDefinition } from '@/features/task-workflow/actionRegistry';
import { listTaskActions } from '@/features/task-workflow/services/taskActionService';
import type { TaskAction } from '@/features/task-workflow/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { taskActionKeys, useTaskActions } from '@/features/task-workflow/hooks/useTaskActions';
import { applyTaskActionPlan } from '@/features/task-workflow/services/taskActionService';
import {
  EMPTY_ACTION_DRAFT,
  isDraftEmpty,
  planActionDraft,
  type ActionDraft,
} from '@/features/task-workflow/utils/taskActionDraft';
import {
  readActionFlow,
  resolveFlowKeys,
} from '@/features/task-workflow/utils/actionFlow';
import { setTaskActionFlow } from '@/features/task-workflow/services/taskActionService';
import {
  buildDeadlinePayload, deriveAssigneesFromProgress, getDeadlineProgress,
  getTaskDeadlines, normalizeDeadlines, pruneDeadlineProgress,
} from '@/lib/taskDeadlines';
import {
  buildUnitProgressFromRows, buildUnitsPayload, deriveAssigneesFromUnits,
  getTaskUnits, getUnitProgress, unitHolderIds,
} from '@/lib/taskUnits';
import { TaskUnitEditor, type UnitRow } from './TaskUnitEditor';
import { TaskFileService } from '@/services/taskFileService';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  TitleIconChip,
} from './dialogDesign';
import { useToast } from '@/hooks/use-toast';
import {
  getTaskStatusLabel,
  getTaskTypeLabel,
  extractAssigneeIds,
} from '@/lib/taskUtils';
import {
  Edit,
  Plus,
  Save,
  X,
  Calendar,
  User,
  ListTodo,
  File,
  Copy,
  Eye,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Search,
  Tag,
  Settings,
  EyeOff,
} from 'lucide-react';
import { taskVisibleFrom, visibleFromError } from '@/lib/taskVisibility';

interface TaskEditDialogProps {
  workId: string;
  task?: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** 저장 완료 시 저장된 할 일의 id·제목 전달 (공지사항 링크 삽입 등 외부 연동용) */
  onSaved?: (taskId: string, title: string) => void;
}

interface TaskFormData {
  title: string;
  description: string;
  type: 'procedural' | 'one_time';
  order_index: number;
  assigned_to: string[]; // Keep as string array for form simplicity, convert to JSONB on submit
  due_date: string;
  /** 추가 마감 일정(반복 할 일) — due_date와 합쳐 meta.deadlines로 저장, due_date 컬럼은 다음 마감으로 동기화 */
  extraDeadlines: string[];
  /**
   * 담당자에게 보이는 날('YYYY-MM-DD', '' = 바로) — 업무의 「대기」를 대신한다(2026-10-05, 할 일 단위).
   * 판정 단일 출처 = src/lib/taskVisibility.ts, 서버 get_my_tasks_jsonb 가 같은 규칙으로 거른다.
   */
  visibleFrom: string;
  keywords: string[];
  status: 'pending' | 'completed' | 'cancelled';
}

export function TaskEditDialog({
  workId,
  task,
  open,
  onOpenChange,
  onSuccess,
  onSaved
}: TaskEditDialogProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    type: 'procedural',
    order_index: 1,
    assigned_to: [],
    due_date: '',
    extraDeadlines: [],
    visibleFrom: '',
    keywords: [],
    status: 'pending'
  });

  const [keywordInput, setKeywordInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * 저장 직후 이어서 여는 작업 설정 화면 (2026-10-05) — 종전엔 [생성]이 창을 닫아, 방금 붙인 작업을 설정하려면
   * 할 일을 다시 찾아 [수정] → [열기]로 들어가야 했다(입력 받기 하나에 모달 4~5겹). 이제 편집 창을 **닫지 않고**
   * 그 위에 설정 화면을 겹쳐 띄우고, 설정 화면을 닫으면 편집 창도 함께 닫는다(겹쳐 띄우기 — 모달 규약).
   * 편집 창을 닫았다 여는 방식은 쓰지 않는다: 할 일 상세·공지 링크 고르기는 편집 창을 닫으면 언마운트해
   * 이어 열 화면까지 사라진다.
   */
  const [followUp, setFollowUp] = useState<{ action: TaskAction; taskId: string; title: string } | null>(null);
  // 신규 할 일 저장 후 양식 연결만 실패한 경우, 재시도에서 할 일을 중복 생성하지 않는다.
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  useEffect(() => { setCreatedTaskId(null); }, [open, task?.id, workId]);

  // 과제 단위 모드(2026-08-12): 담당자를 "인물"이 아니라 "과제 명칭" 단위로 배분.
  // formData와 분리해 기존 리셋 경로를 건드리지 않는다(로드/리셋은 아래 effect에서 함께).
  const [unitMode, setUnitMode] = useState(false);
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);

  // 복사 기능 관련 state
  const [showCopySection, setShowCopySection] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [previewingTask, setPreviewingTask] = useState<string>('');
  const [copyAssignees, setCopyAssignees] = useState<string[]>([]);
  const [existingTasks, setExistingTasks] = useState<Task[]>([]);
  const [previewTask, setPreviewTask] = useState<Task | null>(null);
  // 복사할 할 일 검색(콤보박스) — WorkCreateDialog의 업무 검색과 동일한 패턴
  const [taskComboboxOpen, setTaskComboboxOpen] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');

  // 복사 시 변경할 필드들
  const [copyTaskType, setCopyTaskType] = useState<'procedural' | 'one_time' | 'keep_original'>('keep_original');
  const [copyOrderIndex, setCopyOrderIndex] = useState<number | 'keep_original' | 'auto'>('auto');
  const [copyDueDate, setCopyDueDate] = useState<string | 'keep_original' | 'clear'>('keep_original');
  const [copySelectedFiles, setCopySelectedFiles] = useState<string[]>([]);
  const [previewTaskFiles, setPreviewTaskFiles] = useState<TaskFile[]>([]);

  // 현재 업무 키워드 정보
  const [currentWorkKeywords, setCurrentWorkKeywords] = useState<string[]>([]);

  // Copied files for task copy feature
  const [copiedLocalFiles, setCopiedLocalFiles] = useState<File[]>([]);
  const [copiedGoogleFiles, setCopiedGoogleFiles] = useState<GoogleDriveFileInfo[]>([]);

  const { toast } = useToast();

  // File management using shared hook
  const fileManagement = useFileManagement({
    entityId: task?.id || null,
    entityType: 'task',
    onError: (message) =>
      toast({ title: '파일 오류', description: message, variant: 'destructive' }),
  });
  const queryClient = useQueryClient();

  const createTaskJsonbMutation = useCreateTaskJsonb();
  const updateTaskJsonbMutation = useUpdateTaskJsonb();
  const { data: resources } = useResources(); // 모든 리소스 가져오기

  const isEditing = !!task;
  const { user: authUser } = useAuth();
  // 작업(Action) 초안 — [저장] 때 한꺼번에 반영(utils/taskActionDraft.ts)
  const [actionDraft, setActionDraft] = useState<ActionDraft>(EMPTY_ACTION_DRAFT);
  const { data: existingActions = [] } = useTaskActions(task?.id ?? null);
  // 작업 순서(권장 순서) — 사용자가 화살표를 눌렀을 때만 저장한다(안 누르면 기존 순서 유지,
  // 새 작업은 뒤에 붙는다)
  const [actionOrder, setActionOrder] = useState<string[]>([]);
  const [actionOrderTouched, setActionOrderTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setActionDraft(EMPTY_ACTION_DRAFT);
    setActionOrder(readActionFlow(task?.meta));
    setActionOrderTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  // Resources를 SearchableMultiSelectItem 형태로 변환
  const resourceItems: SearchableMultiSelectItem[] = React.useMemo(() => {
    return resources?.map(resource => ({
      value: resource.id,
      label: resource.name,
      description: resource.type
    })) || [];
  }, [resources]);

  // 현재 업무 키워드 로드
  useEffect(() => {
    const loadCurrentWorkKeywords = async () => {
      if (!workId || !open) return;

      try {
        const { data: work, error } = await supabase
          .from('work' as any)
          .select('keywords')
          .eq('id', workId)
          .single() as any;

        if (!error && work) {
          setCurrentWorkKeywords((work as any).keywords || []);
        }
      } catch (error) {
        console.error('현재 업무 키워드 로드 실패:', error);
      }
    };

    loadCurrentWorkKeywords();
  }, [workId, open]);

  // Load existing files when editing
  useEffect(() => {
    if (task?.id && open) {
      fileManagement.loadExistingFiles();
    }
  }, [task?.id, open]);

  // 모든 할 일들 로드 (복사 기능용)
  useEffect(() => {
    const loadAllTasks = async () => {
      console.log('🔍 TaskEditDialog 복사 기능 상태 확인:', {
        open,
        isEditing,
        shouldLoad: !open || isEditing ? 'No' : 'Yes'
      });

      if (!open || isEditing) return; // 새 할 일 추가일 때만 로드

      try {
        const { data: tasks, error } = await supabase
          .from('task' as any)
          .select(`
            id,
            title,
            description,
            type,
            status,
            order_index,
            due_date,
            keywords,
            meta,
            assigned_to,
            created_at,
            event_id,
            work:work(name, keywords)
          `)
          .order('created_at', { ascending: false })
          .limit(100) as any; // 성능을 위해 최근 100개로 제한

        if (error) {
          console.error('모든 할 일 로드 실패:', error);
          return;
        }

        console.log('✅ 모든 할 일 로드 완료:', {
          tasksCount: tasks?.length || 0,
          tasks: tasks?.map((t: any) => ({ id: t.id, title: t.title, workName: t.work?.name })) || []
        });

        setExistingTasks(tasks || [] as any);
      } catch (error) {
        console.error('모든 할 일 로드 중 오류:', error);
      }
    };

    loadAllTasks();
  }, [open, isEditing]);


  useEffect(() => {
    if (task && open) {
      // Use shared utility for extracting assignee IDs
      const assigneeIds = extractAssigneeIds(task);

      // 다중 마감이면 첫 회차를 기본 입력에, 나머지를 추가 행으로 복원
      const savedDeadlines = getTaskDeadlines(task);
      setFormData({
        title: task.title,
        description: task.description || '',
        type: task.type,
        order_index: task.order_index,
        assigned_to: assigneeIds,
        due_date: savedDeadlines[0] ?? (task.due_date ? task.due_date.split('T')[0] : ''),
        extraDeadlines: savedDeadlines.slice(1),
        visibleFrom: taskVisibleFrom(task) ?? '',
        keywords: task.keywords || [],
        status: task.status,
      });

      // 과제 단위 복원 — 단위별 담당자(배정/자기 선택 모두)는 unitProgress에서 재구성
      const savedUnits = getTaskUnits(task);
      const savedUnitProgress = getUnitProgress(task);
      setUnitMode(savedUnits.length > 0);
      setUnitRows(
        savedUnits.map(unit => ({
          key: unit.key,
          label: unit.label,
          assigneeIds: unitHolderIds(savedUnitProgress, unit.key),
        }))
      );

      // Reset file states
      fileManagement.resetFileState();
      setCopiedLocalFiles([]);
      setCopiedGoogleFiles([]);
    } else if (!task && open) {
      setUnitMode(false);
      setUnitRows([]);
      // 새 할 일 추가 시 해당 업무의 기존 절차형 할 일 개수를 확인해서 order_index 설정
      const calculateNextOrderIndex = async () => {
        try {
          const { data, error } = await supabase
            .from('task' as any)
            .select('order_index')
            .eq('event_id', workId)
            .eq('type', 'procedural')
            .order('order_index', { ascending: false })
            .limit(1) as any;
            
          if (error) {
            console.error('Failed to fetch existing tasks:', error);
            setFormData({
              title: '',
              description: '',
              type: 'procedural',
              order_index: 1,
              assigned_to: [],
              due_date: '',
              extraDeadlines: [],
              visibleFrom: '',
              keywords: [],
              status: 'pending'
            });
            return;
          }
          
          // 기존 절차형 할 일 중 가장 큰 순서의 다음 번호(없으면 1) — src/lib/taskOrder.ts
          const nextOrderIndex = nextStepOrder(data.length > 0 ? (data[0] as any).order_index : null);
            
          setFormData({
            title: '',
            description: '',
            type: 'procedural',
            order_index: nextOrderIndex,
            assigned_to: [],
            due_date: '',
            extraDeadlines: [],
            visibleFrom: '',
            keywords: [],
            status: 'pending'
          });
        } catch (error) {
          console.error('Error calculating order index:', error);
          setFormData({
            title: '',
            description: '',
            type: 'procedural',
            order_index: 1,
            assigned_to: [],
            due_date: '',
            extraDeadlines: [],
            visibleFrom: '',
            keywords: [],
            status: 'pending'
          });
        }
      };

      calculateNextOrderIndex();

      // Reset file states
      fileManagement.resetFileState();
      setCopiedLocalFiles([]);
      setCopiedGoogleFiles([]);
    }
  }, [task, open, workId]);

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !formData.keywords.includes(keywordInput.trim())) {
      setFormData(prev => ({
        ...prev,
        keywords: [...prev.keywords, keywordInput.trim()]
      }));
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword)
    }));
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  // 복사 관련 핸들러들
  const handleCopyFromTask = async () => {
    const selectedTask = sortedExistingTasks.find(t => t.id === selectedTaskId);
    if (!selectedTask) return;

    // 할 일 유형 결정
    let finalTaskType = selectedTask.type;
    if (copyTaskType !== 'keep_original') {
      finalTaskType = copyTaskType;
    }

    // 순서 결정
    let finalOrderIndex = selectedTask.order_index;
    if (copyOrderIndex === 'auto') {
      // 자동으로 다음 순서 계산 (절차적 할 일인 경우)
      if (finalTaskType === 'procedural') {
        try {
          const { data, error } = await supabase
            .from('task' as any)
            .select('order_index')
            .eq('event_id', workId)
            .eq('type', 'procedural')
            .order('order_index', { ascending: false })
            .limit(1) as any;

          finalOrderIndex = nextStepOrder(!error && data.length > 0 ? (data[0] as any).order_index : null);
        } catch (error) {
          console.error('순서 계산 실패:', error);
          finalOrderIndex = 1;
        }
      } else {
        finalOrderIndex = 0; // 일회성 할 일은 순서 없음
      }
    } else if (typeof copyOrderIndex === 'number') {
      finalOrderIndex = copyOrderIndex;
    }

    // 마감일 결정 — 원본 유지면 다중 마감 일정까지 그대로 복사
    let finalDueDate = '';
    let finalExtraDeadlines: string[] = [];
    if (copyDueDate === 'keep_original' && selectedTask.due_date) {
      const originalDeadlines = getTaskDeadlines(selectedTask);
      finalDueDate = originalDeadlines[0] ?? selectedTask.due_date.split('T')[0];
      finalExtraDeadlines = originalDeadlines.slice(1);
    } else if (copyDueDate === 'clear') {
      finalDueDate = '';
    } else if (typeof copyDueDate === 'string' && copyDueDate !== 'keep_original' && copyDueDate !== 'clear') {
      finalDueDate = copyDueDate;
    }

    // 기본 정보 복사
    setFormData({
      title: `${selectedTask.title} (복사본)`,
      description: selectedTask.description || '',
      type: finalTaskType,
      order_index: finalOrderIndex,
      assigned_to: copyAssignees.length > 0 ? copyAssignees : extractAssigneeIds(selectedTask),
      due_date: finalDueDate,
      extraDeadlines: finalExtraDeadlines,
      // 보이는 날은 원본의 사정이다 — 복사본은 바로 보이게 시작한다(필요하면 다시 정한다)
      visibleFrom: '',
      keywords: selectedTask.keywords || [],
      status: 'pending', // 새 할 일은 항상 pending으로 시작
    });

    // 선택된 파일 복사
    if (copySelectedFiles.length > 0) {
      const filesToCopy = previewTaskFiles.filter(f => copySelectedFiles.includes(f.id));
      const copiedFileObjects: File[] = [];
      const copiedGoogleDriveFiles: GoogleDriveFileInfo[] = [];

      for (const file of filesToCopy) {
        try {
          // Google Drive 파일인지 확인
          const isGoogleDrive = file.isGoogleDrive ||
                                file.googleDriveId ||
                                file.meta?.is_google_drive_file;

          if (isGoogleDrive) {
            // Google Drive 파일은 참조만 복사
            const googleFileInfo: GoogleDriveFileInfo = {
              id: file.googleDriveId || file.id,
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              webViewLink: file.url || file.editUrl,
              size: file.size,
              modifiedTime: file.uploaded_at || new Date().toISOString()
            };
            copiedGoogleDriveFiles.push(googleFileInfo);
          } else {
            // 일반 파일은 실제 복사
            const response = await fetch(file.url);
            const blob = await response.blob();
            const fileObject = new (File as any)([blob], file.name, { type: file.type || 'application/octet-stream' });
            copiedFileObjects.push(fileObject);
          }
        } catch (error) {
          console.error(`파일 복사 실패: ${file.name}`, error);
        }
      }

      // Store copied files separately so they can be uploaded on submit
      setCopiedLocalFiles((prev) => [...prev, ...copiedFileObjects]);
      setCopiedGoogleFiles((prev) => [...prev, ...copiedGoogleDriveFiles]);
    }

    toast({
      title: "할 일 복사 완료",
      description: `"${selectedTask.title}" 정보가 복사되었습니다.${copySelectedFiles.length > 0 ? ` (${copySelectedFiles.length}개 파일 포함)` : ''}`,
    });

    // 복사 관련 상태 초기화
    setShowCopySection(false);
    setSelectedTaskId('');
    setPreviewingTask('');
    setTaskComboboxOpen(false);
    setTaskSearchQuery('');
    setCopyAssignees([]);
    setCopyTaskType('keep_original');
    setCopyOrderIndex('auto');
    setCopyDueDate('keep_original');
    setCopySelectedFiles([]);
  };

  // Note: extractAssigneeIds, getStatusLabel (getTaskStatusText), and getTaskTypeLabel
  // are now imported from @/lib/taskUtils

  function handlePreviewTask(taskId: string): void {
    setPreviewingTask(previewingTask === taskId ? '' : taskId);
  }

  // 키워드 매칭 점수 계산 함수
  const calculateKeywordMatchingScore = (task: Task): number => {
    if (!currentWorkKeywords || currentWorkKeywords.length === 0) return 0;

    let score = 0;

    // 1순위: 현재 업무 키워드 ↔ 복사할 할 일 키워드 간 중복
    if (task.keywords && task.keywords.length > 0) {
      const taskKeywordMatches = currentWorkKeywords.filter(keyword =>
        task.keywords.includes(keyword)
      ).length;
      score += taskKeywordMatches * 10; // 높은 가중치
    }

    // 2순위: 현재 업무 키워드 ↔ 복사할 할 일이 속한 업무 키워드 간 중복
    if ((task as any).work?.keywords && (task as any).work.keywords.length > 0) {
      const workKeywordMatches = currentWorkKeywords.filter(keyword =>
        (task as any).work.keywords.includes(keyword)
      ).length;
      score += workKeywordMatches * 5; // 중간 가중치
    }

    return score;
  };

  // 우선순위로 정렬된 할 일 리스트
  const sortedExistingTasks = useMemo(() => {
    if (!existingTasks || existingTasks.length === 0) return [];

    return [...existingTasks]
      .map(task => ({
        ...task,
        matchingScore: calculateKeywordMatchingScore(task)
      }))
      .sort((a, b) => {
        // 먼저 매칭 점수로 정렬 (높은 점수 우선)
        if (b.matchingScore !== a.matchingScore) {
          return b.matchingScore - a.matchingScore;
        }
        // 점수가 같으면 최신 생성일 기준으로 정렬
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [existingTasks, currentWorkKeywords]);

  // 검색어로 걸러낸 할 일 목록 (제목·업무명·키워드 대상)
  // cmdk 기본 필터 대신 직접 거르는 이유: CommandItem value를 task.id로 두어야 제목이 같은 할 일들이
  // 서로 섞이지 않는데, id를 그대로 두면 uuid 문자열이 검색어에 퍼지 매칭되어 오탐이 난다.
  const filteredExistingTasks = useMemo(() => {
    const query = taskSearchQuery.trim().toLowerCase();
    if (!query) return sortedExistingTasks;

    return sortedExistingTasks.filter(task => {
      const haystack = [
        task.title,
        (task as any).work?.name,
        ...(task.keywords || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return query.split(/\s+/).every(term => haystack.includes(term));
    });
  }, [sortedExistingTasks, taskSearchQuery]);

  // 선택된 할 일의 상세 정보 로드 (sortedExistingTasks 정의 후에 배치)
  useEffect(() => {
    const loadPreviewTask = async () => {
      if (!previewingTask) {
        setPreviewTask(null);
        setPreviewTaskFiles([]);
        setCopySelectedFiles([]);
        return;
      }

      const task = sortedExistingTasks.find(t => t.id === previewingTask);
      if (task) {
        setPreviewTask(task);

        // 해당 할 일의 파일 목록 로드
        try {
          const files = await TaskFileService.getTaskFiles(task.id);
          setPreviewTaskFiles(files);
        } catch (error) {
          console.error('파일 목록 로드 실패:', error);
          setPreviewTaskFiles([]);
        }
      }
    };

    loadPreviewTask();
  }, [previewingTask, sortedExistingTasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast({
        title: "입력 오류",
        description: "할 일 제목을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // 과제 단위 모드: 빈 라벨 행 제거 후 1개 이상 요구
      const unitRowsClean = unitMode
        ? unitRows
            .map(row => ({ ...row, label: row.label.trim() }))
            .filter(row => row.label.length > 0)
        : [];
      if (unitMode && unitRowsClean.length === 0) {
        toast({
          title: '입력 오류',
          description: '과제 단위를 1개 이상 입력해주세요.',
          variant: 'destructive',
        });
        return; // finally 블록이 isSubmitting을 되돌린다
      }

      // 중복 제거 및 빈 값 필터링 — 단위 모드에선 단위에 지정한 담당자도 범주(pool)에 합류
      // (내 할 일 인식·제출 권한이 meta.assignees 기준이라 범주 밖 지정은 성립하지 않는다)
      const cleanAssignees = [
        ...new Set([
          ...formData.assigned_to,
          ...unitRowsClean.flatMap(row => row.assigneeIds),
        ]),
      ].filter(id => id && id.trim());

      // Convert string array to TaskAssigneeJsonb structure with names
      const assignees = cleanAssignees.map(id => {
        const resource = resources?.find(r => r.id === id);

        // 수정 모드일 때 기존 assignee 정보 찾기
        const existingAssignee = isEditing && task?.meta?.assignees
          ? task.meta.assignees.find(a => a.id === id)
          : null;

        return {
          id,
          name: resource?.name || 'Unknown',
          // 기존 assignee는 상태 유지, 새 assignee는 pending
          status: existingAssignee?.status || 'pending' as const,
          assigned_at: existingAssignee?.assigned_at || new Date().toISOString(),
          completed_at: existingAssignee?.completed_at || null
        };
      });

      // 다중 마감: due_date 컬럼 = 다음(효과적) 마감, meta.deadlines = 전체 회차(단일이면 null로 정리).
      // 회차 기록은 새 목록에 맞춰 prune하고, 담당자 전체 상태는 회차 기록에서 재파생
      // (회차를 추가하면 전원 완료였던 할 일도 다시 미완료가 된다).
      const existingProgress = isEditing ? getDeadlineProgress(task ?? {}) : {};
      const nextDeadlines = normalizeDeadlines([formData.due_date, ...formData.extraDeadlines]);

      // 과제 단위와 다중 마감은 함께 쓸 수 없다(회차×단위 조합 — 서버 RPC도 거부)
      if (unitMode && nextDeadlines.length > 1) {
        toast({
          title: '함께 설정할 수 없습니다',
          description:
            '과제 단위 할 일은 마감 일정이 하나일 때만 사용할 수 있습니다. 추가 마감을 지우거나 단위 모드를 꺼주세요.',
          variant: 'destructive',
        });
        return; // finally 블록이 isSubmitting을 되돌린다
      }

      // 단위 목록·수행 기록 재구성(기존 수행 상태 보존, 고아 기록 prune) 후
      // 담당자 상태 파생 — 단위 모드는 "내 단위 전부 완료", 아니면 기존 회차 파생
      const unitsList = unitRowsClean.map(({ key, label }) => ({ key, label }));
      const existingUnitProgress = isEditing ? getUnitProgress(task ?? {}) : {};
      const unitPayload = buildUnitsPayload(
        unitsList,
        buildUnitProgressFromRows(unitRowsClean, existingUnitProgress),
        cleanAssignees,
      );
      const derivedAssignees = unitMode
        ? deriveAssigneesFromUnits(unitsList, unitPayload.unitProgress ?? {}, assignees)
        : deriveAssigneesFromProgress(
            nextDeadlines,
            pruneDeadlineProgress(existingProgress, nextDeadlines),
            assignees,
          );

      // 보이는 날이 첫 마감보다 늦으면 담당자는 마감이 지난 뒤에야 본다 — 저장 전에 막는다
      const visibilityError = visibleFromError(formData.visibleFrom, nextDeadlines);
      if (visibilityError) {
        toast({ title: '담당자에게 보이는 날을 확인해 주세요', description: visibilityError, variant: 'destructive' });
        return; // finally 블록이 isSubmitting을 되돌린다
      }

      const deadlinePayload = buildDeadlinePayload(
        [formData.due_date, ...formData.extraDeadlines],
        {
          assignees: derivedAssignees,
          // 옛 제출 받기(meta.submission)는 2026-10-05 에 걷어 냈다 — 더 쓰지 않는다(이미 있는 값은 그대로 둔다)
          // 과제 단위 — 같은 이유로 끌 때 null을 명시해 기존 단위를 지운다
          units: unitPayload.units,
          unitProgress: unitPayload.unitProgress,
          // 비우면 null 을 명시한다 — update 경로가 meta 얕은 병합이라 키를 빼면 옛 날짜가 살아남는다
          visibleFrom: formData.visibleFrom || null,
        },
        existingProgress,
      );
      const taskData = {
        title: formData.title,
        description: formData.description,
        type: formData.type,
        order_index: formData.order_index,
        status: formData.status,
        keywords: formData.keywords,
        event_id: workId,
        due_date: deadlinePayload.due_date,
        meta: deadlinePayload.meta
      };

      let taskId: string;

      if (isEditing || createdTaskId) {
        // Use JSONB mutation for updates
        await updateTaskJsonbMutation.mutateAsync({
          id: task?.id ?? createdTaskId!,
          data: taskData,
        });
        taskId = task?.id ?? createdTaskId!;

        // Handle file deletions using shared hook
        await fileManagement.processFileDeletions(taskId);
      } else {
        // Use JSONB mutation for creation
        const result = await createTaskJsonbMutation.mutateAsync({
          ...taskData,
          event_id: workId,
        });
        taskId = (result as any).id;
        setCreatedTaskId(taskId);
      }


      // 작업(Action) 초안 반영 — 할 일이 있어야(FK) 연결할 수 있으므로 저장 뒤에 돈다.
      // 실패하면 창을 닫지 않는다: 할 일은 저장됐지만 작업이 절반만 반영된 채 조용히 끝나면
      // 담당자가 빈 작업 목록을 받는다. 다시 저장하면 같은 계획이 재적용된다(연결은 upsert).
      let createdActionIds: Record<string, string> = {};
      if (!isDraftEmpty(actionDraft)) {
        const plan = planActionDraft(actionDraft, existingActions, authUser?.id ?? null);
        const { failures, createdIds } = await applyTaskActionPlan(taskId, plan);
        createdActionIds = createdIds;
        await queryClient.invalidateQueries({ queryKey: taskActionKeys.all });
        if (failures.length > 0) {
          toast({
            title: '일부 작업을 반영하지 못했습니다',
            description: `할 일은 저장됐습니다. ${failures.join(' / ')} — 다시 저장해 주세요.`,
            variant: 'destructive',
          });
          return;
        }
        setActionDraft(EMPTY_ACTION_DRAFT);
      }

      // 작업 순서 — 화살표로 바꿨을 때만. 임시 키는 새 id 로, 빠진 항목은 버린다(actionFlow.ts)
      if (actionOrderTouched) {
        const removedIds = new Set(actionDraft.removeIds);
        const alive = new Set<string>([
          ...existingActions.map((action) => action.id).filter((id) => !removedIds.has(id)),
          ...Object.values(createdActionIds),
        ]);
        try {
          await setTaskActionFlow(taskId, resolveFlowKeys(actionOrder, createdActionIds, alive));
          setActionOrderTouched(false);
        } catch (e) {
          toast({
            title: '작업 순서를 저장하지 못했습니다',
            description: e instanceof Error ? e.message : '할 일은 저장됐습니다. 다시 저장해 주세요.',
            variant: 'destructive',
          });
          return;
        }
      }

      // Upload new files and Google Drive files using shared hook
      await fileManagement.uploadNewFiles(taskId);

      // Also upload any files copied from another task
      if (copiedLocalFiles.length > 0) {
        for (const file of copiedLocalFiles) {
          try {
            await TaskFileService.uploadTaskFile(taskId, file);
          } catch (error) {
            console.error('복사된 파일 업로드 실패:', error);
          }
        }
      }

      // TaskDetailDialog가 최신 파일 목록을 불러오도록 쿼리 무효화
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['task-files', taskId] }),
        queryClient.invalidateQueries({ queryKey: ['work-detail-jsonb', workId] }),
      ]);

      toast({
        title: isEditing ? "할 일 수정 완료" : "할 일 생성 완료",
        description: isEditing ? "할 일이 성공적으로 수정되었습니다." : "새로운 할 일이 성공적으로 생성되었습니다.",
      });

      // 이어서 설정할 작업 — 이번 저장으로 새로 붙은 작업 중 첫 번째(초안 순서), 설정 화면이 있는 것만.
      // NEIS 업무 화면은 이 창의 카드에서 이미 골랐으니 제외한다.
      const createdInOrder = actionDraft.adds
        .map((item) => ({ item, id: createdActionIds[item.tempId] }))
        .filter((x): x is { item: typeof x.item; id: string } => Boolean(x.id))
        .filter(({ item }) => {
          const definition = getTaskActionDefinition(item.type);
          return item.type !== 'neis.screen' && (definition?.kind === 'runner' || definition?.kind === 'external');
        });
      if (createdInOrder.length > 0) {
        try {
          const saved = await listTaskActions(taskId);
          const action = saved.find((a) => a.id === createdInOrder[0].id);
          if (action) {
            setFollowUp({ action, taskId, title: taskData.title });
            return; // 편집 창은 설정 화면을 닫을 때 함께 닫는다(closeAfterFollowUp)
          }
        } catch {
          // 못 읽으면 종전처럼 닫는다 — 작업은 이미 저장됐고 [열기]로 들어갈 수 있다
        }
      }

      onOpenChange(false);
      onSuccess?.();
      onSaved?.(taskId, taskData.title);
    } catch (error) {
      toast({
        title: isEditing ? "할 일 수정 실패" : "할 일 생성 실패",
        description: "작업 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeOptions = [
    { value: 'procedural', label: '절차적 할 일' },
    { value: 'one_time', label: '일회성 할 일' }
  ];

  const statusOptions = [
    { value: 'pending', label: '진행 중' },
    { value: 'completed', label: '완료' },
    { value: 'cancelled', label: '취소' }
  ];

  function handleDialogClose(isOpen: boolean): void {
    if (!isOpen) {
      // Reset copy-related state
      setShowCopySection(false);
      setSelectedTaskId('');
      setPreviewingTask('');
      setTaskComboboxOpen(false);
      setTaskSearchQuery('');
      setCopyAssignees([]);
      setExistingTasks([]);
      setPreviewTask(null);
      setCopyTaskType('keep_original');
      setCopyOrderIndex('auto');
      setCopyDueDate('keep_original');
      setCopySelectedFiles([]);
      setPreviewTaskFiles([]);
      setCopiedLocalFiles([]);
      setCopiedGoogleFiles([]);
      // Reset file states using shared hook
      fileManagement.resetFileState();
    }
    onOpenChange(isOpen);
  }

  const filesToDeleteObjects = fileManagement.existingFiles.filter((file) =>
    fileManagement.filesToDelete.includes(file.id)
  );

  // 이어 연 설정 화면을 닫으면 편집 창도 닫고, 저장 완료 콜백을 그제야 부른다
  const closeAfterFollowUp = () => {
    const done = followUp;
    setFollowUp(null);
    onOpenChange(false);
    if (done) {
      onSuccess?.();
      onSaved?.(done.taskId, done.title);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-h-[90vh] min-w-0 max-w-md overflow-y-auto overflow-x-hidden p-0 sm:max-w-xl md:max-w-2xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg">
            {isEditing ? (
              <>
                <TitleIconChip icon={Edit} tone="blue" />
                할 일 수정
              </>
            ) : (
              <>
                <TitleIconChip icon={Plus} tone="emerald" />
                새 할 일 추가
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="min-w-0 max-w-full">
          <div className="space-y-4 px-4 py-4 sm:px-6">
          {/* 모든 할 일에서 복사 섹션 (새 할 일 추가 시에만 표시) */}
          {!isEditing && sortedExistingTasks.length > 0 && (
            <div className="relative overflow-hidden border rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-100 rounded-full -translate-y-12 translate-x-12 opacity-50"></div>
              <div className="relative p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-green-100 rounded-lg">
                      <Copy className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-green-900">모든 할 일에서 복사</h3>
                      <p className="text-xs text-green-700">시스템의 모든 할 일 중에서 선택하여 새 할 일을 만들어보세요</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={showCopySection ? "secondary" : "default"}
                    size="sm"
                    onClick={() => setShowCopySection(!showCopySection)}
                    className={`transition-all duration-200 ${
                      showCopySection
                        ? 'bg-white text-green-700 hover:bg-green-50 border border-green-200'
                        : 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'
                    }`}
                  >
                    {showCopySection ? (
                      <>
                        <ChevronDown className="mr-2 h-4 w-4 rotate-180 transition-transform" />
                        접기
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        시작하기
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!isEditing && showCopySection && sortedExistingTasks.length > 0 && (
            <div className="border rounded-lg bg-white border-gray-200 shadow-sm">
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-base font-medium text-gray-900 flex items-center">
                    <ListTodo className="mr-2 h-4 w-4 text-gray-600" />
                    복사할 할 일 선택
                  </Label>
                  <p className="text-sm text-gray-600">모든 업무의 할 일 중에서 검색하여 복사할 수 있습니다</p>
                  <PickerRoot open={taskComboboxOpen} onOpenChange={setTaskComboboxOpen}>
                    <PickerTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={taskComboboxOpen}
                        className="w-full justify-between bg-white border-gray-300 hover:border-green-400 focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-all duration-200 h-12"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Search className="h-4 w-4 shrink-0 text-gray-400" />
                          <span className="truncate text-gray-600">
                            {selectedTaskId
                              ? sortedExistingTasks.find(task => task.id === selectedTaskId)?.title
                              : "할 일 제목, 업무명 또는 키워드로 검색..."}
                          </span>
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PickerTrigger>
                    <PickerContent
                      title="복사할 할 일 선택"
                      className="p-0 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]"
                      align="start"
                    >
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="할 일 제목, 업무명 또는 키워드로 검색..."
                          value={taskSearchQuery}
                          onValueChange={setTaskSearchQuery}
                          autoFocus
                        />
                        <CommandList className="max-h-60">
                          <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                          <CommandGroup>
                            {filteredExistingTasks.map((task) => (
                              <CommandItem
                                key={task.id}
                                value={task.id}
                                onSelect={() => {
                                  const nextId = task.id === selectedTaskId ? '' : task.id;
                                  setSelectedTaskId(nextId);
                                  setPreviewingTask(nextId); // 선택 시 자동으로 미리보기 표시
                                  setTaskComboboxOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <div className="flex items-center justify-between w-full py-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Check
                                      className={`mr-2 h-4 w-4 shrink-0 ${selectedTaskId === task.id ? "opacity-100" : "opacity-0"
                                        }`}
                                    />
                                    <div className="flex flex-col min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-900">{task.title}</span>
                                        {task.matchingScore > 0 && (
                                          <Badge variant="default" className="text-xs bg-green-100 text-green-700 hover:bg-green-100">
                                            {task.matchingScore === 10 && '🎯 높음'}
                                            {task.matchingScore === 5 && '📍 중간'}
                                            {task.matchingScore > 10 && '⭐ 최고'}
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="text-xs text-gray-500">
                                        업무: {(task as any).work?.name || '없음'} • 유형: {getTaskTypeLabel(task.type)} • 상태: {getTaskStatusLabel(task.status)}
                                        {task.type === 'procedural' && task.order_index !== undefined && ` • 순서: ${task.order_index}`}
                                      </span>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="text-xs ml-3 shrink-0">
                                    {extractAssigneeIds(task).length}명 담당
                                  </Badge>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PickerContent>
                  </PickerRoot>
                </div>

                {/* 할 일 미리보기 */}
                {previewingTask && previewTask && (
                  <div className="mt-3 p-4 bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-lg shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm text-gray-800 flex items-center">
                        <Eye className="mr-2 h-4 w-4 text-green-500" />
                        미리보기
                      </h4>
                      <Badge variant="secondary" className="text-xs">
                        {getTaskStatusLabel(previewTask.status)}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {/* 할 일 기본 정보 */}
                      <div className="bg-white p-3 rounded-md border border-gray-100">
                        <h5 className="font-medium text-sm text-gray-900 mb-2">{previewTask.title}</h5>
                        {previewTask.description && (
                          <p className="text-xs text-gray-600 mb-2">{previewTask.description}</p>
                        )}
                        <div className="flex items-center text-xs text-gray-500 space-x-4 flex-wrap">
                          <span>업무: {(previewTask as any).work?.name || '없음'}</span>
                          <span>유형: {getTaskTypeLabel(previewTask.type)}</span>
                          {previewTask.type === 'procedural' && previewTask.order_index !== undefined && (
                            <span>순서: {previewTask.order_index}</span>
                          )}
                          {previewTask.due_date && (
                            <span>마감일: {new Date(previewTask.due_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>

                      {/* 키워드 */}
                      {previewTask.keywords && previewTask.keywords.length > 0 && (
                        <div className="bg-white p-3 rounded-md border border-gray-100">
                          <div className="flex items-center mb-2">
                            <Tag className="mr-1 h-3 w-3 text-gray-400" />
                            <span className="text-xs font-medium text-gray-700">키워드</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {previewTask.keywords.map(keyword => (
                              <Badge key={keyword} variant="outline" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 복사 시 설정 변경 */}
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                        <h5 className="text-sm font-medium text-green-900 mb-2 flex items-center">
                          <Settings className="mr-2 h-4 w-4" />
                          복사 시 설정 변경
                        </h5>

                        <div className="space-y-3">
                          {/* 담당자 설정 */}
                          <div className="space-y-2">
                            <Label className="text-xs text-green-800">담당자 (다중 선택 가능)</Label>
                            <div className="text-xs text-green-600 mb-2">
                              원본 담당자: {extractAssigneeIds(previewTask).map(id =>
                                resources?.find(r => r.id === id)?.name
                              ).filter(Boolean).join(', ') || '없음'}
                            </div>
                            <SearchableMultiSelect
                              filterByTeacher={true}
                              includeTagOptions={true}
                              selectedValues={copyAssignees}
                              onSelectionChange={(ids) => {
                                setCopyAssignees(ids);
                              }}
                              placeholder="새 담당자를 선택하거나 원본 유지"
                              searchPlaceholder="이름을 입력하세요"
                              emptyText="검색된 담당자가 없습니다"
                              maxSelectedDisplay={2}
                            />
                            <div className="text-xs text-gray-500">
                              선택하지 않으면 원본 담당자가 유지됩니다
                            </div>
                          </div>

                          {/* 할 일 유형 설정 */}
                          <div className="space-y-2">
                            <Label className="text-xs text-green-800">할 일 유형</Label>
                            <div className="text-xs text-green-600 mb-2">
                              원본 유형: {getTaskTypeLabel(previewTask.type)}
                            </div>
                            <Select value={copyTaskType} onValueChange={setCopyTaskType as any}>
                              <SelectTrigger className="h-8 text-xs border-green-200">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="keep_original">원본 유형 유지</SelectItem>
                                <SelectItem value="procedural">절차적 할 일로 변경</SelectItem>
                                <SelectItem value="one_time">일회성 할 일로 변경</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 순서 설정 */}
                          <div className="space-y-2">
                            <Label className="text-xs text-green-800">할 일 순서</Label>
                            <div className="text-xs text-green-600 mb-2">
                              원본 순서: {previewTask.type === 'procedural' && previewTask.order_index !== undefined
                                ? `${previewTask.order_index}번째`
                                : '순서 없음 (일회성 할 일)'}
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="order_auto"
                                  name="order_option"
                                  checked={copyOrderIndex === 'auto'}
                                  onChange={() => setCopyOrderIndex('auto')}
                                  className="w-3 h-3"
                                />
                                <Label htmlFor="order_auto" className="text-xs">자동 배치 (마지막 순서 다음)</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="order_keep"
                                  name="order_option"
                                  checked={copyOrderIndex === 'keep_original'}
                                  onChange={() => setCopyOrderIndex('keep_original')}
                                  className="w-3 h-3"
                                />
                                <Label htmlFor="order_keep" className="text-xs">원본 순서 유지</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="order_custom"
                                  name="order_option"
                                  checked={typeof copyOrderIndex === 'number'}
                                  onChange={() => setCopyOrderIndex(1)}
                                  className="w-3 h-3"
                                />
                                <Label htmlFor="order_custom" className="text-xs">직접 지정:</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={typeof copyOrderIndex === 'number' ? copyOrderIndex : ''}
                                  onChange={(e) => setCopyOrderIndex(parseInt(e.target.value) || 1)}
                                  className="w-16 h-6 text-xs"
                                  disabled={typeof copyOrderIndex !== 'number'}
                                />
                              </div>
                            </div>
                          </div>

                          {/* 마감일 설정 */}
                          <div className="space-y-2">
                            <Label className="text-xs text-green-800">마감일</Label>
                            <div className="text-xs text-green-600 mb-2">
                              원본 마감일: {previewTask.due_date
                                ? new Date(previewTask.due_date).toLocaleDateString()
                                : '없음'}
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="date_keep"
                                  name="date_option"
                                  checked={copyDueDate === 'keep_original'}
                                  onChange={() => setCopyDueDate('keep_original')}
                                  className="w-3 h-3"
                                />
                                <Label htmlFor="date_keep" className="text-xs">원본 마감일 유지</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="date_clear"
                                  name="date_option"
                                  checked={copyDueDate === 'clear'}
                                  onChange={() => setCopyDueDate('clear')}
                                  className="w-3 h-3"
                                />
                                <Label htmlFor="date_clear" className="text-xs">마감일 없음</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="date_custom"
                                  name="date_option"
                                  checked={typeof copyDueDate === 'string' && copyDueDate !== 'keep_original' && copyDueDate !== 'clear'}
                                  onChange={() => setCopyDueDate(new Date().toISOString().split('T')[0])}
                                  className="w-3 h-3"
                                />
                                <Label htmlFor="date_custom" className="text-xs">새 마감일:</Label>
                                <Input
                                  type="date"
                                  value={typeof copyDueDate === 'string' && copyDueDate !== 'keep_original' && copyDueDate !== 'clear' ? copyDueDate : ''}
                                  onChange={(e) => setCopyDueDate(e.target.value)}
                                  className="w-32 h-6 text-xs"
                                  disabled={!(typeof copyDueDate === 'string' && copyDueDate !== 'keep_original' && copyDueDate !== 'clear')}
                                />
                              </div>
                            </div>
                          </div>

                          {/* 첨부 파일 복사 */}
                          {previewTaskFiles.length > 0 && (
                            <div className="space-y-2">
                              <Label className="text-xs text-green-800">첨부 파일 복사</Label>
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {previewTaskFiles.map((file: TaskFile) => (
                                  <div key={file.id} className="flex items-center justify-between p-2 bg-white border border-green-100 rounded text-xs">
                                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={copySelectedFiles.includes(file.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setCopySelectedFiles(prev => [...prev, file.id]);
                                          } else {
                                            setCopySelectedFiles(prev => prev.filter(id => id !== file.id));
                                          }
                                        }}
                                        className="rounded border-green-300 text-green-600 focus:ring-green-200"
                                      />
                                      {/* min-w-0 없으면 이 flex 항목이 파일명 길이만큼 부풀어
                                          안쪽 truncate가 영영 발동하지 않는다 */}
                                      <div className="flex min-w-0 flex-col">
                                        <span className="truncate font-medium text-gray-700" title={file.name}>
                                          {file.name}
                                        </span>
                                        <div className="truncate text-xs text-gray-500">
                                          {file.type} • {((file.size || 0) / 1024).toFixed(1)}KB
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="text-xs text-gray-500">
                                선택한 파일들이 새 할 일에 복사됩니다
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTaskId && (
                  <div className="pt-4 border-t border-gray-100">
                    <Button
                      type="button"
                      onClick={handleCopyFromTask}
                      className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 h-12 text-base font-medium"
                      disabled={!previewTask}
                    >
                      <Copy className="mr-3 h-5 w-5" />
                      할 일 복사하여 시작하기
                    </Button>
                    <p className="text-xs text-gray-500 text-center mt-2">
                      선택한 할 일의 정보가 새 할 일로 복사됩니다
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 기본 정보 */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title" className="flex items-center">
                  <ListTodo className="mr-2 h-4 w-4" />
                  할 일 제목 <span className="text-red-500 ml-1">*</span>
                </Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="할 일 제목을 입력하세요"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">할 일 설명</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="할 일에 대한 상세 설명을 입력하세요"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>할 일 유형</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: 'procedural' | 'one_time') =>
                      setFormData(prev => ({ ...prev, type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="order_index">순서</Label>
                  <Input
                    id="order_index"
                    type="number"
                    value={formData.order_index}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      order_index: parseStepOrderInput(e.target.value)
                    }))}
                    min="1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 할당 및 일정 */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    {unitMode ? '담당자 범주' : '담당자 (여러명 선택 가능)'}
                  </Label>
                  {/* 담당자 지정 방식 — 인물별(기존) / 과제 단위별(과목·학급 등 명칭 단위 배분) */}
                  <div className="flex rounded-md border p-0.5">
                    <button
                      type="button"
                      className={cn(
                        'flex-1 rounded px-2 py-1 text-xs transition-colors',
                        !unitMode
                          ? 'bg-emerald-600 font-medium text-white'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                      onClick={() => setUnitMode(false)}
                    >
                      인물별
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'flex-1 rounded px-2 py-1 text-xs transition-colors',
                        unitMode
                          ? 'bg-sky-600 font-medium text-white'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                      onClick={() => setUnitMode(true)}
                    >
                      과제 단위별
                    </button>
                  </div>
                  <SearchableMultiSelect
                    filterByTeacher={true}
                    includeTagOptions={true}
                    selectedValues={formData.assigned_to}
                    onSelectionChange={(ids) => {
                      setFormData(prev => ({ ...prev, assigned_to: ids }));
                    }}
                    placeholder={
                      unitMode
                        ? '단위를 선택할 수 있는 담당자 범주'
                        : '담당자를 검색하거나 선택하세요'
                    }
                    searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                    emptyText="검색된 담당자가 없습니다"
                    maxSelectedDisplay={2}
                  />
                  {unitMode && (
                    <p className="text-[11px] text-slate-400">
                      범주에 넣은 담당자는 이 할 일을 내 할 일로 보고, 담당자 없는 단위를 직접
                      선택해 수행할 수 있습니다. 단위에 담당자를 지정하면 자동으로 범주에
                      포함됩니다.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="due_date" className="flex items-center">
                    <Calendar className="mr-2 h-4 w-4" />
                    마감일
                    {formData.extraDeadlines.length > 0 && (
                      <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        총 {formData.extraDeadlines.length + (formData.due_date ? 1 : 0)}회
                      </span>
                    )}
                  </Label>
                  <div className="flex space-x-2">
                    <Input
                      id="due_date"
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                      className="flex-1"
                    />
                    {formData.due_date && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFormData(prev => ({ ...prev, due_date: '' }))}
                        title="마감일 지우기"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {/* 반복 할 일용 추가 마감 일정 — 저장 시 전체가 정렬·중복 제거되고
                      due_date는 다음 마감으로 자동 결정된다 */}
                  {formData.extraDeadlines.map((d, i) => (
                    <div key={i} className="flex space-x-2">
                      <Input
                        type="date"
                        value={d}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          extraDeadlines: prev.extraDeadlines.map((v, k) => (k === i ? e.target.value : v)),
                        }))}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          extraDeadlines: prev.extraDeadlines.filter((_, k) => k !== i),
                        }))}
                        title="이 마감 일정 삭제"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50"
                    disabled={unitMode}
                    title={unitMode ? '과제 단위 할 일에는 다중 마감을 쓸 수 없습니다' : undefined}
                    onClick={() => setFormData(prev => ({ ...prev, extraDeadlines: [...prev.extraDeadlines, ''] }))}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    마감 일정 추가(반복 할 일)
                  </Button>
                  {formData.extraDeadlines.length > 0 && (
                    <p className="text-[11px] text-slate-400">
                      여러 마감 일정을 저장하면 목록·알림은 다가오는 마감 기준으로 표시되고, 상세에서 전체 회차를 볼 수 있습니다.
                    </p>
                  )}
                </div>

                {/* 담당자에게 보이는 날 — 업무의 「대기」를 대신한다(2026-10-05). 날짜가 오면 저절로 열린다 */}
                <div className="space-y-2">
                  <Label htmlFor="visible_from" className="flex items-center">
                    <EyeOff className="mr-2 h-4 w-4" />
                    담당자에게 보이는 날
                    <span className="ml-1.5 text-[11px] font-normal text-slate-500">(선택)</span>
                  </Label>
                  <div className="flex space-x-2">
                    <Input
                      id="visible_from"
                      type="date"
                      value={formData.visibleFrom}
                      onChange={(e) => setFormData(prev => ({ ...prev, visibleFrom: e.target.value }))}
                      className="flex-1"
                    />
                    {formData.visibleFrom && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFormData(prev => ({ ...prev, visibleFrom: '' }))}
                        title="보이는 날 지우기 — 바로 보이게"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    비우면 바로 보입니다. 정한 날 전에는 담당자의 <b className="font-medium text-slate-600">내 할 일·홈</b>에
                    나타나지 않고, 그날 아침 저절로 나타납니다. 책임자 화면에는 「10/20부터 보임」처럼 표시된 채 계속 보입니다.
                  </p>
                  {visibleFromError(formData.visibleFrom, [formData.due_date, ...formData.extraDeadlines]) && (
                    <p className="text-[11px] font-medium text-amber-700">
                      {visibleFromError(formData.visibleFrom, [formData.due_date, ...formData.extraDeadlines])}
                    </p>
                  )}
                </div>
              </div>

              {/* 과제 단위 목록 — 그리드 밖 전체 폭(단위 행에 라벨+담당자 선택이 나란히 필요) */}
              {unitMode && (
                <div className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/40 p-3">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <ListTodo className="h-3.5 w-3.5 text-sky-600" />
                    과제 단위
                  </Label>
                  <TaskUnitEditor rows={unitRows} onChange={setUnitRows} resources={resources} />
                </div>
              )}

              {/* 작업(Action) — 제출 받기·NEIS 화면·문서 양식·기능 연결을 한 목록으로(2026-09-23).
                  옛 제출 받기(meta.submission) 줄은 2026-10-05 에 걷어 냈다 — 제출은 「제출 받기」 작업이다 */}
              <TaskActionsSection
                existing={existingActions}
                draft={actionDraft}
                onDraftChange={setActionDraft}
                canOpenSaved={isEditing}
                order={actionOrder}
                onOrderChange={(next) => { setActionOrder(next); setActionOrderTouched(true); }}
              />


              {isEditing && (
                <div className="space-y-2">
                  <Label>상태</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: typeof formData.status) =>
                      setFormData(prev => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="상태 선택">
                        {statusOptions.find(opt => opt.value === formData.status)?.label || '상태 선택'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 키워드 */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>키워드</Label>
                <div className="flex space-x-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={handleKeywordKeyDown}
                    placeholder="키워드를 입력하고 Enter를 누르세요"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddKeyword}
                    disabled={!keywordInput.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {formData.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.keywords.map((keyword, index) => (
                    <Badge key={index} variant="outline" className="text-sm">
                      {keyword}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-auto p-0 text-gray-500 hover:text-red-500"
                        onClick={() => handleRemoveKeyword(keyword)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 파일 관리 */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Label className="text-sm font-medium flex items-center">
                  <File className="mr-2 h-4 w-4" />
                  첨부 파일
                </Label>

                <CombinedFileUpload
                  localFiles={fileManagement.attachedFiles}
                  onLocalFilesChange={fileManagement.setAttachedFiles}
                  googleDriveFiles={fileManagement.googleDriveFiles}
                  onGoogleDriveFilesChange={fileManagement.setGoogleDriveFiles}
                  maxFileSize={5 * 1024 * 1024}
                  maxFiles={10}
                  showGoogleDrive={true}
                />

                {isEditing && fileManagement.existingFiles.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">기존 첨부파일</h4>
                    {fileManagement.loadingFiles ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                        파일 목록 로드 중...
                      </div>
                    ) : (
                      <EnhancedFileList
                        documents={fileManagement
                          .getFilesNotMarkedForDeletion()
                          .map((file) => ({
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
                            meta: {},
                          }))}
                        loading={false}
                        onDownload={async (doc) => {
                          const file = fileManagement.existingFiles.find(
                            (f) => f.id === doc.id
                          );
                          if (file) fileManagement.downloadFile(file);
                        }}
                        onDelete={async (id) => fileManagement.markFileForDeletion(id)}
                        onUpdate={async () => {}}
                        enableRename={false}
                        enableDelete={true}
                        enableBulkActions={false}
                        enableSearch={false}
                        enableViewModeToggle={false}
                        showBreadcrumb={false}
                        showBadges={false}
                        showFileSize={true}
                        showModifiedDate={true}
                        compactMode={true}
                        maxHeight="300px"
                        defaultViewMode="list"
                        emptyStateMessage="첨부파일이 없습니다."
                      />
                    )}
                  </div>
                )}

                <FileDeletionPreview
                  files={filesToDeleteObjects}
                  onCancelDeletion={fileManagement.cancelFileDeletion}
                />
              </div>
            </CardContent>
          </Card>

          </div>

          {/* 푸터 — 취소=ghost, 저장=primary(주행동만 solid 유지) */}
          <div className={DIALOG_FOOTER_CLASS}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            >
              <X className="h-3.5 w-3.5" />
              취소
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-8 gap-1.5 px-4 text-xs"
            >
              <Save className="h-3.5 w-3.5" />
              {isSubmitting ? (
                isEditing ? '수정 중...' : '생성 중...'
              ) : (
                isEditing ? '수정' : '생성'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {followUp && (
      <TaskActionRunnerDialog
        action={followUp.action}
        taskTitle={followUp.title}
        workflowId={null}
        open
        onOpenChange={(next) => { if (!next) closeAfterFollowUp(); }}
      />
    )}
    </>
  );
}
