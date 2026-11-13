import { Fragment, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  formatEventTimeText,
  getEventColor,
  getEventDayKeys,
  getEventShortLabel,
  getEventTypeColor,
  isAllDayEvent,
  parseEventAt,
  toDateKey,
} from '@/lib/scheduleUtils';
import { getAssigneeDisplayText } from '@/lib/assigneeUtils';
import type { ScheduleEvent } from '@/hooks/useSchedule';
import { CalendarClock, Plus } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

// ----------------------------------------
// 표시 헬퍼 (날짜·시간 계산은 lib/scheduleUtils.ts)
// ----------------------------------------

const isHolidayEvent = (event: ScheduleEvent): boolean =>
  Boolean(event.holiday) || event.meta?.sbtr_dd_sc_nm === '공휴일';

/** 일정 아래 보조 설명 — 업무(task)는 소속 이벤트명을 함께 보여준다 */
function getSubText(event: ScheduleEvent): string {
  if (event.kind === 'task') {
    return [event.meta?.event_name, event.description].filter(Boolean).join(' · ');
  }
  return event.description || '';
}

// ----------------------------------------
// 타입
// ----------------------------------------

interface PlanEntry {
  event: ScheduleEvent;
  /** 여러 날 일정에서 이 날이 몇 일차인지 (1부터) */
  dayIndex: number;
  /** 여러 날 일정의 전체 일수 */
  dayCount: number;
}

interface PlanDay {
  date: Date;
  key: string;
}

interface ScheduleDailyPlanViewProps {
  selectedDate: Date;
  events: ScheduleEvent[];
  onEventClick: (event: ScheduleEvent) => void;
  onCreateEvent?: (date: Date) => void;
  onMoveRequest?: (event: ScheduleEvent) => void;
}

// ----------------------------------------
// 컴포넌트
// ----------------------------------------

