import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  CreatePurchaseRequestPageInput,
  DEFAULT_COLUMNS,
  PurchaseColumn,
  PurchaseRequestPageWithRelations,
  TargetRole,
  UpdatePurchaseRequestPageInput,
} from '../types';
import { PageColumnEditor } from './PageColumnEditor';
import {
  useCreatePurchaseRequestPage,
  useUpdatePurchaseRequestPage,
} from '../hooks/usePurchaseRequestPages';

type Mode = 'create' | 'edit';

interface PageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  /**
   * `edit` = 고칠 글. **`create` 에 함께 주면 복사 원본이다** (2026-09-21) — 제목·설명·대상·입력 열·
   * 공동 담당자를 가져와 **새 글**로 연다. 신청 내역은 가져오지 않는다(그건 그 글의 기록이다).
   */
  initialPage?: PurchaseRequestPageWithRelations;
}

const toLocalInput = (iso: string | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (val: string): string => new Date(val).toISOString();

export function PageFormDialog({ open, onOpenChange, mode, initialPage }: PageFormDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetStudent, setTargetStudent] = useState(true);
  const [targetTeacher, setTargetTeacher] = useState(true);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [columns, setColumns] = useState<PurchaseColumn[]>(DEFAULT_COLUMNS);
  const [collaboratorNames, setCollaboratorNames] = useState<string[]>([]);

  const create = useCreatePurchaseRequestPage();
  const update = useUpdatePurchaseRequestPage();

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialPage) {
      setTitle(initialPage.title);
      setDescription(initialPage.description || '');
      setTargetStudent(initialPage.target_roles?.includes('student') ?? true);
      setTargetTeacher(initialPage.target_roles?.includes('teacher') ?? true);
      setPeriodStart(toLocalInput(initialPage.period_start));
      setPeriodEnd(toLocalInput(initialPage.period_end));
      setColumns((initialPage.columns as PurchaseColumn[]) || DEFAULT_COLUMNS);
      setCollaboratorNames(
        (initialPage.collaborators || [])
          .map((c) => c.resource?.name || '')
          .filter(Boolean),
      );
    } else if (mode === 'create' && initialPage) {
      // 복사 — 기간은 옮기지 않는다. 원본 기간은 대개 이미 지나 있어, 그대로 두면 새 글이
      // 만들자마자 마감된 상태가 된다. **길이만** 이어받아 지금부터 다시 잡는다.
      const now = new Date();
      const WEEK = 7 * 24 * 60 * 60 * 1000;
      const span =
        new Date(initialPage.period_end).getTime() - new Date(initialPage.period_start).getTime();
      const end = new Date(now.getTime() + (Number.isFinite(span) && span > 0 ? span : WEEK));
      setTitle(`${initialPage.title} (복사)`);
      setDescription(initialPage.description || '');
      setTargetStudent(initialPage.target_roles?.includes('student') ?? true);
      setTargetTeacher(initialPage.target_roles?.includes('teacher') ?? true);
      setPeriodStart(toLocalInput(now.toISOString()));
      setPeriodEnd(toLocalInput(end.toISOString()));
      // 열 정의는 깊은 복사 — 새 글에서 열을 고쳐도 원본 객체를 건드리지 않게
      setColumns(
        initialPage.columns
          ? (JSON.parse(JSON.stringify(initialPage.columns)) as PurchaseColumn[])
          : DEFAULT_COLUMNS,
      );
      setCollaboratorNames(
        (initialPage.collaborators || [])
          .map((c) => c.resource?.name || '')
          .filter(Boolean),
      );
    } else if (mode === 'create') {
      const now = new Date();
      const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      setTitle('');
      setDescription('');
      setTargetStudent(true);
      setTargetTeacher(true);
      setPeriodStart(toLocalInput(now.toISOString()));
      setPeriodEnd(toLocalInput(oneWeekLater.toISOString()));
      setColumns(DEFAULT_COLUMNS);
      setCollaboratorNames([]);
    }
  }, [open, mode, initialPage]);

  const isPending = create.isPending || update.isPending;

  const validate = (): string | null => {
    if (!title.trim()) return '페이지 제목을 입력하세요.';
    if (!targetStudent && !targetTeacher) return '대상을 1개 이상 선택하세요.';
    if (!periodStart || !periodEnd) return '신청 기간을 입력하세요.';
    if (new Date(periodEnd).getTime() < new Date(periodStart).getTime())
      return '종료일은 시작일 이후여야 합니다.';
    if (columns.length === 0) return '컬럼을 1개 이상 추가하세요.';
    if (columns.some((c) => !c.name.trim())) return '컬럼명이 비어있는 항목이 있습니다.';
    const ids = new Set<string>();
    for (const c of columns) {
      if (ids.has(c.id)) return '컬럼 ID 중복이 발생했습니다.';
      ids.add(c.id);
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast({ title: '입력 확인', description: err, variant: 'destructive' });
      return;
    }

    // 공동 작업자 이름 → resource_id 변환
    let collaboratorResourceIds: string[] = [];
    const filtered = collaboratorNames.filter((n) => n && n !== 'ALL_TEACHERS');
    if (filtered.length > 0) {
      const { data: resources, error } = await supabase
        .from('resource')
        .select('id, name')
        .in('name', filtered);
      if (error) {
        toast({
          title: '공동 작업자 조회 실패',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }
      collaboratorResourceIds = (resources || []).map((r: { id: string }) => r.id);
    }

    const target_roles: TargetRole[] = [];
    if (targetStudent) target_roles.push('student');
    if (targetTeacher) target_roles.push('teacher');

    if (mode === 'create') {
      const input: CreatePurchaseRequestPageInput = {
        title: title.trim(),
        target_roles,
        description: description.trim() || undefined,
        period_start: fromLocalInput(periodStart),
        period_end: fromLocalInput(periodEnd),
        columns,
        collaborator_resource_ids: collaboratorResourceIds,
      };

      create.mutate(input, {
        onSuccess: () => {
          onOpenChange(false);
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : '페이지 생성 중 오류가 발생했습니다.';
          toast({ title: '생성 실패', description: msg, variant: 'destructive' });
        },
      });
    } else if (initialPage) {
      const input: UpdatePurchaseRequestPageInput = {
        title: title.trim(),
        target_roles,
        description: description.trim() || null,
        period_start: fromLocalInput(periodStart),
        period_end: fromLocalInput(periodEnd),
        columns,
        collaborator_resource_ids: collaboratorResourceIds,
      };
      update.mutate(
        { pageId: initialPage.id, input },
        {
          onSuccess: () => {
            onOpenChange(false);
          },
          onError: (e: unknown) => {
            const msg = e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.';
            toast({ title: '저장 실패', description: msg, variant: 'destructive' });
          },
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[92vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>
            {mode === 'edit' ? '페이지 수정' : initialPage ? '구매 신청 페이지 복사' : '구매 신청 페이지 만들기'}
          </DialogTitle>
          <DialogDescription>
            신청 받을 항목 컬럼과 신청 기간, 공동 작업자를 설정합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-4 flex-1 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="prp-title">페이지명 *</Label>
            <Input
              id="prp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2학기 동아리 물품 구매 신청"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>대상 *</Label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={targetStudent}
                  onCheckedChange={(c) => setTargetStudent(Boolean(c))}
                  disabled={isPending}
                />
                학생
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={targetTeacher}
                  onCheckedChange={(c) => setTargetTeacher(Boolean(c))}
                  disabled={isPending}
                />
                교사
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="prp-start">신청 시작 *</Label>
              <Input
                id="prp-start"
                type="datetime-local"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prp-end">신청 종료 *</Label>
              <Input
                id="prp-end"
                type="datetime-local"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prp-desc">상세 설명</Label>
            <Textarea
              id="prp-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="신청자에게 안내할 내용을 입력하세요."
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>공동 작업자(교사)</Label>
            <SearchableMultiSelect
              filterByTeacher
              selectedValues={collaboratorNames}
              onSelectionChange={setCollaboratorNames}
              placeholder="공동 작업할 교사를 선택하세요"
              searchPlaceholder="이름 또는 초성으로 검색..."
              disabled={isPending}
            />
            <p className="text-[11px] text-muted-foreground">
              공동 작업자는 신청 내용을 함께 조회/관리할 수 있습니다.
            </p>
          </div>

          <PageColumnEditor columns={columns} onChange={setColumns} />
        </div>

        <div className="flex gap-2 px-6 py-4 border-t bg-slate-50/50">
          <Button onClick={handleSubmit} disabled={isPending} className="flex-1">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? '생성' : '저장'}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
