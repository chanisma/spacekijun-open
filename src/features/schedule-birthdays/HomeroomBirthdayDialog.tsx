import { Cake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
} from '@/components/tasks/dialogDesign';
import type { BirthdayEntry } from '@/lib/homeroomBirthdays';

/** 그날 생일인 담임 반 학생 명단 — 읽기 전용(가상 일정이라 고칠 것이 없다) */
export function HomeroomBirthdayDialog({
  open,
  onOpenChange,
  date,
  students,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `YYYY-MM-DD` */
  date: string | null;
  students: BirthdayEntry[];
}) {
  const [, month, day] = (date ?? '').split('-').map(Number);
  const dateLabel = month && day ? `${month}월 ${day}일` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50 text-pink-600 ring-1 ring-pink-100">
              <Cake className="h-4 w-4" />
            </span>
            {dateLabel} 생일
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            담임 반 학생만 표시됩니다. 생년월일은 학적 자료에서 가져옵니다.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-slate-100 px-4 py-2 sm:px-6">
          {students.map((student) => (
            <li key={student.resourceId} className="flex min-w-0 items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800" title={student.name}>
                  {student.name}
                </div>
                <div className="text-xs text-slate-500">
                  {student.grade}학년 {student.classNum}반{student.number != null ? ` ${student.number}번` : ''}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700">
                {student.turning}번째 생일
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
