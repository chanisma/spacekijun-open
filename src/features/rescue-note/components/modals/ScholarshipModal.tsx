import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  useCreateRescueScholarship,
  useUpdateRescueScholarship,
} from '../../hooks/useRescueScholarships';
import { toast } from '@/components/ui/use-toast';
import type { RescueScholarship } from '../../types/rescueScholarship';

interface Props {
  studentCode: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 전달되면 수정 모드, 없으면 추가 모드 */
  scholarship?: RescueScholarship | null;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ScholarshipModal({ studentCode, open, onOpenChange, scholarship }: Props) {
  const isEdit = !!scholarship;
  const [name, setName] = useState('');
  const [awardedOn, setAwardedOn] = useState<string>(todayDate);
  const [remarks, setRemarks] = useState('');

  const create = useCreateRescueScholarship(studentCode);
  const update = useUpdateRescueScholarship(studentCode);

  // 모달이 열릴 때마다 폼을 (수정 대상 또는 초기값으로) 동기화한다.
  useEffect(() => {
    if (!open) return;
    setName(scholarship?.name ?? '');
    setAwardedOn(scholarship?.awardedOn ?? todayDate());
    setRemarks(scholarship?.remarks ?? '');
  }, [open, scholarship]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: '장학금명을 입력해주세요.', variant: 'destructive' });
      return;
    }
    if (!awardedOn) {
      toast({ title: '수여일을 입력해주세요.', variant: 'destructive' });
      return;
    }
    try {
      if (isEdit && scholarship) {
        await update.mutateAsync({
          id: scholarship.id,
          patch: { name: name.trim(), awardedOn, remarks: remarks.trim() || null },
        });
      } else {
        await create.mutateAsync({
          studentCode,
          name: name.trim(),
          awardedOn,
          remarks: remarks.trim() || null,
        });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-slate-800 text-sm font-bold">
            {isEdit ? '장학금 내역 수정' : '장학금 수여 추가'}
          </DialogTitle>
          <div className="border-b border-slate-100 pb-2" />
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1 block">장학금 번호</Label>
              <div className="h-9 px-3 flex items-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-md font-mono">
                {scholarship?.scholarshipNo ?? '저장 시 자동'}
              </div>
            </div>
            <div>
              <Label htmlFor="s-date" className="text-xs font-medium text-slate-700 mb-1 block">수여일</Label>
              <Input
                id="s-date"
                type="date"
                value={awardedOn}
                onChange={(e) => setAwardedOn(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="s-name" className="text-xs font-medium text-slate-700 mb-1 block">장학금명</Label>
            <Input
              id="s-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 교내 면학장학금"
              className="text-sm"
            />
          </div>
          <div>
            <Label htmlFor="s-remarks" className="text-xs font-medium text-slate-700 mb-1 block">비고 (선택)</Label>
            <Input
              id="s-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="금액·지급기관·특이사항 메모"
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs">취소</Button>
          <Button onClick={handleSave} disabled={pending} className="text-xs">저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
