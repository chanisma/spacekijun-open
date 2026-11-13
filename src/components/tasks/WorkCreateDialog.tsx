// ========================================
// Task Work Create Dialog Component
// Dialog for creating new task works
// ========================================

import { stepOrderAt } from '@/lib/taskOrder';
import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateWorkJsonb, useCreateTaskJsonb } from '@/hooks/useTasksJsonb';
import { useUsers } from '@/hooks/useTasks';
import { useDepartments } from '@/hooks/useDepartments';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SearchableMultiSelect, SearchableMultiSelectItem } from '@/components/ui/searchable-multi-select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { CombinedFileUpload } from '@/components/ui/combined-file-upload';
import { GoogleDriveFileInfo } from '@/components/ui/google-drive/GoogleDrivePicker';
import { GoogleDriveIntegrationService } from '@/services/googleDriveIntegrationService';
import { WorkFormData, TaskAssigneeJsonb } from '@/types/tasks';
import { TaskFileService } from '@/services/taskFileService';
import { toast } from '@/lib/toast';
import { Plus, X, User, Calendar, History, Building2, File as FileIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { DocumentTaskDraft } from '@/features/document-intelligence';

interface WorkCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: {
    workId: string;
    taskIdsBySourceCandidateId: Record<string, string>;
    analysisRunId: string | null;
  }) => void;
  initialDraft?: DocumentTaskDraft | null;
  /** «참고해서 시작» 창으로 넘기기 — 옛 «기존 업무에서 복사» 자리 */
  onStartFromReference?: () => void;
}

