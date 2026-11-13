// 한 줄로 업무 시작 (2026-11-12, W0) — 무슨 일 · 언제(선택) · 목표 한 줄(선택). 책임자 = 나, 할 일은 작업실에서.
// 설계 원칙 ① «구조는 나중» — 단계·절차·작업 종류·담당자를 여기서 묻지 않는다.
// 작년 같은 일·비슷한 일이 있으면 «참고해서 시작»(WorkFromReferenceDialog, 2026-11-12)으로 넘긴다 — 적어 둔 이름으로 원본을 정렬한다.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, History, PenLine, Sparkles, Target } from 'lucide-react';
import { WorkFromReferenceDialog } from '@/components/tasks/WorkFromReferenceDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, SectionLabel, TitleIconChip } from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { PersonOption } from '@/lib/candidateToWork';
import { startWork } from '../services/workRoomService';
import { objectHref } from '../model/objectRef';
import { dDayLabel, shortDate } from '../model/workRoom';

export function StartWorkDialog({ open, onOpenChange, me, today }: {
  open: boolean; onOpenChange: (o: boolean) => void; me: PersonOption; today: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [goal, setGoal] = useState('');
  const [refOpen, setRefOpen] = useState(false);

  const start = useMutation({
    mutationFn: () => startWork({ name, targetDate: date || null, goal, me, today }),
    onSuccess: (workId) => {
      void qc.invalidateQueries({ queryKey: ['works-jsonb'] });
      void qc.invalidateQueries({ queryKey: ['work-today'] });
      onOpenChange(false);
      setName(''); setDate(''); setGoal('');
      navigate(objectHref('work', workId));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : '업무를 시작하지 못했습니다'),
  });

  const d = date ? dDayLabel(today, date) : null;
  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2.5">
            <TitleIconChip icon={Sparkles} />
            <div className="min-w-0">
              <DialogTitle className="text-base">새 업무 시작</DialogTitle>
              <DialogDescription className="text-xs">한 줄이면 됩니다. 할 일은 작업실에서 떠오르는 대로 적습니다.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form
          id="start-work-form"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) start.mutate(); }}
        >
          <div>
            <SectionLabel icon={PenLine}>무슨 일인가요</SectionLabel>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-1 text-base sm:text-sm" placeholder="예: 이음마당 부스 참가 준비" aria-label="업무 이름" />
          </div>
          <div>
            <SectionLabel icon={CalendarDays}>언제까지(선택)</SectionLabel>
            <div className="mt-1 flex items-center gap-2">
              <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className="w-44 text-base sm:text-sm" aria-label="목표일" />
              {date && <span className="text-sm text-slate-600">{shortDate(date)} · {d}</span>}
            </div>
          </div>
          <div>
            <SectionLabel icon={Target}>목표 한 줄(선택)</SectionLabel>
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={200} className="mt-1 text-base sm:text-sm" placeholder="예: 나눔부스에서 우리 학교 AI 수업 사례 시연" aria-label="목표" />
          </div>
          <p className="text-xs text-slate-500">책임자는 나로 시작합니다. 함께할 사람은 할 일을 맡길 때 정합니다.</p>
          <button
            type="button"
            onClick={() => { onOpenChange(false); setRefOpen(true); }}
            className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
          >
            <History className="h-4 w-4 flex-none text-blue-600" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-slate-800">작년 같은 일·비슷한 일이 있나요?</span>
              <span className="block text-xs text-slate-500">참고해서 시작하면 할 일과 작업을 가져옵니다</span>
            </span>
            <span className="flex-none text-xs font-medium text-blue-700">참고해서 시작 →</span>
          </button>
        </form>
        <div className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)} onClick={() => onOpenChange(false)}>취소</Button>
          <Button type="submit" form="start-work-form" disabled={!name.trim() || start.isPending} className={cn(FOOTER_BUTTON_CLASS, 'bg-blue-600 text-white hover:bg-blue-700')}>
            {start.isPending ? '만드는 중…' : '작업실 열기'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <WorkFromReferenceDialog
      open={refOpen}
      onOpenChange={setRefOpen}
      hints={name.trim() ? [name] : []}
      defaults={{ name: name.trim() || undefined, targetDate: date || null, goal }}
      me={me}
      startedIn="work_room"
      onCreated={(workId) => {
        setName(''); setDate(''); setGoal('');
        void qc.invalidateQueries({ queryKey: ['work-today'] });
        navigate(objectHref('work', workId));
      }}
    />
    </>
  );
}
