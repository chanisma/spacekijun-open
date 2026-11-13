// src/components/tasks/WorkGanttChart.tsx
// 커스텀 타임라인 차트 (frappe-gantt 대체)
// 학사연도(3월~익년 2월) 고정 도메인 위에 업무 막대를 % 좌표로 배치한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { ChevronRight, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useWheelScrollX } from "@/hooks/useWheelScrollX";
import type { TimelineTaskRow } from "@/lib/workTimeline";
import type { ViewMode } from "./WorkTimelineFilters";

export interface TimelineWork {
  id: string;
  name: string;
  proceduralRange: {
    start: Date;
    end: Date;
    progress: number;
    totalTasks: number;
    completedTasks: number;
  } | null;
  oneTimeGroups: Array<{
    date: Date;
    progress: number;
    status: "active" | "completed" | "cancelled";
    totalTasks: number;
    completedTasks: number;
    tasks: Array<{
      id: string;
      title: string;
      progress: number;
      status: "active" | "completed" | "cancelled";
    }>;
  }>;
  progress: number;
  /** 업무 상태 — 'pending'(대기)도 온다. 빠져 있으면 아래 STATUS_META 조회가 undefined 가 되어 탭이 죽는다 */
  status: "pending" | "active" | "completed" | "cancelled";
  totalTasks: number;
  completedTasks: number;
  undatedTasks: number;
  /** 펼쳤을 때 한 줄씩 그릴 할 일들 — 판정은 `lib/workTimeline.ts` */
  taskRows: TimelineTaskRow[];
}

interface WorkGanttChartProps {
  works: TimelineWork[];
  rangeStart: Date;
  rangeEnd: Date;
  viewMode: ViewMode;
  /**
   * 2학기 시작일. 학사력에 학기 기간이 설정돼 있으면 그 값을, 없으면 9/1 관례를
   * 부모가 넘긴다. 범위 밖이면(=범위 전체가 한 학기) 경계선·음영 없이 라벨만 남는다.
   */
  sem2Start?: Date;
  /**
   * 표시 중인 범위에서 "현재 학기"가 어느 쪽인지. 음영은 현재 학기가 아닌 구간에
   * 깔린다(현재 학기 = 밝게). null이면 현재 학기가 화면에 없다는 뜻이라 음영 없음.
   */
  currentSemester?: 1 | 2 | null;
  /** 펼쳐진 업무 id — 상태는 부모가 갖는다(localStorage 보존) */
  expandedIds: ReadonlySet<string>;
  onToggleExpand: (workId: string) => void;
  onWorkClick: (workId: string) => void;
  onTaskClick: (taskId: string) => void;
}

/** 좌측 업무명 컬럼 고정 폭(px) — 오버레이 좌표 계산에 사용하므로 상수로 유지 */
const NAME_COL_W = 200;
/** 뷰 모드별 1일당 px (0 = 컨테이너 폭에 맞춤, 스크롤 없음) */
const DAY_WIDTH: Record<ViewMode, number> = { Day: 40, Week: 20, Month: 5, Year: 0 };
const TOOLTIP_W = 248;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
/** 추정 구간(시작일을 앞 단계 마감에서 유도) — 명시 구간과 달라 보여야 한다 */
const DERIVED_SPAN_BG = "repeating-linear-gradient(135deg, rgba(148,163,184,0.28) 0 4px, transparent 4px 8px)";

type TimelineTooltip =
  | {
      kind: "procedural";
      work: TimelineWork;
      range: NonNullable<TimelineWork["proceduralRange"]>;
    }
  | {
      kind: "one_time";
      work: TimelineWork;
      group: TimelineWork["oneTimeGroups"][number];
    }
  | { kind: "task"; work: TimelineWork; row: TimelineTaskRow };

