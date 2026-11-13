// src/components/tasks/WorkTimelineTab.tsx
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ImprovedCard } from "@/components/ui/improved-card";
import { AlertCircle, RefreshCw, CalendarRange } from "lucide-react";
import { useWorksJsonb } from "@/hooks/useTasksJsonb";
import { WorkGanttChart, type TimelineWork } from "./WorkGanttChart";
import {
  WorkTimelineFilters,
  getCurrentAcademicYear,
  getAcademicYearRange,
  type ViewMode,
} from "./WorkTimelineFilters";
import { WorkDetailDialog } from "./WorkDetailDialog";
import { TaskDetailDialog } from "./TaskDetailDialog";
import type { Work as Work, Task } from "@/types/tasks";
import { getTaskDeadlines } from "@/lib/taskDeadlines";
import {
  buildTimelineTaskRows,
  getRoundProgress,
  getTaskProgress,
  parseTimelineDate,
  sumProgress,
} from "@/lib/workTimeline";
import { readStoredJson, writeStoredJson } from "@/lib/safeLocalStorage";

/** 펼친 업무 — 내 업무(`task-mywork-expanded-works-v1`)와 같은 패턴 */
const EXPANDED_KEY = "task-timeline-expanded-works-v1";
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
import {
  useAcademicTerm,
  getTermPeriod,
  formatTermPeriodLabel,
} from "@/hooks/useAcademicTerm";

interface WorkTimelineTabProps {
  department?: string | null;
  /** 업무 상세의 [수정] — 종전엔 타임라인에서 연 업무 상세에만 [수정]이 없었다(2026-10-06) */
  onEditWork?: (work: Work) => void;
}

