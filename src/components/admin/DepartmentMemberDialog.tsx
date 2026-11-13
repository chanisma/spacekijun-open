// ========================================
// Department Member Dialog
// 부서원 설정 다이얼로그
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';

interface Department {
  id: string;
  name: string;
  category: string;
}

interface DepartmentMemberDialogProps {
  department: Department | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DepartmentMemberDialog({
  department,
  open,
  onOpenChange,
}: DepartmentMemberDialogProps) {
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  // 부서 소속은 학년도마다 따로 저장한다(department_member.academic_year).
  // 기본은 학사력 학년도 — 새 학년도 명단을 미리 짤 수 있도록 다음 해도 고를 수 있다.
  const { data: academicTerm } = useAcademicTerm();
  const baseYear = academicTerm?.year ?? new Date().getFullYear();
  const [academicYear, setAcademicYear] = useState<number>(baseYear);
  const yearOptions = [baseYear - 1, baseYear, baseYear + 1];

  useEffect(() => {
    if (open) setAcademicYear(baseYear);
  }, [open, baseYear]);

  // 다이얼로그가 열릴 때·학년도를 바꿀 때 그 학년도의 부서원 로드
  useEffect(() => {
    if (open && department) {
      fetchMembers();
    }
  }, [open, department, academicYear]);

  const fetchMembers = async () => {
    if (!department) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('department_member')
        .select('resource_id')
        .eq('department_id', department.id)
        .eq('academic_year', academicYear);

      if (error) throw error;
      setSelectedResourceIds(data?.map((m) => m.resource_id) ?? []);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast({
        title: '오류',
        description: '부서원 목록을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!department) return;
    setSaving(true);
    try {
      // 이 학년도만 원자적으로 교체한다. 예전의 "부서 전체 삭제 후 삽입"은
      // 학년도가 생긴 뒤로 다른 학년도 명단까지 조용히 지운다.
      const { error } = await supabase.rpc('set_department_members', {
        p_department_id: department.id,
        p_academic_year: academicYear,
        p_resource_ids: selectedResourceIds,
      });
      if (error) throw error;
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving members:', error);
      toast({
        title: '오류',
        description: '부서원 저장 중 오류가 발생했습니다.',
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
            부서원 설정
            {department && (
              <Badge variant="secondary" className="ml-1">
                {department.name}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              이 부서에 소속될 교직원을 선택하세요. 학년도마다 따로 저장됩니다.
            </p>
            <Select
              value={String(academicYear)}
              onValueChange={(v) => setAcademicYear(Number(v))}
            >
              <SelectTrigger className="h-8 w-[112px] shrink-0 text-xs" aria-label="학년도">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}학년도</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              불러오는 중...
            </div>
          ) : (
            <SearchableMultiSelect
              filterByTeacher={true}
              selectedValues={selectedResourceIds}
              onSelectionChange={setSelectedResourceIds}
              placeholder="부서원 선택..."
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
