import { BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { shiftMonth } from '../utils/statsFormat';
import type { StatsFilters, StudyRoomOption } from '../types';

export type StatsTab = 'summary' | 'students' | 'weekday' | 'temperature';

export const STATS_TABS: Array<[StatsTab, string]> = [
  ['summary', '요약'],
  ['students', '학생별'],
  ['weekday', '요일별'],
  ['temperature', '온도 랭킹'],
];

const ALL = '__all__';

interface Props {
  tab: StatsTab;
  onTab: (t: StatsTab) => void;
  filters: StatsFilters;
  onFilters: (f: StatsFilters) => void;
  rooms: StudyRoomOption[];
  month: string; // YYYY-MM (온도 랭킹)
  onMonth: (m: string) => void;
}

/**
 * 머리글 = 이 화면의 필터·탭만(기능명 제목은 쓰지 않는다 — 사이드바가 말한다).
 * 온도 랭킹은 기간이 아니라 «달»로 본다.
 */
export function StatsToolbar({ tab, onTab, filters, onFilters, rooms, month, onMonth }: Props) {
  const set = (patch: Partial<StatsFilters>) => onFilters({ ...filters, ...patch });
  const isTemp = tab === 'temperature';

  return (
    <div className="rounded-xl border bg-card p-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-1">
            {STATS_TABS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => onTab(v)}
                className={cn(
                  'h-6 rounded-md px-2.5 text-xs font-medium transition-colors',
                  tab === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isTemp ? (
            <Input
              type="month"
              value={month}
              onChange={(e) => e.target.value && onMonth(e.target.value)}
              className="h-8 w-[9.5rem] text-xs md:text-xs"
              aria-label="월별 랭킹의 달"
            />
          ) : (
            <>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onFilters(shiftMonth(filters, -1))} aria-label="이전 달">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Input
                  type="date"
                  value={filters.start}
                  max={filters.end}
                  onChange={(e) => e.target.value && set({ start: e.target.value })}
                  className="h-8 w-[7.25rem] px-2 text-xs sm:w-[8.75rem] sm:px-3 md:text-xs"
                  aria-label="시작일"
                />
                <span className="text-xs text-slate-400">~</span>
                <Input
                  type="date"
                  value={filters.end}
                  min={filters.start}
                  onChange={(e) => e.target.value && set({ end: e.target.value })}
                  className="h-8 w-[7.25rem] px-2 text-xs sm:w-[8.75rem] sm:px-3 md:text-xs"
                  aria-label="종료일"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onFilters(shiftMonth(filters, 1))} aria-label="다음 달">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Select value={filters.room ?? ALL} onValueChange={(v) => set({ room: v === ALL ? null : v })}>
                <SelectTrigger className="h-8 w-[9.5rem] text-xs" aria-label="열람실">
                  <SelectValue placeholder="모든 열람실" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>모든 열람실</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          <Select
            value={filters.grade == null ? ALL : String(filters.grade)}
            onValueChange={(v) => set({ grade: v === ALL ? null : Number(v) })}
          >
            <SelectTrigger className="h-8 w-[6.5rem] text-xs" aria-label="학년">
              <SelectValue placeholder="전 학년" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전 학년</SelectItem>
              <SelectItem value="1">1학년</SelectItem>
              <SelectItem value="2">2학년</SelectItem>
              <SelectItem value="3">3학년</SelectItem>
            </SelectContent>
          </Select>

          {!isTemp && (
            <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs text-slate-600">
              <Switch
                checked={filters.includeFuture}
                onCheckedChange={(v) => set({ includeFuture: v })}
                className="scale-75"
              />
              미래 예약 포함
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