export function WorkTimelineTab({ department = null, onEditWork }: WorkTimelineTabProps) {
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear);
  const [viewMode, setViewMode] = useState<ViewMode>("Month");
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(readStoredJson<string[]>(EXPANDED_KEY, [], isStringArray))
  );
  const toggleExpand = useCallback((workId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(workId)) next.delete(workId);
      else next.add(workId);
      writeStoredJson(EXPANDED_KEY, [...next]);
      return next;
    });
  }, []);
  // 학사력 학기 기간 스코프: 켜면 학년도 전체 대신 설정된 학기 기간만 표시
  const [termScopeActive, setTermScopeActive] = useState(false);
  const yearTouched = useRef(false);

  const { data: works, isLoading, isError, refetch } = useWorksJsonb();
  const { data: academicTermSetting } = useAcademicTerm();
  const termPeriod = useMemo(() => getTermPeriod(academicTermSetting), [academicTermSetting]);

  // 기본 학년도는 달력 추정(3월 경계)이 아니라 관리자가 지정한 학사력을 따른다.
  // (2월에 학사력을 새 학년도로 전환한 경우 달력 추정과 어긋난다.)
  useEffect(() => {
    if (!yearTouched.current && academicTermSetting?.year) {
      setAcademicYear(academicTermSetting.year);
    }
  }, [academicTermSetting?.year]);

  const handleYearChange = (year: number) => {
    yearTouched.current = true;
    setAcademicYear(year);
  };

  const handleTermScopeToggle = (active: boolean) => {
    setTermScopeActive(active);
    // 스코프를 켜면 보는 학년도도 학사력 학년도로 정렬한다(경계 계산 일관성).
    if (active && academicTermSetting) {
      yearTouched.current = true;
      setAcademicYear(academicTermSetting.year);
    }
  };

  const termScope = termScopeActive && !!termPeriod;

  const { start: academicStart, end: academicEnd } = useMemo(() => {
    if (termScope && termPeriod) return { start: termPeriod.start, end: termPeriod.end };
    return getAcademicYearRange(academicYear);
  }, [academicYear, termScope, termPeriod]);

  // 2학기 경계: 학사력 기간이 그 학년도 2학기를 가리키면 실제 개학일, 아니면 9/1 관례
  const sem2Start = useMemo(() => {
    if (
      academicTermSetting?.semester === 2 &&
      academicTermSetting.year === academicYear &&
      termPeriod
    ) {
      return termPeriod.start;
    }
    return new Date(academicYear, 8, 1);
  }, [academicTermSetting, academicYear, termPeriod]);

  // 현재 학기 판정 — 간트 음영은 "현재 학기가 아닌 구간"에 깔린다(현재 학기 = 밝게).
  // 학사력이 정본이고, 미설정이면 오늘 날짜로 추정한다(보는 학년도 안일 때만).
  const currentSemester = useMemo<1 | 2 | null>(() => {
    if (academicTermSetting) {
      if (academicTermSetting.year !== academicYear) return null;
      return academicTermSetting.semester === 2 ? 2 : 1;
    }
    const today = new Date();
    const { start, end } = getAcademicYearRange(academicYear);
    if (today < start || today > end) return null;
    return today.getTime() >= sem2Start.getTime() ? 2 : 1;
  }, [academicTermSetting, academicYear, sem2Start]);

  const scopedWorks = useMemo(
    () =>
      (works ?? []).filter(
        (work) => !department || work.meta?.department === department
      ),
    [department, works]
  );

  const { timelineWorks, noDateWorks } = useMemo(() => {
    if (!works) return { timelineWorks: [] as TimelineWork[], noDateWorks: [] as Work[] };

    const timelineWorks: TimelineWork[] = [];
    const noDateWorks: Work[] = [];

    for (const work of scopedWorks) {
      const tasks = work.tasks ?? [];
      // 다중 마감(반복 할 일)은 회차마다 타임라인에 배치 — one_time 날짜 그룹·procedural 범위 모두 반영
      const datedTasks = tasks.flatMap((task) =>
        getTaskDeadlines(task).flatMap((deadline) => {
          const dueDate = parseTimelineDate(deadline);
          return dueDate ? [{ task, dueDate, deadline }] : [];
        })
      );

      if (datedTasks.length === 0) {
        noDateWorks.push(work);
        continue;
      }

      const inRangeTasks = datedTasks.filter(
        ({ dueDate }) => dueDate >= academicStart && dueDate <= academicEnd
      );
      if (inRangeTasks.length === 0) continue;

      const proceduralTasks = tasks.filter((task) => task.type === "procedural");
      const datedProceduralTasks = inRangeTasks.filter(
        ({ task }) => task.type === "procedural"
      );
      const proceduralProgress = sumProgress(proceduralTasks.map(getTaskProgress));

      const oneTimeGroups = Array.from(
        inRangeTasks
          .filter(({ task }) => task.type === "one_time")
          .reduce((groups, { task, dueDate, deadline }) => {
            const key = dueDate.getTime();
            const group = groups.get(key) ?? { date: dueDate, deadline, tasks: [] as Task[] };
            group.tasks.push(task);
            groups.set(key, group);
            return groups;
          }, new Map<number, { date: Date; deadline: string; tasks: Task[] }>())
          .values()
      ).map(({ date, deadline, tasks: groupedTasks }) => {
        // 회차 기준 — 다중 마감은 끝낸 회차가 0% 로 남지 않게 그 회차만 센다
        const groupProgress = sumProgress(groupedTasks.map((t) => getRoundProgress(t, deadline)));
        const status: TimelineWork["status"] = groupedTasks.every(
          (task) => task.status === "cancelled"
        )
          ? "cancelled"
          : groupProgress.percentage === 100
            ? "completed"
            : "active";

        return {
          date,
          progress: groupProgress.percentage,
          status,
          totalTasks: groupedTasks.length,
          completedTasks: groupProgress.completedTasks,
          tasks: groupedTasks.map((task) => ({
            id: task.id,
            title: task.title,
            progress: getRoundProgress(task, deadline).percentage,
            status:
              task.status === "pending"
                ? "active" as const
                : task.status,
          })),
        };
      });

      oneTimeGroups.sort((a, b) => a.date.getTime() - b.date.getTime());

      const proceduralRange =
        datedProceduralTasks.length > 0
          ? {
              start: new Date(
                Math.min(...datedProceduralTasks.map(({ dueDate }) => dueDate.getTime()))
              ),
              end: new Date(
                Math.max(...datedProceduralTasks.map(({ dueDate }) => dueDate.getTime()))
              ),
              progress: proceduralProgress.percentage,
              totalTasks: proceduralTasks.length,
              completedTasks: proceduralProgress.completedTasks,
            }
          : null;

      timelineWorks.push({
        id: work.id,
        name: work.name,
        proceduralRange,
        oneTimeGroups,
        progress: work.progress_percentage ?? 0,
        status: work.status,
        totalTasks: work.total_tasks ?? tasks.length,
        completedTasks: work.completed_tasks ?? 0,
        undatedTasks: tasks.filter((t) => !t.due_date).length,
        taskRows: buildTimelineTaskRows(tasks, work.created_at),
      });
    }

    timelineWorks.sort((a, b) => {
      const firstDate = (work: TimelineWork) =>
        Math.min(
          work.proceduralRange?.start.getTime() ?? Number.POSITIVE_INFINITY,
          work.oneTimeGroups[0]?.date.getTime() ?? Number.POSITIVE_INFINITY
        );

      return firstDate(a) - firstDate(b);
    });

    return { timelineWorks, noDateWorks };
  }, [academicEnd, academicStart, works, scopedWorks]);

  const handleTaskClick = (taskId: string) => {
    for (const work of scopedWorks) {
      const task = (work.tasks ?? []).find((t) => t.id === taskId);
      if (task) {
        setSelectedTask(task as Task);
        return;
      }
    }
  };

  const handleWorkClick = (workId: string) => {
    const work = scopedWorks.find((e) => e.id === workId) ?? null;
    setSelectedWork(work as Work | null);
  };

  if (isLoading) {
    return (
      <ImprovedCard className="p-4 sm:p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-8 w-32" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-48 shrink-0" />
                <Skeleton className="h-5 flex-1 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </ImprovedCard>
    );
  }

  if (isError) {
    return (
      <ImprovedCard className="p-12">
        <div className="flex flex-col items-center justify-center gap-3 text-slate-500">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm">데이터를 불러오는 중 오류가 발생했습니다</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            다시 시도
          </Button>
        </div>
      </ImprovedCard>
    );
  }

  if (scopedWorks.length === 0) {
    return (
      <ImprovedCard className="p-12">
        <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
          <CalendarRange className="h-8 w-8" />
          <p className="text-sm">
            {department ? `${department}에 등록된 업무가 없습니다` : '등록된 업무가 없습니다'}
          </p>
        </div>
      </ImprovedCard>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <ImprovedCard className="overflow-hidden shadow-sm border border-white/20 bg-white/70 backdrop-blur-md">
        <div className="pb-3 pt-3 px-3 sm:px-4 md:px-6">
          <WorkTimelineFilters
            academicYear={academicYear}
            viewMode={viewMode}
            onYearChange={handleYearChange}
            onViewModeChange={setViewMode}
            workCount={timelineWorks.length}
            noDateCount={noDateWorks.length}
            termScope={
              academicTermSetting && termPeriod
                ? {
                    active: termScopeActive,
                    label: `${academicTermSetting.year}-${academicTermSetting.semester}학기 (${formatTermPeriodLabel(academicTermSetting)})`,
                    onToggle: handleTermScopeToggle,
                  }
                : null
            }
          />
        </div>

        {timelineWorks.length > 0 ? (
          <div className="border-t border-slate-200">
            <WorkGanttChart
              works={timelineWorks}
              rangeStart={academicStart}
              rangeEnd={academicEnd}
              viewMode={viewMode}
              sem2Start={sem2Start}
              currentSemester={currentSemester}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              onWorkClick={handleWorkClick}
              onTaskClick={handleTaskClick}
            />
          </div>
        ) : (
          <div className="m-3 mt-0 flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400 sm:m-4 sm:mt-0">
            {termScope
              ? "해당 학기 기간에 날짜가 설정된 업무가 없습니다"
              : "해당 학사연도에 날짜가 설정된 업무가 없습니다"}
          </div>
        )}
      </ImprovedCard>

      <WorkDetailDialog
        work={selectedWork}
        open={!!selectedWork}
        onOpenChange={(open) => !open && setSelectedWork(null)}
        onEdit={onEditWork ? (work) => { setSelectedWork(null); onEditWork(work); } : undefined}
      />
      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
      />
    </div>
  );
}
