import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getEventColor, getEventShortLabel, type ScheduleViewMode } from '@/lib/scheduleUtils';
import { isBirthdayEvent } from '@/lib/homeroomBirthdays';
import { getAssigneeDisplayText } from '@/lib/assigneeUtils';
import { ScheduleEvent } from '@/hooks/useSchedule';
import { ScheduleDetailDialog } from './ScheduleDetailDialog';
import { ScheduleDailyPlanView } from './ScheduleDailyPlanView';
import { TaskDetailDialog } from '@/components/tasks/TaskDetailDialog';
import { useTask } from '@/hooks/useTasksJsonb';
import { Clock, Users, MapPin, RotateCcw, PenTool, FileText, Link, Plus, CalendarClock } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ScheduleCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  viewMode: ScheduleViewMode;
  events: ScheduleEvent[];
  getEventsForDate: (date: Date) => ScheduleEvent[];
  onDelete?: (eventId: string) => Promise<boolean>;
  onUpdate?: (eventId: string, eventData: any) => Promise<boolean>;
  onCreateEvent?: (date: Date) => void;
  onMoveEvent?: (eventId: string, newDate: Date) => Promise<boolean>;
  onOpenSchoolLifeEvent?: (id: string) => void;
  /** 담임 반 학생 생일(가상 일정) 클릭 — 일정 상세 창으로 보내지 않는다(`meeting` 에 없는 id) */
  onOpenBirthday?: (event: ScheduleEvent) => void;
  /**
   * `?event=<id>` 로 들어왔다 — 그 일정의 상세를 자동으로 연다(2026-09-24, 작업
   * 「연수 참석 서명 받기」가 이 길로 보낸다). 목록에 아직 없으면(다른 달) 기다린다.
   */
  deepLinkEventId?: string | null;
  onDeepLinkConsumed?: () => void;
}

