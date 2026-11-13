import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS, DIALOG_FOOTER_CLASS, TitleIconChip } from './timetableDialogDesign';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUpsertMemo, useDeleteMemo, TeacherMemo } from '@/hooks/useTeacherMemo';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { StickyNote, Trash2, Save } from 'lucide-react';

interface TimetableMemoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: string;
  date: Date;
  period: number;
  existingMemo?: TeacherMemo;
  subjectName?: string;
}

export const TimetableMemoDialog: React.FC<TimetableMemoDialogProps> = ({
  open,
  onOpenChange,
  resourceId,
  date,
  period,
  existingMemo,
  subjectName,
}) => {
  const [content, setContent] = useState('');
  const { toast } = useToast();
  const upsertMemo = useUpsertMemo();
  const deleteMemo = useDeleteMemo();

  const isEdit = !!existingMemo;
  const isSaving = upsertMemo.isPending || deleteMemo.isPending;

  useEffect(() => {
    if (open) {
      setContent(existingMemo?.content || '');
    }
  }, [open, existingMemo]);

  const handleSave = async () => {
    if (!content.trim()) {
      toast({ title: '메모 내용을 입력해주세요.', variant: 'destructive' });
      return;
    }

    try {
      await upsertMemo.mutateAsync({
        resource_id: resourceId,
        memo_date: format(date, 'yyyy-MM-dd'),
        period,
        content: content.trim(),
      });
      toast({ title: isEdit ? '메모가 수정되었습니다.' : '메모가 저장되었습니다.' });
      onOpenChange(false);
    } catch (error) {
      toast({ title: '메모 저장에 실패했습니다.', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!existingMemo) return;

    try {
      await deleteMemo.mutateAsync(existingMemo.id);
      onOpenChange(false);
    } catch (error) {
      toast({ title: '메모 삭제에 실패했습니다.', variant: 'destructive' });
    }
  };

  const dateLabel = format(date, 'M월 d일 (EEEE)', { locale: ko });

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isSaving) onOpenChange(nextOpen); }}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-3.5 text-lg font-semibold tracking-tight text-slate-900">
            <TitleIconChip icon={StickyNote} />
            {isEdit ? '메모 수정' : '메모 작성'}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5 sm:px-7">
          {/* 슬롯 정보 */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-slate-700">{dateLabel}</span>
            <span className="text-slate-400">|</span>
            <span className="font-medium text-slate-700">{period}교시</span>
            {subjectName && (
              <>
                <span className="text-slate-400">|</span>
                <span className="text-brand-600 font-medium">{subjectName}</span>
              </>
            )}
          </div>

          {/* 메모 입력 */}
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="메모를 입력하세요..."
            aria-label="수업 메모"
            disabled={isSaving}
            className="min-h-44 resize-y rounded-xl border-slate-200 leading-relaxed"
            autoFocus
          />
        </div>

        <DialogFooter className={`${DIALOG_FOOTER_CLASS} justify-between`}>
          <div>
            {isEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isSaving}
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                삭제
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isSaving} onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button
              onClick={handleSave}
              className="min-w-24 rounded-xl bg-slate-900 hover:bg-slate-800"
              disabled={isSaving || !content.trim()}
            >
              <Save className="h-4 w-4 mr-1" />
              {isEdit ? '수정' : '저장'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
