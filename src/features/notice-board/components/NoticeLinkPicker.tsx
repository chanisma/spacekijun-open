// ========================================
// 공지 링크 삽입 픽커
// - 일정: 월 달력 UI (날짜별 일정 도트 → 날짜 선택 → 일정 목록) + 제목 검색
// - 업무: 업무 관리의 분류 체계 그대로 event → task 트리 (useWorksJsonb 재사용)
// - 구매 신청: 최근 게시글 리스트 + 검색
// 각 쿼리는 현재 사용자 RLS를 그대로 따른다.
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileOutput,
  FolderOpen,
  ListTodo,
  Loader2,
  Plus,
  Search,
  Sparkles,
  ShoppingCart,
  StickyNote,
  Users,
} from 'lucide-react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useWorksJsonb } from '@/hooks/useTasksJsonb';
import { useSchedule } from '@/hooks/useSchedule';
import { useCollabBoards } from '@/hooks/useCollabBoards';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { useAuth } from '@/components/auth/AuthProvider';
import { ScheduleCreateDialog } from '@/components/schedule/ScheduleCreateDialog';
import { TaskEditDialog } from '@/components/tasks/TaskEditDialog';
import { WorkCreateDialog } from '@/components/tasks/WorkCreateDialog';
import { NOTICE_LINK_TYPE_LABEL, type NoticeLinkToken, type NoticeLinkType } from '../utils/noticeLinks';
import { hasCollabViewAccess } from '../utils/collabAccess';

const MEETING_KIND_LABEL: Record<string, string> = {
  schedule: '학사일정',
  event: '출장',
  duty: '업무',
  training: '연수',
  document_submission: '서류 제출',
  personal: '개인',
};

const TYPE_ICON: Record<NoticeLinkType, typeof Calendar> = {
  schedule: Calendar,
  task: ListTodo,
  purchase: ShoppingCart,
  collab: StickyNote,
  docgen: FileOutput,
  activity: Sparkles,
  // 일정 설문은 설문 만들기 화면에서 본문에 토큰을 자동으로 넣으므로
  // 이 픽커에는 진입 버튼이 없다. 아이콘 맵은 타입 완전성을 위해 채워 둔다.
  survey: ClipboardList,
};

interface MeetingRow {
  id: string;
  kind: string;
  starts_at: string;
  meta: { title?: string } | null;
}

const meetingTitle = (m: MeetingRow) => m.meta?.title || '(제목 없음)';

/** 검색어 디바운스 훅 (300ms) */
function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
      />
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      불러오는 중...
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{message}</div>;
}

// ----------------------------------------
// 일정 패널 — 월 달력
// ----------------------------------------

/**
 * 새 일정 생성 호스트 — 스케줄 기능의 ScheduleCreateDialog + useSchedule.createWork를
 * 그대로 재사용. useSchedule 마운트 비용(일정 페치)이 있으므로 열릴 때만 마운트한다.
 * 생성 성공 시 meeting id를 돌려받아 곧바로 링크 토큰으로 삽입.
 */
function NoticeScheduleCreateHost({
  selectedDate,
  onOpenChange,
  onCreated,
}: {
  selectedDate: Date;
  onOpenChange: (open: boolean) => void;
  onCreated: (meetingId: string, title: string) => void;
}) {
  // 일정 생성만 필요 — 목록 조회는 끈다
  const { createEvent } = useSchedule({ loadEvents: false });
  const queryClient = useQueryClient();

  const handleCreate = async (eventData: {
    title: string;
    [key: string]: unknown;
  }): Promise<boolean | string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createEvent(eventData as any);
    if (result) {
      // 픽커 달력 갱신 (prefix 매칭)
      queryClient.invalidateQueries({ queryKey: ['notice-link-meetings-month'] });
      if (typeof result === 'string') {
        onCreated(result, eventData.title);
      }
      return typeof result === 'string' ? result : true;
    }
    return false;
  };

  return (
    <ScheduleCreateDialog
      open
      onOpenChange={onOpenChange}
      onCreateEvent={handleCreate}
      selectedDate={selectedDate}
    />
  );
}