export function WorkCreateDialog({
  open,
  onOpenChange,
  onSuccess,
  initialDraft,
  onStartFromReference,
}: WorkCreateDialogProps) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [workYear, setWorkYear] = useState<number>(new Date().getFullYear());



  // 파일 업로드 상태
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [googleDriveFiles, setGoogleDriveFiles] = useState<GoogleDriveFileInfo[]>([]);

  const { data: users } = useUsers();
  const createWork = useCreateWorkJsonb();
  const createTask = useCreateTaskJsonb();
  const queryClient = useQueryClient();

  // 부서 목록 로드 (데이터베이스에서 display_order 순으로)
  const { departments } = useDepartments({ source: 'database', category: 'school' });

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<WorkFormData>({
    defaultValues: {
      name: '',
      description: '',
      manager_ids: [], // manager_id 대신 manager_ids 사용
      keywords: [],
      initial_tasks: []
    }
  });

  const selectedManagerIds = watch('manager_ids') as string[];
  const initialTasks = watch('initial_tasks') ?? [];

  useEffect(() => {
    if (!open || !initialDraft) return;

    const draftKeywords = [...initialDraft.keywords];
    setValue('name', initialDraft.workName);
    setValue('description', initialDraft.description);
    setValue('keywords', draftKeywords);
    setValue('initial_tasks', initialDraft.tasks.map((task, index) => ({
      title: task.title,
      description: task.description,
      type: task.type,
      order_index: stepOrderAt(index),
      due_date: task.dueDate ?? undefined,
      keywords: task.keywords,
      meta: {
        documentAnalysisId: initialDraft.analysisRunId,
        documentAnalysisCandidateId: task.sourceCandidateId,
      },
    })));
    setKeywords(draftKeywords);
    const firstYear = initialDraft.tasks
      .map((task) => task.dueDate?.match(/^(\d{4})/)?.[1])
      .find(Boolean);
    if (firstYear) setWorkYear(Number(firstYear));
  }, [initialDraft, open, setValue]);

  // Users를 SearchableMultiSelectItem 형태로 변환
  const userItems: SearchableMultiSelectItem[] = React.useMemo(() => {
    return users?.map(user => ({
      value: user.id,
      label: user.name,
      description: (user as any).email || undefined
    })) || [];
  }, [users]);

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
      const newKeywords = [...keywords, keywordInput.trim()];
      setKeywords(newKeywords);
      setValue('keywords', newKeywords);
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    const newKeywords = keywords.filter(k => k !== keyword);
    setKeywords(newKeywords);
    setValue('keywords', newKeywords);
  };

  const handleKeywordKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const onSubmit = async (data: WorkFormData) => {
    try {
      const taskIdsBySourceCandidateId: Record<string, string> = {};
      // 선택된 관리자 ID들로부터 관리자 정보 조회
      let managers: Array<{ id: string; name: string }> = [];
      if (selectedManagerIds && selectedManagerIds.length > 0) {
        const { data: resources } = await supabase
          .from('resource')
          .select('id, name')
          .in('id', selectedManagerIds);

        if (resources) {
          managers = resources.map(resource => ({
            id: resource.id,
            name: resource.name
          }));
        }
      }

      // 업무 생성 (파일은 별도로 업로드하므로 meta.files에 포함하지 않음)
      const newWork = await createWork.mutateAsync({
        name: data.name,
        description: data.description,
        keywords: keywords,
        meta: {
          department: selectedDepartment === 'none' ? undefined : selectedDepartment || undefined,
          year: workYear,
          managers: managers,
          documentAnalysisId: initialDraft?.analysisRunId ?? undefined,
        }
      });

      // 새 파일 업로드
      if (attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          try {
            await TaskFileService.uploadWorkFile((newWork as any).id, file);
          } catch (error) {
            console.error('파일 업로드 실패:', error);
            toast.error(`${file.name} 업로드 중 오류가 발생했습니다.`);
          }
        }
      }

      // Register Google Drive files (pending 파일은 실제 생성/업로드 후 등록)
      if (googleDriveFiles.length > 0) {
        for (const googleFile of googleDriveFiles) {
          try {
            const integrationOptions = {
              targetType: 'task_event' as const,
              targetId: (newWork as any).id
            };
            await GoogleDriveIntegrationService.processPendingAndRegister(googleFile, integrationOptions);
          } catch (error) {
            console.error('Google Drive 파일 등록 실패:', error);
            toast.error(`${googleFile.name} 등록 중 오류가 발생했습니다.`);
          }
        }
      }

      // initial_tasks가 있으면 개별적으로 task들을 생성
      if (data.initial_tasks && data.initial_tasks.length > 0) {
        for (let i = 0; i < data.initial_tasks.length; i++) {
          const task = data.initial_tasks[i];

          // JSONB 구조로 assignee 설정
          let assigneesJsonb: TaskAssigneeJsonb[] = [];
          if (task.assigned_to) {
            // 새로 지정된 담당자 사용 - resource에서 name 조회 필요
            const { data: assigneeResource } = await supabase
              .from('resource')
              .select('id, name')
              .eq('id', task.assigned_to)
              .single();

            assigneesJsonb = [{
              id: task.assigned_to,
              name: assigneeResource?.name,
              status: 'pending',
              assigned_at: new Date().toISOString()
            }];
          }

          const newTask = await createTask.mutateAsync({
            event_id: (newWork as any).id,
            title: task.title,
            description: task.description,
            type: task.type,
            order_index: task.order_index !== undefined ? task.order_index : stepOrderAt(i),
            due_date: task.due_date,
            keywords: task.keywords || [],
            meta: { ...(task.meta ?? {}), assignees: assigneesJsonb }
          } as any);

          const sourceCandidateId = task.meta?.documentAnalysisCandidateId;
          if (typeof sourceCandidateId === 'string') {
            taskIdsBySourceCandidateId[sourceCandidateId] = (newTask as { id: string }).id;
          }

        }
      }

      const totalFiles = attachedFiles.length;

      // IntegratedTaskView가 최신 데이터를 표시하도록 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });
      queryClient.invalidateQueries({ queryKey: ['work-detail-jsonb'] });

      toast.success(`업무가 생성되었습니다.${data.initial_tasks?.length > 0 ? ` (${data.initial_tasks.length}개 할 일 포함)` : ''}${totalFiles > 0 ? ` (${totalFiles}개 파일 업로드)` : ''}`);
      const createdWorkId = (newWork as { id: string }).id;
      handleClose();
      onSuccess?.({
        workId: createdWorkId,
        taskIdsBySourceCandidateId,
        analysisRunId: initialDraft?.analysisRunId ?? null,
      });
    } catch (error) {
      toast.error('업무 생성에 실패했습니다.');
      console.error('Create work error:', error);
    }
  };

  const handleClose = () => {
    reset();
    setKeywords([]);
    setKeywordInput('');
    setSelectedDepartment('');
    setWorkYear(new Date().getFullYear());
    setAttachedFiles([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] min-w-0 max-w-md overflow-y-auto overflow-x-hidden sm:max-w-xl md:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center text-sm sm:text-base md:text-lg">
            <Calendar className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            새 업무 생성
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            업무를 생성하고 세부 할 일을 추가해보세요.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="min-w-0 max-w-full space-y-4 sm:space-y-6">
          {/* 단계는 하나다 — 「초기 할 일 설정」 2단계는 갈 길이 없는 코드였다(2026-10-06 정리). 할 일은 만든 뒤
              열리는 업무 상세에서 [할 일 추가]로 넣는다 */}
          {(
            <div className="space-y-3 sm:space-y-4">
              {/* 옛 «기존 업무에서 복사»는 «참고해서 시작» 창으로 합쳤다(2026-11-12) — 날짜·작업·담당자 재직·계보 규칙이 한 곳 */}
              {onStartFromReference && (
                <button
                  type="button"
                  onClick={onStartFromReference}
                  className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm text-blue-900 hover:bg-blue-100"
                >
                  <History className="h-4 w-4 shrink-0 text-blue-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">작년 같은 일·비슷한 일이 있나요?</span>
                    <span className="block text-xs text-blue-700">참고해서 시작하면 할 일·작업을 가져오고 작년 지식이 이어집니다</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium">참고해서 시작 →</span>
                </button>
              )}

              <Separator />
              <div className="space-y-2">
                <Label htmlFor="name">업무 이름 *</Label>
                <Input
                  id="name"
                  {...register('name', { required: '업무 이름을 입력해주세요' })}
                  placeholder="예: 2024년 1학기 중간고사"
                />
                {errors.name && (
                  <p className="text-sm text-red-600">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">설명</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  placeholder="업무에 대한 상세 설명을 입력하세요"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center">
                    <Building2 className="mr-2 h-4 w-4" />
                    주관 부서
                    {selectedDepartment && selectedDepartment !== 'none' && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        복사 시 선택한 부서에서 가져옴
                      </Badge>
                    )}
                  </Label>
                  <Select
                    value={selectedDepartment}
                    onValueChange={(value) => {
                      setSelectedDepartment(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="부서를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함</SelectItem>
                      {departments.map(dept => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workYear" className="flex items-center">
                    <Calendar className="mr-2 h-4 w-4" />
                    연도
                  </Label>
                  <Input
                    id="workYear"
                    type="number"
                    min={2020}
                    max={2099}
                    value={workYear}
                    onChange={(e) => setWorkYear(Number(e.target.value))}
                    className="w-24"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  책임자 (여러명 선택 가능) *
                </Label>
                <SearchableMultiSelect
                  filterByTeacher={true}
                  includeTagOptions={true}
                  selectedValues={Array.isArray(selectedManagerIds) ? selectedManagerIds : []}
                  onSelectionChange={(ids) => {
                    setValue('manager_ids', ids);
                  }}
                  placeholder="책임자를 검색하거나 선택하세요"
                  searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                  emptyText="검색된 책임자가 없습니다"
                  maxSelectedDisplay={2}
                />
                {errors.manager_ids && (
                  <p className="text-sm text-red-600">책임자를 선택해주세요</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>키워드</Label>
                <div className="flex space-x-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyPress={handleKeywordKeyPress}
                    placeholder="키워드를 입력하고 Enter를 누르세요"
                  />
                  <Button type="button" onClick={handleAddKeyword} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {keywords.map(keyword => (
                      <Badge key={keyword} variant="secondary" className="flex items-center">
                        {keyword}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-1 h-4 w-4 p-0"
                          onClick={() => handleRemoveKeyword(keyword)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {initialDraft && initialTasks.length > 0 && (
                <Card className="border-violet-200 bg-violet-50/40">
                  <CardContent className="space-y-3 pt-6">
                    <div>
                      <Label className="text-sm font-medium text-violet-900">문서에서 추출한 초기 할 일</Label>
                      <p className="mt-1 text-xs text-violet-700">
                        생성 전에 제목·설명·기한을 검토하고 수정할 수 있습니다.
                      </p>
                    </div>
                    {initialTasks.map((task, index) => (
                      <div key={`document-task-${index}`} className="space-y-2 rounded-lg border border-violet-200 bg-white p-3">
                        <div className="flex items-start gap-2">
                          <Input
                            {...register(`initial_tasks.${index}.title` as const, { required: true })}
                            aria-label={`${index + 1}번째 초기 할 일 제목`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 flex-shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => setValue(
                              'initial_tasks',
                              initialTasks.filter((_, taskIndex) => taskIndex !== index),
                              { shouldDirty: true }
                            )}
                            aria-label={`${task.title} 제외`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <Textarea
                          {...register(`initial_tasks.${index}.description` as const)}
                          rows={3}
                          aria-label={`${index + 1}번째 초기 할 일 설명`}
                        />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">기한</Label>
                            <Input
                              type="date"
                              {...register(`initial_tasks.${index}.due_date` as const)}
                            />
                          </div>
                          <div className="flex items-end text-xs text-muted-foreground">
                            {task.keywords?.length ? `분류: ${task.keywords.join(', ')}` : '분류 없음'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* 파일 첨부 */}
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <Label className="text-sm font-medium flex items-center">
                      <FileIcon className="mr-2 h-4 w-4" />
                      첨부 파일
                    </Label>
                    <CombinedFileUpload
                      localFiles={attachedFiles}
                      onLocalFilesChange={setAttachedFiles}
                      googleDriveFiles={googleDriveFiles}
                      onGoogleDriveFilesChange={setGoogleDriveFiles}
                      maxFileSize={5 * 1024 * 1024}
                      maxFiles={10}
                      showGoogleDrive={true}
                    />
                    <p className="text-xs text-muted-foreground">
                      업무 생성 시 선택한 파일들이 업로드됩니다.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Separator />

          <div className="flex justify-end">
            <div className="flex space-x-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                취소
              </Button>
              <Button
                type="submit"
                disabled={!watch('name') || !selectedManagerIds || selectedManagerIds.length === 0 || createWork.isPending}
              >
                {createWork.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {createWork.isPending ? '생성 중...' : '생성'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
