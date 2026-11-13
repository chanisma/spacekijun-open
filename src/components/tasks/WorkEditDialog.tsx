// ========================================
// Task Work Edit Dialog Component
// Complete implementation for editing works
// ========================================

import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  SearchableMultiSelect,
  SearchableMultiSelectItem,
} from '@/components/ui/searchable-multi-select';
import { CombinedFileUpload } from '@/components/ui/combined-file-upload';
import { EnhancedFileList } from '@/components/ui/file-list';
import { FileDeletionPreview } from '@/components/ui/file-deletion-preview';
import { TaskDepartmentSelect } from '@/components/ui/department-select';
import { useFileManagement } from '@/hooks/useFileManagement';
import type { Work } from '@/types/tasks';
import { useUpdateWorkJsonb } from '@/hooks/useTasksJsonb';
import { useUsers } from '@/hooks/useTasks';
import { Edit, X, Plus, Save, Loader2, File, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  TitleIconChip,
} from './dialogDesign';
import { toast } from '@/lib/toast';
import { supabase } from '@/integrations/supabase/client';

interface WorkEditDialogProps {
  work: Work | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EditFormData {
  name: string;
  description: string;
  status: string;
  keywords: string[];
  managers: Array<{ id: string; name: string }>;
  department: string;
  year: number;
}

export function WorkEditDialog({
  work,
  open,
  onOpenChange,
}: WorkEditDialogProps): JSX.Element | null {
  const [formData, setFormData] = useState<EditFormData>({
    name: '',
    description: '',
    status: 'active',
    keywords: [],
    managers: [],
    department: '',
    year: new Date().getFullYear(),
  });
  const [newKeyword, setNewKeyword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');

  const queryClient = useQueryClient();
  const updateMutation = useUpdateWorkJsonb();
  const { data: users } = useUsers();

  // File management using shared hook
  const fileManagement = useFileManagement({
    entityId: work?.id || null,
    entityType: 'event',
    onError: (message) => toast.error(message),
  });

  // Users를 SearchableMultiSelectItem 형태로 변환
  const userItems: SearchableMultiSelectItem[] = React.useMemo(() => {
    return (
      users?.map((user) => ({
        value: user.id,
        label: user.name,
        description: user.type || undefined,
      })) || []
    );
  }, [users]);

  // Initialize form data when work changes
  useEffect(() => {
    if (work && open) {
      const managers =
        work.meta?.managers && work.meta.managers.length > 0
          ? work.meta.managers
          : [];
      const workDepartment = work.meta?.department || '';

      const workYear = work.meta?.year || new Date(work.created_at).getFullYear();

      setFormData({
        name: work.name || '',
        description: work.description || '',
        status: work.status || 'active',
        keywords: work.keywords || [],
        managers,
        department: workDepartment,
        year: workYear,
      });

      setSelectedDepartment(workDepartment);
      setNewKeyword('');
      fileManagement.resetFileState();
    }
  }, [work, open]);

  // Load existing files when dialog opens
  useEffect(() => {
    if (work?.id && open) {
      fileManagement.loadExistingFiles();
    }
  }, [work?.id, open]);

  if (!work) return null;

  function handleInputChange(field: keyof EditFormData, value: any): void {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleAddKeyword(): void {
    if (newKeyword.trim() && !formData.keywords.includes(newKeyword.trim())) {
      setFormData((prev) => ({
        ...prev,
        keywords: [...prev.keywords, newKeyword.trim()],
      }));
      setNewKeyword('');
    }
  }

  function handleRemoveKeyword(index: number): void {
    setFormData((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((_, i) => i !== index),
    }));
  }

  function handleKeywordKeyPress(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const updateData = {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        keywords: formData.keywords,
        meta: {
          ...work.meta,
          department: selectedDepartment === 'none' ? undefined : selectedDepartment || undefined,
          year: formData.year,
          managers: formData.managers,
        },
      };

      await updateMutation.mutateAsync({
        id: work.id,
        data: updateData,
      });

      // Process file operations
      await fileManagement.processFileDeletions(work.id);
      await fileManagement.uploadNewFiles(work.id);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['work-detail-jsonb', work.id] });
      queryClient.invalidateQueries({ queryKey: ['work-files', work.id] });
      queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks-jsonb'] });

      fileManagement.resetFileState();
      setNewKeyword('');
      onOpenChange(false);
    } catch (error) {
      console.error('Work update error:', error);
      toast.error('업무 수정 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel(): void {
    if (work) {
      const managers =
        work.meta?.managers && work.meta.managers.length > 0
          ? work.meta.managers
          : [];
      const workDepartment = work.meta?.department || '';

      const workYear = work.meta?.year || new Date(work.created_at).getFullYear();

      setFormData({
        name: work.name || '',
        description: work.description || '',
        status: work.status || 'active',
        keywords: work.keywords || [],
        managers,
        department: workDepartment,
        year: workYear,
      });

      setSelectedDepartment(workDepartment);
    }
    setNewKeyword('');
    fileManagement.resetFileState();
    onOpenChange(false);
  }

  async function handleManagerSelectionChange(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      handleInputChange('managers', []);
      return;
    }

    try {
      const { data: resources } = await supabase
        .from('resource')
        .select('id, name')
        .in('id', ids);

      if (resources) {
        const managers = resources.map((resource) => ({
          id: resource.id,
          name: resource.name,
        }));
        handleInputChange('managers', managers);
      }
    } catch (error) {
      console.error('책임자 정보 로드 실패:', error);
    }
  }