export const ScheduleDailyPlanView = ({
  selectedDate,
  events,
  onEventClick,
  onCreateEvent,
  onMoveRequest,
}: ScheduleDailyPlanViewProps) => {
  // 기본값은 '이번 달 전체 날 표시' — 계획표의 목적이 달 전체를 훑는 것이므로
  const [hideEmptyDays, setHideEmptyDays] = useState(false);
  const [excludedKinds, setExcludedKinds] = useState<Set<string>>(new Set());

  const todayKey = toDateKey(new Date());

  // 이번 달의 모든 날
  const monthDays = useMemo<PlanDay[]>(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const lastDate = new Date(year, month + 1, 0).getDate();

    return Array.from({ length: lastDate }, (_, i) => {
      const date = new Date(year, month, i + 1);
      return { date, key: toDateKey(date) };
    });
  }, [selectedDate]);

  const monthKeySet = useMemo(() => new Set(monthDays.map((day) => day.key)), [monthDays]);

  // 이번 달에 걸치는 일정을 날짜별로 모은다 (여러 날 일정은 매일 등장)
  const allEntriesByDay = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();

    for (const event of events) {
      const keys = getEventDayKeys(event);
      keys.forEach((key, index) => {
        if (!monthKeySet.has(key)) return;
        const list = map.get(key);
        const entry: PlanEntry = { event, dayIndex: index + 1, dayCount: keys.length };
        if (list) list.push(entry);
        else map.set(key, [entry]);
      });
    }

    // 종일 일정을 위로, 그 다음 시작 시각 순
    for (const list of map.values()) {
      list.sort((a, b) => {
        const aAllDay = isAllDayEvent(a.event);
        const bAllDay = isAllDayEvent(b.event);
        if (aAllDay !== bAllDay) return aAllDay ? -1 : 1;
        return (parseEventAt(a.event.starts_at)?.getTime() ?? 0) - (parseEventAt(b.event.starts_at)?.getTime() ?? 0);
      });
    }

    return map;
  }, [events, monthKeySet]);

  // 종류별 건수 (같은 일정이 여러 날 걸쳐도 1건으로 센다)
  const kindSummary = useMemo(() => {
    const counts = new Map<string, Set<string>>();
    for (const list of allEntriesByDay.values()) {
      for (const { event } of list) {
        const ids = counts.get(event.kind) ?? new Set<string>();
        ids.add(event.id);
        counts.set(event.kind, ids);
      }
    }
    return Array.from(counts.entries())
      .map(([kind, ids]) => ({ kind, count: ids.size }))
      .sort((a, b) => b.count - a.count);
  }, [allEntriesByDay]);

  // 종류 필터 적용
  const entriesByDay = useMemo(() => {
    if (excludedKinds.size === 0) return allEntriesByDay;

    const map = new Map<string, PlanEntry[]>();
    for (const [key, list] of allEntriesByDay.entries()) {
      const filtered = list.filter((entry) => !excludedKinds.has(entry.event.kind));
      if (filtered.length > 0) map.set(key, filtered);
    }
    return map;
  }, [allEntriesByDay, excludedKinds]);

  const { totalCount, activeDayCount } = useMemo(() => {
    const ids = new Set<string>();
    let days = 0;
    for (const list of entriesByDay.values()) {
      if (list.length > 0) days += 1;
      for (const { event } of list) ids.add(event.id);
    }
    return { totalCount: ids.size, activeDayCount: days };
  }, [entriesByDay]);

  const toggleKind = (kind: string) => {
    setExcludedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const visibleDays = hideEmptyDays
    ? monthDays.filter((day) => (entriesByDay.get(day.key)?.length ?? 0) > 0)
    : monthDays;

  const renderDateCell = (day: PlanDay, rowSpan: number, hasEvents: boolean) => {
    const weekday = day.date.getDay();
    const isToday = day.key === todayKey;
    const isHoliday = (entriesByDay.get(day.key) ?? []).some((entry) => isHolidayEvent(entry.event));
    const count = entriesByDay.get(day.key)?.length ?? 0;

    return (
      <td
        rowSpan={rowSpan}
        className={cn(
          'sticky left-0 z-10 w-[92px] min-w-[92px] px-3 py-2.5 align-top',
          // 가로 스크롤 시 뒤 내용이 비쳐 보이지 않도록 불투명 배경이 반드시 필요 (알파값 금지)
          isToday ? 'bg-blue-50' : isHoliday ? 'bg-red-50' : hasEvents ? 'bg-white' : 'bg-slate-50'
        )}
      >
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'text-lg font-bold leading-none',
              isToday ? 'text-blue-600' : isHoliday || weekday === 0 ? 'text-red-500' : weekday === 6 ? 'text-blue-500' : 'text-slate-700'
            )}
          >
            {day.date.getDate()}
          </span>
          <span
            className={cn(
              'text-xs font-medium',
              isToday ? 'text-blue-500' : isHoliday || weekday === 0 ? 'text-red-400' : weekday === 6 ? 'text-blue-400' : 'text-slate-400'
            )}
          >
            {format(day.date, 'E', { locale: ko })}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {isToday && <Badge className="h-4 bg-blue-600 px-1 text-[10px] leading-none hover:bg-blue-600">오늘</Badge>}
          {isHoliday && (
            <Badge variant="outline" className="h-4 border-red-200 px-1 text-[10px] leading-none text-red-500">
              공휴일
            </Badge>
          )}
          {count > 0 && <span className="text-[11px] text-slate-400">{count}건</span>}
        </div>

        {/* 날짜 셀은 rowSpan으로 하루에 하나뿐이라, 일정이 몇 건이든 추가 버튼도 하루에 하나만 놓인다 */}
        {onCreateEvent && (
          <button
            type="button"
            onClick={(e) => {
              // 이 셀은 그 날 첫 일정 행 안에 있다 — 막지 않으면 상세 모달이 함께 열린다
              e.stopPropagation();
              onCreateEvent(day.date);
            }}
            className="mt-1.5 flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
            title={`${format(day.date, 'M월 d일', { locale: ko })}에 일정 추가`}
          >
            <Plus className="h-3 w-3" />
            추가
          </button>
        )}
      </td>
    );
  };

  const renderEventRow = (day: PlanDay, entry: PlanEntry, isFirstOfDay: boolean, rowSpan: number) => {
    const { event, dayIndex, dayCount } = entry;
    const subText = getSubText(event);
    const place = event.room_name || event.section_name || '';
    const assignee = getAssigneeDisplayText(event.assignee);
    const isToday = day.key === todayKey;

    const row = (
      <tr
        className={cn(
          'cursor-pointer transition-colors [&>td]:border-b [&>td]:border-slate-100',
          // 일요일마다 주 구분선을 넣어 훑어보기 쉽게 한다
          isFirstOfDay && day.date.getDay() === 0 && '[&>td]:border-t-2 [&>td]:border-t-slate-200',
          isToday ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-slate-50'
        )}
        onClick={() => onEventClick(event)}
      >
        {isFirstOfDay && renderDateCell(day, rowSpan, true)}

        <td className="w-[84px] min-w-[84px] px-2 py-2.5 align-top">
          <span
            className={cn(
              'inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none',
              getEventColor(event)
            )}
          >
            {getEventShortLabel(event.kind)}
          </span>
        </td>

        <td className="min-w-[220px] px-3 py-2.5 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-slate-800">{event.title || '제목 없음'}</span>
            {dayCount > 1 && (
              <Badge variant="outline" className="h-4 border-slate-200 px-1 text-[10px] leading-none text-slate-500">
                {dayIndex}/{dayCount}일차
              </Badge>
            )}
            {event.kind === 'duty' && event.exchangeable && (
              <Badge variant="outline" className="h-4 border-amber-200 px-1 text-[10px] leading-none text-amber-600">
                교환가능
              </Badge>
            )}
          </div>
          {subText && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{subText}</p>}
        </td>

        <td className="w-[132px] min-w-[132px] px-3 py-2.5 align-top text-xs text-slate-600">
          {formatEventTimeText(event)}
        </td>

        <td className="w-[140px] min-w-[140px] px-3 py-2.5 align-top text-xs text-slate-600">
          {place ? <span className="line-clamp-2">{place}</span> : <span className="text-slate-300">-</span>}
        </td>

        <td className="w-[150px] min-w-[150px] px-3 py-2.5 align-top text-xs text-slate-600">
          {assignee ? <span className="line-clamp-2">{assignee}</span> : <span className="text-slate-300">-</span>}
        </td>
      </tr>
    );

    if (!onMoveRequest && !onCreateEvent) return row;

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuLabel className="truncate text-xs text-muted-foreground">{event.title}</ContextMenuLabel>
          <ContextMenuSeparator />
          {onMoveRequest && (
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onMoveRequest(event);
              }}
              className="flex cursor-pointer items-center gap-2"
            >
              <CalendarClock className="h-4 w-4 text-blue-500" />
              <span>일정 이동</span>
            </ContextMenuItem>
          )}
          {onCreateEvent && (
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onCreateEvent(day.date);
              }}
              className="flex cursor-pointer items-center gap-2"
            >
              <Plus className="h-4 w-4 text-blue-500" />
              <span>{format(day.date, 'M/d', { locale: ko })}에 일정 추가</span>
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <ImprovedCard className="overflow-hidden shadow-sm transition-all duration-300">
      {/* 요약 + 필터 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white/60 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-slate-700">
            {format(selectedDate, 'M월', { locale: ko })} 일별 계획표
          </span>
          <span className="text-xs text-slate-500">
            총 {totalCount}건 · 일정 있는 날 {activeDayCount}/{monthDays.length}일
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {kindSummary.map(({ kind, count }) => {
            const active = !excludedKinds.has(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggleKind(kind)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  active
                    ? getEventTypeColor(kind, 'light')
                    : 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                )}
                title={active ? '클릭하면 숨김' : '클릭하면 표시'}
              >
                {getEventShortLabel(kind)} {count}
              </button>
            );
          })}

          <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <Switch checked={hideEmptyDays} onCheckedChange={setHideEmptyDays} />
            <span className="whitespace-nowrap">일정 없는 날 숨기기</span>
          </label>
        </div>
      </div>

      {/* 계획표 본체 — 모바일에서는 가로 스크롤, 날짜 열은 왼쪽에 고정 */}
      <div className="w-full overflow-x-auto">
        {/* border-separate: sticky 셀과 border-collapse 조합은 테두리가 깨지므로 분리 모델을 쓴다 */}
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="bg-gradient-to-r from-gray-50 to-gray-100 [&>th]:border-b [&>th]:border-slate-200 [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-xs [&>th]:font-semibold [&>th]:text-slate-600">
              <th className="sticky left-0 z-10 w-[92px] min-w-[92px] bg-gray-50">날짜</th>
              <th className="w-[84px] min-w-[84px]">구분</th>
              <th className="min-w-[220px]">일정</th>
              <th className="w-[132px] min-w-[132px]">시간</th>
              <th className="w-[140px] min-w-[140px]">장소</th>
              <th className="w-[150px] min-w-[150px]">담당자</th>
            </tr>
          </thead>
          <tbody>
            {visibleDays.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  표시할 일정이 없습니다.
                </td>
              </tr>
            )}

            {visibleDays.map((day) => {
              const entries = entriesByDay.get(day.key) ?? [];

              if (entries.length === 0) {
                return (
                  <tr
                    key={day.key}
                    className={cn(
                      'text-sm [&>td]:border-b [&>td]:border-slate-100',
                      day.date.getDay() === 0 && '[&>td]:border-t-2 [&>td]:border-t-slate-200'
                    )}
                  >
                    {renderDateCell(day, 1, false)}
                    {/* 추가 버튼은 날짜 셀에 하나로 통일 — 여기 또 두면 빈 날만 버튼이 두 개가 된다 */}
                    <td colSpan={5} className="bg-slate-50/40 px-3 py-2.5 align-middle">
                      <span className="text-xs text-slate-300">일정 없음</span>
                    </td>
                  </tr>
                );
              }

              return (
                <Fragment key={day.key}>
                  {entries.map((entry, index) => (
                    <Fragment key={`${day.key}-${entry.event.id}`}>
                      {renderEventRow(day, entry, index === 0, entries.length)}
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </ImprovedCard>
  );
};