// 업무 상태별 색 — **네 상태를 모두** 담아야 한다(2026-10-05). 'pending'(대기)이 빠져 있어
// 내 업무 관리에서 업무 하나를 [대기]로 바꾸면 색표 조회가 undefined 를 돌려줘(.dot 읽기에서 TypeError)
// 타임라인 탭 전체가 오류 화면이 됐다(운영에 대기 업무가 0건이라 드러나지 않았을 뿐).
// 옛 대기(pending)는 진행 중과 같은 색이다(대기 은퇴, 2026-10-05).
const STATUS_META = {
  // 옛 대기 업무 — 대기는 2026-10-05 에 은퇴해 진행 중과 똑같이 그린다(키는 남겨야 조회가 안 죽는다)
  pending: {
    label: "진행 중",
    track: "bg-blue-100",
    fill: "bg-blue-500",
    color: "#3b82f6",
    dot: "bg-blue-500",
    hover: "hover:ring-2 hover:ring-blue-300",
  },
  active: {
    label: "진행 중",
    track: "bg-blue-100",
    fill: "bg-blue-500",
    color: "#3b82f6",
    dot: "bg-blue-500",
    hover: "hover:ring-2 hover:ring-blue-300",
  },
  completed: {
    label: "완료",
    track: "bg-green-100",
    fill: "bg-green-500",
    color: "#22c55e",
    dot: "bg-green-500",
    hover: "hover:ring-2 hover:ring-green-300",
  },
  cancelled: {
    label: "취소",
    track: "bg-slate-200",
    fill: "bg-slate-400",
    color: "#94a3b8",
    dot: "bg-slate-400",
    hover: "hover:ring-2 hover:ring-slate-300",
  },
} as const;