  const filesToDeleteObjects = fileManagement.existingFiles.filter((file) =>
    fileManagement.filesToDelete.includes(file.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] min-w-0 max-w-md overflow-y-auto overflow-x-hidden p-0 sm:max-w-xl md:max-w-2xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg">
            <TitleIconChip icon={Edit} tone="blue" />
            업무 수정
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="min-w-0 max-w-full">
          <div className="space-y-4 px-4 py-4 sm:space-y-6 sm:px-6">
          {/* Basic Info */}
          <div className="grid gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="name" className="text-xs sm:text-sm font-medium">
                업무명 *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="업무명을 입력하세요"
                required
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                설명
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="업무에 대한 상세 설명을 입력하세요"
                rows={4}
                className="w-full resize-none"
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <TaskDepartmentSelect
                value={selectedDepartment}
                onChange={setSelectedDepartment}
              />

              <div className="space-y-2">
                <Label htmlFor="workYear" className="text-sm font-medium flex items-center">
                  <Calendar className="mr-2 h-4 w-4" />
                  연도
                </Label>
                <Input
                  id="workYear"
                  type="number"
                  min={2020}
                  max={2099}
                  value={formData.year}
                  onChange={(e) => handleInputChange('year', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status" className="text-sm font-medium">
                  상태 *
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleInputChange('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="상태 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">진행 중</SelectItem>
                    <SelectItem value="completed">완료</SelectItem>
                    <SelectItem value="cancelled">취소</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center">
                  <Edit className="mr-2 h-4 w-4" />
                  책임자 (여러명 선택 가능)
                </Label>
                <SearchableMultiSelect
                  filterByTeacher={true}
                  includeTagOptions={true}
                  selectedValues={formData.managers.map((m) => m.id)}
                  onSelectionChange={handleManagerSelectionChange}
                  placeholder="책임자를 검색하거나 선택하세요"
                  searchPlaceholder="이름을 입력하세요 (쉼표로 구분하여 여러명 입력 가능)"
                  emptyText="검색된 책임자가 없습니다"
                  maxSelectedDisplay={2}
                />
              </div>
            </div>
          </div>

          {/* Keyword Management */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Label className="text-sm font-medium">키워드</Label>

                {formData.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
                    {formData.keywords.map((keyword, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="flex items-center gap-1 px-3 py-1"
                      >
                        {keyword}
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(index)}
                          className="ml-1 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyPress={handleKeywordKeyPress}
                    placeholder="새 키워드 입력"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddKeyword}
                    disabled={!newKeyword.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <p className="text-xs text-gray-500">
                  Enter 키를 눌러 키워드를 추가할 수 있습니다.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* File Management */}
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

                {fileManagement.existingFiles.length > 0 && (
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
              onClick={handleCancel}
              disabled={isSubmitting}
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            >
              <X className="h-3.5 w-3.5" />
              취소
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.name.trim()}
              className="h-8 gap-1.5 px-4 text-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  수정 중...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  수정하기
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
