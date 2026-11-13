import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useCreateTrainingType, useUpdateTrainingType } from '../hooks/useTrainingCertificates';
import type { TrainingType, TrainingCategory } from '../types';

const CATEGORY_OPTIONS: { value: TrainingCategory; label: string; defaultLabel: string }[] = [
  { value: 'annual',  label: '매년',  defaultLabel: '매년 필수' },
  { value: 'multi',   label: '다년',  defaultLabel: '3년 누적' },
  { value: 'special', label: '특수',  defaultLabel: '특수 연수' },
];

function autoCode(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 20)
    + '_' + Date.now().toString(36);
}

export function TrainingTypeEditDialog({
  open, onOpenChange, editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: TrainingType | null;
}) {
  const createMut = useCreateTrainingType();
  const updateMut = useUpdateTrainingType();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<TrainingCategory>('annual');
  const [requiredHours, setRequiredHours] = useState<number | ''>('');
  const [unit, setUnit] = useState('시간');
  const [description, setDescription] = useState('');
  const [cycle, setCycle] = useState('');
  const [year, setYear] = useState<number | ''>(new Date().getFullYear());
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setCategory(editing.category);
      setRequiredHours(editing.required_hours);
      setUnit(editing.unit);
      setDescription(editing.description ?? '');
      setCycle(editing.cycle ?? '');
      setYear(editing.year ?? '');
    } else {
      setName('');
      setCategory('annual');
      setRequiredHours('');
      setUnit('시간');
      setDescription('');
      setCycle('');
      setYear(new Date().getFullYear());
    }
  }, [open, editing]);

  const canSubmit = !!name.trim() && typeof requiredHours === 'number' && requiredHours >= 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const categoryLabel = CATEGORY_OPTIONS.find((o) => o.value === category)!.defaultLabel;
    try {
      const payload = {
        code: editing ? editing.code : autoCode(name),
        name: name.trim(),
        category,
        category_label: categoryLabel,
        required_hours: Number(requiredHours),
        unit: unit.trim() || '시간',
        description: description.trim() || null,
        cycle: cycle.trim() || null,
        year: typeof year === 'number' ? year : null,
      };
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, patch: payload });
      } else {
        await createMut.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (e) {
      toast({
        title: editing ? '수정 실패' : '등록 실패',
        description: e instanceof Error ? e.message : '알 수 없는 오류',
        variant: 'destructive',
      });
    }
  };

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? '연수 종류 수정' : '새 연수 종류 등록'}</DialogTitle>
          <DialogDescription>
            {editing
              ? '등록된 연수 정보를 수정합니다.'
              : '새 연수 종류를 추가합니다. 교사 이수증 제출 시 이 종류를 선택할 수 있게 됩니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div>
            <Label>연수명 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="예) 교원의무연수 Ⅰ" className="mt-1" />
          </div>

          <div>
            <Label>구분 *</Label>
            <div className="mt-1 inline-flex overflow-hidden rounded-md border bg-white">
              {CATEGORY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setCategory(o.value)}
                  className={cn(
                    'border-l px-4 py-1.5 text-xs first:border-l-0',
                    category === o.value ? 'bg-emerald-50 font-semibold text-emerald-700' : 'text-muted-foreground hover:bg-slate-50',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>이수 기준 *</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  type="number" min={0} step="0.5"
                  value={requiredHours}
                  onChange={(e) => setRequiredHours(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="15"
                />
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="시간" className="w-20" />
              </div>
            </div>
            <div>
              <Label>적용 기간</Label>
              {category === 'multi' ? (
                <Input value={cycle} onChange={(e) => setCycle(e.target.value)}
                  placeholder="예) 2024–2026" className="mt-1" />
              ) : (
                <Input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="2026"
                  className="mt-1"
                />
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {category === 'multi' ? '예: 2024–2026' : '적용 학년도'}
              </p>
            </div>
          </div>

          <div>
            <Label>설명</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="법정 필수 연수 · 안전교육 등" className="mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>취소</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || pending}>
            {pending ? '저장 중…' : editing ? '수정' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
