import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { StudentPicker } from './StudentPicker';
import type { SeatStudent } from '../types';

interface FixedAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seat: string | null;
  currentResourceId: string | null;
  students: SeatStudent[];
  onConfirm: (resourceId: string) => void;
  onClear: () => void;
}

export function FixedAssignDialog({
  open,
  onOpenChange,
  seat,
  currentResourceId,
  students,
  onConfirm,
  onClear,
}: FixedAssignDialogProps) {
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (open) setPicked(currentResourceId ? [currentResourceId] : []);
  }, [open, currentResourceId]);

  const submit = () => {
    if (picked.length !== 1) return;
    onConfirm(picked[0]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>좌석 {seat} 고정 배치</DialogTitle>
          <DialogDescription>
            이 좌석에 항상 앉을 학생을 선택하세요. 자동 배치 시 우선 적용됩니다.
          </DialogDescription>
        </DialogHeader>

        <StudentPicker
          students={students}
          selectedIds={picked}
          onChange={setPicked}
          max={1}
          multi={false}
        />

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {currentResourceId && (
            <Button
              variant="ghost"
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
              className="text-rose-600 mr-auto"
            >
              고정 해제
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={submit} disabled={picked.length !== 1}>
            고정
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
