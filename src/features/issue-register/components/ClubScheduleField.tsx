import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClubScheduleEntry } from '../types';
import { MAX_CLUB_ACTIVITIES } from '../hwpx/clubFormFill';

/**
 * 활동 일시 편집기 — 봉사 날짜·시간을 직접 추가/삭제한다(발급 공통).
 * 동아리 확인서는 일시 수마다 명단표 출석 열이 생기므로 최대 개수(9열)를 막는다.
 * 봉사 내용은 여기서 입력하지 않고 발급 후 동아리별로 작성한다.
 */
export function ClubScheduleField({
  value, onChange,
}: { value: ClubScheduleEntry[]; onChange: (v: ClubScheduleEntry[]) => void }) {
  const update = (i: number, patch: Partial<ClubScheduleEntry>) =>
    onChange(value.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const add = () => onChange([...value, { date: '', hours: 1 }]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const totalHours = value.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const atMax = value.length >= MAX_CLUB_ACTIVITIES;

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <Label>활동 일시 <span className="text-[11px] font-normal text-slate-400">날짜·시간 (발급 공통)</span></Label>
        <span className="text-[11px] text-slate-400">
          총 <span className="font-medium tabular-nums text-slate-600">{value.length}</span>회 ·
          인정 <span className="font-medium tabular-nums text-slate-600">{totalHours}</span>시간
        </span>
      </div>

      <div className="space-y-2">
        {value.map((e, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_auto] items-center gap-1.5">
            <Input
              type="date"
              value={e.date}
              onChange={ev => update(i, { date: ev.target.value })}
              aria-label={`활동 ${i + 1} 날짜`}
            />
            <Input
              type="number"
              min={0}
              step={1}
              value={e.hours}
              onChange={ev => update(i, { hours: ev.target.value === '' ? 0 : Number(ev.target.value) })}
              aria-label={`활동 ${i + 1} 시간`}
              title="시간"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={value.length <= 1}
              title="이 일시 삭제"
              aria-label={`활동 ${i + 1} 삭제`}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all',
                'hover:bg-rose-50 hover:text-rose-600 active:scale-95',
                'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400',
              )}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        disabled={atMax}
        className="w-full gap-1.5 border-dashed"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        일시 추가
        {atMax && <span className="text-[11px] text-slate-400">(최대 {MAX_CLUB_ACTIVITIES}회)</span>}
      </Button>

      <p className="text-[11px] text-slate-400">봉사 내용은 발급 후 대장에서 동아리별로 작성합니다.</p>
    </div>
  );
}
