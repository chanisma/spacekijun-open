// ========================================
// Tag Resource Dialog
// 태그에 소속된 교사 설정 다이얼로그
// ========================================

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ResourceTag {
  id: string;
  name: string;
  color: string;
}

interface TagResourceDialogProps {
  tag: ResourceTag | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TagResourceDialog({ tag, open, onOpenChange }: TagResourceDialogProps) {
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && tag) {
      fetchAssignedResources();
    }
  }, [open, tag]);

  const fetchAssignedResources = async () => {
    if (!tag) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('resource_tag_assignments')
        .select('resource_id')
        .eq('tag_id', tag.id);

      if (error) throw error;
      setSelectedResourceIds(data?.map((d) => d.resource_id) ?? []);
    } catch (error) {
      console.error('Error fetching tag resources:', error);
      toast({
        title: '오류',
        description: '교사 목록을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tag) return;
    setSaving(true);
    try {
      // 태그 기준으로 기존 assignments 전체 삭제 후 재삽입
      const { error: deleteError } = await supabase
        .from('resource_tag_assignments')
        .delete()
        .eq('tag_id', tag.id);

      if (deleteError) throw deleteError;

      if (selectedResourceIds.length > 0) {
        const inserts = selectedResourceIds.map((resource_id) => ({
          tag_id: tag.id,
          resource_id,
        }));

        const { error: insertError } = await supabase
          .from('resource_tag_assignments')
          .insert(inserts);

        if (insertError) throw insertError;
      }

      toast({
        title: '성공',
        description: `"${tag.name}" 태그 교사 설정이 저장되었습니다.`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving tag resources:', error);
      toast({
        title: '오류',
        description: '저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedResourceIds([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            태그 교사 설정
            {tag && (
              <Badge style={{ backgroundColor: tag.color, color: 'white' }} className="ml-1">
                {tag.name}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            이 태그를 부여할 교직원을 선택하세요. 초성 검색이 지원됩니다.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              불러오는 중...
            </div>
          ) : (
            <SearchableMultiSelect
              filterByTeacher={true}
              selectedValues={selectedResourceIds}
              onSelectionChange={setSelectedResourceIds}
              placeholder="교직원 선택..."
              searchPlaceholder="이름으로 검색 (초성 가능)"
              emptyText="검색 결과가 없습니다."
            />
          )}

          <p className="text-xs text-muted-foreground">
            선택된 인원: {selectedResourceIds.length}명
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
