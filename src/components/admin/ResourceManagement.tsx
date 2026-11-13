import { useState, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Server, Search, Plus, Edit, Trash2, UserCheck, Upload, Download, Mail, Tags, FileSpreadsheet, FileText, Info, Wand2, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useResourceTags, useResourceTagAssignments, useUpdateResourceTags } from '@/hooks/useResourceTags';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDropdownDialog } from '@/hooks/useDropdownDialog';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { TimetableBulkImport } from './TimetableBulkImport';
import { ResourceCsvImport } from './ResourceCsvImport';
import { withoutPersonalPhone } from '@/utils/resourceMetaPrivacy';

interface Resource {
  id: string;
  type: 'teacher' | 'student' | 'room' | 'device' | 'group' | 'staff' | 'inactive';
  name: string;
  meta: Record<string, any> | string | null;
  created_at: string;
  updated_at: string;
}

const resourceTypeLabels = {
  teacher: '교사',
  student: '학생',
  room: '교실',
  device: '기기',
  group: '그룹',
  staff: '직원',
  inactive: '비활성'
};

export const ResourceManagement = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Resource['type']>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newResource, setNewResource] = useState({
    name: '',
    type: 'student' as Resource['type'],
    meta: '{}'
  });
  const [editingResource, setEditingResource] = useState<(Resource & { meta: string }) | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showBulkTagDialog, setShowBulkTagDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'replace'>('add');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emailFileInputRef = useRef<HTMLInputElement>(null);
  const { triggerDialog, dropdownContentProps } = useDropdownDialog();
  const [uploadDialogType, setUploadDialogType] = useState<'email' | 'bulk' | 'classTag' | null>(null);
  const [showResourceCsvDialog, setShowResourceCsvDialog] = useState(false);
  const [showTimetableDialog, setShowTimetableDialog] = useState(false);
  const [showAutoTagDialog, setShowAutoTagDialog] = useState(false);
  const [isSectionCleanupRunning, setIsSectionCleanupRunning] = useState(false);
  const [autoTagPreview, setAutoTagPreview] = useState<{ resourceId: string; name: string; grades: number[]; tagIds: string[] }[]>([]);

  // 태그 관련 hooks
  const { data: allTags = [] } = useResourceTags();
  const resourceIds = useMemo(() => resources.map(r => r.id), [resources]);
  const { data: tagAssignments } = useResourceTagAssignments(resourceIds);
  const updateResourceTags = useUpdateResourceTags();

  const fetchResources = async () => {
    try {
      const { data, error } = await supabase
        .from('resource')
        .select('*')
        .in('type', ['teacher', 'staff', 'inactive'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('리소스 조회 오류:', error);
        toast({
          title: '오류',
          description: '리소스 목록을 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      setResources((data as Resource[]) || []);
    } catch (error) {
      console.error('리소스 조회 중 오류:', error);
      toast({
        title: '오류',
        description: '리소스 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshResourcesAfterSave = async () => {
    await Promise.all([
      fetchResources(),
      queryClient.invalidateQueries({ queryKey: ['resources'] }),
    ]);
  };

  const handleBackupAndDeleteSections = async () => {
    setIsSectionCleanupRunning(true);
    try {
      // 1. DB에서 teacher 타입 리소스를 직접 조회
      const { data: teacherResources, error: fetchError } = await supabase
        .from('resource')
        .select('id, name, meta')
        .eq('type', 'teacher');

      if (fetchError) throw fetchError;

      // 2. section 데이터가 있는 리소스만 필터 (section은 객체)
      const resourcesWithSection = (teacherResources || []).filter((r) => {
        const meta = r.meta as Record<string, any> | null;
        return meta && meta.section && typeof meta.section === 'object' && Object.keys(meta.section).length > 0;
      });

      if (resourcesWithSection.length === 0) {
        toast({ title: '알림', description: 'section 데이터가 있는 교사 리소스가 없습니다.' });
        return;
      }

      // 3. 백업 JSON 생성 및 다운로드
      const backupData = resourcesWithSection.map((r) => ({
        id: r.id,
        name: r.name,
        section: (r.meta as Record<string, any>).section,
      }));

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `teacher_sections_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 4. DB에서 각 리소스의 meta.section 삭제 (나머지 meta 보존)
      let successCount = 0;
      for (const r of resourcesWithSection) {
        const { section, ...restMeta } = withoutPersonalPhone(
          r.meta as Record<string, unknown>
        );

        const { error } = await supabase
          .from('resource')
          .update({ meta: restMeta })
          .eq('id', r.id);

        if (!error) successCount++;
      }

      toast({
        title: '완료',
        description: `${successCount}/${resourcesWithSection.length}개 리소스의 section 데이터를 백업 후 삭제했습니다.`,
      });

      await refreshResourcesAfterSave();
    } catch (error) {
      console.error('Section backup & delete error:', error);
      toast({ title: '오류', description: 'section 백업/삭제 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setIsSectionCleanupRunning(false);
    }
  };

  const createResource = async () => {
    if (!newResource.name.trim()) {
      toast({
        title: '오류',
        description: '리소스 이름을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      let meta;
      try {
        meta = JSON.parse(newResource.meta);
      } catch {
        meta = {};
      }

      const { error } = await supabase
        .from('resource')
        .insert([{
          name: newResource.name.trim(),
          type: newResource.type,
          meta: withoutPersonalPhone(meta)
        }]);

      if (error) {
        console.error('리소스 생성 오류:', error);
        toast({
          title: '오류',
          description: '리소스를 생성하는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }


      setNewResource({ name: '', type: 'student', meta: '{}' });
      setShowAddDialog(false);
      await refreshResourcesAfterSave();
    } catch (error) {
      console.error('리소스 생성 중 오류:', error);
      toast({
        title: '오류',
        description: '리소스를 생성하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const editResource = async () => {
    if (!editingResource || !editingResource.name.trim()) {
      toast({
        title: '오류',
        description: '리소스 이름을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      let meta;
      try {
        meta = typeof editingResource.meta === 'string' 
          ? JSON.parse(editingResource.meta as string) 
          : editingResource.meta;
      } catch {
        meta = {};
      }

      const { error } = await supabase
        .from('resource')
        .update({
          name: editingResource.name.trim(),
          type: editingResource.type,
          meta: withoutPersonalPhone(meta)
        })
        .eq('id', editingResource.id);

      if (error) {
        console.error('리소스 수정 오류:', error);
        toast({
          title: '오류',
          description: '리소스를 수정하는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      // 태그 업데이트
      await updateResourceTags.mutateAsync({
        resourceId: editingResource.id,
        tagIds: selectedTagIds,
      });


      setEditingResource(null);
      setSelectedTagIds([]);
      setShowEditDialog(false);
      await refreshResourcesAfterSave();
    } catch (error) {
      console.error('리소스 수정 중 오류:', error);
      toast({
        title: '오류',
        description: '리소스를 수정하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const deleteResource = async (id: string) => {
    try {
      // 1. 참조 확인
      const references = await checkResourceReferences(id);

      if (references.hasReferences) {
        // 참조가 있으면 상세 정보와 함께 경고
        const referenceDetails = [];
        if (references.userCount > 0) referenceDetails.push(`사용자 연결 ${references.userCount}건`);

        const shouldContinue = confirm(
          `이 리소스는 다음 데이터에서 참조되고 있습니다:\n\n${referenceDetails.join('\n')}\n\n삭제하면 참조가 제거됩니다. 계속하시겠습니까?`
        );

        if (!shouldContinue) return;

        // 2. 참조 제거 (NULL로 설정)
        await clearResourceReferences(id);
      }

      // 3. 리소스 삭제
      const { error } = await supabase
        .from('resource')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('리소스 삭제 오류:', error);
        toast({
          title: '오류',
          description: '리소스를 삭제하는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }


      await refreshResourcesAfterSave();
    } catch (error) {
      console.error('리소스 삭제 중 오류:', error);
      toast({
        title: '오류',
        description: '리소스를 삭제하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  // 리소스 참조 확인
  const checkResourceReferences = async (resourceId: string) => {
    try {
      const userResult = await supabase
        .from('user_resource')
        .select('user_id', { count: 'exact', head: true })
        .eq('resource_id', resourceId);

      const userCount = userResult.count || 0;

      return {
        hasReferences: userCount > 0,
        userCount
      };
    } catch (error) {
      console.error('참조 확인 오류:', error);
      return { hasReferences: false, userCount: 0 };
    }
  };

  // 리소스 참조 제거
  const clearResourceReferences = async (resourceId: string) => {
    try {
      await supabase
        .from('user_resource')
        .delete()
        .eq('resource_id', resourceId);
    } catch (error) {
      console.error('참조 제거 오류:', error);
      throw error;
    }
  };

  const applyBulkTags = async () => {
    if (selectedIds.size === 0) return;

    try {
      const resourceIdArray = Array.from(selectedIds);
      let successCount = 0;

      for (const resourceId of resourceIdArray) {
        try {
          if (bulkTagMode === 'replace') {
            // 기존 태그를 새 태그로 교체
            await updateResourceTags.mutateAsync({
              resourceId,
              tagIds: bulkTagIds,
            });
          } else {
            // 기존 태그에 새 태그 추가
            const existingTags = tagAssignments?.get(resourceId)?.map(t => t.id) || [];
            const combinedTags = [...new Set([...existingTags, ...bulkTagIds])];
            await updateResourceTags.mutateAsync({
              resourceId,
              tagIds: combinedTags,
            });
          }
          successCount++;
        } catch (error) {
          console.error(`리소스 ${resourceId} 태그 업데이트 오류:`, error);
        }
      }

      toast({
        title: '성공',
        description: `${successCount}명의 교직원에게 태그가 ${bulkTagMode === 'replace' ? '설정' : '추가'}되었습니다.`,
      });

      setShowBulkTagDialog(false);
      setBulkTagIds([]);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('일괄 태그 설정 오류:', error);
      toast({
        title: '오류',
        description: '태그 설정 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const prepareAutoTagPreview = () => {
    // Find grade tags (1학년, 2학년, 3학년)
    const gradeTagMap: Record<number, string> = {};
    allTags.forEach(tag => {
      const match = tag.name.match(/^(\d)학년$/);
      if (match) gradeTagMap[parseInt(match[1])] = tag.id;
    });

    const preview: typeof autoTagPreview = [];

    for (const resource of resources) {
      const meta = resource.meta as Record<string, any> | null;
      const section = meta?.section;
      if (!section || typeof section !== 'object') continue;

      // Extract grades from section keys like "과목명 G-C"
      const grades = new Set<number>();
      for (const key of Object.keys(section)) {
        const match = key.match(/(\d)-\d+$/);
        if (match) grades.add(parseInt(match[1]));
      }

      if (grades.size === 0) continue;

      const tagIds = Array.from(grades)
        .filter(g => gradeTagMap[g])
        .map(g => gradeTagMap[g]);

      if (tagIds.length === 0) continue;

      preview.push({
        resourceId: resource.id,
        name: resource.name,
        grades: Array.from(grades).sort(),
        tagIds,
      });
    }

    setAutoTagPreview(preview);
    setShowAutoTagDialog(true);
  };

  const handleApplyAutoTag = async () => {
    if (autoTagPreview.length === 0) return;

    setUploading(true);
    let successCount = 0;

    for (const item of autoTagPreview) {
      try {
        // Merge with existing tags
        const existingTags = tagAssignments?.get(item.resourceId)?.map(t => t.id) || [];
        const combinedTags = [...new Set([...existingTags, ...item.tagIds])];
        await updateResourceTags.mutateAsync({
          resourceId: item.resourceId,
          tagIds: combinedTags,
        });
        successCount++;
      } catch (error) {
        console.error(`Auto-tag error for ${item.name}:`, error);
      }
    }

    toast({
      title: '완료',
      description: `${successCount}명의 교직원에게 학년 태그가 설정되었습니다.`,
    });

    setShowAutoTagDialog(false);
    setAutoTagPreview([]);
    setUploading(false);
  };

  const [showResetGradeTagDialog, setShowResetGradeTagDialog] = useState(false);
  const [showResetClassTagDialog, setShowResetClassTagDialog] = useState(false);
  const classTagFileInputRef = useRef<HTMLInputElement>(null);

  const handleResetGradeTags = async () => {
    // 학년 태그 ID 찾기
    const gradeTagIds = new Set<string>();
    allTags.forEach(tag => {
      if (/^\d학년$/.test(tag.name)) gradeTagIds.add(tag.id);
    });

    if (gradeTagIds.size === 0) {
      toast({ title: '알림', description: '학년 태그가 존재하지 않습니다.' });
      return;
    }

    setUploading(true);
    let successCount = 0;

    for (const resource of resources) {
      const existingTags = tagAssignments?.get(resource.id)?.map(t => t.id) || [];
      const hasGradeTag = existingTags.some(id => gradeTagIds.has(id));
      if (!hasGradeTag) continue;

      const filteredTags = existingTags.filter(id => !gradeTagIds.has(id));
      try {
        await updateResourceTags.mutateAsync({
          resourceId: resource.id,
          tagIds: filteredTags,
        });
        successCount++;
      } catch (error) {
        console.error(`Grade tag reset error for ${resource.name}:`, error);
      }
    }

    toast({
      title: '완료',
      description: `${successCount}명의 교직원에서 학년 태그를 초기화했습니다.`,
    });

    setShowResetGradeTagDialog(false);
    setUploading(false);
  };

  const handleClassTagCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({ title: '오류', description: 'CSV 파일만 업로드할 수 있습니다.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        toast({ title: '오류', description: '최소 헤더와 데이터 1줄이 필요합니다.', variant: 'destructive' });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      if (headers.length < 3 || headers[0] !== '이름' || headers[1] !== '학년' || headers[2] !== '반') {
        toast({ title: '오류', description: '헤더는 "이름,학년,반" 형식이어야 합니다.', variant: 'destructive' });
        return;
      }

      // 태그 매핑: "N학년 M반" -> tag ID
      const classTagMap = new Map<string, string>();
      allTags.forEach(tag => {
        if (/^\d학년 \d+반$/.test(tag.name)) classTagMap.set(tag.name, tag.id);
      });

      let successCount = 0;
      let notFoundCount = 0;
      let noTagCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < 3) continue;

        const [name, grade, classNum] = values;
        if (!name || !grade || !classNum) continue;

        const classTagName = `${grade}학년 ${classNum}반`;
        const classTagId = classTagMap.get(classTagName);

        if (!classTagId) {
          noTagCount++;
          console.warn(`태그 "${classTagName}"을 찾을 수 없습니다.`);
          continue;
        }

        // 이름으로 리소스 찾기
        const resource = resources.find(r => r.name === name);
        if (!resource) {
          notFoundCount++;
          console.warn(`교직원 "${name}"을 찾을 수 없습니다.`);
          continue;
        }

        // 기존 태그에 반 태그 추가
        const existingTags = tagAssignments?.get(resource.id)?.map(t => t.id) || [];
        const combinedTags = [...new Set([...existingTags, classTagId])];

        try {
          await updateResourceTags.mutateAsync({ resourceId: resource.id, tagIds: combinedTags });
          successCount++;
        } catch (error) {
          console.error(`태그 설정 오류 (${name}):`, error);
        }
      }

      const messages = [`${successCount}명의 교직원에게 학년/반 태그가 설정되었습니다.`];
      if (notFoundCount > 0) messages.push(`${notFoundCount}명을 찾을 수 없습니다.`);
      if (noTagCount > 0) messages.push(`${noTagCount}건의 태그가 존재하지 않습니다.`);

      toast({ title: '완료', description: messages.join(' ') });

      setUploadDialogType(null);
      if (classTagFileInputRef.current) classTagFileInputRef.current.value = '';
    } catch (error) {
      console.error('학년/반 CSV 처리 오류:', error);
      toast({ title: '오류', description: '파일 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleResetClassTags = async () => {
    // "N학년 M반" 패턴 태그 ID 찾기
    const classTagIds = new Set<string>();
    allTags.forEach(tag => {
      if (/^\d학년 \d+반$/.test(tag.name)) classTagIds.add(tag.id);
    });

    if (classTagIds.size === 0) {
      toast({ title: '알림', description: '학년/반 태그가 존재하지 않습니다.' });
      return;
    }

    setUploading(true);
    let successCount = 0;

    for (const resource of resources) {
      const existingTags = tagAssignments?.get(resource.id)?.map(t => t.id) || [];
      const hasClassTag = existingTags.some(id => classTagIds.has(id));
      if (!hasClassTag) continue;

      const filteredTags = existingTags.filter(id => !classTagIds.has(id));
      try {
        await updateResourceTags.mutateAsync({ resourceId: resource.id, tagIds: filteredTags });
        successCount++;
      } catch (error) {
        console.error(`학년/반 태그 초기화 오류 (${resource.name}):`, error);
      }
    }

    toast({ title: '완료', description: `${successCount}명의 교직원에서 학년/반 태그를 초기화했습니다.` });
    setShowResetClassTagDialog(false);
    setUploading(false);
  };

  const deleteSelectedResources = async () => {
    if (selectedIds.size === 0) return;

    try {
      const { error } = await supabase
        .from('resource')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) {
        console.error('리소스 일괄 삭제 오류:', error);
        toast({
          title: '오류',
          description: '리소스를 삭제하는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: '성공',
        description: `${selectedIds.size}개의 리소스가 삭제되었습니다.`,
      });

      setSelectedIds(new Set());
      await refreshResourcesAfterSave();
    } catch (error) {
      console.error('리소스 일괄 삭제 중 오류:', error);
      toast({
        title: '오류',
        description: '리소스를 삭제하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: '오류',
        description: 'CSV 파일만 업로드할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({
          title: '오류',
          description: '최소 헤더와 데이터 1줄이 필요합니다.',
          variant: 'destructive',
        });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      if (headers.length < 2 || headers[0] !== '이름' || headers[1] !== '타입') {
        toast({
          title: '오류',
          description: '첫 번째 열은 "이름", 두 번째 열은 "타입"이어야 합니다.',
          variant: 'destructive',
        });
        return;
      }

      const metaHeaders = headers.slice(2);
      const resources: Array<{ name: string; type: Resource['type']; meta: Record<string, any> }> = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < 2) continue;

        const name = values[0];
        const type = values[1] as Resource['type'];

        if (!['teacher', 'student', 'room', 'device', 'group', 'staff'].includes(type)) {
          toast({
            title: '오류',
            description: `${i + 1}번째 줄: 유효하지 않은 타입 "${type}"`,
            variant: 'destructive',
          });
          return;
        }

        const meta: Record<string, any> = {};
        metaHeaders.forEach((header, index) => {
          const value = values[index + 2];
          if (value && value.trim()) {
            meta[header] = value.trim();
          }
        });

        resources.push({ name, type, meta: withoutPersonalPhone(meta) });
      }

      // 일괄 삽입
      const { error } = await supabase
        .from('resource')
        .insert(resources);

      if (error) {
        console.error('일괄 리소스 생성 오류:', error);
        toast({
          title: '오류',
          description: '일괄 리소스 생성에 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: '성공',
        description: `${resources.length}개의 리소스가 생성되었습니다.`,
      });

      setUploadDialogType(null);
      await refreshResourcesAfterSave();
      
      // 파일 입력 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('파일 처리 중 오류:', error);
      toast({
        title: '오류',
        description: '파일을 처리하는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      '이름,타입,부서,과목,학년,반,번호,용량',
      '김선생,teacher,수학과,수학,,,',
      '박학생,student,,,1,3,15,',
      '301교실,room,,,,,40,classroom',
      '프로젝터,device,,,,,portable'
    ].join('\n');

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, sampleData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'resource_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadClassTagSampleCSV = () => {
    const sampleData = [
      '이름,학년,반',
      '김선생,1,3',
      '이선생,2,5',
      '박선생,3,1'
    ].join('\n');

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, sampleData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'class_tag_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadEmailSampleCSV = () => {
    const sampleData = [
      '이름,이메일',
      '김선생,kim@school.com',
      '이선생,lee@school.com',
      '박직원,park@school.com'
    ].join('\n');

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, sampleData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'staff_email_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEmailFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: '오류',
        description: 'CSV 파일만 업로드할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        toast({
          title: '오류',
          description: '최소 헤더와 데이터 1줄이 필요합니다.',
          variant: 'destructive',
        });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());
      if (headers.length < 2 || headers[0] !== '교사명' || headers[1] !== '이메일') {
        toast({
          title: '오류',
          description: '첫 번째 열은 "교사명", 두 번째 열은 "이메일"이어야 합니다.',
          variant: 'destructive',
        });
        return;
      }

      const emailUpdates: Array<{ name: string; email: string }> = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < 2) continue;

        const name = values[0];
        const email = values[1];

        if (!name || !email) {
          errors.push(`${i + 1}번째 줄: 교사명 또는 이메일이 비어있습니다.`);
          continue;
        }

        // 이메일 형식 간단 검증
        if (!email.includes('@')) {
          errors.push(`${i + 1}번째 줄: "${email}"은 유효한 이메일 형식이 아닙니다.`);
          continue;
        }

        emailUpdates.push({ name, email });
      }

      if (errors.length > 0) {
        toast({
          title: '경고',
          description: `${errors.length}개의 오류가 발생했습니다:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? '\n...' : ''}`,
          variant: 'destructive',
        });
        if (emailUpdates.length === 0) return;
      }

      // 각 교사명으로 리소스를 찾아서 이메일을 meta.email에 저장
      let successCount = 0;
      let notFoundCount = 0;

      for (const { name, email } of emailUpdates) {
        // 이름으로 교사/직원 리소스 찾기
        const { data: resourceData, error: findError } = await supabase
          .from('resource')
          .select('id, meta')
          .in('type', ['teacher', 'staff', 'inactive'])
          .eq('name', name)
          .single();

        if (findError || !resourceData) {
          notFoundCount++;
          console.warn(`교직원 "${name}"을 찾을 수 없습니다.`);
          continue;
        }

        // 기존 meta에 email 추가
        const currentMeta = withoutPersonalPhone(
          resourceData.meta as Record<string, unknown> | null
        );
        const updatedMeta = { ...currentMeta, email };

        // 리소스 업데이트
        const { error: updateError } = await supabase
          .from('resource')
          .update({ meta: updatedMeta })
          .eq('id', resourceData.id);

        if (updateError) {
          console.error(`교사 "${name}" 업데이트 오류:`, updateError);
        } else {
          successCount++;
        }
      }

      toast({
        title: '완료',
        description: `${successCount}개의 이메일이 등록되었습니다.${notFoundCount > 0 ? `\n${notFoundCount}명의 교직원을 찾을 수 없습니다.` : ''}`,
      });

      setUploadDialogType(null);
      await refreshResourcesAfterSave();

      // 파일 입력 초기화
      if (emailFileInputRef.current) {
        emailFileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('파일 처리 중 오류:', error);
      toast({
        title: '오류',
        description: '파일을 처리하는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const filteredResources = resources.filter(resource => {
    const matchesSearch = resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         resource.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || resource.type === typeFilter;
    const matchesTag = tagFilter === 'all'
      || (tagFilter === 'none'
        ? !(tagAssignments?.get(resource.id)?.length)
        : tagAssignments?.get(resource.id)?.some(t => t.id === tagFilter));
    return matchesSearch && matchesType && matchesTag;
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredResources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredResources.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-5 w-5" />
            <span>리소스 관리</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Server className="h-5 w-5" />
            <span>교직원 리소스 관리</span>
          </CardTitle>
          <div className="flex space-x-2">
            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBulkTagIds([]);
                    setBulkTagMode('add');
                    setShowBulkTagDialog(true);
                  }}
                >
                  <Tags className="h-4 w-4 mr-2" />
                  태그 설정 ({selectedIds.size})
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      선택 삭제 ({selectedIds.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>리소스 삭제</AlertDialogTitle>
                      <AlertDialogDescription>
                        선택된 {selectedIds.size}개의 리소스를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteSelectedResources}>삭제</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSectionCleanupRunning}
                  className="text-orange-600 border-orange-300 hover:bg-orange-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  분반 백업 & 삭제
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>분반(section) 데이터 백업 & 삭제</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div>
                      <p>모든 교직원 리소스의 <strong>meta.section</strong> 데이터를 JSON 파일로 백업한 후 DB에서 삭제합니다.</p>
                      <p className="mt-2">나머지 meta 데이터(grade, class, email 등)는 유지됩니다.</p>
                      <p className="mt-1">이 작업은 되돌릴 수 없으므로 백업 파일을 잘 보관하세요.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleBackupAndDeleteSections}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    백업 후 삭제
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  데이터 업로드
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" {...dropdownContentProps}>
                <DropdownMenuLabel>데이터 가져오기</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => triggerDialog(() => setUploadDialogType('email'))}>
                  <Mail className="h-4 w-4 mr-2" />
                  이메일 등록 CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => triggerDialog(() => setShowResourceCsvDialog(true))}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  수업 데이터 CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => triggerDialog(() => setShowTimetableDialog(true))}>
                  <FileText className="h-4 w-4 mr-2" />
                  시간표 교사 CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => triggerDialog(() => setUploadDialogType('bulk'))}>
                  <Upload className="h-4 w-4 mr-2" />
                  리소스 일괄 추가
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>자동 설정</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => triggerDialog(prepareAutoTagPreview)}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  학년 태그 자동 설정
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => triggerDialog(() => setShowResetGradeTagDialog(true))}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  학년 태그 초기화
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>학년/반 태그</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => triggerDialog(() => setUploadDialogType('classTag'))}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  학년/반 태그 CSV 설정
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => triggerDialog(() => setShowResetClassTagDialog(true))}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  학년/반 태그 초기화
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ResourceCsvImport onImportComplete={refreshResourcesAfterSave} open={showResourceCsvDialog} onOpenChange={setShowResourceCsvDialog} />
            <TimetableBulkImport onImportComplete={refreshResourcesAfterSave} open={showTimetableDialog} onOpenChange={setShowTimetableDialog} />
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  리소스 추가
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>새 리소스 추가</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="resource-name">리소스 이름</Label>
                    <Input
                      id="resource-name"
                      value={newResource.name}
                      onChange={(e) => setNewResource(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="리소스 이름을 입력하세요"
                    />
                  </div>
                  <div>
                    <Label htmlFor="resource-type">타입</Label>
                    <Select value={newResource.type} onValueChange={(value: Resource['type']) => 
                      setNewResource(prev => ({ ...prev, type: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(resourceTypeLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="resource-meta">메타데이터 (JSON)</Label>
                    <Textarea
                      id="resource-meta"
                      value={newResource.meta}
                      onChange={(e) => setNewResource(prev => ({ ...prev, meta: e.target.value }))}
                      placeholder='{"key": "value"}'
                      rows={3}
                    />
                  </div>
                  <DialogFooter className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      취소
                    </Button>
                    <Button onClick={createResource}>
                      생성
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="교직원명, ID로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 타입</SelectItem>
                <SelectItem value="teacher">교사</SelectItem>
                <SelectItem value="staff">직원</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 태그</SelectItem>
                <SelectItem value="none">태그 없음</SelectItem>
                {allTags.map(tag => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color || '#94a3b8' }}
                      />
                      {tag.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Resource Table */}
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.size === filteredResources.length && filteredResources.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="min-w-[150px]">이름</TableHead>
                  <TableHead className="w-24">타입</TableHead>
                  <TableHead className="min-w-[120px]">태그</TableHead>
                  <TableHead className="w-24 text-center hidden md:table-cell">메타데이터</TableHead>
                  <TableHead className="w-20 text-center">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? '검색 결과가 없습니다.' : '등록된 교직원 리소스가 없습니다.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredResources.map((resource) => (
                    <TableRow key={resource.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(resource.id)}
                          onCheckedChange={() => toggleSelect(resource.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{resource.name}</div>
                          <div className="text-sm text-muted-foreground font-mono">
                            {resource.id.substring(0, 8)}...
                          </div>
                          {/* 모바일에서 메타데이터 버튼 */}
                          {resource.meta && Object.keys(resource.meta).length > 0 && (
                            <div className="md:hidden mt-1">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs gap-1 text-muted-foreground">
                                    <Eye className="h-3 w-3" />
                                    메타 {Object.keys(resource.meta).length}개
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-0" align="start">
                                  <div className="p-3 border-b">
                                    <p className="text-sm font-medium">{resource.name} 메타데이터</p>
                                  </div>
                                  <pre className="text-xs p-3 max-h-[300px] overflow-auto">
                                    {JSON.stringify(resource.meta, null, 2)}
                                  </pre>
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {resourceTypeLabels[resource.type]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {tagAssignments?.get(resource.id)?.map((tag) => (
                            <Badge
                              key={tag.id}
                              style={{ backgroundColor: tag.color, color: 'white' }}
                              className="text-xs"
                            >
                              {tag.name}
                            </Badge>
                          )) || <span className="text-xs text-muted-foreground">-</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-center">
                        {resource.meta && Object.keys(resource.meta).length > 0 ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                                <Eye className="h-3 w-3" />
                                {Object.keys(resource.meta).length}개
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-0" align="start">
                              <div className="p-3 border-b">
                                <p className="text-sm font-medium">{resource.name} 메타데이터</p>
                              </div>
                              <pre className="text-xs p-3 max-h-[300px] overflow-auto">
                                {JSON.stringify(resource.meta, null, 2)}
                              </pre>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                       <TableCell className="text-center">
                         <div className="flex items-center justify-center space-x-1">
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => {
                               setEditingResource({
                                 ...resource,
                                 meta: JSON.stringify(resource.meta || {}, null, 2)
                               });
                               // 현재 리소스의 태그 ID 설정
                               const currentTags = tagAssignments?.get(resource.id) || [];
                               setSelectedTagIds(currentTags.map(t => t.id));
                               setShowEditDialog(true);
                             }}
                             className="h-8 w-8 p-0"
                           >
                             <Edit className="h-3 w-3" />
                           </Button>
                           <AlertDialog>
                             <AlertDialogTrigger asChild>
                               <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                                 <Trash2 className="h-3 w-3" />
                               </Button>
                             </AlertDialogTrigger>
                             <AlertDialogContent>
                               <AlertDialogHeader>
                                 <AlertDialogTitle>리소스 삭제</AlertDialogTitle>
                                 <AlertDialogDescription>
                                   "{resource.name}" 리소스를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                                 </AlertDialogDescription>
                               </AlertDialogHeader>
                               <AlertDialogFooter>
                                 <AlertDialogCancel>취소</AlertDialogCancel>
                                 <AlertDialogAction onClick={() => deleteResource(resource.id)}>삭제</AlertDialogAction>
                               </AlertDialogFooter>
                             </AlertDialogContent>
                           </AlertDialog>
                         </div>
                       </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{resources.filter(r => r.type === 'teacher').length}</div>
                <p className="text-sm text-muted-foreground">전체 선생님</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{resources.length}</div>
                <p className="text-sm text-muted-foreground">전체 교직원</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{filteredResources.length}</div>
                <p className="text-sm text-muted-foreground">검색 결과</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>

      {/* Upload Guide Dialog */}
      <Dialog open={uploadDialogType !== null} onOpenChange={(open) => !open && setUploadDialogType(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {uploadDialogType === 'email' ? (
                <><Mail className="h-5 w-5 text-blue-600" /> 교직원 이메일 등록</>
              ) : uploadDialogType === 'classTag' ? (
                <><Tags className="h-5 w-5 text-emerald-600" /> 학년/반 태그 CSV 설정</>
              ) : (
                <><Upload className="h-5 w-5 text-indigo-600" /> 리소스 일괄 추가</>
              )}
            </DialogTitle>
            <DialogDescription>
              {uploadDialogType === 'email'
                ? '교직원 이메일이 포함된 CSV 파일을 업로드합니다.'
                : uploadDialogType === 'classTag'
                ? '이름, 학년, 반 정보가 포함된 CSV 파일로 태그를 설정합니다.'
                : '리소스 정보가 포함된 CSV 파일로 일괄 추가합니다.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {uploadDialogType === 'email' ? (
              <>
                <div className="rounded-md border p-3 bg-blue-50/50 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-blue-600" />
                    CSV 파일 형식 안내
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    교사명과 이메일이 포함된 CSV 파일을 사용합니다. 구분자는 <code className="bg-muted px-1 rounded">|</code> (파이프)입니다.
                  </p>
                </div>

                <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">컬럼 구조</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-3 font-medium">교사명</th>
                          <th className="text-left py-1 font-medium">이메일</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b border-dashed">
                          <td className="py-1 pr-3">김선생</td>
                          <td><code className="bg-muted px-1 rounded">kim@school.com</code></td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-3">이선생</td>
                          <td><code className="bg-muted px-1 rounded">lee@school.com</code></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-md border p-3 bg-amber-50/50 space-y-1">
                  <h4 className="text-xs font-semibold text-amber-700">참고사항</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>이름으로 리소스(교사/직원)를 검색하여 meta.email에 저장됩니다</li>
                    <li>헤더: <code className="bg-muted px-1 rounded">교사명,이메일</code></li>
                    <li>리소스에 등록된 이름과 정확히 일치해야 합니다</li>
                  </ul>
                </div>

                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={downloadEmailSampleCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    샘플 파일 다운로드
                  </Button>
                </div>
              </>
            ) : uploadDialogType === 'classTag' ? (
              <>
                <div className="rounded-md border p-3 bg-emerald-50/50 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-emerald-600" />
                    CSV 파일 형식 안내
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    이름, 학년, 반 정보가 포함된 CSV 파일을 사용합니다. 구분자는 <code className="bg-muted px-1 rounded">|</code> (파이프)입니다.
                  </p>
                </div>

                <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">컬럼 구조</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-3 font-medium">이름</th>
                          <th className="text-left py-1 pr-3 font-medium">학년</th>
                          <th className="text-left py-1 font-medium">반</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b border-dashed">
                          <td className="py-1 pr-3">김선생</td>
                          <td className="pr-3">1</td>
                          <td>3</td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-3">이선생</td>
                          <td className="pr-3">2</td>
                          <td>5</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-md border p-3 bg-amber-50/50 space-y-1">
                  <h4 className="text-xs font-semibold text-amber-700">참고사항</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>헤더: <code className="bg-muted px-1 rounded">이름,학년,반</code></li>
                    <li>반 태그만 설정됩니다 (예: "1학년 3반"). 학년 태그는 별도 설정하세요</li>
                    <li>기존 태그(교과, 부장 등)는 유지되고 추가됩니다</li>
                    <li>리소스에 등록된 이름과 정확히 일치해야 합니다</li>
                  </ul>
                </div>

                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={downloadClassTagSampleCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    샘플 파일 다운로드
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-md border p-3 bg-indigo-50/50 space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-indigo-600" />
                    CSV 파일 형식 안내
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    리소스 정보가 포함된 CSV 파일을 사용합니다. 구분자는 <code className="bg-muted px-1 rounded">|</code> (파이프)입니다.
                  </p>
                </div>

                <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">컬럼 구조</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 pr-3 font-medium">이름</th>
                          <th className="text-left py-1 pr-3 font-medium">타입</th>
                          <th className="text-left py-1 font-medium">메타 변수...</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        <tr className="border-b border-dashed">
                          <td className="py-1 pr-3">김선생</td>
                          <td className="pr-3">teacher</td>
                          <td>수학과</td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-3">박직원</td>
                          <td className="pr-3">staff</td>
                          <td>행정실</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-md border p-3 bg-amber-50/50 space-y-1">
                  <h4 className="text-xs font-semibold text-amber-700">참고사항</h4>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>타입: teacher, student, room, device, group, staff 중 하나</li>
                    <li>3열 이후는 메타데이터로 저장됩니다</li>
                    <li>헤더 행의 3열 이후 값이 메타데이터 키가 됩니다</li>
                  </ul>
                </div>

                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={downloadSampleCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    샘플 파일 다운로드
                  </Button>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setUploadDialogType(null)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (uploadDialogType === 'email') {
                  emailFileInputRef.current?.click();
                } else if (uploadDialogType === 'classTag') {
                  classTagFileInputRef.current?.click();
                } else {
                  fileInputRef.current?.click();
                }
              }}
              disabled={uploading}
              className={
                uploadDialogType === 'email' ? 'bg-blue-600 hover:bg-blue-700'
                : uploadDialogType === 'classTag' ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
              }
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? '업로드 중...' : 'CSV 파일 선택'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Tag Dialog */}
      <Dialog open={showAutoTagDialog} onOpenChange={(open) => { if (!open) { setShowAutoTagDialog(false); setAutoTagPreview([]); } }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-violet-600" />
              학년 태그 자동 설정
            </DialogTitle>
            <DialogDescription>
              수업 데이터(meta.section)의 과목명에서 학년 정보를 추출하여 태그를 자동 설정합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="text-sm">
              대상: <strong>{autoTagPreview.length}</strong>명
            </div>

            {autoTagPreview.length > 0 ? (
              <div className="border rounded-md overflow-auto flex-1 max-h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>교직원</TableHead>
                      <TableHead className="text-center">설정할 학년 태그</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {autoTagPreview.map((item) => (
                      <TableRow key={item.resourceId}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {item.grades.map(g => {
                              const tag = allTags.find(t => t.name === `${g}학년`);
                              return (
                                <Badge
                                  key={g}
                                  style={tag ? { backgroundColor: tag.color, color: 'white' } : {}}
                                  className="text-xs"
                                >
                                  {g}학년
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                수업 데이터가 있는 교직원이 없습니다.
              </div>
            )}

            <div className="rounded-md border p-3 bg-amber-50/50 space-y-1">
              <h4 className="text-xs font-semibold text-amber-700">참고사항</h4>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>과목명의 <code className="bg-muted px-1 rounded">G-C</code> 패턴에서 G(학년)를 추출합니다</li>
                <li>기존 태그는 유지되고, 학년 태그만 추가됩니다</li>
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setShowAutoTagDialog(false); setAutoTagPreview([]); }}>
              취소
            </Button>
            <Button
              onClick={handleApplyAutoTag}
              disabled={uploading || autoTagPreview.length === 0}
              className="bg-violet-600 hover:bg-violet-700"
            >
              <Wand2 className="h-4 w-4 mr-2" />
              {uploading ? '설정 중...' : `태그 설정 (${autoTagPreview.length}명)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Grade Tag Dialog */}
      <AlertDialog open={showResetGradeTagDialog} onOpenChange={setShowResetGradeTagDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학년 태그 초기화</AlertDialogTitle>
            <AlertDialogDescription>
              모든 교직원 리소스에서 학년 태그(1학년, 2학년, 3학년)를 제거합니다.
              다른 태그는 유지됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetGradeTags}
              disabled={uploading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {uploading ? '초기화 중...' : '초기화'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Class Tag Dialog */}
      <AlertDialog open={showResetClassTagDialog} onOpenChange={setShowResetClassTagDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학년/반 태그 초기화</AlertDialogTitle>
            <AlertDialogDescription>
              모든 교직원 리소스에서 학년/반 태그(1학년 1반, 2학년 3반 등)를 제거합니다.
              학년 태그(1학년, 2학년, 3학년)와 다른 태그는 유지됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetClassTags}
              disabled={uploading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {uploading ? '초기화 중...' : '초기화'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file inputs */}
      <input
        ref={classTagFileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleClassTagCsvUpload}
      />
      <input
        ref={emailFileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { handleEmailFileUpload(e); setUploadDialogType(null); }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { handleFileUpload(e); setUploadDialogType(null); }}
      />

      {/* Edit Resource Dialog */}
      {editingResource && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>리소스 수정</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-resource-name">리소스 이름</Label>
                <Input
                  id="edit-resource-name"
                  value={editingResource.name}
                  onChange={(e) => setEditingResource(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder="리소스 이름을 입력하세요"
                />
              </div>
              <div>
                <Label htmlFor="edit-resource-type">타입</Label>
                <Select 
                  value={editingResource.type} 
                  onValueChange={(value: Resource['type']) => 
                    setEditingResource(prev => prev ? { ...prev, type: value } : null)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(resourceTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-resource-meta">메타데이터 (JSON)</Label>
                <Textarea
                  id="edit-resource-meta"
                  value={typeof editingResource.meta === 'string' ? editingResource.meta : JSON.stringify(editingResource.meta || {}, null, 2)}
                  onChange={(e) => setEditingResource(prev => prev ? { ...prev, meta: e.target.value } : null)}
                  placeholder='{"key": "value"}'
                  rows={5}
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <Tags className="h-4 w-4" />
                  태그
                </Label>
                <div className="flex flex-wrap gap-2 mt-2 p-3 border rounded-md min-h-[60px]">
                  {allTags.length === 0 ? (
                    <span className="text-sm text-muted-foreground">등록된 태그가 없습니다.</span>
                  ) : (
                    allTags.map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id);
                      return (
                        <Badge
                          key={tag.id}
                          variant={isSelected ? "default" : "outline"}
                          style={isSelected ? { backgroundColor: tag.color, color: 'white', borderColor: tag.color } : { borderColor: tag.color, color: tag.color }}
                          className="cursor-pointer transition-all hover:opacity-80"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTagIds(selectedTagIds.filter(id => id !== tag.id));
                            } else {
                              setSelectedTagIds([...selectedTagIds, tag.id]);
                            }
                          }}
                        >
                          {tag.name}
                        </Badge>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">클릭하여 태그를 선택/해제하세요</p>
              </div>
              <DialogFooter className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  취소
                </Button>
                <Button onClick={editResource}>
                  수정
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Bulk Tag Assignment Dialog */}
      <Dialog open={showBulkTagDialog} onOpenChange={setShowBulkTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              일괄 태그 설정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              선택된 {selectedIds.size}명의 교직원에게 태그를 설정합니다.
            </div>

            {/* 선택된 교직원 목록 */}
            <div className="max-h-24 overflow-y-auto p-2 bg-muted rounded-md">
              <div className="flex flex-wrap gap-1">
                {Array.from(selectedIds).map((id) => {
                  const resource = resources.find(r => r.id === id);
                  return resource ? (
                    <Badge key={id} variant="secondary" className="text-xs">
                      {resource.name}
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>

            {/* 모드 선택 */}
            <div className="space-y-2">
              <Label>설정 방식</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bulkTagMode"
                    value="add"
                    checked={bulkTagMode === 'add'}
                    onChange={() => setBulkTagMode('add')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">기존 태그에 추가</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bulkTagMode"
                    value="replace"
                    checked={bulkTagMode === 'replace'}
                    onChange={() => setBulkTagMode('replace')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">태그 교체 (기존 태그 제거)</span>
                </label>
              </div>
            </div>

            {/* 태그 선택 */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Tags className="h-4 w-4" />
                태그 선택
              </Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[80px]">
                {allTags.length === 0 ? (
                  <span className="text-sm text-muted-foreground">등록된 태그가 없습니다. 먼저 태그를 생성해주세요.</span>
                ) : (
                  allTags.map((tag) => {
                    const isSelected = bulkTagIds.includes(tag.id);
                    return (
                      <Badge
                        key={tag.id}
                        variant={isSelected ? "default" : "outline"}
                        style={isSelected ? { backgroundColor: tag.color, color: 'white', borderColor: tag.color } : { borderColor: tag.color, color: tag.color }}
                        className="cursor-pointer transition-all hover:opacity-80"
                        onClick={() => {
                          if (isSelected) {
                            setBulkTagIds(bulkTagIds.filter(id => id !== tag.id));
                          } else {
                            setBulkTagIds([...bulkTagIds, tag.id]);
                          }
                        }}
                      >
                        {tag.name}
                        {tag.is_bulk_option && (
                          <span className="ml-1 text-xs opacity-75">(일괄)</span>
                        )}
                      </Badge>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                클릭하여 태그를 선택하세요. {bulkTagIds.length}개 선택됨
              </p>
            </div>

            <DialogFooter className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" onClick={() => setShowBulkTagDialog(false)}>
                취소
              </Button>
              <Button
                onClick={applyBulkTags}
                disabled={bulkTagIds.length === 0 && bulkTagMode === 'add'}
              >
                {bulkTagMode === 'replace' ? '태그 설정' : '태그 추가'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
