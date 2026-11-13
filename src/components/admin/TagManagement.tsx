import { useState, useEffect } from 'react';
import { Tags, Plus, Pencil, Trash2, GripVertical, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TagResourceDialog } from './TagResourceDialog';

interface ResourceTag {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_bulk_option: boolean;
  sort_order: number;
  created_at: string;
}

const COLOR_OPTIONS = [
  { value: '#3b82f6', label: '파랑' },
  { value: '#10b981', label: '초록' },
  { value: '#f59e0b', label: '주황' },
  { value: '#ef4444', label: '빨강' },
  { value: '#8b5cf6', label: '보라' },
  { value: '#ec4899', label: '분홍' },
  { value: '#6b7280', label: '회색' },
  { value: '#14b8a6', label: '청록' },
];

export function TagManagement() {
  const { toast } = useToast();
  const [tags, setTags] = useState<ResourceTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<ResourceTag | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourceTag | null>(null);
  const [resourceDialogTag, setResourceDialogTag] = useState<ResourceTag | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
    is_bulk_option: true,
  });

  const fetchTags = async () => {
    try {
      const { data, error } = await supabase
        .from('resource_tags')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      setTags(data || []);
    } catch (error) {
      console.error('태그 조회 오류:', error);
      toast({ title: '오류', description: '태그를 불러오지 못했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const openCreateDialog = () => {
    setEditingTag(null);
    setFormData({
      name: '',
      description: '',
      color: '#3b82f6',
      is_bulk_option: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (tag: ResourceTag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      description: tag.description || '',
      color: tag.color,
      is_bulk_option: tag.is_bulk_option,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: '오류', description: '태그 이름을 입력해주세요.', variant: 'destructive' });
      return;
    }

    try {
      if (editingTag) {
        // 수정
        const { error } = await supabase
          .from('resource_tags')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            color: formData.color,
            is_bulk_option: formData.is_bulk_option,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingTag.id);

        if (error) throw error;
        toast({ title: '성공', description: '태그가 수정되었습니다.' });
      } else {
        // 생성
        const maxSortOrder = Math.max(...tags.map(t => t.sort_order), 0);
        const { error } = await supabase
          .from('resource_tags')
          .insert({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            color: formData.color,
            is_bulk_option: formData.is_bulk_option,
            sort_order: maxSortOrder + 1,
          });

        if (error) throw error;
      }

      setIsDialogOpen(false);
      fetchTags();
    } catch (error) {
      console.error('태그 저장 오류:', error);
      toast({ title: '오류', description: '태그 저장에 실패했습니다.', variant: 'destructive' });
    }
  };

  const handleToggleBulkOption = async (tag: ResourceTag) => {
    try {
      const { error } = await supabase
        .from('resource_tags')
        .update({ is_bulk_option: !tag.is_bulk_option, updated_at: new Date().toISOString() })
        .eq('id', tag.id);

      if (error) throw error;
      fetchTags();
    } catch (error) {
      console.error('태그 업데이트 오류:', error);
      toast({ title: '오류', description: '태그 업데이트에 실패했습니다.', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const { error } = await supabase
        .from('resource_tags')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) throw error;
      setDeleteTarget(null);
      fetchTags();
    } catch (error) {
      console.error('태그 삭제 오류:', error);
      toast({ title: '오류', description: '태그 삭제에 실패했습니다.', variant: 'destructive' });
    }
  };

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              교직원 태그 관리
            </CardTitle>
            <CardDescription className="mt-1">
              교직원에게 부여할 태그를 관리합니다. "일괄 선택"으로 설정된 태그는 참여자 선택 시 빠른 선택 옵션으로 표시됩니다.
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            태그 추가
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>태그</TableHead>
                <TableHead>설명</TableHead>
                <TableHead className="w-[120px]">드롭다운 표시</TableHead>
                <TableHead className="w-[120px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                    등록된 태그가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                tags.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    </TableCell>
                    <TableCell>
                      <Badge
                        style={{ backgroundColor: tag.color, color: 'white' }}
                        className="font-medium"
                      >
                        {tag.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tag.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={tag.is_bulk_option}
                        onCheckedChange={() => handleToggleBulkOption(tag)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="교사 설정"
                          onClick={() => setResourceDialogTag(tag)}
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="수정"
                          onClick={() => openEditDialog(tag)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          title="삭제"
                          onClick={() => setDeleteTarget(tag)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 생성/수정 Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTag ? '태그 수정' : '새 태그 추가'}
              </DialogTitle>
              <DialogDescription>
                교직원에게 부여할 태그 정보를 입력하세요.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">태그 이름 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 담임, 1학년부"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">설명</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="태그에 대한 설명"
                />
              </div>

              <div className="space-y-2">
                <Label>색상</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        formData.color === option.value
                          ? 'border-foreground scale-110'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: option.value }}
                      onClick={() => setFormData({ ...formData, color: option.value })}
                      title={option.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="is_bulk_option">일괄 선택 옵션</Label>
                  <p className="text-xs text-muted-foreground">
                    활성화 시 참여자 선택 드롭다운에 "전체 [태그명]" 옵션이 표시됩니다
                  </p>
                </div>
                <Switch
                  id="is_bulk_option"
                  checked={formData.is_bulk_option}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_bulk_option: checked })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSubmit}>
                {editingTag ? '수정' : '추가'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 태그 교사 설정 Dialog */}
        <TagResourceDialog
          tag={resourceDialogTag}
          open={!!resourceDialogTag}
          onOpenChange={(open) => !open && setResourceDialogTag(null)}
        />

        {/* 삭제 확인 Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>태그 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteTarget?.name}" 태그를 삭제하시겠습니까?
                이 태그가 부여된 교직원에서도 제거됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
