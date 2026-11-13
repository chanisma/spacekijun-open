// ========================================
// Department Management Component
// Admin component for managing organization departments
// ========================================

import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Plus, Trash2, Edit, GripVertical, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DepartmentMemberDialog } from './DepartmentMemberDialog';

interface Department {
  id: string;
  name: string;
  description: string | null;
  category: 'school' | 'simple' | 'custom';
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  school: '학교 부서',
  simple: '간편 분류',
  custom: '사용자 정의',
};

const CATEGORY_COLORS: Record<string, string> = {
  school: 'bg-blue-100 text-blue-800',
  simple: 'bg-green-100 text-green-800',
  custom: 'bg-purple-100 text-purple-800',
};

// ----------------------------------------
// Sortable Row Component
// ----------------------------------------

interface SortableRowProps {
  department: Department;
  onEdit: (department: Department) => void;
  onDelete: (id: string) => void;
  onToggleActive: (department: Department) => void;
  onManageMembers: (department: Department) => void;
}

function SortableRow({
  department,
  onEdit,
  onDelete,
  onToggleActive,
  onManageMembers,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: department.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isDragging ? 'var(--muted)' : undefined,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={!department.is_active ? 'opacity-50' : ''}
    >
      <TableCell>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
          aria-label="드래그하여 순서 변경"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="font-medium">
        <div>
          <div>{department.name}</div>
          <div className="sm:hidden text-xs text-muted-foreground mt-1">
            {department.description}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Badge
          variant="secondary"
          className={CATEGORY_COLORS[department.category]}
        >
          {CATEGORY_LABELS[department.category]}
        </Badge>
      </TableCell>
      <TableCell className="hidden sm:table-cell text-muted-foreground">
        {department.description || '-'}
      </TableCell>
      <TableCell className="text-center">
        <Switch
          checked={department.is_active}
          onCheckedChange={() => onToggleActive(department)}
        />
      </TableCell>
      <TableCell className="text-center">
        <div className="flex justify-center space-x-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onManageMembers(department)}
            className="h-8 w-8 p-0"
            title="부서원 설정"
          >
            <Users className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(department)}
            className="h-8 w-8 p-0"
            title="수정"
          >
            <Edit className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(department.id)}
            className="h-8 w-8 p-0"
            title="삭제"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ----------------------------------------
// Main Component
// ----------------------------------------