export const ScheduleCalendar = ({
  selectedDate,
  onDateSelect,
  viewMode,
  events,
  getEventsForDate,
  onDelete,
  onUpdate,
  onCreateEvent,
  onMoveEvent,
  onOpenSchoolLifeEvent,
  onOpenBirthday,
  deepLinkEventId = null,
  onDeepLinkConsumed,
}: ScheduleCalendarProps) => {
  const [eventDetailOpen, setEventDetailOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);

  // 딥링크 — 해당 일정이 목록에 들어오면 한 번만 연다. 못 찾은 동안은 파라미터를 지우지 않는다
  // (다른 달의 일정이면 부모가 날짜를 옮긴 뒤에야 들어온다 — 먼저 지우면 조용히 안 열린다).
  useEffect(() => {
    if (!deepLinkEventId) return;
    const found = events.find((event) => event.id === deepLinkEventId);
    if (!found) return;
    setSelectedEvent(found);
    onDeepLinkConsumed?.();
  }, [deepLinkEventId, events, onDeepLinkConsumed]);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 일정 이동 다이얼로그 상태
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingEvent, setMovingEvent] = useState<ScheduleEvent | null>(null);
  const [moveTargetDate, setMoveTargetDate] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  const openMoveDialog = (event: ScheduleEvent) => {
    setMovingEvent(event);
    setMoveTargetDate(format(new Date(event.starts_at), 'yyyy-MM-dd'));
    setMoveDialogOpen(true);
  };

  // 일정 클릭 시 열 다이얼로그 분기 — 월/주/계획표 뷰가 공유한다
  const handleEventClick = (event: ScheduleEvent) => {
    if (isBirthdayEvent(event)) {
      onOpenBirthday?.(event);
    } else if (event.meta?.school_life_event_id && onOpenSchoolLifeEvent) {
      onOpenSchoolLifeEvent(event.meta.school_life_event_id);
    } else if (event.kind === 'task' && event.meta?.original_task_id) {
      setSelectedTaskId(event.meta.original_task_id);
      setTaskDetailOpen(true);
    } else {
      setSelectedEvent(event);
      setEventDetailOpen(true);
    }
  };

  const handleMoveConfirm = async () => {
    if (!movingEvent || !moveTargetDate || !onMoveEvent) return;
    setIsMoving(true);
    await onMoveEvent(movingEvent.id, new Date(moveTargetDate));
    setIsMoving(false);
    setMoveDialogOpen(false);
    setMovingEvent(null);
  };

  // Fetch task data when task is selected
  const { data: selectedTask } = useTask(selectedTaskId || '');


  const renderMonthView = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const weeks = [];
    const currentDate = new Date(startDate);

    while (currentDate <= lastDay || currentDate.getDay() !== 0) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(currentDate);
        const dayEvents = getEventsForDate(date);
        const isCurrentMonth = date.getMonth() === month;
        const isToday = date.getTime() === today.getTime();

        const monthCell = (
          <div
            key={date.toISOString()}
            className={cn(
              "min-h-[80px] sm:min-h-[110px] p-1 sm:p-2 border border-gray-100 cursor-pointer transition-colors",
              isCurrentMonth ? "bg-white hover:bg-gray-50" : "bg-gray-50/50 text-gray-400",
              isToday && "bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-100"
            )}
            onClick={() => onDateSelect(date)}
          >
            <div className={cn(
              "text-xs sm:text-sm font-medium mb-1 sm:mb-2 flex items-center justify-between",
              isToday && "text-blue-600 font-semibold"
            )}>
              <span>{date.getDate()}</span>
              {dayEvents.length > 0 && (
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full"></span>
              )}
            </div>

            <div className="space-y-0.5 sm:space-y-1">
              {dayEvents.map((event) => (
                <div key={event.id} className="relative group">
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-sm sm:rounded-md border cursor-pointer transition-all duration-200 hover:shadow-sm",
                          getEventColor(event)
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEventClick(event);
                        }}
                      >
                        <div className="font-medium truncate">
                          {event.title?.length > 6 && window.innerWidth < 640
                            ? event.title.substring(0, 6) + '...'
                            : event.title || '제목 없음'}
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    {onMoveEvent && !event.meta?.school_life_event_id && !isBirthdayEvent(event) && (
                      <ContextMenuContent className="w-48">
                        <ContextMenuLabel className="text-xs text-muted-foreground truncate">{event.title}</ContextMenuLabel>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={(e) => { e.stopPropagation(); openMoveDialog(event); }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <CalendarClock className="h-4 w-4 text-blue-500" />
                          <span>일정 이동</span>
                        </ContextMenuItem>
                      </ContextMenuContent>
                    )}
                  </ContextMenu>
                  {event.kind === 'duty' && event.exchangeable && (
                    <div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-amber-400 rounded-full border border-white" />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
        week.push(
          onCreateEvent ? (
            <ContextMenu key={date.toISOString()}>
              <ContextMenuTrigger asChild>{monthCell}</ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuLabel className="text-xs text-muted-foreground">
                  {format(date, 'M/d (E)', { locale: ko })}
                </ContextMenuLabel>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => onCreateEvent(date)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4 text-blue-500" />
                  <span>일정 추가</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ) : monthCell
        );

        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeks.push(
        <div key={weeks.length} className="grid grid-cols-7">
          {week}
        </div>
      );

      if (currentDate > lastDay && currentDate.getDay() === 0) break;
    }

    return (
      <ImprovedCard className="overflow-hidden shadow-sm transition-all duration-300">
        <div className="grid grid-cols-7 bg-gradient-to-r from-gray-50 to-gray-100 border-b">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
            <div key={day} className={cn(
              "p-2 sm:p-3 text-center text-xs sm:text-sm font-semibold transition-colors duration-200",
              index === 0 && "text-red-500",
              index === 6 && "text-blue-500",
              index > 0 && index < 6 && "text-gray-700"
            )}>
              {day}
            </div>
          ))}
        </div>
        <div className="transition-all duration-300 ease-out">
          {weeks}
        </div>
      </ImprovedCard>
    );
  };

  const renderDayView = () => {
    const dayEvents = getEventsForDate(selectedDate);
    return (
      <div className="space-y-3 sm:space-y-4">
        <ImprovedCard className="p-3 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
            {selectedDate.toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long'
            })}
          </h3>

          <div className="space-y-2 sm:space-y-3">
            <h4 className="font-medium text-sm sm:text-base">일정</h4>
            {dayEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-6 sm:py-8 text-sm sm:text-base">
                이 날에는 일정이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <ImprovedCard key={event.id} className="p-3 sm:p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-2">
                          <div className={cn(
                            "px-2 py-1 rounded-md text-xs font-medium border shrink-0",
                            getEventColor(event)
                          )}>
                            {event.kind === 'duty' && <Clock className="h-3 w-3 mr-1 inline" />}
                            {event.kind === 'document_submission' && <FileText className="h-3 w-3 mr-1 inline" />}
                            {getEventShortLabel(event.kind)}
                          </div>
                          {event.holiday && (
                            <Badge variant="outline" className="text-red-600 text-xs">
                              공휴일
                            </Badge>
                          )}
                          {event.kind === 'duty' && event.exchangeable && (
                            <Badge variant="outline" className="text-yellow-600 text-xs">
                              교환가능
                            </Badge>
                          )}
                        </div>
                        <h5 className="font-medium text-sm sm:text-base mb-1">{event.title}</h5>
                        <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 sm:gap-2 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>
                              {new Date(event.starts_at).toLocaleTimeString('ko-KR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })} - {new Date(event.ends_at).toLocaleTimeString('ko-KR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>
                        {event.room_name && (
                          <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{event.room_name}</span>
                          </div>
                        )}
                        {event.assignee && (
                          <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <Users className="h-3 w-3 shrink-0" />
                            <span className="truncate">{getAssigneeDisplayText(event.assignee)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </ImprovedCard>
                ))}
              </div>
            )}
          </div>
        </ImprovedCard>
      </div>
    );
  };


  const renderWeekView = () => {
    const weekStart = new Date(selectedDate);
    weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      return date;
    });

    return (
      <ImprovedCard className="overflow-hidden shadow-sm transition-all duration-300">
        <div className="grid grid-cols-7 bg-gradient-to-r from-gray-50 to-gray-100 border-b">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
            <div key={day} className={cn(
              "p-2 sm:p-3 text-center text-xs sm:text-sm font-semibold transition-colors duration-200",
              index === 0 && "text-red-500",
              index === 6 && "text-blue-500",
              index > 0 && index < 6 && "text-gray-700"
            )}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-gray-100 min-h-[300px] sm:min-h-[400px] transition-all duration-300 ease-out">
          {weekDays.map((date) => {
            const dayEvents = getEventsForDate(date);
            const isToday = date.getTime() === today.getTime();

            const weekCell = (
              <div
                key={date.toISOString()}
                data-date={date.toISOString()}
                className={cn(
                  "p-1 sm:p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors",
                  isToday && "bg-blue-50 border-blue-200 ring-1 ring-blue-100"
                )}
                onClick={() => onDateSelect(date)}
              >
                <div className={cn(
                  "text-xs sm:text-sm font-medium mb-2 sm:mb-3 flex items-center justify-between",
                  isToday && "text-blue-600 font-semibold"
                )}>
                  <span>{date.getDate()}</span>
                  {dayEvents.length > 0 && (
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-400 rounded-full"></span>
                  )}
                </div>

                <div className="space-y-1 sm:space-y-2">
                  {dayEvents.map((event) => (
                    <div key={event.id} className="relative">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div
                            className={cn(
                              "text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-sm sm:rounded-md border cursor-pointer transition-all duration-200 hover:shadow-sm",
                              getEventColor(event)
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEventClick(event);
                            }}
                          >
                            <div className="font-medium truncate">
                              {event.title.length > 5 && window.innerWidth < 640
                                ? event.title.substring(0, 5) + '...'
                                : event.title}
                            </div>
                          </div>
                        </ContextMenuTrigger>
                        {onMoveEvent && !event.meta?.school_life_event_id && !isBirthdayEvent(event) && (
                          <ContextMenuContent className="w-48">
                            <ContextMenuLabel className="text-xs text-muted-foreground truncate">{event.title}</ContextMenuLabel>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={(e) => { e.stopPropagation(); openMoveDialog(event); }}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <CalendarClock className="h-4 w-4 text-blue-500" />
                              <span>일정 이동</span>
                            </ContextMenuItem>
                          </ContextMenuContent>
                        )}
                      </ContextMenu>
                    </div>
                  ))}
                </div>
              </div>
            );
            return onCreateEvent ? (
              <ContextMenu key={date.toISOString()}>
                <ContextMenuTrigger asChild>{weekCell}</ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuLabel className="text-xs text-muted-foreground">
                    {format(date, 'M/d (E)', { locale: ko })}
                  </ContextMenuLabel>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => onCreateEvent(date)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 text-blue-500" />
                    <span>일정 추가</span>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : weekCell;
          })}
        </div>
      </ImprovedCard>
    );
  };

  return (
    <>
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'day' && renderDayView()}
      {viewMode === 'plan' && (
        <ScheduleDailyPlanView
          selectedDate={selectedDate}
          events={events}
          onEventClick={handleEventClick}
          onCreateEvent={onCreateEvent}
          onMoveRequest={onMoveEvent ? openMoveDialog : undefined}
        />
      )}

      {/* 일정 이동 다이얼로그 */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-500" />
              일정 이동
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground truncate">
              {movingEvent?.title}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="move-date" className="text-sm">이동할 날짜</Label>
              <Input
                id="move-date"
                type="date"
                value={moveTargetDate}
                onChange={(e) => setMoveTargetDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleMoveConfirm} disabled={!moveTargetDate || isMoving}>
              {isMoving ? '이동 중...' : '이동'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      
      <ScheduleDetailDialog
        open={eventDetailOpen}
        onOpenChange={setEventDetailOpen}
        event={selectedEvent ? events.find((event) => event.id === selectedEvent.id) ?? selectedEvent : null}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />

      <TaskDetailDialog
        task={selectedTask || null}
        open={taskDetailOpen}
        onOpenChange={(open) => {
          setTaskDetailOpen(open);
          if (!open) {
            setSelectedTaskId(null);
          }
        }}
      />
    </>
  );
};
