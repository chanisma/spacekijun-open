import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS, DIALOG_FOOTER_CLASS, TitleIconChip } from './timetableDialogDesign';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, CalendarIcon, Plus, Save, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, addDays, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useSchedule } from '@/hooks/useSchedule';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

interface TimetableAddActivityDialogProps {
  currentWeek: Date;
  onActivityCreated: () => void;
  trigger?: React.ReactNode;
}

export const TimetableAddActivityDialog = ({
  currentWeek,
  onActivityCreated,
  trigger
}: TimetableAddActivityDialogProps) => {
  const { createEvent } = useSchedule({ loadEvents: false });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 주간 날짜 계산
  const weekDays = React.useMemo(() => {
    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
    return Array.from({ length: 5 }, (_, i) => ({
      date: addDays(weekStart, i),
      label: format(addDays(weekStart, i), 'E', { locale: ko }),
      fullLabel: format(addDays(weekStart, i), 'M월 d일 (E)', { locale: ko }),
      isToday: format(addDays(weekStart, i), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
    }));
  }, [currentWeek]);

  // 교시 옵션
  const periods = Array.from({ length: 8 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}교시 (${8 + i}:00 - ${9 + i}:00)`
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !title.trim() || !selectedDate || !selectedPeriod) return;

    setLoading(true);

    // Calculate start and end times based on period
    const startDate = new Date(selectedDate);
    startDate.setHours(8 + parseInt(selectedPeriod) - 1, 0, 0, 0);

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
      setSelectedDate(undefined);
      setSelectedPeriod('');
      setOpen(false);
      onActivityCreated();
    }
    setLoading(false);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSelectedDate(undefined);
    setSelectedPeriod('');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (loading) return;
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-md">
            <Plus className="h-4 w-4" />
            새 활동 추가
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-3.5 text-lg font-semibold tracking-tight text-slate-900">
            <TitleIconChip icon={Calendar} />
            시간표 활동 추가
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
            {/* 활동 제목 */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-slate-700 font-semibold">활동 제목</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 특별수업, 행사, 미팅 등"
                required
                className="rounded-xl bg-white border-slate-200 focus:bg-white transition-colors h-11 text-base"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {/* 날짜 선택 */}
              <div className="space-y-3">
                <Label className="text-slate-700 font-semibold flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  날짜 선택
                </Label>

                <div className="space-y-2">
                  {/* Date Selection Trigger */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal h-10 bg-white border-slate-200",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                        {selectedDate ? (
                          <span className="text-slate-900 font-medium">
                            {format(selectedDate, "M월 d일 (E)", { locale: ko })}
                          </span>
                        ) : (
                          "날짜를 선택하세요"
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        initialFocus
                        className="rounded-md border shadow"
                      />
                    </PopoverContent>
                  </Popover>

                  {/* 이번 주 퀵 버튼 */}
                  <div className="pt-1">
                    <Label className="text-xs text-muted-foreground mb-1.5 block px-1">이번 주 빠른 선택</Label>
                    <div className="grid grid-cols-5 gap-1">
                      {weekDays.map((day) => (
                        <Button
                          key={day.date.toISOString()}
                          type="button"
                          variant="ghost"
                          className={cn(
                            "h-8 text-xs px-0 hover:bg-slate-100",
                            selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day.date, 'yyyy-MM-dd')
                              ? "bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 border border-indigo-200"
                              : "text-slate-600 border border-transparent",
                            day.isToday && !selectedDate ? "bg-slate-50 text-slate-900 border-slate-200" : ""
                          )}
                          onClick={() => setSelectedDate(day.date)}
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 교시 선택 */}
              <div className="space-y-3">
                <Label htmlFor="period" className="text-slate-700 font-semibold flex items-center gap-1">
                  <Clock className="h-4 w-4 text-slate-500" />
                  교시 선택
                </Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger id="period" className="h-10 rounded-xl bg-white border-slate-200">
                    <SelectValue placeholder="교시 선택" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {periods.map((period) => (
                      <SelectItem key={period.value} value={period.value}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Visual feedback for selection */}
                {selectedDate && selectedPeriod && (
                  <div className="mt-4 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-sm text-indigo-900 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="font-semibold flex items-center gap-1.5 mb-1 text-indigo-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      선택 완료
                    </div>
                    <div>
                      {format(selectedDate, 'M/d(E)', { locale: ko })} {selectedPeriod}교시
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 설명 */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-slate-700 font-semibold">설명 (선택사항)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="활동에 대한 추가 설명을 입력하세요"
                rows={3}
                className="resize-none rounded-xl bg-white border-slate-200 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <DialogFooter className={DIALOG_FOOTER_CLASS}>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setOpen(false)}
                className="flex-1 sm:flex-none text-slate-500 hover:text-slate-700"
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={loading || !title.trim() || !selectedDate || !selectedPeriod}
                className="flex-1 sm:flex-none rounded-xl bg-slate-900 hover:bg-slate-800 text-white min-w-[100px]"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    활동 추가
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