export function DepartmentManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [memberDialogDept, setMemberDialogDept] = useState<Department | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'school' as 'school' | 'simple' | 'custom',
    is_active: true,
    display_order: 0,
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const { data, error } = await supabase
        .from('department')
        .select('*')
        .order('category', { ascending: true })
        .order('display_order', { ascending: true });

      if (error) throw error;
      setDepartments(data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      toast({
        title: '오류',
        description: '부서 목록을 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = departments.findIndex((d) => d.id === active.id);
    const newIndex = departments.findIndex((d) => d.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Only allow reordering within the same category
    const draggedItem = departments[oldIndex];
    const targetItem = departments[newIndex];

    if (draggedItem.category !== targetItem.category) {
      toast({
        title: '알림',
        description: '같은 카테고리 내에서만 순서를 변경할 수 있습니다.',
      });
      return;
    }

    // Get all items in the same category
    const categoryItems = departments.filter(
      (d) => d.category === draggedItem.category
    );
    const categoryOldIndex = categoryItems.findIndex((d) => d.id === active.id);
    const categoryNewIndex = categoryItems.findIndex((d) => d.id === over.id);

    // Reorder within category
    const reorderedCategoryItems = arrayMove(
      categoryItems,
      categoryOldIndex,
      categoryNewIndex
    );

    // Update display_order for all items in this category
    const updates = reorderedCategoryItems.map((item, index) => ({
      id: item.id,
      display_order: index + 1,
    }));

    // Optimistically update UI
    const newDepartments = departments.map((dept) => {
      const update = updates.find((u) => u.id === dept.id);
      if (update) {
        return { ...dept, display_order: update.display_order };
      }
      return dept;
    });

    // Sort by category and display_order
    newDepartments.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.display_order - b.display_order;
    });

    setDepartments(newDepartments);

    // Save to database
    setIsSaving(true);
    try {
      for (const update of updates) {
        const { error } = await supabase
          .from('department')
          .update({ display_order: update.display_order })
          .eq('id', update.id);

        if (error) throw error;
      }

    } catch (error) {
      console.error('Error updating order:', error);
      toast({
        title: '오류',
        description: '순서 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
      // Revert on error
      fetchDepartments();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: '오류',
        description: '부서명을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const departmentData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        category: formData.category,
        is_active: formData.is_active,
        display_order: formData.display_order,
      };

      if (editingDepartment) {
        const { error } = await supabase
          .from('department')
          .update(departmentData)
          .eq('id', editingDepartment.id);

        if (error) throw error;
        toast({
          title: '성공',
          description: '부서가 수정되었습니다.',
        });
      } else {
        // Get next display order for category
        const maxOrder = departments
          .filter((d) => d.category === formData.category)
          .reduce((max, d) => Math.max(max, d.display_order), 0);
        departmentData.display_order = maxOrder + 1;

        const { error } = await supabase
          .from('department')
          .insert([departmentData]);

        if (error) {
          if (error.code === '23505') {
            toast({
              title: '오류',
              description: '이미 존재하는 부서명입니다.',
              variant: 'destructive',
            });
            return;
          }
          throw error;
        }
      }

      resetForm();
      fetchDepartments();
    } catch (error) {
      console.error('Error saving department:', error);
      toast({
        title: '오류',
        description: '부서 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (department: Department) => {
    setEditingDepartment(department);
    setFormData({
      name: department.name,
      description: department.description || '',
      category: department.category,
      is_active: department.is_active,
      display_order: department.display_order,
    });
    setShowCreateDialog(true);
  };

  const handleDelete = async (departmentId: string) => {
    if (!confirm('정말로 이 부서를 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('department')
        .delete()
        .eq('id', departmentId);

      if (error) throw error;
      fetchDepartments();
    } catch (error) {
      console.error('Error deleting department:', error);
      toast({
        title: '오류',
        description: '부서 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (department: Department) => {
    try {
      const { error } = await supabase
        .from('department')
        .update({ is_active: !department.is_active })
        .eq('id', department.id);

      if (error) throw error;
      toast({
        title: '성공',
        description: department.is_active
          ? '부서가 비활성화되었습니다.'
          : '부서가 활성화되었습니다.',
      });
      fetchDepartments();
    } catch (error) {
      console.error('Error toggling department:', error);
      toast({
        title: '오류',
        description: '부서 상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setShowCreateDialog(false);
    setEditingDepartment(null);
    setFormData({
      name: '',
      description: '',
      category: 'school',
      is_active: true,
      display_order: 0,
    });
  };

  const filteredDepartments =
    filterCategory === 'all'
      ? departments
      : departments.filter((d) => d.category === filterCategory);

  const getCategoryStats = () => {
    return {
      total: departments.length,
      school: departments.filter((d) => d.category === 'school').length,
      simple: departments.filter((d) => d.category === 'simple').length,
      custom: departments.filter((d) => d.category === 'custom').length,
      active: departments.filter((d) => d.is_active).length,
    };
  };

  const stats = getCategoryStats();

  // Group departments by category for display
  const groupedDepartments = filteredDepartments.reduce(
    (acc, dept) => {
      if (!acc[dept.category]) {
        acc[dept.category] = [];
      }
      acc[dept.category].push(dept);
      return acc;
    },
    {} as Record<string, Department[]>
  );

  if (loading) {
    return <div className="flex items-center justify-center p-8">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">부서 관리</h2>
          <p className="text-sm text-muted-foreground mt-1">
            드래그하여 같은 카테고리 내에서 순서를 변경할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="분류 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 ({stats.total})</SelectItem>
              <SelectItem value="school">학교 부서 ({stats.school})</SelectItem>
              <SelectItem value="simple">간편 분류 ({stats.simple})</SelectItem>
              <SelectItem value="custom">사용자 정의 ({stats.custom})</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={showCreateDialog} onOpenChange={(open) => open ? setShowCreateDialog(true) : resetForm()}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                부서 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingDepartment ? '부서 수정' : '새 부서 추가'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">부서명 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="예: 교무운영부"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="category">분류</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value: 'school' | 'simple' | 'custom') =>
                      setFormData((prev) => ({ ...prev, category: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="분류 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="school">학교 부서</SelectItem>
                      <SelectItem value="simple">간편 분류</SelectItem>
                      <SelectItem value="custom">사용자 정의</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    학교 부서: 실제 조직 부서, 간편 분류: 문서 분류용, 사용자 정의: 기타
                  </p>
                </div>

                <div>
                  <Label htmlFor="description">설명</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="부서에 대한 설명을 입력하세요"
                    rows={2}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, is_active: checked }))
                    }
                  />
                  <Label htmlFor="is_active">활성화</Label>
                </div>

                <div className="flex space-x-2">
                  <Button type="submit" className="flex-1">
                    {editingDepartment ? '수정' : '추가'}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    취소
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">전체 부서</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.school}</div>
            <div className="text-sm text-muted-foreground">학교 부서</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.simple}</div>
            <div className="text-sm text-muted-foreground">간편 분류</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">{stats.custom}</div>
            <div className="text-sm text-muted-foreground">사용자 정의</div>
          </CardContent>
        </Card>
      </div>

      {/* Department List by Category */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {Object.entries(groupedDepartments).map(([category, depts]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Building2 className="h-5 w-5" />
                <span>
                  {CATEGORY_LABELS[category]} ({depts.length}개)
                </span>
                {isSaving && (
                  <span className="text-sm text-muted-foreground font-normal">
                    저장 중...
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="min-w-[120px]">부서명</TableHead>
                      <TableHead className="w-24 text-center">분류</TableHead>
                      <TableHead className="hidden sm:table-cell">설명</TableHead>
                      <TableHead className="w-20 text-center">상태</TableHead>
                      <TableHead className="w-24 text-center">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <SortableContext
                      items={depts.map((d) => d.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {depts.map((department) => (
                        <SortableRow
                          key={department.id}
                          department={department}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onToggleActive={handleToggleActive}
                          onManageMembers={setMemberDialogDept}
                        />
                      ))}
                    </SortableContext>
                    {depts.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-8 text-muted-foreground"
                        >
                          등록된 부서가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredDepartments.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {filterCategory === 'all'
                ? '등록된 부서가 없습니다.'
                : `${CATEGORY_LABELS[filterCategory]} 카테고리에 등록된 부서가 없습니다.`}
            </CardContent>
          </Card>
        )}
      </DndContext>

      <DepartmentMemberDialog
        department={memberDialogDept}
        open={!!memberDialogDept}
        onOpenChange={(open) => !open && setMemberDialogDept(null)}
      />
    </div>
  );
}
