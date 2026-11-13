import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS, DIALOG_FOOTER_CLASS, TitleIconChip } from './timetableDialogDesign';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Calendar, Clock, Loader2, Save } from 'lucide-react';
import { useSchedule } from '@/hooks/useSchedule';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface TimetableActivityDialogProps {
  selectedDate: Date;
  selectedPeriod: number;
  onActivityCreated: () => void;
  trigger?: React.ReactNode;
}

export const TimetableActivityDialog = ({ selectedDate, selectedPeriod, onActivityCreated, trigger }: TimetableActivityDialogProps) => {
  const { createEvent } = useSchedule({ loadEvents: false });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !title.trim()) return;

    setLoading(true);

    // Calculate start and end times based on period
    const startDate = new Date(selectedDate);
    startDate.setHours(8 + selectedPeriod - 1, 0, 0, 0); // 1교시 = 9시, 2교시 = 10시 등

    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1);

    const result = await createEvent({
      title: title.trim(),
      kind: 'event',
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      description: description.trim() || undefined,
      scope: 'all'
    } as any);

    if (result) {
      setTitle('');
      setDescription('');
      setOpen(false);
      onActivityCreated();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!loading) setOpen(nextOpen); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="gap-2 h-6 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200">
            <Plus className="h-3 w-3" />
            활동 추가
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-3.5 text-lg font-semibold tracking-tight text-slate-900">
            <TitleIconChip icon={Calendar} />
            시간표 활동 추가
          </DialogTitle>
          <div className="flex gap-3 text-xs text-slate-500 mt-2">
            <div className="flex items-center gap-1 bg-white/50 px-2 py-1 rounded border border-slate-100">
              <Calendar className="h-3 w-3" />
              {format(selectedDate, 'M월 d일 (E)', { locale: ko })}
            </div>
            <div className="flex items-center gap-1 bg-white/50 px-2 py-1 rounded border border-slate-100">
              <Clock className="h-3 w-3" />
              {selectedPeriod}교시
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-slate-700 font-semibold">활동 제목</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 학급 회의, 동아리 활동"
                required
                className="rounded-xl bg-white border-slate-200 focus:bg-white transition-colors"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-slate-700">설명 (선택사항)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="활동에 대한 설명을 입력하세요"
                rows={4}
                className="resize-none rounded-xl bg-white border-slate-200 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <DialogFooter className={DIALOG_FOOTER_CLASS}>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-slate-700"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white min-w-[80px]"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  저장
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};