/** 업무 상태 → 색. 모르는 값이 와도 탭 전체가 죽지 않게 진행중으로 그린다 */
const workStatusMeta = (status: string) =>
  STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.active;

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export function WorkGanttChart({
  works,
  rangeStart,
  rangeEnd,
  viewMode,
  sem2Start,
  currentSemester = null,
  expandedIds,
  onToggleExpand,
  onWorkClick,
  onTaskClick,
}: WorkGanttChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const [tip, setTip] = useState<TimelineTooltip | null>(null);
  const { isDragging, dragScrollProps } = useDragScroll<HTMLDivElement>({
    onDragStart: () => setTip(null),
  });
  // 목록 열 = 위아래, **그래프가 표시되는 영역 전체**(막대 위가 아니라 빈칸·머리글 포함) = 좌우
  // (2026-09-21 사용자 결정)
  useWheelScrollX(scrollRef, { enabled: works.length > 0, ignoreLeft: NAME_COL_W });

  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const dayIdx = (d: Date) => differenceInCalendarDays(d, rangeStart);
  const pct = (d: Date) => (dayIdx(d) / totalDays) * 100;

  // 월 경계 (라벨 + 그리드라인)
  const months = useMemo(() => {
    const arr: { label: string; startPct: number; widthPct: number }[] = [];
    let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cur <= rangeEnd) {
      const mStart = cur < rangeStart ? rangeStart : cur;
      const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      const clamped = mEnd > rangeEnd ? rangeEnd : mEnd;
      const days = dayIdx(clamped) - dayIdx(mStart) + 1;
      arr.push({
        label: `${cur.getMonth() + 1}월`,
        startPct: (dayIdx(mStart) / totalDays) * 100,
        widthPct: (days / totalDays) * 100,
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, totalDays]);

  // 주 시작일(월요일) — 주/월 모드 그리드, 주 모드 라벨
  const weeks = useMemo(() => {
    const arr: { label: string; leftPct: number }[] = [];
    let d = new Date(rangeStart);
    while (d.getDay() !== 1) d = addDays(d, 1);
    for (; d <= rangeEnd; d = addDays(d, 7)) {
      arr.push({ label: format(d, "M.d"), leftPct: (dayIdx(d) / totalDays) * 100 });
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, totalDays]);

  // 일 단위 — 일 모드 전용(365칸을 다른 모드에서까지 만들 이유가 없다)
  const days = useMemo(() => {
    if (viewMode !== "Day") return [];
    return Array.from({ length: totalDays }, (_, i) => {
      const d = addDays(rangeStart, i);
      return { i, date: d.getDate(), dow: d.getDay() };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, rangeStart, totalDays]);

  // 2학기 시작 — 학기 음영/라벨 경계. 학사력 기간이 있으면 부모가 실제 날짜를 넘기고,
  // 없으면 9/1 관례로 폴백한다. 범위 밖이면 전체가 한 학기이므로 경계를 그리지 않는다.
  const sem2Pct = useMemo(
    () => (dayIdx(sem2Start ?? new Date(rangeStart.getFullYear(), 8, 1)) / totalDays) * 100,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sem2Start, rangeStart, totalDays]
  );
  const showSem2Boundary = sem2Pct > 0 && sem2Pct < 100;
  // 경계가 왼쪽 밖(<=0)이면 범위 전체가 2학기다.
  const leadingSem = sem2Pct <= 0 ? 2 : 1;
  // 음영 = 현재 학기가 아닌 구간. 현재 학기가 화면에 없으면(과거·미래 학년도) 음영 없음.
  const dimStyle = !showSem2Boundary
    ? null
    : currentSemester === 1
      ? { left: `${sem2Pct}%`, right: 0 }
      : currentSemester === 2
        ? { left: 0, width: `${sem2Pct}%` }
        : null;

  const today = new Date();
  const todayFrac =
    today >= rangeStart && today <= rangeEnd ? (dayIdx(today) + 0.5) / totalDays : null;

  const showWeekLines = viewMode !== "Year";
  const showWeekLabels = viewMode === "Week";
  const showDayLabels = viewMode === "Day";
  const dayWidthPct = 100 / totalDays;

  // 펼친 행은 표시 범위로 자른다 — 업무는 범위 안이어도 개별 할 일은 밖일 수 있다
  const inRange = (d: Date) => d >= rangeStart && d <= rangeEnd;
  const clampSpan = (span: NonNullable<TimelineTaskRow["span"]>) => {
    if (span.end < rangeStart || span.start > rangeEnd) return null;
    return {
      start: span.start < rangeStart ? rangeStart : span.start,
      end: span.end > rangeEnd ? rangeEnd : span.end,
    };
  };
  const chartWidth = DAY_WIDTH[viewMode] > 0 ? NAME_COL_W + totalDays * DAY_WIDTH[viewMode] : undefined;

  // 오늘 위치로 자동 스크롤 (화면 1/3 지점)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || todayFrac == null) return;
    if (el.scrollWidth <= el.clientWidth + 4) return;
    const timelineW = el.scrollWidth - NAME_COL_W;
    el.scrollLeft = Math.max(0, NAME_COL_W + todayFrac * timelineW - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, totalDays, works.length]);

  // 툴팁은 setState 없이 ref로 좌표만 갱신 → 마우스 이동 중 리렌더 0회
  // 좌표는 뷰포트 기준(clientX/Y)이므로 툴팁은 body로 portal해 조상의 transform/backdrop-filter
  // (ImprovedCard의 :hover transform·backdrop-blur)가 fixed 컨테이닝 블록이 되는 것을 피한다.
  const positionTip = (x: number, y: number) => {
    const el = tipRef.current;
    if (!el) return;
    const h = el.offsetHeight || 160;
    const left = x + 14 + TOOLTIP_W > window.innerWidth - 8 ? x - TOOLTIP_W - 14 : x + 14;
    const top = y + 16 + h > window.innerHeight - 8 ? y - h - 16 : y + 16;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;
  };

  const handleBarMove = (e: React.MouseEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    positionTip(e.clientX, e.clientY);
  };

  useEffect(() => {
    if (tip) positionTip(lastPointer.current.x, lastPointer.current.y);
  }, [tip]);

  if (works.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className={cn(
        // 펼치면 표가 길어진다 — 자체 세로 스크롤을 주고 머리글을 고정해, 아래 행을 볼 때도
        // 막대가 몇 월의 것인지 잃지 않게 한다. 목록 열 위에서 휠을 굴리면 이 세로 스크롤이 움직인다.
        "max-h-[72vh] overflow-auto overscroll-x-contain bg-white cursor-grab",
        isDragging && "cursor-grabbing select-none"
      )}
      {...dragScrollProps}
      title="그래프 영역에서는 휠·드래그로 좌우로, 업무 목록에서는 휠로 위아래로 움직입니다"
    >
      <div className="relative min-w-full" style={chartWidth ? { width: chartWidth } : undefined}>
        {/* 그리드 오버레이 (행 뒤) */}
        <div className="absolute inset-y-0 right-0 z-0" style={{ left: NAME_COL_W }}>
          {dimStyle && (
            <div className="absolute inset-y-0 bg-slate-100/70" style={dimStyle} />
          )}
          {days
            .filter((d) => d.dow === 0 || d.dow === 6)
            .map((d) => (
              <div
                key={d.i}
                className="absolute inset-y-0 bg-slate-50"
                style={{ left: `${d.i * dayWidthPct}%`, width: `${dayWidthPct}%` }}
              />
            ))}
          {showWeekLines &&
            weeks.map((w) => (
              <div key={w.label} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${w.leftPct}%` }} />
            ))}
          {months.map((m, i) => (
            <div key={i} className="absolute inset-y-0 w-px bg-slate-200" style={{ left: `${m.startPct}%` }} />
          ))}
          {showSem2Boundary && (
            <div className="absolute inset-y-0 w-px bg-slate-300" style={{ left: `${sem2Pct}%` }} />
          )}
        </div>

        {/* 헤더 — 세로 스크롤에도 위에 붙어 있다. 왼쪽 위 모서리 칸은 두 방향 모두 고정 */}
        <div className="sticky top-0 z-30 flex border-b border-slate-200 bg-white">
          <div
            className="sticky left-0 z-40 flex shrink-0 items-end border-r border-slate-200 bg-white px-3 pb-1.5"
            style={{ width: NAME_COL_W }}
          >
            <span className="text-[11px] font-semibold text-slate-400">업무</span>
          </div>
          <div className="relative flex-1">
            {todayFrac != null && (
              <div
                className="pointer-events-none absolute top-0.5 z-10 -translate-x-1/2 rounded-full bg-rose-500 px-1.5 py-px text-[10px] font-bold text-white shadow-sm"
                style={{ left: `${todayFrac * 100}%` }}
              >
                오늘
              </div>
            )}
            {/* 학기 — 현재 학기 라벨은 파란색으로 강조 */}
            <div className="relative h-5">
              <span
                className={cn(
                  "absolute top-1 pl-2 text-[10px] font-semibold",
                  currentSemester === leadingSem ? "text-blue-500" : "text-slate-400"
                )}
                style={{ left: 0 }}
              >
                {leadingSem}학기
              </span>
              {showSem2Boundary && (
                <span
                  className={cn(
                    "absolute top-1 pl-2 text-[10px] font-semibold",
                    currentSemester === 2 ? "text-blue-500" : "text-slate-400"
                  )}
                  style={{ left: `${sem2Pct}%` }}
                >
                  2학기
                </span>
              )}
            </div>
            {/* 월 */}
            <div className="relative h-7">
              {months.map((m, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0 flex items-center justify-center overflow-hidden text-[11px] text-slate-500"
                  style={{ left: `${m.startPct}%`, width: `${m.widthPct}%` }}
                >
                  {m.label}
                </div>
              ))}
            </div>
            {/* 일 (일 모드 전용) — 날짜 + 요일 */}
            {showDayLabels && (
              <div className="relative h-8 border-t border-slate-100">
                {days.map((d) => (
                  <div
                    key={d.i}
                    className={cn(
                      "absolute inset-y-0 flex flex-col items-center justify-center text-[10px] leading-tight tabular-nums",
                      d.dow === 0 ? "text-rose-400" : d.dow === 6 ? "text-blue-400" : "text-slate-400"
                    )}
                    style={{ left: `${d.i * dayWidthPct}%`, width: `${dayWidthPct}%` }}
                  >
                    <span className="font-medium text-slate-600">{d.date}</span>
                    <span>{WEEKDAY_LABELS[d.dow]}</span>
                  </div>
                ))}
              </div>
            )}
            {/* 주 (주 모드 전용) */}
            {showWeekLabels && (
              <div className="relative h-5 border-t border-slate-100">
                {weeks.map((w) => (
                  <span
                    key={w.label}
                    className="absolute top-0.5 pl-1 text-[10px] tabular-nums text-slate-400"
                    style={{ left: `${w.leftPct}%` }}
                  >
                    {w.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 업무 행 */}
        {works.map((ev) => {
          const meta = workStatusMeta(ev.status);
          const expanded = expandedIds.has(ev.id);
          const canExpand = ev.taskRows.length > 0;
          return (
            <div key={ev.id} className="border-b border-slate-100 last:border-b-0">
            <div className="group flex">
              {/* 이름 = 펼침 토글. 상세 모달은 오른쪽 아이콘으로 옮겼다 — 예전엔 이름·막대·점이
                  전부 모달을 열어, 할 일을 보려면 매번 모달을 거쳐야 했다. */}
              <div
                className="sticky left-0 z-10 flex shrink-0 items-stretch border-r border-slate-200 bg-white transition-colors group-hover:bg-slate-50"
                style={{ width: NAME_COL_W }}
              >
                <button
                  type="button"
                  onClick={() => canExpand && onToggleExpand(ev.id)}
                  aria-expanded={canExpand ? expanded : undefined}
                  className="flex min-w-0 flex-1 flex-col justify-center py-1.5 pl-1.5 pr-1 text-left"
                  title={ev.name}
                >
                  <div className="flex items-center gap-1">
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform",
                        expanded && "rotate-90",
                        !canExpand && "invisible"
                      )}
                    />
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                    <span className="truncate text-[13px] font-medium text-slate-700">{ev.name}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 pl-[30px] text-[11px] text-slate-400">
                    <span className="tabular-nums">
                      {ev.completedTasks}/{ev.totalTasks} · {Math.round(ev.progress)}%
                    </span>
                    {ev.undatedTasks > 0 && (
                      <span className="rounded-full bg-amber-50 px-1.5 text-[10px] font-medium text-amber-600">
                        미설정 {ev.undatedTasks}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onWorkClick(ev.id)}
                  className="flex w-7 shrink-0 items-center justify-center text-slate-300 transition-colors hover:text-blue-600 focus-visible:text-blue-600 focus-visible:outline-none"
                  aria-label={`${ev.name} 상세 보기`}
                  title="업무 상세 보기"
                >
                  <PanelRightOpen className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="relative h-12 flex-1 transition-colors group-hover:bg-slate-50/50">
                {ev.proceduralRange && (() => {
                  const range = ev.proceduralRange;
                  const leftPct = pct(range.start);
                  const widthPct =
                    ((differenceInCalendarDays(range.end, range.start) + 1) / totalDays) * 100;

                  return (
                    <button
                      onClick={() => onWorkClick(ev.id)}
                      onMouseEnter={(e) => {
                        setTip({ kind: "procedural", work: ev, range });
                        handleBarMove(e);
                      }}
                      onMouseMove={handleBarMove}
                      onMouseLeave={() => setTip(null)}
                      className={cn(
                        "absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-full transition-shadow",
                        meta.track,
                        meta.hover,
                        ev.status === "cancelled" && "opacity-70"
                      )}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 10 }}
                      aria-label={`${ev.name} 절차적 할 일 (${meta.label}, 진행률 ${Math.round(range.progress)}%)`}
                    >
                      <span
                        className={cn("absolute inset-y-0 left-0 rounded-full", meta.fill)}
                        style={{ width: `${clampPct(range.progress)}%` }}
                      />
                    </button>
                  );
                })()}

                {/* 합쳐진 막대 위의 단계별 마감 — 막대만으로는 "언제까지 무엇을"이 안 보인다.
                    일회성과 **같은 도넛**으로 그리되(2026-09-21 사용자 요청) 안의 숫자는 개수가 아니라
                    **단계 번호**다 — 절차형에서 읽어야 하는 것은 "몇 번째 단계가 언제인가"다.
                    같은 날에 여러 단계가 걸리면 한 도넛으로 묶는다(겹치면 아래 것을 누를 수 없다). */}
                {ev.proceduralRange &&
                  Array.from(
                    ev.taskRows
                      .filter((row) => row.type === "procedural")
                      .flatMap((row) => row.markers.filter((m) => inRange(m.date)).map((m) => ({ row, m })))
                      .reduce((groups, entry) => {
                        const key = entry.m.date.getTime();
                        groups.set(key, [...(groups.get(key) ?? []), entry]);
                        return groups;
                      }, new Map<number, Array<{ row: TimelineTaskRow; m: TimelineTaskRow["markers"][number] }>>())
                      .values()
                  ).map((entries) => {
                    const { row, m } = entries[0];
                    const progress = clampPct(
                      entries.reduce((sum, e) => sum + e.m.progress, 0) / entries.length
                    );
                    const allDone = entries.every((e) => e.m.done);
                    const color = allDone ? STATUS_META.completed.color : STATUS_META[row.status].color;
                    const label =
                      entries.length === 1
                        ? String(row.step)
                        : entries.length === 2
                          ? `${entries[0].row.step}·${entries[1].row.step}`
                          : `${row.step}+`;
                    return (
                      <button
                        key={m.date.getTime()}
                        type="button"
                        onClick={() => (entries.length === 1 ? onTaskClick(row.id) : onWorkClick(ev.id))}
                        onMouseEnter={(e) => {
                          setTip(
                            entries.length === 1
                              ? { kind: "task", work: ev, row }
                              : { kind: "procedural", work: ev, range: ev.proceduralRange! }
                          );
                          handleBarMove(e);
                        }}
                        onMouseMove={handleBarMove}
                        onMouseLeave={() => setTip(null)}
                        className={cn(
                          "absolute top-1/2 z-[2] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
                          allDone && "opacity-60"
                        )}
                        style={{
                          left: `${pct(m.date) + dayWidthPct / 2}%`,
                          background: `conic-gradient(${color} ${progress * 3.6}deg, #e2e8f0 0deg)`,
                        }}
                        aria-label={`${format(m.date, "M월 d일")} 절차 ${entries.map((e) => `${e.row.step}단계`).join("·")} 마감${allDone ? " (완료)" : ""}`}
                      >
                        <span className="absolute inset-[3px] rounded-full bg-white" />
                        <span className="relative text-[9px] font-bold tabular-nums text-slate-600">{label}</span>
                      </button>
                    );
                  })}

                {ev.oneTimeGroups.map((group) => {
                  const groupMeta = STATUS_META[group.status];
                  const progress = clampPct(group.progress);

                  return (
                    <button
                      key={group.date.getTime()}
                      onClick={() => onWorkClick(ev.id)}
                      onMouseEnter={(e) => {
                        setTip({ kind: "one_time", work: ev, group });
                        handleBarMove(e);
                      }}
                      onMouseMove={handleBarMove}
                      onMouseLeave={() => setTip(null)}
                      className={cn(
                        "absolute top-1/2 z-[2] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
                        group.status === "cancelled" && "opacity-70"
                      )}
                      style={{
                        left: `${pct(group.date) + dayWidthPct / 2}%`,
                        background: `conic-gradient(${groupMeta.color} ${progress * 3.6}deg, #e2e8f0 0deg)`,
                      }}
                      aria-label={`${format(group.date, "M월 d일")} 일회성 할 일 ${group.totalTasks}개, 진행률 ${Math.round(progress)}%`}
                    >
                      <span className="absolute inset-[3px] rounded-full bg-white" />
                      <span className="relative text-[9px] font-bold tabular-nums text-slate-600">
                        {group.totalTasks > 1 ? group.totalTasks : Math.round(progress)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {expanded &&
              ev.taskRows.map((row) => {
                const rowMeta = STATUS_META[row.status];
                const span = row.span ? clampSpan(row.span) : null;
                const markers = row.markers.filter((m) => inRange(m.date));
                const tipHandlers = {
                  onMouseEnter: (e: React.MouseEvent) => {
                    setTip({ kind: "task", work: ev, row });
                    handleBarMove(e);
                  },
                  onMouseMove: handleBarMove,
                  onMouseLeave: () => setTip(null),
                };
                return (
                  <div key={row.id} className="group/task flex bg-slate-50/40">
                    <button
                      type="button"
                      onClick={() => onTaskClick(row.id)}
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-slate-200 bg-slate-50 py-1 pl-[30px] pr-2 text-left transition-colors group-hover/task:bg-slate-100"
                      style={{ width: NAME_COL_W }}
                      title={row.title}
                    >
                      {row.step != null ? (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 px-1 text-[9px] font-bold tabular-nums text-slate-600">
                          {row.step}
                        </span>
                      ) : (
                        <span className={cn("mx-1 h-1.5 w-1.5 shrink-0 rounded-full", rowMeta.dot)} />
                      )}
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[12px]",
                          row.status === "active" ? "text-slate-600" : "text-slate-400",
                          row.status === "cancelled" && "line-through"
                        )}
                      >
                        {row.title}
                      </span>
                      {row.undated && (
                        <span className="shrink-0 rounded-full bg-amber-50 px-1.5 text-[10px] font-medium text-amber-600">
                          기한 없음
                        </span>
                      )}
                    </button>
                    <div className="relative h-8 flex-1 transition-colors group-hover/task:bg-slate-100/50">
                      {span && (
                        <button
                          type="button"
                          onClick={() => onTaskClick(row.id)}
                          {...tipHandlers}
                          className={cn(
                            "absolute top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full",
                            row.span?.derived ? "border border-dashed border-slate-300" : rowMeta.track,
                            row.status !== "active" && "opacity-60"
                          )}
                          style={{
                            left: `${pct(span.start)}%`,
                            width: `${((differenceInCalendarDays(span.end, span.start) + 1) / totalDays) * 100}%`,
                            background: row.span?.derived ? DERIVED_SPAN_BG : undefined,
                          }}
                          aria-label={`${row.title} ${row.span?.derived ? "추정 " : ""}기간`}
                        >
                          {!row.span?.derived && (
                            <span
                              className={cn("absolute inset-y-0 left-0 rounded-full", rowMeta.fill)}
                              style={{ width: `${clampPct(row.progress)}%` }}
                            />
                          )}
                        </button>
                      )}
                      {/* 마감 마커 — 끝난 회차는 지우지 않고 흐리게(타임라인은 이력도 보여 준다) */}
                      {markers.map((m) => (
                        <button
                          key={m.date.getTime()}
                          type="button"
                          onClick={() => onTaskClick(row.id)}
                          {...tipHandlers}
                          className={cn(
                            "absolute top-1/2 z-[2] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                            m.done && "opacity-45"
                          )}
                          style={{
                            // 하루 칸의 가운데 — 일 모드에서 칸 왼쪽 경계에 걸리지 않게
                            left: `${pct(m.date) + dayWidthPct / 2}%`,
                            borderColor: m.done ? STATUS_META.completed.color : rowMeta.color,
                            background: m.done ? STATUS_META.completed.color : "#fff",
                          }}
                          aria-label={`${row.title} ${format(m.date, "M월 d일")} 마감${m.done ? " (완료)" : ""}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* 오늘 라인 (막대 위, 이름 컬럼 아래) */}
        {todayFrac != null && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-[5]" style={{ left: NAME_COL_W }}>
            <div className="absolute inset-y-0 w-px bg-rose-400" style={{ left: `${todayFrac * 100}%` }} />
          </div>
        )}
      </div>

      {/* 커서 추적 툴팁 — body로 portal (조상 transform/overflow의 영향 차단) */}
      {tip?.kind === "task" && typeof document !== "undefined" && createPortal(
        <div
          ref={tipRef}
          className="pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm"
          style={{ width: TOOLTIP_W, left: -9999, top: -9999 }}
        >
          <div className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[tip.row.status].dot)} />
            <span className="truncate text-[13px] font-semibold text-slate-800">{tip.row.title}</span>
          </div>
          <div className="mt-1 truncate text-[10px] font-semibold text-slate-400">
            {tip.work.name} · {tip.row.step != null ? `절차적 ${tip.row.step}단계` : "일회성"}
          </div>
          <div className="mt-2 space-y-1.5 text-xs text-slate-500">
            {tip.row.span && (
              <div className="flex items-center justify-between">
                <span>{tip.row.span.derived ? "추정 기간" : "기간"}</span>
                <span className="font-medium tabular-nums text-slate-700">
                  {format(tip.row.span.start, "M.d")} ~ {format(tip.row.span.end, "M.d")}
                </span>
              </div>
            )}
            <div className="flex items-start justify-between gap-2">
              <span className="shrink-0">마감</span>
              <span className="text-right font-medium tabular-nums text-slate-700">
                {tip.row.markers.length === 0
                  ? "미설정"
                  : tip.row.markers.map((m) => `${format(m.date, "M.d")}${m.done ? "✓" : ""}`).join(" · ")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>진행률</span>
              <span className="font-medium tabular-nums text-slate-700">{Math.round(tip.row.progress)}%</span>
            </div>
            {tip.row.span?.derived && (
              <div className="pt-0.5 text-[11px] text-slate-400">
                시작일이 없어 앞 단계의 마감일부터 이어 그렸습니다
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
      {tip && tip.kind !== "task" && typeof document !== "undefined" && createPortal(
        <div
          ref={tipRef}
          className="pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm"
          style={{ width: TOOLTIP_W, left: -9999, top: -9999 }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                workStatusMeta(tip.kind === "procedural" ? tip.work.status : tip.group.status).dot
              )}
            />
            <span className="truncate text-[13px] font-semibold text-slate-800">
              {tip.kind === "one_time" && tip.group.totalTasks === 1
                ? tip.group.tasks[0].title
                : tip.work.name}
            </span>
          </div>
          <div className="mt-1 text-[10px] font-semibold text-slate-400">
            {tip.kind === "procedural" ? "절차적 할 일 · 기간" : "일회성 할 일 · 일자"}
          </div>
          <div className="mt-2 space-y-1.5 text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span>{tip.kind === "procedural" ? "기간" : "일자"}</span>
              <span className="font-medium tabular-nums text-slate-700">
                {tip.kind === "procedural"
                  ? `${format(tip.range.start, "M.d")} ~ ${format(tip.range.end, "M.d")}`
                  : format(tip.group.date, "M.d")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>할 일</span>
              <span className="font-medium tabular-nums text-slate-700">
                {tip.kind === "procedural"
                  ? `${tip.range.completedTasks}/${tip.range.totalTasks} 완료`
                  : `${tip.group.completedTasks}/${tip.group.totalTasks} 완료`}
              </span>
            </div>
            {tip.kind === "procedural" && (() => {
              const steps = tip.work.taskRows.filter((row) => row.type === "procedural");
              if (steps.length === 0) return null;
              return (
                <div className="space-y-0.5 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                  {steps.slice(0, 6).map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <span className="tabular-nums text-slate-400">{row.step}.</span> {row.title}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-400">
                        {row.markers.length === 0
                          ? "기한 없음"
                          : row.markers.map((m) => `${format(m.date, "M.d")}${m.done ? "✓" : ""}`).join(" · ")}
                      </span>
                    </div>
                  ))}
                  {steps.length > 6 && <div className="text-slate-400">외 {steps.length - 6}단계</div>}
                </div>
              );
            })()}
            {tip.kind === "one_time" && tip.group.totalTasks > 1 && (
              <div className="space-y-0.5 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                {tip.group.tasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{task.title}</span>
                    <span className="shrink-0 tabular-nums text-slate-400">{task.progress}%</span>
                  </div>
                ))}
                {tip.group.tasks.length > 3 && (
                  <div className="text-slate-400">외 {tip.group.tasks.length - 3}개</div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="shrink-0">진행률</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full",
                    workStatusMeta(tip.kind === "procedural" ? tip.work.status : tip.group.status).fill
                  )}
                  style={{
                    width: `${clampPct(
                      tip.kind === "procedural" ? tip.range.progress : tip.group.progress
                    )}%`,
                  }}
                />
              </div>
              <span className="shrink-0 font-medium tabular-nums text-slate-700">
                {Math.round(
                  tip.kind === "procedural" ? tip.range.progress : tip.group.progress
                )}%
              </span>
            </div>
            {tip.work.undatedTasks > 0 && (
              <div className="pt-0.5 text-[11px] text-amber-600">
                날짜 미설정 할 일 {tip.work.undatedTasks}개
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