function SchedulePickerPanel({ onPick }: { onPick: (token: NoticeLinkToken) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounced(search);
  const searching = debouncedSearch.trim().length > 0;

  // 달력 그리드 범위(앞뒤 주 포함)의 일정을 한 번에 로드
  const gridStart = startOfWeek(month, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });

  const { data: monthMeetings = [], isLoading } = useQuery({
    queryKey: ['notice-link-meetings-month', format(gridStart, 'yyyy-MM-dd'), format(gridEnd, 'yyyy-MM-dd')],
    queryFn: async (): Promise<MeetingRow[]> => {
      const { data, error } = await supabase
        .from('meeting')
        .select('id, kind, starts_at, meta')
        .gte('starts_at', gridStart.toISOString())
        .lte('starts_at', addDays(gridEnd, 1).toISOString())
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return (data || []) as MeetingRow[];
    },
    enabled: !searching,
    staleTime: 1000 * 60,
  });

  // 제목 검색 모드 — 날짜 무관 전체 검색
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ['notice-link-meetings-search', debouncedSearch],
    queryFn: async (): Promise<MeetingRow[]> => {
      const { data, error } = await supabase
        .from('meeting')
        .select('id, kind, starts_at, meta')
        .ilike('meta->>title', `%${debouncedSearch.trim()}%`)
        .order('starts_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as MeetingRow[];
    },
    enabled: searching,
    staleTime: 1000 * 30,
  });

  // 날짜별 일정 그룹
  const byDay = useMemo(() => {
    const map = new Map<string, MeetingRow[]>();
    monthMeetings.forEach((m) => {
      const key = format(new Date(m.starts_at), 'yyyy-MM-dd');
      const list = map.get(key) || [];
      list.push(m);
      map.set(key, list);
    });
    return map;
  }, [monthMeetings]);

  const weeks = useMemo(() => {
    const days: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStart.getTime(), gridEnd.getTime()]);

  const dayMeetings = byDay.get(format(selectedDay, 'yyyy-MM-dd')) || [];

  const meetingRow = (m: MeetingRow, showDate: boolean) => (
    <li key={m.id}>
      <button
        type="button"
        onClick={() => onPick({ type: 'schedule', id: m.id, label: meetingTitle(m) })}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50/60"
      >
        <Badge variant="outline" className="shrink-0 border-purple-200 bg-purple-50 text-[10px] text-purple-700">
          {MEETING_KIND_LABEL[m.kind] ?? m.kind}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{meetingTitle(m)}</span>
        <span className="shrink-0 text-xs text-slate-400">
          {format(new Date(m.starts_at), showDate ? 'M/d HH:mm' : 'HH:mm')}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder="일정 제목 검색 (달력 대신 전체 기간 검색)" />

      {searching ? (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100">
          {isSearching ? (
            <LoadingRow />
          ) : searchResults.length === 0 ? (
            <EmptyRow message="검색 결과가 없습니다." />
          ) : (
            <ul className="divide-y divide-slate-100">{searchResults.map((m) => meetingRow(m, true))}</ul>
          )}
        </div>
      ) : (
        <>
          {/* 월 내비게이션 */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMonth((m) => addMonths(m, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              className="rounded-md px-2 py-0.5 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              onClick={() => {
                setMonth(startOfMonth(new Date()));
                setSelectedDay(new Date());
              }}
            >
              {format(month, 'yyyy년 M월', { locale: ko })}
            </button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* 달력 그리드 */}
          <div className="rounded-lg border border-slate-100 p-2">
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    'py-1 text-[11px] font-medium',
                    i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'
                  )}
                >
                  {d}
                </div>
              ))}
              {weeks.flat().map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const count = byDay.get(key)?.length ?? 0;
                const inMonth = isSameMonth(day, month);
                const isSelected = isSameDay(day, selectedDay);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      'relative flex h-9 flex-col items-center justify-center rounded-md text-xs transition-colors',
                      inMonth ? 'text-slate-700' : 'text-slate-300',
                      isSelected
                        ? 'bg-blue-600 font-semibold text-white hover:bg-blue-600'
                        : 'hover:bg-slate-100',
                      !isSelected && isToday && 'ring-1 ring-inset ring-blue-400'
                    )}
                  >
                    {format(day, 'd')}
                    {count > 0 && (
                      <span
                        className={cn(
                          'absolute bottom-1 h-1 w-1 rounded-full',
                          isSelected ? 'bg-white' : 'bg-blue-500'
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 선택한 날짜의 일정 목록 */}
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100">
            {isLoading ? (
              <LoadingRow />
            ) : dayMeetings.length === 0 ? (
              <EmptyRow message={`${format(selectedDay, 'M월 d일', { locale: ko })}에 일정이 없습니다.`} />
            ) : (
              <ul className="divide-y divide-slate-100">{dayMeetings.map((m) => meetingRow(m, false))}</ul>
            )}
          </div>

          {/* 새 일정 생성 — 스케줄 기능의 생성 다이얼로그 재사용 */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 border-dashed text-emerald-700 border-emerald-300/80 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-400"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {format(selectedDay, 'M월 d일', { locale: ko })}에 새 일정 만들기
          </Button>
        </>
      )}

      {createOpen && (
        <NoticeScheduleCreateHost
          selectedDate={selectedDay}
          onOpenChange={(open) => !open && setCreateOpen(false)}
          onCreated={(meetingId, title) => {
            setCreateOpen(false);
            onPick({ type: 'schedule', id: meetingId, label: title });
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------
// 업무 패널 — event → task 트리 (업무 관리 분류 체계)
// ----------------------------------------

interface TaskRowLite {
  id: string;
  title: string;
  status?: string;
  due_date?: string | null;
}

interface EventLite {
  id: string;
  name: string;
  meta?: { department?: string } | null;
  tasks?: TaskRowLite[];
}

// 문서 생성 페이지의 '업무 연결' 픽커로도 재사용한다(export 이유) — 토큰의 id/label만 소비.
export function TaskPickerPanel({ onPick }: { onPick: (token: NoticeLinkToken) => void }) {
  const { data: events = [], isLoading } = useWorksJsonb() as { data: EventLite[]; isLoading: boolean };
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** 새 업무 생성 대상 이벤트 id — 설정 시 TaskEditDialog(생성 모드) 오픈 */
  const [createWorkId, setCreateWorkId] = useState<string | null>(null);
  /** 새 이벤트(프로젝트) 생성 다이얼로그 오픈 여부 */
  const [createWorkOpen, setCreateWorkOpen] = useState(false);
  const debouncedSearch = useDebounced(search);
  const q = debouncedSearch.trim().toLowerCase();

  // 검색 시: 이벤트명 매치 = 전체 task 유지 / task명 매치 = 해당 task만.
  // 비검색 모드에선 task 없는 이벤트도 표시 (새로 만든 이벤트에 '+'로 업무를 추가할 수 있도록)
  const visibleWorks = useMemo(() => {
    return events
      .map((event) => {
        const tasks = event.tasks || [];
        if (!q) return { event, tasks };
        const eventMatches = (event.name || '').toLowerCase().includes(q);
        const matchedTasks = tasks.filter((t) => (t.title || '').toLowerCase().includes(q));
        return { event, tasks: eventMatches ? tasks : matchedTasks };
      })
      .filter(({ tasks }) => (q ? tasks.length > 0 : true));
  }, [events, q]);

  const toggle = (eventId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder="이벤트·업무 제목 검색" />
      <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-100">
        {isLoading ? (
          <LoadingRow />
        ) : visibleWorks.length === 0 ? (
          <EmptyRow message="업무가 없습니다." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleWorks.map(({ event, tasks }) => {
              // 검색 중에는 자동 펼침
              const isOpen = q ? true : expanded.has(event.id);
              return (
                <li key={event.id}>
                  {/* 이벤트(프로젝트) 행 — 토글 버튼 + 업무 추가 버튼 (버튼 중첩 방지 위해 div 래핑) */}
                  <div className="flex items-center bg-slate-50/60 transition-colors hover:bg-slate-100/80">
                    <button
                      type="button"
                      onClick={() => toggle(event.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
                    >
                      <ChevronDown
                        className={cn('h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform', !isOpen && '-rotate-90')}
                      />
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {event.name || '(이름 없음)'}
                      </span>
                      {event.meta?.department && (
                        <Badge variant="outline" className="shrink-0 border-slate-200 bg-white text-[10px] text-slate-500">
                          {event.meta.department}
                        </Badge>
                      )}
                      <span className="shrink-0 rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        {tasks.length}
                      </span>
                    </button>
                    {/* 새 업무 생성 — 업무 관리의 TaskEditDialog(생성 모드) 재사용 */}
                    <button
                      type="button"
                      onClick={() => setCreateWorkId(event.id)}
                      className="mr-2 shrink-0 rounded-md p-1 text-emerald-600 transition-colors hover:bg-emerald-100"
                      aria-label={`${event.name}에 새 업무 추가`}
                      title="새 업무 추가"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* 하위 task 목록 */}
                  {isOpen && tasks.length === 0 && (
                    <p className="py-2 pl-10 pr-3 text-xs text-slate-400">
                      업무가 없습니다 — 오른쪽 + 버튼으로 추가하세요.
                    </p>
                  )}
                  {isOpen && (
                    <ul>
                      {tasks.map((task) => (
                        <li key={task.id}>
                          <button
                            type="button"
                            onClick={() => onPick({ type: 'task', id: task.id, label: task.title || '(제목 없음)' })}
                            className="flex w-full items-center gap-2 py-1.5 pl-10 pr-3 text-left transition-colors hover:bg-blue-50/60"
                          >
                            <ListTodo className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span
                              className={cn(
                                'min-w-0 flex-1 truncate text-sm',
                                task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'
                              )}
                            >
                              {task.title || '(제목 없음)'}
                            </span>
                            {task.due_date && (
                              <span className="shrink-0 text-[11px] text-slate-400">
                                ~{format(new Date(task.due_date), 'M/d')}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 새 업무(프로젝트) 생성 — 업무 관리의 WorkCreateDialog 재사용 */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 border-dashed text-emerald-700 border-emerald-300/80 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-400"
        onClick={() => setCreateWorkOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />새 이벤트(프로젝트) 만들기
      </Button>

      {createWorkOpen && (
        <WorkCreateDialog
          open
          onOpenChange={(open) => {
            if (!open) setCreateWorkOpen(false);
          }}
          onSuccess={(result) => {
            setCreateWorkOpen(false);
            // 트리 갱신 + 새 이벤트 자동 펼침 → 바로 '+'로 업무 추가 가능
            queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
            setExpanded((prev) => new Set(prev).add(result.workId));
          }}
        />
      )}

      {/* 새 업무 생성 다이얼로그 — 생성 성공 시 곧바로 링크 토큰 삽입 */}
      {createWorkId && (
        <TaskEditDialog
          workId={createWorkId}
          task={null}
          open
          onOpenChange={(open) => {
            if (!open) setCreateWorkId(null);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['works-jsonb'] });
          }}
          onSaved={(taskId, title) => {
            setCreateWorkId(null);
            onPick({ type: 'task', id: taskId, label: title });
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------
// 구매 신청 패널 — 최근 게시글 리스트
// ----------------------------------------

function PurchasePickerPanel({ onPick }: { onPick: (token: NoticeLinkToken) => void }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['notice-link-purchase', debouncedSearch],
    queryFn: async () => {
      let query = supabase
        .from('purchase_request_pages')
        .select('id, title, created_at')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(20);
      const q = debouncedSearch.trim();
      if (q) query = query.ilike('title', `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 30,
  });

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder="구매 신청 게시글 제목 검색" />
      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100">
        {isLoading ? (
          <LoadingRow />
        ) : pages.length === 0 ? (
          <EmptyRow message="검색 결과가 없습니다." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pages.map((page) => (
              <li key={page.id}>
                <button
                  type="button"
                  onClick={() => onPick({ type: 'purchase', id: page.id, label: page.title || '(제목 없음)' })}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-blue-50/60"
                >
                  <span className="truncate text-sm font-medium text-slate-800">{page.title || '(제목 없음)'}</span>
                  <span className="text-xs text-slate-400">
                    등록 {new Date(page.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------
// 협업보드 패널 — 접근 권한 있는 보드만 표시
// ----------------------------------------

const VISIBILITY_BADGE: Record<string, { label: string; className: string }> = {
  public: { label: '공개', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  read_only: { label: '읽기 전용', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  private: { label: '비공개', className: 'border-slate-200 bg-slate-100 text-slate-500' },
};

function CollabPickerPanel({ onPick }: { onPick: (token: NoticeLinkToken) => void }) {
  const { data: boards = [], isLoading } = useCollabBoards();
  const { isAdmin } = useAuth();
  const { data: resourceId } = useCurrentResourceId();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const q = debouncedSearch.trim().toLowerCase();

  // 보관되지 않았고 현재 사용자가 열람 가능한 보드만 (BoardDetail 접근 규칙과 동일)
  const visibleBoards = useMemo(() => {
    return boards
      .filter((board) => !board.is_archived)
      .filter((board) => {
        const memberResourceIds = (
          (board as unknown as { collab_board_members?: { user_id: string }[] }).collab_board_members || []
        ).map((m) => m.user_id);
        return hasCollabViewAccess(
          { visibility: board.visibility, created_by: board.created_by, memberResourceIds },
          resourceId,
          isAdmin
        );
      })
      .filter((board) => !q || (board.title || '').toLowerCase().includes(q));
  }, [boards, resourceId, isAdmin, q]);

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder="협업보드 제목 검색" />
      <p className="text-xs text-slate-400">
        접근 권한이 있는 보드만 표시됩니다. 비공개 보드 링크는 멤버만 열 수 있습니다.
      </p>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100">
        {isLoading ? (
          <LoadingRow />
        ) : visibleBoards.length === 0 ? (
          <EmptyRow message="접근 가능한 협업보드가 없습니다." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleBoards.map((board) => {
              const badge = VISIBILITY_BADGE[board.visibility] ?? VISIBILITY_BADGE.private;
              return (
                <li key={board.id}>
                  <button
                    type="button"
                    onClick={() => onPick({ type: 'collab', id: board.id, label: board.title || '(제목 없음)' })}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50/60"
                  >
                    <StickyNote className="h-3.5 w-3.5 shrink-0 text-yellow-600" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                      {board.title || '(제목 없음)'}
                    </span>
                    <Badge variant="outline" className={cn('shrink-0 text-[10px]', badge.className)}>
                      {badge.label}
                    </Badge>
                    <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-slate-400">
                      <Users className="h-3 w-3" />
                      {board.member_count ?? 0}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------
// 문서 생성 패널 — 내가 만든 생성 방식 리스트
// (공지를 받는 교사들이 이 방식으로 각자 문서를 만든다 — spec_fill 공유 실행)
// ----------------------------------------

function DocGenPickerPanel({ onPick }: { onPick: (token: NoticeLinkToken) => void }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const q = debouncedSearch.trim().toLowerCase();

  const { data: works = [], isLoading } = useQuery({
    queryKey: ['notice-link-docgen'],
    queryFn: async () => {
      const { listMyDocGenActions, isDocGenPublic } = await import(
        '@/features/document-generation/services/docGenService'
      );
      return (await listMyDocGenActions()).map((w) => ({
        id: w.id,
        title: w.title,
        description: w.description,
        isPublic: isDocGenPublic(w),
      }));
    },
    staleTime: 1000 * 30,
  });

  const visibleWorks = works.filter((w) => !q || (w.title || '').toLowerCase().includes(q));

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder="문서 생성 방식 이름 검색" />
      <p className="text-xs text-slate-400">
        문서 생성 메뉴에서 내가 만든 생성 방식만 표시됩니다. 링크를 누른 교사는 이
        방식으로 각자 자기 문서를 만듭니다.
      </p>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100">
        {isLoading ? (
          <LoadingRow />
        ) : visibleWorks.length === 0 ? (
          <EmptyRow message="문서 생성 메뉴에서 먼저 생성 방식을 만들어 주세요." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleWorks.map((work) => (
              <li key={work.id}>
                {/* 비공개는 삽입 차단 — 받는 사람이 못 여는 죽은 링크가 된다(RLS가 행 자체를 숨김) */}
                <button
                  type="button"
                  disabled={!work.isPublic}
                  title={work.isPublic ? undefined : '비공개 생성 방식 — 문서 생성 페이지에서 공개로 전환하면 링크할 수 있습니다.'}
                  onClick={() => onPick({ type: 'docgen', id: work.id, label: work.title || '(제목 없음)' })}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                    work.isPublic ? 'hover:bg-blue-50/60' : 'cursor-not-allowed opacity-60'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <FileOutput className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                    <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                      {work.title || '(제목 없음)'}
                    </span>
                    {!work.isPublic && (
                      <Badge variant="outline" className="shrink-0 border-slate-200 bg-slate-100 text-[10px] text-slate-500">
                        비공개
                      </Badge>
                    )}
                  </span>
                  {work.description && (
                    <span className="truncate pl-5 text-xs text-slate-400">{work.description}</span>
                  )}
                  {!work.isPublic && (
                    <span className="pl-5 text-[11px] text-amber-600">
                      문서 생성 페이지에서 공개로 전환해야 링크할 수 있습니다
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------
// 창의적 체험활동 패널 — 열람 가능한 활동 리스트
// (RLS가 이미 걸러 주므로 여기 보이는 것은 링크해도 안전하다)
// ----------------------------------------

function ActivityPickerPanel({ onPick }: { onPick: (token: NoticeLinkToken) => void }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const q = debouncedSearch.trim().toLowerCase();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['notice-link-activity'],
    queryFn: async () => {
      const { fetchActivities } = await import(
        '@/features/creative-activities/services/activityService'
      );
      return fetchActivities({});
    },
    staleTime: 1000 * 30,
  });

  const visible = activities.filter((a) => !q || a.name.toLowerCase().includes(q));

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder="활동 이름 검색" />
      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100">
        {isLoading ? (
          <LoadingRow />
        ) : visible.length === 0 ? (
          <EmptyRow message="창의적 체험활동 메뉴에서 먼저 활동을 기록해 주세요." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onPick({ type: 'activity', id: a.id, label: a.name })}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-blue-50/60"
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-fuchsia-600" />
                    <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                      {a.name}
                    </span>
                  </span>
                  <span className="truncate pl-5 text-xs text-slate-400">
                    {a.academic_year}학년도
                    {a.primaryHost ? ` · ${a.primaryHost.name}` : ''}
                    {a.career_fields.length > 0 ? ` · ${a.career_fields.join(', ')}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------
// 픽커 다이얼로그 셸
// ----------------------------------------

interface NoticeLinkPickerProps {
  /** null이면 닫힘 */
  type: NoticeLinkType | null;
  onClose: () => void;
  onSelect: (token: NoticeLinkToken) => void;
}

export function NoticeLinkPicker({ type, onClose, onSelect }: NoticeLinkPickerProps) {
  if (!type) return null;

  const Icon = TYPE_ICON[type];
  const typeLabel = NOTICE_LINK_TYPE_LABEL[type];

  const handlePick = (token: NoticeLinkToken) => {
    onSelect(token);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4 text-blue-600" />
            {typeLabel} 링크 삽입
          </DialogTitle>
          <DialogDescription>선택한 항목이 본문에 링크로 삽입됩니다.</DialogDescription>
        </DialogHeader>

        {type === 'schedule' && <SchedulePickerPanel onPick={handlePick} />}
        {type === 'task' && <TaskPickerPanel onPick={handlePick} />}
        {type === 'purchase' && <PurchasePickerPanel onPick={handlePick} />}
        {type === 'collab' && <CollabPickerPanel onPick={handlePick} />}
        {type === 'docgen' && <DocGenPickerPanel onPick={handlePick} />}
        {type === 'activity' && <ActivityPickerPanel onPick={handlePick} />}
      </DialogContent>
    </Dialog>
  );
}
