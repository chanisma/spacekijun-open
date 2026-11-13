import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Archive, Trash2 } from 'lucide-react';
import { useTrainingTypes, useDeactivateTrainingType, useDeleteTrainingType } from '../hooks/useTrainingCertificates';
import { CategoryTag } from './SharedBits';
import { TrainingTypeEditDialog } from './TrainingTypeEditDialog';
import { toast } from '@/hooks/use-toast';
import type { TrainingType, TrainingCategory } from '../types';

const CATEGORY_GROUPS: { key: TrainingCategory; label: string; description: string }[] = [
  { key: 'annual',  label: '매년 연수', description: '매 학년도마다 이수해야 하는 법정 필수 연수' },
  { key: 'multi',   label: '다년 연수', description: '여러 해에 걸쳐 누적 이수하는 연수' },
  { key: 'special', label: '특수 연수', description: '특정 학년도 전 교원 대상 지정 연수' },
];

interface AdminTrainingsPanelProps {
  externalDialogOpen?: boolean;
  onExternalDialogOpenChange?: (v: boolean) => void;
}

export function AdminTrainingsPanel({ externalDialogOpen, onExternalDialogOpenChange }: AdminTrainingsPanelProps) {
  const { data: types = [] } = useTrainingTypes();
  const deactivateMut = useDeactivateTrainingType();
  const deleteMut = useDeleteTrainingType();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingType | null>(null);

  const effectiveOpen = externalDialogOpen !== undefined ? externalDialogOpen : dialogOpen;
  const setEffectiveOpen = (v: boolean) => {
    if (onExternalDialogOpenChange) onExternalDialogOpenChange(v);
    else setDialogOpen(v);
  };

  const categoryCounts = useMemo(() => {
    const m: Record<TrainingCategory, number> = { annual: 0, multi: 0, special: 0 };
    for (const t of types) m[t.category]++;
    return m;
  }, [types]);

  const openNew = () => { setEditing(null); setEffectiveOpen(true); };
  const openEdit = (t: TrainingType) => { setEditing(t); setEffectiveOpen(true); };

  const handleDeactivate = async (t: TrainingType) => {
    if (!confirm(`"${t.name}" 연수를 비활성화하시겠습니까? 교사 제출 목록에서 숨겨집니다.`)) return;
    try {
      await deactivateMut.mutateAsync(t.id);
    } catch (e) {
      toast({ title: '비활성화 실패', description: e instanceof Error ? e.message : '오류', variant: 'destructive' });
    }
  };

  const handleDelete = async (t: TrainingType) => {
    if (!confirm(`"${t.name}" 연수를 영구 삭제하시겠습니까? (연관된 이수증이 있으면 실패할 수 있습니다)`)) return;
    try {
      await deleteMut.mutateAsync(t.id);
    } catch (e) {
      toast({
        title: '삭제 실패',
        description: e instanceof Error ? e.message : '연관 이수증이 있거나 제약 조건 위반',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Category summary cards */}
      <div className="grid gap-3 md:grid-cols-3">
        {CATEGORY_GROUPS.map((g) => (
          <Card key={g.key}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <CategoryTag category={g.key} />
                <span className="text-[11px] text-muted-foreground">{categoryCounts[g.key]}개 연수</span>
              </div>
              <div className="mt-2.5 text-[15px] font-semibold">{g.label}</div>
              <p className="mt-1 text-xs text-muted-foreground">{g.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="border-b px-5 py-4">
          <h3 className="text-sm font-semibold">등록된 연수 목록</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            비활성 연수는 교사 제출 시 선택지에서 숨겨집니다.
          </p>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>연수명 / 코드</TableHead>
                <TableHead>구분</TableHead>
                <TableHead>이수 기준</TableHead>
                <TableHead>적용 기간</TableHead>
                <TableHead className="w-[160px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    등록된 연수가 없습니다. 위의 <strong>새 연수 등록</strong> 버튼으로 추가해보세요.
                  </TableCell>
                </TableRow>
              )}
              {types.map((t) => {
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px]">{t.code}</code>
                        {t.description && <span className="truncate">{t.description}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <CategoryTag category={t.category} />
                        <span className="text-xs text-muted-foreground">{t.category_label}</span>
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {t.required_hours}{t.unit}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {t.cycle ? t.cycle : t.year ? `${t.year}학년도` : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" /> 수정
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeactivate(t)} title="비활성화">
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(t)} title="영구 삭제" className="text-rose-600 hover:text-rose-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TrainingTypeEditDialog open={effectiveOpen} onOpenChange={setEffectiveOpen} editing={editing} />
    </div>
  );
}
